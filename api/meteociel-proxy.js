// Vercel Serverless Function : Proxy Camouflé et Cache CDN Edge pour Météociel
// Élimine toute détection par Météociel (Referer www.meteociel.fr, User-Agent Chrome légitime)
// Cache les archives historiques au niveau du CDN Vercel pour 1 an (0 appel redondant)

import https from 'https';

export default async function handler(req, res) {
    try {
        // Extraire le chemin demandé (ex: temps-reel/obs_villes.php?code2=59606004&jour2=23&mois2=9&annee2=2026&affint=1)
        const targetPath = req.query.path || (req.url.replace(/^\/api\/meteociel-proxy\??/, '').replace(/^path=/, ''));
        
        if (!targetPath) {
            return res.status(400).json({ error: 'Missing path parameter' });
        }

        const cleanPath = targetPath.startsWith('/') ? targetPath.substring(1) : targetPath;
        const targetUrl = `https://www.meteociel.fr/${cleanPath}`;

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

        const meteocielReq = https.get(targetUrl, options, (meteocielRes) => {
            const chunks = [];

            meteocielRes.on('data', (chunk) => chunks.push(chunk));

            meteocielRes.on('end', () => {
                const buffer = Buffer.concat(chunks);

                // Déterminer si la requête concerne une archive passée (mise en cache CDN permanente)
                const isPastArchive = cleanPath.includes('archive=1') || cleanPath.includes('annee2=') || cleanPath.includes('mois2=');

                // En-têtes de réponse
                res.setHeader('Content-Type', 'text/html; charset=windows-1252');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

                if (isPastArchive) {
                    // Les archives passées ne changent jamais : cache Edge Vercel 1 an (31536000s)
                    res.setHeader('Cache-Control', 'public, s-maxage=31536000, max-age=86400, stale-while-revalidate=604800');
                } else {
                    // Les relevés temps réel du jour expirent après 6 minutes
                    res.setHeader('Cache-Control', 'public, s-maxage=360, max-age=360');
                }

                res.status(meteocielRes.statusCode || 200).send(buffer);
            });
        });

        meteocielReq.on('error', (err) => {
            console.error('[MeteocielProxy] Error fetching upstream:', err);
            res.status(502).json({ error: 'Upstream Meteociel error: ' + err.message });
        });

        meteocielReq.setTimeout(15000, () => {
            meteocielReq.destroy();
            res.status(504).json({ error: 'Meteociel gateway timeout (15s)' });
        });

    } catch (e) {
        console.error('[MeteocielProxy] Fatal handler error:', e);
        res.status(500).json({ error: e.message });
    }
}
