#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Générateur Autonome de Bulletins Vidéo (France & Hauts-de-France)
- Formats supportés : Paysage 16:9 (1920x1080) avec Logo Météo-Climat Pro OU Portrait 9:16 (1080x1920)
- RÈGLE D'OR : Les bulletins commencent TOUJOURS à J+1 (Demain)
- 100% Cartes Météo Météo-France (zéro transition vidéo)
- ZÉRO VISION : Rédaction instantanée du script via les données météo officielles (CSV / JSON)
- Synthèse vocale continue avec la voix Charon (google/gemini-3.8-flash-lite-tts)
- Mixage musique de fond mastered à -14.5 LUFS
- Compatible Windows local et Linux Ubuntu (GitHub Actions)
"""

import os
import sys
import csv
import json
import wave
import shutil
import argparse
import subprocess
import urllib.request
import re
import io
import base64
from PIL import Image
from datetime import datetime

FPS = 30

def log(msg):
    print(f"[METEO-GEN] {msg}", flush=True)

def get_api_key():
    key = os.environ.get("OPENROUTER_API_KEY")
    if key:
        return key
    cur_dir = os.path.dirname(os.path.abspath(__file__))
    env_paths = [
        os.path.join(cur_dir, ".env"),
        os.path.join(cur_dir, "..", ".env"),
        r"C:\Users\grego\Documents\METEO_CLIMAT\meteo cnews 2\.env"
    ]
    for ep in env_paths:
        if os.path.exists(ep):
            with open(ep, "r", encoding="utf-8") as f:
                for line in f:
                    if line.startswith("OPENROUTER_API_KEY="):
                        return line.strip().split("=", 1)[1]
    return None

def check_encoder():
    try:
        r = subprocess.run(["ffmpeg", "-f", "lavfi", "-i", "color=c=black:s=64x64:d=0.1",
                            "-c:v", "h264_nvenc", "-f", "null", "-"],
                           capture_output=True, text=True)
        return "h264_nvenc" if r.returncode == 0 else "libx264"
    except Exception:
        return "libx264"

ENCODER = check_encoder()

def find_maps_dir(custom_path=None):
    if custom_path and os.path.exists(custom_path):
        return custom_path
    candidates = [
        r"C:\Users\grego\Desktop\cartes_alertes",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "cartes_alertes"),
        os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "cartes_alertes"))
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    loc = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cartes_alertes")
    os.makedirs(loc, exist_ok=True)
    return loc

def find_music_path():
    cur_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(cur_dir, "assets", "music", "bg_music.ogg"),
        r"C:\Users\grego\Desktop\tiktok_maker\input\music\bg_music.ogg",
        os.path.join(cur_dir, "A_CONSERVER_ABSOLUMENT", "musique de fond.mp3")
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

def collect_cards(zone, maps_dir, orientation="landscape"):
    """
    Récupère dans l'ordre chronologique les cartes en COMMENÇANT TOUJOURS À J+1 (Demain).
    Orientation paysage : sans suffixe (ex: carte_J1_matin.jpg)
    Orientation portrait : avec suffixe (ex: carte_J1_matin_portrait.jpg)
    """
    suffix = f"_{orientation}" if orientation == "portrait" else ""
    cards = []

    if zone == "france":
        prefix = "carte"
        eph_name = f"carte_france_pictos_ephemeride{suffix}.jpg"
        labels = [
            ("Demain Matin (J+1)", f"{prefix}_J1_matin{suffix}.jpg"),
            ("Demain Après-midi (J+1)", f"{prefix}_J1_apresmidi{suffix}.jpg"),
            ("Dimanche (J+2)", f"{prefix}_J2_apresmidi{suffix}.jpg"),
            ("Lundi (J+3)", f"{prefix}_J3_apresmidi{suffix}.jpg"),
            ("Mardi (J+4)", f"{prefix}_J4_apresmidi{suffix}.jpg"),
            ("Mercredi (J+5)", f"{prefix}_J5_apresmidi{suffix}.jpg"),
            ("Jeudi (J+6)", f"{prefix}_J6_apresmidi{suffix}.jpg"),
            ("Vendredi (J+7)", f"{prefix}_J7_apresmidi{suffix}.jpg"),
            ("Éphéméride", eph_name)
        ]
    else:  # Régional (hdf, cvl, etc.)
        prefix = f"carte_{zone}"
        eph_name = f"carte_{zone}_ephemeride{suffix}.jpg"
        labels = [
            ("Demain Matin (J+1)", f"{prefix}_J1_matin{suffix}.jpg"),
            ("Demain Après-midi (J+1)", f"{prefix}_J1_apresmidi{suffix}.jpg"),
            ("Dimanche (J+2)", f"{prefix}_J2_apresmidi{suffix}.jpg"),
            ("Lundi (J+3)", f"{prefix}_J3_apresmidi{suffix}.jpg"),
            ("Mardi (J+4)", f"{prefix}_J4_apresmidi{suffix}.jpg"),
            ("Mercredi (J+5)", f"{prefix}_J5_apresmidi{suffix}.jpg"),
            ("Jeudi (J+6)", f"{prefix}_J6_apresmidi{suffix}.jpg"),
            ("Vendredi (J+7)", f"{prefix}_J7_apresmidi{suffix}.jpg"),
            ("Éphéméride", eph_name)
        ]

    for label, filename in labels:
        p = os.path.join(maps_dir, filename)
        if not os.path.exists(p):
            p_png = p.replace(".jpg", ".png")
            if os.path.exists(p_png):
                p = p_png
        if not os.path.exists(p) and "ephemeride" in filename:
            p_nat = os.path.join(maps_dir, f"carte_france_pictos_ephemeride{suffix}.jpg")
            if os.path.exists(p_nat):
                p = p_nat
            else:
                p_nat_png = p_nat.replace(".jpg", ".png")
                if os.path.exists(p_nat_png):
                    p = p_nat_png

        # Fallback si J7 non présent
        if not os.path.exists(p) and "J7" in filename:
            fb = p.replace("J7", "J6")
            if os.path.exists(fb):
                p = fb

        if os.path.exists(p):
            cards.append({"label": label, "path": p})
        else:
            log(f"⚠️ Carte manquante : {filename} (dans {maps_dir})")

    return cards

def find_forecast_csv(zone, maps_dir):
    """Trouve le fichier CSV des prévisions généré par Météo-France"""
    cur_dir = os.path.dirname(os.path.abspath(__file__))
    fname = "meteofrance_daily_forecast_hdf.csv" if zone == "hdf" else "meteofrance_daily_forecast.csv"
    candidates = [
        os.path.join(cur_dir, fname),
        os.path.join(maps_dir, fname),
        r"C:\Users\grego\Documents\METEO_CLIMAT\meteo cnews 2" + "\\" + fname,
        r"C:\Users\grego\Desktop\cartes_alertes" + "\\" + fname
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

def load_hourly_btp_stats(zone, maps_dir):
    """Extrait du CSV horaire les rafales maximales et les cumuls de pluie par date pour le BTP"""
    cur_dir = os.path.dirname(os.path.abspath(__file__))
    fname = "meteofrance_hourly_forecast_hdf.csv" if zone == "hdf" else "meteofrance_hourly_forecast.csv"
    candidates = [
        os.path.join(cur_dir, fname),
        os.path.join(maps_dir, fname),
        r"C:\Users\grego\Documents\METEO_CLIMAT\meteo cnews 2" + "\\" + fname,
        r"C:\Users\grego\Desktop\cartes_alertes" + "\\" + fname
    ]
    p = None
    for c in candidates:
        if os.path.exists(c):
            p = c
            break
    if not p:
        return {}

    from collections import defaultdict
    daily_stats = defaultdict(lambda: {"max_gust": 0.0, "gust_city": "", "max_rain": 0.0, "rain_city": ""})
    city_rain = defaultdict(lambda: defaultdict(float))
    try:
        with open(p, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f, delimiter=";")
            for r in reader:
                d = r.get("Date", "")
                v = r.get("Ville", "")
                g_str = r.get("wind_gusts_10m", "")
                if g_str:
                    try:
                        g = float(g_str)
                        if g > daily_stats[d]["max_gust"]:
                            daily_stats[d]["max_gust"] = g
                            daily_stats[d]["gust_city"] = v
                    except Exception:
                        pass
                p_str = r.get("precipitation", "")
                if p_str:
                    try:
                        city_rain[d][v] += float(p_str)
                    except Exception:
                        pass
        for d, cdict in city_rain.items():
            for v, tot in cdict.items():
                if tot > daily_stats[d]["max_rain"]:
                    daily_stats[d]["max_rain"] = tot
                    daily_stats[d]["rain_city"] = v
    except Exception as e:
        log(f"⚠️ Erreur lecture hourly CSV : {e}")
    return daily_stats

def generate_script_from_data(zone, cards, api_key, maps_dir):
    """
    RÉDACTION BTP PRO EXPERT À PARTIR DE J+1 (DEMAIN) :
    Lit les prévisions officielles quotidiennes et horaires (Vent, Rafales, Pluie, Températures)
    et génère le script oral broadcast de Patrick Marlière pour les chantiers.
    """
    zone_title = "la France entière" if zone == "france" else "les Hauts-de-France"
    csv_file = find_forecast_csv(zone, maps_dir)
    hourly_stats = load_hourly_btp_stats(zone, maps_dir)

    summary_lines = []
    if csv_file and os.path.exists(csv_file):
        log(f"📊 Lecture des prévisions officielles dans {os.path.basename(csv_file)} (COMMENCE À J+1)...")
        data_by_date = {}
        with open(csv_file, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f, delimiter=";")
            for row in reader:
                d = row.get("Date", "")
                if d not in data_by_date:
                    data_by_date[d] = []
                data_by_date[d].append(row)

        all_dates = list(data_by_date.keys())
        today_str = datetime.now().strftime("%d/%m/%Y")
        if all_dates and all_dates[0] == today_str:
            target_dates = all_dates[1:8]
        else:
            target_dates = all_dates[:7]

        # Découpage géographique par bassins pour une rotation variée à chaque jour
        if zone == "france":
            regional_pools = [
                ["PARIS", "LILLE", "ROUEN", "AMIENS", "REIMS"],
                ["BREST", "RENNES", "NANTES", "LA ROCHELLE", "CHERBOURG"],
                ["BORDEAUX", "TOULOUSE", "BIARRITZ", "AGEN", "TARBES"],
                ["MARSEILLE", "NICE", "MONTPELLIER", "PERPIGNAN", "AJACCIO", "BASTIA"],
                ["STRASBOURG", "LYON", "METZ", "BOURGES", "TOURS", "VICHY", "AURILLAC"]
            ]
        else:
            regional_pools = [
                ["Dunkerque", "Calais", "Boulogne-sur-Mer", "Berck"],
                ["Lille", "Arras", "Valenciennes", "Cambrai", "Hazebrouck"],
                ["Amiens", "Beauvais", "Abbeville", "Compiègne", "Senlis"],
                ["Saint-Quentin", "Château-Thierry", "Laon", "Soissons", "Vervins"]
            ]

        french_days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
        for idx, d in enumerate(target_dates):
            rows = data_by_date[d]
            rows_dict = {r.get("Ville", "").strip(): r for r in rows}

            # Extrêmes stricts (ville la plus basse et ville la plus haute)
            row_min_matin = min(rows, key=lambda r: float(r.get("temperature_2m_min", 99)))
            row_max_matin = max(rows, key=lambda r: float(r.get("temperature_2m_min", -99)))
            row_min_aprem = min(rows, key=lambda r: float(r.get("temperature_2m_max", 99)))
            row_max_aprem = max(rows, key=lambda r: float(r.get("temperature_2m_max", -99)))

            # Rotation des villes par bassin
            selected_rows = []
            for pool_idx, pool in enumerate(regional_pools):
                city_name = pool[(idx + pool_idx) % len(pool)]
                if city_name in rows_dict:
                    selected_rows.append(rows_dict[city_name])

            temps_list = list(dict.fromkeys(r.get("Temps_Label", "") for r in rows if r.get("Temps_Label")))
            temps_str = ", ".join(temps_list[:3]) if temps_list else "Variable"

            try:
                dt = datetime.strptime(d, "%d/%m/%Y")
                day_name = french_days[dt.weekday()]
                date_label = f"{day_name} {dt.day} ({'DEMAIN' if idx == 0 else f'J+{idx+1}'})"
            except Exception:
                date_label = d

            # Formatage clair sans "°C" avec arrondi arithmétique identique aux cartes Leaflet (Math.round)
            def fmt_deg(val, default_val=15):
                try:
                    return str(math.floor(float(val) + 0.5))
                except Exception:
                    return str(default_val)

            f_matin = f"{row_min_matin.get('Ville','')} ({fmt_deg(row_min_matin.get('temperature_2m_min'), 10)} degrés)"
            d_matin = f"{row_max_matin.get('Ville','')} ({fmt_deg(row_max_matin.get('temperature_2m_min'), 18)} degrés)"
            f_aprem = f"{row_min_aprem.get('Ville','')} ({fmt_deg(row_min_aprem.get('temperature_2m_max'), 18)} degrés)"
            c_aprem = f"{row_max_aprem.get('Ville','')} ({fmt_deg(row_max_aprem.get('temperature_2m_max'), 30)} degrés)"

            other_cities_aprem = [f"{r.get('Ville','')}: {fmt_deg(r.get('temperature_2m_max'), 20)} degrés" for r in selected_rows[:3]]
            other_cities_matin = [f"{r.get('Ville','')}: {fmt_deg(r.get('temperature_2m_min'), 12)} degrés" for r in selected_rows[:3]]

            # Données de vent et pluie horaires réelles
            h_stat = hourly_stats.get(d, {})
            vent_detail = ""
            if h_stat.get("max_gust", 0) >= 35:
                vent_detail = f" | RAFALES CHANTIERS : pic à {h_stat['max_gust']:.0f} km/h à {h_stat['gust_city']} (vigilance grues et levage)"
            else:
                vent_detail = " | VENT : calme sous 35 km/h"

            pluie_detail = ""
            if h_stat.get("max_rain", 0) >= 1.0:
                pluie_detail = f" | PLUIE : cumul jusqu'à {h_stat['max_rain']:.0f} mm vers {h_stat['rain_city']} (vigilance terrassement/béton)"
            else:
                pluie_detail = " | PLUIE : temps sec (idéal enrobés/maçonnerie)"

            # Pour J+1, on génère deux entrées : Carte 1 (Matin) et Carte 2 (Après-midi)
            if idx == 0:
                summary_lines.append(
                    f"- CARTE 1 (DEMAIN MATIN {date_label}) : ATTENTION, cette carte affiche STRICTEMENT les températures du MATIN. "
                    f"Ciel = {temps_str}{vent_detail} | "
                    f"Sur cette carte matinale : la ville la plus fraîche = {f_matin}, la plus douce = {d_matin} | "
                    f"Autres repères matinaux : {', '.join(other_cities_matin)}"
                )
                summary_lines.append(
                    f"- CARTE 2 (DEMAIN APRÈS-MIDI {date_label}) : ATTENTION, cette carte affiche STRICTEMENT les températures de l'APRÈS-MIDI. "
                    f"Ciel = {temps_str}{vent_detail}{pluie_detail} | "
                    f"Sur cette carte d'après-midi : la ville la plus fraîche = {f_aprem}, la plus chaude = {c_aprem} | "
                    f"Autres repères de l'après-midi : {', '.join(other_cities_aprem)}"
                )
            else:
                card_num = idx + 2
                summary_lines.append(
                    f"- CARTE {card_num} ({date_label} APRÈS-MIDI) : ATTENTION, cette carte affiche STRICTEMENT les températures de l'APRÈS-MIDI. "
                    f"Ciel = {temps_str}{vent_detail}{pluie_detail} | "
                    f"Sur cette carte d'après-midi : la ville la plus fraîche = {f_aprem}, la plus chaude = {c_aprem} | "
                    f"Autres repères de l'après-midi : {', '.join(other_cities_aprem)}"
                )
    else:
        log("ℹ️ Fichier CSV non trouvé, utilisation des tendances saisonnières...")
        summary_lines = [f"- 7 jours de prévisions à partir de demain sur {zone_title}"]

    prompt_text = f"""Tu es Patrick Marlière, météorologue expert officiel pour Météo-Climat Pro et Météo BTP.
Tu rédiges le script oral complet d'un bulletin météo TV broadcast professionnel de très haute précision technique, destiné aux professionnels du BTP (chefs de chantier, artisans, conducteurs de travaux, compagnons) pour {zone_title}.
RÈGLE ABSOLUE : Le bulletin commence TOUJOURS à J+1 (DEMAIN) et s'adresse directement aux équipes sur le terrain.

Voici la fiche technique DÉTAILLÉE CARTE PAR CARTE (les températures indiquées correspondent EXACTEMENT aux chiffres dessinés sur chaque carte) :
{chr(10).join(summary_lines)}

EXIGENCES ÉDITORIALES BTP DE HAUTE PRÉCISION :
1. ACCROCHE TV NATURELLE ET FLUIDE (OBLIGATOIRE) :
   - La Phrase 1 DOIT impérativement commencer exactement par :
     "Voici votre bulletin météo BTP. On commence dès demain matin, [Nom du jour et date, ex: samedi 26 septembre], avec..."
2. COHÉRENCE TOTALE AVEC LES CARTES (RÈGLE INVIOLABLE) :
   - Pour la Carte 1 (seule carte du matin) : cite UNIQUEMENT les températures matinales indiquées sous la CARTE 1 !
   - Pour les Cartes 2 à 8 (toutes d'après-midi) : cite UNIQUEMENT les températures de l'après-midi indiquées sous chaque carte ! Ne cite JAMAIS une température matinale sur une carte d'après-midi. Le téléspectateur doit entendre mot pour mot ce qu'il a sous les yeux !
3. BAN ABSOLU DU MOT 'CELSIUS' (RÈGLE INVIOLABLE) :
   - Ne dis JAMAIS "degrés Celsius" ni "Celsius" ! Dis uniquement "degrés" ou le chiffre brut (ex: "6 degrés", "19 degrés", "34 degrés"). N'écris jamais le symbole °C.
4. CITATION SYSTÉMATIQUE DES EXTRÊMES (LE PLUS BAS ET LE PLUS HAUT) SUR CHAQUE CARTE :
   - Pour CHAQUE carte météo (cartes 1 à 8), tu DOIS obligatoirement citer :
     * La ville où il fait LE PLUS FRAIS sur la carte
     * La ville où il fait LE PLUS CHAUD sur la carte (pic de chaleur)
     * Et une autre ville parmi les repères proposés.
5. PRÉCISION CHIFFRÉE SUR LE VENT ET LES RAFALES (CRITIQUE POUR LES GRUES ET LA SÉCURITÉ) :
   - Dès que des rafales supérieures à 40-50 km/h sont mentionnées dans la fiche, cite OBLIGATOIREMENT la vitesse en km/h et la ville concernée avec le conseil sécurité BTP (arrêt des grues, vigilance toitures/échafaudages).
6. CONSEILS MÉTIERS BTP :
   - Relie les conditions météo aux chantiers : coulage de béton, séchage, terrassement, étanchéité, hydratation face aux fortes chaleurs à plus de 30 degrés.
7. LONGUEUR PAR CARTE :
   - Entre 28 et 38 mots par phrase/carte. Diction posée, professionnelle et percutante.

Structure des {len(cards)} phrases dans l'ordre EXACT :
- Phrase 1 (CARTE 1 : Matin) : "Voici votre bulletin météo BTP. On commence dès demain matin, [jour et date], avec..." + ville la plus fraîche et la plus douce du matin + vent.
- Phrase 2 (CARTE 2 : Après-midi) : Conditions de l'après-midi + ville la plus fraîche et pic de chaleur + rafales éventuelles.
- Phrases 3 à 8 (CARTES 3 à 8 : Après-midi des jours suivants) : Nom du jour bien mis en avant + analyse technique chantier (vent, pluie/sec) + ville la plus fraîche et la plus chaude de l'après-midi.
- Phrase 9 (CARTE 9 : Éphéméride & Clôture) : Heure de coucher du soleil / fin de journée chantier, fête du jour, et mot de conclusion chaleureux signé Météo BTP et Météo-Climat Pro.

Réponds UNIQUEMENT par un tableau JSON de {len(cards)} chaînes de caractères :
["phrase 1", "phrase 2", ..., "phrase {len(cards)}"]. Aucun autre texte."""

    # Préparation du contenu : Hybride Vision pour la France, Données seules pour HDF
    if zone == "france":
        log("👁️ Mode Hybride Vision activé pour la France (analyse visuelle des 9 cartes + données CSV)...")
        content_parts = [
            {
                "type": "text",
                "text": prompt_text + "\n\nTu as sous les yeux les 9 images des cartes dans le même ordre strict (Image 1 = Carte 1 matin, Image 2 = Carte 2 après-midi, etc.). Observe bien les contrastes visuels, l'emplacement des masses d'air, des nuages et des éclaircies pour un commentaire télévisé parfait !"
            }
        ]
        for idx, card in enumerate(cards, 1):
            p = card["path"]
            if os.path.exists(p):
                try:
                    im = Image.open(p)
                    im.thumbnail((800, 450))
                    buf = io.BytesIO()
                    im.save(buf, format="JPEG", quality=75)
                    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
                    content_parts.append({
                        "type": "text",
                        "text": f"--- CARTE {idx} : {card['label']} ---"
                    })
                    content_parts.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64}"}
                    })
                except Exception as e:
                    log(f"⚠️ Impossible d'encoder l'image {card['label']} : {e}")

        payload = {
            "model": "google/gemini-2.5-flash",
            "messages": [{"role": "user", "content": content_parts}]
        }
    else:
        payload = {
            "model": "google/gemini-2.5-flash",
            "messages": [{"role": "user", "content": prompt_text}]
        }

    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            raw = data["choices"][0]["message"]["content"].strip()
            # Nettoyage des balises markdown éventuelles
            if "```" in raw:
                parts = raw.split("```")
                raw = parts[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()

            # Nettoyer les backslashes invalides avant les caractères comme les apostrophes
            raw_cleaned = re.sub(r'\\([^"\\/bfnrtu])', r'\1', raw)

            try:
                phrases = json.loads(raw_cleaned, strict=False)
            except Exception:
                phrases = json.loads(raw, strict=False)

            if isinstance(phrases, list) and len(phrases) == len(cards):
                log("✅ Script oral enrichi et détaillé (démarrant à J+1) généré instantanément !")
                return phrases
            else:
                log(f"⚠️ Nombre de phrases inattendu ({len(phrases) if isinstance(phrases, list) else 'non-liste'}) vs {len(cards)} cartes")

    except Exception as e:
        log(f"⚠️ Erreur génération script texte : {e}")

    # Fallback propre à J+1
    return [
        f"Bonjour à tous ! Demain matin, réveil calme et contrasté sur {zone_title}.",
        f"Pour votre après-midi de demain, le temps s'annonce agréable avec de belles éclaircies.",
        f"Dimanche, une très belle journée lumineuse et agréable pour vos sorties.",
        f"Lundi, quelques passages nuageux et ondées locales par l'ouest.",
        f"Mardi, retour d'une grande douceur généralisée sous un ciel clément.",
        f"Mercredi, ciel partagé avec quelques averses passagères.",
        f"Jeudi, atmosphère plus fraîche et nébulosité de saison.",
        f"Vendredi prochain, poursuite de conditions automnales calmes.",
        "Très belle journée à tous et excellente suite de vos programmes avec Météo-Climat Pro !"
    ]

def clean_for_speech(text):
    """Bannit formellement la prononciation du mot 'celsius' et nettoie les symboles"""
    t = re.sub(r'°C\b', ' degrés', text)
    t = re.sub(r'°\b', ' degrés', t)
    t = re.sub(r'degrés\s+[cC]elsius', 'degrés', t)
    t = re.sub(r'degré\s+[cC]elsius', 'degré', t)
    t = re.sub(r'\b[cC]elsius\b', '', t)
    t = t.replace('°C', ' degrés').replace('°', ' degrés')
    return t.strip()

def tts_charon(text, output_wav, api_key):
    """Synthèse vocale Gemini 3.8 Flash-Lite TTS (voix Charon) avec fallback transparent Edge-TTS (Henri)"""
    clean_text = clean_for_speech(text)

    # 1. Tentative OpenRouter Gemini Charon TTS
    if api_key:
        try:
            url = "https://openrouter.ai/api/v1/audio/speech"
            payload = {
                "model": "google/gemini-3.8-flash-lite-tts",
                "input": clean_text,
                "voice": "Charon",
                "language": "fr-FR",
                "instructions": "Voix de présentateur météo professionnel expert pour le secteur du BTP et grand public. Prononciation avec un accent français métropolitain standard (parisien), diction parfaitement articulée sur les noms de villes françaises et régionales (notamment Ajaccio prononcé [a-jak-sio], Bastia, etc.), ton dynamique, direct, sérieux et chaleureux, sans aucun accent étranger. Ne prononce JAMAIS le mot 'celsius', dis toujours 'degrés'."
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://meteoclimatpro.fr",
                    "X-Title": "Meteo Climat Pro",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            )
            with urllib.request.urlopen(req, timeout=35) as resp:
                pcm = resp.read()

            with wave.open(output_wav, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(24000)
                wf.writeframes(pcm)
            log("🎙️ ✅ Synthèse vocale Gemini 3.8 Flash-Lite TTS (voix Charon) générée via OpenRouter !")
            return
        except Exception as e:
            log(f"⚠️ OpenRouter TTS ({e}) -> Bascule sur Edge-TTS (Henri)...")

    # 2. Fallback robuste 100% gratuit / Zero-Token / Zero-Quota via edge-tts (HenriNeural)
    try:
        import asyncio, edge_tts
        tmp_mp3 = output_wav.replace(".wav", "_temp.mp3")
        async def run_edge():
            comm = edge_tts.Communicate(clean_text, voice="fr-FR-HenriNeural", rate="+2%")
            await comm.save(tmp_mp3)
        asyncio.run(run_edge())
        subprocess.run([
            "ffmpeg", "-y", "-i", tmp_mp3,
            "-ar", "24000", "-ac", "1", output_wav
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if os.path.exists(tmp_mp3):
            os.remove(tmp_mp3)
    except Exception as e_edge:
        log(f"❌ Erreur critique TTS : {e_edge}")
        raise

def compile_video(zone, cards, script_phrases, output_path, music_path, api_key, temp_dir, orientation="landscape"):
    """Compile la vidéo avec audio Charon sans temps mort au format Paysage (16:9) ou Portrait (9:16)"""
    os.makedirs(temp_dir, exist_ok=True)
    n_cards = len(cards)
    zone_label = "FRANCE" if zone == "france" else "HAUTS-DE-FRANCE"
    orient_label = "PAYSAGE 16:9 (1920x1080)" if orientation == "landscape" else "PORTRAIT 9:16 (1080x1920)"
    log(f"🎬 Compilation {zone_label} [{orient_label}] ({n_cards} cartes météo fixes)...")

    if orientation == "landscape":
        w, h = 1920, 1080
        filter_str = "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080"
    else:
        w, h = 1080, 1920
        filter_str = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"

    # 1. Synthèse vocale & mesure audio
    log("🎙️ [1/3] Synthèse vocale continue avec la voix Charon...")
    audio_clips = []
    durations = []

    for i in range(n_cards):
        raw_wav = os.path.join(temp_dir, f"raw_{i:02d}.wav")
        norm_wav = os.path.join(temp_dir, f"norm_{i:02d}.wav")
        text = script_phrases[i]

        tts_charon(text, raw_wav, api_key)

        cmd_norm = [
            "ffmpeg", "-y", "-i", raw_wav,
            "-filter:a", "atempo=1.02,loudnorm=I=-14.5:LRA=7:TP=-1.5",
            "-ar", "24000", norm_wav
        ]
        subprocess.run(cmd_norm, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        with wave.open(norm_wav, "rb") as wf:
            dur = round(wf.getnframes() / wf.getframerate(), 2)

        durations.append(dur)
        audio_clips.append(norm_wav)
        log(f"   Carte {i+1} ({dur}s) : {text}")

    total_duration = sum(durations)
    log(f"⏱️ Durée totale prévue : {total_duration:.2f}s (~{int(total_duration//60)}m{int(total_duration%60):02d}s)")

    # 2. Clips vidéo calés sur la voix
    log(f"🖼️ [2/3] Encodage des cartes fixes ({ENCODER})...")
    video_clips = []
    for i in range(n_cards):
        dur = durations[i]
        card_img = cards[i]["path"]
        clip_path = os.path.join(temp_dir, f"card_{i:02d}.mp4")

        cmd_v = [
            "ffmpeg", "-y", "-loop", "1", "-i", card_img,
            "-t", str(dur),
            "-vf", f"{filter_str},fps={FPS},format=yuv420p",
            "-c:v", ENCODER, "-b:v", "6M", "-an", clip_path
        ]
        subprocess.run(cmd_v, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        video_clips.append(clip_path)

    # 3. Assemblage & Mixage musique de fond (-14.5 LUFS)
    log("🎵 [3/3] Concaténation et mixage final...")
    vlist = os.path.join(temp_dir, "vlist.txt")
    with open(vlist, "w", encoding="utf-8") as f:
        for v in video_clips:
            f.write(f"file '{v.replace(chr(92), '/')}'\n")

    raw_video = os.path.join(temp_dir, "combined_video.mp4")
    subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", vlist,
                    "-c", "copy", raw_video], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    alist = os.path.join(temp_dir, "alist.txt")
    with open(alist, "w", encoding="utf-8") as f:
        for a in audio_clips:
            f.write(f"file '{a.replace(chr(92), '/')}'\n")

    voice_wav = os.path.join(temp_dir, "voice_continuous.wav")
    subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", alist,
                    "-c", "copy", voice_wav], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    final_audio = os.path.join(temp_dir, "final_audio.aac")
    if music_path and os.path.exists(music_path):
        fade_out = max(1, int(total_duration) - 3)
        cmd_mix = [
            "ffmpeg", "-y", "-i", voice_wav,
            "-stream_loop", "-1", "-i", music_path,
            "-filter_complex",
            f"[1:a]volume=0.06,afade=t=in:ss=0:d=1.0,afade=t=out:st={fade_out}:d=3[bgm];"
            f"[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2,loudnorm=I=-14.5:LRA=11:TP=-1.5[aout]",
            "-map", "[aout]", "-c:a", "aac", "-b:a", "192k", final_audio
        ]
    else:
        cmd_mix = ["ffmpeg", "-y", "-i", voice_wav, "-c:a", "aac", "-b:a", "192k", final_audio]
    subprocess.run(cmd_mix, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Rendu final
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    cmd_final = [
        "ffmpeg", "-y", "-i", raw_video, "-i", final_audio,
        "-map", "0:v", "-map", "1:a",
        "-c:v", "copy", "-c:a", "copy",
        "-shortest", output_path
    ]
    subprocess.run(cmd_final, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    log(f"🎉 SUCCÈS : {output_path} ({size_mb:.2f} Mo, {total_duration:.2f}s)")

    try:
        shutil.rmtree(temp_dir)
    except Exception:
        pass
    return durations

def main():
    parser = argparse.ArgumentParser(description="Générateur Automatique de Bulletins Vidéo (Météo-Climat Pro)")
    parser.add_argument("--zone", choices=["france", "hdf", "both"], default="both",
                        help="Zone à générer : france, hdf, ou both (défaut)")
    parser.add_argument("--orientation", choices=["landscape", "portrait"], default="landscape",
                        help="Orientation de la vidéo : landscape (Paysage 16:9, défaut) ou portrait (TikTok 9:16)")
    parser.add_argument("--maps-dir", default=None, help="Dossier contenant les cartes météo")
    parser.add_argument("--output-dir", default=None, help="Dossier de sortie pour les vidéos")
    args = parser.parse_args()

    api_key = get_api_key()
    if not api_key:
        log("❌ ERREUR : La variable d'environnement OPENROUTER_API_KEY est manquante !")
        sys.exit(1)

    maps_dir = find_maps_dir(args.maps_dir)
    music_path = find_music_path()

    cur_dir = os.path.dirname(os.path.abspath(__file__))
    if args.output_dir:
        output_dir = args.output_dir
    else:
        output_dir = os.path.join(cur_dir, "output_bulletins")
    os.makedirs(output_dir, exist_ok=True)

    today_str = datetime.now().strftime("%d_%m_%Y")
    zones = ["france", "hdf"] if args.zone == "both" else [args.zone]

    for z in zones:
        log("=" * 70)
        cards = collect_cards(z, maps_dir, args.orientation)
        if len(cards) < 3:
            log(f"❌ Trop peu de cartes trouvées pour {z} ({len(cards)} cartes) dans {maps_dir}. Génération annulée.")
            continue

        phrases = generate_script_from_data(z, cards, api_key, maps_dir)
        orient_tag = "paysage" if args.orientation == "landscape" else "tiktok"
        out_name = f"bulletin_{orient_tag}_{z}.mp4"
        out_path = os.path.join(output_dir, out_name)
        temp_dir = os.path.join(cur_dir, f"tmp_{orient_tag}_{z}")

        compile_video(z, cards, phrases, out_path, music_path, api_key, temp_dir, args.orientation)

        # Copie directe sur le Bureau de Grégory
        desktop = r"C:\Users\grego\Desktop"
        if os.path.exists(desktop):
            try:
                dest_desktop = os.path.join(desktop, f"BULLETIN_{orient_tag.upper()}_METEO_CLIMAT_PRO_{z.upper()}_{today_str}.mp4")
                shutil.copy2(out_path, dest_desktop)
                log(f"📋 Copie livrée sur le Bureau : {dest_desktop}")
            except Exception as e:
                log(f"ℹ️ Info copie Bureau : {e}")

    log("=" * 70)
    log("🏁 TOUS LES BULLETINS DEMANDÉS ONT ÉTÉ GÉNÉRÉS AVEC SUCCÈS !")

if __name__ == "__main__":
    main()
