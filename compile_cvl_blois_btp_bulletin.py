#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Compilation du Bulletin Météo BTP Centre-Val de Loire - Focus Blois & Loir-et-Cher
Format Paysage 16:9 (1920x1080)
- Voix Charon (Gemini 3.8 Flash-Lite TTS), accent métropolitain parisien soigné
- Tempo audio calibré à +2% (atempo=1.02)
- Conseils chantiers BTP experts (vent grues, forte chaleur hydratation, averses terrassement)
- Températures 100% alignées sur les cartes de la région Centre-Val de Loire
- Décalage au mardi 29 septembre (J+2)
"""

import os
import shutil
from datetime import datetime
from generate_tiktok_bulletins import (
    find_maps_dir,
    find_music_path,
    collect_cards,
    generate_script_from_data,
    compile_video,
    get_api_key,
    log
)

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

    if len(cards) < 3:
        log(f"❌ Erreur : Seulement {len(cards)} cartes trouvées dans {maps_dir} !")
        return

    log("🧠 Génération dynamique du script BTP Centre-Val de Loire / Blois...")
    phrases = generate_script_from_data("cvl", cards, api_key, maps_dir, mode="btp")

    log(f"📝 Script oral généré ({len(phrases)} phrases) :")
    for idx, p in enumerate(phrases):
        log(f"   [{idx+1}/{len(phrases)}] {p}")

    if len(cards) != len(phrases):
        log(f"❌ Erreur : {len(cards)} cartes trouvées vs {len(phrases)} phrases !")
        return

    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output_bulletins")
    os.makedirs(output_dir, exist_ok=True)
    out_video = os.path.join(output_dir, "bulletin_paysage_cvl_blois.mp4")
    temp_dir = os.path.join(output_dir, "temp_custom_cvl_blois")

    log("🚀 Lancement de la compilation du bulletin Centre-Val de Loire (Blois) BTP (16:9 Paysage)...")
    compile_video("cvl", cards, phrases, out_video, music_path, api_key, temp_dir, orientation="landscape")

    # Copie sur le Bureau
    desktop = os.path.join(os.path.expanduser("~"), "Desktop")
    date_tag = datetime.now().strftime("%d_%m_%Y")
    desktop_file = os.path.join(desktop, f"BULLETIN_PAYSAGE_METEO_CLIMAT_PRO_CVL_BLOIS_{date_tag}.mp4")
    shutil.copy(out_video, desktop_file)
    log(f"📋 Copie livrée sur le Bureau : {desktop_file}")

if __name__ == "__main__":
    main()
