// Vercel Serverless Function : Proxy Camouflé et Cache CDN Edge vers VPS OVH (15.235.120.41)
// Zéro dépendance à Netlify ("chebakia"), camouflage complet et cache Edge Vercel 1 an

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

        // 1. Tenter en priorité le VPS OVH dédié (15.235.120.41 - zéro Netlify)
        const vpsUrl = `http://15.235.120.41/api-meteociel/${cleanPath}`;
        const meteocielDirectUrl = `https://www.meteociel.fr/${cleanPath}`;

        const isPastArchive = cleanPath.includes('archive=1') || cleanPath.includes('annee2=') || cleanPath.includes('mois2=');

        let buffer = null;
        let statusCode = 200;

        try {
            const vpsResp = await fetch(vpsUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });
            if (!vpsResp.ok) throw new Error(`VPS HTTP ${vpsResp.status}`);
            const ab = await vpsResp.arrayBuffer();
            buffer = Buffer.from(ab);
            statusCode = vpsResp.status;
        } catch (_vpsErr) {
            // Repli direct camouflé sur meteociel.fr
            const mcResp = await fetch(meteocielDirectUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'Referer': 'https://www.meteociel.fr/',
                    'Cookie': 'meteociel=57a0e34041b9c18fed3d0f2b2800ba53; archivebotok=1',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7'
                }
            });
            const ab = await mcResp.arrayBuffer();
            buffer = Buffer.from(ab);
            statusCode = mcResp.status;
        }

        // En-têtes de réponse avec CORS universel
        res.setHeader('Content-Type', 'text/html; charset=windows-1252');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

        if (isPastArchive) {
            // Les archives passées ne changent jamais : cache Edge Vercel 1 an (zéro requête répétée vers le VPS ou Météociel)
            res.setHeader('Cache-Control', 'public, s-maxage=31536000, max-age=86400, stale-while-revalidate=604800');
        } else {
            // Les relevés temps réel du jour expirent après 6 minutes
            res.setHeader('Cache-Control', 'public, s-maxage=360, max-age=360');
        }

        res.status(statusCode).send(buffer);
    } catch (e) {
        console.error('[MeteocielProxy] Fatal handler error:', e);
        res.status(500).json({ error: e.message });
    }
}
