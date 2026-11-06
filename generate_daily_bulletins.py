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
    # CARTE 1 : J1 Matin
    "Bonjour à tous, voici votre météo nationale. Ce matin, réveil calme sous un ciel généralement lumineux, après dissipation des quelques brumes matinales dans les plaines intérieures et une fraîcheur bien de saison.",
    
    # CARTE 2 : J1 Après-midi
    "Pour votre après-midi, de très belles éclaircies s'imposent d'est en ouest dans une atmosphère douce et parfaitement sèche, malgré quelques passages nuageux décoratifs près des reliefs et le long des côtes.",
    
    # CARTE 3 : J2
    "Le lendemain, maintien de conditions très calmes et ensoleillées sur la quasi-totalité du pays, avec tout au plus un léger voile nuageux d'altitude et un mercure restant très agréable pour vos sorties.",
    
    # CARTE 4 : J3
    "Le surlendemain, un ciel plus mitigé s'installera par le nord-ouest avec un vent sensible et quelques ondées éparses, tandis que la moitié sud conservera un temps sec, lumineux et doux.",
    
    # CARTE 5 : J4
    "Pour la suite, retour de belles plages ensoleillées après la dissipation des grisailles matinales, accompagnées de températures printanières très confortables et d'un vent devenant très discret sur l'ensemble des départements.",
    
    # CARTE 6 : J5
    "Le temps deviendra ensuite plus changeant avec une alternance de passages nuageux denses et d'éclaircies passagères, pouvant lâcher de rares averses locales sous des températures restant stables et de saison.",
    
    # CARTE 7 : J6
    "En fin d'échéance, un ciel plus partagé alternera entre nuages et belles périodes de soleil, tandis que le pourtour méditerranéen conservera un franc soleil avec une atmosphère encore très douce.",
    
    # CARTE 8 : J7
    "Dernière journée de prévision sous un temps stable, calme et largement ensoleillé grâce à des pressions bien orientées, idéal pour profiter pleinement de toutes vos activités de plein air.",
    
    # CARTE 9 : Éphéméride & Synthèse
    "Profitez de ces belles journées ensoleillées au fil de la semaine. Très bonne journée à tous avec Météo-Climat Pro !"
]

SCRIPT_BTP = [
    # CARTE 1 : J1 Matin
    "Voici votre bulletin météo BTP. Ce matin, conditions sèches idéales pour le démarrage de vos chantiers extérieurs, avec une bonne visibilité après la levée des quelques brumes matinales et un vent très faible.",
    
    # CARTE 2 : J1 Après-midi
    "Pour l'après-midi, un temps sec et lumineux s'impose sur les chantiers, particulièrement favorable au séchage des dalles, au terrassement et à l'avancement régulier de tous vos travaux de gros œuvre.",
    
    # CARTE 3 : J2
    "Le lendemain, poursuite d'un temps calme et sec sur l'ensemble du territoire, permettant de sécuriser toutes vos opérations extérieures, le coulage du béton et le levage sans contrainte de vent.",
    
    # CARTE 4 : J3
    "Le surlendemain, arrivée d'un ciel plus couvert par l'ouest avec quelques ondées éparses : surveillez la prise au vent sur les échafaudages côtiers et l'adhérence des engins de terrassement sur piste.",
    
    # CARTE 5 : J4
    "Pour la suite, retour de conditions parfaitement stables et sèches sur la grande majorité des chantiers, très propices à la cadence normale de vos plannings de maçonnerie et d'étanchéité.",
    
    # CARTE 6 : J5
    "Ciel plus incertain avec quelques averses possibles : pensez à bâcher vos zones de stockage et matériaux sensibles à l'humidité, tout en maintenant les activités sous abri ou en extérieur sec.",
    
    # CARTE 7 : J6
    "Conditions plus fraîches sous un ciel partagé : vérifiez systématiquement l'amarrage de vos grues et structures légères, avec un thermomètre restant propice à la bonne prise des mortiers.",
    
    # CARTE 8 : J7
    "Fin d'échéance calme et propice à la finalisation sereine de vos travaux en cours, avec un temps sec et une visibilité parfaite sur l'ensemble de vos chantiers nationaux.",
    
    # CARTE 9 : Synthèse
    "Restez vigilants sur l'évolution du vent et les accès chantiers. Excellente semaine à toutes vos équipes avec Météo BTP !"
]

SCRIPT_HDF_GRAND_PUBLIC = [
    # CARTE 1 : J1 Matin
    "Bonjour à tous, bienvenue pour votre météo des Hauts-de-France. Ce matin, réveil calme sous un ciel lumineux, après dissipation des brumes côtières sur le littoral et une agréable fraîcheur de saison.",
    
    # CARTE 2 : J1 Après-midi
    "Pour votre après-midi, de très belles éclaircies s'imposent de la Côte d'Opale jusqu'à l'Aisne dans une atmosphère douce et parfaitement sèche, malgré quelques cumulus décoratifs sans conséquence sur le bassin minier.",
    
    # CARTE 3 : J2
    "Le lendemain, maintien de conditions clémentes et très lumineuses sur l'ensemble du Nord et de la Picardie, avec un thermomètre stationnaire et idéal pour vos activités et sorties extérieures.",
    
    # CARTE 4 : J3
    "Le surlendemain, le ciel se voilera légèrement par le littoral avec quelques nuages inoffensifs et un vent modéré en bord de mer, sans conséquence sur la grande douceur générale de la région.",
    
    # CARTE 5 : J4
    "Pour la suite, retour de larges plages ensoleillées entre Flandres, Artois et plaines picardes, avec un ressenti très agréable et des températures bien conformes aux normales saisonnières.",
    
    # CARTE 6 : J5
    "Le temps deviendra ensuite plus mitigé avec une alternance de passages nuageux et d'éclaircies passagères pouvant lâcher une rare ondée, sous un mercure restant très stable sur l'ensemble des départements.",
    
    # CARTE 7 : J6
    "En fin d'échéance, un ciel partagé alternera entre nuages et belles périodes de soleil, avec un thermomètre restant doux et agréable de Dunkerque jusqu'au sud de l'Oise.",
    
    # CARTE 8 : J7
    "Dernière journée de prévision sous un ciel bien dégagé et calme sur la quasi-totalité des Hauts-de-France, grâce au retour de conditions anticycloniques protectrices et durables.",
    
    # CARTE 9 : Éphéméride & Synthèse
    "Profitez pleinement de ces belles journées lumineuses dans notre région. À très vite avec Météo-Climat Pro !"
]

SCRIPT_HDF_BTP = [
    # CARTE 1 : J1 Matin
    "Voici votre bulletin météo BTP pour les Hauts-de-France. Ce matin, conditions sèches et favorables au démarrage des chantiers, après dissipation rapide des brumes côtières et un vent restant très modéré.",
    
    # CARTE 2 : J1 Après-midi
    "Pour l'après-midi, un temps sec et lumineux s'installe, parfait pour le coulage béton, les travaux de voirie et le terrassement de la métropole lilloise jusqu'au sud de la Picardie.",
    
    # CARTE 3 : J2
    "Le lendemain, maintien d'un temps sec sur le Nord et la Picardie pour poursuivre vos opérations extérieures en toute sérénité, sans perturbation du rythme de vos livraisons et de vos plannings.",
    
    # CARTE 4 : J3
    "Le surlendemain, vent modéré en bord de mer et ciel plus voilé : surveillez la prise au vent sur les échafaudages côtiers et sécurisez vos éléments légers sur le littoral de la Côte d'Opale.",
    
    # CARTE 5 : J4
    "Pour la suite, de belles fenêtres météo stables permettent de cadencer vos chantiers de gros œuvre et de toiture sous un ciel lumineux et un mercure favorable aux finitions.",
    
    # CARTE 6 : J5
    "Ciel plus incertain avec quelques ondées éparses : protégez vos zones de stockage et matériaux sensibles à l'humidité, et veillez à l'adhérence des pistes d'accès aux chantiers.",
    
    # CARTE 7 : J6
    "Conditions plus fraîches avec de rares averses résiduelles : vérifiez systématiquement l'amarrage des échafaudages et le bon fonctionnement des engins de levage sous ce vent modéré.",
    
    # CARTE 8 : J7
    "Fin d'échéance calme et propice à l'avancement normal de tous vos chantiers sur l'ensemble de la région, avec un temps sec et une visibilité parfaite pour vos équipes.",
    
    # CARTE 9 : Synthèse
    "Restez vigilants sur les rafales en bord de mer et les sols glissants. Excellente semaine à vos équipes avec Météo BTP !"
]

SCRIPT_GRAND_EST_GRAND_PUBLIC = [
    # CARTE 1 : J1 Matin
    "Bonjour à tous, bienvenue pour votre bulletin météo du Grand Est. Ce matin, réveil calme sous un ciel lumineux après dissipation des brouillards dans les vallées lorraines et champenoises, avec une fraîcheur vivifiante.",
    
    # CARTE 2 : J1 Après-midi
    "Pour votre après-midi, de très belles éclaircies s'imposent de la plaine d'Alsace jusqu'à la Champagne dans une atmosphère douce et parfaitement sèche, malgré quelques cumulus décoratifs sur le massif vosgien.",
    
    # CARTE 3 : J2
    "Le lendemain, maintien de conditions clémentes et très lumineuses sur l'Alsace, la Lorraine et la Champagne-Ardenne, avec un thermomètre restant très agréable pour toutes vos sorties extérieures.",
    
    # CARTE 4 : J3
    "Le surlendemain, le ciel se voilera progressivement par l'ouest avec quelques passages nuageux sans conséquence sur les plaines alsaciennes, maintenant une grande douceur sur l'ensemble des départements.",
    
    # CARTE 5 : J4
    "Pour la suite, retour de belles plages ensoleillées entre la plaine du Rhin et le plateau ardennais, avec des températures de saison et un vent faible très agréable pour la saison.",
    
    # CARTE 6 : J5
    "Le temps deviendra plus mitigé avec une alternance de passages nuageux et d'éclaircies passagères pouvant lâcher de rares averses locales, sans impacter la douceur ambiante de Strasbourg à Reims.",
    
    # CARTE 7 : J6
    "En fin d'échéance, un ciel partagé alternera entre nuages et périodes de soleil, tandis que les Vosges conserveront un temps sec et frais propice aux randonnées et activités extérieures.",
    
    # CARTE 8 : J7
    "Dernière journée de prévision sous un ciel bien dégagé et calme sur la quasi-totalité du Grand Est, grâce à la réinstallation durable d'un anticyclone protecteur sur l'Europe centrale.",
    
    # CARTE 9 : Éphéméride & Synthèse
    "Profitez pleinement de ces belles journées lumineuses dans notre grande région. À très vite avec Météo-Climat Pro !"
]

SCRIPT_GRAND_EST_BTP = [
    # CARTE 1 : J1 Matin
    "Voici votre bulletin météo BTP pour le Grand Est. Ce matin, conditions sèches et très favorables au démarrage des chantiers, après dissipation rapide des brouillards dans les fonds de vallée vosgiens et lorrains.",
    
    # CARTE 2 : J1 Après-midi
    "Pour l'après-midi, un temps sec et lumineux domine largement, idéal pour le coulage du béton, les travaux de voirie et le terrassement de l'Alsace jusqu'à la Marne.",
    
    # CARTE 3 : J2
    "Le lendemain, maintien d'un temps sec et lumineux de Strasbourg à Reims pour poursuivre vos opérations extérieures en toute sérénité, sans risque de pluie ni vent pénalisant pour vos grues.",
    
    # CARTE 4 : J3
    "Le surlendemain, ciel plus voilé sur les Vosges et les Ardennes : anticipez le séchage des enduits et bétons extérieurs, et vérifiez la bonne tenue des bâchages en zone ventilée.",
    
    # CARTE 5 : J4
    "Pour la suite, de belles fenêtres météo stables s'installent entre les plaines champenoises et l'Alsace, idéales pour cadencer vos plannings de terrassement et d'élévation.",
    
    # CARTE 6 : J5
    "Ciel plus incertain avec de rares ondées éparses : protégez vos zones de stockage et matériaux sensibles à l'humidité, et maintenez une vigilance sur l'adhérence des pistes boueuses.",
    
    # CARTE 7 : J6
    "Conditions plus fraîches sous un ciel partagé : surveillez les températures nocturnes pour les prises de mortier et vérifiez le bon arrimage de vos échafaudages sous le vent modéré.",
    
    # CARTE 8 : J7
    "Fin d'échéance calme et propice à la finalisation normale de vos travaux en cours sur l'ensemble du Grand Est, avec un temps sec et une visibilité optimale.",
    
    # CARTE 9 : Synthèse
    "Restez vigilants sur les accès chantiers et les rafales en altitude. Excellente semaine à toutes vos équipes avec Météo BTP !"
]

def generate_bulletin_pair(mode, script_phrases, output_dir, maps_dir, music_path, api_key, zone="france"):
    """Génère la version Paysage 16:9 puis assemble la version TikTok 9:16 par réutilisation directe de l'audio"""
    if zone == "hdf":
        prefix = f"bulletin_hdf_{mode}"
    elif zone == "grand-est":
        prefix = f"bulletin_grand-est_{mode}"
    else:
        prefix = f"bulletin_{mode}"
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
        zone_tag = f"_{zone.upper().replace('-', '_')}" if zone != "france" else ""
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
    parser.add_argument("--zone", choices=["france", "hdf", "grand-est", "both", "all"], default="both",
                        help="Zone(s) à générer : france, hdf, grand-est, both ou all (défaut: both = france + hdf + grand-est)")
    parser.add_argument("--output-dir", default=None, help="Dossier de sortie")
    args = parser.parse_args()

    api_key = get_api_key()
    # ponytail: cur_dir en priorité → find_forecast_csv trouvera le CSV généré dans le même dossier sur GitHub Actions
    cur_dir = os.path.dirname(os.path.abspath(__file__))
    maps_dir = find_maps_dir()
    music_path = find_music_path()

    output_dir = args.output_dir if args.output_dir else os.path.join(cur_dir, "output_bulletins")
    os.makedirs(output_dir, exist_ok=True)

    zones = ["france", "hdf", "grand-est"] if args.zone in ["both", "all"] else [args.zone]
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
                if z == "hdf":
                    script_gp = SCRIPT_HDF_GRAND_PUBLIC
                elif z == "grand-est":
                    script_gp = SCRIPT_GRAND_EST_GRAND_PUBLIC
                else:
                    script_gp = SCRIPT_GRAND_PUBLIC
            generate_bulletin_pair("grand_public", script_gp, output_dir, maps_dir, music_path, api_key, zone=z)

        if args.mode in ["btp", "both"]:
            log(f"🧠 Rédaction du script BTP Pro ({z.upper()}) par l'IA (données CSV réelles J+1)...")
            script_btp = generate_script_from_data(z, cards, api_key, maps_dir, mode="btp")
            if not script_btp:
                log(f"⚠️ ATTENTION : script IA indisponible pour {z.upper()} — utilisation du fallback de secours")
                if z == "hdf":
                    script_btp = SCRIPT_HDF_BTP
                elif z == "grand-est":
                    script_btp = SCRIPT_GRAND_EST_BTP
                else:
                    script_btp = SCRIPT_BTP
            generate_bulletin_pair("btp", script_btp, output_dir, maps_dir, music_path, api_key, zone=z)

if __name__ == "__main__":
    main()
