
import { meteoAuth } from './meteoFranceAuth';

class MeteoFrancePosteService {
    constructor() { }

    async getValidToken() {
        try {
            if (!meteoAuth.consumerKey) {
                const key = import.meta.env.VITE_METEO_CONSUMER_KEY;
                const secret = import.meta.env.VITE_METEO_CONSUMER_SECRET;
                if (key && secret) meteoAuth.initialize(key, secret);
            }
            return await meteoAuth.getValidToken();
        } catch (e) {
            return import.meta.env.VITE_METEO_MANUAL_TOKEN;
        }
    }

    async getStationHourlyHistory(stationId, startDate = null, endDate = null) {
        try {
            const token = await this.getValidToken();
            if (!token) throw new Error("Clé Météo-France non configurée.");

            // On prépare les dates en ISO pour Météo-France
            const dStart = startDate ? new Date(startDate) : new Date(Date.now() - 24 * 3600000);
            dStart.setHours(0, 0, 0, 0);
            const dEnd = endDate ? new Date(endDate) : new Date(dStart);
            dEnd.setHours(23, 59, 59, 999);
            const startISO = dStart.toISOString();
            const endISO = dEnd.toISOString();

            const sid5 = stationId.substring(0, 5);
            const sid8 = stationId.length === 5 ? stationId + "001" : stationId;

            const endpoints = [
                { url: '/api-meteo-poste/station/horaire', name: 'Archives Poste', hasPeriod: true },
                { url: '/api-meteo-paquet/paquet/horaire', name: 'Service Paquet', hasPeriod: true },
                { url: '/api-meteo/station/horaire', name: 'Temps Réel', hasPeriod: false }
            ];

            let rawData = null;

            // STRATÉGIE DE RECHERCHE INTENSIVE
            for (const ep of endpoints) {
                for (const sid of [sid8, sid5]) {
                    try {
                        let targetUrl = `${ep.url}?id_station=${sid}`;
                        if (ep.hasPeriod) {
                            targetUrl += `&date_debut=${startISO}&date_fin=${endISO}`;
                        }

                        console.log(`[MFPoste] Recherche sur ${ep.name} (ID: ${sid})`);
                        // On limite à sid8 pour les archives poste car sid5 renvoie souvent des erreurs de format
                        if (ep.name === 'Archives Poste' && sid.length !== 8) continue;

                        const res = await fetch(targetUrl, {
                            headers: { 'accept': 'application/json', 'apikey': token }
                        });

                        if (res.ok) {
                            const text = await res.text();
                            if (text.startsWith('<')) continue;
                            const data = JSON.parse(text);
                            if (Array.isArray(data) && data.length > 0) {
                                console.log(`[MFSuccess] ${data.length} observations trouvées sur ${ep.name}`);
                                rawData = data;
                                break;
                            }
                        }
                    } catch (e) { /* test suivant */ }
                }
                if (rawData) break;
            }

            if (!rawData) {
                throw new Error("Météo-France ne répond pas pour cette station. Vérifiez vos clés ou utilisez l'Import Manuel.");
            }

            // Filtrage local par date (Ultra-Précis - Réutilise les variables dStart/dEnd déclarées plus haut)
            return rawData.map(obs => {
                const validity = obs.validity_time || obs.validity_time_utc || obs.timestamp || obs.date;
                const d = new Date(validity);

                // Température (Gestion Kelvin ou Celsius)
                let temp = obs.temp ?? obs.tc ?? obs.t;
                if (temp > 150) temp = temp - 273.15;

                // Pluie
                const rain = obs.rr1 ?? obs.precip ?? 0;

                // Vent & Rafales (Conversion m/s -> km/h si nécessaire)
                let wind = obs.ff ?? obs.ff_avg ?? 0;
                // Priorité: fxi3s (norme 3s OMM/MF depuis 16/06/2026) > raf10 > fxy > fxi > ff_gst > fxi10 > null
                let rawGust = obs.fxi3s !== undefined && obs.fxi3s !== null ? obs.fxi3s
                            : obs.fxi3S !== undefined && obs.fxi3S !== null ? obs.fxi3S
                            : obs.raf10 !== undefined && obs.raf10 !== null ? obs.raf10
                            : obs.fxy   !== undefined && obs.fxy   !== null ? obs.fxy
                            : obs.fxi   !== undefined && obs.fxi   !== null ? obs.fxi
                            : obs.ff_gst !== undefined && obs.ff_gst !== null ? obs.ff_gst
                            : obs.fxi10  !== undefined && obs.fxi10  !== null ? obs.fxi10
                            : null;
                const isMs = (obs.ff !== undefined || obs.fxi !== undefined || obs.fxy !== undefined || obs.raf10 !== undefined);
                if (isMs) {
                    wind = wind * 3.6;
                    if (rawGust !== null) rawGust = rawGust * 3.6;
                }
                const gust = rawGust;

                return {
                    time: d,
                    temp: temp !== undefined ? Math.round(temp * 10) / 10 : null,
                    rain: Math.round(parseFloat(rain) * 10) / 10 || 0,
                    wind: Math.round(parseFloat(wind)) || 0,
                    gust: gust !== null ? (Math.round(parseFloat(gust)) || null) : null,
                    hum: parseInt(obs.u ?? obs.hu ?? 0),
                    vv: obs.vv !== undefined ? obs.vv : null
                };
            })
                .filter(o => o.time >= dStart && o.time <= dEnd)
                .sort((a, b) => a.time - b.time);

        } catch (error) {
            console.error('[MFPoste] Erreur:', error.message);
            throw error;
        }
    }
}

export const meteoFrancePosteService = new MeteoFrancePosteService();
export default meteoFrancePosteService;
