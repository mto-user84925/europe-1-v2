#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Générateur Automatique Quotidien des Bulletins Météo France & Hauts-de-France (Paysage 16:9 & TikTok 9:16)
- Toujours à J+1 (Demain)
- Zones supportées : France entière, Hauts-de-France, ou les deux (both)
- Modes supportés : Grand Public et/ou BTP Pro
- Format double : Paysage 16:9 (1920x1080) ET Portrait 9:16 (1080x1920)
- Voix Charon (Gemini TTS) avec fallback automatique Edge-TTS Henri (100% garanti Zero-Crash)
- Températures 100% vérifiées et conformes aux cartes Météo-France
"""

import os
import sys
import shutil
import argparse
import subprocess
from datetime import datetime
from generate_tiktok_bulletins import (
    find_maps_dir,
    find_music_path,
    collect_cards,
    compile_video,
    check_encoder,
    get_api_key,
    generate_script_from_data,
    log
)

SCRIPT_GRAND_PUBLIC = [
    # CARTE 1 : J1 Matin (18 mots)
    "Bonjour à tous, voici votre météo nationale. Ce matin, réveil calme et agréable sous de belles éclaircies généralisées.",
    
    # CARTE 2 : J1 Après-midi (19 mots)
    "Pour votre après-midi, le soleil s'impose largement sur la quasi-totalité du pays avec une douceur idéale pour vos sorties.",
    
    # CARTE 3 : J2 (18 mots)
    "Le lendemain, maintien de conditions clémentes et très lumineuses sur la plupart de nos régions d'est en ouest.",
    
    # CARTE 4 : J3 (19 mots)
    "Le surlendemain, quelques ondées locales glisseront le long de la façade atlantique sans altérer la grande douceur générale.",
    
    # CARTE 5 : J4 (18 mots)
    "Pour la suite, le soleil reprendra l'avantage dans une atmosphère très agréable et bien conforme aux normales saisonnières.",
    
    # CARTE 6 : J5 (18 mots)
    "Le temps deviendra ensuite plus changeant avec de rares averses passagères et des températures restant très douces.",
    
    # CARTE 7 : J6 (18 mots)
    "En fin d'échéance, un ciel partagé alternera entre nuages et belles éclaircies avec un mercure toujours de saison.",
    
    # CARTE 8 : J7 (18 mots)
    "Dernière journée de prévision avec le retour d'un temps stable, calme et lumineux sur une large majorité du territoire.",
    
    # CARTE 9 : Éphéméride & Synthèse (16 mots)
    "Profitez pleinement de cette météo agréable au fil des jours. À très vite avec Météo-Climat Pro !"
]

SCRIPT_BTP = [
    # CARTE 1 : J1 Matin (18 mots)
    "Voici votre bulletin météo BTP. Ce matin, conditions très calmes idéales pour le démarrage de vos chantiers extérieurs.",
    
    # CARTE 2 : J1 Après-midi (17 mots)
    "Pour l'après-midi, le soleil domine largement, parfait pour le terrassement et l'avancement de vos travaux extérieurs.",
    
    # CARTE 3 : J2 (17 mots)
    "Le lendemain, maintien d'un temps sec et lumineux permettant de sécuriser toutes vos installations en plein air.",
    
    # CARTE 4 : J3 (18 mots)
    "Le surlendemain, quelques ondées par l'ouest : surveillez l'adhérence des engins de chantier et les sols glissants.",
    
    # CARTE 5 : J4 (17 mots)
    "Pour la suite, retour de belles éclaircies stables, très propices à la poursuite sereine de vos plannings.",
    
    # CARTE 6 : J5 (18 mots)
    "Ciel plus chargé par endroits : protégez vos matériaux sensibles à l'humidité contre d'éventuelles averses locales.",
    
    # CARTE 7 : J6 (17 mots)
    "Atmosphère plus fraîche et vent modéré : vérifiez systématiquement l'amarrage de vos échafaudages et la grue.",
    
    # CARTE 8 : J7 (18 mots)
    "Fin d'échéance calme et propice à la finalisation de vos travaux en cours sur l'ensemble des chantiers.",
    
    # CARTE 9 : Synthèse (17 mots)
    "Restez vigilants sur l'évolution du vent. Très bonne semaine à vos équipes avec Météo BTP !"
]

SCRIPT_HDF_GRAND_PUBLIC = [
    # CARTE 1 : J1 Matin (19 mots)
    "Bonjour à tous, bienvenue pour votre météo des Hauts-de-France. Ce matin, réveil calme et lumineux sur l'ensemble de notre région.",
    
    # CARTE 2 : J1 Après-midi (20 mots)
    "Pour votre après-midi, de très belles éclaircies s'imposent de la Côte d'Opale jusqu'à l'Aisne dans une atmosphère très agréable.",
    
    # CARTE 3 : J2 (18 mots)
    "Le lendemain, maintien de conditions clémentes et ensoleillées sur l'ensemble des départements du Nord et de la Picardie.",
    
    # CARTE 4 : J3 (19 mots)
    "Le surlendemain, le ciel se voilera légèrement par le littoral avec quelques nuages sans conséquence sur la douceur ambiante.",
    
    # CARTE 5 : J4 (18 mots)
    "Pour la suite, retour de belles plages ensoleillées entre Flandres, Artois et bassin picard avec des températures de saison.",
    
    # CARTE 6 : J5 (18 mots)
    "Le temps deviendra ensuite plus mitigé avec une alternance de passages nuageux et d'éclaircies passagères sur la région.",
    
    # CARTE 7 : J6 (17 mots)
    "En fin d'échéance, un temps variable persistera avec un thermomètre restant stationnaire et agréable pour la saison.",
    
    # CARTE 8 : J7 (17 mots)
    "Dernière journée de prévision sous un ciel bien dégagé et calme sur la quasi-totalité des Hauts-de-France.",
    
    # CARTE 9 : Éphéméride & Synthèse (16 mots)
    "Profitez pleinement de ces belles journées dans notre région. À très vite avec Météo-Climat Pro !"
]

SCRIPT_HDF_BTP = [
    # CARTE 1 : J1 Matin (18 mots)
    "Voici votre bulletin météo BTP pour les Hauts-de-France. Ce matin, conditions sèches et favorables au démarrage des chantiers.",
    
    # CARTE 2 : J1 Après-midi (19 mots)
    "Pour l'après-midi, temps très calme et lumineux, idéal pour les travaux de gros œuvre et de voirie dans toute la région.",
    
    # CARTE 3 : J2 (18 mots)
    "Le lendemain, maintien d'un temps sec sur le Nord et la Picardie pour poursuivre vos opérations extérieures en toute sérénité.",
    
    # CARTE 4 : J3 (18 mots)
    "Le surlendemain, vent modéré en bord de mer et ciel plus voilé : surveillez la prise au vent sur les échafaudages côtiers.",
    
    # CARTE 5 : J4 (17 mots)
    "Pour la suite, de belles fenêtres d'éclaircies stables permettent de cadencer vos plannings de terrassement.",
    
    # CARTE 6 : J5 (18 mots)
    "Ciel plus incertain avec quelques ondées éparses : protégez vos zones de stockage et matériaux sensibles à l'humidité.",
    
    # CARTE 7 : J6 (18 mots)
    "Conditions plus fraîches avec de rares averses : pensez à vérifier l'adhérence des engins de manutention sur les pistes.",
    
    # CARTE 8 : J7 (17 mots)
    "Fin d'échéance calme et propice à l'avancement normal de tous vos chantiers sur l'ensemble de la région.",
    
    # CARTE 9 : Synthèse (18 mots)
    "Restez vigilants sur les rafales en zone exposée. Excellente semaine à vos équipes avec Météo BTP !"
]

def generate_bulletin_pair(mode, script_phrases, output_dir, maps_dir, music_path, api_key, zone="france"):
    """Génère la version Paysage 16:9 puis assemble la version TikTok 9:16 par réutilisation directe de l'audio"""
    prefix = f"bulletin_hdf_{mode}" if zone == "hdf" else f"bulletin_{mode}"
    landscape_file = os.path.join(output_dir, f"{prefix}_paysage_16_9.mp4")
    tiktok_file = os.path.join(output_dir, f"{prefix}_tiktok_9_16.mp4")

    # 1. Cartes Paysage
    cards_land = collect_cards(zone, maps_dir, orientation="landscape")
    temp_land = os.path.join(output_dir, f"temp_{zone}_{mode}_land")
    log(f"🎬 [1/2] Compilation {zone.upper()} {mode.upper()} PAYSAGE 16:9...")
    durations = compile_video(zone, cards_land, script_phrases, landscape_file, music_path, api_key, temp_land, orientation="landscape")

    # 2. Cartes Portrait & réutilisation de la piste audio
    cards_port = collect_cards(zone, maps_dir, orientation="portrait")
    log(f"🎬 [2/2] Compilation {zone.upper()} {mode.upper()} TIKTOK 9:16 (Synchronisation 1:1)...")
    temp_port = os.path.join(output_dir, f"temp_{zone}_{mode}_port")
    os.makedirs(temp_port, exist_ok=True)

    extracted_audio = os.path.join(temp_port, "extracted_audio.aac")
    subprocess.run([
        "ffmpeg", "-y", "-i", landscape_file,
        "-vn", "-c:a", "copy", extracted_audio
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Encodeur vidéo (teste réellement la présence d'un GPU NVENC, sinon libx264)
    encoder = check_encoder()
    v_codec = ["-c:v", "h264_nvenc", "-preset", "p4", "-b:v", "4000k"] if encoder == "h264_nvenc" else ["-c:v", "libx264", "-preset", "fast", "-crf", "20"]

    filter_str = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
    concat_txt = os.path.join(temp_port, "concat.txt")

    with open(concat_txt, "w", encoding="utf-8") as f_concat:
        for i, card in enumerate(cards_port):
            dur = durations[i] if durations and i < len(durations) else 15.0
            seg_p = os.path.join(temp_port, f"port_seg_{i:02d}.mp4")
            cmd = [
                "ffmpeg", "-y", "-loop", "1", "-i", card["path"],
                "-t", str(dur),
                "-vf", f"{filter_str},format=yuv420p",
                "-r", "30"
            ] + v_codec + [seg_p]
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            f_concat.write(f"file '{seg_p.replace(os.sep, '/')}'\n")

    raw_video = os.path.join(temp_port, "raw_port.mp4")
    subprocess.run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_txt,
        "-c", "copy", raw_video
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    subprocess.run([
        "ffmpeg", "-y", "-i", raw_video, "-i", extracted_audio,
        "-map", "0:v", "-map", "1:a",
        "-c:v", "copy", "-c:a", "copy",
        "-shortest", tiktok_file
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Nettoyage
    try:
        shutil.rmtree(temp_land)
        shutil.rmtree(temp_port)
    except Exception:
        pass

    log(f"🎉 SUCCÈS {zone.upper()} MODE {mode.upper()} :")
    log(f"   -> Paysage : {landscape_file} ({os.path.getsize(landscape_file)/(1024*1024):.2f} Mo)")
    log(f"   -> TikTok  : {tiktok_file} ({os.path.getsize(tiktok_file)/(1024*1024):.2f} Mo)")

    # Copie Bureau si Desktop existe
    desktop = os.path.join(os.path.expanduser("~"), "Desktop")
    if os.path.exists(desktop):
        date_tag = datetime.now().strftime("%d_%m_%Y")
        zone_tag = f"_{zone.upper()}" if zone != "france" else ""
        f_desk_land = os.path.join(desktop, f"BULLETIN_PAYSAGE_METEO_CLIMAT_PRO{zone_tag}_{mode.upper()}_{date_tag}.mp4")
        f_desk_tok = os.path.join(desktop, f"BULLETIN_TIKTOK_METEO_CLIMAT_PRO{zone_tag}_{mode.upper()}_{date_tag}.mp4")
        shutil.copy(landscape_file, f_desk_land)
        shutil.copy(tiktok_file, f_desk_tok)
        log(f"   📋 Fichiers livrés sur le Bureau :")
        log(f"      - {f_desk_land}")
        log(f"      - {f_desk_tok}")

def main():
    parser = argparse.ArgumentParser(description="Générateur Quotidien Bulletins Météo France & Hauts-de-France (Paysage + TikTok)")
    parser.add_argument("--mode", choices=["grand_public", "btp", "both"], default="grand_public",
                        help="Mode de rédaction du bulletin (grand_public, btp, ou both)")
    parser.add_argument("--zone", choices=["france", "hdf", "both"], default="both",
                        help="Zone(s) à générer : france, hdf, ou both (défaut)")
    parser.add_argument("--output-dir", default=None, help="Dossier de sortie")
    args = parser.parse_args()

    api_key = get_api_key()
    # ponytail: cur_dir en priorité → find_forecast_csv trouvera le CSV généré dans le même dossier sur GitHub Actions
    cur_dir = os.path.dirname(os.path.abspath(__file__))
    maps_dir = find_maps_dir()
    music_path = find_music_path()

    output_dir = args.output_dir if args.output_dir else os.path.join(cur_dir, "output_bulletins")
    os.makedirs(output_dir, exist_ok=True)

    zones = ["france", "hdf"] if args.zone == "both" else [args.zone]

    for z in zones:
        cards = collect_cards(z, maps_dir, orientation="landscape")
        log(f"📋 {len(cards)} cartes trouvées pour {z.upper()} dans {maps_dir}")
        if not cards:
            log(f"⚠️ Aucune carte trouvée pour {z.upper()}, passage à la zone suivante.")
            continue

        if args.mode in ["grand_public", "both"]:
            log(f"🧠 Rédaction du script Grand Public ({z.upper()}) par l'IA (données CSV réelles J+1)...")
            script_gp = generate_script_from_data(z, cards, api_key, maps_dir, mode="grand_public")
            if not script_gp:
                log(f"⚠️ ATTENTION : script IA indisponible pour {z.upper()} — utilisation du fallback de secours")
                script_gp = SCRIPT_HDF_GRAND_PUBLIC if z == "hdf" else SCRIPT_GRAND_PUBLIC
            generate_bulletin_pair("grand_public", script_gp, output_dir, maps_dir, music_path, api_key, zone=z)

        if args.mode in ["btp", "both"]:
            log(f"🧠 Rédaction du script BTP Pro ({z.upper()}) par l'IA (données CSV réelles J+1)...")
            script_btp = generate_script_from_data(z, cards, api_key, maps_dir, mode="btp")
            if not script_btp:
                log(f"⚠️ ATTENTION : script IA indisponible pour {z.upper()} — utilisation du fallback de secours")
                script_btp = SCRIPT_HDF_BTP if z == "hdf" else SCRIPT_BTP
            generate_bulletin_pair("btp", script_btp, output_dir, maps_dir, music_path, api_key, zone=z)

if __name__ == "__main__":
    main()
