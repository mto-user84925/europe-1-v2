import fs from 'fs';
import path from 'path';

function mapDescriptionToTemps(desc) {
    if (!desc) return 'soleil';
    const d = desc.toLowerCase();
    if (d.includes('orage')) return 'orages';
    if (d.includes('grêle') || d.includes('grele')) return 'grele';
    if (d.includes('forte neige') || d.includes('fortes chutes de neige')) return 'forteneige';
    if (d.includes('neige')) return 'neige';
    if (d.includes('pluie forte') || d.includes('fortes pluies') || d.includes('pluies fortes')) return 'pluieforte';
    if (d.includes('averse') || d.includes('ondée')) return 'averse';
    if (d.includes('brouillard') || d.includes('brume')) return 'brouillard';
    if (d.includes('pluie') || d.includes('bruine')) return 'pluie';
    if (d.includes('couvert')) return 'couvert';
    if (d.includes('voilé') || d.includes('soleil voilé') || d.includes('très nuageux') || d.includes('nuageux')) return 'nuageux';
    if (d.includes('éclaircie') || d.includes('eclaircie') || d.includes('peu nuageux')) return 'eclaircies';
    if (d.includes('clair') || d.includes('ensoleillé') || d.includes('soleil') || d.includes('beau')) return 'soleil';
    return 'nuageux';
}

const MONTHS_EN = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
];

const JOURS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

// Chargement des saints depuis saints.json
let saintsData = {};
try {
    const saintsPath = path.join(process.cwd(), 'saints.json');
    if (fs.existsSync(saintsPath)) {
        saintsData = JSON.parse(fs.readFileSync(saintsPath, 'utf8'));
    }
} catch (e) {
    console.error('Erreur chargement saints.json:', e);
}

function getSaint(dateObj) {
    const month = MONTHS_EN[dateObj.getMonth()];
    const dayIdx = dateObj.getDate() - 1;
    const list = saintsData[month] || [];
    if (dayIdx < list.length) {
        const item = list[dayIdx];
        const name = item[0] || '';
        const prefix = item[1] || '';
        if (prefix === 'Saint') return `St ${name}`;
        if (prefix === 'Sainte') return `Ste ${name}`;
        if (prefix) return `${prefix} ${name}`.trim();
        return name;
    }
    return 'St Météo';
}

// Gestion dynamique du Token 0 Météo-France
let cachedToken = null;
let tokenTimestamp = 0;

const rot13 = (s) => s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode((c.charCodeAt(0) - base + 13) % 26 + base);
});

async function getSessionToken() {
    const now = Date.now();
    if (cachedToken && (now - tokenTimestamp < 3600 * 1000)) {
        return cachedToken;
    }
    try {
        const res = await fetch('https://vigilance.meteofrance.fr/fr', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const cookie = res.headers.get('set-cookie') || '';
        const m = cookie.match(/mfsession=([^;]+)/);
        if (m) {
            cachedToken = rot13(decodeURIComponent(m[1]));
            tokenTimestamp = now;
            return cachedToken;
        }
    } catch (err) {
        console.error('Erreur getSessionToken Météo-France:', err);
    }
    return cachedToken;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    const lat = req.query.lat ? parseFloat(req.query.lat) : 45.76;
    const lon = req.query.lon ? parseFloat(req.query.lon) : 4.84;
    const days = req.query.days ? Math.min(15, Math.max(1, parseInt(req.query.days))) : 7;

    try {
        const token = await getSessionToken();
        if (!token) {
            throw new Error('Impossible de récupérer le token de session Météo-France');
        }

        const mfUrl = `https://rwg.meteofrance.com/internet2018client/2.0/forecast?lat=${lat}&lon=${lon}&token=${token}`;
        const response = await fetch(mfUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const data = await response.json();
        const dailyForecast = data?.properties?.daily_forecast || [];

        const now = new Date();
        const lastBuildDate = now.toUTCString();

        let itemsXml = '';
        const selectedDays = dailyForecast.slice(0, days);

        selectedDays.forEach((dayData, i) => {
            const dateStr = dayData.time.substring(0, 10);
            const dt = new Date(`${dateStr}T12:00:00Z`);

            let dateNom = '';
            if (i === 0) dateNom = "Aujourd'hui";
            else if (i === 1) dateNom = 'Demain';
            else if (i === 2) dateNom = 'Après-demain';
            else {
                const dayIndex = (dt.getUTCDay() + 6) % 7; // 0=Lundi
                dateNom = JOURS_FR[dayIndex];
            }

            const saint = getSaint(dt);
            const tMin = dayData.T_min !== null && dayData.T_min !== undefined ? Math.round(dayData.T_min) : '';
            const tMax = dayData.T_max !== null && dayData.T_max !== undefined ? Math.round(dayData.T_max) : '';
            const temps = mapDescriptionToTemps(dayData.daily_weather_description);

            itemsXml += `\t\t<item>\n` +
                `\t\t\t<date>${dateStr}</date>\n` +
                `\t\t\t<date_nom>${dateNom}</date_nom>\n` +
                `\t\t\t<saint>${saint}</saint>\n` +
                `\t\t\t<temp_min>${tMin}</temp_min>\n` +
                `\t\t\t<temp_max>${tMax}</temp_max>\n` +
                `\t\t\t<temps>${temps}</temps>\n` +
                `\t\t</item>\n`;
        });

        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
            `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
            `\t<channel>\n` +
            `\t\t<title>Météo-Climat Pro - Météo</title>\n` +
            `\t\t<link>https://europe-1-v2.vercel.app/rss/bigcompany.php</link>\n` +
            `\t\t<description>Météo - Météo-Climat Pro</description>\n` +
            `\t\t<language>fr</language>\n` +
            `\t\t<lastBuildDate>${lastBuildDate}</lastBuildDate>\n` +
            `\t\t<copyright>copyright ${now.getFullYear()} - Météo-Climat Pro</copyright>\n` +
            `\t\t<atom:link href="https://europe-1-v2.vercel.app/rss/bigcompany.php" rel="self" type="application/rss+xml"/>\n` +
            itemsXml +
            `\t</channel>\n` +
            `</rss>\n`;

        return res.status(200).send(xml);
    } catch (err) {
        console.error('Erreur génération flux RSS:', err.message);
        return res.status(500).send(`<?xml version="1.0" encoding="UTF-8"?><error>Service temporairement indisponible</error>`);
    }
}
