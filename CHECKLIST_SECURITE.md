# CHECKLIST SÉCURITÉ — Météo-Climat Pro

> **À faire par toi.** Aucun agent ne peut révoquer une clé : c'est un bouton
> dans l'interface de chaque fournisseur. Tant que cette étape n'est pas faite,
> les clés restent lisibles dans ton historique Git — même si elles ont été
> retirées du code.

Ordre recommandé : du plus urgent au moins urgent.

---

## 1. Supabase — clé `service_role`  🔴 PRIORITÉ 1

C'est la clé la plus dangereuse : elle **ignore toutes les politiques RLS** et
donne lecture/écriture/suppression sur toute la base.

- [ ] Dashboard → **Settings → API**
- [ ] Section **Project API keys** → ligne `service_role`
- [ ] **Régénérer** la clé (`Rotate` / `Regenerate`)
- [ ] Copier la nouvelle valeur **directement** dans Vercel (voir §6)
- [ ] Vérifier dans Supabase → Logs qu'aucune requête suspecte n'est passée

> Ancienne valeur exposée : `eyJhbGciOiJIUzI1NiIs...RC_D6wljCTi1WEf0aG3QoEf1ZH_sJkP9TiVXXAovMzI`
> **Ne la réutilise jamais.**

- [ ] Pendant que tu y es : vérifier que les **autres tables** ont le RLS activé
  → `Dashboard → Authentication → Policies`, ou exécuter :

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY rowsecurity ASC, tablename;
```
Toute table avec `rowsecurity = false` est **ouverte en écriture à l'anon**.

- [ ] Exécuter `supabase/rls_user_station_configs.sql` (le SQL que je t'ai préparé)

---

## 2. GitHub — token personnel  🔴 PRIORITÉ 1

Le token est dans `.git/config`, utilisé pour chaque `git push`.

- [ ] GitHub → **Settings → Developer settings → Personal access tokens**
- [ ] Identifier le token `gho_REDACTED...` et **Supprimer** (`Delete`)
- [ ] Créer un nouveau token si besoin
- [ ] Réécrire l'URL du remote **sans identifiants** :

```powershell
git remote set-url origin https://github.com/mto-user84925/europe-1-v2.git
```

- [ ] Utiliser le Gestionnaire d'identifiants Windows :

```powershell
git config --global credential.helper manager
# Au prochain push, Git demandera une authentification (navigateur)
```

- [ ] Vérifier : `git remote -v` ne doit **plus** contenir `gho_`

---

## 3. Météo-France — consumer key / secret  🟠 PRIORITÉ 2

Ces identifiants étaient **dans le bundle JavaScript public** : n'importe quel
visiteur pouvait les extraire et consommer ton quota.

- [ ] https://portail-api.meteofrance.fr → **Mes applications**
- [ ] **Supprimer** / régénérer l'application :
  - Clé : `Mhar9YSs8LEluq4neXqP0YeHaaka`
  - Secret : `nDKPWzVr2_2o5Ej1aPZa7O6hu4Ia`
- [ ] Créer de nouvelles valeurs
- [ ] Les placer **uniquement** dans les variables Vercel :
  `MF_CONSUMER_KEY` et `MF_CONSUMER_SECRET`
- [ ] **Jamais** dans le code, jamais préfixées `VITE_`

---

## 4. Resend — clé API  🟠 PRIORITÉ 2

Permet d'envoyer des e-mails **en ton nom** (phishing, spam, épuisement du quota).

- [ ] https://resend.com/api-keys
- [ ] **Révoquer** la clé `re_E1j1QCw2...`
- [ ] Créer une nouvelle clé
- [ ] La placer dans Vercel : `RESEND_API_KEY`

---

## 5. AGATE — mot de passe  🟡 PRIORITÉ 3

- [ ] Contacter le fournisseur du flux orages (mwattest.fr)
- [ ] **Changer le mot de passe** `jh2kH3,R`
- [ ] Le placer dans Vercel : `AGATE_PASS`

---

## 6. Vercel — variables d'environnement

Une fois les nouvelles valeurs obtenues :

- [ ] Vercel → projet **minisite-douai** → **Settings → Environment Variables**
- [ ] Créer / mettre à jour, pour les environnements **Production**, **Preview** et **Development** :

| Variable | Type | Obligatoire |
|---|---|---|
| `SUPABASE_URL` | Secret | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | ✅ |
| `MF_CONSUMER_KEY` | Secret | ✅ |
| `MF_CONSUMER_SECRET` | Secret | ✅ |
| `CRON_SECRET` | Secret | ✅ **sinon les crons renvoient 401** |
| `RESEND_API_KEY` | Secret | ⬜ |
| `ALERT_SECRET` | Secret | ⬜ |
| `AGATE_PASS` | Secret | ⬜ |
| `MF_RADAR_API_KEY` | Secret | ⬜ |
| `VITE_SUPABASE_URL` | Public | ✅ |
| `VITE_SUPABASE_ANON_KEY` | Public | ✅ |
| `VITE_CARTO_KEY` | Public | ⬜ |

Générer un `CRON_SECRET` solide :

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- [ ] **Redéployer** après modification (les variables ne sont prises en compte
  qu'au déploiement suivant)

---

## 7. Nettoyer l'historique Git

⚠️ **À faire seulement APRÈS les révocations du §1 à §5.**
Réécrire l'historique ne protège rien si les clés sont encore valides.

- [ ] Retirer `dist/` du suivi (234 fichiers, contient d'anciens secrets) :

```powershell
git rm -r --cached dist
git commit -m "chore: retirer dist/ du suivi"
```

- [ ] Purger les secrets de l'historique (outil `git filter-repo`) :

```powershell
pip install git-filter-repo
git filter-repo --invert-paths --path scratch/ --path OAUTH_AUTOMATIQUE_OK.md --path README_OAUTH.md
```

- [ ] Forcer la mise à jour du remote :

```powershell
git push --force-with-lease origin master
```

- [ ] Si le dépôt est **public**, envisager de le rendre privé.

---

## 8. Vérification finale

Après tout ça, lancer la vérification automatique :

```powershell
node scripts/check_env.mjs
```

Attendu : `BILAN — Échecs : 0`.

Puis :

```powershell
npm run build
npm run lint
```

---

## Ce que le contrôle d'environnement ne peut pas vérifier

- Que les **anciennes** clés sont bien révoquées (seul le fournisseur le sait)
- Que les politiques **RLS des autres tables** sont correctes (à contrôler
  manuellement dans `Authentication → Policies`)
- Que l'application fonctionne visuellement (aucun test navigateur n'a été fait)
