#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Compilation du Bulletin Météo France Grand Public au format TikTok / Vertical (9:16 - 1080x1920)
- Ton chaleureux, clair et télévisuel pour le grand public (sorties, week-end, météo du quotidien)
- Voix Charon (Gemini 3.8 Flash-Lite TTS), accent métropolitain parisien soigné
- Rythme dynamique et posé (tempo +2% / atempo=1.02)
- Cartes verticales officielles (carte_J*_portrait.jpg)
- Températures et villes 100% conformes aux cartes Météo-France
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
    "Bonjour à tous, bienvenue pour votre bulletin météo national. Ce samedi matin, le week-end commence sous des conditions calmes et agréables, avec un ciel partagé entre éclaircies et quelques passages nuageux. Prévoyez une belle fraîcheur avec 6 degrés à Pontarlier, 16 à Paris et déjà 21 degrés à Bastia.",
    
    # CARTE 2 : Samedi après-midi 26 septembre
    "Dans l'après-midi, le soleil s'imposera généreusement sur la majeure partie de la France, idéal pour vos sorties et activités en plein air. Les températures seront très douces avec 19 degrés à Boulogne-sur-Mer, 25 degrés à Rennes et jusqu'à 30 degrés à Montélimar au bord de la Méditerranée.",
    
    # CARTE 3 : Dimanche 27 septembre
    "Dimanche, une très belle ambiance estivale s'installera sur le pays. Seule la Bretagne essuiera de rares ondées avec 21 degrés à Brest, tandis qu'ailleurs le soleil brillera avec 26 degrés à Lille et une belle pointe de chaleur jusqu'à 34 degrés à Vichy.",
    
    # CARTE 4 : Lundi 28 septembre
    "Lundi, une perturbation glissera par la façade atlantique en apportant des nuages et quelques averses, avec 23 degrés à La Rochelle. L'ambiance restera en revanche très ensoleillée et chaude de l'Est au Sud-Ouest, avec 28 degrés à Toulouse et 30 degrés à Vichy.",
    
    # CARTE 5 : Mardi 29 septembre
    "Mardi, la chaleur se renforcera à nouveau sur une grande majorité des régions sous un ciel lumineux. Il fera 23 degrés à Brest, 29 degrés à Amiens et jusqu'à 32 degrés à Bordeaux. Une journée particulièrement chaude et agréable pour la saison.",
    
    # CARTE 6 : Mercredi 30 septembre
    "Mercredi, le temps deviendra plus lourd et instable par l'ouest, où le ciel se couvrira avec quelques averses orageuses. Comptez 21 degrés à Brest et 29 degrés à Toulouse, tandis que l'atmosphère restera très chaude à l'est avec 32 degrés à Vichy.",
    
    # CARTE 7 : Jeudi 1er octobre
    "Jeudi marquera un net changement de temps avec l'entrée dans le mois d'octobre : les averses se généraliseront et le thermomètre amorcera une baisse sensible, avec 18 degrés à Boulogne-sur-Mer, 21 degrés à Paris et 28 degrés à Ajaccio.",
    
    # CARTE 8 : Vendredi 2 octobre
    "Vendredi, le calme reviendra avec de belles éclaircies après l'évacuation des dernières pluies. Les températures rejoindront les normales de saison, avec 17 degrés à Boulogne-sur-Mer, 21 degrés à Nantes et 26 degrés à Ajaccio.",
    
    # CARTE 9 : Éphéméride & Synthèse Grand Public
    "En résumé, profitez pleinement de cette ambiance estivale et très douce jusqu'à mardi, avant le retour de conditions plus automnales et humides à partir de jeudi. Merci de votre fidélité et excellente suite de vos programmes avec Météo Climat Pro !"
]

def main():
    api_key = get_api_key()
    if not api_key:
        log("❌ ERREUR : OPENROUTER_API_KEY manquante !")
        return

    maps_dir = find_maps_dir()
    music_path = find_music_path()
    cards = collect_cards("france", maps_dir, orientation="portrait")

    log(f"🔎 Cartes collectées pour France TikTok ({len(cards)}) :")
    for c in cards:
        log(f"   - {c['label']} : {os.path.basename(c['path'])}")

    if len(cards) != len(SCRIPT_PHRASES):
        log(f"❌ Erreur : {len(cards)} cartes trouvées vs {len(SCRIPT_PHRASES)} phrases !")
        return

    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output_bulletins")
    os.makedirs(output_dir, exist_ok=True)
    out_video = os.path.join(output_dir, "bulletin_tiktok_france_grand_public.mp4")
    temp_dir = os.path.join(output_dir, "temp_custom_france_grand_public_tiktok")

    log("🚀 Lancement de la compilation du bulletin France GRAND PUBLIC [TIKTOK 9:16]...")
    compile_video("france", cards, SCRIPT_PHRASES, out_video, music_path, api_key, temp_dir, orientation="portrait")

    # Copie sur le Bureau
    desktop = os.path.join(os.path.expanduser("~"), "Desktop")
    date_tag = datetime.now().strftime("%d_%m_%Y")
    desktop_file = os.path.join(desktop, f"BULLETIN_TIKTOK_METEO_CLIMAT_PRO_FRANCE_GRAND_PUBLIC_{date_tag}.mp4")
    shutil.copy(out_video, desktop_file)
    log(f"📋 Copie livrée sur le Bureau : {desktop_file}")

if __name__ == "__main__":
    main()
