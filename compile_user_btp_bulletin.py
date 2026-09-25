#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Compilation directe du Bulletin Météo BTP France Paysage 16:9
- Texte officiel enrichi des villes et températures exactes affichées sur les cartes
- Rythme dynamique (tempo +4%) pour un format télévisé fluide et naturel
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
    "Voici votre bulletin météo BTP. Ce samedi matin, les conditions seront calmes avec un ciel partagé entre éclaircies et passages nuageux. Prévoyez 6 degrés à Pontarlier, 16 à Paris et 21 degrés à Bastia. Pour vos chantiers, les conditions sont globalement très favorables.",
    
    # CARTE 2 : Samedi après-midi 26 septembre
    "Dans l'après-midi, le soleil prendra largement l'avantage. On attend 19 degrés à Boulogne-sur-Mer, 25 degrés à Rennes et jusqu'à 30 degrés à Montélimar. Vigilance particulière pour les travaux physiques en plein soleil, pensez à l'hydratation des compagnons.",
    
    # CARTE 3 : Dimanche 27 septembre
    "Dimanche, la chaleur s'accentuera. Quelques averses concerneront la Bretagne avec 21 degrés à Brest, mais le soleil dominera avec 26 degrés à Lille et un pic à 34 degrés à Vichy. Anticipez le coup de chaud sur les chantiers exposés.",
    
    # CARTE 4 : Lundi 28 septembre
    "Lundi, le temps deviendra plus changeant sur l'ouest, rendant les sols glissants : comptez 23 degrés à La Rochelle. À l'est et au sud, le temps reste favorable avec 28 degrés à Toulouse et 30 degrés à Vichy. Attention au vent pour les grues.",
    
    # CARTE 5 : Mardi 29 septembre
    "Mardi, nouvelle hausse des températures : les éclaircies domineront avec 23 degrés à Brest, 29 degrés à Amiens et 32 degrés à Bordeaux. Surveillez l'exposition prolongée à la forte chaleur, notamment sur les chantiers sans zones ombragées.",
    
    # CARTE 6 : Mercredi 30 septembre
    "Mercredi, l'instabilité progressera par l'ouest avec des averses risquant d'inonder les fouilles et tranchées. Il fera 21 degrés à Brest et 29 degrés à Toulouse, tandis que Vichy conservera 32 degrés. Adaptez vos plannings de terrassement.",
    
    # CARTE 7 : Jeudi 1er octobre
    "Jeudi marquera un net changement : les averses se généralisent et les températures baissent, avec 18 degrés à Boulogne-sur-Mer, 21 degrés à Paris et 28 degrés à Ajaccio. Vigilance renforcée pour les travaux en hauteur et les sols humides.",
    
    # CARTE 8 : Vendredi 2 octobre
    "Vendredi, nette amélioration avec le retour de belles éclaircies. Les températures seront plus modérées : 17 degrés à Boulogne-sur-Mer, 21 degrés à Nantes et 26 degrés à Ajaccio. Une fin de semaine plus favorable aux activités extérieures.",
    
    # CARTE 9 : Synthèse & Clôture BTP
    "En résumé, les points de vigilance pour vos chantiers seront la forte chaleur jusqu'à mardi, puis le retour d'un temps plus instable dès mercredi. Pensez à consulter régulièrement vos alertes Météo Climat Pro pour anticiper sur vos chantiers !"
]

def main():
    api_key = get_api_key()
    if not api_key:
        log("❌ ERREUR : OPENROUTER_API_KEY manquante !")
        return

    maps_dir = find_maps_dir()
    music_path = find_music_path()
    cards = collect_cards("france", maps_dir, orientation="landscape")

    if len(cards) != len(SCRIPT_PHRASES):
        log(f"❌ Erreur : {len(cards)} cartes trouvées vs {len(SCRIPT_PHRASES)} phrases !")
        return

    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output_bulletins")
    os.makedirs(output_dir, exist_ok=True)
    out_video = os.path.join(output_dir, "bulletin_paysage_france.mp4")
    temp_dir = os.path.join(output_dir, "temp_custom_fast_france")

    log("🚀 Lancement de la compilation du bulletin France BTP accéléré & enrichi...")
    compile_video("france", cards, SCRIPT_PHRASES, out_video, music_path, api_key, temp_dir, orientation="landscape")

    # Copie sur le Bureau
    desktop = os.path.join(os.path.expanduser("~"), "Desktop")
    date_tag = datetime.now().strftime("%d_%m_%Y")
    desktop_file = os.path.join(desktop, f"BULLETIN_PAYSAGE_METEO_CLIMAT_PRO_FRANCE_{date_tag}.mp4")
    shutil.copy(out_video, desktop_file)
    log(f"📋 Copie livrée sur le Bureau : {desktop_file}")

if __name__ == "__main__":
    main()
