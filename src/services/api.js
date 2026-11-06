import { format } from 'date-fns';
import { createClient } from '@supabase/supabase-js';

// URL RELATIVE pour passer par le Proxy Vite (contourne CORS)
const MF_BASE_URL = '/api-meteo';

import { supabase } from './supabaseClient';
export { supabase };

const _stationHistoryCache = new Map();
const _STATION_CACHE_MAX_ENTRIES = 60;

// Date locale au format YYYY-MM-DD (évite le décalage UTC de toISOString()).
// toLocaleDateString('sv-SE') renvoie toujours YYYY-MM-DD en heure locale.
const toLocalISODate = (d = new Date()) => {
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString('sv-SE');
};

const cacheStationHistory = (key, value) => {
    // Plafonnement du cache : évite une croissance mémoire illimitée.
    if (_stationHistoryCache.size >= _STATION_CACHE_MAX_ENTRIES) {
        const oldestKey = _stationHistoryCache.keys().next().value;
        _stationHistoryCache.delete(oldestKey);
    }
    _stationHistoryCache.set(key, value);
};

export const weatherAPI = {
    /**
     * Get 6-minute observations for a specific station (Fast Direct Path + Cache + DPClim)
     */
    getStation6mnHistory: async (stationId, dateObj = null) => {
        if (!stationId) return [];
        
        const targetDate = dateObj ? new Date(dateObj) : new Date();
        const dateStr = toLocalISODate(targetDate);
        const cacheKey = `${stationId}_${dateStr}`;
        
        // 1. Cache mémoire ultra-rapide (0 ms)
        if (_stationHistoryCache.has(cacheKey)) {
            return _stationHistoryCache.get(cacheKey);
        }

        try {
            const isToday = dateStr === toLocalISODate(new Date());

            let finalData = [];

            // 2. Si c'est aujourd'hui, interroger Supabase observations_6mn
            if (isToday && supabase) {
                const start = new Date(targetDate);
                start.setHours(0, 0, 0, 0);
                const end = new Date(targetDate);
                end.setHours(23, 59, 59, 999);

                const { data, error } = await supabase
                    .from('observations_6mn')
                    .select('*')
                    .eq('station_id', stationId)
                    .gte('timestamp', start.toISOString())
                    .lte('timestamp', end.toISOString())
                    .order('timestamp', { ascending: false })
                    .limit(300);

                if (!error && data && data.length > 0) {
                    finalData = data.map(obs => ({
                        time: new Date(obs.timestamp),
                        temp: obs.t,
                        hum: obs.u,
                        rain: obs.rr_per,
                        rain_1h: obs.rr1,
                        rain_3h: obs.rr3,
                        rain_6h: obs.rr6,
                        rain_12h: obs.rr12,
                        rain_24h: obs.rr24,
                        sun: obs.insolh,
                        wind: obs.ff,
                        gust: obs.fxi,
                        dir: obs.dd,
                        dewpoint: obs.td,
                        pressure: obs.pres,
                        vv: obs.vv,
                        snow_depth: obs.ht_neige
                    })).reverse();
                }
            }

            // 3. Pour le pas de 6 minutes (240 mesures/jour) dans le passé : interroger Météociel RADOME direct
            if (finalData.length === 0) {
                try {
                    const { fetchStationObservations } = await import('./meteocielService');
                    const mData = await fetchStationObservations(stationId, dateStr, true);
                    if (mData && mData.observations && mData.observations.length > 0) {
                        finalData = mData.observations.map(obs => {
                            const [hh, mm] = (obs.time || '00h00').split('h').map(n => parseInt(n, 10) || 0);
                            const obsDate = new Date(targetDate);
                            obsDate.setHours(hh, mm, 0, 0);
                            return {
                                time: obsDate,
                                date: dateStr,
                                date_local: dateStr,
                                h: hh,
                                minute: mm,
                                temp: obs.temp,
                                hum: obs.hum,
                                rain: (obs.rain !== null && obs.rain !== undefined && !isNaN(obs.rain) && obs.rain >= 0 && obs.rain < 150) ? obs.rain : 0,
                                wind: obs.wind,
                                gust: obs.gust,
                                fxi: null, // FXI max brut anémomètre réservé à DPClim
                                fxi3s: obs.fxi3s ?? obs.gust, // Météociel = FXI 3S
                                timeFormatted: obs.time || `${String(hh).padStart(2, '0')}h${String(mm).padStart(2, '0')}`,
                                hfxi3s_time: obs.time || `${String(hh).padStart(2, '0')}h${String(mm).padStart(2, '0')}`,
                                dewpoint: obs.dewpoint,
                                pressure: obs.pres
                            };
                        });
                    }
                } catch (errMeteociel) {
                    console.warn("[API] Meteociel 6mn fallback failed:", errMeteociel);
                }
            }

            // 4. Si aucune donnée 6-minute trouvée -> DPClim officiel horaire
            if (finalData.length === 0) {
                try {
                    const { meteoFranceClimService } = await import('./meteoFranceClimService');
                    const dpHourly = await meteoFranceClimService.fetchStationHourlyHistory(stationId, dateStr, dateStr);
                    if (dpHourly && dpHourly.length > 0) {
                        finalData = dpHourly;
                    }
                } catch (errDPClim) {
                    console.warn("[API] Fallback DPClim:", errDPClim);
                }
            }

            // Mettre en cache les résultats passés
            if (finalData.length > 0 && !isToday) {
                cacheStationHistory(cacheKey, finalData);
            }

            return finalData;
        } catch (e) {
            console.error("[API] getStation6mnHistory error:", e);
            return [];
        }
    },

    /**
     * Get hourly observations for a specific station (100% DPClim)
     */
    /**
     * Get 6-minute observations for a range of dates (240 points par jour)
     */
    getStation6mnHistoryRange: async (stationId, startDate, endDate, onProgress = () => {}) => {
        if (!stationId || !startDate || !endDate) return [];
        const start = new Date(startDate);
        const end = new Date(endDate);
        const allObs = [];
        let curr = new Date(start);
        let count = 0;
        const totalDays = Math.max(1, Math.round((end - start) / 86400000) + 1);

        while (curr <= end) {
            count++;
            const dStr = toLocalISODate(curr);
            onProgress(`Récupération 6 minutes ${dStr} (${count}/${totalDays})…`);
            try {
                const dayObs = await weatherAPI.getStation6mnHistory(stationId, curr);
                if (dayObs && dayObs.length > 0) {
                    allObs.push(...dayObs);
                }
            } catch (e) {
                console.warn(`[API] 6mn range error on ${dStr}:`, e);
            }
            curr.setDate(curr.getDate() + 1);
            if (count % 3 === 0) await new Promise(r => setTimeout(r, 80));
        }
        return allObs;
    },

        getStationHourlyHistory: async (stationId, dateObj = null) => {
        if (!stationId) return [];
        const d = dateObj ? new Date(dateObj) : new Date(Date.now() - 86400000);
        const dStr = toLocalISODate(d);
        return weatherAPI.getStationHourlyHistoryRange(stationId, dStr, dStr);
    },

    /**
     * Get hourly observations for a range of dates (100% DPClim officiel)
     */
    getStationHourlyHistoryRange: async (stationId, startDate, endDate, onProgress = () => {}) => {
        if (!stationId || !startDate || !endDate) return [];
        try {
            const { meteoFranceClimService } = await import('./meteoFranceClimService');
            const sStr = startDate;
            const eStr = endDate;

            // 1. Essai direct et officiel DPClim Horaire Météo-France (1950 à hier)
            try {
                const dpHourly = await meteoFranceClimService.fetchStationHourlyHistory(stationId, sStr, eStr, onProgress);
                if (dpHourly && dpHourly.length > 0) {
                    return dpHourly
                        .filter(obs => {
                            const dLocal = obs.date_local || obs.date;
                            const dUtc = obs.date_utc || obs.date;
                            // ponytail: filtrage strict sur date civile locale (0h-23h59) évitant la fuite du lendemain 01h UTC
                            return dLocal >= startDate && dLocal <= endDate;
                        })
                        .map(obs => ({
                            date: obs.date_local || obs.date || (obs.time ? (typeof obs.time.toLocaleDateString === 'function' ? obs.time.toLocaleDateString('fr-CA') : '') : ''),
                            date_local: obs.date_local,
                            date_utc: obs.date_utc,
                            h: obs.h_local !== undefined ? obs.h_local : (obs.h !== undefined ? obs.h : (obs.time instanceof Date ? obs.time.getHours() : 0)),
                            h_local: obs.h_local,
                            h_utc: obs.h_utc,
                            time: obs.time instanceof Date ? obs.time : new Date(obs.time),
                            temp: obs.temp,
                            hum: obs.hum,
                            rain: obs.rain,
                            wind: obs.wind,
                            gust: obs.gust,
                            fxi: obs.fxi !== undefined ? obs.fxi : obs.gust,
                            fxi3s: obs.fxi3s !== undefined ? obs.fxi3s : obs.gust,
                            pres: obs.pres,
                            vv: obs.vv,
                            htn_time: obs.htn_time,
                            htx_time: obs.htx_time,
                            hfxi3s_time: obs.hfxi3s_time,
                            hfxi_time: obs.hfxi_time,
                            timestamp_raw: obs.time && typeof obs.time.toISOString === 'function' ? obs.time.toISOString() : String(obs.time || '')
                        }));
                }
            } catch (errH) {
                // ponytail: pas de fallback synthétique — on veut toujours les vraies données horaires 0h-23h
                console.error("[API] DPClim hourly failed, no fallback:", errH);
            }

            return [];
        } catch (e) {
            console.error("[API] DPClim getStationHourlyHistoryRange error:", e);
            return [];
        }
    },

    /**
     * Get latest HOURLY observations for a whole department (Stations resolution + DPClim)
     */
    getDepartmentLatestHoraire: async (deptCode) => {
        try {
            const stationNamesData = await import('../data/stationNames.json');
            const deptPrefix = (deptCode === '2A' || deptCode === '2B') ? '20' : deptCode;
            const allStations = stationNamesData.default || stationNamesData;
            return Object.entries(allStations)
                .filter(([id]) => id.startsWith(deptPrefix))
                .map(([id, name]) => ({
                    station_id: id,
                    nom_station: name,
                    latest: null,
                    history: []
                }));
        } catch (e) {
            console.error("[API] getDepartmentLatestHoraire error:", e);
            return [];
        }
    },

    /**
     * Get latest 6mn observations (Legacy / Detail view)
     */
    getDepartmentLatest: async (deptCode) => {
        if (!supabase) return [];
        try {
            let searchCode = deptCode;
            if (deptCode === '2A' || deptCode === '2B') {
                searchCode = '20';
            }

            // World mapping
            const worldMap = { 'M1': '0006', 'M2': '0001', 'M3': '0004', 'M5': '0002', 'M6': '0005', 'M7': '0007' };
            if (worldMap[deptCode]) searchCode = worldMap[deptCode];

            const { data, error } = await supabase
                .from('stations')
                .select('id, name')
                .like('id', `${searchCode}%`)
                .order('name', { ascending: true });

            if (error) throw error;

            return data.map(station => ({
                station_id: station.id,
                name: station.name,
                latest: null, // latest observation not strictly needed for the dropdown
                history: []
            }));
        } catch (e) {
            console.error("[API] getDepartmentLatest error:", e);
            return [];
        }
    },


    /**
     * Get historical daily extremes for a range of dates (BTP / Statistics)
     * Queries daily_summaries table which is kept long-term
     */
    getHistoricalData: async (startDate, endDate, lat = null, lon = null, stationId = null) => {
        if (!supabase) return [];
        try {
            let targetStationId = stationId;

            // 1. If lat/lon provided, find nearest station
            if (!targetStationId && lat && lon) {
                const { data: nearStations } = await supabase
                    .from('stations')
                    .select('id, lat, lon')
                    .not('lat', 'is', null)
                    .not('lon', 'is', null);

                if (nearStations && nearStations.length > 0) {
                    // Distance de Haversine (approximation suffisante pour un tri)
                    const R = 6371; // km
                    const toRad = (deg) => (deg * Math.PI) / 180;
                    const haversine = (lat2, lon2) => {
                        const dLat = toRad(lat2 - lat);
                        const dLon = toRad(lon2 - lon);
                        const a =
                            Math.sin(dLat / 2) ** 2 +
                            Math.cos(toRad(lat)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
                        return 2 * R * Math.asin(Math.sqrt(a));
                    };
                    nearStations.sort(
                        (a, b) => haversine(a.lat, a.lon) - haversine(b.lat, b.lon)
                    );
                    targetStationId = nearStations[0].id;
                }
            }

            // Fallback to Douai if still nothing
            if (!targetStationId) targetStationId = '59343001';

            // 2. Query daily_summaries
            const { data, error } = await supabase
                .from('daily_summaries')
                .select('*')
                .eq('station_id', targetStationId)
                .gte('date', startDate)
                .lte('date', endDate)
                .order('date', { ascending: true });

            if (error) throw error;

            return data.map(d => ({
                date: d.date,
                min: d.temp_min,
                max: d.temp_max,
                rain: d.rain_total,
                gust: d.wind_gust_max,
                gust_time: d.wind_gust_time
            }));
        } catch (e) {
            console.error("[API] getHistoricalData error:", e);
            return [];
        }
    },

    /**
     * Search communes (official Gouv API)
     */
    searchCity: async (query) => {
        try {
            const response = await fetch(
                `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(query)}&limit=8&fields=nom,code,codesPostaux,centre,codeDepartement&boost=population`
            );
            if (!response.ok) return [];
            const data = await response.json();
            return data.map(c => ({
                id: c.code,
                name: c.nom,
                lat: c.centre.coordinates[1],
                lon: c.centre.coordinates[0],
                dept: c.codeDepartement,
                postcodes: c.codesPostaux
            }));
        } catch (error) {
            console.error("[API] searchCity error:", error);
            return [];
        }
    }
};

