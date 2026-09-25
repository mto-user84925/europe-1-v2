#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Compilation ultra-rapide du Bulletin Météo France Grand Public TikTok 9:16
- Réutilise l'audio de référence parfait (voix Charon + musique de fond) de la version Paysage
- Applique les 9 cartes officielles Portrait (1080x1920)
- Zéro appel API, zéro coût, synchronisation à la milliseconde près
"""

import os
import shutil
import subprocess
from datetime import datetime
from generate_tiktok_bulletins import find_maps_dir, collect_cards, log

def main():
    cur_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(cur_dir, "output_bulletins")
    landscape_video = os.path.join(output_dir, "bulletin_paysage_france_grand_public.mp4")
    
    if not os.path.exists(landscape_video):
        log(f"❌ Vidéo paysage source introuvable : {landscape_video}")
        return

    maps_dir = find_maps_dir()
    cards = collect_cards("france", maps_dir, orientation="portrait")
    log(f"🔎 {len(cards)} cartes portrait collectées.")

    durations = [
        17.46,  # Carte 1 - Samedi matin
        15.97,  # Carte 2 - Samedi après-midi
        15.23,  # Carte 3 - Dimanche
        15.62,  # Carte 4 - Lundi
        14.60,  # Carte 5 - Mardi
        15.11,  # Carte 6 - Mercredi
        14.09,  # Carte 7 - Jeudi
        14.39,  # Carte 8 - Vendredi
        13.18   # Carte 9 - Éphéméride & Synthèse
    ]

    temp_dir = os.path.join(output_dir, "temp_tiktok_fast")
    os.makedirs(temp_dir, exist_ok=True)

    # 1. Extraction de l'audio complet de la vidéo paysage
    extracted_audio = os.path.join(temp_dir, "extracted_audio.aac")
    cmd_extract = [
        "ffmpeg", "-y", "-i", landscape_video,
        "-vn", "-c:a", "copy", extracted_audio
    ]
    log("🎵 [1/3] Extraction de la piste audio de référence...")
    subprocess.run(cmd_extract, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # 2. Encodage des segments vidéo portrait (1080x1920)
    log("🖼️ [2/3] Encodage des cartes portrait (h264_nvenc 1080x1920)...")
    video_segments = []
    concat_txt = os.path.join(temp_dir, "video_segments.txt")

    # Vérification présence NVENC
    has_nvenc = False
    try:
        res = subprocess.run(["ffmpeg", "-encoders"], capture_output=True, text=True)
        if "h264_nvenc" in res.stdout:
            has_nvenc = True
    except Exception:
        pass

    v_codec = ["-c:v", "h264_nvenc", "-preset", "p4", "-b:v", "4000k"] if has_nvenc else ["-c:v", "libx264", "-preset", "fast", "-crf", "20"]

    filter_str = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"

    with open(concat_txt, "w", encoding="utf-8") as f_concat:
        for i, card in enumerate(cards):
            card_path = card["path"]
            dur = durations[i]
            seg_path = os.path.join(temp_dir, f"seg_{i:02d}.mp4")

            cmd_seg = [
                "ffmpeg", "-y", "-loop", "1", "-i", card_path,
                "-t", str(dur),
                "-vf", f"{filter_str},format=yuv420p",
                "-r", "30",
            ] + v_codec + [seg_path]
            
            subprocess.run(cmd_seg, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            f_concat.write(f"file '{seg_path.replace(os.sep, '/')}'\n")
            log(f"   Carte {i+1} ({dur}s) : {os.path.basename(card_path)}")

    # 3. Concaténation vidéo
    log("🎬 [3/3] Concaténation vidéo et mixage final...")
    raw_video = os.path.join(temp_dir, "raw_video_portrait.mp4")
    cmd_concat = [
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_txt,
        "-c", "copy", raw_video
    ]
    subprocess.run(cmd_concat, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # 4. Mux final
    out_video = os.path.join(output_dir, "bulletin_tiktok_france_grand_public.mp4")
    cmd_final = [
        "ffmpeg", "-y", "-i", raw_video, "-i", extracted_audio,
        "-map", "0:v", "-map", "1:a",
        "-c:v", "copy", "-c:a", "copy",
        "-shortest", out_video
    ]
    subprocess.run(cmd_final, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    total_dur = sum(durations)
    size_mb = os.path.getsize(out_video) / (1024 * 1024)
    log(f"🎉 SUCCÈS : {out_video} ({size_mb:.2f} Mo, {total_dur:.2f}s)")

    # Copie sur le Bureau
    desktop = os.path.join(os.path.expanduser("~"), "Desktop")
    date_tag = datetime.now().strftime("%d_%m_%Y")
    desktop_file = os.path.join(desktop, f"BULLETIN_TIKTOK_METEO_CLIMAT_PRO_FRANCE_GRAND_PUBLIC_{date_tag}.mp4")
    shutil.copy(out_video, desktop_file)
    log(f"📋 Copie livrée sur le Bureau : {desktop_file}")

    # Nettoyage
    try:
        shutil.rmtree(temp_dir)
    except Exception:
        pass

if __name__ == "__main__":
    main()
