#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Compilation du Bulletin Météo BTP Centre-Val de Loire - Focus Blois & Loir-et-Cher
Format Paysage 16:9 (1920x1080)
- Voix Charon (Gemini 3.8 Flash-Lite TTS), accent métropolitain parisien soigné
- Tempo audio calibré à +2% (atempo=1.02)
- Conseils chantiers BTP experts (vent grues, forte chaleur hydratation, averses terrassement)
- Températures 100% alignées sur les cartes de la région Centre-Val de Loire
"""

import os
import shutil
from datetime import datetime
from generate_tiktok_bulletins import (
    find_maps_dir,
    find_music_path,
    collect_cards,
    compile_video,
    get_api_key,
    log
)

SCRIPT_PHRASES = [
    # CARTE 1 : Samedi matin 26 septembre
    "Voici votre bulletin météo BTP pour la région Centre-Val de Loire, avec un focus sur Blois et le Loir-et-Cher. Ce samedi matin, le temps sera calme sous un ciel nuageux. Prévoyez 10 degrés à Romorantin, 13 degrés à Blois et 14 degrés à Tours. Des conditions idéales pour débuter vos travaux extérieurs.",
    
    # CARTE 2 : Samedi après-midi 26 septembre
    "Dans l'après-midi, la douceur s'installera avec de belles éclaircies. On attend 24 degrés à Écueillé, 25 degrés à Blois et Tours, et jusqu'à 27 degrés à Saint-Amand-Montrond. Une météo très favorable pour vos travaux de terrassement, coulage et voirie.",
    
    # CARTE 3 : Dimanche 27 septembre
    "Dimanche, la chaleur va nettement s'accentuer sous un soleil voilé. Comptez 27 degrés à Nogent-le-Rotrou, 30 degrés à Blois et jusqu'à 33 degrés vers Saint-Amand-Montrond. Attention au coup de chaud pour les équipes intervenant en extérieur : hydratez bien les compagnons.",
    
    # CARTE 4 : Lundi 28 septembre
    "Lundi, le ciel deviendra plus instable avec quelques averses : on attend 23 degrés à Dreux, 25 degrés à Blois et 28 degrés à Orléans. Point d'attention majeur pour les chantiers : le vent soufflera en rafales jusqu'à plus de 40 kilomètres-heure, soyez prudents avec les grues et sur les échafaudages.",
    
    # CARTE 5 : Mardi 29 septembre
    "Mardi, l'atmosphère redeviendra très chaude et lourde sur la région. Les thermomètres afficheront 27 degrés à Nogent-le-Rotrou, 28 degrés à Tours et 30 degrés à Blois. Surveillez l'exposition prolongée à la chaleur sur les zones de chantier non ombragées.",
    
    # CARTE 6 : Mercredi 30 septembre
    "Mercredi, le ciel restera très nuageux avec un risque de petites ondées locales. Il fera 24 degrés à Nogent-le-Rotrou, 25 degrés à Tours et 26 degrés à Blois. Une journée mitigée nécessitant d'anticiper la protection de vos matériaux sensibles à l'humidité.",
    
    # CARTE 7 : Jeudi 1er octobre
    "Jeudi marquera une nette rupture d'ambiance avec l'arrivée d'averses et une baisse sensible des températures : comptez 19 degrés à Châteaudun, 21 degrés à Blois et à Tours. Prudence renforcée sur les sols détrempés et pour les manœuvres d'engins.",
    
    # CARTE 8 : Vendredi 2 octobre
    "Vendredi, les conditions s'amélioreront progressivement avec le retour de belles éclaircies. Les maximales resteront tempérées avec 19 degrés à Châteaudun, 21 degrés à Blois et 22 degrés à Orléans. Une fin de semaine propice pour sécuriser et finaliser vos chantiers.",
    
    # CARTE 9 : Éphéméride & Synthèse BTP Centre-Val de Loire
    "En synthèse pour la région Centre-Val de Loire et le secteur de Blois : profitez d'un très beau début de week-end, préparez-vous au coup de chaud dimanche et mardi, et attention aux coups de vent lundi pour vos grues. Excellente semaine sur vos chantiers avec Météo Climat Pro !"
]

def main():
    api_key = get_api_key()
    if not api_key:
        log("❌ ERREUR : OPENROUTER_API_KEY manquante !")
        return

    maps_dir = find_maps_dir()
    music_path = find_music_path()
    cards = collect_cards("cvl", maps_dir, orientation="landscape")

    log(f"🔎 Cartes collectées pour CVL ({len(cards)}) :")
    for c in cards:
        log(f"   - {c['label']} : {os.path.basename(c['path'])}")

    if len(cards) != len(SCRIPT_PHRASES):
        log(f"❌ Erreur : {len(cards)} cartes trouvées vs {len(SCRIPT_PHRASES)} phrases !")
        return

    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output_bulletins")
    os.makedirs(output_dir, exist_ok=True)
    out_video = os.path.join(output_dir, "bulletin_paysage_cvl_blois.mp4")
    temp_dir = os.path.join(output_dir, "temp_custom_cvl_blois")

    log("🚀 Lancement de la compilation du bulletin Centre-Val de Loire (Blois) BTP...")
    compile_video("cvl", cards, SCRIPT_PHRASES, out_video, music_path, api_key, temp_dir, orientation="landscape")

    # Copie sur le Bureau
    desktop = os.path.join(os.path.expanduser("~"), "Desktop")
    date_tag = datetime.now().strftime("%d_%m_%Y")
    desktop_file = os.path.join(desktop, f"BULLETIN_PAYSAGE_METEO_CLIMAT_PRO_CVL_BLOIS_{date_tag}.mp4")
    shutil.copy(out_video, desktop_file)
    log(f"📋 Copie livrée sur le Bureau : {desktop_file}")

if __name__ == "__main__":
    main()
