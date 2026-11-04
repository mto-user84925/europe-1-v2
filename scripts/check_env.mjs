#!/usr/bin/env node
/**
 * Vérification de la configuration d'environnement — Météo-Climat Pro
 *
 * Usage :
 *   node scripts/check_env.mjs
 *
 * Lit `.env.local` (ou `.env`), puis :
 *   1. contrôle la présence des variables obligatoires ;
 *   2. vérifie que les secrets ne sont pas exposés au navigateur (VITE_*) ;
 *   3. teste réellement le token Météo-France et l'accès Supabase.
 *
 * Aucune valeur n'est affichée : seuls le statut et la longueur le sont.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---------- chargement .env.local / .env ----------
function loadEnv() {
    const candidates = ['.env.local', '.env'];
    const env = {};
    for (const file of candidates) {
        const p = path.join(ROOT, file);
        if (!fs.existsSync(p)) continue;
        const txt = fs.readFileSync(p, 'utf8');
        for (const rawLine of txt.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) continue;
            const eq = line.indexOf('=');
            if (eq === -1) continue;
            const key = line.slice(0, eq).trim();
            let val = line.slice(eq + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            env[key] = val;
        }
        console.log(`[.env] chargé : ${file}`);
    }
    // Les variables déjà présentes dans le processus ont priorité (CI / Vercel)
    return { ...env, ...process.env };
}

const ENV = loadEnv();

// ---------- utilitaires d'affichage ----------
const C = {
    ok: (s) => `\x1b[32m${s}\x1b[0m`,
    ko: (s) => `\x1b[31m${s}\x1b[0m`,
    warn: (s) => `\x1b[33m${s}\x1b[0m`,
    dim: (s) => `\x1b[2m${s}\x1b[0m`,
    bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

let failures = 0;
let warnings = 0;

const result = (label, status, detail = '') => {
    const icon = status === 'ok' ? C.ok('✅') : status === 'warn' ? C.warn('⚠️ ') : C.ko('❌');
    console.log(`${icon} ${label}${detail ? C.dim(' — ' + detail) : ''}`);
    if (status === 'ko') failures++;
    if (status === 'warn') warnings++;
};

const info = (key) => {
    const v = ENV[key];
    if (!v) return C.dim('(absente)');
    // On n'affiche jamais la valeur : uniquement sa longueur.
    return C.dim(`(${v.length} car.)`);
};

// ---------- 1. variables obligatoires ----------
console.log(C.bold('\n═══ 1. Variables obligatoires ═══'));

const REQUIRED = [
    ['VITE_SUPABASE_URL', 'URL Supabase (navigateur)'],
    ['VITE_SUPABASE_ANON_KEY', 'Clé anon Supabase (navigateur)'],
    ['SUPABASE_URL', 'URL Supabase (serveur)'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'Clé service_role (serveur)'],
    ['MF_CONSUMER_KEY', 'Clé Météo-France'],
    ['MF_CONSUMER_SECRET', 'Secret Météo-France'],
    ['CRON_SECRET', 'Secret des crons'],
];

for (const [key, desc] of REQUIRED) {
    result(desc, ENV[key] ? 'ok' : 'ko', `${key} ${info(key)}`);
}

const OPTIONAL = [
    ['RESEND_API_KEY', 'Clé Resend (e-mails)'],
    ['ALERT_SECRET', 'Secret alertes e-mail'],
    ['AGATE_PASS', 'Mot de passe AGATE'],
    ['MF_RADAR_API_KEY', 'Clé radar Météo-France'],
    ['VITE_CARTO_KEY', 'Clé tuiles CARTO'],
];
for (const [key, desc] of OPTIONAL) {
    result(desc, ENV[key] ? 'ok' : 'warn', `${key} ${info(key)}`);
}

// ---------- 2. hygiène sécurité ----------
console.log(C.bold('\n═══ 2. Hygiène sécurité ═══'));

// 2a. Aucun secret dans une variable VITE_ (exposée au navigateur)
const SECRET_KEYS = ['SUPABASE_SERVICE_ROLE_KEY', 'MF_CONSUMER_KEY', 'MF_CONSUMER_SECRET', 'RESEND_API_KEY', 'ALERT_SECRET', 'AGATE_PASS', 'CRON_SECRET'];
let leak = false;
for (const key of SECRET_KEYS) {
    const v = ENV[key];
    if (!v || v.length < 12) continue;
    for (const [vk, vv] of Object.entries(ENV)) {
        if (!vk.startsWith('VITE_') || !vv) continue;
        if (vv === v) {
            result(`FUITE : ${key} exposé via ${vk}`, 'ko', 'jamais de secret dans VITE_');
            leak = true;
        }
    }
}
if (!leak) result('Aucun secret exposé via une variable VITE_', 'ok');

// 2b. CRON_SECRET assez solide
if (ENV.CRON_SECRET) {
    if (ENV.CRON_SECRET.length < 32) {
        result('CRON_SECRET trop court', 'warn', `${ENV.CRON_SECRET.length} car. — recommander 32+`);
    } else {
        result('CRON_SECRET suffisamment long', 'ok');
    }
}

// 2c. Valeurs connues comme fuitées (présentes dans l'historique Git)
const KNOWN_LEAKED = [
    'Mhar9YSs8LEluq4neXqP0YeHaaka',
    'nDKPWzVr2_2o5Ej1aPZa7O6hu4Ia',
    'jh2kH3,R',
    'meteo-alert-secure-token-2026',
];
const found = KNOWN_LEAKED.filter((v) => Object.values(ENV).some((x) => x === v));
if (found.length) {
    result('Valeurs compromises encore utilisées', 'ko', `${found.length} valeur(s) de l'historique Git`);
} else {
    result('Aucune valeur compromise connue détectée', 'ok');
}

// ---------- 3. tests réseau ----------
console.log(C.bold('\n═══ 3. Tests réseau ═══'));

async function testMeteoFrance() {
    if (!ENV.MF_CONSUMER_KEY || !ENV.MF_CONSUMER_SECRET) {
        result('Token Météo-France', 'warn', 'identifiants absents — test ignoré');
        return;
    }
    try {
        const creds = Buffer.from(`${ENV.MF_CONSUMER_KEY}:${ENV.MF_CONSUMER_SECRET}`).toString('base64');
        const res = await fetch('https://portail-api.meteofrance.fr/token', {
            method: 'POST',
            headers: {
                Authorization: `Basic ${creds}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'grant_type=client_credentials',
        });
        if (!res.ok) {
            result('Token Météo-France', 'ko', `HTTP ${res.status}`);
            return;
        }
        const data = await res.json();
        result('Token Météo-France', data.access_token ? 'ok' : 'ko', `expire dans ${data.expires_in || '?'}s`);
    } catch (e) {
        result('Token Météo-France', 'ko', e.message);
    }
}

async function testSupabase() {
    const url = ENV.SUPABASE_URL || ENV.VITE_SUPABASE_URL;
    const key = ENV.SUPABASE_SERVICE_ROLE_KEY || ENV.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) {
        result('Supabase', 'warn', 'configuration absente — test ignoré');
        return;
    }
    try {
        // Lecture légère : 1 ligne de la table stations
        const res = await fetch(`${url}/rest/v1/stations?select=id&limit=1`, {
            headers: { apikey: key, Authorization: `Bearer ${key}` },
        });
        if (res.ok) {
            result('Supabase (lecture stations)', 'ok', `HTTP ${res.status}`);
        } else {
            result('Supabase (lecture stations)', 'ko', `HTTP ${res.status}`);
        }
    } catch (e) {
        result('Supabase', 'ko', e.message);
    }
}

async function testRlsUserStationConfigs() {
    const url = ENV.SUPABASE_URL || ENV.VITE_SUPABASE_URL;
    const serviceKey = ENV.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = ENV.VITE_SUPABASE_ANON_KEY;
    if (!url || !serviceKey || !anonKey) {
        result('RLS user_station_configs', 'warn', 'configuration incomplète — test ignoré');
        return;
    }
    try {
        // Avec la clé ANON, `client_id` doit exister ET l'écriture anonyme être bloquée.
        const res = await fetch(`${url}/rest/v1/user_station_configs?select=client_id&limit=1`, {
            headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        });
        if (res.status === 400 || res.status === 404) {
            const txt = await res.text();
            if (/client_id/i.test(txt)) {
                result('Colonne client_id', 'ko', 'absente — exécuter le SQL fourni');
                return;
            }
        }
        result('Colonne client_id', 'ok', `HTTP ${res.status}`);

        // Tentative d'INSERT anonyme : doit être refusée.
        const ins = await fetch(`${url}/rest/v1/user_station_configs`, {
            method: 'POST',
            headers: {
                apikey: anonKey,
                Authorization: `Bearer ${anonKey}`,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal',
            },
            body: JSON.stringify({ client_id: '__rls_probe__', ntfy_topic: '__rls_probe__' }),
        });
        if (ins.status === 201) {
            result('Écriture anonyme refusée', 'ko', 'INSERT anon autorisé — RLS trop permissif');
        } else if (ins.status === 401 || ins.status === 403) {
            result('Écriture anonyme refusée', 'ok', `HTTP ${ins.status}`);
        } else {
            result('Écriture anonyme refusée', 'warn', `HTTP ${ins.status} — à vérifier manuellement`);
        }
    } catch (e) {
        result('RLS user_station_configs', 'warn', e.message);
    }
}

await testMeteoFrance();
await testSupabase();
await testRlsUserStationConfigs();

// ---------- bilan ----------
console.log(C.bold('\n═══ BILAN ═══'));
console.log(`Échecs : ${failures ? C.ko(failures) : C.ok(0)}   Avertissements : ${warnings ? C.warn(warnings) : C.ok(0)}`);

if (failures > 0) {
    console.log(C.ko('\nDes blocages ont été détectés. Corrige-les avant de déployer.'));
    // exitCode plutôt que process.exit() : laisse Node fermer proprement
    // les sockets réseau encore ouverts (sinon assertion libuv sous Windows).
    process.exitCode = 1;
} else {
    console.log(C.ok('\nConfiguration cohérente.'));
    process.exitCode = 0;
}
