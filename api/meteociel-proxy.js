// Vercel Serverless Function : Proxy Camouflé et Cache CDN Edge pour Météociel
// Élimine toute détection par Météociel (Referer www.meteociel.fr, User-Agent Chrome légitime)
// Cache les archives historiques au niveau du CDN Vercel pour 1 an (0 appel redondant)

import https from 'https';

export default async function handler(req, res) {
    try {
        // Extraire le chemin demandé en préservant TOUS les paramètres de requête
        // (ex: path=temps-reel/obs_villes.php, code2=59606004, jour2=1, mois2=9, annee2=2026, affint=1)
        const basePath = req.query.path || (req.url.replace(/^\/api\/meteociel-proxy\??/, '').replace(/^path=/, ''));
        if (!basePath) {
            return res.status(400).json({ error: 'Missing path parameter' });
        }

        const queryParams = new URLSearchParams();
        for (const [k, v] of Object.entries(req.query || {})) {
            if (k !== 'path') queryParams.append(k, v);
        }
        const qs = queryParams.toString();
        const rawPath = basePath + (qs ? (basePath.includes('?') ? '&' : '?') + qs : '');
        const cleanPath = rawPath.startsWith('/') ? rawPath.substring(1) : rawPath;

        // 1. Tenter en priorité le proxy Netlify (IP rotatives CDN + cookie archivebotok=1)
        const netlifyUrl = `https://visionary-chebakia-465960.netlify.app/api-meteociel/${cleanPath}`;
        const meteocielDirectUrl = `https://www.meteociel.fr/${cleanPath}`;

        const isPastArchive = cleanPath.includes('archive=1') || cleanPath.includes('annee2=') || cleanPath.includes('mois2=');

        const fetchUpstream = (targetUrl) => new Promise((resolve, reject) => {
            const options = {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'Referer': 'https://www.meteociel.fr/',
                    'Cookie': 'meteociel=57a0e34041b9c18fed3d0f2b2800ba53; archivebotok=1',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'same-origin',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1'
                }
            };
            const reqUp = https.get(targetUrl, options, (resUp) => {
                const chunks = [];
                resUp.on('data', c => chunks.push(c));
                resUp.on('end', () => resolve({ statusCode: resUp.statusCode || 200, buffer: Buffer.concat(chunks) }));
            });
            reqUp.on('error', reject);
            reqUp.setTimeout(12000, () => {
                reqUp.destroy();
                reject(new Error('Timeout upstream (12s)'));
            });
        });

        let result;
        try {
            result = await fetchUpstream(netlifyUrl);
            if (result.statusCode >= 400) throw new Error(`Netlify HTTP ${result.statusCode}`);
        } catch (_errNetlify) {
            // Repli direct sur meteociel.fr
            result = await fetchUpstream(meteocielDirectUrl);
        }

        // En-têtes de réponse avec CORS universel
        res.setHeader('Content-Type', 'text/html; charset=windows-1252');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

        if (isPastArchive) {
            // Les archives passées ne changent jamais : cache Edge Vercel 1 an
            res.setHeader('Cache-Control', 'public, s-maxage=31536000, max-age=86400, stale-while-revalidate=604800');
        } else {
            // Les relevés temps réel du jour expirent après 6 minutes
            res.setHeader('Cache-Control', 'public, s-maxage=360, max-age=360');
        }

        res.status(result.statusCode).send(result.buffer);
    } catch (e) {
        console.error('[MeteocielProxy] Fatal handler error:', e);
        res.status(500).json({ error: e.message });
    }
}
