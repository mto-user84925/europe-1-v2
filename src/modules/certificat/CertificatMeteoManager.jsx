import React, { useEffect, useRef, useState } from 'react';
import { supabase, weatherAPI } from '../../services/api';
import { DEPARTMENTS } from '../../data/departments';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { FileText, Calendar, Thermometer, CloudRain, Wind, ShieldCheck, Download, Printer, Copy, Eraser, Save, Mail, Phone, Briefcase, Trash2 } from 'lucide-react';
import './CertificatMeteoManager.css';

const CertificatMeteoManager = () => {
    // --- États du formulaire demandeur ---
    const [clientName, setClientName] = useState('');
    const [clientAddress, setClientAddress] = useState('');
    const [clientCity, setClientCity] = useState('');
    const [clientZip, setClientZip] = useState('');
    const [clientEmail, setClientEmail] = useState('');
    const [clientPhone, setClientPhone] = useState('');

    // --- États Emetteur (Météo Climat Pro) ---
    const [emitterAddress, setEmitterAddress] = useState('400 rue Paul Larfargue');
    const [emitterZip, setEmitterZip] = useState('59283');
    const [emitterCity, setEmitterCity] = useState('RAIMBEAUCOURT');
    const [emitterPhone, setEmitterPhone] = useState('06 83 90 91 60');
    const [emitterEmail, setEmitterEmail] = useState('patrick.marliere@wanadoo.fr');
    const [companyLogo, setCompanyLogo] = useState('/logo.jpg');

    // --- Helpers de dates certifiées DPClim (hier J-1 maximum) ---
    const getYesterdayDate = () => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d.toLocaleDateString('sv-SE');
    };
    const getSevenDaysAgoDate = () => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toLocaleDateString('sv-SE');
    };

    // --- États de l'événement ---
    const [startDate, setStartDate] = useState(getYesterdayDate);
    const [endDate, setEndDate] = useState(getYesterdayDate);
    const [isPeriod, setIsPeriod] = useState(false);
    const [eventTime, setEventTime] = useState('');
    const [eventRange, setEventRange] = useState(''); // Ex: "Matin", "14h-16h"
    const [certType, setCertType] = useState('Vent violent');
    const [certRef, setCertRef] = useState('CERT-' + Date.now().toString().slice(-6));

    // --- États techniques & Données ---
    const [stations, setStations] = useState([]);
    const [selectedDept, setSelectedDept] = useState('');
    const [selectedStationId, setSelectedStationId] = useState('');
    const [stationMeteo, setStationMeteo] = useState('');
    const [stationMeteoTemp, setStationMeteoTemp] = useState('');
    const [stationMeteoRain, setStationMeteoRain] = useState('');
    const [stationMeteoWind, setStationMeteoWind] = useState('');
    const [showDetailedStations, setShowDetailedStations] = useState(false);
    const [csvStationName, setCsvStationName] = useState('');
    const [loadingStations, setLoadingStations] = useState(false);
    const [stationNames, setStationNames] = useState({});

    const [globalData, setGlobalData] = useState({});
    const [status, setStatus] = useState('');
    const [reportOutput, setReportOutput] = useState('');
    const [showCharts, setShowCharts] = useState(true);
    const [multiChartMode, setMultiChartMode] = useState(false);
    const [chartDesign, setChartDesign] = useState('architect');
    const [showWindAvg, setShowWindAvg] = useState(false);
    const [nearbyStations, setNearbyStations] = useState([]);
    const [selectedStationDist, setSelectedStationDist] = useState(null);

    const [customConclusion, setCustomConclusion] = useState(''); // Pour l'édition manuelle
    const [customSynthesis, setCustomSynthesis] = useState(''); // Pour l'édition manuelle
    const [customClassification, setCustomClassification] = useState(''); // Classement manuel
    const [showValuesUnderTitle, setShowValuesUnderTitle] = useState(true); // Toggle pour les highlights

    // --- États d'affichage des paramètres ---
    const [showWindParams, setShowWindParams] = useState(true);
    const [showRainParams, setShowRainParams] = useState(true);
    const [showTempParams, setShowTempParams] = useState(true);
    const [showHumiParams, setShowHumiParams] = useState(false);
    const [showPresParams, setShowPresParams] = useState(false);
    const [showVisParams, setShowVisParams] = useState(false);

    // --- États d'affichage Annexe ---
    const [showDetailedHumi, setShowDetailedHumi] = useState(false);
    const [showDetailedPres, setShowDetailedPres] = useState(false);
    const [showDetailedVis, setShowDetailedVis] = useState(false);
    const [showDetailedRecords, setShowDetailedRecords] = useState(true);
    const [annexCols, setAnnexCols] = useState({
        temp: true,
        rain: true,
        windA: true,
        windG: true,
        windFxi: true,
        humi: false,
        pres: false,
        vis: false
    });

    // --- États d'import/fusion de fichiers CSV ---
    const [showMergeModal, setShowMergeModal] = useState(false);
    const [csvRowsParsed, setCsvRowsParsed] = useState([]);
    const [csvStationId, setCsvStationId] = useState('');
    const [csvDates, setCsvDates] = useState({ firstDate: null, lastDate: null });
    const [mergeOptionTemp, setMergeOptionTemp] = useState(true);
    const [mergeOptionRain, setMergeOptionRain] = useState(true);
    const [mergeOptionWind, setMergeOptionWind] = useState(true);
    const [mergeMode, setMergeMode] = useState('merge'); // 'merge' or 'overwrite'

    const [archives, setArchives] = useState([]);
    const [showArchivesModal, setShowArchivesModal] = useState(false);
    const [loadingArchives, setLoadingArchives] = useState(false);
    const [panelOpen, setPanelOpen] = useState({
        config: true,
        custom: false,
        classification: false
    });

    const chartRefs = useRef({});
    const fileInputRef = useRef(null);

    // --- Constantes ---
    const CERT_TYPES = [
        "Vent violent",
        "Tempête",
        "Forte pluie",
        "Inondation / Ruissellement",
        "Grêle",
        "Orage / Foudre",
        "Chaleur / Canicule",
        "Gel / Grand froid",
        "Neige",
        "Autre phénomène"
    ];

    // Synchro de stationMeteo (compatibilité DB/Archives)
    useEffect(() => {
        if (stationMeteoTemp === stationMeteoRain && stationMeteoRain === stationMeteoWind) {
            setStationMeteo(stationMeteoTemp);
        } else {
            setStationMeteo(`Temp: ${stationMeteoTemp || '?'}, Pluie: ${stationMeteoRain || '?'}, Vent: ${stationMeteoWind || '?'}`);
            setShowDetailedStations(true);
        }
    }, [stationMeteoTemp, stationMeteoRain, stationMeteoWind]);

    // Synchro dates
    useEffect(() => {
        if (isPeriod && new Date(endDate) < new Date(startDate)) {
            setEndDate(startDate);
        }
    }, [startDate, isPeriod]);

    // Auto-ajustement des paramètres selon le phénomène
    // Auto-ajustement des paramètres selon le phénomène
    useEffect(() => {
        const type = certType.toLowerCase();
        // Reset optionnels (Humi / Press / Vis) restent décochés par défaut sauf si l'utilisateur les coche manuellement
        setShowHumiParams(false); setShowPresParams(false); setShowVisParams(false);

        if (type.includes('vent') || type.includes('tempête')) {
            setShowWindParams(true); setShowRainParams(false); setShowTempParams(false);
        } else if (type.includes('pluie') || type.includes('inondation')) {
            setShowWindParams(false); setShowRainParams(true); setShowTempParams(false);
        } else if (type.includes('chaleur') || type.includes('canicule') || type.includes('froid') || type.includes('gel')) {
            setShowWindParams(false); setShowRainParams(false); setShowTempParams(true);
        } else if (type.includes('orage') || type.includes('grêle')) {
            setShowWindParams(true); setShowRainParams(true); setShowTempParams(false);
        } else if (type.includes('neige')) {
            setShowWindParams(false); setShowRainParams(true); setShowTempParams(true);
        } else {
            setShowWindParams(true); setShowRainParams(true); setShowTempParams(true);
        }
    }, [certType]);

    // Initialisation
    useEffect(() => {
        if (!window.Chart) {
            const script = document.createElement('script');
            script.src = "https://cdn.jsdelivr.net/npm/chart.js";
            script.async = true;
            document.body.appendChild(script);
        }
    }, []);

    // Chargement des stations quand le département change
    useEffect(() => {
        if (!selectedDept) { setStations([]); return; }
        async function getStations() {
            setLoadingStations(true);
            try {
                let data = await weatherAPI.getDepartmentLatestHoraire(selectedDept);
                if (data.length === 0) {
                    // Fallback local
                    const stationNamesData = await import('../../data/stationNames.json');
                    const deptPrefix = (selectedDept === '2A' || selectedDept === '2B') ? '20' : selectedDept;
                    const filtered = Object.entries(stationNamesData.default || stationNamesData)
                        .filter(([id]) => id.startsWith(deptPrefix))
                        .map(([id, name]) => ({ station_id: id, nom_station: name }));
                    data = filtered;
                }
                setStations(data);

                // Récupération des noms
                const names = { ...stationNames };
                const { geoService } = await import('../../services/geoService');
                for (const s of data) {
                    const sid = s.station_id || s.id_station;
                    if (!names[sid]) {
                        if (s.nom_station) names[sid] = s.nom_station;
                        else names[sid] = await geoService.getCommuneName(sid.substring(0, 5), sid);
                    }
                }
                setStationNames(names);
            } catch (e) {
                console.error("Erreur chargement stations:", e);
                setStatus('❌ Erreur chargement stations');
            } finally {
                setLoadingStations(false);
            }
        }
        getStations();
    }, [selectedDept]);

    // Mise à jour du rapport quand les données changent
    useEffect(() => {
        generateReport();
    }, [globalData, clientName, clientAddress, clientCity, clientZip, startDate, endDate, isPeriod, certType, showCharts, multiChartMode, chartDesign, showWindAvg, nearbyStations, selectedStationDist, showValuesUnderTitle, showWindParams, showRainParams, showTempParams, stationMeteo, showDetailedRecords, stationMeteoTemp, stationMeteoRain, stationMeteoWind, annexCols, customClassification, customConclusion, customSynthesis]);

    // --- Calcul "Live" des stations proches si la ville change ---
    useEffect(() => {
        const timer = setTimeout(() => {
            if (clientCity && globalData.rows) {
                const finalEndDate = isPeriod ? endDate : startDate;
                refreshNearbyStations(startDate, finalEndDate);
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [clientCity, selectedStationId, certType, startDate, endDate, isPeriod]);

    const refreshNearbyStations = async (startDate, endDate) => {
        if (!clientCity) return;

        try {
            console.log("[Certificat] Refresh Stations Proches pour:", clientCity);
            const cityResults = await weatherAPI.searchCity(clientCity);
            if (!cityResults || cityResults.length === 0) {
                console.warn("Ville inconnue:", clientCity);
                return;
            }

            const cityLat = cityResults[0].lat;
            const cityLon = cityResults[0].lon;

            // Calcul distances : Essai RPC Supabase puis Fallback 100% autonome local
            let dists = null;
            if (supabase) {
                try {
                    const { data, error } = await supabase.rpc('find_nearest_stations', {
                        lat_input: cityLat,
                        lon_input: cityLon,
                        limit_count: 30
                    });
                    if (!error && data && data.length > 0) dists = data;
                } catch (e) { }
            }

            if (!dists || dists.length === 0) {
                try {
                    const stationsData = await import('../../data/stations_list.json');
                    const list = stationsData.default?.features || stationsData.features || [];
                    const R = 6371;
                    dists = list.map(f => {
                        const [lonS, latS] = f.geometry.coordinates;
                        const dLat = (latS - cityLat) * Math.PI / 180;
                        const dLon = (lonS - cityLon) * Math.PI / 180;
                        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                            Math.cos(cityLat * Math.PI / 180) * Math.cos(latS * Math.PI / 180) *
                            Math.sin(dLon / 2) * Math.sin(dLon / 2);
                        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                        const dKm = Math.round(R * c * 10) / 10;
                        return { id: f.properties.num, name: f.properties.nom, dist_km: dKm };
                    }).sort((a, b) => a.dist_km - b.dist_km).slice(0, 30);
                } catch (e) {
                    console.error("Erreur calcul stations proches local:", e);
                }
            }

            if (!dists || dists.length === 0) return;

            console.log(`[Certificat] ${dists.length} stations candidates trouvées.`);

            // Extraire la distance de la station SÉLECTIONNÉE si elle est dans la liste (ce qui est probable si on a pris large)
            const currentStation = dists.find(s => s.id === selectedStationId);
            if (currentStation) {
                setSelectedStationDist(currentStation.dist_km);
            } else {
                // Si pas trouvée dans le top 20, on peut essayer de calculer manuellement si on a ses coords dans 'stations'
                const sLocal = stations.find(s => s.station_id === selectedStationId);
                if (sLocal && (sLocal.lat || sLocal.latest?.lat)) {
                    const latS = sLocal.lat || sLocal.latest.lat;
                    const lonS = sLocal.lon || sLocal.latest.lon;
                    const R = 6371;
                    const dLat = (latS - cityLat) * Math.PI / 180;
                    const dLon = (lonS - cityLon) * Math.PI / 180;
                    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                        Math.cos(cityLat * Math.PI / 180) * Math.cos(latS * Math.PI / 180) *
                        Math.sin(dLon / 2) * Math.sin(dLon / 2);
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    setSelectedStationDist(R * c);
                } else {
                    setSelectedStationDist(null);
                }
            }

            // Candidats stations proches (toutes les stations ordonnées par distance, hors station sélectionnée)
            const allCandidates = dists.filter(s => s.id !== selectedStationId);
            const targetEnd = isPeriod ? endDate : startDate;
            const isHistorical = targetEnd < new Date().toLocaleDateString('sv-SE');
            const validStations = [];

            const isStationValidForParam = (s, type) => {
                if (!s) return false;
                const t = String(type || '').toLowerCase();
                // Vent / Tempête / Orage / Foudre / Rafale
                if (t.includes('vent') || t.includes('tempête') || t.includes('tempete') || t.includes('orage') || t.includes('foudre') || t.includes('rafale')) {
                    const g = Number(s.maxGust);
                    return s.maxGust !== '-' && s.maxGust !== null && !isNaN(g) && g > 0;
                }
                // Pluie / Inondation / Précipitations
                if (t.includes('pluie') || t.includes('inondation') || t.includes('precip') || t.includes('précip')) {
                    return s.rain !== '-' && s.rain !== null && s.rain !== undefined && s.hasRainMeasure === true;
                }
                // Canicule / Froid / Gel / Température
                if (t.includes('canicule') || t.includes('froid') || t.includes('gel') || t.includes('temp')) {
                    return s.minTemp !== '-' && s.minTemp !== null && s.maxTemp !== '-' && s.maxTemp !== null;
                }
                // Fallback générique
                return (s.maxGust && s.maxGust !== '-') || (s.rain && s.rain !== '-') || (s.maxTemp && s.maxTemp !== '-');
            };

            const fetchCandidateObs = async (s) => {
                try {
                    // 1. Pour les dates passées : DPClim quotidien officiel (ultra-rapide et certifié Météo-France)
                    if (isHistorical) {
                        try {
                            const { meteoFranceClimService } = await import('../../services/meteoFranceClimService');
                            const dailyRows = await meteoFranceClimService.fetchStationHistory(s.id, startDate, targetEnd);
                            if (dailyRows && dailyRows.length > 0) {
                                // Rafale max (fxi3s normalisé 3s OMM en priorité, sinon fxi)
                                const validGustRows = dailyRows.filter(r => (r.fxi3s && r.fxi3s > 0) || (r.fxi && r.fxi > 0));
                                let maxGustVal = '-';
                                let maxGustHour = null;
                                let maxGustDate = null;
                                if (validGustRows.length > 0) {
                                    const maxRow = validGustRows.reduce((max, r) => {
                                        const rGust = r.fxi3s || r.fxi || 0;
                                        const mGust = max.fxi3s || max.fxi || 0;
                                        return rGust > mGust ? r : max;
                                    }, validGustRows[0]);
                                    maxGustVal = Math.round(maxRow.fxi3s || maxRow.fxi);
                                    maxGustHour = maxRow.hxi || null;
                                    maxGustDate = maxRow.date || null;
                                }

                                // Pluie cumulée
                                const validRainRows = dailyRows.filter(r => r.rr !== null && r.rr !== undefined);
                                const hasRain = validRainRows.length > 0;
                                const totalRain = validRainRows.reduce((acc, r) => acc + (r.rr || 0), 0);

                                // Températures min / max
                                const validTnRows = dailyRows.filter(r => r.tn !== null && r.tn !== undefined);
                                const validTxRows = dailyRows.filter(r => r.tx !== null && r.tx !== undefined);
                                const minTn = validTnRows.length > 0 ? Math.min(...validTnRows.map(r => r.tn)) : null;
                                const maxTx = validTxRows.length > 0 ? Math.max(...validTxRows.map(r => r.tx)) : null;

                                return {
                                    id: s.id,
                                    name: s.name || s.id,
                                    dist: s.dist_km,
                                    maxGust: maxGustVal,
                                    maxGustHour: maxGustHour,
                                    maxGustDate: maxGustDate,
                                    rain: hasRain ? totalRain.toFixed(1).replace('.', ',') : '-',
                                    hasRainMeasure: hasRain,
                                    minTemp: minTn !== null ? minTn.toFixed(1).replace('.', ',') : '-',
                                    maxTemp: maxTx !== null ? maxTx.toFixed(1).replace('.', ',') : '-',
                                    snow: '-'
                                };
                            }
                        } catch (eDaily) {
                            console.warn(`[Certificat] Échec DPClim quotidien station ${s.id}:`, eDaily);
                        }
                    }

                    // 2. Fallback horaire / 6mn (pour aujourd'hui ou secours)
                    let sHistory = await weatherAPI.getStationHourlyHistoryRange(s.id, startDate, targetEnd);
                    if (!sHistory || sHistory.length === 0) {
                        try {
                            const { meteoFrancePosteService } = await import('../../services/meteoFrancePosteService');
                            sHistory = await meteoFrancePosteService.getStationHourlyHistory(s.id, startDate, targetEnd);
                        } catch (e) { }
                    }
                    if (!sHistory || sHistory.length === 0) {
                        try {
                            const data6mn = await weatherAPI.getStation6mnHistory(s.id, new Date(startDate));
                            if (data6mn && data6mn.length > 0) {
                                sHistory = data6mn.map(d => ({
                                    temp: d.temp,
                                    rain: d.rain,
                                    gust: d.gust,
                                    time: d.time
                                }));
                            }
                        } catch (e) { }
                    }

                    if (sHistory && sHistory.length > 0) {
                        const gustRows = sHistory.filter(r => (r.gust && r.gust > 0) || (r.fxi3s && r.fxi3s > 0) || (r.fxi && r.fxi > 0));
                        let maxGustVal = '-';
                        let maxGustHour = null;
                        if (gustRows.length > 0) {
                            const maxRow = gustRows.reduce((max, r) => {
                                const rG = r.gust || r.fxi3s || r.fxi || 0;
                                const mG = max.gust || max.fxi3s || max.fxi || 0;
                                return rG > mG ? r : max;
                            }, gustRows[0]);
                            maxGustVal = Math.round(maxRow.gust || maxRow.fxi3s || maxRow.fxi);
                            maxGustHour = maxRow.hfxi3s_time || maxRow.hfxi_time || maxRow.time || null;
                        }

                        const tempRows = sHistory.filter(r => r.temp !== null && r.temp !== undefined);
                        const minTempRow = tempRows.length > 0 ? tempRows.reduce((min, r) => r.temp < min.temp ? r : min, tempRows[0]) : null;
                        const maxTempRow = tempRows.length > 0 ? tempRows.reduce((max, r) => r.temp > max.temp ? r : max, tempRows[0]) : null;

                        const rainRows = sHistory.filter(r => r.rain !== null && r.rain !== undefined);
                        const hasRain = rainRows.length > 0;
                        const totalRain = rainRows.reduce((acc, r) => acc + (r.rain || 0), 0);

                        return {
                            id: s.id,
                            name: s.name || s.id,
                            dist: s.dist_km,
                            maxGust: maxGustVal,
                            maxGustDate: maxGustHour,
                            rain: hasRain ? totalRain.toFixed(1).replace('.', ',') : '-',
                            hasRainMeasure: hasRain,
                            minTemp: minTempRow ? minTempRow.temp.toFixed(1).replace('.', ',') : '-',
                            maxTemp: maxTempRow ? maxTempRow.temp.toFixed(1).replace('.', ',') : '-',
                            snow: '-'
                        };
                    }

                    return {
                        id: s.id,
                        name: s.name || s.id,
                        dist: s.dist_km,
                        maxGust: '-',
                        maxGustDate: null,
                        rain: '-',
                        hasRainMeasure: false,
                        minTemp: '-',
                        maxTemp: '-',
                        snow: '-'
                    };
                } catch (e) {
                    return {
                        id: s.id,
                        name: s.name || s.id,
                        dist: s.dist_km,
                        maxGust: '-',
                        maxGustDate: null,
                        rain: '-',
                        hasRainMeasure: false,
                        minTemp: '-',
                        maxTemp: '-',
                        snow: '-'
                    };
                }
            };

            // Parcourir les stations candidates par lots de 4 pour trouver STRICTEMENT les 3 stations les plus proches
            // mesurant le paramètre requis (si une station ne mesure pas, on passe au suivant)
            const BATCH_SIZE = 4;
            for (let i = 0; i < allCandidates.length && validStations.length < 3; i += BATCH_SIZE) {
                const batch = allCandidates.slice(i, i + BATCH_SIZE);
                const batchResults = await Promise.all(batch.map(s => fetchCandidateObs(s)));
                for (const res of batchResults) {
                    if (!res) continue;
                    if (isStationValidForParam(res, certType)) {
                        validStations.push(res);
                        console.log(`[Certificat] Station retenue (${validStations.length}/3) : ${res.name} (${res.dist} km) - Rafale: ${res.maxGust} km/h - Pluie: ${res.rain} mm`);
                        if (validStations.length === 3) break;
                    } else {
                        console.log(`[Certificat] Station ignorée : ${res.name} (ne mesure pas le paramètre requis pour ${certType})`);
                    }
                }
            }

            console.log(`[Certificat] ${validStations.length} stations valides trouvées pour ${certType}`);
            setNearbyStations(validStations.slice(0, 3));
        } catch (errGeo) {
            console.error("Erreur refreshNearbyStations:", errGeo);
        }
    };

    const handleSaveToDB = async () => {
        if (!globalData.rows) return;
        setStatus('⏳ Enregistrement...');
        try {
            const payload = {
                nom_client: clientName || 'Sans Nom',
                adresse: clientAddress,
                ville: clientCity,
                code_postal: clientZip,
                email_client: clientEmail,
                date_sinistre: startDate,
                heure_sinistre: eventTime,
                type_certificat: certType,
                station_reference: stationMeteo,
                station_id: selectedStationId,
                donnees_brutes_json: {
                    stats: globalData.stats,
                    rows: globalData.rows,
                    summary: customSynthesis,
                    conclusion: customConclusion,
                    stationMeteoTemp,
                    stationMeteoRain,
                    stationMeteoWind,
                    showDetailedStations,
                    annexCols
                },
                date_generation: new Date()
            };

            const { error } = await supabase.from('certificats_meteo').insert([payload]);
            if (error) throw error;
            setStatus('✅ Certificat enregistré en base avec succès.');
        } catch (e) {
            console.error(e);
            setStatus('❌ Erreur : ' + e.message);
        }
    };

    const fetchArchives = async () => {
        setLoadingArchives(true);
        try {
            const { data, error } = await supabase
                .from('certificats_meteo')
                .select('*')
                .order('date_generation', { ascending: false });
            if (error) throw error;
            setArchives(data || []);
            setShowArchivesModal(true);
        } catch (e) {
            console.error(e);
            alert("Erreur lors du chargement des archives");
        } finally {
            setLoadingArchives(false);
        }
    };

    const deleteArchive = async (id) => {
        if (!window.confirm("Voulez-vous vraiment supprimer ce certificat ?")) return;
        try {
            const { error } = await supabase.from('certificats_meteo').delete().eq('id', id);
            if (error) throw error;
            setArchives(archives.filter(a => a.id !== id));
            setStatus('🗑️ Certificat supprimé.');
        } catch (e) {
            console.error(e);
            alert("Erreur lors de la suppression");
        }
    };

    const loadArchive = (a) => {
        setClientName(a.nom_client || '');
        setClientAddress(a.adresse || '');
        setClientCity(a.ville || '');
        setClientZip(a.code_postal || '');
        setClientEmail(a.email_client || '');
        setStartDate(a.date_sinistre || '');
        setEventTime(a.heure_sinistre || '');
        setCertType(a.type_certificat || 'Vent violent');
        setSelectedStationId(a.station_id || '');
        if (a.donnees_brutes_json) {
            setGlobalData({
                rows: a.donnees_brutes_json.rows || [],
                stats: a.donnees_brutes_json.stats || {},
                date: a.date_sinistre
            });
            setCustomSynthesis(a.donnees_brutes_json.summary || '');
            setCustomConclusion(a.donnees_brutes_json.conclusion || '');
            
            const dbTemp = a.donnees_brutes_json.stationMeteoTemp || a.station_reference || '';
            const dbRain = a.donnees_brutes_json.stationMeteoRain || a.station_reference || '';
            const dbWind = a.donnees_brutes_json.stationMeteoWind || a.station_reference || '';
            setStationMeteoTemp(dbTemp);
            setStationMeteoRain(dbRain);
            setStationMeteoWind(dbWind);
            setShowDetailedStations(a.donnees_brutes_json.showDetailedStations || false);

            if (a.donnees_brutes_json.annexCols) {
                setAnnexCols(a.donnees_brutes_json.annexCols);
            }
        }
        setShowArchivesModal(false);
        setStatus(`📂 Certificat chargé : ${a.nom_client} (${a.date_sinistre})`);
    };

    // --- Récupération des données depuis un fichier CSV ---
    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setStatus('⏳ Lecture du fichier CSV...');
        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const content = event.target.result;
                const lines = content.split('\n');
                if (lines.length < 2) throw new Error("Fichier vide ou mal formaté");

                const headers = lines[0].split(';').map(h => h.trim().toUpperCase());
                const isDPClim = headers.includes('RR1') || headers.includes('FXI3S') || (headers.includes('POSTE') && headers.length > 8);

                const rows = [];
                let firstDate = null;
                let lastDate = null;
                let stationId = '';

                if (isDPClim) {
                    const idxPoste = headers.indexOf('POSTE') !== -1 ? headers.indexOf('POSTE') : headers.indexOf('NUM_POSTE');
                    const idxDate = headers.indexOf('DATE');
                    const idxT = headers.indexOf('T');
                    const idxTN = headers.indexOf('TN');
                    const idxTX = headers.indexOf('TX');
                    const idxRR1 = headers.indexOf('RR1');
                    const idxFF = headers.indexOf('FF');
                    const idxFXI3S = headers.indexOf('FXI3S');
                    const idxU = headers.indexOf('U');
                    const idxVV = headers.indexOf('VV');

                    const parseVal = (cols, idx) => {
                        if (idx === -1 || idx >= cols.length) return null;
                        const v = cols[idx];
                        if (!v || v === '' || v === 'null') return null;
                        const n = parseFloat(v.replace(',', '.'));
                        return isNaN(n) ? null : n;
                    };

                    lines.slice(1).forEach(line => {
                        const cols = line.split(';').map(c => c.trim());
                        if (cols.length < 5) return;
                        const rawDate = idxDate !== -1 ? cols[idxDate] : '';
                        if (!rawDate || rawDate.length < 10) return;

                        const year = parseInt(rawDate.substring(0, 4), 10);
                        const month = parseInt(rawDate.substring(4, 6), 10);
                        const day = parseInt(rawDate.substring(6, 8), 10);
                        const hour = parseInt(rawDate.substring(8, 10), 10);

                        const utcMs = Date.UTC(year, month - 1, day, hour, 0, 0);
                        const dtUtc = new Date(utcMs);
                        const frParts = new Intl.DateTimeFormat('fr-FR', {
                            timeZone: 'Europe/Paris',
                            year: 'numeric', month: '2-digit', day: '2-digit',
                            hour: '2-digit', minute: '2-digit', hour12: false
                        }).formatToParts(dtUtc);
                        const pVal = (t) => frParts.find(p => p.type === t)?.value || '';
                        const lYear = pVal('year');
                        const lMonth = pVal('month');
                        const lDay = pVal('day');
                        const lHour = parseInt(pVal('hour'), 10);

                        const dateObj = new Date(parseInt(lYear, 10), parseInt(lMonth, 10) - 1, parseInt(lDay, 10), lHour, 0, 0);
                        const datePure = new Date(parseInt(lYear, 10), parseInt(lMonth, 10) - 1, parseInt(lDay, 10));

                        if (!firstDate || datePure < firstDate) firstDate = datePure;
                        if (!lastDate || datePure > lastDate) lastDate = datePure;

                        if (idxPoste !== -1 && cols[idxPoste]) stationId = cols[idxPoste];

                        const temp = parseVal(cols, idxT);
                        const tn = parseVal(cols, idxTN);
                        const tx = parseVal(cols, idxTX);
                        const rr1 = parseVal(cols, idxRR1) ?? 0;
                        const ffMS = parseVal(cols, idxFF);
                        const ffKmh = ffMS !== null ? Math.round(ffMS * 3.6) : null;
                        const fxi3sMS = parseVal(cols, idxFXI3S);
                        const fxi3sKmh = fxi3sMS !== null ? Math.round(fxi3sMS * 3.6) : null;
                        const idxFXI = headers.indexOf('FXI');
                        const fxiMS = parseVal(cols, idxFXI);
                        const fxiRawKmh = fxiMS !== null ? Math.round(fxiMS * 3.6) : null;
                        const u = parseVal(cols, idxU);
                        const vv = parseVal(cols, idxVV);

                        let tempVal = temp !== null ? temp : (tx !== null && tn !== null ? parseFloat(((tx + tn) / 2).toFixed(1)) : (tn !== null ? tn : (tx !== null ? tx : 0)));

                        rows.push({
                            time: dateObj,
                            h: lHour,
                            temp: tempVal,
                            tmin: tn,
                            tmax: tx,
                            rain: rr1,
                            w_avg: ffKmh || (fxi3sKmh ? Math.round(fxi3sKmh * 0.6) : (fxiRawKmh ? Math.round(fxiRawKmh * 0.6) : 0)),
                            w_gst: fxi3sKmh || fxiRawKmh || 0,
                            w_fxi: fxiRawKmh || fxi3sKmh || 0,
                            humi: u || 0,
                            pres: 1013,
                            vv: vv || 10
                        });
                    });
                } else {
                    const dataLines = lines.slice(1).filter(l => l.trim().length > 0);
                    let maxFxiSeen = 0;
                    dataLines.forEach(line => {
                        const cols = line.trim().split(';');
                        if (cols.length >= 6) {
                            const fxi = parseFloat(cols[5]?.replace(',', '.')) || 0;
                            if (fxi > maxFxiSeen) maxFxiSeen = fxi;
                        }
                    });
                    const windMultiplier = maxFxiSeen > 40 ? 1 : 3.6;

                    dataLines.forEach(line => {
                        const cols = line.trim().split(';');
                        if (cols.length < 5) return;

                        const rawDate = cols[1];
                        if (!rawDate || (rawDate.length !== 8 && rawDate.length !== 10)) return;

                        const year = parseInt(rawDate.substring(0, 4));
                        const month = parseInt(rawDate.substring(4, 6));
                        const day = parseInt(rawDate.substring(6, 8));
                        const hour = rawDate.length === 10 ? parseInt(rawDate.substring(8, 10)) : 12;

                        const dateObj = new Date(year, month - 1, day, hour, 0, 0);
                        const datePure = new Date(year, month - 1, day);

                        if (!firstDate || datePure < firstDate) firstDate = datePure;
                        if (!lastDate || datePure > lastDate) lastDate = datePure;

                        stationId = cols[0];

                        const rr = parseFloat(cols[2]?.replace(',', '.')) || 0;
                        const tn = parseFloat(cols[3]?.replace(',', '.')) || 99;
                        const tx = parseFloat(cols[4]?.replace(',', '.')) || -99;
                        const fxi = parseFloat(cols[5]?.replace(',', '.')) || 0;

                        let tempVal = (tn !== 99 && tx !== -99) ? (tn + tx) / 2 : (tn !== 99 ? tn : tx);
                        if (tempVal === 99 || tempVal === -99) tempVal = 0;

                        rows.push({
                            time: dateObj,
                            h: hour,
                            temp: tempVal,
                            tmin: tn !== 99 ? tn : null,
                            tmax: tx !== -99 ? tx : null,
                            rain: rr,
                            w_avg: fxi * windMultiplier,
                            w_gst: fxi * windMultiplier,
                            humi: 0,
                            pres: 1013,
                            vv: 10
                        });
                    });
                }

                if (rows.length === 0) throw new Error("Aucune donnée valide trouvée dans le fichier.");

                rows.sort((a, b) => a.time - b.time);

                // Calculer les stats globales pour le certificat
                const windMaxRow = rows.reduce((prev, curr) => (Number(prev.w_gst) >= Number(curr.w_gst) ? prev : curr), rows[0]);
                const fxiMaxRow = rows.reduce((prev, curr) => (Number(prev.w_fxi || prev.w_gst || 0) >= Number(curr.w_fxi || curr.w_gst || 0) ? prev : curr), rows[0]);
                const rainMaxRow = rows.reduce((prev, curr) => (Number(prev.rain) >= Number(curr.rain) ? prev : curr), rows[0]);
                const tempMaxRow = rows.reduce((prev, curr) => (Number(prev.tmax !== null ? prev.tmax : prev.temp) >= Number(curr.tmax !== null ? curr.tmax : curr.temp) ? prev : curr), rows[0]);
                const tempMinRow = rows.reduce((prev, curr) => (Number(prev.tmin !== null ? prev.tmin : prev.temp) <= Number(curr.tmin !== null ? curr.tmin : curr.temp) ? prev : curr), rows[0]);

                const stats = {
                    tempMax: tempMaxRow.tmax !== null ? tempMaxRow.tmax : tempMaxRow.temp,
                    tempMaxTime: tempMaxRow.time,
                    tempMin: tempMinRow.tmin !== null ? tempMinRow.tmin : tempMinRow.temp,
                    tempMinTime: tempMinRow.time,
                    rainTotal: rows.reduce((acc, r) => acc + (Number(r.rain) || 0), 0),
                    snowTotal: rows.reduce((acc, r) => acc + (Number(r.temp) <= 0 ? (Number(r.rain) || 0) : 0), 0),
                    windGustMax: windMaxRow.w_gst,
                    windGustMaxTime: windMaxRow.time,
                    windFxiMax: fxiMaxRow ? (fxiMaxRow.w_fxi || fxiMaxRow.w_gst || 0) : windMaxRow.w_gst,
                    windFxiMaxTime: fxiMaxRow ? fxiMaxRow.time : windMaxRow.time,
                    windAvgMax: Math.max(...rows.map(r => Number(r.w_avg) || 0)),
                    rainMaxH: rainMaxRow.rain,
                    rainMaxTime: rainMaxRow.time,
                    humMax: 0
                };

                const isPeriodVal = firstDate.getTime() !== lastDate.getTime();

                setCsvRowsParsed(rows);
                setCsvStationId(stationId);
                setCsvStationName(stationId);
                setCsvDates({ firstDate, lastDate });

                if (globalData.rows && globalData.rows.length > 0) {
                    setMergeMode('merge');
                } else {
                    setMergeMode('overwrite');
                }

                setShowMergeModal(true);
                setStatus('⏳ Fichier CSV analysé. Veuillez configurer les options de fusion dans la fenêtre.');
            } catch (err) {
                console.error(err);
                setStatus('❌ Erreur Import : ' + err.message);
            }
        };

        reader.readAsText(file);
    };

    // --- Validation et fusion des données CSV ---
    const handleConfirmMerge = () => {
        try {
            if (csvRowsParsed.length === 0) return;

            let finalRows = [];
            let firstDate = csvDates.firstDate;
            let lastDate = csvDates.lastDate;

            if (mergeMode === 'overwrite' || !globalData.rows || globalData.rows.length === 0) {
                // Filtrer par paramètres sélectionnés
                finalRows = csvRowsParsed.map(row => ({
                    time: row.time,
                    h: row.h,
                    temp: mergeOptionTemp ? row.temp : 0,
                    tmin: mergeOptionTemp ? row.tmin : null,
                    tmax: mergeOptionTemp ? row.tmax : null,
                    rain: mergeOptionRain ? row.rain : 0,
                    w_avg: mergeOptionWind ? row.w_avg : 0,
                    w_gst: mergeOptionWind ? row.w_gst : 0,
                    humi: 0,
                    pres: 1013,
                    vv: 10
                }));
            } else {
                // Fusionner les données actuelles avec les données du CSV
                const existingRows = globalData.rows.map(r => ({ ...r }));

                const getRowKey = (row) => {
                    const d = new Date(row.time);
                    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}_H${row.h}`;
                };

                const existingMap = {};
                existingRows.forEach((r, idx) => {
                    existingMap[getRowKey(r)] = idx;
                });

                csvRowsParsed.forEach(csvRow => {
                    const key = getRowKey(csvRow);
                    if (existingMap[key] !== undefined) {
                        const matchIdx = existingMap[key];
                        // Mettre à jour seulement les paramètres sélectionnés
                        if (mergeOptionTemp) {
                            existingRows[matchIdx].temp = csvRow.temp;
                            existingRows[matchIdx].tmin = csvRow.tmin;
                            existingRows[matchIdx].tmax = csvRow.tmax;
                        }
                        if (mergeOptionRain) {
                            existingRows[matchIdx].rain = csvRow.rain;
                        }
                        if (mergeOptionWind) {
                            existingRows[matchIdx].w_avg = csvRow.w_avg;
                            existingRows[matchIdx].w_gst = csvRow.w_gst;
                        }
                    } else {
                        // Si pas de correspondance, on ajoute une nouvelle ligne
                        const newRow = {
                            time: csvRow.time,
                            h: csvRow.h,
                            temp: mergeOptionTemp ? csvRow.temp : 0,
                            tmin: mergeOptionTemp ? csvRow.tmin : null,
                            tmax: mergeOptionTemp ? csvRow.tmax : null,
                            rain: mergeOptionRain ? csvRow.rain : 0,
                            w_avg: mergeOptionWind ? csvRow.w_avg : 0,
                            w_gst: mergeOptionWind ? csvRow.w_gst : 0,
                            humi: 0,
                            pres: 1013,
                            vv: 10
                        };
                        existingRows.push(newRow);
                    }
                });

                finalRows = existingRows;

                // Mettre à jour les dates limites globales
                const datesOnly = finalRows.map(r => new Date(r.time.getFullYear(), r.time.getMonth(), r.time.getDate()));
                firstDate = new Date(Math.min(...datesOnly.map(d => d.getTime())));
                lastDate = new Date(Math.max(...datesOnly.map(d => d.getTime())));
            }

            finalRows.sort((a, b) => a.time - b.time);

            // Recalculer les statistiques sur les lignes finales
            const windMaxRow = finalRows.reduce((prev, curr) => (Number(prev.w_gst) >= Number(curr.w_gst) ? prev : curr), finalRows[0]);
            const rainMaxRow = finalRows.reduce((prev, curr) => (Number(prev.rain) >= Number(curr.rain) ? prev : curr), finalRows[0]);
            const tempMaxRow = finalRows.reduce((prev, curr) => (Number(prev.tmax !== null ? prev.tmax : prev.temp) >= Number(curr.tmax !== null ? curr.tmax : curr.temp) ? prev : curr), finalRows[0]);
            const tempMinRow = finalRows.reduce((prev, curr) => (Number(prev.tmin !== null ? prev.tmin : prev.temp) <= Number(curr.tmin !== null ? curr.tmin : curr.temp) ? prev : curr), finalRows[0]);

            const stats = {
                tempMax: tempMaxRow.tmax !== null ? tempMaxRow.tmax : tempMaxRow.temp,
                tempMaxTime: tempMaxRow.time,
                tempMin: tempMinRow.tmin !== null ? tempMinRow.tmin : tempMinRow.temp,
                tempMinTime: tempMinRow.time,
                rainTotal: finalRows.reduce((acc, r) => acc + (Number(r.rain) || 0), 0),
                snowTotal: finalRows.reduce((acc, r) => acc + (Number(r.temp) <= 0 ? (Number(r.rain) || 0) : 0), 0),
                windGustMax: windMaxRow.w_gst,
                windGustMaxTime: windMaxRow.time,
                windAvgMax: Math.max(...finalRows.map(r => Number(r.w_avg) || 0)),
                rainMaxH: rainMaxRow.rain,
                rainMaxTime: rainMaxRow.time,
                humMax: 0
            };

            const isPeriodVal = firstDate.getTime() !== lastDate.getTime();

            setGlobalData({
                date: firstDate.toISOString().split('T')[0],
                endDate: isPeriodVal ? lastDate.toISOString().split('T')[0] : null,
                isPeriod: isPeriodVal,
                rows: finalRows,
                stats
            });

            const finalStationName = csvStationName.trim() || csvStationId;
            if (mergeOptionTemp) setStationMeteoTemp(finalStationName);
            if (mergeOptionRain) setStationMeteoRain(finalStationName);
            if (mergeOptionWind) setStationMeteoWind(finalStationName);

            setSelectedStationId(csvStationId);
            setStationMeteo(prev => {
                if (mergeMode === 'overwrite' || !prev) {
                    return `Import CSV (${csvStationId})`;
                }
                return `${prev} + CSV (${csvStationId})`;
            });

            // Sync dates UI
            setStartDate(firstDate.toISOString().split('T')[0]);
            if (isPeriodVal) {
                setIsPeriod(true);
                setEndDate(lastDate.toISOString().split('T')[0]);
            } else {
                setIsPeriod(false);
            }

            const autoConclusion = generateConclusion(stats, certType);
            setCustomConclusion(autoConclusion);

            const autoSynthesis = generateSynthesisText(stats, finalRows);
            setCustomSynthesis(autoSynthesis);

            setStatus(`✅ Données CSV fusionnées avec succès (${finalRows.length} lignes).`);
            setShowMergeModal(false);
        } catch (err) {
            console.error(err);
            setStatus('❌ Erreur Fusion : ' + err.message);
        }
    };

    // --- Logique de récupération des données (Similaire BTP mais simplifiée) ---
    const handleFetchData = async () => {
        if (!selectedStationId || !startDate) {
            setStatus('⚠️ Veuillez sélectionner une station et une date.');
            return;
        }

        setStatus('⏳ Récupération des observations Météociel & certification FXI 3S...');
        setGlobalData({});

        try {
            const finalEndDate = isPeriod ? endDate : startDate;
            const todayStr = new Date().toISOString().split('T')[0];
            const isSingleDayToday = startDate === todayStr && finalEndDate === todayStr;

            // 1. Récupération préalable des indicateurs officiels Météo-France DPClim (FXI 3s OMM, FXI Brut, Tx, Tn, RR)
            let dailyOfficialMap = {};
            try {
                const { meteoFranceClimService } = await import('../../services/meteoFranceClimService');
                const dailyRows = await meteoFranceClimService.fetchStationHistory(selectedStationId, startDate, finalEndDate);
                if (dailyRows && dailyRows.length > 0) {
                    dailyRows.forEach(d => { dailyOfficialMap[d.date] = d; });
                }
                // Si DOUAI (59178001), enrichir avec CAMBRAI-EPINOY (62298001) pour le vent
                if (selectedStationId === '59178001') {
                    try {
                        const cambraiDaily = await meteoFranceClimService.fetchStationHistory('62298001', startDate, finalEndDate);
                        if (cambraiDaily && cambraiDaily.length > 0) {
                            cambraiDaily.forEach(w => {
                                if (!dailyOfficialMap[w.date]) {
                                    dailyOfficialMap[w.date] = { date: w.date };
                                }
                                dailyOfficialMap[w.date].fxi3s = w.fxi3s;
                                dailyOfficialMap[w.date].fxi = w.fxi;
                                dailyOfficialMap[w.date].hxi = w.hxi;
                                dailyOfficialMap[w.date].dxi = w.dxi;
                            });
                        }
                    } catch (eC) {
                        console.warn("[Certificat] Échec DPClim Cambrai:", eC);
                    }
                }
            } catch (eDaily) {
                console.warn("[Certificat] DPClim quotidien info:", eDaily);
            }

            // 2. Récupération des observations fines au pas de 6 minutes (Météociel RADOME - 240 mesures/jour)
            setStatus('⏳ Récupération des relevés 6 minutes Météociel RADOME...');
            let history = [];
            const data6mn = await weatherAPI.getStation6mnHistoryRange(selectedStationId, startDate, finalEndDate, (msg) => setStatus('⏳ ' + msg));
            if (data6mn && data6mn.length > 0) {
                history = data6mn.map(d => ({
                    time: d.time instanceof Date ? d.time : new Date(d.time),
                    date: d.date || (d.time instanceof Date ? d.time.toLocaleDateString('fr-CA') : ''),
                    date_local: d.date_local || d.date,
                    temp: d.temp,
                    rain: d.rain || 0,
                    wind: d.wind || 0,
                    gust: d.gust || d.fxi || 0,
                    fxi3s: d.fxi3s || d.gust || 0,
                    fxi: d.fxi || d.gust || 0,
                    hum: d.hum,
                    pres: d.pressure || d.pres,
                    h: d.time instanceof Date ? d.time.getHours() : (d.h || 0),
                    h_local: d.time instanceof Date ? d.time.getHours() : (d.h || 0)
                }));
            }

            // Si Douai (59178001), récupérer les vents 6mn de Cambrai-Épinoy (62298001) et les synchroniser
            if (selectedStationId === '59178001' && history && history.length > 0) {
                try {
                    const cambrai6mn = await weatherAPI.getStation6mnHistoryRange('62298001', startDate, finalEndDate);
                    if (cambrai6mn && cambrai6mn.length > 0) {
                        const cambraiMap = new Map();
                        const cambraiHourlyMap = new Map();
                        cambrai6mn.forEach(w => {
                            const dt = w.time instanceof Date ? w.time : new Date(w.time);
                            const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}_${dt.getHours()}_${dt.getMinutes()}`;
                            const kH = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}_${dt.getHours()}`;
                            cambraiMap.set(k, w);
                            if (!cambraiHourlyMap.has(kH) || (w.gust || 0) > (cambraiHourlyMap.get(kH)?.gust || 0)) {
                                cambraiHourlyMap.set(kH, w);
                            }
                        });
                        history.forEach(h => {
                            const dt = h.time instanceof Date ? h.time : new Date(h.time);
                            const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}_${dt.getHours()}_${dt.getMinutes()}`;
                            const kH = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}_${dt.getHours()}`;
                            const cMatch = cambraiMap.get(k) || cambraiHourlyMap.get(kH);
                            if (cMatch) {
                                h.wind = cMatch.wind;
                                h.gust = cMatch.gust;
                                h.fxi3s = cMatch.fxi3s || cMatch.gust;
                                h.fxi = cMatch.fxi || cMatch.gust;
                                h.hfxi3s_time = cMatch.hfxi3s_time;
                            }
                        });
                    }
                } catch (eC6) {
                    console.warn("[Certificat] Échec synchronisation 6mn vent Cambrai:", eC6);
                }
            }

            // Secours 1 : si pas de relevé 6 minutes, repli sur l'archive DPClim horaire
            if (!history || history.length === 0) {
                setStatus('⏳ Repli sur Météo-France DPClim horaire...');
                history = await weatherAPI.getStationHourlyHistoryRange(selectedStationId, startDate, finalEndDate, (msg) => setStatus('⏳ ' + msg));
            }

            // Secours 2 : Reconstruction à partir de l'archive quotidienne DPClim (infaillible pour dates passées)
            if ((!history || history.length === 0) && Object.keys(dailyOfficialMap).length > 0) {
                history = Object.values(dailyOfficialMap).map(d => ({
                    date: d.date,
                    date_local: d.date,
                    time: new Date(d.date + 'T12:00:00'),
                    h: 12,
                    h_local: 12,
                    temp: d.tx !== null ? d.tx : d.tn,
                    rain: d.rr || 0,
                    wind: d.fxi3s || d.fxi || 0,
                    gust: d.fxi3s || d.fxi || 0,
                    fxi3s: d.fxi3s,
                    fxi: d.fxi,
                    htn_time: d.htn,
                    htx_time: d.htx,
                    hfxi3s_time: d.hxi,
                    hfxi_time: d.hxi
                }));
            }

            if (!history || history.length === 0) {
                setStatus('❌ Aucune donnée DPClim trouvée pour cette période sur la station sélectionnée.');
                return;
            }

            // Formatage des données
            const rows = history
                .filter(obs => {
                    const d = obs.date_local || obs.date || (obs.time ? (typeof obs.time.toLocaleDateString === 'function' ? obs.time.toLocaleDateString('fr-CA') : '') : '');
                    return d >= startDate && d <= finalEndDate;
                })
                .map(obs => {
                    const dt = obs.time instanceof Date ? obs.time : new Date(obs.time);
                    const rowH = obs.h_local !== undefined ? obs.h_local : (obs.h !== undefined ? obs.h : dt.getHours());
                    const rowM = obs.minute !== undefined ? obs.minute : (isNaN(dt.getTime()) ? 0 : dt.getMinutes());
                    return {
                        time: obs.time || dt,
                        h: rowH,
                        minute: rowM,
                        h_local: obs.h_local !== undefined ? obs.h_local : rowH,
                        h_utc: obs.h_utc !== undefined ? obs.h_utc : rowH,
                        htn_time: obs.htn_time,
                        htx_time: obs.htx_time,
                        hfxi3s_time: obs.hfxi3s_time,
                        hfxi_time: obs.hfxi_time,
                        temp: obs.temp,
                        rain: obs.rain || 0,
                        w_avg: obs.wind !== null && obs.wind !== undefined ? Math.round(obs.wind) : 0,
                        w_gst: Math.round(obs.fxi3s !== undefined && obs.fxi3s !== null ? obs.fxi3s : (obs.gust || 0)),
                        w_fxi: Math.round(obs.fxi !== undefined && obs.fxi !== null ? obs.fxi : (obs.gust || 0)),
                        humi: obs.hum,
                        pres: obs.pres,
                        vv: obs.vv
                    };
                }).sort((a, b) => a.time - b.time);

            if (!rows || rows.length === 0) {
                setStatus('❌ Aucune observation horaire trouvée pour cette période.');
                return;
            }

            // Calcul des stats de la période
            const windMaxRow = rows.reduce((prev, curr) => (Number(prev.w_gst) >= Number(curr.w_gst) ? prev : curr), rows[0]);
            const fxiMaxRow = rows.reduce((prev, curr) => (Number(prev.w_fxi || prev.w_gst || 0) >= Number(curr.w_fxi || curr.w_gst || 0) ? prev : curr), rows[0]);
            const rainMaxRow = rows.reduce((prev, curr) => (Number(prev.rain) >= Number(curr.rain) ? prev : curr), rows[0]);

            const validTempRows = rows.filter(r => r.temp !== null && r.temp !== undefined && !isNaN(r.temp));
            const tempMaxRow = validTempRows.length > 0 ? validTempRows.reduce((prev, curr) => (Number(prev.temp) >= Number(curr.temp) ? prev : curr), validTempRows[0]) : rows[0];
            const tempMinRow = validTempRows.length > 0 ? validTempRows.reduce((prev, curr) => (Number(prev.temp) <= Number(curr.temp) ? prev : curr), validTempRows[0]) : rows[0];

            const formatHourStr = (timeVal, fallbackTime) => {
                if (typeof timeVal === 'string' && timeVal.includes('h')) {
                    const parts = timeVal.split('h');
                    return `${parts[0].padStart(2, '0')}h${(parts[1] || '').padStart(2, '0') || '00'}`;
                }
                const d = fallbackTime instanceof Date ? fallbackTime : (timeVal ? new Date(timeVal) : null);
                if (d && !isNaN(d.getTime())) {
                    return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes() || 0).padStart(2, '0')}`;
                }
                return timeVal ? String(timeVal) : '';
            };

            const stats = {
                tempMax: tempMaxRow.temp,
                tempMaxTime: formatHourStr(tempMaxRow.htx_time, tempMaxRow.time),
                tempMaxDate: tempMaxRow.date || (tempMaxRow.time instanceof Date ? tempMaxRow.time.toLocaleDateString('sv-SE') : null),
                tempMin: tempMinRow.temp,
                tempMinTime: formatHourStr(tempMinRow.htn_time, tempMinRow.time),
                tempMinDate: tempMinRow.date || (tempMinRow.time instanceof Date ? tempMinRow.time.toLocaleDateString('sv-SE') : null),
                rainTotal: rows.reduce((acc, r) => acc + (Number(r.rain) || 0), 0),
                snowTotal: rows.reduce((acc, r) => acc + (Number(r.temp) <= 0 ? (Number(r.rain) || 0) : 0), 0),
                windGustMax: Math.round(windMaxRow.w_gst),
                windGustMaxTime: formatHourStr(windMaxRow.hfxi3s_time, windMaxRow.time),
                windGustMaxDate: windMaxRow.date || (windMaxRow.time instanceof Date ? windMaxRow.time.toLocaleDateString('sv-SE') : null),
                windFxiMax: Math.round(fxiMaxRow ? (fxiMaxRow.w_fxi || fxiMaxRow.w_gst || 0) : windMaxRow.w_gst),
                windFxiMaxTime: formatHourStr(fxiMaxRow?.hfxi_time || fxiMaxRow?.hfxi3s_time || windMaxRow.hfxi3s_time, fxiMaxRow?.time || windMaxRow.time),
                windFxiMaxDate: fxiMaxRow?.date || (fxiMaxRow?.time instanceof Date ? fxiMaxRow.time.toLocaleDateString('sv-SE') : null),
                windAvgMax: Math.round(Math.max(...rows.map(r => Number(r.w_avg) || 0))),
                rainMaxH: rainMaxRow.rain,
                rainMaxTime: formatHourStr(null, rainMaxRow.time),
                rainMaxDate: rainMaxRow.date || (rainMaxRow.time instanceof Date ? rainMaxRow.time.toLocaleDateString('sv-SE') : null),
                humMax: Math.max(...rows.map(r => Number(r.humi) || 0)),
            };

            // Intégration stricte des paramètres certifiés DPClim Météo-France (FXI 3s OMM et FXI Brut)
            const singleOfficial = dailyOfficialMap[startDate];
            if (singleOfficial && !isPeriod) {
                if (singleOfficial.fxi3s !== null && singleOfficial.fxi3s > 0) {
                    stats.windGustMax = Math.round(singleOfficial.fxi3s);
                    stats.windGustMaxTime = singleOfficial.hxi || stats.windGustMaxTime;
                }
                if (singleOfficial.fxi !== null && singleOfficial.fxi > 0) {
                    stats.windFxiMax = Math.round(singleOfficial.fxi);
                    stats.windFxiMaxTime = singleOfficial.hxi || stats.windFxiMaxTime;
                }
                if (singleOfficial.tx !== null) {
                    stats.tempMax = singleOfficial.tx;
                    stats.tempMaxTime = singleOfficial.htx || stats.tempMaxTime;
                }
                if (singleOfficial.tn !== null) {
                    stats.tempMin = singleOfficial.tn;
                    stats.tempMinTime = singleOfficial.htn || stats.tempMinTime;
                }
                if (singleOfficial.rr !== null) {
                    stats.rainTotal = singleOfficial.rr;
                }
            } else if (Object.keys(dailyOfficialMap).length > 0 && isPeriod) {
                const validFxi3s = Object.values(dailyOfficialMap).filter(d => d.fxi3s !== null && d.fxi3s > 0);
                if (validFxi3s.length > 0) {
                    const maxD = validFxi3s.reduce((m, d) => d.fxi3s > m.fxi3s ? d : m, validFxi3s[0]);
                    stats.windGustMax = Math.round(maxD.fxi3s);
                    stats.windGustMaxTime = maxD.hxi || stats.windGustMaxTime;
                    stats.windGustMaxDate = maxD.date;
                }
                const validFxi = Object.values(dailyOfficialMap).filter(d => d.fxi !== null && d.fxi > 0);
                if (validFxi.length > 0) {
                    const maxF = validFxi.reduce((m, d) => d.fxi > m.fxi ? d : m, validFxi[0]);
                    stats.windFxiMax = Math.round(maxF.fxi);
                    stats.windFxiMaxTime = maxF.hxi || stats.windFxiMaxTime;
                    stats.windFxiMaxDate = maxF.date;
                }
            }

            setGlobalData({
                date: startDate,
                endDate: isPeriod ? endDate : null,
                isPeriod,
                rows,
                stats
            });
            const autoConclusion = generateConclusion(stats, certType);
            setCustomConclusion(autoConclusion);

            const autoSynthesis = generateSynthesisText(stats, rows);
            setCustomSynthesis(autoSynthesis);

            const sName = stationNames[selectedStationId] || selectedStationId;
            setStationMeteo(sName);
            setStationMeteoTemp(sName);
            setStationMeteoRain(sName);
            setStationMeteoWind(sName);
            setStatus('✅ Observations Météociel et certification FXI 3S DPClim chargées.');

            refreshNearbyStations(startDate, finalEndDate);

        } catch (e) {
            console.error(e);
            setStatus('❌ Erreur : ' + (e.message || 'Impossible de récupérer les données.'));
        }
    };

    // --- Helpers de Classification & Rapport ---
    const getPhenomenonClassification = (type, stats) => {
        // Style du bloc avec fond bleu clair et bordure
        // Style du bloc avec fond bleu clair et bordure - COMPACT
        const boxStyle = "margin-bottom: 5px; font-family: sans-serif; color: #334155; border: 1px solid #dbeafe; padding: 10px 15px; background: #eff6ff; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;";

        // Texte gauche
        const leftStyle = "text-align: left;";
        const titleStyle = "font-size: 7.5pt; font-weight: bold; margin-bottom: 2px; text-transform: uppercase; color: #003366;";

        // Texte Droite (Valeur)
        const rightStyle = "text-align: right; min-width: 100px; border-left: 1px solid #cbd5e1; padding-left: 15px; margin-left: 15px;";
        const valLabelStyle = "font-size: 7pt; color: #64748b; text-transform: uppercase; margin-bottom: 1px; font-weight: bold;";
        const valStyle = "font-size: 22pt; font-weight: 900; color: #dc2626;"; // Rouge par défaut pour valeur
        const unitStyle = "font-size: 9pt; font-weight: 700; color: #64748b; margin-left: 2px;";

        if (type.includes('Vent') || type.includes('Tempête')) {
            const gust = stats.windGustMax || 0;
            let label = '';
            let color = '#334155';

            // Classification Beaufort / Echelle
            if (gust < 20) label = "Vents faibles (0 à 19 km/h)";
            else if (gust < 40) { label = "Vents modérés (20 à 39 km/h)"; color = '#334155'; }
            else if (gust < 70) { label = "Vents forts (40 à 69 km/h)"; color = '#d97706'; } // Orange
            else if (gust < 100) { label = "Vents très forts (70 à 99 km/h)"; color = '#dc2626'; } // Rouge
            else { label = "Vents tempétueux (≥ 100 km/h)"; color = '#7f1d1d'; } // Bordeaux

            return `
                <div style="${boxStyle}">
                    <div style="${leftStyle}">
                        <div style="${titleStyle}">CLASSEMENT DES RAFALES</div>
                        <div style="font-size: 11pt; font-weight: bold; color: ${color}; margin-bottom: 3px; display: block;">${label}</div>
                        <div style="font-size: 7.5pt; color: #64748b;">(Basé sur la rafale maximale relevée)</div>
                    </div>
                    <div style="${rightStyle}">
                        <div style="${valLabelStyle}">RAFALE MAX</div>
                        <div style="${valStyle} color: ${color};">${Math.round(gust)}<span style="${unitStyle}">km/h</span></div>
                    </div>
                </div>
            `;
        } else if (type.includes('Pluie') || type.includes('Inondation')) {
            const rain = stats.rainTotal || 0;
            let label = '';
            let color = '#334155';

            if (rain < 5) label = "Pluies faibles (< 5 mm)";
            else if (rain < 10) { label = "Pluies modérées (5 à 9 mm)"; color = '#334155'; }
            else if (rain < 20) { label = "Pluies fortes (10 à 19 mm)"; color = '#ca8a04'; }
            else if (rain < 30) { label = "Pluies très fortes (20 à 29 mm)"; color = '#ea580c'; }
            else if (rain < 40) { label = "Pluies abondantes (30 à 39 mm)"; color = '#dc2626'; }
            else { label = "Pluies exceptionnelles (≥ 40 mm)"; color = '#7f1d1d'; }

            return `
                <div style="${boxStyle}">
                    <div style="${leftStyle}">
                        <div style="${titleStyle}">SEUIL DES PRECIPITATIONS</div>
                        <div style="font-size: 11pt; font-weight: bold; color: ${color}; margin-bottom: 3px;">${label}</div>
                        <div style="font-size: 7.5pt; color: #64748b;">(Basé sur le cumul relevé)</div>
                    </div>
                    <div style="${rightStyle}">
                        <div style="${valLabelStyle}">CUMUL PLUIE</div>
                        <div style="${valStyle} color: ${color};">${rain.toFixed(1).replace('.', ',')}<span style="${unitStyle}">mm</span></div>
                    </div>
                </div>
            `;
        } else if (type.includes('Canicule') || type.includes('Froid') || type.includes('Gel')) {
            return `
                <div style="${boxStyle}">
                    <div style="${leftStyle}">
                        <div style="${titleStyle}">EXTRÊMES THERMIQUES</div>
                        <div style="font-size: 11pt; font-weight: bold; color: #334155; margin-bottom: 3px;">Températures relevées</div>
                        <div style="font-size: 7.5pt; color: #64748b;">(Minimale et Maximale sur la période)</div>
                    </div>
                    <div style="${rightStyle}">
                        <div style="${valLabelStyle}">TEMP. MIN / MAX</div>
                        <div style="${valStyle} font-size: 20pt; color: #334155;">${stats.tempMin}°C / ${stats.tempMax}°C</div>
                    </div>
                </div>
            `;
        }

        return '';
    };


    const parseDateSafe = (dStr) => {
        if (!dStr) return null;
        if (dStr instanceof Date) return isNaN(dStr.getTime()) ? null : dStr;
        if (typeof dStr === 'string') {
            if (dStr.includes('/')) {
                const parts = dStr.split('/').map(Number);
                if (parts[0] && parts[1] && parts[2]) return new Date(parts[2], parts[1] - 1, parts[0]);
            }
            const dt = new Date(dStr);
            return isNaN(dt.getTime()) ? null : dt;
        }
        return null;
    };

    const generateSynthesisText = (stats, rows) => {
        const startD = new Date(startDate);
        let dateLabel = `le ${startD.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;

        if (isPeriod && endDate) {
            const endD = new Date(endDate);
            dateLabel = `du ${startD.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} au ${endD.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
        }

        const cityLabel = clientCity ? clientCity.toUpperCase() : 'LA ZONE CONCERNÉE';

        let intro = `L'analyse des conditions météorologiques relevées par la station de référence <strong>${dateLabel}</strong>, sur le secteur de <strong>${cityLabel}</strong>, met en évidence `;
        let body = "";

        if (certType.includes('Vent') || certType.includes('Tempête') || certType.includes('Orage')) {
            const gustVal = Math.round(stats.windGustMax);
            const peakDate = stats.windGustMaxDate || startDate;
            const pDt = parseDateSafe(peakDate);
            const peakDateStr = pDt ? pDt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : peakDate;
            const gustTimeStr = stats.windGustMaxTime ? `${peakDateStr} à ${stats.windGustMaxTime}` : peakDateStr;
            const typeLabel = certType.includes('Orage') ? "un épisode orageux actif" : "un épisode venteux marqué";

            body = `${typeLabel}. Les relevés indiquent des rafales maximales atteignant <strong style="color: #c0392b; font-size: 11pt;">${gustVal} km/h</strong>. Ce pic d'intensité a été enregistré le <strong style="color: #c0392b;">${gustTimeStr}</strong>.`;

        } else if (certType.includes('Pluie') || certType.includes('Inondation')) {
            const rainVal = stats.rainTotal.toFixed(1).replace('.', ',');
            body = `des précipitations significatives. Le cumul pluviométrique total s'élève à <strong style="color: #2980b9; font-size: 11pt;">${rainVal} mm</strong> sur la période considérée.`;

        } else if (certType.includes('Neige') || certType.includes('Verglas')) {
            body = `des conditions hivernales. Les températures sont descendues jusqu'à <strong style="color: #2980b9;">${stats.tempMin}°C</strong>, favorisant les phénomènes glissants ou neigeux.`;

        } else if (certType.includes('Canicule')) {
            const peakDate = stats.tempMaxDate || startDate;
            const pDt = parseDateSafe(peakDate);
            const peakDateStr = pDt ? pDt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : peakDate;
            const hourSuffix = stats.tempMaxTime ? ` à ${stats.tempMaxTime}` : '';
            body = `une vague de chaleur. Une température maximale de <strong style="color: #c0392b; font-size: 11pt;">${stats.tempMax}°C</strong> a été relevée le ${peakDateStr}${hourSuffix}.`;

        } else if (certType.includes('Froid') || certType.includes('Gel')) {
            const peakDate = stats.tempMinDate || startDate;
            const pDt = parseDateSafe(peakDate);
            const peakDateStr = pDt ? pDt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : peakDate;
            const hourSuffix = stats.tempMinTime ? ` à ${stats.tempMinTime}` : '';
            body = `une période de grand froid. Une température minimale de <strong style="color: #2980b9; font-size: 11pt;">${stats.tempMin}°C</strong> a été relevée le ${peakDateStr}${hourSuffix}.`;

        } else {
            body = `des conditions météorologiques notables en lien avec la demande.`;
        }

        return intro + body;
    };


    const generateConclusion = (stats, type) => {
        let conclusion = `L'analyse des données atteste de la survenue de conditions météorologiques `;
        if ((type.includes('Vent') && stats.windGustMax >= 100) || (type.includes('Pluie') && stats.rainTotal >= 50)) {
            conclusion += `<strong>exceptionnelles</strong> ayant pu occasionner des dommages sur la zone de ${clientCity || '... cascades'}.`;
        } else {
            conclusion += `significatives pouvant expliquer des désordres ponctuels.`;
        }
        return conclusion;
    };

    const getMeasureRows = (stats, rows, type) => {
        let htmlRows = '';
        const tLower = (type || '').toLowerCase();

        const addRow = (param, val, time) => {
            htmlRows += `<tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px 12px; font-size: 10pt;">${param}</td>
                <td style="padding: 8px 12px; font-size: 10pt;"><span class="cert-value-essential">${val}</span></td>
                <td style="padding: 8px 12px; font-size: 10pt; font-weight: bold; color: #1e293b;">${time}</td>
            </tr>`;
        };

        const formatTime = (d, rowDate = null) => {
            if (!d) return '-';
            const dateRef = rowDate || startDate;
            const dtObj = parseDateSafe(dateRef);
            const datePrefix = (dtObj && !isNaN(dtObj.getTime())) ? dtObj.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' à ' : '';

            if (typeof d === 'string') {
                if (d.includes('h')) return datePrefix + d;
                const dt = new Date(d);
                if (!isNaN(dt.getTime())) return `${dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} à ${String(dt.getHours()).padStart(2, '0')}h${String(dt.getMinutes()).padStart(2, '0')}`;
                return datePrefix + d;
            }
            if (d instanceof Date) {
                if (!isNaN(d.getTime())) return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} à ${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
                return '-';
            }
            return String(d);
        };
        const formatTimeShort = (d) => {
            if (!d) return '-';
            if (typeof d === 'string') {
                if (d.includes('h')) return d;
                const dt = new Date(d);
                if (!isNaN(dt.getTime())) return `${String(dt.getHours()).padStart(2, '0')}h${String(dt.getMinutes()).padStart(2, '0')}`;
                return d;
            }
            if (d instanceof Date) {
                if (!isNaN(d.getTime())) return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
                return '-';
            }
            return String(d);
        };

        // Use appropriate time format depending if it's a multi-day period or single day
        const timeDisplay = (d, rowDate = null) => isPeriod ? formatTime(d, rowDate) : formatTimeShort(d);

        if (showWindParams) {
            const t = stats.windGustMaxTime;
            const g = Math.round(stats.windGustMax);
            const gFxi = stats.windFxiMax ? Math.round(stats.windFxiMax) : g;
            const tFxi = stats.windFxiMaxTime || t;
            addRow("Rafale Max (FXI 3s OMM)", `${g} km/h`, t ? timeDisplay(t, stats.windGustMaxDate) : '-');
            addRow("Rafale Max (FXI Brut)", `${gFxi} km/h`, tFxi ? timeDisplay(tFxi, stats.windFxiMaxDate) : '-');
        }
        if (showRainParams) {
            const r = stats.rainTotal;
            const rMaxTime = stats.rainMaxTime;
            const rMaxVal = stats.rainMaxH ? stats.rainMaxH.toFixed(1).replace('.', ',') : null;
            const rainTimeLabel = (rMaxTime && stats.rainMaxH > 0) ? `Pic: ${rMaxVal} mm/h à ${timeDisplay(rMaxTime, stats.rainMaxDate)}` : "Période";

            if (tLower.includes('neige')) {
                const snow = stats.snowTotal || 0;
                addRow("Cumul Neige (estimé)", `${snow.toFixed(1).replace('.', ',')} cm`, rainTimeLabel);
            } else {
                addRow("Cumul Pluie", `${r.toFixed(1).replace('.', ',')} mm`, rainTimeLabel);
            }
        }
        if (showTempParams) {
            const tMax = stats.tempMaxTime;
            const tMin = stats.tempMinTime;

            if (tLower.includes('froid') || tLower.includes('gel') || tLower.includes('neige') || tLower.includes('verglas')) {
                addRow("Temp. Min", `${stats.tempMin}°C`, tMin ? timeDisplay(tMin, stats.tempMinDate) : '-');
                addRow("Temp. Max", `${stats.tempMax}°C`, tMax ? timeDisplay(tMax, stats.tempMaxDate) : '-');
            } else {
                addRow("Temp. Max", `${stats.tempMax}°C`, tMax ? timeDisplay(tMax, stats.tempMaxDate) : '-');
                addRow("Temp. Min", `${stats.tempMin}°C`, tMin ? timeDisplay(tMin, stats.tempMinDate) : '-');
            }
        }
        return htmlRows;
    };

    const getHighlights = (stats, type) => {
        // Style "Simple Bordered Box" (pour aller sous le classement)
        const card = (title, val, unit) => `
            <div class="highlight-card" style="width: 100%; text-align: center; border: 2px solid #000; padding: 10px; box-sizing: border-box;">
                <div class="hc-title" style="font-size: 9pt; font-weight: bold; color: #64748b; margin-bottom: 2px; text-transform: uppercase;">${title}</div>
                <div class="hc-val" style="font-size: 24pt; font-weight: 900; color: #000;">${val}<span class="hc-unit" style="font-size: 14pt; margin-left: 5px; color: #64748b;">${unit}</span></div>
            </div>`;

        if (type.includes('Vent') || type.includes('Tempête')) {
            return card("RAFALE MAX", Math.round(stats.windGustMax), "km/h");
        } else if (type.includes('Pluie') || type.includes('Inondation')) {
            return card("CUMUL PLUIE", stats.rainTotal.toFixed(1).replace('.', ','), "mm");
        } else if (type.includes('Canicule') || type.includes('Froid') || type.includes('Gel')) {
            return card("TEMP. MIN / MAX", `${stats.tempMin}/${stats.tempMax}`, "°C");
        } else if (type.includes('Orage') || type.includes('Foudre')) {
            return card("RAFALE MAX", Math.round(stats.windGustMax), "km/h");
        }

        // Fallback
        return card("RAFALE MAX", Math.round(stats.windGustMax), "km/h");
    };

    const getNearbyStationsTable = () => {
        if (!nearbyStations || nearbyStations.length === 0) return '';

        // Determine what to show based on cert type
        let valueLabel = "VALEUR";
        let getValue = (s) => "-";

        if (certType.includes('Vent') || certType.includes('Tempête') || certType.includes('Orage') || certType.includes('Foudre') || certType.includes('Rafale')) {
            valueLabel = "RAFALE MAX";
            getValue = (s) => {
                if (!s.maxGust || s.maxGust === '-') return '-';
                let timeStr = '';
                const hVal = s.maxGustHour || s.maxGustDate;
                if (typeof hVal === 'string' && hVal.includes('h')) {
                    timeStr = hVal;
                } else if (hVal) {
                    const tDate = new Date(hVal);
                    if (!isNaN(tDate.getTime())) {
                        timeStr = `${String(tDate.getHours()).padStart(2, '0')}h${String(tDate.getMinutes()).padStart(2, '0')}`;
                    }
                }
                return `<strong>${s.maxGust} km/h</strong>${timeStr ? ` <span style="font-size:8.5pt; color:#1e293b; font-weight:bold;">(${timeStr})</span>` : ''}`;
            };
        } else if (certType.includes('Pluie') || certType.includes('Inondation') || certType.includes('Précip') || certType.includes('Precip')) {
            valueLabel = "CUMUL PLUIE";
            getValue = (s) => !s.rain || s.rain === '-' ? '-' : `<strong>${s.rain} mm</strong>`;
        } else {
            valueLabel = "T° MIN / MAX";
            getValue = (s) => !s.minTemp || s.minTemp === '-' ? '-' : `<strong>${s.minTemp} / ${s.maxTemp} °C</strong>`;
        }

        return `
            <div class="cert-section-header" style="margin-top: 10px; margin-bottom: 2px;">COMPARAISON STATIONS ENVIRONNANTES</div>
            <div style="font-size: 8pt; color: #475569; margin-bottom: 4px; font-style:italic;">
                Relevés des 3 stations officielles les plus proches mesurant ce paramètre.
            </div>
            <table class="cert-table" style="margin-top: 0; font-size: 9.5pt;">
                <thead>
                    <tr>
                        <th style="padding: 8px 12px; text-align:left;">STATION</th>
                        <th style="padding: 8px 12px;">DIST.</th>
                        <th style="padding: 8px 12px;">${valueLabel}</th>
                    </tr>
                </thead>
                <tbody>
                    ${nearbyStations.slice(0, 3).map(s => `
                        <tr>
                            <td style="padding: 8px 12px; text-align:left; font-weight:bold; color:#0f172a;">${s.name}</td>
                            <td style="padding: 8px 12px; font-size: 9pt; color:#64748b;">${s.dist ? Math.round(s.dist) + ' km' : (s.dist_km ? Math.round(s.dist_km) + ' km' : '-')}</td>
                            <td style="padding: 8px 12px; font-weight:900; color:#334155;">${getValue(s)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    };

    const getDetailedRecordsHtml = (rows) => {
        if (!rows || rows.length === 0) return '';

        // Group rows by day for pagination
        const days = {};
        rows.forEach(r => {
            const dateStr = r.time.toLocaleDateString('fr-FR'); // Group by "DD/MM/YYYY"
            if (!days[dateStr]) days[dateStr] = [];
            days[dateStr].push(r);
        });

        const dayKeys = Object.keys(days);
        const totalPages = 1 + dayKeys.length + (showCharts ? 1 : 0); // Page 1 is Cert, then Days, then Chart

        // Generate a page for each day
        return dayKeys.map((dateKey, index) => {
            const dayRows = days[dateKey];
            // Sort by hour to be sure
            dayRows.sort((a, b) => a.time - b.time);

            // Date formatting for title (e.g. "Lundi 2 Février 2026")
            const dateObj = dayRows[0].time;
            const dateFull = dateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            const dateShort = dateObj.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }); // 02/02

            const pageNum = index + 2; // Start at Page 2

            // Agrégation heure par heure (exactement 24 lignes de 00h00 à 23h00)
            const hourly24 = [];
            for (let h = 0; h < 24; h++) {
                const sub = dayRows.filter(r => r.h === h);
                if (sub.length > 0) {
                    const tempValid = sub.filter(x => x.temp !== null && x.temp !== undefined && !isNaN(x.temp));
                    const tVal = tempValid.length > 0 ? tempValid[0].temp : null;
                    const rTot = sub.reduce((acc, x) => acc + (Number(x.rain) || 0), 0);
                    const validAvg = sub.filter(x => x.w_avg !== null && x.w_avg !== undefined && !isNaN(x.w_avg));
                    const wAvg = validAvg.length > 0 ? Math.round(validAvg.reduce((acc, x) => acc + Number(x.w_avg), 0) / validAvg.length) : 0;
                    const wGst = Math.max(0, ...sub.map(x => Number(x.w_gst) || 0));
                    const wFxi = Math.max(0, ...sub.map(x => Number(x.w_fxi || x.w_gst) || 0));
                    const humValid = sub.filter(x => x.humi !== null && x.humi !== undefined && !isNaN(x.humi));
                    const hVal = humValid.length > 0 ? humValid[0].humi : null;
                    const presValid = sub.filter(x => x.pres !== null && x.pres !== undefined && !isNaN(x.pres));
                    const pVal = presValid.length > 0 ? presValid[0].pres : null;
                    const visValid = sub.filter(x => x.vv !== null && x.vv !== undefined && !isNaN(x.vv));
                    const vVal = visValid.length > 0 ? visValid[0].vv : null;

                    hourly24.push({
                        h,
                        temp: tVal,
                        rain: rTot,
                        w_avg: wAvg,
                        w_gst: wGst,
                        w_fxi: wFxi,
                        humi: hVal,
                        pres: pVal,
                        vv: vVal
                    });
                } else {
                    hourly24.push({
                        h,
                        temp: null,
                        rain: 0,
                        w_avg: 0,
                        w_gst: 0,
                        w_fxi: 0,
                        humi: null,
                        pres: null,
                        vv: null
                    });
                }
            }

            return `
            <div class="cert-page" style="page-break-before: always; border-top: 1px dashed #cbd5e1; display: flex; flex-direction: column;">
                <div style="border: 2px solid #000; padding: 10px 15px; text-align: left; margin-top: 20px; margin-bottom: 20px;">
                    <h2 style="color: #003366; font-size: 13pt; margin: 0; font-weight: 900; text-transform: uppercase;">ANNEXE : DONNÉES HORAIRES DÉTAILLÉES</h2>
                    <div style="font-size: 10pt; font-weight: 700; color: #000; margin-top: 5px; text-transform: capitalize;">
                        ${dateFull} - Station : ${(() => {
                            if (stationMeteoTemp === stationMeteoRain && stationMeteoRain === stationMeteoWind) {
                                return stationMeteoTemp;
                            }
                            const parts = [];
                            if (annexCols.temp && stationMeteoTemp) parts.push(`Temp: ${stationMeteoTemp}`);
                            if (annexCols.rain && stationMeteoRain) parts.push(`Pluie: ${stationMeteoRain}`);
                            if ((annexCols.windA || annexCols.windG) && stationMeteoWind) parts.push(`Vent: ${stationMeteoWind}`);
                            return parts.join(' | ') || 'Multi-stations';
                        })()}
                    </div>
                    <div style="font-size: 9pt; color: #64748b; margin-top: 5px;">
                        Page ${pageNum} / ${totalPages}
                    </div>
                </div>

                <table class="cert-table" style="font-size: 9.5pt; margin-top: 0;">
                    <thead>
                        <tr style="background:#1e293b; color: white;">
                            <th style="width: 60px;">DATE</th>
                            <th>HEURE</th>
                            ${annexCols.temp ? '<th>TEMP. (°C)</th>' : ''}
                            ${annexCols.rain ? '<th>PLUIE (MM)</th>' : ''}
                            ${annexCols.windA ? '<th>VENT (KM/H)</th>' : ''}
                            ${annexCols.windG ? '<th>FXI 3S (KM/H)</th>' : ''}
                            ${annexCols.windFxi ? '<th>FXI BRUT (KM/H)</th>' : ''}
                            ${annexCols.humi ? '<th>HUMIDITÉ (%)</th>' : ''}
                            ${annexCols.pres ? '<th>PRESSION (HPA)</th>' : ''}
                            ${annexCols.vis ? '<th>VISIBILITÉ (KM)</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${hourly24.map(r => {
                            const rowTime = `${String(r.h).padStart(2, '0')}h00`;
                            return `
                            <tr>
                                <td style="color:#475569;">${dateShort}</td>
                                <td style="font-weight:bold; color:#003366; font-size:9pt;">${rowTime}</td>
                                ${annexCols.temp ? `<td style="font-weight:600;">${r.temp !== null ? r.temp.toFixed(1) : '-'}</td>` : ''}
                                ${annexCols.rain ? `<td ${r.rain > 0 ? 'style="color:#2563eb; font-weight:bold;"' : ''}>${r.rain > 0 ? r.rain.toFixed(1).replace('.', ',') : '0,0'}</td>` : ''}
                                ${annexCols.windA ? `<td>${r.w_avg !== null && r.w_avg !== undefined ? Math.round(r.w_avg) : '-'}</td>` : ''}
                                ${annexCols.windG ? `<td ${r.w_gst > 60 ? 'style="color:#dc2626; font-weight:bold;"' : ''}>${r.w_gst !== null && r.w_gst !== undefined ? Math.round(r.w_gst) : '-'}</td>` : ''}
                                ${annexCols.windFxi ? `<td ${(r.w_fxi || r.w_gst) > 60 ? 'style="color:#ea580c; font-weight:bold;"' : ''}>${r.w_fxi !== null && r.w_fxi !== undefined ? Math.round(r.w_fxi) : (r.w_gst !== null ? Math.round(r.w_gst) : '-')}</td>` : ''}
                                ${annexCols.humi ? `<td>${r.humi !== undefined && r.humi !== null ? Math.round(r.humi) : '-'}%</td>` : ''}
                                ${annexCols.pres ? `<td>${r.pres !== undefined && r.pres !== null ? Math.round(r.pres) : '-'}</td>` : ''}
                                ${annexCols.vis ? `<td>${r.vv !== undefined && r.vv !== null ? Math.round(r.vv) : '-'}</td>` : ''}
                            </tr>
                        `}).join('')}
                    </tbody>
                </table>
                <div style="margin-top: auto; font-size: 7.5pt; color: #94a3b8; text-align: center; padding-bottom: 20px;">
                    Données certifiées par Météo Climat Pro
                </div>
            </div>
            `;
        }).join('');
    };

    const renderCertChart = (data, attempt = 1) => {
        const canvas = document.getElementById('cert-chart-preview');
        if (!canvas) {
            if (attempt < 15) {
                setTimeout(() => renderCertChart(data, attempt + 1), 50);
            }
            return;
        }
        if (!window.Chart) return;

        const ctx = canvas.getContext('2d');
        if (chartRefs.current['preview']) chartRefs.current['preview'].destroy();

        const labels = data.map(d => {
            const dt = d.time instanceof Date ? d.time : (d.time ? new Date(d.time) : null);
            const h = (dt && !isNaN(dt.getTime()))
                ? `${String(dt.getHours()).padStart(2, '0')}h${String(dt.getMinutes()).padStart(2, '0')}`
                : `${String(d.h).padStart(2, '0')}h${String(d.minute || 0).padStart(2, '0')}`;
            return isPeriod && dt ? dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + h : h;
        });

        const datasets = [];
        if (certType.includes('Vent') || certType.includes('Tempête')) {
            datasets.push({
                label: 'Rafales (km/h)',
                data: data.map(d => d.w_gst),
                borderColor: '#dc2626',
                backgroundColor: 'rgba(220, 38, 38, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3
            });
        } else if (certType.includes('Pluie')) {
            datasets.push({
                type: 'bar',
                label: 'Pluie (mm)',
                data: data.map(d => d.rain),
                backgroundColor: '#2563eb',
                borderRadius: 4
            });
        } else {
            datasets.push({
                label: 'Température (°C)',
                data: data.map(d => d.temp),
                borderColor: '#ea580c',
                borderWidth: 2,
                fill: false,
                tension: 0.4
            });
        }

        chartRefs.current['preview'] = new window.Chart(ctx, {
            type: datasets[0].type || 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    };


    const formatCustomText = (text) => {
        if (!text) return '';
        
        const protectedItems = [];
        let tempText = text;
        
        // Protect dates, times, phone numbers, and standalone 4-digit years from number highlighting
        const protectRegexes = [
            /(?:\+33\s*[1-9](?:[\s.-]?\d{2}){4})|(?:\b0[1-9](?:[\s.-]?\d{2}){4}\b)/gi,
            /\b\d{1,2}\s+(?:janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)\s+\d{4}\b/gi,
            /\b\d{1,2}\s+(?:janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)\b/gi,
            /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
            /\b\d{1,2}h\d{2}\b/gi,
            /\b\d{1,2}:\d{2}\b/g,
            /\b\d{1,2}\s*h\b/gi,
            /\b\d{4}\b/g
        ];
        
        protectRegexes.forEach((regex) => {
            tempText = tempText.replace(regex, (match) => {
                const placeholder = `||PROT_HL_${protectedItems.length}||`;
                protectedItems.push({ placeholder, value: match });
                return placeholder;
            });
        });
        
        // Match numbers, decimals, negatives, and weather units
        const numRegex = /(?:-?\d+(?:[\.,]\d+)?\s*(?:mm|°C|°|hPa|km\/h|%|cm|m\/s|km)\b)|(?:-?\b\d+[\.,]\d+\b)|(?:\b-?\d{1,3}\b)|(?:\b-?\d{5,}\b)/gi;
        const highlightItems = [];
        
        tempText = tempText.replace(numRegex, (match) => {
            const placeholder = `||NUM_HL_${highlightItems.length}||`;
            highlightItems.push({ placeholder, value: match });
            return placeholder;
        });
        
        // Escape HTML
        let escaped = tempText
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
            
        // Restore highlighted items with CSS styled span
        highlightItems.forEach(({ placeholder, value }) => {
            const escapedValue = value
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
            escaped = escaped.replace(placeholder, `<span class="cert-value-essential" style="font-weight: 800; color: #003366;">${escapedValue}</span>`);
        });
        
        // Restore protected items unchanged
        protectedItems.forEach(({ placeholder, value }) => {
            const escapedValue = value
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
            escaped = escaped.replace(placeholder, escapedValue);
        });
        
        return escaped;
    };

    const generateReport = () => {
        if (!globalData.rows) return;
        const { stats, rows } = globalData;
        const todayFr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

        let html = `
            <div class="cert-page">
                ${getCommonStyles(false)}
                
                <div class="cert-header-combined">
                    <div class="header-left">
                        <div class="cert-logo"><img src="${companyLogo || '/logo_mcp.png'}" alt="MÉTÉO CLIMAT PRO" /></div>
                        <div class="cert-emitter-info">
                            <div>${emitterAddress || '---'}</div>
                            <div>${emitterZip || '---'} ${emitterCity || '---'}</div>
                            <div>Tel : <span>${emitterPhone || '---'}</span></div>
                            <div class="signature-title">Expertise Météo-Climatologique</div>
                        </div>
                    </div>
                    <div class="header-right">
                        <div class="cert-client-box">
                            <div class="cert-client-info">
                                <div class="cert-main-title">${clientName || '---'}</div>
                                <div>${clientAddress || '---'}</div>
                                <div>${clientZip || ''} ${clientCity || ''}</div>
                                <div class="ref-box">Réf. ${certRef || '---'}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="cert-main-title-box">
                    <h1>CERTIFICAT D'INTEMPÉRIE</h1>
                    <div>${certType}</div>
                </div>

                <div style="margin-top: 5px;">
                     ${getPhenomenonClassification(certType, stats)}
                </div>

                <div class="cert-section-header">DESCRIPTION DE LA SITUATION MÉTÉOROLOGIQUE</div>
                <div class="cert-text-block">${customSynthesis ? formatCustomText(customSynthesis) : generateSynthesisText(stats, rows)}</div>

                <div class="cert-section-header">MESURES OBSERVÉES - STATION DE RÉFÉRENCE</div>
                ${stationMeteoTemp === stationMeteoRain && stationMeteoRain === stationMeteoWind ? `
                    <div style="font-size: 8.5pt; margin-top: 2px; color: #475569; font-style: italic; margin-bottom: 6px;">
                        Station officielle : <strong>${stationMeteoTemp} (${selectedStationId || 'ID inconnu'})</strong>
                    </div>
                ` : `
                    <div style="font-size: 8.5pt; margin-top: 2px; color: #475569; font-style: italic; margin-bottom: 8px;">
                        <strong style="color: #003366;">Postes de référence :</strong>
                        <span style="margin-left: 8px; display: inline-block;">Température : <strong>${stationMeteoTemp || 'Non précisé'}</strong></span>
                        <span style="margin-left: 8px; margin-right: 8px; color: #cbd5e1;">|</span>
                        <span style="display: inline-block;">Précipitations : <strong>${stationMeteoRain || 'Non précisé'}</strong></span>
                        <span style="margin-left: 8px; margin-right: 8px; color: #cbd5e1;">|</span>
                        <span style="display: inline-block;">Vent & Rafales : <strong>${stationMeteoWind || 'Non précisé'}</strong></span>
                    </div>
                `}
                <table class="cert-table">
                    <thead><tr><th>PARAMÈTRE</th><th>VALEUR RELEVÉE</th><th>HEURE / PÉRIODE</th></tr></thead>
                    <tbody>${getMeasureRows(stats, rows, certType)}</tbody>
                </table>

                ${getNearbyStationsTable()}

                <div class="cert-section-header">CONCLUSION DE L'ANALYSE</div>
                <div class="cert-conclusion-box">${customConclusion ? formatCustomText(customConclusion) : generateConclusion(stats, certType)}</div>

                ${customClassification ? `
                <div style="margin-top: 14px; page-break-inside: avoid;">
                    <div style="font-size: 10pt; font-weight: 900; text-transform: uppercase; letter-spacing: 3px; color: #003366; margin-bottom: 6px; text-align: center;">── CLASSEMENT ──</div>
                    <div style="
                        background: #003366;
                        border: 2px solid #003366;
                        border-radius: 6px;
                        padding: 12px 20px;
                        text-align: center;
                        font-family: sans-serif;
                        font-size: 13pt;
                        font-weight: 900;
                        color: #ffffff;
                        letter-spacing: 1px;
                        line-height: 1.4;
                        text-transform: uppercase;
                        white-space: pre-wrap;
                    ">${customClassification}</div>
                </div>
                ` : ''}

                <div class="cert-signature-block">
                    <div class="signature-date">Fait à Raimbeaucourt, le ${todayFr}</div>
                    <div class="signature-title">Signature de l'expert</div>
                    <div class="signature-name">Patrick Marlière</div>
                </div>
            </div>
            
            ${showDetailedRecords ? getDetailedRecordsHtml(rows) : ''}
        `;

        if (showCharts) {
            const dayCount = showDetailedRecords ? Object.keys(rows.reduce((acc, r) => {
                const d = r.time.toLocaleDateString('fr-FR');
                if (!acc[d]) acc[d] = 1;
                return acc;
            }, {})).length : 0;
            const chartPageNum = 1 + dayCount + 1;

            const totalPages = chartPageNum; // Last page

            const dateRangeLabel = isPeriod && endDate
                ? `du ${startDate.split('-').reverse().join('/')} au ${endDate.split('-').reverse().join('/')}`
                : new Date(startDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

            html += `
                <div class="cert-page" style="page-break-before: always; display: flex; flex-direction: column;">
                     <div style="border: 2px solid #000; padding: 10px 15px; text-align: left; margin-top: 20px; margin-bottom: 20px;">
                        <h2 style="color: #003366; font-size: 13pt; margin: 0; font-weight: 900; text-transform: uppercase;">ANNEXE : REPRÉSENTATION GRAPHIQUE</h2>
                        <div style="font-size: 10pt; font-weight: 700; color: #000; margin-top: 5px; text-transform: capitalize;">
                            ${dateRangeLabel} - Station : ${stationMeteo}
                        </div>
                        <div style="font-size: 9pt; color: #64748b; margin-top: 5px;">
                            Page ${chartPageNum} / ${totalPages}
                        </div>
                    </div>
                    
                    <div style="height: 500px; width: 100%; margin-top: 30px; border: 1px solid #e2e8f0; padding: 20px; box-sizing: border-box; background: white;">
                        <canvas id="cert-chart-preview"></canvas>
                    </div>

                    <div style="margin-top: auto; font-size: 9pt; color: #64748b; font-style: italic; text-align: left; padding-bottom: 20px;">
                        Visualisation chronologique des principaux paramètres météorologiques de la période.
                    </div>
                </div>
            `;
        }

        setReportOutput(html);

        if (showCharts) {
            setTimeout(() => renderCertChart(rows), 100);
        }
    };

    useEffect(() => {
        if (globalData.rows) generateReport();
    }, [globalData, customSynthesis, customConclusion, showCharts, showWindAvg, showValuesUnderTitle, showWindParams, showRainParams, showTempParams, showDetailedHumi, showDetailedPres, showDetailedVis, stationMeteo, showDetailedRecords, stationMeteoTemp, stationMeteoRain, stationMeteoWind, annexCols]);

    const getCommonStyles = (isPrint = false) => `
        <style>
            ${isPrint ? `
                @page { size: A4; margin: 0; }
                body { margin: 0; font-family: 'Arial', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: #ffffff; }
                .no-print { display: none!important; }
            ` : ''}
            
            .cert-page {
                font-family: 'Arial', sans-serif;
                color: #334155;
                width: 210mm;
                min-height: 297mm;
                padding: 12mm 12mm 8mm 12mm;
                box-sizing: border-box;
                background: white;
                font-size: 9pt;
                display: flex;
                flex-direction: column;
                margin: ${isPrint ? '0' : '0 auto 20px auto'};
                box-shadow: ${isPrint ? 'none' : '0 10px 25px rgba(0, 0, 0, 0.15)'};
                position: relative;
                border-radius: 2px;
                page-break-inside: avoid;
                page-break-after: always;
            }
            .cert-page:last-child { page-break-after: avoid; }
            
            .cert-header-combined { 
                display: flex; 
                justify-content: space-between; 
                align-items: flex-start; 
                margin-bottom: 8px; 
                width: 100%; 
                border-bottom: 1px solid #f1f5f9; 
                padding-bottom: 8px; 
            }
            .cert-logo img { max-height: 50px; object-fit: contain; }
            .cert-emitter-info { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
            .cert-emitter-info div { font-size: 8.5pt; color: #475569; line-height: 1.4; }
            .cert-emitter-info span { color:#0f172a; font-weight: 600; }
            .cert-emitter-info .signature-title { font-weight: 700; color: #003366; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; }
            
            .cert-client-box { text-align: left; min-width: 250px; border-left: 2px solid #003366; padding-left: 12px; }
            .cert-client-info { font-family: sans-serif; }
            .cert-client-info div { font-size: 9pt; color: #1e293b; line-height: 1.4; }
            .cert-client-info .cert-main-title { font-size: 11pt; color: #0f172a; text-transform: uppercase; margin-bottom: 2px; font-weight: 900; }
            .cert-client-info .ref-box { margin-top: 6px; padding: 3px 8px; background: #003366; color: #ffffff !important; border-radius: 4px; display: inline-block; font-size: 8pt; font-weight: 700; }
            
            .cert-main-title-box { 
                margin-bottom: 8px; 
                border: 2px solid #003366; 
                padding: 10px 16px; 
                box-shadow: none; 
                width: 100%; 
                box-sizing: border-box; 
                text-align: center; 
                background: #003366;
                border-radius: 6px;
            }
            .cert-main-title-box h1 { letter-spacing: 2px; margin-bottom: 0px; font-size: 17pt; color: #ffffff; font-weight: 900; }
            .cert-main-title-box div { font-size: 11pt; color: #ffffff; font-weight: 800; border-top: 1px solid rgba(255,255,255,0.3); padding-top: 4px; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; }
            
            .cert-section-header { 
                background: #f1f5f9 !important; 
                color: #000 !important; 
                padding: 6px 10px; 
                font-weight: 900; 
                font-size: 9.5pt;
                text-transform: uppercase; 
                margin-top: 12px; 
                margin-bottom: 6px; 
                border-left: 5px solid #003366; 
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .cert-text-block { margin-bottom: 8px; font-size: 9pt; line-height: 1.4; text-align: left; white-space: pre-wrap; color: #1e293b; }
            
            .cert-conclusion-box {
                margin-bottom: 12px;
                font-size: 9.5pt;
                font-weight: 500;
                line-height: 1.4;
                text-align: left;
                white-space: pre-wrap;
                color: #1e293b;
                border: 1px solid #cbd5e1;
                padding: 10px 14px;
                background: #f8fafc;
                border-left: 5px solid #003366;
                border-radius: 0 4px 4px 0;
            }
            
            .cert-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 8px; }
            .cert-table th, .cert-table td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; }
            .cert-table th { background-color: #1e293b !important; font-weight: bold; color: #ffffff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .cert-table td { color: #334155; }
            .cert-table tbody tr:nth-child(even) { background-color: #f8fafc; }
            
            .cert-value-essential { font-weight: 800; color: #003366; }
            
            .highlight-card { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; text-align: left; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
            .highlight-card .hc-title { font-size: 7.5pt; margin-bottom: 2px; color: #64748b; text-transform: uppercase; font-weight: bold; }
            .highlight-card .hc-val { font-size: 14pt; font-weight: 900; color: #003366; }
            .highlight-card .hc-unit { font-size: 9pt; color: #64748b; margin-left: 2px; }
            
            .cert-signature-block { margin-top: 15px; width: 220px; text-align: left; margin-left: 0; margin-right: auto; padding-left: 10px; }
            .signature-date { font-size: 8.5pt; font-style: italic; margin-bottom: 4px; color: #64748b; }
            .signature-title { font-size: 9.5pt; font-weight: bold; text-decoration: underline; margin-bottom: 15px; color: #003366; }
            .signature-name { font-size: 10.5pt; font-weight: 900; color: #003366; }
            
            .certificat-full-preview {
                width: auto;
                min-height: auto;
                box-shadow: none;
                padding: 0;
                margin: 0;
            }
        </style>
    `;

    const handlePrint = () => {
        let contentToPrint = reportOutput;

        // Convert Chart Canvas to Image for Print if it exists
        const chartCanvas = document.getElementById('cert-chart-preview');
        if (chartCanvas) {
            try {
                const chartImgUrl = chartCanvas.toDataURL('image/png');
                contentToPrint = contentToPrint.replace(
                    '<canvas id="cert-chart-preview"></canvas>',
                    `<img src="${chartImgUrl}" style="width:100%; height:auto;" />`
                );
            } catch (e) {
                console.error("Error converting chart to image", e);
            }
        }

        const win = window.open('', '', 'width=1200,height=900');
        win.document.write(`
            <html>
                <head>
                    <title>Certificat Météo - ${clientName || 'Export'}</title>
                    ${getCommonStyles(true)}
                </head>
                <body>
                    ${contentToPrint}
                    <script>
                        setTimeout(() => {
                            window.print();
                            // window.close();
                        }, 1000);
                    </script>
                </body>
            </html>
        `);
        win.document.close();
    };

    // Fonction export Word (HTML -> .doc hack)
    const exportWord = () => {
        if (!globalData.rows) return;

        // CSS inliné pour Word
        const css = `< style >
    body { font - family: 'Arial', sans - serif; color: #000; }
            h1 { color: #059669; font - size: 24pt; text - transform: uppercase; text - align: center; }
            h3 { color: #0f172a; font - size: 14pt; border - bottom: 2px solid #000; margin - top: 20px; }
            table { width: 100 %; border - collapse: collapse; margin - top: 15px; }
            th { background - color: #eee; border: 1px solid #999; padding: 5px; }
            td { border: 1px solid #999; padding: 5px; text - align: center; }
            .highlight { background - color: #dcfce7; }
            .value - alert { color: red; font - weight: bold; }
        </style > `;

        // Nettoyage basique des classes pour l'export
        let content = reportOutput;
        // On enlève les div qui ne servent à rien dans Word ou qui cassent la mise en page
        content = content.replace(/<div class="cert-page">/g, '<div class="doc-section">');

        const html = `< html ><head><meta charset='utf-8'>${css}</head><body>${content}</body></html > `;

        const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Certificat_Meteo_${clientName || 'Client'}_${startDate}.doc`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Copie texte pour email
    const copyText = () => {
        if (!globalData.stats) return;
        const { stats, isPeriod: globalIsPeriod, endDate: globalEndDate } = globalData;

        let dateLabel = startDate;
        if (globalIsPeriod && globalEndDate) dateLabel = `du ${startDate} au ${globalEndDate} `;

        const txt = `
CERTIFICAT MÉTÉO - SYNTHÈSE RAPIDE
Période: ${dateLabel}
Lieu: ${clientCity} (${clientZip})
Phénomène: ${certType}

OBSERVATIONS STATION ${stationMeteoTemp === stationMeteoRain && stationMeteoRain === stationMeteoWind ? stationMeteoTemp : `Temp: ${stationMeteoTemp || '?'}, Pluie: ${stationMeteoRain || '?'}, Vent: ${stationMeteoWind || '?'}`} :
- Température Min / Max : ${stats.tempMin}°C / ${stats.tempMax}°C
    - Pluie cumulée: ${stats.rainTotal.toFixed(1)} mm
        - Rafale Max: ${Math.round(stats.windGustMax)} km/h ${stats.windGustTime ? `(le ${stats.windGustTime.toLocaleDateString('fr-FR')} à ${String(stats.windGustTime.getHours()).padStart(2, '0')}h${String(stats.windGustTime.getMinutes()).padStart(2, '0')})` : ''}
- Intensité Pluie Max: ${stats.rainMaxH?.toFixed(1) || '-'} mm / h

Ce relevé est certifié conforme aux données de la station météorologique de référence.
        `.trim();

        navigator.clipboard.writeText(txt).then(() => alert("Texte copié dans le presse-papier !"));
    };

    // --- Rendu UI Principal ---
    return (
        <div className="btp-manager-body">
            <div style={{ position: 'fixed', bottom: 10, left: 10, fontSize: '10px', color: '#94a3b8', zIndex: 1000, pointerEvents: 'none' }}>Certificat v2.1.0</div>

            <div className="btp-layout">
                {/* SIDEBAR UNIFIÉE (Comme Attestation Intempérie) */}
                <div className="btp-panel no-print btp-sidebar-scroll">
                    <div className="flex justify-between items-center mb-15">
                        <button className="text-xs font-bold text-blue-600 bg-blue-50 px-10 py-5 rounded border border-blue-200 hover:bg-blue-100 transition-all flex items-center gap-2" onClick={fetchArchives}>
                            <Briefcase size={14} /> Consulter les Archives
                        </button>
                    </div>

                    {/* 1. CONFIGURATION */}
                    <div className="btp-panel-head cursor-pointer hover:bg-slate-100/50 transition-all p-5 rounded" onClick={() => setPanelOpen(prev => ({ ...prev, config: !prev.config }))}>
                        <div className="flex items-center">
                            <div className="btp-step-num">1</div>
                            <div className="btp-panel-title">Configuration</div>
                        </div>
                        <span className="text-xs text-slate-400 font-bold">{panelOpen.config ? '▼' : '►'}</span>
                    </div>

                    {panelOpen.config && (
                        <div className="btp-form-grid">
                        <div className="btp-form-group">
                            <label>Nom du Client / Tiers</label>
                            <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Ex: Jean Dupont" />
                        </div>

                        <div className="btp-form-group mt-10">
                            <label>Adresse du Sinistre</label>
                            <input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="12 rue des Fleurs" className="mb-5" />
                            <div className="flex gap-2">
                                <input value={clientZip} onChange={(e) => setClientZip(e.target.value)} placeholder="CP" style={{ width: '80px' }} />
                                <input value={clientCity} onChange={(e) => setClientCity(e.target.value)} placeholder="Ville" style={{ flex: 1 }} />
                            </div>
                        </div>

                        <div className="btp-separator"><span>Détails de l'événement</span></div>

                        <div className="btp-form-group">
                            <label>Type de Phénomène</label>
                            <select value={certType} onChange={(e) => setCertType(e.target.value)}>
                                {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>

                        <div className="btp-form-group mt-10">
                            <div className="flex justify-between items-center mb-5">
                                <label>Date / Période</label>
                                <div
                                    className="flex items-center gap-2 cursor-pointer bg-slate-100 rounded-full p-1 border border-slate-200"
                                    onClick={() => setIsPeriod(!isPeriod)}
                                    title="Basculer entre Date unique et Période"
                                >
                                    <span className={`text-xs px-3 py-1 rounded-full transition-all ${!isPeriod ? 'bg-white shadow font-bold text-blue-600' : 'text-slate-500'} `}>Date</span>
                                    <span className={`text-xs px-3 py-1 rounded-full transition-all ${isPeriod ? 'bg-white shadow font-bold text-blue-600' : 'text-slate-500'} `}>Période</span>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="text-xs text-slate-400 mb-1 block">Début / Date</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="w-full"
                                    />
                                </div>
                                {isPeriod && (
                                    <div className="flex-1">
                                        <label className="text-xs text-slate-400 mb-1 block">Fin (Inclus)</label>
                                        <input
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="w-full"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="btp-form-group mt-5">
                            <label>Référence Dossier</label>
                            <input value={certRef} onChange={(e) => setCertRef(e.target.value)} placeholder="Ex: SIN-2023-001" />
                        </div>

                        <div className="btp-separator"><span>Source des données</span></div>

                        <div className="flex gap-2">
                            <div className="btp-form-group" style={{ width: '80px' }}>
                                <label>Dép.</label>
                                <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)}>
                                    <option value="">--</option>
                                    {DEPARTMENTS.map(d => <option key={d.code} value={d.code}>{d.code}</option>)}
                                </select>
                            </div>
                            <div className="btp-form-group flex-1">
                                <label>Station Officielle</label>
                                <select value={selectedStationId} onChange={(e) => setSelectedStationId(e.target.value)} disabled={loadingStations}>
                                    <option value="">{loadingStations ? 'Chargement...' : 'Choisir...'}</option>
                                    {stations.map(s => <option key={s.station_id} value={s.station_id}>{s.nom_station || s.station_id}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 mt-10 mb-5">
                            <input 
                                type="checkbox" 
                                id="chk-show-detailed-stations"
                                checked={showDetailedStations} 
                                onChange={(e) => {
                                    const checked = e.target.checked;
                                    setShowDetailedStations(checked);
                                    if (!checked) {
                                        setStationMeteoTemp(stationMeteo);
                                        setStationMeteoRain(stationMeteo);
                                        setStationMeteoWind(stationMeteo);
                                    }
                                }} 
                            />
                            <label htmlFor="chk-show-detailed-stations" className="text-xs cursor-pointer font-semibold text-slate-700">
                                Différencier les stations par paramètre
                            </label>
                        </div>

                        {!showDetailedStations ? (
                            <div className="btp-form-group">
                                <label>Poste de référence (éditable)</label>
                                <input 
                                    value={stationMeteo} 
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setStationMeteo(val);
                                        setStationMeteoTemp(val);
                                        setStationMeteoRain(val);
                                        setStationMeteoWind(val);
                                    }} 
                                    placeholder="Nom de la station..." 
                                />
                            </div>
                        ) : (
                            <div className="bg-slate-50 p-10 rounded border border-slate-200 flex flex-col gap-2 mt-5">
                                <div className="btp-form-group">
                                    <label className="text-xs font-bold text-slate-600">Température</label>
                                    <input 
                                        className="text-xs p-5 border rounded w-full"
                                        value={stationMeteoTemp} 
                                        onChange={(e) => setStationMeteoTemp(e.target.value)} 
                                        placeholder="Poste Température..." 
                                    />
                                </div>
                                <div className="btp-form-group">
                                    <label className="text-xs font-bold text-slate-600">Précipitations</label>
                                    <input 
                                        className="text-xs p-5 border rounded w-full"
                                        value={stationMeteoRain} 
                                        onChange={(e) => setStationMeteoRain(e.target.value)} 
                                        placeholder="Poste Précipitations..." 
                                    />
                                </div>
                                <div className="btp-form-group">
                                    <label className="text-xs font-bold text-slate-600">Vent & Rafales</label>
                                    <input 
                                        className="text-xs p-5 border rounded w-full"
                                        value={stationMeteoWind} 
                                        onChange={(e) => setStationMeteoWind(e.target.value)} 
                                        placeholder="Poste Vent..." 
                                    />
                                </div>
                            </div>
                        )}

                        <button className="btp-btn btp-btn-primary mt-15" onClick={handleFetchData}>
                            <Download size={18} /> Générer le Certificat
                        </button>

                        <div className="mt-10">
                            <input
                                type="file"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                accept=".csv"
                                onChange={handleFileUpload}
                            />
                            <button
                                className="btp-btn btp-btn-secondary w-full"
                                style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <FileText size={18} /> Importer un fichier CSV (Données BTP)
                            </button>
                        </div>

                        {status && <div className="mt-10 p-10 border rounded text-xs bg-slate-50 border-blue-100 text-blue-800" dangerouslySetInnerHTML={{ __html: status }} />}
                        </div>
                    )}

                    {/* 2. PERSONNALISATION */}
                    {globalData.rows && (
                        <>
                            <div className="btp-panel-head mt-20 cursor-pointer hover:bg-slate-100/50 transition-all p-5 rounded" onClick={() => setPanelOpen(prev => ({ ...prev, custom: !prev.custom }))}>
                                <div className="flex items-center">
                                    <div className="btp-step-num">2</div>
                                    <div className="btp-panel-title">Personnalisation</div>
                                </div>
                                <span className="text-xs text-slate-400 font-bold">{panelOpen.custom ? '▼' : '►'}</span>
                            </div>

                            {panelOpen.custom && (
                                <div className="btp-form-grid">
                                <div className="btp-form-group">
                                    <label className="text-xs font-bold text-slate-500 mb-5 uppercase">Synthèse de l'Expert</label>
                                    <textarea
                                        value={customSynthesis}
                                        onChange={(e) => setCustomSynthesis(e.target.value)}
                                        placeholder="Synthèse auto..."
                                        style={{ height: '100px', fontSize: '11px' }}
                                    />
                                </div>
                                <div className="btp-form-group mt-10">
                                    <label className="text-xs font-bold text-slate-500 mb-5 uppercase">Conclusion</label>
                                    <textarea
                                        value={customConclusion}
                                        onChange={(e) => setCustomConclusion(e.target.value)}
                                        placeholder="Conclusion auto..."
                                        style={{ height: '80px', fontSize: '11px' }}
                                    />
                                </div>
                                <div className="flex flex-col gap-2 mt-10">
                                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                                        <input type="checkbox" checked={showCharts} onChange={e => setShowCharts(e.target.checked)} />
                                        Inclure Graphique
                                    </label>
                                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                                        <input type="checkbox" checked={showValuesUnderTitle} onChange={e => setShowValuesUnderTitle(e.target.checked)} />
                                        Inclure Tableaux Synthèse
                                    </label>
                                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                                        <input type="checkbox" checked={showDetailedRecords} onChange={e => setShowDetailedRecords(e.target.checked)} />
                                        Inclure l'Annexe (Relevés détaillés)
                                    </label>

                                    {showDetailedRecords && (
                                        <div className="ml-15 pl-10 border-l-2 border-slate-200 mt-5 bg-slate-50/50 p-5 rounded">
                                            <div className="text-xxs font-bold text-slate-400 uppercase tracking-wider mb-2">Paramètres de l'annexe</div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                <label className="flex items-center gap-2 text-xs cursor-pointer">
                                                    <input type="checkbox" checked={annexCols.temp} onChange={e => setAnnexCols(prev => ({ ...prev, temp: e.target.checked }))} />
                                                    Température (°C)
                                                </label>
                                                <label className="flex items-center gap-2 text-xs cursor-pointer">
                                                    <input type="checkbox" checked={annexCols.rain} onChange={e => setAnnexCols(prev => ({ ...prev, rain: e.target.checked }))} />
                                                    Précipitations (mm)
                                                </label>
                                                <label className="flex items-center gap-2 text-xs cursor-pointer">
                                                    <input type="checkbox" checked={annexCols.windA} onChange={e => setAnnexCols(prev => ({ ...prev, windA: e.target.checked }))} />
                                                    Vent Moyen (km/h)
                                                </label>
                                                <label className="flex items-center gap-2 text-xs cursor-pointer">
                                                    <input type="checkbox" checked={annexCols.windG} onChange={e => setAnnexCols(prev => ({ ...prev, windG: e.target.checked }))} />
                                                    FXI 3s OMM (km/h)
                                                </label>
                                                <label className="flex items-center gap-2 text-xs cursor-pointer">
                                                    <input type="checkbox" checked={annexCols.windFxi} onChange={e => setAnnexCols(prev => ({ ...prev, windFxi: e.target.checked }))} />
                                                    FXI Brut (km/h)
                                                </label>
                                                <label className="flex items-center gap-2 text-xs cursor-pointer">
                                                    <input type="checkbox" checked={annexCols.humi} onChange={e => setAnnexCols(prev => ({ ...prev, humi: e.target.checked }))} />
                                                    Humidité (%)
                                                </label>
                                                <label className="flex items-center gap-2 text-xs cursor-pointer">
                                                    <input type="checkbox" checked={annexCols.pres} onChange={e => setAnnexCols(prev => ({ ...prev, pres: e.target.checked }))} />
                                                    Pression (hPa)
                                                </label>
                                                <label className="flex items-center gap-2 text-xs cursor-pointer">
                                                    <input type="checkbox" checked={annexCols.vis} onChange={e => setAnnexCols(prev => ({ ...prev, vis: e.target.checked }))} />
                                                    Visibilité (km)
                                                </label>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                            {/* CLASSEMENT MANUEL */}
                            <div className="btp-panel-head mt-20 cursor-pointer hover:bg-slate-100/50 transition-all p-5 rounded" onClick={() => setPanelOpen(prev => ({ ...prev, classification: !prev.classification }))}>
                                <div className="flex items-center">
                                    <div className="btp-step-num">3</div>
                                    <div className="btp-panel-title">Classement</div>
                                </div>
                                <span className="text-xs text-slate-400 font-bold">{panelOpen.classification ? '▼' : '►'}</span>
                            </div>
                            {panelOpen.classification && (
                                <div className="btp-form-grid">
                                    <div className="btp-form-group">
                                        <label className="text-xs font-bold text-slate-500 mb-5 uppercase">Classement manuel</label>
                                        <textarea
                                            value={customClassification}
                                            onChange={(e) => setCustomClassification(e.target.value)}
                                            placeholder="Saisissez ici le classement manuel (ex : Vent modéré, épisode de catégorie 2...)..."
                                            style={{ height: '100px', fontSize: '11px' }}
                                        />
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* 4. ACTIONS */}
                    {globalData.rows && (
                        <>
                            <div className="btp-panel-head mt-20">
                                <div className="flex items-center">
                                    <div className="btp-step-num">4</div>
                                    <div className="btp-panel-title">Actions</div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-5 mt-10">
                                <button className="btp-btn btp-btn-print" onClick={handlePrint} style={{ background: '#0f172a' }}>
                                    <Printer size={18} /> Imprimer (PDF)
                                </button>
                                <button className="btp-btn btp-btn-save" onClick={handleSaveToDB}>
                                    <Save size={18} /> Enregistrer
                                </button>
                                <div className="grid grid-cols-2 gap-2">
                                    <button className="btp-btn btp-btn-primary" onClick={exportWord} style={{ background: '#2b579a', padding: '10px' }}>
                                        <FileText size={16} /> Word
                                    </button>
                                    <button className="btp-btn btp-btn-primary" onClick={copyText} style={{ background: '#64748b', padding: '10px' }}>
                                        <Copy size={16} /> Copier
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* MAIN PREVIEW AREA */}
                <div className="btp-preview-container">
                    {!globalData.rows ? (
                        <div style={{ textAlign: 'center', padding: '100px', color: 'white', opacity: 0.6 }}>
                            <CloudRain size={80} strokeWidth={1} style={{ marginBottom: '20px' }} />
                            <h2 className="text-2xl font-bold">Certificat Météo</h2>
                            <p>Configurez les paramètres à gauche pour <br />visualiser le rapport officiel.</p>
                        </div>
                    ) : (
                        <div
                            className="certificat-full-preview"
                            style={{ width: '100%' }}
                            dangerouslySetInnerHTML={{ __html: reportOutput }}
                        />
                    )}
                </div>
            </div>

            {/* ARCHIVES MODAL */}
            {
                showArchivesModal && (
                    <div className="btp-modal open">
                        <div className="btp-modal-content" style={{ maxWidth: '900px' }}>
                            <div className="btp-modal-header">
                                <h2 className="text-xl font-bold flex items-center gap-2"><Briefcase /> Archives des Certificats</h2>
                                <button onClick={() => setShowArchivesModal(false)} className="text-slate-400 hover:text-slate-600">×</button>
                            </div>
                            <div className="mt-10 overflow-x-auto">
                                {archives.length === 0 ? (
                                    <p className="text-center py-20 text-slate-500 italic">Aucune archive disponible.</p>
                                ) : (
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="bg-slate-100">
                                                <th className="p-10 text-left border">Généré le</th>
                                                <th className="p-10 text-left border">Client</th>
                                                <th className="p-10 text-left border">Ville</th>
                                                <th className="p-10 text-left border">Type</th>
                                                <th className="p-10 text-center border">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {archives.map(a => (
                                                <tr key={a.id} className="hover:bg-slate-50 border-b">
                                                    <td className="p-10 border">{new Date(a.date_generation).toLocaleDateString()}</td>
                                                    <td className="p-10 border font-bold">{a.nom_client}</td>
                                                    <td className="p-10 border">{a.ville}</td>
                                                    <td className="p-10 border text-xs">{a.type_certificat}</td>
                                                    <td className="p-10 border text-center">
                                                        <div className="flex items-center justify-center gap-3">
                                                            <button
                                                                className="bg-accent text-white px-8 py-4 rounded text-xs font-bold hover:opacity-90 transition-all"
                                                                onClick={() => loadArchive(a)}
                                                            >
                                                                Charger
                                                            </button>
                                                            <button
                                                                className="text-red-500 hover:text-red-700 p-5 rounded hover:bg-red-50 transition-all"
                                                                onClick={() => deleteArchive(a.id)}
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* MERGE OPTIONS MODAL */}
            {showMergeModal && (
                <div className="btp-modal open">
                    <div className="btp-modal-content" style={{ maxWidth: '500px' }}>
                        <div className="btp-modal-header">
                            <h2 className="text-xl font-bold flex items-center gap-2"><FileText /> Option d'Importation CSV</h2>
                            <button onClick={() => setShowMergeModal(false)} className="text-slate-400 hover:text-slate-600">×</button>
                        </div>
                        <div className="p-20">
                            <p className="text-xs text-slate-500 mb-10">
                                Fichier station : <strong>{csvStationId}</strong><br/>
                                Période du fichier : {csvDates.firstDate?.toLocaleDateString()} au {csvDates.lastDate?.toLocaleDateString()}
                            </p>

                            <div className="mb-15">
                                <label className="block text-xs font-bold text-slate-700 mb-5">Nom du poste de référence :</label>
                                <input 
                                    type="text" 
                                    className="w-full border border-slate-300 rounded p-8 text-sm focus:outline-none focus:border-blue-500" 
                                    value={csvStationName} 
                                    onChange={e => setCsvStationName(e.target.value)} 
                                    placeholder="Ex: Lille, Douai..."
                                />
                                <span className="text-xxs text-slate-400 block mt-2">Ce nom sera appliqué aux paramètres cochés ci-dessous lors de l'intégration.</span>
                            </div>

                            <div className="mb-20">
                                <label className="block text-sm font-bold text-slate-700 mb-10">Paramètres à importer :</label>
                                <div className="flex flex-col gap-3 bg-slate-50 p-10 rounded border border-slate-200">
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input type="checkbox" checked={mergeOptionTemp} onChange={e => setMergeOptionTemp(e.target.checked)} />
                                        Températures (Min / Max / Moyenne)
                                    </label>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input type="checkbox" checked={mergeOptionRain} onChange={e => setMergeOptionRain(e.target.checked)} />
                                        Pluie (Cumul)
                                    </label>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input type="checkbox" checked={mergeOptionWind} onChange={e => setMergeOptionWind(e.target.checked)} />
                                        Vent & Rafales
                                    </label>
                                </div>
                            </div>

                            {globalData.rows && globalData.rows.length > 0 && (
                                <div className="mb-20">
                                    <label className="block text-sm font-bold text-slate-700 mb-10">Mode d'intégration :</label>
                                    <div className="flex gap-15">
                                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                                            <input type="radio" name="mergeMode" checked={mergeMode === 'merge'} onChange={() => setMergeMode('merge')} />
                                            Fusionner avec les données existantes
                                        </label>
                                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                                            <input type="radio" name="mergeMode" checked={mergeMode === 'overwrite'} onChange={() => setMergeMode('overwrite')} />
                                            Écraser (Remplacer tout)
                                        </label>
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end gap-10 mt-20">
                                <button className="bg-slate-200 text-slate-700 px-15 py-8 rounded font-semibold hover:bg-slate-300 transition-all text-sm" onClick={() => setShowMergeModal(false)}>
                                    Annuler
                                </button>
                                <button className="bg-emerald-600 text-white px-15 py-8 rounded font-semibold hover:bg-emerald-700 transition-all text-sm flex items-center gap-5" onClick={handleConfirmMerge}>
                                    <Save size={16} /> Importer
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};

export default CertificatMeteoManager;
