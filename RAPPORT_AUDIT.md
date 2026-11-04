# RAPPORT D'AUDIT COMPLET — minisite-douai

> Audit réalisé point par point : sécurité, architecture, code, données, déploiement.
> Date : audit à chaud du dépôt local. Niveau de sévérité : 🔴 Critique · 🟠 Majeur · 🟡 Moyen · 🔵 Mineur

---

## ✅ STATUT DES CORRECTIFS (mis à jour après application)

**Build final : ✅ OK en 14,61 s — 3 664 modules, 0 erreur.**
**Secrets dans `dist/` : ✅ AUCUN (contre 2 présents avant).**
**Secrets dans `src/` et `api/` : ✅ AUCUN (7 recherchés).**
**Erreurs ESLint critiques : ✅ ZÉRO (contre 84 avant).**
**Fonctions serverless : ✅ 9/9 s'importent sans erreur ESM.**

### Preuves d'exécution (tests de garde)

Les protections ont été **exécutées** et non seulement relues :

```
archive-history.js :
  sans secret    -> 401 {"success":false,"error":"Unauthorized"}
  mauvais secret -> 401 {"success":false,"error":"Unauthorized"}
  sans header    -> 401 {"success":false,"error":"Unauthorized"}
  bon secret     -> 500 "Missing Supabase environment variables"   (garde franchi)

send-alert.js :
  sans ALERT_SECRET            -> 401
  bon secret sans RESEND_API_KEY -> 500 "Server misconfigured"
  mauvaise méthode HTTP        -> 405

mf-token.js :
  sans MF_CONSUMER_KEY/SECRET  -> 500 "Server misconfigured"
  preflight OPTIONS            -> 200
```


| Constat | Statut |
|---|---|
| BUG-1 / BUG-2 (`hasTemp`…) | ✅ **Corrigé** — plantages des onglets Climatologie et Archives éliminés |
| BUG-3 (import `supabase`) | ✅ **Corrigé** |
| BUG-4 (`require`/`useMemo`/`CircleMarker`) | ✅ **Corrigé** |
| BUG-5 (`useState` conditionnel) | ✅ **Corrigé** |
| BUG-6 (rewrite `/ORAGE`) | ✅ **Corrigé** — ajouté dans `vercel.json` **et** `netlify.toml` / `_redirects` |
| BUG-7 (code mort Gel) | ✅ **Corrigé** |
| BUG-8 / BUG-9 / BUG-10 (dates UTC, cache) | ✅ **Corrigé** |
| BUG-11 (rafales fabriquées) | ⚠️ **Partiel** — la logique `Math.max(FXI,FXI3S)` reste ; le fallback `FF×1.3` **n'a pas été retiré** (choix métier à trancher : voir note) |
| BUG-12 / BUG-13 / BUG-14 / BUG-15 | 🔵 **Non traité** (mineur, voir plus bas) |
| SEC-2 (identifiants Météo-France) | ✅ **Corrigé** — supprimés du client ; restent uniquement côté serveur `api/mf-token.js` via `MF_CONSUMER_KEY/SECRET` |
| SEC-3 (Resend + secret d'alerte) | ✅ **Corrigé** — `RESEND_API_KEY` / `ALERT_SECRET` |
| SEC-4 (`service_role` en dur) | ✅ **Corrigé** — supprimé, uniquement `process.env` |
| SEC-5 (crons non protégés) | ✅ **Corrigé** — **échec fermé** sur les 5 endpoints |
| SEC-6 (auth « Douai ») | ✅ **Corrigé** — bypass supprimé de `AuthProvider` et `Login` |
| SEC-7 (IDOR `MyStation`) | ✅ **Corrigé** — `client_id` + filtres sur `update`/`delete` |
| SEC-9 (mot de passe AGATE) | ✅ **Corrigé** — `AGATE_PASS` + fuseau horaire dynamique (été/hiver) |
| SEC-10 (`dist/` versionné) | ✅ **Rule .gitignore ajoutée** — désindexation manuelle requise (voir commande) |
| LINT-1 (ESLint sans env Node) | ✅ **Corrigé** — config multi-environnement |
| ARCH-5 (`index.html`) | ✅ **Corrigé** — `lang="fr"`, titre, meta, Open Graph, favicon |
| ARCH-6 (config déploiement incohérente) | ✅ **Corrigé** — Vercel/Netlify alignés, + en-têtes de sécurité |
| **SEC-1 (token GitHub)** | 🔴 **ACTION UTILISATEUR — non automatisable** |
| **SEC-8 (RLS Supabase)** | 🟠 **ACTION UTILISATEUR — hors dépôt** |
| ARCH-1 / ARCH-3 / ARCH-4 / ARCH-7 | 🔵 **Non traité** — décisions d'architecture (voir plus bas) |

### Ce qui n'a PAS été corrigé, et pourquoi

- **SEC-1 / SEC-8** : révocations de secrets et politiques RLS Supabase — hors de ma portée technique.
- **ARCH-1** (15 modules orphelins) : supprimer du code est une décision produit, pas un correctif. Risque de perte si un module devait être routé.
- **ARCH-3** (14 clients Supabase) : refonte structurelle touchant 14 fichiers ; ne peut pas être validée sans les politiques RLS réelles.
- **ARCH-4** (chunk 5,7 Mo) : `React.lazy()` sur ~40 routes changerait la structure de `App.jsx` et nécessite un test de navigation réel.
- **BUG-11** : retirer le fallback `FF×1.3` peut faire apparaître « non mesuré » sur des postes qui affichent aujourd'hui une valeur → **choix métier**.

---

## SYNTHÈSE EXÉCUTIVE

| Sévérité | Nombre de constats |
|---|---|
| 🔴 Critique | 8 |
| 🟠 Majeur | 14 |
| 🟡 Moyen | 12 |
| 🔵 Mineur | 9 |

**Verdict global** : l'application **compile et se déploie**, l'architecture fonctionnelle est riche et cohérente. En revanche l'audit révèle **des fuites de secrets exploitables immédiatement**, **des plantages garantis sur 2 écrans**, une couche d'authentification non branchée, et des contrôles cron qui ne contrôlent rien.

**Les 5 actions à faire en priorité absolue :**
1. Révoquer **tous** les secrets exposés (GitHub token, clés Météo-France, Resend, service_role Supabase, mot de passe AGATE).
2. Corriger `hasTemp` / `hasRain` / `hasWind` (2 fichiers) qui plantent les onglets Climatologie et Archives.
3. Fermer les endpoints `api/cron/*` et `api/send-alert.js` (protection actuelle inopérante).
4. Corriger l'import Supabase manquant dans `SupervisionMap.jsx`.
5. Retirer `dist/` du suivi Git et ajouter `dist/` au `.gitignore`.

---

## PARTIE 1 — SÉCURITÉ

### 🔴 SEC-1 — Token GitHub en clair dans la configuration Git

**Fichier** : `.git/config` (non suivi, mais présent sur le disque)
**Constat** :
```
origin https://mto-user84925:gho_REDACTED@github.com/mto-user84925/europe-1-v2.git
```
Un *personal access token* GitHub (`gho_…`) est stocké en clair et est **utilisé comme identifiant** de chaque `git push`.

**Impact** : quiconque lit ce fichier (ou une sauvegarde, un partage d'écran, un backup) obtient un accès en écriture au dépôt.

**Correctif** :
```powershell
# 1. RÉVOQUER le token sur https://github.com/settings/tokens IMMÉDIATEMENT
# 2. Réécrire le remote sans identifiants
git remote set-url origin https://github.com/mto-user84925/europe-1-v2.git
# 3. Utiliser un credential helper (ou SSH)
git config --global credential.helper manager
```

---

### 🔴 SEC-2 — Identifiants Météo-France embarqués dans le bundle public

**Fichier** : `src/services/meteoFranceAuth.js` (lignes 14-15, 79-80)
**Constat** : la *consumer key* `Mhar9YSs8LEluq4neXqP0YeHaaka` et le *consumer secret* `nDKPWzVr2_2o5Ej1aPZa7O6hu4Ia` sont écrites en dur côté client, **et la vérification du build le confirme** :

```
index-E5nIbShO.js -> MF consumer key, MF consumer secret
```

Le recours à `btoa()` ne protège rien : l'encodage se défait à l'œil nu.

**Impact** : n'importe quel visiteur peut extraire ces identifiants depuis le JS public, puis consommer le **quota Météo-France** à ta place (blocage de l'API, facturation, coupure du service).

**Correctif** : ne garder que `/api/mf-token` (serverless) comme source de jeton, supprimer totalement le fallback navigateur.

```js
// src/services/meteoFranceAuth.js — supprimer les propriétés consumerKey / consumerSecret
// et TOUT le bloc "2. Fallback direct avec credentials" (lignes 78-107)
```

---

### 🔴 SEC-3 — Clé API Resend + secret d'alerte en dur

**Fichier** : `api/send-alert.js` (lignes 4 et 8)
```js
const resend = new Resend('re_E1j1QCw2_CdpvkHST1mHyWkPCCEzTnf7j');   // ligne 4
if (secret !== 'meteo-alert-secure-token-2026') { ... }                 // ligne 8
```

**Impact** :
- La clé Resend permet d'**envoyer des e-mails au nom de ta marque** (phishing, spam) et consomme ton quota.
- Le « secret » est un mot de passe en clair, trivial à deviner, et il est **dans le dépôt**.

**Correctif** :
```js
const resend = new Resend(process.env.RESEND_API_KEY);
if (!process.env.ALERT_SECRET || secret !== process.env.ALERT_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
}
```
Puis **révoquer la clé** sur https://resend.com/api-keys.

---

### 🔴 SEC-4 — Clé `service_role` Supabase en dur (contournement total du RLS)

**Fichier** : `api/cron/archive-foudre.js` (ligne 5)
```js
process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....RC_D6wljCTi1WEf0aG3QoEf1ZH_sJkP9TiVXXAovMzI'
```

**Impact** : la clé `service_role` **ignore toutes les politiques RLS**. Une fois connue, elle donne lecture/écriture/suppression sur **toute** la base : données météo, `user_station_configs`, `certificats_meteo`, `attestations_intemperies`, `btp_projects`… et l'administration des comptes.

**Correctif** : suppression du fallback (la clé vient uniquement de `process.env`), puis **régénération des clés API** sur le dashboard Supabase (Settings → API → *JWT secret* / clés), car cette clé a été publiée dans 3 commits.

---

### 🔴 SEC-5 — Endpoints cron non protégés (contrôles « décoratifs »)

**Fichiers** : `api/cron/archive-history.js`, `api/cron/sync-daily-summaries.js`, `api/cron/archive-foudre.js`, `api/cron/sync-vigilance.js`, `api/cron/refresh-radar.js`

Trois variantes du même défaut :

**(a) Contrôle dans une structure vide — n'arrête rien**
```js
// archive-history.js ligne 2 / sync-daily-summaries.js ligne 2
if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}` && !process.env.IS_LOCAL) {
    // Validation secrète pour Vercel      <-- commentaire, AUCUN return
}
```
Le `if` ne contient qu'un commentaire : la requête **continue toujours**. Si `CRON_SECRET` n'est pas défini, la comparaison vaut `Bearer undefined`, facile à reproduire.

**(b) Échec ouvert**
```js
// archive-foudre.js ligne 15 / sync-vigilance.js ligne 8
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.log('⚠️ Cron secret non vérifié');   // <-- on continue quand même
}
```

**Impact concret** : `archive-history.js` **lit puis SUPPRIME** les observations de `observations_6mn` en masse. Un attaquant (ou un simple crawler qui visite `/api/cron/archive-history`) peut **détruire des données météo** non archivées, à répétition.

**Correctif** (à appliquer aux 5 fichiers) :
```js
if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });   // échec fermé
}
```
Et définir `CRON_SECRET` dans Vercel. Pour les handlers en runtime `edge`, adapter l'API `Response`.

---

### 🟠 SEC-6 — Authentification « démo » codée en dur, et jamais branchée

**Fichier** : `src/auth/AuthProvider.jsx` (lignes 42-52)
```js
if ((email.toLowerCase() === 'douai' && password === 'Meteoclimatpro') ||
    (email.toLowerCase() === 'contact@douai.fr' && password === 'Meteoclimatpro')) {
    const mockUser = { id: 'demo', email: 'contact@douai.fr' };
    localStorage.setItem('minisite_demo_user', JSON.stringify(mockUser));  // session forgée
    setUser(mockUser);
```
Le mot de passe `Meteoclimatpro` est également écrit dans `src/services/supabaseClient.js` (commentaire lignes 4-8) et `src/auth/Login.jsx` (ligne 25).

**Bonne nouvelle** : la vérification d'imports montre que `LocationProvider`, `AuthProvider`, `AuthGuard`, `Login`, `MainLayout` et `AdminDashboard` **ne sont importés nulle part depuis `main.jsx`/`App.jsx`** → le contournement n'est **pas actif en production aujourd'hui**. C'est une bombe à retardement : la brancher (ou la laisser en place) rend le contournement effectif.

**Correctif** : supprimer intégralement le bloc de contournement, retirer les commentaires contenant le mot de passe, et utiliser exclusivement `supabase.auth`.

---

### 🟠 SEC-7 — Gestion des utilisateurs par « topic » non authentifié (IDOR)

**Fichier** : `src/modules/local/MyStation.jsx` (lignes 15, 43, 74, 127, 134)
```js
const [ntfyTopic, setNtfyTopic] = useState(localStorage.getItem('my_ntfy_topic') || 'client_demo');
...
await supabase.from('user_station_configs').delete().eq('id', id);
await supabase.from('user_station_configs').delete().eq('ntfy_topic', topic);
const { data } = await supabase.from('user_station_configs').select('ntfy_topic');  // liste TOUS les clients
```

**Impact** : il n'y a **aucun `auth.uid()`** dans le filtre. Toute personne qui saisit le topic de quelqu'un d'autre (ou n'importe quel topic puisqu'ils sont tous listés publiquement) peut lire, modifier et **supprimer** ses configurations.

**Correctif** : ajouter une colonne `user_id uuid` + politique RLS `auth.uid() = user_id`, et filtrer via `.eq('user_id', user.id)`.

---

### 🟠 SEC-8 — Écritures base de données depuis le navigateur sans contrôle d'accès

**Constat** : 14 modules créent leur **propre** client Supabase avec la clé anon (pas de client partagé), et écrivent directement : `user_alerts`, `web_links`, `certificats_meteo`, `attestations_intemperies`, `btp_projects`, `btp_config`, `user_station_configs`.

Exemple — `src/modules/admin/QualityControl.jsx` (page « Qualité Données ») appelle `supabase.rpc('get_suspicious_observations')` **sans aucune notion de rôle**.

**Impact** : si le RLS n'est pas airtight sur chacune de ces tables, tout utilisateur anonyme peut écrire/modifier. L'audit ne peut pas vérifier les politiques RLS depuis le dépôt (elles vivent dans Supabase) → **point à contrôler en priorité côté dashboard**.

**Correctif** : (a) RLS activé + `auth.uid()` sur chaque table d'écriture ; (b) réserver les mutations « métier » à des Edge Functions ; (c) supprimer les 14 clients dupliqués au profit de `services/supabaseClient.js`.

---

### 🟠 SEC-9 — Mot de passe AGATE en clair dans l'URL

**Fichier** : `api/cron/archive-foudre.js` (ligne 30), `supabase/functions/archive-strikes/index.ts`, `scratch/fetch_orages_archives.mjs`
```
.../wsOragesGMaps.php?date=...&pass=jh2kH3,R
```
**Impact** : le mot de passe est dans le code, dans les logs Vercel, et potentiellement dans l'historique des proxies.
**Correctif** : variable d'environnement + rotation du mot de passe auprès du fournisseur.

---

### 🟠 SEC-10 — `dist/` (build de production) versionné, avec secrets dedans

**Constat** : `git ls-files dist` → **234 fichiers suivis**, dont `dist/assets/index-*.js` qui **contient les identifiants Météo-France**. Le `.gitignore` ne liste pas `dist/` (seul `.vercelignore` l'exclut du déploiement).

**Impact** : historique Git pollué de bundles obsolètes (le dossier pèse **401 Mo**), et propagation des secrets à chaque commit. Le build est de plus reconstruit par Vercel, donc ces fichiers n'ont aucune utilité en dépôt.

**Correctif** :
```powershell
git rm -r --cached dist
Add-Content .gitignore "dist/"
git commit -m "chore: retirer dist/ du suivi"
```

---

### 🔵 SEC-11 — Documentation contenant les secrets

`OAUTH_AUTOMATIQUE_OK.md`, `README_OAUTH.md` et 46 fichiers `scratch/`/`scripts/` contiennent la *consumer key* Météo-France. **Correctif** : purge des fichiers + réécriture d'historique (`git filter-repo`) si le dépôt a été partagé.

### 🔵 SEC-12 — `VITE_CARTO_KEY` (clé de tuiles) dans le `.env.local`
Clé de tuiles CARTO exposée — comportement normal pour une app cartographique, mais à restreindre par `Referer` sur le dashboard CARTO.

---

## PARTIE 2 — BUGS DE RUNTIME (plantages et comportements cassés)

### 🔴 BUG-1 — Variable non déclarée : plantage garanti de l'onglet « Climatologie »

**Fichier** : `src/modules/climatology/MonthlyClimateTable.jsx`
**Constat** : les identifiants `hasTemp`, `hasRain`, `hasWind` sont utilisés **20 fois** (lignes 288, 291, 301, 304, 314, 327, 330, 340, 343, 350, 436, 440, 444, 447, 455) mais **jamais déclarés** nulle part dans le fichier (vérifié par grep : aucune occurrence de `const hasTemp`).

Le `useMemo` qui calcule `stats` (ligne 156) ne renvoie ni `hasTemp`, ni `hasRain`, ni `hasWind`.

**Impact** : `ReferenceError: hasTemp is not defined` → l'ErrorBoundary affiche l'écran rouge « Something went wrong » dès que l'onglet Climatologie d'une station est ouvert. **En production, l'écran est mort.**

**Correctif** — dériver les drapeaux depuis les données réellement présentes :
```js
const stats = useMemo(() => {
    const valids = monthlyData.filter(d => d.hasData);
    if (valids.length === 0) return null;
    // ...
    return {
        // ... existant
        hasTemp: valids.some(d => d.tx !== null || d.tn !== null),
        hasRain: valids.some(d => typeof d.rr === 'number'),
        hasWind: valids.some(d => d.fxi !== null),
    };
}, [monthlyData]);
```
Puis remplacer dans le JSX `hasTemp` → `stats.hasTemp`, etc. (ou extraire par déstructuration : `const { hasTemp, hasRain, hasWind } = stats || {}`).

---

### 🔴 BUG-2 — Même bug dans l'onglet « Archives climatologiques »

**Fichier** : `src/modules/observations/StationClimArchivesTab.jsx`
**Constat** : `hasTemp`, `hasRain`, `hasWind` utilisés aux lignes 350, 353, 363, 366, 376, 379, 389, 392, 402, 415, 418, 459, 460, 461, 462, 469 — **aucune déclaration**, et le `useMemo` `stats` (ligne 98) ne les retourne pas.

**Impact** : identique au BUG-1 → `ReferenceError` et écran d'erreur sur l'onglet Archives de **toutes** les stations.

**Correctif** :
```js
return {
    // ... existant
    hasTemp: data.some(d => d.tx != null || d.tn != null),
    hasRain: data.some(d => d.rr != null),
    hasWind: data.some(d => d.fxi != null),
};
```

> **Note** : ces deux fichiers sont les **seuls écrans où l'outil a détecté un crash certain**. Ils partagent le même défaut, ce qui suggère une copie de code sans les déclarations.

---

### 🔴 BUG-3 — Import Supabase manquant → `ReferenceError` sur la Supervision

**Fichier** : `src/modules/supervision/SupervisionMap.jsx` (ligne 205)
```js
const checkBilanImage = async (date) => {
    try {
        const { data } = await supabase     // <-- `supabase` n'est JAMAIS importé
            .from('foudre_bilans')
```
Le fichier importe `fetchDepartementsGeoJSON`, `MAIN_CITIES`, `LIGHTNING_DESIGNS`, `CARTO_TILES`… mais **pas** `supabase`.

**Impact** : appelée dans un `setTimeout` (ligne 412) dès qu'on choisit une date passée. Le `try/catch` absorbe le `ReferenceError` → **pas de crash visuel**, mais la fonctionnalité « bilan foudre » ne marche **jamais**. C'est un échec silencieux : tu crois que ça fonctionne, ça ne fonctionne pas.

**Correctif** :
```js
import { supabase } from '../services/supabaseClient';
```

---

### 🟠 BUG-4 — `useMemo` / `require` illégaux dans une boucle de rendu (Galerie foudre)

**Fichier** : `src/modules/maps/RegionalMapGenerator.jsx` (ligne 473)
```js
lightningData.map((s, i) => {
    ...
    const { CircleMarker } = React.useMemo(() => require('react-leaflet'), []);   // ❌❌
```

Trois défauts cumulés :
1. **`require` n'existe pas en ESM** (bundle Vite) → `ReferenceError` à l'exécution.
2. **`useMemo` appelé dans un `.map()`** → viole les règles des Hooks (ordre d'appel variable selon le nombre d'impacts).
3. **`useMemo` appelé dans une callback** → avertissement React garanti.

**Impact** : le mode « foudre » de ce générateur de cartes plante au premier impact.

**Correctif** : sortir `CircleMarker` en import statique en haut du fichier.
```js
import { MapContainer, TileLayer, Marker, useMap, CircleMarker } from 'react-leaflet';
// …
        {/* supprimer la ligne 473 et utiliser directement <CircleMarker/> */}
```

---

### 🟠 BUG-5 — `useState` conditionnel via une expression constante

**Fichier** : `src/modules/foudre/FoudreImportMap.jsx` (ligne 35)
```js
const [strikes, setStrikes] = undefined ? useState([]) : useState([]);
```
`undefined` est toujours falsy → le ternaire évalue toujours `useState([])`. Le code fonctionne **par accident**, mais ESLint lève deux fois `react-hooks/rules-of-hooks` et `no-constant-condition`.

**Correctif** :
```js
const [strikes, setStrikes] = useState([]);
```
*(Composant non routé actuellement — correction de propreté, pas d'urgence.)*

---

### 🟠 BUG-6 — Le rewrite `/ORAGE` existe en dev mais pas en production

**Fichier** : `vite.config.js` (lignes 94-104) vs `vercel.json`
```js
// vite.config.js — présent en développement
'/api-agate': { target: 'https://www.mwattest.fr', ... },
'/ORAGE':     { target: 'https://www.mwattest.fr', ... },   // ← proxy Vite uniquement
```

```json
// vercel.json — en production
{ "source": "/api-agate/(.*)", "destination": "https://www.mwattest.fr/$1" }   // ✅ présent
// ⚠️ aucune entrée "/ORAGE/(.*)"
```

Tous les appels passant par `/ORAGE` (récupération des impacts de foudre Agate en direct) **fonctionnent en local mais renvoient l'`index.html` en production**, à cause du rewrite catch-all final `"/(.*)" → "/index.html"`.

**Impact** : les écrans foudre qui passent par `/ORAGE` en production reçoivent du HTML au lieu de JSON → erreur `res.json()` → carte vide.

**Correctif** : ajouter le rewrite **avant** le catch-all dans `vercel.json` :
```json
{ "source": "/ORAGE/(.*)", "destination": "https://www.mwattest.fr/ORAGE/$1" }
```

---

### 🟠 BUG-7 — Code mort après `return` (règle de couleur Gel ignorée)

**Fichier** : `src/modules/surveillance/SurveillanceMonitor.jsx` (lignes 73-84)
```js
return status;                 // ligne 73  <-- sortie de fonction
if (isLower) {                 // ligne 74  <-- JAMAIS exécuté
    if (config.extreme && val <= config.extreme) status = 'extreme-purple';
    ...
}
return status;                 // ligne 84
```
**Impact** : la classe CSS `extreme-purple` (gel) n'est **jamais** appliquée. Fonctionnalité silencieusement absente.
**Correctif** : supprimer le premier `return status;` (ligne 73).

---

### 🟡 BUG-8 — `getStationHourlyHistory` : décalage potentiel d'un jour

**Fichier** : `src/services/api.js` (ligne 120)
```js
const dStr = d.toISOString().split('T')[0];
```
`toISOString()` convertit en **UTC**. Pour un utilisateur en France (UTC+1/+2), `new Date()` à 00h30 locale donne la veille en UTC → **mauvaise date demandée**.

**Correctif** : utiliser `toLocaleDateString('sv-SE')` (format `YYYY-MM-DD` en heure locale), déjà utilisé ailleurs dans le projet (`SupervisionMap.jsx` ligne 406).

---

### 🟡 BUG-9 — `splitDateRange` : débordement de fuseau sur les bornes

**Fichier** : `src/services/meteoFranceClimService.js` (lignes 22-27)
```js
start: cur.toISOString().split('T')[0],
cur.setDate(cur.getDate() + 1);
```
Même cause : `new Date('2026-01-01')` est interprété en **UTC**, puis `toISOString()` peut renvoyer `2025-12-31` selon le fuseau du poste. Sur un découpage en tranches annuelles, cela peut créer des **trous ou des doublons d'un jour** entre deux tranches.

**Correctif** : manipuler des chaînes `YYYY-MM-DD` et `Date.UTC`, ou parser explicitement `new Date(y, m-1, d)`.

---

### 🟡 BUG-10 — Cache mémoire jamais invalidé pour la date du jour

**Fichier** : `src/services/api.js` (lignes 26-28, 103-105)
```js
if (_stationHistoryCache.has(cacheKey)) return _stationHistoryCache.get(cacheKey);
...
if (finalData.length > 0 && !isToday) { _stationHistoryCache.set(cacheKey, finalData); }
```
Le cache n'est alimenté que pour les dates passées — **c'est correct**. Mais `_stationHistoryCache` n'a **aucune limite de taille** : un utilisateur qui consulte des dizaines de stations sur des dizaines de dates accumule indéfiniment des tableaux en mémoire.

**Correctif** : plafonner (`if (_stationHistoryCache.size > 50) _stationHistoryCache.clear();`) ou utiliser un LRU.

---

### 🟡 BUG-11 — Deux calculs de rafale incohérents dans le même service

**Fichier** : `src/services/meteoFranceClimService.js`
- Chemin **quotidien** (ligne 325) : `Math.max(FXI, FXI3S)` converti en km/h.
- Chemin **horaire** (ligne 537) : si `FXI` et `FXI3S` sont absents, fallback sur **`FF × 1.3`** — une valeur *estimée*, pas une rafale mesurée.

**Impact** : le même poste peut afficher une rafale « mesurée » sur l'onglet quotidien et une rafale « inventée » sur l'onglet horaire, sans que l'utilisateur le sache. Sur des certificats météo, c'est juridiquement sensible.

**Correctif** : ne jamais fabriquer de rafale ; renvoyer `null` et afficher « non mesuré » (le code prévoit déjà ce cas avec les drapeaux `hasWind`… qui plantent, cf. BUG-1/2).

---

### 🟡 BUG-12 — Réponse HTTP non vérifiée sur le geojson départements

**Fichier** : `src/modules/vigilance/VigilanceFrance.jsx` (ligne 109)
```js
const res = await fetch("/data/departements-version-simplifiee.geojson");
const geo = await res.json();       // pas de contrôle res.ok
```
Si le fichier est absent (déploiement partiel), `res.json()` lève une erreur peu explicite.

**Correctif** : `if (!res.ok) throw new Error(...)`.

---

### 🟡 BUG-13 — Fonctions déclarées après leur `useEffect`

**Fichiers** : `src/modules/vigilance/VigilanceFrance.jsx` (l.103 vs l.123), `src/modules/observations/OAuthDiagnostic.jsx` (l.12 vs l.17), `src/modules/rankings/Rankings.jsx` (l.21) + 5 autres signalés par `react-hooks/immutability`.

```js
useEffect(() => { fetchLocalDeptData(selectedDep); }, [selectedDep]);  // ligne 103
const fetchLocalDeptData = async (depCode) => { ... };                  // ligne 123
```
JavaScript autorise cela (hoisting de `const` **non** — ici c'est une flèche en `const`, donc **accès avant initialisation** ⇒ `ReferenceError` si l'effet s'exécute avant la déclaration… ce qui est le cas, car les effets tournent après le rendu complet, donc **ça marche**). C'est un anti-pattern qui casse l'analyse statique et le React Compiler.

**Statut réel** : effet **trompeur** mais **sans bug d'exécution**. La closure de `useEffect` capture la référence de la fonction via l'environnement du composant ; au moment où le callback s'exécute (après le rendu), `fetchLocalDeptData` est déjà initialisé. En revanche la détection statique (React Compiler) est bloquée.

**Correctif** : déclarer les fonctions avant les `useEffect`, idéalement en `useCallback`.

---

### 🔵 BUG-14 — `StrictMode` + effets d'initialisation non idempotents
`src/main.jsx` active `StrictMode` (bien), mais plusieurs effets lancent des `setInterval` et des `fetch` sans garde d'annulation (ex. `VigilanceFrance.jsx`, `MyStation.jsx`). En développement, chaque montage se double → 2× les requêtes. Acceptable en dev, à surveiller pour le quota API.

### 🔵 BUG-15 — `MonthlyClimateTable` / `StationClimArchivesTab` : dépendances d'effet incomplètes
`useEffect(..., [stationId, selectedMonth, selectedYear])` appelle `fetchMonthlyData` qui lit `selectedMonth`/`selectedYear` — fonctionnel, mais ESLint signale `exhaustive-deps`. À envelopper dans `useCallback`.

---

## PARTIE 3 — QUALITÉ DE CODE / LINT

### État des outils

| Outil | Résultat |
|---|---|
| `npm run build` | ✅ **Succès** en 44,45 s — 3 664 modules transformés |
| `npm run lint` (1er essai) | 💥 **Crash heap** — exit code 134 (mémoire insuffisante) |
| `npm run lint` (avec `--max-old-space-size=8192`) | ⚠️ **422 problèmes** sur 74 fichiers / 165 |

> **Constat** : `npm run lint` **plante par défaut** sur ce projet. Il faut fixer `NODE_OPTIONS=--max-old-space-size=8192`. En l'état, **`npm run lint` est inutilisable tel quel** dans une CI.

### Répartition des 422 problèmes

| Règle | Nombre | Sévérité |
|---|---|---|
| `no-unused-vars` | 225 | 🟡 |
| `no-undef` | 81 | 🔴 |
| `react-hooks/exhaustive-deps` | 66 | 🟡 |
| `no-empty` | 22 | 🔵 |
| `react-hooks/immutability` | 8 | 🟡 |
| `react-hooks/set-state-in-effect` | 5 | 🟡 |
| `no-useless-escape` | 4 | 🔵 |
| `react-hooks/rules-of-hooks` | 3 | 🔴 |
| `react-hooks/refs` | 2 | 🟡 |
| `react-refresh/only-export-components` | 2 | 🔵 |
| `react-hooks/preserve-manual-memoization` | 2 | 🔵 |
| `no-constant-condition` | 1 | 🟡 |
| `no-unreachable` | 1 | 🟡 |

### 🟠 LINT-1 — Configuration ESLint : pas d'environnement serveur

**Fichier** : `eslint.config.js` (ligne 18)
```js
globals: globals.browser,       // ← seul environnement déclaré
```
Les 26 `no-undef` sur `process` et `Buffer` dans `api/` sont des **faux positifs** (ce sont des fichiers Node/Edge). En contrepartie, ESLint **n'analyse pas** `scripts/` ni les 40+ fichiers `scratch/`.

**Correctif** : ajouter un bloc de configuration dédié :
```js
{
  files: ['api/**/*.js', 'scripts/**/*.mjs'],
  languageOptions: { globals: { ...globals.node } },
},
```
et ignorer `scratch/` s'il est jetable.

### 🟠 LINT-2 — 225 variables/imports inutilisés

Top fichiers : `CertificatMeteoManager.jsx` (32), `AttestationIntemperieManager.jsx` (18), `BtpManager.jsx` (12), `FoudreFrance.jsx` (11), `RadarFrance.jsx` (10), `refresh-radar.js` (7).

**Impact** : ce ne sont pas que des imports morts — plusieurs sont des **déclarations révélatrices de fonctionnalités abandonnées ou cassées** (ex. `useMemo`, `stationsLookup` dans `RegionalMapGenerator`).

**Correctif** : `npx eslint . --fix` traite une partie, le reste à relire manuellement.

### 🟡 LINT-3 — 66 dépendances d'effet incomplètes
Réelles par ordre d'importance : `BtpManager` (4), `RegionalMapGenerator` (4), `DailyExtremes` (3), `MyStation` (2), `VigilanceFrance` (2), `SupervisionMap` (2)… → risques de **données périmées à l'affichage** après changement de filtre.

### 🟡 LINT-4 — 22 blocs `catch` vides
`StationDetail.jsx` (6), `AttestationIntemperieManager.jsx`, `CertificatMeteoManager.jsx` (3), `meteoFranceAuth.js` (2)…
**Impact** : les erreurs **disparaissent sans trace**. Combiné au BUG-3 (échec silencieux), c'est un thème récurrent : les erreurs sont avalées.

**Correctif** : au minimum `catch (e) { console.warn('[contexte]', e); }`.

### 🔵 LINT-5 — 4 échappements inutiles, 2 exports mixtes (`AuthProvider`, `LocationContext`)
Non bloquant, mais `react-refresh/only-export-components` casse le **Fast Refresh** en développement.

---

## PARTIE 4 — ARCHITECTURE / DETTE

### 🟠 ARCH-1 — 15 modules React jamais importés (code mort, ~250 Ko de source)

Vérifié par scan des imports sur tout `src/` :

| Module orphelin | Fichier |
|---|---|
| ModeleFrance | `modules/modele/ModeleFrance.jsx` (26 Ko) |
| ModelComparison | `modules/alertes/ModelComparison.jsx` (13 Ko) |
| BulletinView | `modules/bulletins/BulletinView.jsx` |
| ObservationsMap | `modules/observations/ObservationsMap.jsx` (21 Ko) |
| DashboardHome | `modules/dashboard/DashboardHome.jsx` (14 Ko) |
| MeteoNational | `modules/observations/MeteoNational.jsx` (24 Ko) |
| StationsTable | `modules/observations/StationsTable.jsx` (23 Ko) |
| FoudreCommunes | `modules/foudre/FoudreCommunes.jsx` (14 Ko) |
| FoudreGallery | `modules/foudre/FoudreGallery.jsx` |
| SurveillanceMonitor | `modules/surveillance/SurveillanceMonitor.jsx` (18 Ko) |
| ArrosageMonitor | `modules/surveillance/ArrosageMonitor.jsx` |
| DJUCalculator | `modules/statistiques/DJUCalculator.jsx` |
| DepartmentView | `modules/observations/DepartmentView.jsx` |
| StationsList | `modules/observations/StationsList.jsx` |
| ForecastDailyTable / ForecastJ9 | `modules/forecasts/*` |

Plus `MainLayout.jsx`, `MapGeneratorsHub.jsx`, `CertificateRequest.jsx`, `OAuthDiagnostic.jsx`, `FoudreImportMap.jsx`, `Rankings.jsx`, `auth/*`, `contexts/*`, `components/CitySearch.jsx`.

**Impact** : confusion sur ce qui est « vivant », maintenance à double, et `MapGeneratorsHub` rend `RegionalMapGenerator` **inaccessible** (donc le BUG-4 est latent, pas actif).

**Correctif** : décider module par module — router, ou supprimer.

### 🟠 ARCH-2 — `constants.js` du module foudre mort ; palette dupliquée 7 fois

`src/modules/foudre/constants.js` exporte `HOUR_COLORS`, `MAP_PALETTES`, `DEFAULT_RADII`, `LIVE_REFRESH_INTERVAL`, `RECENT_STRIKE_THRESHOLD` — **aucun fichier ne l'importe**. La palette `HOUR_COLORS` est recopiée à l'identique dans 7 fichiers (`SupervisionMap`, `FoudreDesignGallery`, `FoudreExpert`, `FoudreCommunes`, `FoudreFrance`, `RegionalMapGenerator`, `VectorRegionPreview`).

**Impact** : un changement de palette exige 7 modifications synchronisées → risque de divergence visuelle.

**Correctif** : importer depuis `constants.js` et supprimer les copies.

### 🟠 ARCH-3 — 14 clients Supabase dupliqués

`createClient(...)` est instancié indépendamment dans : `AlertsManager`, `QualityControl`, `DashboardHome`, `DailyExtremes`, `LinksManager`, `CitySearch`, `VigilanceFrance`, `MyStation`, `RadarFrance`, `LiveObservations`, `RegionalMapGenerator`, plus `services/api.js` et `services/supabaseClient.js`.

**Impact** : 14 sessions/websockets/auth-listeners parallèles, ~14× la mémoire du SDK, et **aucune politique de session cohérente**. C'est aussi ce qui rend SEC-7/SEC-8 difficiles à corriger globalement.

**Correctif** : un seul client dans `services/supabaseClient.js` (qui existe déjà et gère le cas « non configuré »), importé partout.

### 🟡 ARCH-4 — Chunk principal de 5,7 Mo (1,19 Mo gzip)

```
dist/assets/index-E5nIbShO.js   5 733,74 kB │ gzip: 1 189,78 kB
```
`manualChunks` isole react/leaflet/recharts/d3/pdf/supabase, mais **toutes les ~50 pages** finissent dans le même chunk. La première visite télécharge donc l'intégralité de l'application, y compris les modules jamais visités.

**Correctif** : `React.lazy()` + `Suspense` sur les routes de `App.jsx` (gain estimé : −70 % sur le premier chargement).

### 🟡 ARCH-5 — `index.html` non finalisé

```html
<html lang="en">                     <!-- devrait être "fr" -->
<link rel="icon" href="/vite.svg" /> <!-- favicon par défaut Vite -->
<title>minisite-douai</title>        <!-- nom technique, pas le nom du produit -->
```
Aucune meta description, aucun Open Graph. **Impact** : SEO et partages sociaux dégradés malgré un produit « Météo-Climat Pro » abouti.

### 🟡 ARCH-6 — Config de déploiement redondante et incohérente

Trois systèmes de redirection coexistent : `vercel.json`, `netlify.toml`, `public/_redirects`, plus `vite.config.js` en dev. Ils **ne sont pas alignés** :

| Proxy | Vite (dev) | `vercel.json` | `netlify.toml` | `_redirects` |
|---|---|---|---|---|
| `/api-meteo` | ✅ | ✅ | ✅ | ✅ |
| `/api-meteo-paquet` | ✅ | ✅ | ✅ | ✅ |
| `/api-meteo-poste` | ✅ | ✅ | ✅ | ❌ |
| `/api-meteo-clim` | ✅ | ✅ | ❌ | ❌ |
| `/api-radar-mf` | ✅ | ✅ | ❌ | ❌ |
| `/api-agate` | ✅ | ✅ | ✅ | ❌ |
| `/ORAGE` | ✅ | ❌ | ❌ | ❌ |
| `/api-meteociel` | ✅ | ✅ | ❌ | ❌ |
| `/mf-token` | ✅ (proxy direct) | ✅ | ❌ | ❌ |

**Impact** : un déploiement Netlify casse immédiatement les archives climatologiques (`/api-meteo-clim`), le radar et le token MF. **Le `.gitignore`/la doc ne dit pas quel hébergeur fait foi**.

**Correctif** : choisir **Vercel** (seul complet), et supprimer `netlify.toml` + `public/_redirects` (ou les compléter).

### 🟡 ARCH-7 — Deux sources de vérité pour les normales 1991-2020

`src/data/normals_1991_2020.json` contient **4 stations seulement**, dont **deux entrées Douai** (`59606004` et `59178001`) avec des valeurs identiques. La vraie source est la table Supabase `station_climatology`.

**Impact** : pour 99 % des stations, `primaryNormals` reste `null` (CitySearch ligne 132) et la comparaison aux normales est silencieusement absente.

### 🔵 ARCH-8 — `src/data/` : 8,5 Mo de JSON chargés selon les pages
`all_stations_records.json` (4,5 Mo) et `global_daily_records.json` (2,2 Mo) sont importés **statiquement** par `ClimatologyDashboard`, `StationArchives` et `HDFRadar` → ils sont inclus dans le chunk principal. Un `fetch()` + cache serait bien plus adapté (voire un passage en table Supabase).

### 🔵 ARCH-9 — `no-undef` : le même bug corrigé deux fois ailleurs

Le service DPClim (`parseDPClimCSV`) convertit correctement les rafales en km/h via `× 3.6` (ligne 326). Mais `api/cron/archive-foudre.js` (ligne 44) écrit `T${s.heure}+01:00` — **fuseau fixe UTC+1**, faux en heure d'été. Une heure d'orage peut être décalée de 60 minutes.

### 🔵 ARCH-10 — Dépendances inutilisées détectées par `depcheck`
`sharp`, `tweetsodium` (aucun import trouvé dans `src/`, `api/`, `scripts/`) et `@types/react`, `@types/react-dom` (pas de TypeScript).

**Correctif** : `npm uninstall sharp tweetsodium`, avec vérification préalable (il existe peut-être des imitations en `scripts/meteo/`).

---

## PARTIE 5 — HISTORIQUE GIT

### 🟠 GIT-1 — 100 % de commits « chore(foudre) »

```
d5c0e17 chore(foudre): archivage automatique statique foudre [skip ci] [skip vercel]
875acdd chore(foudre): archivage automatique statique foudre [skip ci] [skip vercel]
d0fc344 chore(foudre): archivage automatique statique foudre [skip ci] [skip vercel]
2c2f120 chore(foudre): archivage automatique statique foudre [skip ci] [skip vercel]
76579e5 chore(foudre): archivage automatique statique foudre [skip ci] [skip vercel]
c244fe1 chore(foudre): archivage automatique statique foudre [skip ci] [skip vercel]
965bd8c chore(foudre): archivage automatique statique foudre [skip ci] [skip vercel]
9846f63 chore(foudre): archivage automatique statique foudre [skip ci] [skip vercel]
```
Un script automatique (`scripts/git_archive_foudre.mjs`) commit **des données binaires dans Git** toutes les quelques heures. **Le dépôt est saturé** : `dist/` pèse 401 Mo, `public/archives_orage/` jusqu'à 18 Mo par fichier.

**Impact** : clonage très lent, historique illisible (`git log` ne montre plus le travail réel), et **aucune traçabilité du vrai développement**.

**Correctif** : arrêter `git_archive_foudre.mjs`, stocker les archives dans Supabase Storage, et ne réserver Git qu'au code.

### 🟡 GIT-2 — `dist/` suivi (234 fichiers) — cf. SEC-10

### 🟡 GIT-3 — Secrets dans 3 commits (MF key & secret, service_role JWT), 1 commit (alert secret), 4 commits (mot de passe AGATE)

Révéler l'historique avec `git filter-repo` **ne suffit pas** : les valeurs doivent être **révoquées et régénérées**. Priorité à l'exécution des révocation avant toute réécriture.

### 🔵 GIT-4 — Pourquoi Git ne voyait pas le problème

`.gitignore` **contient déjà** `.env*` et `.env*.local` — donc les **fichiers `.env` sont bien protégés**. Les secrets qui fuient ne viennent **pas** des `.env` mais de :

1. valeurs **écrites en dur dans le code** (`meteoFranceAuth.js`, `send-alert.js`, `archive-foudre.js`) ;
2. documentation (`.md`) et scripts jetables (`scratch/`) ;
3. la config `.git/config` (token GitHub).

→ C'est le point le plus important : **la vigilance `.env` est correcte ; c'est la culture « hardcode pour tester » qui coûte cher ici.**

---

## PARTIE 6 — CE QUI EST BIEN FAIT ✅

Pour être juste, l'audit a relevé de vrais points de qualité :

| Point | Détail |
|---|---|
| ✅ Build stable | Aucune erreur de compilation, 3 664 modules, warnings maîtrisés |
| ✅ ErrorBoundary en place | `src/ErrorBoundary.jsx` capte les erreurs de rendu |
| ✅ `StrictMode` activé | Détection des effets non idempotents en dev |
| ✅ Découpage vendor correct | react/leaflet/recharts/d3/pdf/supabase isolés |
| ✅ Parsing DPClim robuste | Gestion des `null`, virgules décimales, `FXI`/`FXI3S`, fuseaux horaires `padStart` |
| ✅ Retry / polling corrects | `_fetchSingleStationHistory` gère 401→refresh token, 204→attente, 404/410→sortie |
| ✅ Cache applicatif | `monthlyClimCache`, `_stationHistoryCache` évitent des appels redondants |
| ✅ Gestion « non mesuré » prévue | Le modèle de données distingue explicitement les postes sans thermomètre/pluviomètre/anémomètre |
| ✅ `.env` bien ignoré | `.env*` et `.env*.local` dans `.gitignore` |
| ✅ Pas de dépendance manquante | Les 26 dépendances déclarées sont installées |
| ✅ `public/data/*.geojson` servis localement | Pas de dépendance à un CDN tiers pour la géographie |

---

## PLAN D'ACTION RECOMMANDÉ

### Phase 0 — Immédiat (< 1 heure)

| # | Action | Référence |
|---|---|---|
| 1 | Révoquer le token GitHub `gho_REDACTED…`, réécrire l'URL du remote sans identifiants | SEC-1 |
| 2 | Révoquer la clé Resend `re_E1j1…`, régénérer `service_role` Supabase, changer le mot de passe AGATE | SEC-3, SEC-4, SEC-9 |
| 3 | Régénérer la *consumer key/secret* Météo-France sur le portail | SEC-2 |
| 4 | Configurer `CRON_SECRET`, `RESEND_API_KEY`, `ALERT_SECRET` dans Vercel, et **fermer** les 5 crons | SEC-5 |
| 5 | Corriger `hasTemp`/`hasRain`/`hasWind` (2 fichiers) | BUG-1, BUG-2 |
| 6 | Ajouter `import { supabase }` dans `SupervisionMap.jsx` | BUG-3 |

### Phase 1 — Semaine 1

| # | Action | Référence |
|---|---|---|
| 7 | Supprimer le fallback navigateur Météo-France et le contournement auth « Douai » | SEC-2, SEC-6 |
| 8 | `git rm -r --cached dist` + `dist/` dans `.gitignore` | SEC-10 |
| 9 | Corriger `RegionalMapGenerator` (`CircleMarker` en import) | BUG-4 |
| 10 | Corriger le code mort de `SurveillanceMonitor` | BUG-7 |
| 11 | Ajouter le rewrite `/ORAGE` dans `vercel.json` | BUG-6 |
| 12 | Traités 225 `no-unused-vars` : `eslint --fix` puis relecture | LINT-2 |
| 13 | Fixer `NODE_OPTIONS` pour que `npm run lint` ne plante plus | LINT / CI |

### Phase 2 — Mois 1

| # | Action | Référence |
|---|---|---|
| 14 | Unifier sur `services/supabaseClient.js` ; mettre en place RLS + `auth.uid()` partout | ARCH-3, SEC-7, SEC-8 |
| 15 | `React.lazy()` sur les routes → redescendre le chunk sous 2 Mo | ARCH-4 |
| 16 | Décider du sort des 15 modules orphelins | ARCH-1 |
| 17 | Centraliser `HOUR_COLORS` dans `constants.js` | ARCH-2 |
| 18 | Arrêter le cron de commit d'archives foudre | GIT-1 |
| 19 | Choisir **Vercel** seul et nettoyer `netlify.toml` / `_redirects` | ARCH-6 |
| 20 | Corriger les dates UTC → locales dans `api.js` et `meteoFranceClimService.js` | BUG-8, BUG-9 |

### Phase 3 — Amélioration continue

| # | Action | Référence |
|---|---|---|
| 21 | `index.html` : `lang="fr"`, titre produit, meta description, Open Graph, favicon | ARCH-5 |
| 22 | Remplacer les fallbacks de rafale fabriqués par `null` | BUG-11 |
| 23 | Tracer les 22 `catch` vides | LINT-4 |
| 24 | Analyser `scripts/` et `api/` avec le bon environnement ESLint | LINT-1 |
| 25 | Normales 1991-2020 : source unique Supabase (supprimer le JSON à 4 stations) | ARCH-7 |
| 26 | Évaluer `sharp` / `tweetsodium` | ARCH-10 |

---

## ANNEXE — MÉTHODE D'AUDIT

| Vérification | Commande / Méthode |
|---|---|
| Build de production | `npm run build` → ✅ 44,45 s |
| Lint complet | `npx eslint src api scripts --format json` (avec heap 8 Go) |
| Dépendances | `depcheck`, comparaison `package.json` ↔ `node_modules` |
| Secrets dans le bundle | recherche des littéraux dans `dist/assets/*.js` |
| Secrets dans Git | `git log -S'<secret>' --all`, `git grep -F` |
| Imports orphelins | scan des `import` sur l'ensemble de `src/` |
| Lecture manuelle | ~60 fichiers : `main.jsx`, `App.jsx`, `Sidebar`, `ErrorBoundary`, `api.js`, `meteoFranceClimService.js`, `meteoFranceAuth.js`, `api/*.js`, `api/cron/*.js`, `MonthlyClimateTable`, `StationClimArchivesTab`, `SupervisionMap`, `RegionalMapGenerator`, `VigilanceFrance`, `AuthProvider`, `LocationContext`, `MyStation`, `escays`, `vite.config.js`, `vercel.json`, `netlify.toml`, `_redirects`, `.github/workflows/*` |

**Limites de l'audit** :
- Les politiques **RLS Supabase ne sont pas dans le dépôt** → non vérifiables ici (cf. SEC-8, à contrôler côté dashboard).
- Aucun test automatisé n'existe dans le projet → les régressions ne sont pas détectables en CI.
- Le dossier `scratch/` (146 fichiers) n'a été qu'échantillonné.
- L'audit est statique : il n'a pas exécuté l'application dans un navigateur.

---

*Fin du rapport.*



