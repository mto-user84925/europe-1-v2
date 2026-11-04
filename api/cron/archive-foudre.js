import { createClient } from '@supabase/supabase-js';

// Sécurité : aucun identifiant en dur. Tout vient des variables d'environnement Vercel.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AGATE_PASS = process.env.AGATE_PASS;

export const config = {
    runtime: 'edge',
};

export default async function handler(request) {
    // Échec fermé : sans CRON_SECRET valide, la requête est rejetée.
    const authHeader = request.headers.get('authorization');
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        return new Response(JSON.stringify({ error: 'Missing Supabase environment variables' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (!AGATE_PASS) {
        return new Response(JSON.stringify({ error: 'Missing AGATE_PASS' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    try {
        // Récupérer les données foudre d'hier via l'API Agate
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const displayDate = yesterday.toLocaleDateString('sv-SE');
        const dateStr = displayDate.replace(/-/g, '');

        console.log(`📅 Archivage foudre pour ${displayDate}`);

        // Récupérer les données Agate (mot de passe en variable d'environnement)
        const agateUrl = `https://www.mwattest.fr/ORAGE/orage/ws/wsOragesGMaps.php?date=${dateStr}&heureD=00&heureF=23&pass=${encodeURIComponent(AGATE_PASS)}`;
        const agateRes = await fetch(agateUrl);
        const agateData = await agateRes.json();

        if (!Array.isArray(agateData)) {
            return new Response(JSON.stringify({ error: 'Invalid Agate data' }), { status: 500 });
        }

        const impactCount = agateData.length;
        console.log(`⚡ ${impactCount} impacts trouvés`);

        // Synchroniser vers Supabase.
        // Fuseau : les heures Agate sont en heure légale française (UTC+1 hiver / UTC+2 été).
        // On détermine le décalage réel pour la date traitée.
        const offsetHours = (() => {
            const ref = new Date(`${displayDate}T12:00:00Z`);
            const local = new Date(`${displayDate}T12:00:00`);
            return Math.round((local.getTime() - ref.getTime()) / 3600000);
        })();
        const tzSuffix = offsetHours >= 0 ? `+${String(offsetHours).padStart(2, '0')}:00` : `-${String(-offsetHours).padStart(2, '0')}:00`;

        if (impactCount > 0) {
            const strikesToInsert = agateData.map(s => ({
                strike_time: `${String(s.date).replace(/\//g, '-')}T${s.heure}${tzSuffix}`,
                lat: parseFloat(s.lat),
                lon: parseFloat(s.lon)
            }));

            // Insérer par chunks de 500
            for (let i = 0; i < strikesToInsert.length; i += 500) {
                const chunk = strikesToInsert.slice(i, i + 500);
                const { error } = await supabase.from('lightning_strikes').upsert(chunk, {
                    onConflict: 'strike_time,lat,lon',
                    ignoreDuplicates: true
                });
                if (error) console.error('[archive-foudre] upsert error:', error.message);
            }
        }

        // Enregistrer le bilan (sans image pour l'instant - l'image sera générée côté client)
        await supabase.from('foudre_bilans').upsert({
            date: displayDate,
            image_url: null, // Pas d'image côté serveur
            impact_count: impactCount,
            captured_at: new Date().toISOString()
        }, { onConflict: 'date' });

        return new Response(JSON.stringify({
            success: true,
            date: displayDate,
            impacts: impactCount,
            message: `✅ ${impactCount} impacts archivés pour ${displayDate}`
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('❌ Erreur:', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}
