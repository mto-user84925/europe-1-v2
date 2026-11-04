/**
 * Collecteur de données Météo France en temps réel
 * Récupère les 2000+ stations toutes les 6 minutes
 * Utilise un token manuel (OAuth ne fonctionne pas dans le navigateur à cause de CORS)
 * 
 * MULTI-ENDPOINT : Le paquet bulk infrahoraire-6m ne contient pas toutes les stations.
 * On complète avec le paquet horaire et des appels individuels DPObs.
 */

// Utilisation des Proxys pour contourner CORS
const API_BASE = '/api-meteo-paquet';   // DPPaquetObs (bulk)
const API_DPOBS = '/api-meteo';          // DPObs (individuel)

// Import Supabase pour l'archivage automatique depuis le navigateur
import { supabase } from './supabaseClient';
// Import de la liste complète des stations connues
import stationNamesData from '../data/stationNames.json';
// Import de l'authentification OAuth
import { meteoAuth } from './meteoFranceAuth';

class MeteoFranceCollector {
    constructor() {
        this.isCollecting = false;
        this.collectionInterval = null;
        this.latestData = null; // Tableau des dernières observations (pour la carte)
        this.stationsHistory = new Map(); // Map de stationId -> Array d'observations (pour les détails)
        this.maxHistorySize = 25;

        // Initialisation de l'OAuth avec les credentials du .env
        const key = import.meta.env.VITE_METEO_CONSUMER_KEY;
        const secret = import.meta.env.VITE_METEO_CONSUMER_SECRET;
        
        if (key && secret) {
            meteoAuth.initialize(key, secret);
            console.log('[MeteoCollector] 🔑 OAuth configuré avec succès');
        } else {
            console.error('[MeteoCollector] ❌ Credentials OAuth manquants (VITE_METEO_CONSUMER_KEY / SECRET)');
        }

        // Charger l'historique au démarrage si possible
        this.loadHistoryFromStorage();
    }

    /**
     * Obtenir un token valide via le service OAuth
     */
    async getValidToken() {
        try {
            return await meteoAuth.getValidToken();
        } catch (error) {
            console.error('[MeteoCollector] ❌ Impossible d\'obtenir un token OAuth:', error);
            // Fallback sur le token manuel si présent (pour compatibilité temporaire)
            const manualToken = import.meta.env.VITE_METEO_MANUAL_TOKEN;
            if (manualToken) return manualToken;
            throw error;
        }
    }

    /**
     * Obtenir les dernières données (compatible avec l'ancien format)
     */
    getLatestData() {
        return this.latestData || [];
    }

    /**
     * Obtenir l'historique pour une station spécifique
     */
    getStationHistory(stationId) {
        return this.stationsHistory.get(stationId) || [];
    }

    /**
     * Calculer le timestamp du dernier cycle de 6 minutes complété
     * Les données ont un délai de ~20-24 minutes, donc on utilise -24 min
     */
    getLatestCycleTime() {
        const now = new Date();
        const minutes = now.getUTCMinutes();

        // Arrondir aux 6 minutes inférieures
        const roundedMinutes = Math.floor(minutes / 6) * 6;

        // Créer la date arrondie
        const cycleTime = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            now.getUTCHours(),
            roundedMinutes,
            0,
            0
        ));

        // Soustraire 24 minutes pour être sûr que les données sont disponibles
        // (délai de publication de l'API)
        cycleTime.setMinutes(cycleTime.getMinutes() - 24);

        // Format sans millisecondes : AAAA-MM-JJThh:mm:00Z
        return cycleTime.toISOString().split('.')[0] + 'Z';
    }

    /**
     * Enrichir un objet station brut avec des conversions (K→°C, m/s→km/h)
     */
    enrichStation(station) {
        return {
            ...station,
            temp_celsius: station.t != null ? Math.round((station.t - 273.15) * 10) / 10 : null,
            dewpoint_celsius: station.td != null ? Math.round((station.td - 273.15) * 10) / 10 : null,
            wind_kmh: station.ff != null ? Math.round(station.ff * 3.6 * 10) / 10 : null,
            gust_kmh: station.fxi10 != null ? Math.round(station.fxi10 * 3.6 * 10) / 10 : null,
            vv: station.vv ?? null
        };
    }

    /**
     * Collecter les données de TOUTES les stations (multi-endpoint)
     * 
     * Stratégie :
     *  1. Fetch bulk infrahoraire-6m (DPPaquetObs) → ~1940 stations
     *  2. Appels individuels DPObs 6-minutes pour les ~60 stations manquantes
     */
    async collectAllStations() {
        try {
            const token = await this.getValidToken();
            const cycleTime = this.getLatestCycleTime();

            console.log(`[MeteoCollector] 🚀 Collecte multi-endpoint pour ${cycleTime}...`);

            const headers = {
                'apikey': token,
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            };

            // ──────────────────────────────────────────────────
            // ÉTAPE 1 : Fetch bulk infrahoraire-6m
            // ──────────────────────────────────────────────────
            const url6m = `${API_BASE}/paquet/stations/infrahoraire-6m?date=${cycleTime}&format=json`;
            const res6m = await fetch(url6m, { headers });

            let stations6m = [];
            if (res6m.ok) {
                stations6m = await res6m.json();
                if (!Array.isArray(stations6m)) stations6m = [];
            } else {
                console.error('[MeteoCollector] ❌ Échec fetch bulk 6min');
            }

            // Index des stations déjà récupérées
            const collectedIds = new Set();
            const allStations = [];

            // Enrichir et indexer les stations 6min
            for (const s of stations6m) {
                const id = s.geo_id_insee || s.id;
                if (!id) continue;
                collectedIds.add(id);
                allStations.push(this.enrichStation(s));
            }

            console.log(`[MeteoCollector] 📡 Bulk 6min : ${allStations.length} stations`);

            // ──────────────────────────────────────────────────
            // ÉTAPE 2 : Appels individuels DPObs pour les manquantes (ex: Steenvoorde)
            // ──────────────────────────────────────────────────
            const allKnownIds = Object.keys(stationNamesData);
            const missingIds = allKnownIds.filter(id => !collectedIds.has(id));

            // Limiter aux stations métropolitaines (01-95, 20)
            const missingMetro = missingIds.filter(id => {
                const prefix = parseInt(id.substring(0, 2));
                return prefix >= 1 && prefix <= 95 || id.startsWith('20');
            });

            let completedFromDPObs = 0;
            if (missingMetro.length > 0) {
                console.log(`[MeteoCollector] 🔍 Test de ${missingMetro.length} stations manquantes via DPObs individuel...`);
                // On requête par lots de 15 en parallèle pour ne pas surcharger
                const BATCH = 15;
                for (let i = 0; i < missingMetro.length; i += BATCH) {
                    const batch = missingMetro.slice(i, i + BATCH);
                    const results = await Promise.allSettled(
                        batch.map(id => this.fetchStationDPObs(id, cycleTime, headers))
                    );

                    for (let j = 0; j < results.length; j++) {
                        if (results[j].status === 'fulfilled' && results[j].value) {
                            const obs = results[j].value;
                            const id = obs.geo_id_insee || obs.id || batch[j];
                            if (!collectedIds.has(id)) {
                                collectedIds.add(id);
                                allStations.push(this.enrichStation({ ...obs, _source: 'dpobs' }));
                                completedFromDPObs++;
                            }
                        }
                    }
                }
            }

            if (completedFromDPObs > 0) {
                console.log(`[MeteoCollector] 🔍 DPObs : +${completedFromDPObs} stations avec des données 6-minutes récupérées`);
            }

            // Résumé
            const finalMissing = allKnownIds.filter(id => !collectedIds.has(id)).length;
            console.log(`[MeteoCollector] ✅ TOTAL : ${allStations.length} stations collectées (${finalMissing} hors réseau)`);

            // Log visibilité
            const stationsAvecVisibilite = allStations.filter(s => s.vv !== null);
            if (stationsAvecVisibilite.length > 0) {
                console.log(`[MeteoCollector] 👁️ Visibilité : ${stationsAvecVisibilite.length} stations`);
            }

            return allStations;

        } catch (error) {
            console.error('[MeteoCollector] Erreur de collecte:', error);
            throw error;
        }
    }

    /**
     * Fetch le paquet horaire (bulk) pour compléter les stations manquantes du 6min
     */
    async fetchHoraireBulk(cycleTime, headers) {
        try {
            // Arrondir à l'heure (le endpoint horaire attend une heure ronde)
            const cycleDate = new Date(cycleTime);
            cycleDate.setUTCMinutes(0, 0, 0);
            const hourStr = cycleDate.toISOString().split('.')[0] + 'Z';

            const url = `${API_BASE}/paquet/stations/horaire?date=${hourStr}&format=json`;
            const response = await fetch(url, { headers });

            if (!response.ok) return [];
            const data = await response.json();
            return Array.isArray(data) ? data : [];
        } catch (e) {
            console.warn('[MeteoCollector] ⚠️ Échec fetch horaire bulk:', e.message);
            return [];
        }
    }

    /**
     * Fetch une station individuelle via DPObs infrahoraire-6m
     */
    async fetchStationDPObs(stationId, cycleTime, headers) {
        try {
            const url = `${API_DPOBS}/station/infrahoraire-6m?id_station=${stationId}&date=${cycleTime}&format=json`;
            const response = await fetch(url, { headers });

            if (!response.ok) return null;

            const text = await response.text();
            if (text.startsWith('<') || text.length < 5) return null;

            const data = JSON.parse(text);
            if (Array.isArray(data) && data.length > 0) {
                return data[0];
            }
            return null;
        } catch (e) {
            return null;
        }
    }


    /**
     * Démarrer la collecte automatique
     */
    startAutoCollection() {
        if (this.isCollecting) {
            console.log('[MeteoCollector] Collecte déjà en cours');
            // Si données déjà présentes, renvoyer true pour dire "c'est bon"
            return this.latestData !== null;
        }

        console.log('[MeteoCollector] 🚀 Démarrage de la collecte automatique (6 min)');
        this.isCollecting = true;

        // Première collecte immédiate
        this.runCollectionCycle();

        // Puis toutes les 6 minutes
        this.collectionInterval = setInterval(() => {
            this.runCollectionCycle();
        }, 6 * 60 * 1000);
    }

    /**
     * Cycle de collecte unique
     */
    async runCollectionCycle() {
        try {
            const data = await this.collectAllStations();
            if (data && data.length > 0) {
                // IMPORTANT: On force save=true pour déclencher l'archivage Supabase
                this.processNewData(data, true);
            }
        } catch (error) {
            console.error('[MeteoCollector] Erreur cycle:', error);
        }
    }

    /**
     * Traiter les nouvelles données et mettre à jour l'historique
     */
    processNewData(newData, save = true) {
        this.latestData = newData;
        const now = new Date();
        this.lastCollectedAt = now.toISOString();

        // Mettre à jour l'historique pour chaque station
        newData.forEach(obs => {
            const id = obs.geo_id_insee || obs.id;
            if (!id) return;

            if (!this.stationsHistory.has(id)) {
                this.stationsHistory.set(id, []);
            }

            const history = this.stationsHistory.get(id);

            // Ajouter la nouvelle observation
            // On ajoute un timestamp "reçu à" pour trier
            const entry = {
                ...obs,
                receivedAt: now.toISOString(),
                // S'assurer que les valeurs numériques sont bien des nombres
                // IMPORTANT: != null pour ne pas perdre la valeur 0 (ex: 0°C = 273.15K, vent calme = 0 m/s)
                t: obs.t != null ? Math.round((obs.t - 273.15) * 10) / 10 : null,
                u: obs.u ?? null,
                ff: obs.ff != null ? Math.round(obs.ff * 3.6) : null,
                td: obs.td != null ? Math.round((obs.td - 273.15) * 10) / 10 : null,
                min_t: obs.min_t != null ? Math.round((obs.min_t - 273.15) * 10) / 10 : null,
                max_t: obs.max_t != null ? Math.round((obs.max_t - 273.15) * 10) / 10 : null,
                gust_kmh: (obs.fxi3s != null) ? Math.round(obs.fxi3s * 3.6) : (obs.fxi3S != null) ? Math.round(obs.fxi3S * 3.6) : (obs.fxi10 != null) ? Math.round(obs.fxi10 * 3.6) : (obs.fxi != null ? Math.round(obs.fxi * 3.6) : null),
                rr_per: obs.rr_per ?? 0,
                vv: obs.vv ?? null
            };

            // Vérifier doublons
            const last = history[history.length - 1];
            let isDuplicate = false;

            if (last) {
                // 1. Si on a un validity_time (cas idéal), on compare
                if (obs.validity_time && last.validity_time === obs.validity_time) {
                    isDuplicate = true;
                }
                // 2. Sinon, détection heuristique (si données identiques et fetch < 5 min)
                else if (last.t === entry.t && last.u === entry.u && last.pres === entry.pres) {
                    const timeDiff = new Date(entry.receivedAt).getTime() - new Date(last.receivedAt).getTime();
                    // Si on reçoit la même donnée exacte moins de 5 min après, c'est surement un doublon de refresh
                    // MAIS attention : Météo France publie toutes les 6 minutes pile.
                    if (timeDiff < 5 * 60 * 1000) {
                        isDuplicate = true;
                    }
                }
            }

            if (!isDuplicate) {
                history.push(entry);
            }

            // Limiter la taille (garder les 50 derniers points)
            if (history.length > 50) {
                history.shift(); // Enlever le plus vieux
            }
        });

        // Sauvegarder (partiellement pour perf)
        if (save) {
            this.saveToLocalStorage();
            // this.archiveToSupabase(newData); // Temporairement désactivé pour réduire la charge DB
        }
        console.log(`[MeteoCollector] ✅ Données traitées et historique mis à jour (${newData.length} stations)`);
    }

    /**
     * Tente d'archiver les données dans Supabase (Table observations_6mn)
     * VERSION BATCH optimisée et complète
     */
    async archiveToSupabase(data) {
        if (!data || data.length === 0) return;

        console.log(`[MeteoCollector] 💾 Préparation archivage chiffré pour ${data.length} stations...`);

        // Mapping complet (y compris rafales fxi et direction dd)
        const now = new Date();
        const allRows = data.map(obs => {
            const stationId = obs.geo_id_insee || obs.id;
            // Rafales : prioriser fxi10 (brut API), puis fxi, puis gust_kmh (déjà converti)
            let fxiKmh = null;
            if (obs.fxi3s != null) fxiKmh = Math.round(obs.fxi3s * 3.6);
            else if (obs.fxi3S != null) fxiKmh = Math.round(obs.fxi3S * 3.6);
            else if (obs.fxi10 != null) fxiKmh = Math.round(obs.fxi10 * 3.6);
            else if (obs.fxi != null) fxiKmh = Math.round(obs.fxi * 3.6);
            else if (obs.gust_kmh != null) fxiKmh = Math.round(obs.gust_kmh);

            return {
                station_id: stationId,
                timestamp: obs.validity_time || now.toISOString(),
                // IMPORTANT: != null pour ne pas perdre les valeurs 0 légitimes
                t: obs.t != null ? Math.round((obs.t - 273.15) * 10) / 10 : null,
                td: obs.td != null ? Math.round((obs.td - 273.15) * 10) / 10 : null,
                u: obs.u ?? null,
                ff: obs.ff != null ? Math.round(obs.ff * 3.6) : null,
                rr_per: obs.rr_per ?? 0,
                pres: obs.pres ?? null,
                fxi: fxiKmh,
                dd: obs.dd ?? null,
                vv: obs.vv ?? null,
                insolh: obs.insolh ?? null,
                ht_neige: obs.ht_neige ?? null
            };
        });

        // BATCHING: Découpage par paquets de 100 pour éviter le timeout/refus navigateur
        const BATCH_SIZE = 100;
        let totalSaved = 0;

        for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
            const batch = allRows.slice(i, i + BATCH_SIZE);
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;

            try {
                const { error } = await supabase
                    .from('observations_6mn')
                    .upsert(batch, { onConflict: 'station_id, timestamp', ignoreDuplicates: true });

                if (error) {
                    console.error(`❌ Erreur Lot ${batchNum} :`, error.message);
                } else {
                    totalSaved += batch.length;
                }
            } catch (e) {
                console.error(`❌ Crash Lot ${batchNum}`, e);
            }
        }

        if (totalSaved > 0) {
            console.log(`[MeteoCollector] ✅ SUCCÈS : ${totalSaved} / ${allRows.length} lignes archivées.`);
        }
    }

    /**
     * Arrêter la collecte automatique
     */
    stopAutoCollection() {
        if (this.collectionInterval) {
            clearInterval(this.collectionInterval);
            this.collectionInterval = null;
            this.isCollecting = false;
            console.log('[MeteoCollector] ⏸️ Collecte automatique arrêtée');
        }
    }

    /**
     * Sauvegarder les données dans le localStorage
     */
    saveToLocalStorage() {
        try {
            if (typeof window === 'undefined') return;
            // On ne sauvegarde que les dernières données pour éviter de saturer localStorage (max 5MB)
            localStorage.setItem('meteo_latest', JSON.stringify(this.latestData));
            // Pour l'historique, c'est trop gros pour localStorage.
            // On pourrait utiliser IndexedDB mais pour l'instant restons simple.
        } catch (e) {
            console.warn('Erreur sauvegarde localStorage', e);
        }
    }

    /**
     * Charger les données depuis le localStorage
     */
    loadHistoryFromStorage() {
        try {
            if (typeof window === 'undefined') return;

            const saved = localStorage.getItem('meteo_latest');
            if (saved) {
                this.latestData = JSON.parse(saved);
                console.log('[MeteoCollector] 📂 Données chargées depuis le cache');

                // IMPORTANT : Reconstruire l'historique (au moins le dernier point)
                // pour que le mode "Détail" de la liste fonctionne tout de suite sans rappeler l'API
                if (Array.isArray(this.latestData)) {
                    // On ne sauvegarde pas pour éviter une boucle, on remplit juste la Map
                    this.processNewData(this.latestData, false);
                }
            }
        } catch (e) {
            console.error('Erreur lecture localStorage', e);
        }
    }

    /**
     * Exporter les données en JSON (pour téléchargement)
     */
    exportToJSON() {
        const exportData = {
            exportedAt: new Date().toISOString(),
            latestData: this.latestData,
            history: this.dataHistory
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `meteo-france-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);

        console.log('[MeteoCollector] 📥 Export JSON créé');
    }

    /**
     * Obtenir les statistiques globales
     */
    getStatistics() {
        if (!this.latestData) return null;

        const stations = this.latestData;
        const withTemp = stations.filter(s => s.temp_celsius !== null);
        const withWind = stations.filter(s => s.wind_kmh !== null);
        const withRain = stations.filter(s => s.rr_per !== null);

        const temps = withTemp.map(s => s.temp_celsius);

        return {
            totalStations: stations.length,
            stationsWithTemp: withTemp.length,
            stationsWithWind: withWind.length,
            stationsWithRain: withRain.length,
            temperature: {
                min: Math.min(...temps),
                max: Math.max(...temps),
                avg: temps.reduce((a, b) => a + b, 0) / temps.length
            },
            lastUpdate: this.lastCollectedAt,
            historySize: 0 // Plus de historique global, c'est par station
        };
    }
}

// Instance singleton
export const meteoCollector = new MeteoFranceCollector();

// Auto-démarrage au chargement (DÉSACTIVÉ en production pour éviter les prompts Auth sur Chrome)
// La collecte doit être gérée par les workflows GitHub Actions et non par le client.
if (typeof window !== 'undefined') {
    meteoCollector.loadHistoryFromStorage();
}


export default meteoCollector;
