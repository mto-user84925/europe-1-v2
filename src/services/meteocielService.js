/**
 * Service pour récupérer et parser les données d'archives de Meteociel
 */

const API_METEOCIEL = '/api-meteociel';

export const METEOCIEL_MODES = {
    TEMPERATURE_DIRECT: { id: '0', label: 'Température Actuelle (Direct)', unit: '°C' },
    TEMPERATURE_MAX: { id: '25', label: 'Températures Maximales', unit: '°C' },
    TEMPERATURE_MIN: { id: '26', label: 'Températures Minimales', unit: '°C' },
    WIND_GUSTS: { id: '27', label: 'Rafales de Vent', unit: 'km/h' },
    RAINFALL: { id: '28', label: 'Précipitations', unit: 'mm' },
};

/**
 * Récupère les archives ou le direct pour une date et un mode donnés
 */
export const fetchMeteocielArchives = async (date, modeId) => {
    try {
        const d = new Date(date);
        const day = d.getDate();
        const month = d.getMonth() + 1;
        const year = d.getFullYear();
        const isToday = new Date().toLocaleDateString('sv-SE') === date;

        const isLive = isToday && (modeId === '0' || modeId === 0);
        const url = isLive
            ? `${API_METEOCIEL}/obs/classement.php?archive=0&ua=&all=1&mode=0&pays=&ud=0&dec=0&alt=0&u2=1&ma=0&sub=OK`
            : `${API_METEOCIEL}/obs/classement.php?archive=1&ua=&all=1&mode=${modeId}&pays=&ud=0&dec=0&alt=0&u2=1&ma=0&jour=${day}&mois=${month}&annee=${year}&sub=OK`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);

        // Décodage strict en Windows-1252 pour préserver les accents et caractères spéciaux français
        let html = '';
        try {
            const buffer = await response.arrayBuffer();
            html = new TextDecoder('windows-1252').decode(buffer);
        } catch (decErr) {
            html = await response.text();
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Trouver le tableau des stations (recherche multi-sélecteurs tolérante)
        const tables = Array.from(doc.querySelectorAll('table'));
        let targetTable = tables.find(t => {
            const text = t.textContent || '';
            return (text.includes('Station') || text.includes('Poste') || text.includes('Ville')) && 
                   (text.includes('°C') || text.includes('km/h') || text.includes('mm') || text.includes('hPa') || text.includes('Valeur') || text.includes('Temp'));
        });

        if (!targetTable) {
            const headers = Array.from(doc.querySelectorAll('h4, h3, b'));
            const rankingHeader = headers.find(h => h.textContent.includes('Classement'));
            if (rankingHeader) {
                let sibling = rankingHeader.nextElementSibling;
                while (sibling && sibling.tagName !== 'TABLE') {
                    sibling = sibling.nextElementSibling;
                }
                targetTable = sibling;
            }
        }

        if (!targetTable) return [];

        const rows = Array.from(targetTable.querySelectorAll('tr'));
        const data = [];

        for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) continue;

            const stationLong = cells[0].textContent.trim().replace(/\s+/g, ' ');
            // Format: "Station Name (Dept)" ou "Station Name"
            const match = stationLong.match(/^(.*?)(?:\s*\(([0-9AB]{2,3})\))?$/i);
            if (!match) continue;

            const station = match[1].trim();
            const dept = match[2] || '';

            // Nettoyer la valeur (remplacer virgule par point, extraire nombre)
            let valueStr = cells[1].textContent.trim().replace(',', '.');
            let value = parseFloat(valueStr.replace(/[^\d.-]/g, ''));

            if (!isNaN(value)) {
                data.push({
                    station,
                    dept,
                    value,
                    displayValue: valueStr
                });
            }
        }

        return data;
    } catch (error) {
        console.warn('[MeteocielService] Error fetching archives/live:', error);
        return [];
    }
};

/**
 * Parse le HTML des observations pour extraire les données
 * @param {string} html Contenu HTML de la page Meteociel
 */
export const parseStationObservations = (html) => {
    // 1. Extraire les extrêmes du tableau récapitulatif
    const dailyExtremes = {};
    const summaryRowMatch = html.match(/<tr[^>]*>\s*<td[^>]*>([\d.,]+)\s*°?C<\/td>\s*<td[^>]*>([\d.,]+)\s*°?C<\/td>\s*<td[^>]*>([\d.,]+)\s*km\/h<\/td>\s*<td[^>]*>([\d.,]+)\s*mm<\/td>/i);
    if (summaryRowMatch) {
        dailyExtremes.tx = parseFloat(summaryRowMatch[1].replace(',', '.'));
        dailyExtremes.tn = parseFloat(summaryRowMatch[2].replace(',', '.'));
        dailyExtremes.fxi = parseFloat(summaryRowMatch[3].replace(',', '.'));
        dailyExtremes.rr = parseFloat(summaryRowMatch[4].replace(',', '.'));
    } else {
        const cleanVal = (str) => {
            if (!str) return null;
            const val = parseFloat(str.replace(/<[^>]*>/g, '').replace(/[^\d.-]/g, '').replace(',', '.'));
            return isNaN(val) ? null : val;
        };
        const txMatch = html.match(/Temp[ée]rature Maxi\.<br>.*?<\/font><\/b><\/td>.*?<td[^>]*>(.*?)<\/td>/is);
        const tnMatch = html.match(/Temp[ée]rature Mini\.<br>.*?<\/font><\/b><\/td>.*?<td[^>]*>(.*?)<\/td>/is);
        const fxMatch = html.match(/Rafale maxi\.<br>.*?<\/font><\/i><\/b><\/td>.*?<td[^>]*>(.*?)<\/td>/is);
        const rrMatch = html.match(/Pr[ée]cipitations<br>.*?<\/font><\/td>.*?<td[^>]*>(.*?)<\/td>/is);
        if (txMatch) dailyExtremes.tx = cleanVal(txMatch[1]);
        if (tnMatch) dailyExtremes.tn = cleanVal(tnMatch[1]);
        if (fxMatch) dailyExtremes.fxi = cleanVal(fxMatch[1]);
        if (rrMatch) dailyExtremes.rr = cleanVal(rrMatch[1]);
    }

    // 2. Extraire toutes les lignes d'observations (format 6-min "23h54" ou horaire "23 h")
    const observations = [];
    const trMatches = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

    for (const tr of trMatches) {
        const cells = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
        if (cells.length < 8) continue;

        const timeRaw = cells[0].replace(/<[^>]*>/g, '').trim();
        const timeMatch = timeRaw.match(/^(\d{1,2})\s*h\s*(\d{0,2})/i);
        if (!timeMatch) continue;

        const hour = parseInt(timeMatch[1], 10);
        const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
        if (isNaN(hour)) continue;

        const timeFormatted = `${String(hour).padStart(2, '0')}h${String(minute).padStart(2, '0')}`;

        const getCellVal = (idx) => {
            if (!cells[idx]) return null;
            const text = cells[idx].replace(/<[^>]*>/g, '').trim();
            if (!text || text === '\u00A0' || text === '&nbsp;' || text === ' ' || text.toLowerCase().includes('aucune')) return null;
            const val = parseFloat(text.replace(/[^\d.-]/g, '').replace(',', '.'));
            return isNaN(val) ? null : val;
        };

        // Extraction Vent moyen et Rafale max (Cellule 8 Météociel avec format "54 km/h (91 km/h)")
        let windAvg = null;
        let windGust = null;
        const cell8Text = cells[8] ? cells[8].replace(/<[^>]*>/g, '').trim() : '';
        const m8 = cell8Text.match(/(\d+(?:[.,]\d+)?)\s*km\/h(?:\s*\((\d+(?:[.,]\d+)?)\s*km\/h\))?/i);
        if (m8) {
            windAvg = parseFloat(m8[1].replace(',', '.'));
            windGust = m8[2] ? parseFloat(m8[2].replace(',', '.')) : windAvg;
        } else {
            // Scanner les cellules 6 à 9 en évitant les attributs img/tooltip
            for (let c = 6; c <= 9; c++) {
                if (!cells[c] || cells[c].includes('<img')) continue;
                const text = cells[c].replace(/<[^>]*>/g, '').trim();
                const m = text.match(/(\d+(?:[.,]\d+)?)\s*km\/h(?:\s*\((\d+(?:[.,]\d+)?)\s*km\/h\))?/i);
                if (m) {
                    windAvg = parseFloat(m[1].replace(',', '.'));
                    windGust = m[2] ? parseFloat(m[2].replace(',', '.')) : windAvg;
                    break;
                }
            }
        }

        // Précipitations (dernière cellule)
        let rain = 0;
        const lastCellText = cells[cells.length - 1].replace(/<[^>]*>/g, '').trim().toLowerCase();
        if (!lastCellText.includes('aucune')) {
            const rVal = getCellVal(cells.length - 1);
            if (rVal !== null) rain = rVal;
        }

        // Pression (cellule 9 en priorité ou recherche hPa)
        let pres = getCellVal(9);
        if (pres === null) {
            for (let c = 8; c < cells.length; c++) {
                if (!cells[c] || cells[c].includes('<img')) continue;
                const text = cells[c].replace(/<[^>]*>/g, '').trim();
                if (text.includes('hPa')) {
                    pres = getCellVal(c);
                    break;
                }
            }
        }

        observations.push({
            time: timeFormatted,
            hour,
            minute,
            t: getCellVal(2),         // Température
            temp: getCellVal(2),
            u: getCellVal(3),         // Humidité
            hum: getCellVal(3),
            td: getCellVal(4),        // Point de rosée
            dewpoint: getCellVal(4),
            ff: windAvg,              // Vent moyen km/h
            wind: windAvg,
            fxi: windGust,            // Rafale max km/h
            gust: windGust,
            fxi3s: windGust,
            pres: pres,               // Pression hPa
            rr: rain,                 // Précipitations mm
            rain: rain
        });
    }

    return {
        extremes: dailyExtremes,
        observations: observations.reverse() // Ordre chronologique (00h00 -> 23h54)
    };
};

export const fetchStationObservations = async (stationId, date, isIntra = false) => {
    try {
        const d = new Date(date);
        const day = d.getDate();
        const month = d.getMonth(); // 0-indexed for mois2
        const year = d.getFullYear();

        const url = `${API_METEOCIEL}/temps-reel/obs_villes.php?code2=${stationId}&jour2=${day}&mois2=${month}&annee2=${year}${isIntra ? '&affint=1' : ''}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);

        const buffer = await response.arrayBuffer();
        const html = new TextDecoder('windows-1252').decode(buffer);

        const parsedData = parseStationObservations(html);

        return {
            date: date,
            stationId,
            ...parsedData
        };
    } catch (error) {
        console.error(`[MeteocielService] Error fetching observations for ${stationId}:`, error);
        return null;
    }
};

/**
 * Rétro-compatibilité : Récupère uniquement les extrêmes quotidiens
 */
export const fetchStationDayExtremes = async (stationId, date) => {
    const data = await fetchStationObservations(stationId, date);
    return data ? { date: data.date, poste: stationId, ...data.extremes } : null;
};

/**
 * Récupère les données sur une période donnée (boucle sur les jours)
 */
export const fetchStationHistory = async (stationId, startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const results = [];

    let current = new Date(start);
    while (current <= end) {
        const dateStr = current.toLocaleDateString('sv-SE');
        const data = await fetchStationDayExtremes(stationId, dateStr);
        if (data) {
            results.push(data);
        }
        current.setDate(current.getDate() + 1);

        // Petite pause pour ne pas spammer et pour laisser le thread libre
        if (results.length % 5 === 0) {
            await new Promise(r => setTimeout(r, 100));
        }
    }

    return results;
};

/**
 * Récupère les archives complètes (plusieurs modes) pour une plage de dates
 * Simule les requêtes PowerQuery agrégées (Multi-dates)
 */
export const fetchMultiDateArchives = async (startDate, endDate, modeId) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const allData = [];

    let current = new Date(start);
    while (current <= end) {
        const dateStr = current.toLocaleDateString('sv-SE');
        try {
            const dailyData = await fetchMeteocielArchives(dateStr, modeId);
            // Ajouter la date à chaque ligne comme dans PowerQuery AddedDate = Table.AddColumn(Data, "Date", each uneDate)
            const dailyWithDate = dailyData.map(item => ({
                ...item,
                date: dateStr
            }));
            allData.push(...dailyWithDate);
        } catch (err) {
            console.error(`Error for date ${dateStr}:`, err);
        }

        current.setDate(current.getDate() + 1);

        // Pause pour éviter d'être bloqué par le serveur (Meteociel archive est sensible)
        await new Promise(r => setTimeout(r, 150));
    }

    return allData;
};
