#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Envoi automatique de l'e-mail de notification pour les Bulletins Météo France (J+1)
- Liens directs de téléchargement des deux vidéos (Paysage 16:9 & TikTok 9:16)
- Script complet et synthèse météo
- Envoi sécurisé via SMTP SFR (gregory.langlet@sfr.fr)
"""

import os
import sys
import smtplib
import ssl
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

def send_bulletin_notification(mode="grand_public", triggered_by="gregory"):
    email_user = os.environ.get("SFR_EMAIL", "gregory.langlet@sfr.fr").strip().replace("\ufeff", "").replace("\u200b", "")
    email_pass = os.environ.get("SFR_PASSWORD")
    if email_pass:
        email_pass = email_pass.strip().replace("\ufeff", "").replace("\u200b", "")

    # Fallback local config si disponible
    if not email_pass:
        local_cfg = r"C:\Users\grego\.gemini\config\skills\mail\config.json"
        if os.path.exists(local_cfg):
            try:
                import json
                with open(local_cfg, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    email_pass = cfg.get("password", "").strip().replace("\ufeff", "").replace("\u200b", "")
            except Exception:
                pass

    if not email_pass:
        print("[EMAIL] ❌ ERREUR : SFR_PASSWORD manquant, envoi annulé.", flush=True)
        return False

    trig = (os.environ.get("TRIGGERED_BY") or triggered_by or "gregory").strip().lower()
    if trig == "patrick":
        recipients = ["patrick.marliere@wanadoo.fr", "gregory.langlet@sfr.fr", "langlet.gregory@gmail.com"]
    elif trig == "cron":
        recipients = ["gregory.langlet@sfr.fr", "gregory.langlet59264@gmail.com"]
    else:
        recipients = ["gregory.langlet@sfr.fr", "langlet.gregory@gmail.com"]

    now_str = datetime.now().strftime("%d/%m/%Y")
    mode_label = "Grand Public" if mode == "grand_public" else ("BTP Pro" if mode == "btp" else "Complet (Grand Public & BTP)")

    # Liens GitHub Releases pour téléchargement direct
    release_base = "https://github.com/mto-user84925/europe-1-v2/releases/download/bulletins-france-latest"
    link_paysage = f"{release_base}/bulletin_{mode}_paysage_16_9.mp4"
    link_tiktok = f"{release_base}/bulletin_{mode}_tiktok_9_16.mp4"
    releases_page = "https://github.com/mto-user84925/europe-1-v2/releases"

    subject = f"🌤️ [Météo-Climat Pro] Vos Bulletins Vidéo France ({mode_label}) du {now_str} (pour demain J+1)"

    html_content = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; color: #1e293b; }}
  .container {{ max-width: 650px; margin: auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.06); }}
  .header {{ background: linear-gradient(135deg, #0ea5e9, #0284c7); padding: 24px; text-align: center; color: white; }}
  .header h1 {{ margin: 0; font-size: 22px; font-weight: 700; }}
  .header p {{ margin: 6px 0 0; font-size: 14px; opacity: 0.9; }}
  .content {{ padding: 24px; }}
  .btn-group {{ display: flex; flex-direction: column; gap: 12px; margin: 20px 0; }}
  .btn {{ display: block; text-align: center; padding: 14px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; color: white; }}
  .btn-paysage {{ background-color: #2563eb; }}
  .btn-tiktok {{ background-color: #059669; }}
  .btn-all {{ background-color: #475569; font-size: 13px; }}
  .card {{ background: #f8fafc; border-left: 4px solid #0ea5e9; padding: 14px 18px; border-radius: 6px; margin: 16px 0; font-size: 14px; line-height: 1.5; }}
  .footer {{ background: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #64748b; }}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>MÉTÉO-CLIMAT PRO</h1>
    <p>Bulletins Vidéo Quotidiens — Mode {mode_label} (J+1)</p>
  </div>
  <div class="content">
    <p>Bonjour Grégory,</p>
    <p>Les bulletins météo vidéo nationaux du <strong>{now_str}</strong> (démarrant à <strong>J+1</strong>) ont été générés avec succès par votre automatisation GitHub Actions !</p>

    <div class="btn-group">
      <a href="{link_paysage}" class="btn btn-paysage" style="color:white;">📺 Télécharger le Bulletin PAYSAGE (16:9 - 1920x1080)</a>
      <a href="{link_tiktok}" class="btn btn-tiktok" style="color:white;">📱 Télécharger le Bulletin TIKTOK (9:16 - 1080x1920)</a>
      <a href="{releases_page}" class="btn btn-all" style="color:white;">📂 Accéder à la page des Releases GitHub</a>
    </div>

    <div class="card">
      <strong>Points clés du bulletin :</strong><br>
      • Format double : Paysage 16:9 broadcast + Portrait 9:16 mobile.<br>
      • Voix métropolitaine posée et articulée (+2% tempo).<br>
      • Températures réelles et cohérentes affichées à l'écran.<br>
      • Conforme aux standards Météo-Climat Pro (zéro mot Celsius).
    </div>

    <p style="font-size: 13px; color: #64748b;">
      <em>Note : Ces vidéos sont prêtes à être diffusées directement sur vos plateformes vidéo, réseaux sociaux ou intégrées dans vos briefs quotidiens.</em>
    </p>
  </div>
  <div class="footer">
    Automatisation Météo-Climat Pro &bull; Généré automatiquement sur GitHub Actions
  </div>
</div>
</body>
</html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = email_user
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    print(f"[EMAIL] Connexion à smtp.sfr.fr:465 pour envoi à {', '.join(recipients)}...", flush=True)
    try:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL("smtp.sfr.fr", 465, context=context, timeout=25) as server:
            server.login(email_user, email_pass)
            server.sendmail(email_user, recipients, msg.as_string())
        print(f"[EMAIL] ✅ Notification par e-mail envoyée avec succès à {', '.join(recipients)} !", flush=True)
        return True
    except Exception as e:
        print(f"[EMAIL] ❌ Erreur lors de l'envoi de l'e-mail : {e}", flush=True)
        return False

if __name__ == "__main__":
    mode_arg = sys.argv[1] if len(sys.argv) > 1 else "grand_public"
    send_bulletin_notification(mode_arg)
