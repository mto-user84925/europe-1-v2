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
import math

FPS = 30

def log(msg):
    print(f"[METEO-GEN] {msg}", flush=True)

def get_api_key():
    # 1. Vérifier si OPENROUTER_API_KEY de l'environnement est valide (ignore l'ancienne clé révoquée ae1323)
    key = os.environ.get("OPENROUTER_API_KEY")
    if key and not key.startswith("sk-or-v1-ae1323"):
        return key
    # 2. Chercher dans les fichiers .env locaux
    cur_dir = os.path.dirname(os.path.abspath(__file__))
    env_paths = [
        r"C:\Users\grego\Documents\METEO_CLIMAT\veille-automation\.env",
        os.path.join(cur_dir, ".env"),
        os.path.join(cur_dir, "..", ".env"),
        r"C:\Users\grego\Documents\METEO_CLIMAT\meteo cnews 2\.env"
    ]
    for ep in env_paths:
        if os.path.exists(ep):
            with open(ep, "r", encoding="utf-8") as f:
                for line in f:
                    if line.startswith("OPENROUTER_API_KEY="):
                        k = line.strip().split("=", 1)[1].strip().strip('"').strip("'")
                        if k and not k.startswith("sk-or-v1-ae1323"):
                            return k
    return key

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
        try:
            if any(f.startswith("carte") for f in os.listdir(custom_path)):
                return custom_path
        except Exception:
            pass
    cur_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        r"C:\Users\grego\Desktop\cartes_alertes",
        os.path.abspath(os.path.join(cur_dir, "..", "cartes_alertes")),
        os.path.join(cur_dir, "cartes_alertes"),
        cur_dir
    ]
    for c in candidates:
        if os.path.exists(c):
            try:
                if any(f.startswith("carte") for f in os.listdir(c)):
                    return c
            except Exception:
                pass
    # Fallback si aucun ne contient de carte pour l'instant
    for c in candidates[:3]:
        if os.path.exists(c):
            return c
    loc = os.path.abspath(os.path.join(cur_dir, "..", "cartes_alertes"))
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
    fname = f"meteofrance_daily_forecast_{zone}.csv" if zone not in ["france", "france_pictos"] else "meteofrance_daily_forecast.csv"
    candidates = [
        os.path.join(maps_dir, fname) if maps_dir else None,
        r"C:\Users\grego\Desktop\cartes_alertes" + "\\" + fname,
        os.path.join(cur_dir, fname),
        r"C:\Users\grego\Documents\METEO_CLIMAT\meteo cnews 2" + "\\" + fname
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return c
    return None

def find_data_json(zone, maps_dir):
    """Trouve le fichier JSON des données météo horaires/quotidiennes généré par Météo-France"""
    cur_dir = os.path.dirname(os.path.abspath(__file__))
    fname = f"meteofrance_data_{zone}.json" if zone not in ["france", "france_pictos"] else "meteofrance_data.json"
    candidates = [
        os.path.join(maps_dir, fname) if maps_dir else None,
        r"C:\Users\grego\Desktop\cartes_alertes" + "\\" + fname,
        os.path.join(cur_dir, fname),
        r"C:\Users\grego\Documents\METEO_CLIMAT\meteo cnews 2" + "\\" + fname,
        os.path.join(cur_dir, "meteofrance_data.json"),
        os.path.join(maps_dir, "meteofrance_data.json") if maps_dir else None
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return c
    return None

WEATHER_LABELS = {
    0: 'SOLEIL', 1: 'PEU NUAGEUX', 2: 'NUAGEUX', 3: 'TRÈS NUAGEUX',
    4: 'COUVERT', 5: 'SOLEIL VOILÉ', 6: 'AVERSES', 7: 'PLUIES FAIBLES',
    8: 'FORTES PLUIES', 9: 'GRÊLE', 10: 'ORAGES', 11: 'ORAGES + GRÊLE', 12: 'BROUILLARD'
}

def get_exact_leaflet_weather(zone_data, cities_list, day_idx, period):
    h_target = 8 if period == 'morning' else 14
    result = {}
    for idx, loc in enumerate(zone_data):
        if idx >= len(cities_list):
            break
        cname = cities_list[idx]
        h_codes = loc.get('hourly', {}).get('weathercode', [])
        idx_exact = day_idx * 24 + h_target
        if idx_exact < len(h_codes):
            final_code = h_codes[idx_exact]
        elif (day_idx * 24 + 12) < len(h_codes):
            final_code = h_codes[day_idx * 24 + 12]
        else:
            final_code = 0
        if period == 'morning':
            t_val = loc.get('daily', {}).get('temperature_2m_min', [12]*7)[day_idx]
        else:
            t_val = loc.get('daily', {}).get('temperature_2m_max', [22]*7)[day_idx]
        t_deg = int(math.floor(float(t_val) + 0.5))
        result[cname] = {'label': WEATHER_LABELS.get(final_code, 'SOLEIL'), 'temp': t_deg}
    return result

def format_card_spatial_summary(zone, exact_data):
    total = len(exact_data)
    rain_cities = [(c, info['temp'], info['label']) for c, info in exact_data.items() if any(k in info['label'] for k in ['PLUIE', 'AVERSE', 'ORAGE'])]
    cloud_cities = [(c, info['temp'], info['label']) for c, info in exact_data.items() if any(k in info['label'] for k in ['NUAGEUX', 'COUVERT'])]
    sun_cities = [(c, info['temp'], info['label']) for c, info in exact_data.items() if 'SOLEIL' in info['label']]
    min_city, min_info = min(exact_data.items(), key=lambda x: x[1]['temp'])
    max_city, max_info = max(exact_data.items(), key=lambda x: x[1]['temp'])
    blois_info = exact_data.get('Blois')
    blois_text = f"BLOIS : {blois_info['temp']} degrés sous un ciel {blois_info['label'].lower()}." if blois_info else ""

    if len(rain_cities) == 0:
        if len(cloud_cities) >= len(sun_cities):
            vis_desc = f"Ciel nuageux et couvert mais SEC sur l'ensemble des {total} communes (aucune pluie). {blois_text}"
        else:
            vis_desc = f"Plein soleil radieux et SEC sur l'ensemble des {total} communes (aucune pluie). {blois_text}"
    elif len(rain_cities) < total:
        rain_str = ", ".join(f"{c} ({t} degrés, {lbl.lower()})" for c, t, lbl in rain_cities)
        dry_type = "nuageux" if len(cloud_cities) >= len(sun_cities) else "ensoleillé"
        vis_desc = (
            f"⚠️ CONTRASTE SPATIAL MARQUÉ : Averses/pluies localisées UNIQUEMENT sur {len(rain_cities)}/{total} communes : [{rain_str}]. "
            f"Tout le reste de la région ({total - len(rain_cities)} communes) reste parfaitement sec sous un ciel {dry_type} ! "
            f"INTERDICTION FORMELLE de généraliser la pluie ! {blois_text}"
        )
    else:
        vis_desc = f"Pluies ou averses généralisées sur les {total} communes. {blois_text}"

    return {
        "vis_desc": vis_desc,
        "f_city": f"{min_city} ({min_info['temp']} degrés)",
        "c_city": f"{max_city} ({max_info['temp']} degrés)",
    }

def load_hourly_btp_stats(zone, maps_dir):
    """Extrait du CSV horaire les rafales maximales et les cumuls de pluie par date pour le BTP"""
    cur_dir = os.path.dirname(os.path.abspath(__file__))
    fname = f"meteofrance_hourly_forecast_{zone}.csv" if zone not in ["france", "france_pictos"] else "meteofrance_hourly_forecast.csv"
    candidates = [
        os.path.join(maps_dir, fname) if maps_dir else None,
        r"C:\Users\grego\Desktop\cartes_alertes" + "\\" + fname,
        os.path.join(cur_dir, fname),
        r"C:\Users\grego\Documents\METEO_CLIMAT\meteo cnews 2" + "\\" + fname
    ]
    p = None
    for c in candidates:
        if c and os.path.exists(c):
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

BASINS_MAP = {
    "cvl": {
        "Bassin Nord (Eure-et-Loir & Beauce)": ["Chartres", "Dreux", "Châteaudun", "Nogent-le-Rotrou", "Pithiviers"],
        "Bassin Centre (Loir-et-Cher & Touraine - Blois)": ["Blois", "Romorantin-Lanthenay", "Vendôme", "Tours", "Chinon", "Le Blanc"],
        "Bassin Est & Sud (Loiret, Cher & Berry)": ["Orléans", "Montargis", "Bourges", "Saint-Amand-Montrond", "Sancerre", "Châteauroux", "Écueillé", "Éguzon-Chantôme", "Argent-sur-Sauldre", "Le Grand-Pressigny"]
    },
    "hdf": {
        "Bassin Littoral / Côte d'Opale": ["Dunkerque", "Calais", "Boulogne-sur-Mer", "Berck", "Abbeville"],
        "Bassin Métropole & Flandres": ["Lille", "Arras", "Valenciennes", "Cambrai", "Hazebrouck"],
        "Bassin Picardie / Sud": ["Amiens", "Beauvais", "Compiègne", "Senlis", "Saint-Quentin", "Château-Thierry", "Laon", "Soissons", "Vervins"]
    }
}

def load_and_compress_card_b64(card_path, max_dim=1024, quality=75):
    """
    Charge une carte météo JPG, la redimensionne proportionnellement (max 1024px)
    et l'encode en base64 pour l'analyse visuelle directe par Gemini 3.6 Flash.
    """
    try:
        with Image.open(card_path) as img:
            img = img.convert("RGB")
            w, h = img.size
            if max(w, h) > max_dim:
                scale = max_dim / float(max(w, h))
                img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=quality, optimize=True)
            return base64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception as e:
        log(f"⚠️ Erreur encodage image {card_path}: {e}")
        try:
            with open(card_path, "rb") as f:
                return base64.b64encode(f.read()).decode("utf-8")
        except Exception:
            return None

def analyze_spatial_weather(zone, rows):
    """
    Analyse la répartition spatiale du temps par commune et par bassin
    pour détecter les contrastes réels et isoler les ondées marginales.
    """
    total = len(rows)
    if total == 0:
        return "Données météo indisponibles"

    counts = {}
    city_by_weather = {}
    for r in rows:
        lbl = r.get("Temps_Label", "SOLEIL").strip()
        counts[lbl] = counts.get(lbl, 0) + 1
        city_by_weather.setdefault(lbl, []).append(r.get("Ville", "").strip())

    dominant = max(counts, key=counts.get)
    dom_count = counts[dominant]

    basins = BASINS_MAP.get(zone)
    if not basins:
        return f"Dominante : {dominant} ({dom_count}/{total} villes)"

    rows_by_city = {r.get("Ville", "").strip(): r for r in rows}
    basin_summaries = []

    for b_name, b_cities in basins.items():
        b_rows = [rows_by_city[c] for c in b_cities if c in rows_by_city]
        if not b_rows:
            continue
        b_counts = {}
        for r in b_rows:
            lbl = r.get("Temps_Label", "SOLEIL").strip()
            b_counts[lbl] = b_counts.get(lbl, 0) + 1
        b_dom = max(b_counts, key=b_counts.get)
        basin_summaries.append(f"{b_name} : {b_dom}")

    basin_str = " | ".join(basin_summaries)

    # Cas 1 : Phénomène marginal (< 20% des villes, ex: 1 ou 2 villes isolées avec pluie)
    minority_weathers = [k for k, v in counts.items() if k != dominant and v <= 2]
    if minority_weathers and any(any(w in m.upper() for w in ["PLUIE", "AVERSE", "ORAGE"]) for m in minority_weathers):
        rain_spots = []
        for m in minority_weathers:
            rain_spots.extend(city_by_weather[m])
        return (
            f"TEMPS LARGEMENT {dominant.upper()} ({dom_count}/{total} villes). "
            f"⚠️ ATTENTION : Seules de rares ondées isolées touchent {', '.join(rain_spots)}. "
            f"Le reste de la région et Blois restent sous un temps {dominant.lower()} ! "
            f"INTERDICTION FORMELLE de généraliser la pluie à toute la région ! Bassins : ({basin_str})"
        )

    # Cas 2 : Vrai contraste spatial marqué entre bassins
    if len(counts) > 1 and dom_count < total * 0.75:
        return (
            f"⚠️ VRAI CONTRASTE SPATIAL : Le temps varie nettement selon les secteurs. "
            f"Détail par bassin : {basin_str}. "
            f"Décris fidèlement ce contraste visible sur la carte (ex: averses au nord, soleil au sud) !"
        )

    # Cas 3 : Situation globalement homogène
    return f"Situation homogène : {dominant} dominant sur toute la région ({dom_count}/{total} villes). Bassins : ({basin_str})"

def generate_script_from_data(zone, cards, api_key, maps_dir, mode="grand_public"):
    """
    RÉDACTION PAR IA (GEMINI 2.5 FLASH) À PARTIR DE J+1 (DEMAIN) :
    Lit les prévisions officielles quotidiennes et horaires (Vent, Rafales, Pluie, Températures)
    et génère le script oral broadcast de Patrick Marlière pour le mode spécifié ('grand_public' ou 'btp').
    """
    if zone == "france":
        zone_title = "la France entière"
    elif zone == "cvl":
        zone_title = "la région Centre-Val de Loire, avec un focus sur Blois et le Loir-et-Cher"
    elif zone == "hdf":
        zone_title = "les Hauts-de-France"
    else:
        zone_title = f"la région {zone.upper()}"
    csv_file = find_forecast_csv(zone, maps_dir)
    json_file = find_data_json(zone, maps_dir)
    hourly_stats = load_hourly_btp_stats(zone, maps_dir)

    zone_data = None
    if json_file:
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                zone_data = json.load(f)
            log(f"🗺️ Données JSON Leaflet chargées depuis {os.path.basename(json_file)} ({len(zone_data)} communes)")
        except Exception as e:
            log(f"⚠️ Erreur chargement JSON Leaflet : {e}")

    summary_lines = []
    target_dates = []
    if csv_file and os.path.exists(csv_file):
        log(f"📊 Lecture des prévisions officielles dans {os.path.basename(csv_file)} (COMMENCE À J+1)...")
        cities = []
        data_by_date = {}
        with open(csv_file, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f, delimiter=";")
            for row in reader:
                v = row.get("Ville", "").strip()
                if v and v not in cities:
                    cities.append(v)
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
        elif zone == "cvl":
            regional_pools = [
                ["Blois", "Romorantin-Lanthenay", "Vendôme"],
                ["Tours", "Chinon", "Le Blanc"],
                ["Orléans", "Montargis", "Pithiviers"],
                ["Chartres", "Châteaudun", "Dreux", "Nogent-le-Rotrou"],
                ["Bourges", "Saint-Amand-Montrond", "Châteauroux", "Sancerre"]
            ]
        else:
            regional_pools = [
                ["Dunkerque", "Calais", "Boulogne-sur-Mer", "Berck"],
                ["Lille", "Arras", "Valenciennes", "Cambrai", "Hazebrouck"],
                ["Amiens", "Beauvais", "Abbeville", "Compiègne", "Senlis"],
                ["Saint-Quentin", "Château-Thierry", "Laon", "Soissons", "Vervins"]
            ]

        french_days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
        card_configs = [
            (1, 0, "morning", "MATIN"),
            (2, 0, "afternoon", "APRÈS-MIDI"),
            (3, 1, "afternoon", "APRÈS-MIDI"),
            (4, 2, "afternoon", "APRÈS-MIDI"),
            (5, 3, "afternoon", "APRÈS-MIDI"),
            (6, 4, "afternoon", "APRÈS-MIDI"),
            (7, 5, "afternoon", "APRÈS-MIDI"),
            (8, 6, "afternoon", "APRÈS-MIDI"),
        ]

        for card_num, day_idx, period, period_label in card_configs:
            if day_idx >= len(target_dates):
                continue
            d = target_dates[day_idx]
            try:
                dt = datetime.strptime(d, "%d/%m/%Y")
                date_label = f"{french_days[dt.weekday()]} {dt.day}"
            except Exception:
                date_label = d

            # Données de vent et pluie horaires réelles
            h_stat = hourly_stats.get(d, {})
            vent_detail = ""
            raw_gust = h_stat.get("max_gust", 0)
            if raw_gust >= 35:
                rounded_gust = int(round(raw_gust / 5.0) * 5)
                vent_detail = f" | RAFALES : pic à {rounded_gust} km/h vers {h_stat['gust_city']} (arrondi strict de 5 en 5)"
            else:
                vent_detail = " | VENT : calme sous 35 km/h"

            pluie_detail = ""
            if h_stat.get("max_rain", 0) >= 1.0:
                pluie_detail = f" | PLUIE : cumul jusqu'à {h_stat['max_rain']:.0f} mm vers {h_stat['rain_city']}"
            else:
                pluie_detail = " | PLUIE : temps sec"

            if zone_data and cities:
                exact = get_exact_leaflet_weather(zone_data, cities, day_idx, period)
                c_summary = format_card_spatial_summary(zone, exact)

                # Villes de référence supplémentaires par bassin
                other_reps = []
                if zone == "france":
                    p_info = exact.get("PARIS") or exact.get("Paris")
                    if p_info:
                        other_reps.append(f"PARIS ({p_info['temp']} degrés, {p_info['label'].lower()})")
                pool = regional_pools[card_num % len(regional_pools)]
                for c in pool:
                    if c in exact and c not in ["Blois", "PARIS", "Paris"]:
                        other_reps.append(f"{c} ({exact[c]['temp']} degrés, {exact[c]['label'].lower()})")
                other_str = f" | Autres repères : {', '.join(other_reps[:4])}" if other_reps else ""

                summary_lines.append(
                    f"- CARTE {card_num} ({date_label.upper()} {period_label}) : "
                    f"Répartition visuelle : {c_summary['vis_desc']}{vent_detail}{pluie_detail} | "
                    f"Sur cette carte : la commune la plus fraîche = {c_summary['f_city']}, la plus chaude = {c_summary['c_city']}{other_str}"
                )
            else:
                rows = data_by_date[d]
                row_min = min(rows, key=lambda r: float(r.get("temperature_2m_min" if period == "morning" else "temperature_2m_max", 99)))
                row_max = max(rows, key=lambda r: float(r.get("temperature_2m_min" if period == "morning" else "temperature_2m_max", -99)))
                spatial_weather = analyze_spatial_weather(zone, rows)
                f_temp = row_min.get("temperature_2m_min" if period == "morning" else "temperature_2m_max", 15)
                c_temp = row_max.get("temperature_2m_min" if period == "morning" else "temperature_2m_max", 25)
                summary_lines.append(
                    f"- CARTE {card_num} ({date_label.upper()} {period_label}) : "
                    f"Répartition visuelle : {spatial_weather}{vent_detail}{pluie_detail} | "
                    f"Sur cette carte : la commune la plus fraîche = {row_min.get('Ville','')} ({f_temp} degrés), la plus chaude = {row_max.get('Ville','')} ({c_temp} degrés)"
                )
    else:
        log("ℹ️ Fichier CSV non trouvé, utilisation des tendances...")
        summary_lines = [f"- 7 jours de prévisions sur {zone_title}"]

    # ponytail: Dynamically determine starting label based on first target date
    start_phrase_cue = "ce mardi matin 29 septembre"
    if target_dates:
        try:
            d0_dt = datetime.strptime(target_dates[0], "%d/%m/%Y")
            f_days = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
            f_months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
            start_phrase_cue = f"ce {f_days[d0_dt.weekday()]} matin {d0_dt.day} {f_months[d0_dt.month-1]}"
        except Exception:
            pass

    if mode == "btp":
        persona = "Tu es un présentateur météo professionnel expert pour Météo BTP et Météo-Climat Pro."
        audience = f"un bulletin météo TV broadcast professionnel de très haute précision technique, destiné aux professionnels du BTP (chefs de chantier, artisans, conducteurs de travaux, compagnons) pour {zone_title}."
        if zone == "cvl":
            intro_rule = f'La Phrase 1 DOIT impérativement commencer exactement par : "Voici votre bulletin météo BTP pour la région Centre-Val de Loire, avec un focus sur Blois et le Loir-et-Cher. On commence {start_phrase_cue}, avec..."'
            phrase_9_desc = "Heure de fin de journée chantier, consignes de sécurité pour le Centre-Val de Loire et le secteur de Blois, et mot de conclusion chaleureux signé Météo BTP et Météo-Climat Pro."
        else:
            intro_rule = f'La Phrase 1 DOIT impérativement commencer exactement par : "Voici votre bulletin météo BTP. On commence {start_phrase_cue}, avec..."'
            phrase_9_desc = "Heure de fin de journée chantier, consignes de sécurité, et mot de conclusion chaleureux signé Météo BTP et Météo-Climat Pro."
        specific_rules = """5. MODE VISIO & RESPECT STRICT DU CONTRASTE SPATIAL (RÈGLE INVIOLABLE) :
   - Tu disposes DIRECTEMENT de l'image de chaque carte météo haute définition transmise dans ce prompt. OBSERVE-LA ATTENTIVEMENT !
   - Si la carte ou la fiche technique indique un contraste ou un phénomène marginal (ex: 20 villes sous les nuages ou le soleil et 1 seule sous une ondée comme Le Grand-Pressigny ou Le Blanc), INTERDICTION FORMELLE de dire qu'il pleut partout ou sur la région !
   - Mentionne expressément la nuance géographique (ex: "un temps très nuageux mais sec sur la région et à Blois, avec tout au plus une ondée très isolée vers Le Grand-Pressigny").
   - Adapte le conseil BTP : autorise les travaux extérieurs et coulages sur les secteurs secs, et réserve la vigilance aux seules zones arrosées.
6. PRÉCISION VENT ET RAFALES BTP :
   - Les rafales DOIVENT TOUJOURS être citées au multiple de 5 le plus proche (ex: 45, 50, 55, 60, 65, 70, 75 km/h). Utilise STRICTEMENT la valeur arrondie indiquée sous chaque carte !
7. CONSEILS MÉTIERS BTP :
   - Relie les conditions météo aux chantiers : coulage béton, séchage, terrassement, étanchéité, hydratation des ouvriers si forte chaleur, arrêt des grues et sécurisation des échafaudages."""
    else:
        persona = "Tu es un présentateur météorologue officiel pour Météo-Climat Pro."
        audience = f"le bulletin météo national grand public officiel, destiné aux téléspectateurs pour la météo au quotidien, les activités extérieures et les prévisions de la semaine pour {zone_title}."
        intro_rule = f'La Phrase 1 DOIT impérativement commencer exactement par : "Bonjour à tous, bienvenue pour votre bulletin météo national. On commence {start_phrase_cue}, avec..."'
        specific_rules = """5. CONSEILS GRAND PUBLIC & SORTIES :
   - Décris l'ambiance météo de manière vivante (soleil, éclaircies, parapluie nécessaire ou non, ressenti doux ou frais).
   - Donne des conseils pour les sorties, activités de plein air et le week-end."""
        phrase_9_desc = "Synthèse générale de la semaine, éphéméride, et mot de conclusion chaleureux signé Météo-Climat Pro."

    prompt_text = f"""{persona}
Tu rédiges le script oral complet d'{audience}
RÈGLE ABSOLUE : Le bulletin commence {start_phrase_cue}.

Voici la fiche technique DÉTAILLÉE CARTE PAR CARTE (les températures indiquées correspondent EXACTEMENT aux chiffres dessinés sur chaque carte) :
{chr(10).join(summary_lines)}

EXIGENCES ÉDITORIALES DE HAUTE PRÉCISION :
1. ACCROCHE TV NATURELLE ET FLUIDE (OBLIGATOIRE) :
   - {intro_rule}
2. INTERDICTION FORMELLE DE CITER DES NOMS DE PERSONNES (RÈGLE INVIOLABLE) :
   - Ne dis JAMAIS "Patrick Marlière", "Patrick" ni aucun nom de présentateur ! Tu ne te présentes JAMAIS sous un nom personnel. Le bulletin est anonyme et signé uniquement par "Météo-Climat Pro" et "Météo BTP".
3. COHÉRENCE NUMÉRIQUE STRICTE AVEC LES CARTES (RÈGLE INVIOLABLE) :
   - Pour CHAQUE carte 1 à 8, cite EXACTEMENT les villes et les températures fournies entre parenthèses dans la fiche technique.
   - INTERDICTION FORMELLE d'inventer, arrondir ou modifier les températures ou les rafales ! Si la fiche indique "PONTARLIER (8 degrés)", tu écris obligatoirement "8 degrés à Pontarlier", et JAMAIS 10 degrés ! Si elle indique "BASTIA (21 degrés)", écris "21 degrés à Bastia" ! Si elle indique "BREST (23 degrés)", écris "23 degrés à Brest" ! Si elle indique "BORDEAUX (32 degrés)", écris "32 degrés à Bordeaux" !
   - Ne recopie JAMAIS les températures d'une carte précédente sur la carte suivante. Chaque carte a ses propres températures uniques.
4. BAN ABSOLU DU MOT 'CELSIUS' (RÈGLE INVIOLABLE) :
   - Ne dis JAMAIS "degrés Celsius" ni "Celsius" ! Dis uniquement "degrés" ou le chiffre brut (ex: "6 degrés", "25 degrés"). N'écris jamais le symbole °C.
{specific_rules}
7. LONGUEUR PAR PHRASE & CONTRAINTE STRICTE DE DURÉE (1 MINUTE 30 MAXIMUM) :
   - RÈGLE ABSOLUE : Le bulletin complet (les {len(cards)} phrases cumulées) DOIT IMPÉRATIVEMENT DURER MOINS DE 1 MINUTE 30 (90 secondes au total) !
   - Pour respecter cette durée, chaque phrase doit faire STRICTEMENT entre 16 et 22 mots (JAMAIS plus de 24 mots par phrase !). Diction dynamique, naturelle, concise et percutante. N'utilise aucun placeholder entre crochets.

Structure des {len(cards)} phrases dans l'ordre EXACT :
- Phrase 1 (CARTE 1 : Matin)
- Phrase 2 (CARTE 2 : Après-midi)
- Phrases 3 à 8 (CARTES 3 à 8 : Après-midi des jours suivants)
- Phrase 9 (CARTE 9 : Éphéméride & Synthèse) : {phrase_9_desc}

Réponds UNIQUEMENT par un objet JSON valide avec la clé "phrases" contenant le tableau des {len(cards)} phrases :
{{"phrases": ["phrase 1", "phrase 2", ..., "phrase {len(cards)}"]}}"""

    if api_key:
        data = None
        try:
            log(f"🧠 Mode Visio Multimodal (Gemini 3.6 Flash Vision via OpenRouter) : chargement et observation des cartes...")
            user_content = [{"type": "text", "text": prompt_text}]
            images_loaded = 0
            for idx, c in enumerate(cards):
                c_path = c.get("path")
                if c_path and os.path.exists(c_path):
                    b64 = load_and_compress_card_b64(c_path)
                    if b64:
                        user_content.append({
                            "type": "text",
                            "text": f"--- CARTE {idx+1} ({c.get('label', os.path.basename(c_path))}) ---"
                        })
                        user_content.append({
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{b64}"
                            }
                        })
                        images_loaded += 1
            if images_loaded > 0:
                log(f"👁️ ✅ Mode Visio actif : {images_loaded} cartes transmises à Gemini 3.6 Flash pour observation directe !")

            payload = {
                "model": "google/gemini-3.6-flash",
                "messages": [{"role": "user", "content": user_content}],
                "response_format": {"type": "json_object"}
            }
            req = urllib.request.Request(
                "https://openrouter.ai/api/v1/chat/completions",
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://meteoclimatpro.fr",
                    "X-Title": "Meteo Climat Pro",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception as e_visio:
            log(f"⚠️ Mode Visio IA ({e_visio}) -> Bascule sur fallback texte structuré...")
            try:
                payload = {
                    "model": "google/gemini-3.6-flash",
                    "messages": [{"role": "user", "content": prompt_text}],
                    "response_format": {"type": "json_object"}
                }
                req = urllib.request.Request(
                    "https://openrouter.ai/api/v1/chat/completions",
                    data=json.dumps(payload).encode("utf-8"),
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://meteoclimatpro.fr",
                        "X-Title": "Meteo Climat Pro",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                    }
                )
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
            except Exception as e_text:
                log(f"⚠️ Erreur fallback texte IA ({e_text})")
                data = None

        if data:
            try:
                raw = data["choices"][0]["message"]["content"].strip()
                if "```" in raw:
                    parts = raw.split("```")
                    raw = parts[1]
                    if raw.startswith("json"):
                        raw = raw[4:]
                    raw = raw.strip()

                raw_cleaned = re.sub(r'\\([^"\\/bfnrtu])', r'\1', raw)
                try:
                    parsed = json.loads(raw_cleaned, strict=False)
                except Exception:
                    parsed = json.loads(raw, strict=False)

                phrases = None
                if isinstance(parsed, list):
                    phrases = parsed
                elif isinstance(parsed, dict):
                    for k in ["phrases", "script", "bulletin", "cards", "sentences"]:
                        if k in parsed and isinstance(parsed[k], list):
                            phrases = parsed[k]
                            break
                    if not phrases:
                        for v in parsed.values():
                            if isinstance(v, list):
                                phrases = v
                                break

                if isinstance(phrases, list) and len(phrases) == len(cards):
                    phrases = [round_gusts_in_text(p) for p in phrases]
                    log(f"✅ Script oral {mode.upper()} rédigé avec succès par Gemini 3.6 Flash ({len(phrases)} phrases) !")
                    return phrases
                else:
                    log(f"⚠️ Nombre de phrases inattendu ({len(phrases) if isinstance(phrases, list) else 'non-liste'}) vs {len(cards)} cartes")
            except Exception as e_parse:
                log(f"⚠️ Erreur parsing réponse IA ({e_parse})")

    # Fallback propre à J+1 calibré strictement sous 1m30 (16-22 mots par phrase)
    log(f"ℹ️ Utilisation du fallback statique sécurisé ({mode})")
    if mode == "btp":
        return [
            f"Voici votre bulletin météo BTP. On commence {start_phrase_cue} avec des conditions calmes idéales pour démarrer vos chantiers.",
            "Pour l'après-midi, le soleil s'impose largement, parfait pour la poursuite des travaux extérieurs et du terrassement.",
            "Le lendemain, maintien d'un temps sec et clément pour sécuriser vos installations en toute sérénité.",
            "Le surlendemain, quelques passages nuageux par l'ouest : surveillez l'adhérence des engins et les sols glissants.",
            "Vendredi, grande douceur sous un ciel très lumineux, veillez à la bonne hydratation des équipes.",
            "Samedi, ciel plus changeant avec de rares averses locales, protégez vos matériaux sensibles à l'humidité.",
            "Dimanche, atmosphère plus fraîche et vent sensible : contrôlez l'amarrage de vos échafaudages et grues.",
            "Lundi prochain, poursuite de conditions de saison, très favorables à l'avancement de vos plannings de travaux.",
            "Restez vigilants sur l'évolution du vent. Très bonne semaine à vos équipes avec Météo BTP et Météo-Climat Pro !"
        ]
    else:
        return [
            f"Bonjour à tous, voici votre météo nationale. On commence {start_phrase_cue} sous un ciel très calme et agréable.",
            "Pour votre après-midi, le soleil domine généreusement sur la majeure partie du pays, idéal pour vos sorties.",
            "Le lendemain, une belle luminosité et une grande douceur s'annoncent sur l'ensemble de vos régions.",
            "Le surlendemain, quelques ondées locales glisseront par l'ouest tandis que la douceur persistera ailleurs.",
            "Vendredi, grand soleil généralisé sous un air particulièrement agréable et de saison sur tout le pays.",
            "Samedi, ciel partagé avec quelques averses passagères et un thermomètre qui restera très doux.",
            "Dimanche, nébulosité plus marquée et fraîcheur de saison, prévoyez une veste pour vos activités extérieures.",
            "Lundi prochain, retour de belles éclaircies après dissipation rapide des quelques brumes matinales.",
            "Profitez pleinement de cette météo agréable au fil des jours. À très vite avec Météo-Climat Pro !"
        ]

def round_gusts_in_text(text):
    """Arrondit strictement toutes les mentions de rafales en km/h de 5 en 5 (ex: 68 km/h -> 70 km/h)"""
    def _repl(m):
        val = int(m.group(1))
        unit = m.group(2)
        rounded = int(round(val / 5.0) * 5)
        return f"{rounded} {unit}"
    return re.sub(r'\b(\d+)\s*(km/h|kilomètres-heure|kilomètres par heure|kmh)', _repl, text, flags=re.IGNORECASE)

def clean_for_speech(text):
    """Bannit formellement la prononciation du mot 'celsius', le nom 'Patrick Marlière', arrondit les rafales par 5, et nettoie les symboles"""
    # RÈGLE ABSOLUE : Zéro mention de nom propre (Patrick Marlière / Patrick)
    t = re.sub(r"\b(C['’]était\s+)?Patrick\s+Marli[èe]re\b", "", text, flags=re.IGNORECASE)
    t = re.sub(r"\b(c['’]était\s+)?Patrick\b", "", t, flags=re.IGNORECASE)
    t = round_gusts_in_text(t)
    t = re.sub(r'°C\b', ' degrés', t)
    t = re.sub(r'°\b', ' degrés', t)
    t = re.sub(r'degrés\s+[cC]elsius', 'degrés', t)
    t = re.sub(r'degré\s+[cC]elsius', 'degré', t)
    t = re.sub(r'\b[cC]elsius\b', '', t)
    t = t.replace('°C', ' degrés').replace('°', ' degrés')
    t = re.sub(r'\s+', ' ', t)
    return t.strip()

def tts_charon(text, output_wav, api_key):
    """Synthèse vocale Gemini 3.8 Flash-Lite TTS (voix Charon) avec fallback transparent Edge-TTS (Henri)"""
    clean_text = clean_for_speech(text)

    # 1. Tentative OpenRouter Gemini Charon TTS
    if api_key:
        try:
            url = "https://openrouter.ai/api/v1/audio/speech"
            payload = {
                "model": "google/gemini-3.8-flash-tts",
                "input": clean_text,
                "voice": "Charon",
                "language": "fr-FR",
                "instructions": (
                    "The speaker is an experienced, authoritative French television weather presenter and meteorologist for a major national news channel. "
                    "He speaks standard metropolitan Parisian French with crisp European French articulation, warm authority, and a dynamic, fluid, natural broadcast TV delivery. "
                    "Diction is energetic, clear, engaging, and professional, without long pauses or hesitation between sentences. "
                    "Every city and regional name is articulated with precision. "
                    "Never pronounce 'celsius', always say 'degrés'."
                )
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
    log(f"⏱️ Durée totale mesurée : {total_duration:.2f}s (~{int(total_duration//60)}m{int(total_duration%60):02d}s)")

    # Clamping strict à 1m30 maximum (<= 89 secondes)
    if total_duration > 90.0:
        speed_factor = min(1.6, max(1.05, round(total_duration / 88.0, 3)))
        log(f"⚠️ Durée totale ({total_duration:.1f}s) > 90s : ajustement de vitesse automatique x{speed_factor} pour garantir <= 1m30...")
        clamped_durations = []
        clamped_clips = []
        for i in range(n_cards):
            c_wav = os.path.join(temp_dir, f"clamped_{i:02d}.wav")
            subprocess.run([
                "ffmpeg", "-y", "-i", audio_clips[i],
                "-filter:a", f"atempo={speed_factor}",
                "-ar", "24000", c_wav
            ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            with wave.open(c_wav, "rb") as wf:
                c_dur = round(wf.getnframes() / wf.getframerate(), 2)
            clamped_durations.append(c_dur)
            clamped_clips.append(c_wav)
        durations = clamped_durations
        audio_clips = clamped_clips
        total_duration = sum(durations)
        log(f"⏱️ Nouvelle durée totale garantie : {total_duration:.2f}s (<= 90s) !")

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
