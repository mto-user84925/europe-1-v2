/**
 * Service de résolution automatique des stations de référence météorologiques
 * 
 * Permet de déterminer avec précision :
 * 1. Le poste le plus proche pour la Température
 * 2. Le poste le plus proche pour les Précipitations
 * 3. Le poste le plus proche pour le Vent / Rafales (si le poste principal n'a pas d'anémomètre)
 * 
 * 100% autonome et ultra-rapide (<1ms) grâce à la base locale stations_list.json.
 */

import stationsData from '../data/stations_list.json';
import stationNamesData from '../data/stationNames.json';

const stationsList = stationsData.features || [];

// Map rapide ID -> { id, name, lat, lon }
const stationGeoMap = new Map();
stationsList.forEach(f => {
    const id = f.properties.num;
    const name = stationNamesData[id] || f.properties.nom || id;
    const [lon, lat] = f.geometry.coordinates;
    stationGeoMap.set(id, { id, name, lat, lon });
});

/**
 * Calcul de distance Haversine en kilomètres
 */
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
    const R = 6371; // Rayon de la Terre en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
}

/**
 * Récupérer les coordonnées GPS d'une station
 */
export function getStationCoords(stationId) {
    if (!stationId) return null;
    const s = stationGeoMap.get(stationId);
    if (s) return s;
    const norm = String(stationId).trim();
    return stationGeoMap.get(norm) || stationGeoMap.get(norm.padStart(8, '0')) || null;
}

/**
 * Trouver les stations les plus proches d'un point GPS ou d'une station donnée
 */
export function findNearestStations(targetLat, targetLon, excludeId = null, limit = 30) {
    if (targetLat == null || targetLon == null) return [];

    const results = [];
    for (const f of stationsList) {
        const id = f.properties.num;
        if (excludeId && id === excludeId) continue;
        const [lon, lat] = f.geometry.coordinates;
        const distKm = calculateDistanceKm(targetLat, targetLon, lat, lon);
        results.push({
            id,
            name: stationNamesData[id] || f.properties.nom || id,
            distKm,
            lat,
            lon
        });
    }

    return results.sort((a, b) => a.distKm - b.distKm).slice(0, limit);
}

/**
 * Formater la chaîne descriptive des stations de référence pour les attestations et bilans
 */
export function formatReferenceStationsText(refStations) {
    if (!refStations) return '';
    const { temp, rain, wind } = refStations;

    const fmt = (s) => {
        if (!s) return '—';
        const name = s.name || s.id;
        const distStr = (s.distKm !== null && s.distKm !== undefined && s.distKm > 0) ? ` - à ${s.distKm} km` : (s.distKm === 0 ? ' - sur site' : '');
        return `${name} (${s.id}${distStr})`;
    };

    const idT = temp?.id;
    const idR = rain?.id;
    const idW = wind?.id;

    if (idT && idT === idR && idR === idW) {
        return `Poste de référence : <strong>${fmt(temp)}</strong>`;
    }

    if (idT && idT === idR && idW && idW !== idT) {
        return `Poste Température & Pluie : <strong>${fmt(temp)}</strong> | Poste Vent (anémomètre) : <strong>${fmt(wind)}</strong>`;
    }

    const parts = [];
    if (temp) parts.push(`Température : <strong>${fmt(temp)}</strong>`);
    if (rain) parts.push(`Pluie : <strong>${fmt(rain)}</strong>`);
    if (wind) parts.push(`Vent : <strong>${fmt(wind)}</strong>`);

    return parts.join(' | ');
}

// Cache mémoire des stations équipées d'anémomètres certifiés (évite de re-tester)
const _knownWindStations = new Set([
    '62298001', // CAMBRAI-EPINOY
    '59343001', // LILLE-LESQUIN
    '62873001', // ARRAS
    '80021001', // ABBEVILLE
    '02691001', // SAINT-QUENTIN
    '75114001', // PARIS-MONTSOURIS
    '95527001', // ROISSY
    '94054001'  // ORLY
]);

/**
 * Résolution automatique et universelle des stations de référence (T°, Pluie, Vent)
 * Si la station principale ne mesure pas le vent (ex: Douai), trouve le poste le plus proche avec anémomètre
 * et charge directement ses relevés certifiés.
 */
export async function resolveReferenceStations({ selectedStationId, startDate, endDate, dailyRows = [], onProgress = () => {} }) {
    const mainCoords = getStationCoords(selectedStationId);
    const mainName = stationNamesData[selectedStationId] || (mainCoords ? mainCoords.name : selectedStationId);

    const hasWind = dailyRows && dailyRows.some(d => (d.fxi3s !== null && d.fxi3s > 0) || (d.fxi !== null && d.fxi > 0));

    let windStationInfo = null;
    let windDailyRows = null;
    let windHourlyRows = null;

    if (hasWind) {
        // La station principale possède déjà un anémomètre fonctionnel
        _knownWindStations.add(selectedStationId);
    } else if (mainCoords) {
        onProgress(`Détection : ${mainName} sans anémomètre. Recherche du poste vent le plus proche…`);
        const { meteoFranceClimService } = await import('./meteoFranceClimService');
        const candidates = findNearestStations(mainCoords.lat, mainCoords.lon, selectedStationId, 25);

        // Tester en priorité les candidats connus avec anémomètre
        const sortedCandidates = [...candidates].sort((a, b) => {
            const aKnown = _knownWindStations.has(a.id) ? 0 : 1;
            const bKnown = _knownWindStations.has(b.id) ? 0 : 1;
            return aKnown - bKnown || a.distKm - b.distKm;
        });

        for (const cand of sortedCandidates) {
            try {
                onProgress(`Test poste vent candidat : ${cand.name} (${cand.distKm} km)…`);
                const candDaily = await meteoFranceClimService.fetchStationHistory(cand.id, startDate, endDate);
                const candHasWind = candDaily && candDaily.some(w => (w.fxi3s !== null && w.fxi3s > 0) || (w.fxi !== null && w.fxi > 0));

                if (candHasWind) {
                    _knownWindStations.add(cand.id);
                    windStationInfo = cand;
                    windDailyRows = candDaily;

                    // Récupérer également l'historique horaire DPClim du poste vent
                    try {
                        windHourlyRows = await meteoFranceClimService.fetchStationHourlyHistory(cand.id, startDate, endDate);
                    } catch (eH) {
                        console.warn(`[StationResolution] Échec horaire vent pour ${cand.name}:`, eH);
                    }
                    break;
                }
            } catch (eCand) {
                console.warn(`[StationResolution] Erreur test candidat ${cand.name}:`, eCand);
            }
        }
    }

    const refStations = {
        temp: { id: selectedStationId, name: mainName, distKm: 0 },
        rain: { id: selectedStationId, name: mainName, distKm: 0 },
        wind: windStationInfo ? { id: windStationInfo.id, name: windStationInfo.name, distKm: windStationInfo.distKm } : { id: selectedStationId, name: mainName, distKm: 0 }
    };

    const refStationsText = formatReferenceStationsText(refStations);

    return {
        refStations,
        refStationsText,
        windStation: windStationInfo,
        windDailyRows,
        windHourlyRows
    };
}

export default {
    calculateDistanceKm,
    getStationCoords,
    findNearestStations,
    formatReferenceStationsText,
    resolveReferenceStations
};
