export default async function handler(req, res) {
    // Échec fermé : sans CRON_SECRET valide, la requête est rejetée.
    const auth = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, error: 'Missing Supabase environment variables' });
    }

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, serviceKey);

        const targetDate = new Date().toLocaleDateString('sv-SE');
        
        console.log(`[CRON] Synchronisation des résumés pour : ${targetDate}`);
        const { error } = await supabase.rpc('batch_sync_daily_summaries', { target_date: targetDate });

        if (error) {
            console.error("[CRON] Erreur sync :", error);
            return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(200).json({ success: true, date: targetDate });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
}
