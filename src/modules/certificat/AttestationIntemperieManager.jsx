import React, { useEffect, useRef, useState } from 'react';
import { supabase, weatherAPI } from '../../services/api';
import { DEPARTMENTS } from '../../data/departments';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { HardHat, FileText, Calendar, MapPin, Thermometer, CloudRain, Wind, ShieldCheck, Download, Printer, Copy, Eraser, Save, Mail, Phone, Briefcase, Trash2 } from 'lucide-react';
import './CertificatMeteoManager.css';

const AttestationIntemperieManager = () => {
    // --- États Emetteur (Météo Climat Pro) --- 
    // Valeurs "En Dur" comme demandé
    const [emitterName, setEmitterName] = useState('Patrick MARLIERE');
    const [emitterAddress, setEmitterAddress] = useState('400 rue Paul Larfargue');
    const [emitterZip, setEmitterZip] = useState('59283');
    const [emitterCity, setEmitterCity] = useState('RAIMBEAUCOURT');
    const [emitterPhone, setEmitterPhone] = useState('06 83 90 91 60');
    const [emitterEmail, setEmitterEmail] = useState('patrick.marliere@wanadoo.fr');
    const [companyLogo, setCompanyLogo] = useState('/logo.jpg');

    // --- États du dossier ---
    const [projectName, setProjectName] = useState('');
    const [clientName, setClientName] = useState('');
    const [clientAddress, setClientAddress] = useState('');
    const [clientCity, setClientCity] = useState('');
    const [clientZip, setClientZip] = useState('');
    const [clientEmail, setClientEmail] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [refDossier, setRefDossier] = useState('ATT-' + Date.now().toString().slice(-6));
    const [docType, setDocType] = useState('1'); // 1=Synthèse, 2=Détaillés, 3=Classification

    // --- États de la période & Station ---
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [isPeriod, setIsPeriod] = useState(false);
    const [selectedDept, setSelectedDept] = useState('');
    const [stations, setStations] = useState([]);
    const [selectedStationId, setSelectedStationId] = useState('');
    const [stationMeteo, setStationMeteo] = useState('');
    const [stationMeteoTemp, setStationMeteoTemp] = useState('');
    const [stationMeteoRain, setStationMeteoRain] = useState('');
    const [stationMeteoWind, setStationMeteoWind] = useState('');
    const [selectedStationIdTemp, setSelectedStationIdTemp] = useState('');
    const [selectedStationIdRain, setSelectedStationIdRain] = useState('');
    const [selectedStationIdWind, setSelectedStationIdWind] = useState('');
    const [deptTemp, setDeptTemp] = useState('');
    const [deptRain, setDeptRain] = useState('');
    const [deptWind, setDeptWind] = useState('');
    const [stationsTemp, setStationsTemp] = useState([]);
    const [stationsRain, setStationsRain] = useState([]);
    const [stationsWind, setStationsWind] = useState([]);
    const [showDetailedStations, setShowDetailedStations] = useState(false);
    const [loadingStations, setLoadingStations] = useState(false);
    const [stationNames, setStationNames] = useState({});

    // --- États d'import/fusion de fichiers CSV ---
    const [showMergeModal, setShowMergeModal] = useState(false);
    const [csvRowsParsed, setCsvRowsParsed] = useState([]);
    const [csvStationId, setCsvStationId] = useState('');
    const [csvStationName, setCsvStationName] = useState('');
    const [csvDates, setCsvDates] = useState({ firstDate: null, lastDate: null });
    const [mergeOptionTemp, setMergeOptionTemp] = useState(true);
    const [mergeOptionRain, setMergeOptionRain] = useState(true);
    const [mergeOptionWind, setMergeOptionWind] = useState(true);
    const [mergeMode, setMergeMode] = useState('merge'); // 'merge' or 'overwrite'

    // --- Seuils de classification ---
    const [limitRain, setLimitRain] = useState(10);
    const [limitTemp, setLimitTemp] = useState(0);
    const [limitWind, setLimitWind] = useState(60);
    const [limitTempMax, setLimitTempMax] = useState(28);

    // --- États techniques & Données ---
    const [globalData, setGlobalData] = useState(null);
    const [status, setStatus] = useState('');
    const [reportOutput, setReportOutput] = useState('');
    const [nearbyStations, setNearbyStations] = useState([]);
    const [selectedStationDist, setSelectedStationDist] = useState(null);
    const [showCharts, setShowCharts] = useState(true);
    const [showPersonalization, setShowPersonalization] = useState(true);
    const [excludeWeekends, setExcludeWeekends] = useState(false);
    const [expertConclusion, setExpertConclusion] = useState('');
    const [isConclusionManual, setIsConclusionManual] = useState(false);
    const [customClassification, setCustomClassification] = useState('');
    const [archives, setArchives] = useState([]);
    const [showArchivesModal, setShowArchivesModal] = useState(false);
    const [loadingArchives, setLoadingArchives] = useState(false);
    const [panelOpen, setPanelOpen] = useState({
        client: true,
        period: true,
        thresholds: false,
        conclusion: false,
        classification: false
    });

    const chartRefs = useRef({});
    const fileInputRef = useRef(null);

    // Synchro dates & Load Chart.js
    useEffect(() => {
        if (isPeriod && new Date(endDate) < new Date(startDate)) {
            setEndDate(startDate);
        }

        if (!window.Chart) {
            const script = document.createElement('script');
            script.src = "https://cdn.jsdelivr.net/npm/chart.js";
            script.async = true;
            script.onload = () => {
                console.log("[Attestation] Chart.js loaded");
                generateReport();
            };
            document.body.appendChild(script);
        }
    }, [startDate, isPeriod]);

    // Synchro de stationMeteo (compatibilité Détaillé vs Global)
    useEffect(() => {
        if (showDetailedStations) {
            const stTR = cleanStationName(stationMeteoTemp || stationMeteoRain);
            const stW = cleanStationName(stationMeteoWind);
            if (stTR === stW || !stW || stW === '—') {
                if (stTR && stTR !== '—') setStationMeteo(stTR);
            } else if (stTR || stW) {
                setStationMeteo(`Température & Pluie : ${stTR || '—'} | Vent : ${stW || '—'}`);
            }
        }
    }, [stationMeteoTemp, stationMeteoRain, stationMeteoWind, showDetailedStations]);

    // --- Chargement des stations ---
    useEffect(() => {
        if (selectedDept) {
            setDeptTemp(selectedDept);
            setDeptRain(selectedDept);
            setDeptWind(selectedDept);
        }
    }, [selectedDept]);

    useEffect(() => {
        if (!selectedDept) { setStations([]); setStationsTemp([]); setStationsRain([]); setStationsWind([]); return; }
        async function getStations() {
            setLoadingStations(true);
            try {
                let data = await weatherAPI.getDepartmentLatestHoraire(selectedDept);
                if (data.length === 0) {
                    const stationNamesData = await import('../../data/stationNames.json');
                    const deptPrefix = (selectedDept === '2A' || selectedDept === '2B') ? '20' : selectedDept;
                    const filtered = Object.entries(stationNamesData.default || stationNamesData)
                        .filter(([id]) => id.startsWith(deptPrefix))
                        .map(([id, name]) => ({ station_id: id, nom_station: name }));
                    data = filtered;
                }
                setStations(data);
                setStationsTemp(data);
                setStationsRain(data);
                setStationsWind(data);
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

    const getStationsForDept = async (dept) => {
        if (!dept) return [];
        try {
            let data = await weatherAPI.getDepartmentLatestHoraire(dept);
            if (!data || data.length === 0) {
                const stationNamesData = await import('../../data/stationNames.json');
                const deptPrefix = (dept === '2A' || dept === '2B') ? '20' : dept;
                data = Object.entries(stationNamesData.default || stationNamesData)
                    .filter(([id]) => id.startsWith(deptPrefix))
                    .map(([id, name]) => ({ station_id: id, nom_station: name }));
            }
            const names = { ...stationNames };
            for (const s of data) {
                const sid = s.station_id || s.id_station;
                if (!names[sid] && s.nom_station) names[sid] = s.nom_station;
            }
            setStationNames(names);
            return data;
        } catch (e) {
            console.error(e);
            return [];
        }
    };

    useEffect(() => {
        generateReport();
    }, [globalData, docType, projectName, clientName, clientAddress, clientCity, clientZip, limitRain, limitTemp, limitWind, limitTempMax, refDossier, nearbyStations, showCharts, showPersonalization, isPeriod, startDate, endDate, expertConclusion, stationMeteo, customClassification, showDetailedStations, stationMeteoTemp, stationMeteoRain, stationMeteoWind]);

    // --- Monitoring Changes for Conclusion ---
    useEffect(() => {
        if (!isConclusionManual && globalData) {
            setExpertConclusion(generateAutoConclusion());
        }
    }, [globalData, limitRain, limitTemp, limitWind, limitTempMax, excludeWeekends, showPersonalization, stationMeteo, stationMeteoTemp, stationMeteoRain, stationMeteoWind]);

    // --- Calcul stations proches ---
    useEffect(() => {
        const timer = setTimeout(() => {
            if (clientCity && globalData) {
                const finalEndDate = isPeriod ? endDate : startDate;
                refreshNearbyStations(startDate, finalEndDate);
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [clientCity, selectedStationId, startDate, endDate, isPeriod]);

    const refreshNearbyStations = async (start, end) => {
        if (!clientCity) return;
        try {
            const cityResults = await weatherAPI.searchCity(clientCity);
            if (!cityResults || cityResults.length === 0) return;

            const cityLat = cityResults[0].lat;
            const cityLon = cityResults[0].lon;

            // Calcul distances : Essai RPC Supabase puis Fallback 100% autonome local
            let dists = null;
            if (supabase) {
                try {
                    const { data, error } = await supabase.rpc('find_nearest_stations', {
                        lat_input: cityLat,
                        lon_input: cityLon,
                        limit_count: 10
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
                    }).sort((a, b) => a.dist_km - b.dist_km).slice(0, 10);
                } catch (e) {
                    console.error("Erreur calcul stations proches local:", e);
                }
            }

            if (!dists || dists.length === 0) return;

            const currentStation = dists.find(s => s.id === selectedStationId);
            if (currentStation) setSelectedStationDist(currentStation.dist_km);

            const candidates = dists.filter(s => s.id !== selectedStationId).slice(0, 4);

            const enriched = await Promise.all(candidates.map(async (s) => {
                try {
                    const sHistory = await weatherAPI.getStationHourlyHistoryRange(s.id, start, end);
                    if (!sHistory || sHistory.length === 0) return null;

                    const stats = {
                        maxGust: Math.max(...sHistory.map(h => h.gust || 0)),
                        rainTotal: sHistory.reduce((acc, h) => acc + (h.rain || 0), 0),
                        tmin: Math.min(...sHistory.map(h => h.temp || 99)),
                        tmax: Math.max(...sHistory.map(h => h.temp || -99))
                    };

                    return { id: s.id, name: s.name, dist: s.dist_km, stats };
                } catch (e) { return null; }
            }));

            setNearbyStations(enriched.filter(s => s !== null));
        } catch (e) { console.error(e); }
    };

    const cleanStationName = (name) => {
        if (!name) return '—';
        let cleaned = String(name).replace(/\s*\(\d+\)/g, '').trim();
        cleaned = cleaned.replace(/\s*\(\s*\d+\s*\)\s*$/g, '').trim();
        cleaned = cleaned.replace(/^(Temp|Pluie|Vent|Température|Précipitations)\s*(&\s*(Pluie|Précipitations))?\s*:\s*/i, '').trim();
        cleaned = cleaned.replace(/_/g, ' ');
        return cleaned.trim();
    };

    const getStationDisplay = () => {
        const stTempRain = cleanStationName(stationMeteoTemp || stationMeteoRain || stationNames[selectedStationIdTemp] || stationMeteo);
        const stWind = cleanStationName(stationMeteoWind || stationNames[selectedStationIdWind] || stationMeteo);

        if (stTempRain === stWind || !stWind || stWind === '—') {
            return stTempRain;
        }
        return `Température & Pluie : ${stTempRain} | Vent : ${stWind}`;
    };

    // --- Récupération des données & Import CSV ---
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

                // Headers: POSTE;DATE;RR;TN;TX;FXI
                const dataLines = lines.slice(1).filter(l => l.trim().length > 0);

                const rows = [];
                let firstDate = null;
                let lastDate = null;
                let stationId = '';

                // On vérifie si les unités de vent sont en m/s ou km/h
                // Si une valeur FXI > 40, on suppose que c'est déjà du km/h
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

                    const rawDate = cols[1]; // YYYYMMDD ou YYYYMMDDHH
                    if (!rawDate || (rawDate.length !== 8 && rawDate.length !== 10)) return;

                    const year = parseInt(rawDate.substring(0, 4));
                    const month = parseInt(rawDate.substring(4, 6));
                    const day = parseInt(rawDate.substring(6, 8));
                    const hour = rawDate.length === 10 ? parseInt(rawDate.substring(8, 10)) : 12;

                    const dateObj = new Date(year, month - 1, day, hour, 0, 0);
                    const datePure = new Date(year, month - 1, day);
                    const dateKey = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

                    if (!firstDate || datePure < firstDate) firstDate = datePure;
                    if (!lastDate || datePure > lastDate) lastDate = datePure;

                    stationId = cols[0];

                    const rr = parseFloat(cols[2]?.replace(',', '.')) || 0;
                    const tn = parseFloat(cols[3]?.replace(',', '.')) || 99;
                    const tx = parseFloat(cols[4]?.replace(',', '.')) || -99;
                    const fxi = (parseFloat(cols[5]?.replace(',', '.')) || 0) * windMultiplier;

                    let tempVal = (tn !== 99 && tx !== -99) ? (tn + tx) / 2 : (tn !== 99 ? tn : tx);
                    if (tempVal === 99 || tempVal === -99) tempVal = 0;

                    rows.push({
                        time: dateObj,
                        dateKey,
                        h: hour,
                        temp: tempVal,
                        tmin: tn !== 99 ? tn : null,
                        tmax: tx !== -99 ? tx : null,
                        rain: rr,
                        w_avg: fxi,
                        w_gst: fxi,
                        rawFxi: fxi
                    });
                });

                if (rows.length === 0) throw new Error("Aucune donnée valide trouvée dans le fichier.");

                rows.sort((a, b) => a.time - b.time);

                setCsvRowsParsed(rows);
                setCsvStationId(stationId);
                const sName = stationNames[stationId] || stationId;
                setCsvStationName(sName);
                setCsvDates({ firstDate, lastDate });

                if (globalData && Object.keys(globalData).length > 0) {
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

            const finalStationName = csvStationName.trim() || csvStationId;
            let firstDate = csvDates.firstDate;
            let lastDate = csvDates.lastDate;

            // Grouper les lignes CSV par jour
            const csvDays = {};
            csvRowsParsed.forEach(row => {
                const k = row.dateKey;
                if (!csvDays[k]) {
                    csvDays[k] = {
                        rows: [],
                        tmin: 99,
                        tmax: -99,
                        rainTotal: 0,
                        gustMax: 0,
                        gustTime: 'N/A'
                    };
                }
                csvDays[k].rows.push(row);
                if (row.tmin !== null && row.tmin < csvDays[k].tmin) csvDays[k].tmin = row.tmin;
                if (row.tmax !== null && row.tmax > csvDays[k].tmax) csvDays[k].tmax = row.tmax;
                if (row.tmin === null && row.tmax === null && row.temp !== 0) {
                    if (row.temp < csvDays[k].tmin) csvDays[k].tmin = row.temp;
                    if (row.temp > csvDays[k].tmax) csvDays[k].tmax = row.temp;
                }
                csvDays[k].rainTotal += (row.rain || 0);
                if (row.w_gst > csvDays[k].gustMax) {
                    csvDays[k].gustMax = row.w_gst;
                    csvDays[k].gustTime = `${row.h}h`;
                }
            });

            let finalDays = {};

            if (mergeMode === 'overwrite' || !globalData || Object.keys(globalData).length === 0) {
                // Mode écrasement : créer les données à partir du CSV avec les paramètres sélectionnés
                Object.keys(csvDays).forEach(k => {
                    const cd = csvDays[k];
                    const tmin = mergeOptionTemp ? (cd.tmin !== 99 ? cd.tmin : 0) : 0;
                    const tmax = mergeOptionTemp ? (cd.tmax !== -99 ? cd.tmax : 0) : 0;
                    const rainTotal = mergeOptionRain ? cd.rainTotal : 0;
                    const gustMax = mergeOptionWind ? cd.gustMax : 0;
                    const gustTime = mergeOptionWind ? cd.gustTime : 'N/A';

                    finalDays[k] = {
                        rows: cd.rows.map(r => ({
                            time: r.time,
                            temp: mergeOptionTemp ? r.temp : 0,
                            rain: mergeOptionRain ? r.rain : 0,
                            gust: mergeOptionWind ? r.w_gst : 0,
                            w_gst: mergeOptionWind ? r.w_gst : 0
                        })),
                        stats: {
                            tmin,
                            tmax,
                            rainTotal,
                            gustMax,
                            gustTime
                        }
                    };
                });
            } else {
                // Mode fusion : mettre à jour seulement les paramètres sélectionnés
                finalDays = { ...globalData };

                Object.keys(csvDays).forEach(k => {
                    const cd = csvDays[k];
                    if (finalDays[k]) {
                        const day = { ...finalDays[k] };
                        const s = { ...day.stats };

                        if (mergeOptionTemp) {
                            if (cd.tmin !== 99) s.tmin = cd.tmin;
                            if (cd.tmax !== -99) s.tmax = cd.tmax;
                        }
                        if (mergeOptionRain) {
                            s.rainTotal = cd.rainTotal;
                        }
                        if (mergeOptionWind) {
                            s.gustMax = cd.gustMax;
                            s.gustTime = cd.gustTime;
                        }

                        if (day.rows && day.rows.length > 0) {
                            day.rows = day.rows.map(r => ({
                                ...r,
                                temp: mergeOptionTemp ? ((s.tmin !== 99 && s.tmax !== -99) ? (s.tmin + s.tmax) / 2 : r.temp) : r.temp,
                                rain: mergeOptionRain ? cd.rainTotal / day.rows.length : r.rain,
                                gust: mergeOptionWind ? cd.gustMax : (r.gust || 0),
                                w_gst: mergeOptionWind ? cd.gustMax : (r.w_gst || 0)
                            }));
                        } else {
                            day.rows = [{
                                time: cd.rows[0]?.time || new Date(k),
                                temp: (s.tmin !== 99 && s.tmax !== -99) ? (s.tmin + s.tmax) / 2 : 0,
                                rain: s.rainTotal,
                                gust: s.gustMax,
                                w_gst: s.gustMax
                            }];
                        }

                        day.stats = s;
                        finalDays[k] = day;
                    } else {
                        finalDays[k] = {
                            rows: cd.rows.map(r => ({
                                time: r.time,
                                temp: mergeOptionTemp ? r.temp : 0,
                                rain: mergeOptionRain ? r.rain : 0,
                                gust: mergeOptionWind ? r.w_gst : 0,
                                w_gst: mergeOptionWind ? r.w_gst : 0
                            })),
                            stats: {
                                tmin: mergeOptionTemp ? (cd.tmin !== 99 ? cd.tmin : 0) : 0,
                                tmax: mergeOptionTemp ? (cd.tmax !== -99 ? cd.tmax : 0) : 0,
                                rainTotal: mergeOptionRain ? cd.rainTotal : 0,
                                gustMax: mergeOptionWind ? cd.gustMax : 0,
                                gustTime: mergeOptionWind ? cd.gustTime : 'N/A'
                            }
                        };
                    }
                });

                const allKeys = Object.keys(finalDays).sort();
                if (allKeys.length > 0) {
                    firstDate = new Date(allKeys[0]);
                    lastDate = new Date(allKeys[allKeys.length - 1]);
                }
            }

            setGlobalData(finalDays);

            // Mise à jour des noms de stations
            if (mergeOptionTemp) setStationMeteoTemp(finalStationName);
            if (mergeOptionRain) setStationMeteoRain(finalStationName);
            if (mergeOptionWind) setStationMeteoWind(finalStationName);

            if (!(mergeOptionTemp && mergeOptionRain && mergeOptionWind)) {
                setShowDetailedStations(true);
            }

            setSelectedStationId(csvStationId);
            setStationMeteo(prev => {
                if (mergeMode === 'overwrite' || !prev) {
                    return `Import CSV (${finalStationName})`;
                }
                return `${prev} + CSV (${finalStationName})`;
            });

            // Synchroniser les dates
            const sortedDates = Object.keys(finalDays).sort();
            if (sortedDates.length > 0) {
                setStartDate(sortedDates[0]);
                if (sortedDates.length > 1) {
                    setIsPeriod(true);
                    setEndDate(sortedDates[sortedDates.length - 1]);
                } else {
                    setIsPeriod(false);
                    setEndDate(sortedDates[0]);
                }
            }

            setStatus(`✅ Données CSV intégrées avec succès (${Object.keys(finalDays).length} jours).`);
            setShowMergeModal(false);
        } catch (err) {
            console.error(err);
            setStatus('❌ Erreur Fusion : ' + err.message);
        }
    };

    const handleFetchData = async () => {
        const stTemp = (showDetailedStations && selectedStationIdTemp) ? selectedStationIdTemp : selectedStationId;
        const stRain = (showDetailedStations && selectedStationIdRain) ? selectedStationIdRain : selectedStationId;
        const stWind = (showDetailedStations && selectedStationIdWind) ? selectedStationIdWind : selectedStationId;

        const uniqueStationIds = Array.from(new Set([stTemp, stRain, stWind].filter(Boolean)));
        if (uniqueStationIds.length === 0 || !startDate) {
            setStatus('⚠️ Sélectionnez au moins une station et une date.');
            return;
        }

        const finalEndDate = isPeriod ? endDate : startDate;
        setStatus('⏳ Récupération des données Météo-France (DPClim)...');
        setGlobalData(null);

        try {
            const todayStr = new Date().toISOString().split('T')[0];
            const isSingleDayToday = startDate === todayStr && finalEndDate === todayStr;

            const fetchHistoryForStation = async (stationId) => {
                let hist = [];
                if (isSingleDayToday) {
                    const day6mn = await weatherAPI.getStation6mnHistory(stationId, new Date(startDate));
                    if (day6mn && day6mn.length > 0) {
                        for (let h = 0; h < 24; h++) {
                            const sub = day6mn.filter(d => d.time.getHours() === h);
                            if (sub.length > 0) {
                                hist.push({
                                    time: sub[sub.length - 1].time,
                                    temp: Math.max(...sub.map(d => d.temp ?? -99)),
                                    rain: sub.reduce((acc, d) => acc + (d.rain || 0), 0),
                                    wind: Math.max(...sub.map(d => d.wind || 0)),
                                    gust: Math.max(...sub.map(d => d.gust || 0)),
                                    hum: sub[sub.length - 1].hum,
                                    pres: sub[sub.length - 1].pressure
                                });
                            }
                        }
                    }
                }
                if (hist.length === 0) {
                    const sName = stationNames[stationId] || stationId;
                    hist = await weatherAPI.getStationHourlyHistoryRange(stationId, startDate, finalEndDate, (msg) => setStatus(`⏳ [${sName}] ${msg}`));
                }
                return hist || [];
            };

            const stationHistories = {};
            for (const stId of uniqueStationIds) {
                const sName = stationNames[stId] || stId;
                setStatus(`⏳ Récupération DPClim (${sName})...`);
                stationHistories[stId] = await fetchHistoryForStation(stId);
            }

            const indexHistoryByDay = (hist) => {
                const dayMap = {};
                hist.forEach(obs => {
                    const dt = obs.time instanceof Date ? obs.time : new Date(obs.time);
                    const dateKey = obs.date || dt.toLocaleDateString('fr-CA');
                    if (dateKey < startDate || dateKey > finalEndDate) return;
                    if (!dayMap[dateKey]) {
                        dayMap[dateKey] = {
                            rows: [],
                            tmin: 99,
                            tmax: -99,
                            rainTotal: 0,
                            gustMax: 0,
                            gustTime: ''
                        };
                    }
                    const t = (obs.temp !== undefined && obs.temp !== null && !isNaN(obs.temp) && obs.temp > -90) ? obs.temp : null;
                    if (t !== null) {
                        dayMap[dateKey].tmin = Math.min(dayMap[dateKey].tmin, t);
                        dayMap[dateKey].tmax = Math.max(dayMap[dateKey].tmax, t);
                    }
                    dayMap[dateKey].rainTotal += (obs.rain || 0);
                    const g = obs.gust || obs.w_gst || 0;
                    if (g > dayMap[dateKey].gustMax) {
                        dayMap[dateKey].gustMax = g;
                        const d = new Date(obs.time);
                        dayMap[dateKey].gustTime = d.getHours() + 'h' + (d.getMinutes() > 0 ? d.getMinutes() : '');
                    }
                    dayMap[dateKey].rows.push(obs);
                });
                return dayMap;
            };

            const tempDays = indexHistoryByDay(stationHistories[stTemp] || []);
            const rainDays = indexHistoryByDay(stationHistories[stRain] || []);
            const windDays = indexHistoryByDay(stationHistories[stWind] || []);

            const allDateKeys = Array.from(new Set([
                ...Object.keys(tempDays),
                ...Object.keys(rainDays),
                ...Object.keys(windDays)
            ])).sort();

            if (allDateKeys.length === 0) {
                setStatus('❌ Aucune donnée DPClim trouvée pour cette période sur les postes sélectionnés.');
                return;
            }

            const combinedDays = {};
            allDateKeys.forEach(dateKey => {
                const tDay = tempDays[dateKey];
                const rDay = rainDays[dateKey];
                const wDay = windDays[dateKey];

                // Alignement précis heure par heure entre stations distinctes (ex: Temp/Pluie Chantonnay + Vent Pouzauges)
                const allHours = Array.from(new Set([
                    ...(tDay?.rows || []).map(r => (r.time instanceof Date ? r.time : new Date(r.time)).getHours()),
                    ...(rDay?.rows || []).map(r => (r.time instanceof Date ? r.time : new Date(r.time)).getHours()),
                    ...(wDay?.rows || []).map(r => (r.time instanceof Date ? r.time : new Date(r.time)).getHours())
                ])).sort((a, b) => a - b);

                const getRowForHour = (rows, h) => (rows || []).find(r => (r.time instanceof Date ? r.time : new Date(r.time)).getHours() === h);

                const combinedRows = (allHours.length > 0 ? allHours : [6, 10, 14, 18]).map(h => {
                    const tRow = getRowForHour(tDay?.rows, h);
                    const rRow = getRowForHour(rDay?.rows, h);
                    const wRow = getRowForHour(wDay?.rows, h);
                    const anyRow = tRow || rRow || wRow;
                    const rTime = anyRow ? anyRow.time : new Date(`${dateKey}T${String(h).padStart(2, '0')}:00:00`);

                    return {
                        time: rTime,
                        temp: tRow && tRow.temp !== undefined && tRow.temp !== null ? tRow.temp : 0,
                        rain: rRow && rRow.rain !== undefined && rRow.rain !== null ? rRow.rain : 0,
                        gust: wRow ? (wRow.gust || wRow.w_gst || 0) : 0,
                        w_gst: wRow ? (wRow.w_gst || wRow.gust || 0) : 0
                    };
                });

                combinedDays[dateKey] = {
                    rows: combinedRows,
                    stats: {
                        tmin: tDay && tDay.tmin !== 99 ? tDay.tmin : 0,
                        tmax: tDay && tDay.tmax !== -99 ? tDay.tmax : 0,
                        rainTotal: rDay ? rDay.rainTotal : 0,
                        gustMax: wDay ? wDay.gustMax : 0,
                        gustTime: wDay ? wDay.gustTime : 'N/A'
                    }
                };
            });

            // Tri des lignes par heure pour chaque jour
            Object.keys(combinedDays).forEach(dk => {
                combinedDays[dk].rows.sort((a, b) => new Date(a.time) - new Date(b.time));
            });

            setGlobalData(combinedDays);

            const nameTemp = cleanStationName(stationMeteoTemp || stationNames[stTemp] || stTemp);
            const nameWind = cleanStationName(stationMeteoWind || stationNames[stWind] || stWind);

            if (showDetailedStations && (stTemp !== stWind)) {
                setStationMeteoTemp(nameTemp);
                setStationMeteoRain(nameTemp);
                setStationMeteoWind(nameWind);
                setStationMeteo(`Température & Pluie : ${nameTemp} | Vent : ${nameWind}`);
            } else {
                setStationMeteo(nameTemp);
                setStationMeteoTemp(nameTemp);
                setStationMeteoRain(nameTemp);
                setStationMeteoWind(nameTemp);
            }

            setStatus(`✅ ${allDateKeys.length} jours chargés avec succès via DPClim.`);
            refreshNearbyStations(startDate, finalEndDate);

        } catch (e) {
            console.error(e);
            setStatus('❌ Erreur : ' + e.message);
        }
    };

    const getRainLabel = (val) => {
        if (val === 0) return '<span style="color:#94a3b8">Nulle</span>';
        if (val < 2) return 'Faible';
        if (val < 7) return 'Modérée';
        if (val < 15) return 'Assez forte';
        return 'Forte';
    };

    const getTempMiniLabel = (val, limit) => {
        if (val <= limit) return '<span style="color:#e11d48; font-weight:900;">INTEMPÉRIES</span>';
        if (val < 5) return 'Entre 0° et 5°';
        if (val < 10) return 'Entre 5° et 10°';
        return '>= 10°';
    };

    const getTempMaxiLabel = (val, limit) => {
        if (val >= limit) return '<span style="color:#e11d48; font-weight:900;">INTEMPÉRIES</span>';
        if (val < 10) return '< 10°';
        if (val < 15) return 'Entre 10° et 15°';
        if (val < 20) return 'Entre 15° et 20°';
        if (val < 25) return 'Entre 20° et 25°';
        return '>= 25°';
    };

    const getWindLabel = (val, limit) => {
        if (val >= limit) return '<span style="color:#e11d48; font-weight:900;">INTEMPÉRIES</span>';
        if (val < 20) return '0 < x < 20';
        if (val < 40) return '20 < x < 40';
        if (val < 60) return '40 < x < 60';
        return '>= 60';
    };

    // --- Génération des blocs de rapport ---
    const getCommonStyles = () => `
        <style>
            @page { size: A4 portrait; margin: 0; }
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .cert-page { 
                width: 210mm; 
                min-height: 296mm; 
                padding: 8mm 12mm; 
                box-sizing: border-box; 
                position: relative; 
                page-break-after: always;
                background: white;
                color: black;
            }
            .cert-page:last-child { page-break-after: auto; }
            .cert-main-title-box { border: 2px solid #000; padding: 4px 10px; text-align: left; margin-bottom: 8px; }
            .cert-main-title { font-size: 15pt; font-weight: 800; color: #003366; margin: 0; text-transform: uppercase; }
            .cert-section-header { background: #003366 !important; color: white !important; padding: 4px 10px; font-weight: bold; margin-top: 8px; text-transform: uppercase; border-left: 5px solid #000; font-size: 9pt; }
            .cert-table { width: 100%; border-collapse: collapse; margin-top: 3px; font-size: 8.5pt; line-height: 1.1; }
            .cert-table th { background: #1e293b !important; color: white !important; padding: 3px 2px; border: 1px solid #000; text-transform: uppercase; font-size: 8pt; }
            .cert-table td { padding: 2px; border: 1px solid #000; text-align: center; }
            .cert-table tr:nth-child(even) { background-color: #f8fafc !important; }
            .cert-info-row { display: flex; font-size: 9pt; margin-bottom: 3px; align-items: center; }
            .cert-info-label { width: 140px; font-weight: bold; color: #003366; }
            .cert-info-val { font-weight: bold; }
        </style>
    `;

    const getReportHeaderHtml = (title, subtitle) => {
        const startD = new Date(startDate);
        const endD = isPeriod ? new Date(endDate) : startD;
        let dateLabel = startD.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase();
        if (isPeriod && startDate !== endDate) {
            dateLabel = `DU ${startD.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })} AU ${endD.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
        }

        return `
            <div class="cert-header-combined" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 5px; width: 100%; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px;">
                <div class="header-left" style="text-align: left;">
                    <div class="cert-logo" style="margin-bottom: 8px;">
                        <img src="${companyLogo}" alt="MÉTÉO CLIMAT PRO" style="max-height: 55px; object-fit: contain;" />
                    </div>
                    <div class="cert-emitter-info" style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                        <div style="font-size: 8.5pt; color: #475569; line-height: 1.3;">
                            ${emitterAddress}<br/>
                            ${emitterZip} ${emitterCity}<br/>
                            Tel : <span style="color:#0f172a; font-weight:600;">${emitterPhone}</span><br/>
                            Email : ${emitterEmail}<br/>
                            <div style="margin-top: 4px; font-weight: 700; color: #003366; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px;">Expertise Météo-Climatologique</div>
                        </div>
                    </div>
                </div>
                <div class="header-right" style="margin-right: 0; margin-top: 5px; flex: 1; display: flex; justify-content: flex-end;">
                    <div class="cert-client-box" style="text-align: left; width: 100%; max-width: 350px; border: 2.5px solid #000; padding: 12px; background: #fff; box-shadow: 3px 3px 0px rgba(0,0,0,0.1);">
                        <div class="cert-client-info" style="font-family: 'Arial Black', sans-serif;">
                            <div style="font-size: 13pt; color: #003366; text-transform: uppercase; margin-bottom: 5px; font-weight: 900; border-bottom: 1.5px solid #000; padding-bottom: 5px; line-height: 1.1;">CLIENT : ${clientName || '---'}</div>
                            ${projectName ? `<div style="font-size: 11pt; color: #003366; font-weight: 800; margin-bottom: 8px; text-transform: uppercase;">CHANTIER : ${projectName}</div>` : ''}
                            <div style="font-size: 9.5pt; color: #1e293b; line-height: 1.3; font-family: Arial, sans-serif; font-weight: bold;">${clientAddress || '---'}</div>
                            <div style="font-size: 9.5pt; color: #1e293b; font-family: Arial, sans-serif; font-weight: bold;">${clientZip || ''} ${clientCity || ''}</div>
                            <div style="margin-top: 10px; padding: 5px 12px; background: #003366; color: white; border-radius: 4px; display: inline-block;">
                                <div style="font-size: 9.5pt; font-weight: 900; letter-spacing: 0.5px;">RÉF. ${refDossier}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="cert-main-title-box" style="margin-bottom: 4px; border: 2px solid #000; padding: 2px 8px; width: 100%; box-sizing: border-box;">
                <h1 class="cert-main-title" style="letter-spacing: 1px; margin-bottom: 0px; font-size: 13pt;">${title}</h1>
                <div style="font-size: 9pt; color: #003366; font-weight: 800; border-top: 1px solid #000; padding-top: 1px; margin-top: 1px; text-transform: uppercase;">
                    ${subtitle}
                </div>
            </div>

            <div style="display: flex; justify-content: space-between; font-size: 8pt; margin-bottom: 6px; background: #f8fafc; padding: 4px 10px; border-bottom: 1px solid #e2e8f0; margin-top:6px;">
                <div class="cert-info-row" style="margin-bottom: 0; flex: 1;">
                    <span class="cert-info-label" style="width: auto; margin-right: 10px; font-weight:bold;">PÉRIODE ANALYSÉE :</span>
                    <span class="cert-info-val">${dateLabel}</span>
                </div>
                <div class="cert-info-row" style="margin-bottom: 0; flex: 1; justify-content: flex-end;">
                    <span class="cert-info-label" style="width: auto; margin-right: 10px; font-weight:bold;">POSTE(S) DE RÉFÉRENCE :</span>
                    <span class="cert-info-val">${getStationDisplay()}</span>
                </div>
            </div>
        `;
    };

    const getSynthesisHtml = () => {
        if (!globalData) return '';
        const startD = new Date(startDate);
        const endD = isPeriod ? new Date(endDate) : startD;

        return `
            <div class="cert-page">
                ${getReportHeaderHtml("ATTESTATION D'INTEMPÉRIES", "DOSSIER D'EXPERTISE TECHNIQUE")}

                <div class="cert-section-header">SYNTHÈSE DES SEUILS CONTRACTUELS</div>
                <div style="margin-top:10px; font-size: 9.5pt;">
                    Seuils de référence retenus pour cette analyse : 
                    <strong>Pluie &ge; ${limitRain} mm</strong> | 
                    <strong>Température &le; ${limitTemp} °C</strong> | 
                    <strong>Vent &ge; ${limitWind} km/h</strong>.
                </div>

                <div style="margin-top:8px; padding:6px 12px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:4px; font-size:8.5pt; color:#1e293b; line-height:1.4;">
                    <strong>POSTES DE RÉFÉRENCE :</strong>&nbsp;&nbsp;
                    ${(cleanStationName(stationMeteoTemp || stationMeteo) === cleanStationName(stationMeteoWind || stationMeteo) || !stationMeteoWind || cleanStationName(stationMeteoWind) === '—') ? `
                        <strong>${cleanStationName(stationMeteoTemp || stationMeteo)}</strong> (Température, Précipitations, Vent)
                    ` : `
                        🌡️🌧️ <strong>Température & Précipitations :</strong> ${cleanStationName(stationMeteoTemp || stationMeteoRain || stationMeteo)}&nbsp;&nbsp;|&nbsp;&nbsp;
                        💨 <strong>Vent & Rafales :</strong> ${cleanStationName(stationMeteoWind || stationMeteo)}
                    `}
                </div>

                <table class="cert-table" style="margin-top:10px;">
                    <thead>
                        <tr style="background:#f1f5f9;">
                            <th style="text-align:left;">PHÉNOMÈNE</th>
                            <th>SEUIL</th>
                            <th>NOMBRE DE JOURS CLASSÉS</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${getSeuilStatsHtml()}
                    </tbody>
                </table>

                ${customClassification ? `
                <div style="margin-top: 8px; page-break-inside: avoid;">
                    <div style="font-size: 10pt; font-weight: 900; text-transform: uppercase; letter-spacing: 3px; color: #003366; margin-bottom: 5px; text-align: center;">── CLASSEMENT ──</div>
                    <div style="background: #003366; border: 2px solid #003366; border-radius: 5px; padding: 8px 16px; text-align: center; font-family: sans-serif; font-size: 13pt; font-weight: 900; color: #ffffff; letter-spacing: 1px; line-height: 1.3; text-transform: uppercase; white-space: pre-wrap;">${customClassification}</div>
                </div>
                ` : ''}

                <div class="cert-section-header" style="margin-top: 8px;">CONCLUSION DE L'EXPERT</div>
                <div class="cert-text-block" style="margin-top:6px; line-height:1.5; font-size:9.5pt; white-space: pre-wrap; text-align: justify;">${expertConclusion || generateAutoConclusion()}</div>

                <div style="margin-top:8px; padding:8px 14px; border:2px solid #003366; border-left: 6px solid #003366; background:#f0f9ff; text-align:left; border-radius: 6px;">
                    <div style="font-size: 10pt; font-weight: 900; color: #003366; text-transform: uppercase; margin-bottom: 3px;">RÉSULTAT DES ANALYSES</div>
                    <div style="font-size: 10pt; color: #1e293b; font-weight: 700;">
                        ${countIntemperieDays()} JOUR(S) D'INTEMPÉRIES IDENTIFIÉ(S)
                    </div>
                    <div style="font-size: 8pt; color: #64748b; margin-top: 3px;">
                        Postes de référence : ${getStationDisplay()} | Période du ${startD.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })} au ${endD.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </div>
                </div>
            </div>
        `;
    };

    const getClassificationHtml = () => {
        if (!globalData) return '';
        const sortedDaysK = Object.keys(globalData).sort();

        // Group by month
        const groups = {};
        sortedDaysK.forEach(k => {
            const m = k.substring(0, 7);
            if (!groups[m]) groups[m] = [];
            groups[m].push(k);
        });

        return Object.keys(groups).sort().map((monthK, index) => {
            const [year, month] = monthK.split('-');
            const monthName = new Date(year, month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

            return `
                <div class="cert-page">
                    <div class="cert-main-title-box" style="margin-bottom: 20px; border: 2px solid #000; padding: 10px; background: #fff;">
                        <h2 style="font-size: 13pt; margin:0; color:#003366; text-transform:uppercase; font-weight: 800;">ANNEXE 1 : DOSSIER DE CLASSIFICATION</h2>
                        <div style="font-size: 9.5pt; margin-top:5px; color:#64748b; font-weight:bold; text-transform: uppercase;">Mois de ${monthName}</div>
                    </div>

                    <table class="cert-table" style="border: 1px solid #000;">
                        <thead>
                            <tr>
                                <th style="text-align:left; border: 1px solid #000;">Date</th>
                                <th style="border: 1px solid #000;">Pluie (mm)<br/><span style="font-size:6.5pt; font-weight:normal; text-transform:none;">${cleanStationName(stationMeteoRain || stationMeteoTemp || stationMeteo)}</span></th>
                                <th style="border: 1px solid #000;">T&deg;mini<br/><span style="font-size:6.5pt; font-weight:normal; text-transform:none;">${cleanStationName(stationMeteoTemp || stationMeteo)}</span></th>
                                <th style="border: 1px solid #000;">T&deg;maxi<br/><span style="font-size:6.5pt; font-weight:normal; text-transform:none;">${cleanStationName(stationMeteoTemp || stationMeteo)}</span></th>
                                <th style="border: 1px solid #000;">Rafales<br/><span style="font-size:6.5pt; font-weight:normal; text-transform:none;">${cleanStationName(stationMeteoWind || stationMeteo)}</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${groups[monthK].map(dayK => {
                const day = globalData[dayK];
                const s = day.stats;
                const d = new Date(dayK);

                const isRain = s.rainTotal >= limitRain;
                const isGel = s.tmin <= limitTemp;
                const isVent = s.gustMax >= limitWind;
                const isHot = s.tmax >= limitTempMax;

                const isStandardRain = s.rainTotal >= 10;
                const isStandardGel = s.tmin <= 0;
                const isStandardVent = s.gustMax >= 60;
                const isStandardSnow = s.tmin <= 0 && s.rainTotal >= 1;

                let isIntemp = false;
                if (showPersonalization) {
                    if (isRain || isGel || isVent || isHot || isStandardRain || isStandardGel || isStandardVent || isStandardSnow) isIntemp = true;
                } else {
                    if (isStandardRain || isStandardGel || isStandardVent || isStandardSnow) isIntemp = true;
                }

                return `
                                    <tr>
                                        <td style="border:1px solid #000; font-weight:bold;">
                                            ${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                            ${isIntemp ? '<span style="color:#e11d48; font-size:7pt;"><br/>(INTEMPERIES)</span>' : ''}
                                        </td>
                                        <td style="border:1px solid #000;">
                                            ${isRain || isStandardRain ? '<span style="color:#e11d48; font-weight:900;">INTEMPÉRIES</span>' : getRainLabel(s.rainTotal)}
                                        </td>
                                        <td style="border:1px solid #000;">
                                            ${getTempMiniLabel(s.tmin, showPersonalization ? Math.min(0, limitTemp) : 0)}
                                        </td>
                                        <td style="border:1px solid #000;">
                                            ${getTempMaxiLabel(s.tmax, showPersonalization ? limitTempMax : 99)}
                                        </td>
                                        <td style="border:1px solid #000;">
                                            ${getWindLabel(s.gustMax, showPersonalization ? Math.max(60, limitWind) : 60)}
                                        </td>
                                    </tr>
                                `;
            }).join('')}
                        </tbody>
                    </table>

                    <div style="margin-top:20px; padding:15px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px;">
                        <div style="font-weight:800; color:#003366; margin-bottom:5px; text-transform:uppercase; font-size:9pt;">RAPPEL DES SEUILS</div>
                        <div style="font-size:8pt; color:#475569;">
                            Pluie &ge; ${limitRain}mm | Gel &le; ${limitTemp}&deg;C | Vent &ge; ${limitWind}km/h | Chaleur &ge; ${limitTempMax}&deg;C
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    };

    const getDailySummaryHtml = () => {
        if (!globalData) return '';
        const sortedDaysK = Object.keys(globalData).sort();

        // Group by month
        const groups = {};
        sortedDaysK.forEach(k => {
            const m = k.substring(0, 7);
            if (!groups[m]) groups[m] = [];
            groups[m].push(k);
        });

        return Object.keys(groups).sort().map((monthK, index) => {
            const [year, month] = monthK.split('-');
            const monthName = new Date(year, month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

            return `
                <div class="cert-page">
                    <div class="cert-main-title-box" style="margin-bottom: 20px; border: 2px solid #000; padding: 10px; background: #fff;">
                        <h2 style="font-size: 13pt; margin:0; color:#003366; text-transform:uppercase; font-weight: 800;">ANNEXE 2 : RELEVÉS JOURNALIERS</h2>
                        <div style="font-size: 9.5pt; margin-top:5px; color:#64748b; font-weight:bold; text-transform: uppercase;">Mois de ${monthName}</div>
                    </div>

                    <table class="cert-table" style="border: 2px solid #000;">
                        <thead>
                            <tr style="background:#003366; color:white;">
                                <th style="border:1px solid #000;">DATE</th>
                                <th style="border:1px solid #000;">T. MIN (&deg;C)<br/><span style="font-size:6.5pt; font-weight:normal; opacity:0.85;">${cleanStationName(stationMeteoTemp || stationMeteo)}</span></th>
                                <th style="border:1px solid #000;">T. MAX (&deg;C)<br/><span style="font-size:6.5pt; font-weight:normal; opacity:0.85;">${cleanStationName(stationMeteoTemp || stationMeteo)}</span></th>
                                <th style="border:1px solid #000;">PLUIE (MM)<br/><span style="font-size:6.5pt; font-weight:normal; opacity:0.85;">${cleanStationName(stationMeteoRain || stationMeteoTemp || stationMeteo)}</span></th>
                                <th style="border:1px solid #000;">VENT MAX (KM/H)<br/><span style="font-size:6.5pt; font-weight:normal; opacity:0.85;">${cleanStationName(stationMeteoWind || stationMeteo)}</span></th>
                                <th style="border:1px solid #000;">STATUT</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${groups[monthK].map(dayK => {
                const day = globalData[dayK];
                const s = day.stats;
                const d = new Date(dayK);

                const isKo = s.rainTotal >= limitRain || s.tmin <= limitTemp || s.gustMax >= limitWind || s.tmax >= limitTempMax;
                const isStandardKo = s.rainTotal >= 10 || s.tmin <= 0 || s.gustMax >= 60 || (s.tmin <= 0 && s.rainTotal >= 1);
                const dayIsKo = showPersonalization ? (isStandardKo || isKo) : isStandardKo;

                return `
                                    <tr style="${dayIsKo ? 'background:#fff1f2;' : ''}">
                                        <td style="border:1px solid #000; font-weight:bold;">${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: '2-digit', year: 'numeric' })}</td>
                                        <td style="border:1px solid #000; ${s.tmin <= 0 ? 'color:red; font-weight:bold;' : ''}">${s.tmin.toFixed(1).replace('.', ',')}</td>
                                        <td style="border:1px solid #000;">${s.tmax.toFixed(1).replace('.', ',')}</td>
                                        <td style="border:1px solid #000; ${s.rainTotal >= 10 ? 'color:blue; font-weight:bold;' : ''}">${s.rainTotal.toFixed(1).replace('.', ',')}</td>
                                        <td style="border:1px solid #000; ${s.gustMax >= 60 ? 'color:#ea580c; font-weight:bold;' : ''}">${Math.round(s.gustMax)}</td>
                                        <td style="border:1px solid #000;">
                                            ${dayIsKo ? '<strong>INTEMPÉRIE</strong>' : '<span style="color:#64748b;">RAS</span>'}
                                        </td>
                                    </tr>
                                `;
            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }).join('');
    };

    const getChartsHtml = () => {
        if (!globalData || !showCharts) return '';
        return `
            <div class="cert-page">
                <div class="cert-main-title-box" style="margin-bottom: 20px; border: 2px solid #000; padding: 10px; background: #fff;">
                    <h2 style="font-size: 13pt; margin:0; color:#003366; text-transform:uppercase; font-weight: 800;">ANNEXE 3 : ÉVOLUTION GRAPHIQUE</h2>
                    <div style="font-size: 9.5pt; margin-top:5px; color:#64748b;">Postes de référence : ${getStationDisplay()}</div>
                </div>
                <div style="height: 500px; width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; background: #fff; box-sizing: border-box;">
                    <canvas id="cert-chart-main"></canvas>
                </div>
            </div>
        `;
    };

    // --- Génération globale ---
    const generateReport = () => {
        if (!globalData) {
            setReportOutput('<div style="padding:100px;text-align:center;color:#94a3b8;font-style:italic;">En attente de données...</div>');
            return;
        }

        const html = `
            ${getSynthesisHtml()}
            ${getClassificationHtml()}
            ${getDailySummaryHtml()}
            ${getChartsHtml()}
        `;

        setReportOutput(html);

        if (showCharts) {
            setTimeout(renderChart, 800);
        }
    };

    const renderChart = () => {
        if (!window.Chart || !globalData) {
            console.log("[Attestation] Chart.js non chargé ou pas de données");
            return;
        }

        const canvas = document.getElementById('cert-chart-main');
        if (!canvas) {
            console.warn("[Attestation] Canevas 'cert-chart-main' non trouvé dans le DOM");
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        console.log("[Attestation] Rendu du graphique en cours...");

        // On aplatit les données pour le graphique
        const allRows = [];
        Object.keys(globalData).sort().forEach(k => {
            allRows.push(...globalData[k].rows);
        });

        if (allRows.length === 0) return;

        const labels = allRows.map(r => {
            const d = new Date(r.time);
            return isPeriod ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + d.getHours() + 'h' : d.getHours() + 'h';
        });

        if (chartRefs.current['main']) {
            chartRefs.current['main'].destroy();
        }

        chartRefs.current['main'] = new window.Chart(ctx, {
            data: {
                labels,
                datasets: [
                    {
                        type: 'line',
                        label: 'Température (°C)',
                        data: allRows.map(r => r.temp),
                        borderColor: '#ea580c',
                        borderWidth: 2,
                        tension: 0.3,
                        yAxisID: 'y',
                        pointRadius: 2
                    },
                    {
                        type: 'bar',
                        label: 'Précipitations (mm)',
                        data: allRows.map(r => r.rain),
                        backgroundColor: '#3b82f6',
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: {
                    y: {
                        beginAtZero: false,
                        position: 'left',
                        title: { display: true, text: 'Température (°C)' },
                        grid: { color: '#f1f5f9' }
                    },
                    y1: {
                        beginAtZero: true,
                        position: 'right',
                        title: { display: true, text: 'Pluie (mm)' },
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { position: 'top' }
                }
            }
        });
    };

    // --- Helpers Rapport ---
    const getSeuilStatsHtml = () => {
        if (!globalData) return '';

        let html = '';

        // Section Standard
        html += `
            <tr style="background:#f1f5f9; font-weight:bold;">
                <td colspan="3" style="padding:6px; border:1px solid #cbd5e1; text-align:left;">SEUILS STANDARDS & NOUVEAUX</td>
            </tr>
            <tr>
                <td style="padding:6px; border:1px solid #e2e8f0; text-align:left;">Pluie (&ge; 1mm)</td>
                <td style="padding:6px; border:1px solid #e2e8f0;">&ge; 1 mm</td>
                <td style="padding:6px; border:1px solid #e2e8f0;">${Object.values(globalData).filter(d => d.stats.rainTotal >= 1).length} jours</td>
            </tr>
            <tr>
                <td style="padding:6px; border:1px solid #e2e8f0; text-align:left;">Pluie (&ge; 5mm)</td>
                <td style="padding:6px; border:1px solid #e2e8f0;">&ge; 5 mm</td>
                <td style="padding:6px; border:1px solid #e2e8f0;">${Object.values(globalData).filter(d => d.stats.rainTotal >= 5).length} jours</td>
            </tr>
            <tr>
                <td style="padding:6px; border:1px solid #e2e8f0; text-align:left;">Pluie Standard (&ge; 10mm)</td>
                <td style="padding:6px; border:1px solid #e2e8f0;">&ge; 10 mm</td>
                <td style="padding:6px; border:1px solid #e2e8f0;">${Object.values(globalData).filter(d => d.stats.rainTotal >= 10).length} jours</td>
            </tr>
            <tr>
                <td style="padding:6px; border:1px solid #e2e8f0; text-align:left;">Gel Standard (T &le; 0&deg;C)</td>
                <td style="padding:6px; border:1px solid #e2e8f0;">&le; 0 &deg;C</td>
                <td style="padding:6px; border:1px solid #e2e8f0;">${Object.values(globalData).filter(d => d.stats.tmin <= 0).length} jours</td>
            </tr>
            <tr>
                <td style="padding:6px; border:1px solid #e2e8f0; text-align:left;">Gel (T &le; -5&deg;C)</td>
                <td style="padding:6px; border:1px solid #e2e8f0;">&le; -5 &deg;C</td>
                <td style="padding:6px; border:1px solid #e2e8f0;">${Object.values(globalData).filter(d => d.stats.tmin <= -5).length} jours</td>
            </tr>
            <tr>
                <td style="padding:6px; border:1px solid #e2e8f0; text-align:left;">Vent (Rafales &ge; 40km/h)</td>
                <td style="padding:6px; border:1px solid #e2e8f0;">&ge; 40 km/h</td>
                <td style="padding:6px; border:1px solid #e2e8f0;">${Object.values(globalData).filter(d => d.stats.gustMax >= 40).length} jours</td>
            </tr>
            <tr>
                <td style="padding:6px; border:1px solid #e2e8f0; text-align:left;">Vent Standard (Rafales &ge; 60km/h)</td>
                <td style="padding:6px; border:1px solid #e2e8f0;">&ge; 60 km/h</td>
                <td style="padding:6px; border:1px solid #e2e8f0;">${Object.values(globalData).filter(d => d.stats.gustMax >= 60).length} jours</td>
            </tr>
            <tr>
                <td style="padding:6px; border:1px solid #e2e8f0; text-align:left;">Neige (T &le; 0&deg;C + Précip. &ge; 1mm)<br/><small style="color:#64748b;">(Règle: 1 mm précip. = 1 cm neige)</small></td>
                <td style="padding:6px; border:1px solid #e2e8f0;">T &le; 0&deg;C + R &ge; 1</td>
                <td style="padding:6px; border:1px solid #e2e8f0;">${Object.values(globalData).filter(d => d.stats.tmin <= 0 && d.stats.rainTotal >= 1).length} jours</td>
            </tr>
        `;

        if (showPersonalization) {
            let nbRainLimit = 0;
            let nbGelLimit = 0;
            let nbVentLimit = 0;
            let nbHotLimit = 0;

            Object.values(globalData).forEach(day => {
                const s = day.stats;
                if (s.rainTotal >= limitRain) nbRainLimit++;
                if (s.tmin <= limitTemp) nbGelLimit++;
                if (s.gustMax >= limitWind) nbVentLimit++;
                if (s.tmax >= limitTempMax) nbHotLimit++;
            });

            // Section PERSONNALISATION
            html += `
                <tr style="background:#f1f5f9; font-weight:bold;">
                    <td colspan="3" style="padding:6px; border:1px solid #cbd5e1; text-align:left; text-transform:uppercase;">PERSONNALISATION</td>
                </tr>
                <tr>
                    <td style="padding:6px; border:1px solid #e2e8f0; text-align:left;">Force du Vent Option</td>
                    <td style="padding:6px; border:1px solid #e2e8f0;">rafales >= ${limitWind} km/h</td>
                    <td style="padding:6px; border:1px solid #e2e8f0;">${nbVentLimit} jours</td>
                </tr>
                <tr>
                    <td style="padding:6px; border:1px solid #e2e8f0; text-align:left;">Precipitation Option</td>
                    <td style="padding:6px; border:1px solid #e2e8f0;">>= ${limitRain} mm</td>
                    <td style="padding:6px; border:1px solid #e2e8f0;">${nbRainLimit} jours</td>
                </tr>
                <tr>
                    <td style="padding:6px; border:1px solid #e2e8f0; text-align:left;">Temperature Mini Option</td>
                    <td style="padding:6px; border:1px solid #e2e8f0;">&le; ${limitTemp.toString().padStart(2, '0')} °C</td>
                    <td style="padding:6px; border:1px solid #e2e8f0;">${nbGelLimit} jours</td>
                </tr>
                <tr>
                    <td style="padding:6px; border:1px solid #e2e8f0; text-align:left;">Canicule</td>
                    <td style="padding:6px; border:1px solid #e2e8f0;">&ge; ${limitTempMax} °C</td>
                    <td style="padding:6px; border:1px solid #e2e8f0;">${nbHotLimit} ${nbHotLimit > 1 ? 'jours' : 'jour'}</td>
                </tr>
            `;
        }

        return html;
    };

    const countIntemperieDays = () => {
        if (!globalData) return 0;
        return Object.entries(globalData).filter(([dk, day]) => {
            const d = new Date(dk);
            if (excludeWeekends && (d.getDay() === 0 || d.getDay() === 6)) return false;

            const s = day.stats;
            const standard = s.rainTotal >= 10 || s.tmin <= 0 || s.gustMax >= 60 || (s.tmin <= 0 && s.rainTotal >= 1);
            if (!showPersonalization) return standard;
            return standard || s.rainTotal >= limitRain || s.tmin <= limitTemp || s.gustMax >= limitWind || s.tmax >= limitTempMax;
        }).length;
    };

    const generateAutoConclusion = () => {
        if (!globalData) return "";

        const stats = { all: 0, rain: 0, freeze: 0, wind: 0, heat: 0, snow: 0, saturday: 0, sunday: 0 };

        Object.keys(globalData).sort().forEach(dayK => {
            const day = globalData[dayK];
            const s = day.stats;
            const d = new Date(dayK);
            const dow = d.getDay();

            if (excludeWeekends && (dow === 0 || dow === 6)) return;

            const isRain = s.rainTotal >= (showPersonalization ? limitRain : 10);
            const isFreeze = s.tmin <= (showPersonalization ? limitTemp : 0);
            const isWind = s.gustMax >= (showPersonalization ? limitWind : 60);
            const isHeat = s.tmax >= limitTempMax;
            const isSnow = s.tmin <= 0 && s.rainTotal >= 1;

            const isIntemp = isRain || isFreeze || isWind || isHeat || isSnow;

            if (isIntemp) {
                stats.all++;
                if (isWind) stats.wind++;
                if (isRain) stats.rain++;
                if (isFreeze) stats.freeze++;
                if (showPersonalization && isHeat) stats.heat++;
                if (isSnow) stats.snow++;
                if (dow === 6) stats.saturday++;
                if (dow === 0) stats.sunday++;
            }
        });

        let heatTxt = showPersonalization ? `, ${stats.heat} jour(s) de canicule` : '';
        let txt = `On retiendra ${stats.all} jour(s) avec des intempéries météo cumulées, dont ${stats.wind} jour(s) avec rafales, ${stats.rain} jour(s) avec de fortes pluies, ${stats.freeze} jour(s) avec de fortes gelées${heatTxt}, ${stats.snow} jour(s) de neige (calculés sur la base de 1 mm de précipitations pour 1 cm de neige)`;

        if (!excludeWeekends) {
            txt += `, dont ${stats.saturday} Samedi et ${stats.sunday} Dimanche`;
        }

        txt += `. Rappel : attention il peut y avoir deux intempéries pour la même journée (ex : vents supérieurs à 60 km/h et fortes pluies) donc le classement prend en compte ces doublons et ne retient que ${stats.all} jour(s) effectif(s). Base de données telle que disponible en ce jour. Ce document a pour faire valoir ce que de droit. Le sinistre en référence peut être classé comme suit :`;

        return txt;
    };

    const generateAttestationConclusion = () => {
        return expertConclusion || generateAutoConclusion();
    };

    const printContent = (contentHtml) => {
        try {
            const existingFrame = document.getElementById('btp-print-iframe');
            if (existingFrame) existingFrame.remove();

            const iframe = document.createElement('iframe');
            iframe.id = 'btp-print-iframe';
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';
            iframe.style.visibility = 'hidden';
            document.body.appendChild(iframe);

            const doc = iframe.contentWindow?.document || iframe.contentDocument;
            if (!doc) {
                fallbackPopupPrint(contentHtml);
                return;
            }

            doc.open();
            doc.write(`<!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>Attestation d'Intempéries - Météo Climat Pro</title>
                    ${getCommonStyles()}
                </head>
                <body>
                    ${contentHtml}
                </body>
                </html>`);
            doc.close();

            setTimeout(() => {
                try {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                } catch (e) {
                    console.warn("Iframe print bloqué, passage en popup:", e);
                    fallbackPopupPrint(contentHtml);
                }
            }, 400);
        } catch (e) {
            console.error("Erreur iframe print:", e);
            fallbackPopupPrint(contentHtml);
        }
    };

    const fallbackPopupPrint = (contentHtml) => {
        try {
            const win = window.open('', '_blank');
            if (!win) {
                // Fallback direct sur l'impression de la page actuelle
                window.print();
                return;
            }
            win.document.open();
            win.document.write(`<!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>Attestation d'Intempéries</title>
                    ${getCommonStyles()}
                </head>
                <body>
                    ${contentHtml}
                </body>
                </html>`);
            win.document.close();
            setTimeout(() => {
                win.focus();
                win.print();
            }, 600);
        } catch (err) {
            console.error("Fallback popup error:", err);
            window.print();
        }
    };

    const handlePrintPart = (part) => {
        if (!globalData) return;
        let content = '';
        let needsChart = false;

        if (part === 'synthesis') content = getSynthesisHtml();
        else if (part === 'classification') content = getClassificationHtml();
        else if (part === 'daily') content = getDailySummaryHtml();
        else if (part === 'charts') {
            content = getChartsHtml();
            needsChart = true;
        } else {
            // All
            content = `
                ${getSynthesisHtml()}
                ${getClassificationHtml()}
                ${getDailySummaryHtml()}
                ${getChartsHtml()}
            `;
            needsChart = showCharts;
        }

        if (needsChart) {
            try {
                const canvas = document.getElementById('cert-chart-main');
                if (canvas) {
                    const chartImg = canvas.toDataURL('image/png', 1.0);
                    content = content.replace(
                        /<canvas[^>]*id=\"cert-chart-main\"[^>]*><\/canvas>/i,
                        `<img src="${chartImg}" style="width:100%; height:auto; display:block; margin: 0 auto;" />`
                    );
                }
            } catch (err) {
                console.warn("Canvas export warning:", err);
            }
        }

        printContent(content);
    };

    const handlePrint = () => handlePrintPart('all');

    const handleExportPDF = async () => {
        if (!globalData) return;
        setStatus('⏳ Préparation du téléchargement PDF...');
        try {
            const previewEl = document.querySelector('.btp-full-report-preview');
            if (!previewEl) {
                handlePrint();
                return;
            }

            const pages = previewEl.querySelectorAll('.cert-page');
            if (!pages || pages.length === 0) {
                handlePrint();
                return;
            }

            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = 210;
            const pdfHeight = 297;

            for (let i = 0; i < pages.length; i++) {
                if (i > 0) pdf.addPage('a4', 'p');
                setStatus(`⏳ Rendu PDF : page ${i + 1} sur ${pages.length}...`);
                const pageCanvas = await html2canvas(pages[i], {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff'
                });
                const imgData = pageCanvas.toDataURL('image/jpeg', 0.95);
                pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            }

            const safeCity = (clientCity || 'Site').replace(/[^a-zA-Z0-9_-]/g, '_');
            const fileName = `Attestation_${safeCity}_${startDate}_${refDossier || 'Dossier'}.pdf`;
            pdf.save(fileName);
            setStatus('✅ Attestation PDF téléchargée avec succès !');
        } catch (e) {
            console.error("Erreur génération PDF:", e);
            setStatus("⚠️ Échec du téléchargement PDF. Ouverture de la fenêtre d'impression...");
            handlePrint();
        }
    };

    const handleSaveToDB = async () => {
        if (!globalData) return;
        setStatus('⏳ Enregistrement...');
        try {
            const count = countIntemperieDays();
            const payload = {
                ville: clientCity,
                periode_debut: startDate,
                periode_fin: isPeriod ? endDate : startDate,
                station: selectedStationId,
                type_document: parseInt(docType),
                seuils_json: { 
                    rain: limitRain, 
                    temp: limitTemp, 
                    wind: limitWind,
                    stationMeteo,
                    stationMeteoTemp,
                    stationMeteoRain,
                    stationMeteoWind,
                    selectedStationIdTemp,
                    selectedStationIdRain,
                    selectedStationIdWind,
                    deptTemp,
                    deptRain,
                    deptWind,
                    showDetailedStations
                },
                nb_jours_intemperies: count,
                date_generation: new Date()
            };

            const { error } = await supabase.from('attestations_intemperies').insert([payload]);
            if (error) throw error;
            setStatus('✅ Enregistré en base avec succès.');
        } catch (e) {
            console.error(e);
            setStatus('❌ Erreur : ' + e.message);
        }
    };

    const fetchArchives = async () => {
        setLoadingArchives(true);
        try {
            const { data, error } = await supabase
                .from('attestations_intemperies')
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
        if (!window.confirm("Voulez-vous vraiment supprimer cette archive ? Cette action est irréversible.")) return;

        try {
            const { error } = await supabase
                .from('attestations_intemperies')
                .delete()
                .eq('id', id);

            if (error) throw error;

            // Refresh local list
            setArchives(archives.filter(a => a.id !== id));
            setStatus('🗑️ Archive supprimée avec succès.');
        } catch (e) {
            console.error(e);
            alert("Erreur lors de la suppression de l'archive");
        }
    };

    const loadArchive = (a) => {
        setClientCity(a.ville || '');
        setStartDate(a.periode_debut || '');
        setEndDate(a.periode_fin || '');
        setIsPeriod(a.periode_debut !== a.periode_fin);
        setSelectedStationId(a.station || '');
        setDocType(a.type_document?.toString() || '1');
        // On pourrait aussi recharger les seuils si stockés
        if (a.seuils_json) {
            setLimitRain(a.seuils_json.rain || 10);
            setLimitTemp(a.seuils_json.temp || 0);
            setLimitWind(a.seuils_json.wind || 60);
            if (a.seuils_json.stationMeteo) setStationMeteo(a.seuils_json.stationMeteo);
            if (a.seuils_json.stationMeteoTemp) setStationMeteoTemp(a.seuils_json.stationMeteoTemp);
            if (a.seuils_json.stationMeteoRain) setStationMeteoRain(a.seuils_json.stationMeteoRain);
            if (a.seuils_json.stationMeteoWind) setStationMeteoWind(a.seuils_json.stationMeteoWind);
            if (a.seuils_json.selectedStationIdTemp) setSelectedStationIdTemp(a.seuils_json.selectedStationIdTemp);
            if (a.seuils_json.selectedStationIdRain) setSelectedStationIdRain(a.seuils_json.selectedStationIdRain);
            if (a.seuils_json.selectedStationIdWind) setSelectedStationIdWind(a.seuils_json.selectedStationIdWind);
            if (a.seuils_json.deptTemp) setDeptTemp(a.seuils_json.deptTemp);
            if (a.seuils_json.deptRain) setDeptRain(a.seuils_json.deptRain);
            if (a.seuils_json.deptWind) setDeptWind(a.seuils_json.deptWind);
            if (a.seuils_json.showDetailedStations !== undefined) setShowDetailedStations(a.seuils_json.showDetailedStations);
        }
        setShowArchivesModal(false);
        setStatus(`📂 Archive chargée : ${a.ville} (${a.periode_debut})`);
    };

    return (
        <div className="btp-manager-body">
            <div style={{ position: 'fixed', bottom: 10, left: 10, fontSize: '10px', color: '#94a3b8', zIndex: 1000, pointerEvents: 'none' }}>Attestation v1.4.3</div>
            <div className="btp-layout">
                {/* SIDEBAR (Configuration) */}
                <div className="btp-panel no-print btp-sidebar-scroll">
                    <div className="flex justify-between items-center mb-15">
                        <button className="text-xs font-bold text-blue-600 bg-blue-50 px-10 py-5 rounded border border-blue-200 hover:bg-blue-100 transition-all flex items-center gap-2" onClick={fetchArchives}>
                            <Briefcase size={14} /> Consulter les Archives
                        </button>
                    </div>
                    <div className="btp-panel-head cursor-pointer hover:bg-slate-100/50 transition-all p-5 rounded" onClick={() => setPanelOpen(prev => ({ ...prev, client: !prev.client }))}>
                        <div className="flex items-center">
                            <div className="btp-step-num">1</div>
                            <div className="btp-panel-title">Localisation & Client</div>
                        </div>
                        <span className="text-xs text-slate-400 font-bold">{panelOpen.client ? '▼' : '►'}</span>
                    </div>
                    {panelOpen.client && (
                        <div className="btp-form-grid">
                            <div className="btp-form-group">
                                <label>Nom du Client</label>
                                <input type="text" placeholder="Ex: Grégory Langlet" value={clientName} onChange={e => setClientName(e.target.value)} />
                            </div>
                            <div className="btp-form-group">
                                <label>Nom du Chantier</label>
                                <input type="text" placeholder="Ex: Résidence Les Chênes" value={projectName} onChange={e => setProjectName(e.target.value)} />
                            </div>
                            <div className="btp-form-group">
                                <label>Adresse du site</label>
                                <input type="text" placeholder="Ex: 41 Rue Des Perdreaux" value={clientAddress} onChange={e => setClientAddress(e.target.value)} />
                            </div>
                            <div className="btp-form-grid btp-cols-2">
                                <div className="btp-form-group">
                                    <label>Code Postal</label>
                                    <input type="text" placeholder="59000" value={clientZip} onChange={e => setClientZip(e.target.value)} />
                                </div>
                                <div className="btp-form-group">
                                    <label>Ville</label>
                                    <input type="text" placeholder="LILLE" value={clientCity} onChange={e => setClientCity(e.target.value)} />
                                </div>
                            </div>
                            <div className="btp-form-grid btp-cols-2">
                                <div className="btp-form-group">
                                    <label>Email</label>
                                    <input type="text" value={clientEmail} onChange={e => setClientEmail(e.target.value)} />
                                </div>
                                <div className="btp-form-group">
                                    <label>Téléphone</label>
                                    <input type="text" value={clientPhone} onChange={e => setClientPhone(e.target.value)} />
                                </div>
                            </div>
                            <div className="btp-form-group">
                                <label>Référence Dossier</label>
                                <input type="text" value={refDossier} onChange={e => setRefDossier(e.target.value)} />
                            </div>
                        </div>
                    )}

                    <div className="btp-panel-head mt-20 cursor-pointer hover:bg-slate-100/50 transition-all p-5 rounded" onClick={() => setPanelOpen(prev => ({ ...prev, period: !prev.period }))}>
                        <div className="flex items-center">
                            <div className="btp-step-num">2</div>
                            <div className="btp-panel-title">Période & Station</div>
                        </div>
                        <span className="text-xs text-slate-400 font-bold">{panelOpen.period ? '▼' : '►'}</span>
                    </div>
                    {panelOpen.period && (
                        <div className="btp-form-grid">
                            <div className="btp-form-group">
                                <label className="flex items-center gap-2 cursor-pointer mb-10" style={{ textTransform: 'none', color: 'var(--primary)', fontSize: '0.9rem' }}>
                                    <input type="checkbox" checked={isPeriod} onChange={e => setIsPeriod(e.target.checked)} style={{ width: '18px', height: '18px', margin: 0 }} />
                                    <strong>Période de plusieurs jours</strong>
                                </label>
                            </div>

                            <div className={`btp-form-grid ${isPeriod ? 'btp-cols-2' : ''}`}>
                                <div className="btp-form-group">
                                    <label>{isPeriod ? 'Date de Début' : 'Date d\'observation'}</label>
                                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                                </div>
                                {isPeriod && (
                                    <div className="btp-form-group">
                                        <label>Date de Fin</label>
                                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                                    </div>
                                )}
                            </div>

                            <div className="btp-form-group mt-10">
                                <label>Département</label>
                                <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)}>
                                    <option value="">Choisir un département</option>
                                    {DEPARTMENTS.map(d => <option key={d.code} value={d.code}>{d.code} - {d.name}</option>)}
                                </select>
                            </div>
                            <div className="btp-form-group">
                                <label>Station Météo de référence</label>
                                <select value={selectedStationId} onChange={(e) => {
                                    const val = e.target.value;
                                    setSelectedStationId(val);
                                    const name = stationNames[val] || val;
                                    const clean = cleanStationName(name);
                                    setStationMeteo(clean);
                                    if (!showDetailedStations) {
                                        setSelectedStationIdTemp(val);
                                        setSelectedStationIdRain(val);
                                        setSelectedStationIdWind(val);
                                        setStationMeteoTemp(clean);
                                        setStationMeteoRain(clean);
                                        setStationMeteoWind(clean);
                                    }
                                }} disabled={loadingStations}>
                                    <option value="">{loadingStations ? 'Chargement...' : '-- Sélectionner une station --'}</option>
                                    {stations.map(s => <option key={s.station_id} value={s.station_id}>{stationNames[s.station_id] || s.station_id} ({s.station_id})</option>)}
                                </select>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', marginBottom: '8px' }}>
                                <input 
                                    type="checkbox" 
                                    id="chk-show-detailed-stations"
                                    checked={showDetailedStations} 
                                    onChange={(e) => {
                                        const checked = e.target.checked;
                                        setShowDetailedStations(checked);
                                        const defaultSingle = stationNames[selectedStationId] ? cleanStationName(stationNames[selectedStationId]) : (cleanStationName(stationMeteo) || '');
                                        if (checked) {
                                            if (!selectedStationIdTemp) setSelectedStationIdTemp(selectedStationId);
                                            if (!selectedStationIdRain) setSelectedStationIdRain(selectedStationId);
                                            if (!selectedStationIdWind) setSelectedStationIdWind(selectedStationId);
                                            if (!stationMeteoTemp || stationMeteoTemp.includes('Temp:')) setStationMeteoTemp(defaultSingle);
                                            if (!stationMeteoRain || stationMeteoRain.includes('Temp:')) setStationMeteoRain(defaultSingle);
                                            if (!stationMeteoWind || stationMeteoWind.includes('Temp:')) setStationMeteoWind(defaultSingle);
                                        } else {
                                            setSelectedStationIdTemp(selectedStationId);
                                            setSelectedStationIdRain(selectedStationId);
                                            setSelectedStationIdWind(selectedStationId);
                                            setStationMeteo(defaultSingle);
                                            setStationMeteoTemp(defaultSingle);
                                            setStationMeteoRain(defaultSingle);
                                            setStationMeteoWind(defaultSingle);
                                        }
                                    }} 
                                />
                                <label htmlFor="chk-show-detailed-stations" style={{ fontSize: '0.85rem', cursor: 'pointer', fontWeight: '600', color: '#1e293b' }}>
                                    Différencier le poste de référence pour le vent (2 postes)
                                </label>
                            </div>

                            {!showDetailedStations ? (
                                <div className="btp-form-group">
                                    <label>Désignation station (Éditable)</label>
                                    <input
                                        type="text"
                                        value={stationMeteo}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setStationMeteo(val);
                                            setStationMeteoTemp(val);
                                            setStationMeteoRain(val);
                                            setStationMeteoWind(val);
                                        }}
                                        placeholder="Nom de la station tel qu'il apparaîtra"
                                    />
                                </div>
                            ) : (
                                <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', boxSizing: 'border-box' }}>
                                    
                                    {/* Encadré d'aide et recommandation Chantonnay / Vendée */}
                                    {((selectedDept === '85' || deptTemp === '85' || deptWind === '85') || (selectedStationId === '85051001')) && (
                                        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '10px 12px', fontSize: '0.78rem', color: '#1e3a8a', lineHeight: 1.4 }}>
                                            <div style={{ fontWeight: '700', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                💡 Configuration recommandée pour Chantonnay (85) :
                                            </div>
                                            <div style={{ fontSize: '0.76rem', color: '#334155', marginBottom: '6px' }}>
                                                • <strong>Température & Pluie :</strong> CHANTONNAY (0.3 km)<br/>
                                                • <strong>Vent avec anémomètre :</strong> <strong>POUZAUGES SA (20.9 km)</strong> ou <strong>LA ROCHE SUR YON (25.4 km)</strong>
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        setSelectedStationIdTemp('85051001');
                                                        setSelectedStationIdRain('85051001');
                                                        setStationMeteoTemp('CHANTONNAY');
                                                        setStationMeteoRain('CHANTONNAY');
                                                        setSelectedStationIdWind('85182004');
                                                        setStationMeteoWind('POUZAUGES SA');
                                                        setDeptTemp('85');
                                                        setDeptRain('85');
                                                        setDeptWind('85');
                                                    }}
                                                    style={{ background: '#16a34a', color: '#ffffff', border: 'none', borderRadius: '4px', padding: '5px 10px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
                                                >
                                                    ⚡ 1. Vent : Pouzauges SA (20.9 km - plus proche)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        setSelectedStationIdTemp('85051001');
                                                        setSelectedStationIdRain('85051001');
                                                        setStationMeteoTemp('CHANTONNAY');
                                                        setStationMeteoRain('CHANTONNAY');
                                                        setSelectedStationIdWind('85191003');
                                                        setStationMeteoWind('LA ROCHE SUR YON');
                                                        setDeptTemp('85');
                                                        setDeptRain('85');
                                                        setDeptWind('85');
                                                    }}
                                                    style={{ background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '4px', padding: '5px 10px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
                                                >
                                                    ⚡ 2. Vent : La Roche-sur-Yon (25.4 km - Synoptique)
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* POSTE 1 : TEMPÉRATURE & PRÉCIPITATIONS (PLUIE) */}
                                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', boxSizing: 'border-box' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Thermometer size={14} style={{ color: '#f59e0b' }} /> <CloudRain size={14} style={{ color: '#3b82f6' }} /> Température & Pluie
                                            </label>
                                            <select
                                                style={{ fontSize: '0.75rem', padding: '2px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#ffffff', color: '#475569', maxWidth: '140px' }}
                                                value={deptTemp || selectedDept}
                                                onChange={async (e) => {
                                                    const d = e.target.value;
                                                    setDeptTemp(d);
                                                    setDeptRain(d);
                                                    const sts = await getStationsForDept(d);
                                                    setStationsTemp(sts);
                                                    setStationsRain(sts);
                                                }}
                                            >
                                                {DEPARTMENTS.map(d => <option key={d.code} value={d.code}>{d.code} - {d.name}</option>)}
                                            </select>
                                        </div>
                                        <select
                                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.8rem', background: '#ffffff', boxSizing: 'border-box' }}
                                            value={selectedStationIdTemp || selectedStationId}
                                            onChange={(e) => {
                                                const sid = e.target.value;
                                                setSelectedStationIdTemp(sid);
                                                setSelectedStationIdRain(sid);
                                                const name = stationNames[sid] || sid;
                                                const cleanName = cleanStationName(name);
                                                setStationMeteoTemp(cleanName);
                                                setStationMeteoRain(cleanName);
                                            }}
                                        >
                                            <option value="">-- Choisir le poste (Température & Pluie) --</option>
                                            {stationsTemp.map(s => (
                                                <option key={s.station_id} value={s.station_id}>
                                                    {stationNames[s.station_id] || s.nom_station || s.station_id} ({s.station_id})
                                                </option>
                                            ))}
                                        </select>
                                        <input 
                                            type="text"
                                            style={{ width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.78rem', color: '#475569', background: '#f8fafc', boxSizing: 'border-box' }}
                                            value={stationMeteoTemp} 
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setStationMeteoTemp(val);
                                                setStationMeteoRain(val);
                                            }} 
                                            placeholder="Nom du poste affiché (ex: CHANTONNAY)..." 
                                        />
                                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontStyle: 'italic', marginTop: '2px' }}>
                                            * Utilisé pour la température mini/maxi et le cumul de pluie.
                                        </div>
                                    </div>

                                    {/* POSTE 2 : VENT & RAFALES */}
                                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', boxSizing: 'border-box' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Wind size={14} style={{ color: '#0d9488' }} /> Vent & Rafales
                                            </label>
                                            <select
                                                style={{ fontSize: '0.75rem', padding: '2px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#ffffff', color: '#475569', maxWidth: '140px' }}
                                                value={deptWind || selectedDept}
                                                onChange={async (e) => {
                                                    const d = e.target.value;
                                                    setDeptWind(d);
                                                    const sts = await getStationsForDept(d);
                                                    setStationsWind(sts);
                                                }}
                                            >
                                                {DEPARTMENTS.map(d => <option key={d.code} value={d.code}>{d.code} - {d.name}</option>)}
                                            </select>
                                        </div>
                                        <select
                                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.8rem', background: '#ffffff', boxSizing: 'border-box' }}
                                            value={selectedStationIdWind || selectedStationId}
                                            onChange={(e) => {
                                                const sid = e.target.value;
                                                setSelectedStationIdWind(sid);
                                                const name = stationNames[sid] || sid;
                                                const cleanName = cleanStationName(name);
                                                setStationMeteoWind(cleanName);
                                            }}
                                        >
                                            <option value="">-- Choisir le poste (Vent & Rafales) --</option>
                                            {stationsWind.map(s => (
                                                <option key={s.station_id} value={s.station_id}>
                                                    {stationNames[s.station_id] || s.nom_station || s.station_id} ({s.station_id})
                                                </option>
                                            ))}
                                        </select>
                                        <input 
                                            type="text"
                                            style={{ width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.78rem', color: '#475569', background: '#f8fafc', boxSizing: 'border-box' }}
                                            value={stationMeteoWind} 
                                            onChange={(e) => setStationMeteoWind(e.target.value)} 
                                            placeholder="Nom du poste vent affiché (ex: POUZAUGES SA)..." 
                                        />
                                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontStyle: 'italic', marginTop: '2px' }}>
                                            * Sélectionner une station équipée d'un anémomètre (ex: Pouzauges SA, La Roche-sur-Yon).
                                        </div>
                                    </div>
                                </div>
                            )}

                            <button className="btp-btn btp-btn-primary mt-10" onClick={handleFetchData}>
                                <Download size={18} /> Charger (Météo-France)
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
                                    style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #10b981' }}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <FileText size={18} /> Importer un fichier CSV (Données BTP)
                                </button>
                            </div>

                            <div className="mt-10 p-10 border rounded text-sm bg-slate-50" dangerouslySetInnerHTML={{ __html: status || '<span style="color:#94a3b8">Aucune donnée chargée</span>' }} />
                        </div>
                    )}

                    <div className="btp-panel-head mt-20 cursor-pointer hover:bg-slate-100/50 transition-all p-5 rounded" onClick={() => setPanelOpen(prev => ({ ...prev, thresholds: !prev.thresholds }))}>
                        <div className="flex items-center">
                            <div className="btp-step-num">3</div>
                            <div className="btp-panel-title">Paramètres & Seuils</div>
                        </div>
                        <span className="text-xs text-slate-400 font-bold">{panelOpen.thresholds ? '▼' : '►'}</span>
                    </div>
                    {panelOpen.thresholds && (
                        <div className="btp-form-grid">
                            <div className="btp-form-grid btp-cols-3">
                                <div className="btp-form-group">
                                    <label><CloudRain size={12} /> Pluie (mm)</label>
                                    <input type="number" value={limitRain} onChange={e => setLimitRain(parseFloat(e.target.value))} />
                                </div>
                                <div className="btp-form-group">
                                    <label><Thermometer size={12} /> Gel (min)</label>
                                    <input type="number" value={limitTemp} onChange={e => setLimitTemp(parseFloat(e.target.value))} />
                                </div>
                                <div className="btp-form-group">
                                    <label><Thermometer size={12} /> Canicule (max)</label>
                                    <input type="number" value={limitTempMax} onChange={e => setLimitTempMax(parseFloat(e.target.value))} />
                                </div>
                            </div>
                            <div className="btp-form-grid btp-cols-2 mt-10">
                                <div className="btp-form-group">
                                    <label><Wind size={12} /> Vent (km/h)</label>
                                    <input type="number" value={limitWind} onChange={e => setLimitWind(parseFloat(e.target.value))} />
                                </div>
                            </div>

                            <div className="btp-form-group mt-10">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={showCharts} onChange={e => setShowCharts(e.target.checked)} style={{ width: '18px', height: '18px', margin: 0 }} />
                                    <span>Inclure Graphique Annexe</span>
                                </label>
                            </div>
                            <div className="btp-form-group mt-10">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={showPersonalization} onChange={e => setShowPersonalization(e.target.checked)} style={{ width: '18px', height: '18px', margin: 0 }} />
                                    <span>Activer Personnalisation Seuils</span>
                                </label>
                            </div>
                            <div className="btp-form-group mt-10">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={excludeWeekends} onChange={e => setExcludeWeekends(e.target.checked)} style={{ width: '18px', height: '18px', margin: 0 }} />
                                    <span>Exclure Samedi/Dimanche (Repos hebdo.)</span>
                                </label>
                            </div>
                        </div>
                    )}

                    <div className="btp-panel-head mt-20 cursor-pointer hover:bg-slate-100/50 transition-all p-5 rounded" onClick={() => setPanelOpen(prev => ({ ...prev, conclusion: !prev.conclusion }))}>
                        <div className="flex items-center">
                            <div className="btp-step-num">4</div>
                            <div className="btp-panel-title">Conclusion de l'Expert</div>
                        </div>
                        <span className="text-xs text-slate-400 font-bold">{panelOpen.conclusion ? '▼' : '►'}</span>
                    </div>
                    {panelOpen.conclusion && (
                        <div className="p-15 bg-white border rounded">
                            <textarea
                                className="w-full text-sm p-10 border rounded font-sans leading-relaxed focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none"
                                style={{ minHeight: '200px', width: '100%', resize: 'vertical' }}
                                value={expertConclusion}
                                onChange={e => {
                                    setExpertConclusion(e.target.value);
                                    setIsConclusionManual(true);
                                }}
                                placeholder="La conclusion s'affichera ici après le chargement des données..."
                            />
                            <button
                                className="text-xs text-blue-600 mt-5 font-bold hover:underline flex items-center gap-1"
                                onClick={() => {
                                    setIsConclusionManual(false);
                                    setExpertConclusion(generateAutoConclusion());
                                }}
                            >
                                <Eraser size={12} /> Réinitialiser (Auto-générer)
                            </button>
                        </div>
                    )}

                    <div className="btp-panel-head mt-20 cursor-pointer hover:bg-slate-100/50 transition-all p-5 rounded" onClick={() => setPanelOpen(prev => ({ ...prev, classification: !prev.classification }))}>
                        <div className="flex items-center">
                            <div className="btp-step-num">5</div>
                            <div className="btp-panel-title">Classement</div>
                        </div>
                        <span className="text-xs text-slate-400 font-bold">{panelOpen.classification ? '▼' : '►'}</span>
                    </div>
                    {panelOpen.classification && (
                        <div className="p-15 bg-white border rounded">
                            <textarea
                                className="w-full text-sm p-10 border rounded font-sans leading-relaxed focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none"
                                style={{ minHeight: '100px', width: '100%', resize: 'vertical' }}
                                value={customClassification}
                                onChange={e => setCustomClassification(e.target.value)}
                                placeholder="Saisissez ici le classement manuel..."
                            />
                        </div>
                    )}

                    <div className="mt-20 flex flex-col gap-5">
                        <label className="text-xs font-bold text-slate-500 uppercase">Documents à l'unité</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', padding: '0 5px' }}>
                            <button className="btp-btn btp-btn-print" style={{ padding: '15px 5px', minHeight: '80px' }} onClick={() => handlePrintPart('synthesis')} disabled={!globalData}>
                                <div className="flex flex-col items-center gap-2">
                                    <FileText size={24} />
                                    <span style={{ fontSize: '11px', fontWeight: 'bold' }}>Synthèse</span>
                                </div>
                            </button>
                            <button className="btp-btn btp-btn-print" style={{ padding: '15px 5px', minHeight: '80px' }} onClick={() => handlePrintPart('classification')} disabled={!globalData}>
                                <div className="flex flex-col items-center gap-2">
                                    <ShieldCheck size={24} />
                                    <span style={{ fontSize: '11px', fontWeight: 'bold' }}>Dossier</span>
                                </div>
                            </button>
                            <button className="btp-btn btp-btn-print" style={{ padding: '15px 5px', minHeight: '80px' }} onClick={() => handlePrintPart('daily')} disabled={!globalData}>
                                <div className="flex flex-col items-center gap-2">
                                    <Calendar size={24} />
                                    <span style={{ fontSize: '11px', fontWeight: 'bold' }}>Relevés</span>
                                </div>
                            </button>
                            <button className="btp-btn btp-btn-print" style={{ padding: '15px 5px', minHeight: '80px' }} onClick={() => handlePrintPart('charts')} disabled={!globalData}>
                                <div className="flex flex-col items-center gap-2">
                                    <CloudRain size={24} />
                                    <span style={{ fontSize: '11px', fontWeight: 'bold' }}>Graphique</span>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="mt-20 flex flex-col gap-10">
                        <button className="btp-btn btp-btn-print" onClick={handlePrint} disabled={!globalData}>
                            <Printer size={18} /> Tout Imprimer (Pack Complet)
                        </button>
                        <button 
                            className="btp-btn" 
                            style={{ background: '#0284c7', color: '#ffffff', border: 'none', padding: '10px 14px', borderRadius: '6px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: globalData ? 'pointer' : 'not-allowed', opacity: globalData ? 1 : 0.6 }} 
                            onClick={handleExportPDF} 
                            disabled={!globalData}
                        >
                            <Download size={18} /> Télécharger en PDF (.pdf)
                        </button>
                        <button className="btp-btn btp-btn-save" onClick={handleSaveToDB} disabled={!globalData}>
                            <Save size={18} /> Enregistrer en Base
                        </button>
                        <button className="btp-btn mt-5" onClick={() => { setGlobalData(null); setStatus(''); }} style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1' }}>
                            <Eraser size={18} /> Réinitialiser
                        </button>
                    </div>
                </div>

                {/* LIVE PREVIEW - A4 Simulation */}
                <div className="btp-preview-container">
                    {!globalData ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'white', textAlign: 'center' }}>
                            <div style={{ fontSize: '64px', marginBottom: '20px', opacity: 0.5 }}>🕵️‍♂️</div>
                            <h2 style={{ fontSize: '1.8rem', fontWeight: '800' }}>Expertise en attente</h2>
                            <p style={{ opacity: 0.8 }}>Configurez les dates et chargez les données <br />pour visualiser l'attestation complète.</p>
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '15px', position: 'sticky', top: '10px', zIndex: 100 }} className="no-print">
                                <button
                                    onClick={handlePrint}
                                    style={{ background: '#16a34a', color: '#ffffff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}
                                >
                                    <Printer size={16} /> Imprimer l'attestation
                                </button>
                                <button
                                    onClick={handleExportPDF}
                                    style={{ background: '#0284c7', color: '#ffffff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}
                                >
                                    <Download size={16} /> Télécharger PDF
                                </button>
                            </div>
                            <div
                                className="btp-full-report-preview"
                                style={{ width: '100%' }}
                                dangerouslySetInnerHTML={{ __html: reportOutput }}
                            />
                        </>
                    )}
                </div>
            </div>

            {/* ARCHIVES MODAL */}
            {showArchivesModal && (
                <div className="btp-modal open">
                    <div className="btp-modal-content" style={{ maxWidth: '800px' }}>
                        <div className="btp-modal-header">
                            <h2 className="text-xl font-bold flex items-center gap-2"><Briefcase /> Archives des Attestations</h2>
                            <button onClick={() => setShowArchivesModal(false)} className="text-slate-400 hover:text-slate-600">×</button>
                        </div>
                        <div className="mt-10">
                            {archives.length === 0 ? (
                                <p className="text-center py-20 text-slate-500 italic">Aucune archive disponible.</p>
                            ) : (
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="bg-slate-100">
                                            <th className="p-10 text-left border">Date Gén.</th>
                                            <th className="p-10 text-left border">Ville</th>
                                            <th className="p-10 text-left border">Période</th>
                                            <th className="p-10 text-center border">Jours Int.</th>
                                            <th className="p-10 text-center border">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {archives.map(a => (
                                            <tr key={a.id} className="hover:bg-slate-50 border-b">
                                                <td className="p-10 border">{new Date(a.date_generation).toLocaleDateString()}</td>
                                                <td className="p-10 border font-bold">{a.ville}</td>
                                                <td className="p-10 border text-xs">{a.periode_debut} au {a.periode_fin}</td>
                                                <td className="p-10 border text-center font-bold text-red-600">{a.nb_jours_intemperies}</td>
                                                <td className="p-10 border text-center">
                                                    <div className="flex items-center justify-center gap-3">
                                                        <button
                                                            className="bg-blue-600 text-white px-10 py-5 rounded text-xs font-bold hover:bg-blue-700 transition-colors"
                                                            onClick={() => loadArchive(a)}
                                                        >
                                                            Charger
                                                        </button>
                                                        <button
                                                            className="text-red-500 hover:text-red-700 p-5 rounded hover:bg-red-50 transition-all"
                                                            title="Supprimer l'archive"
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
            )}

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
                                        Températures (Min / Max)
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

                            {globalData && Object.keys(globalData).length > 0 && (
                                <div className="mb-20">
                                    <label className="block text-sm font-bold text-slate-700 mb-10">Mode d'intégration :</label>
                                    <div className="flex gap-15">
                                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                                            <input type="radio" name="attestationMergeMode" checked={mergeMode === 'merge'} onChange={() => setMergeMode('merge')} />
                                            Fusionner avec les données existantes
                                        </label>
                                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                                            <input type="radio" name="attestationMergeMode" checked={mergeMode === 'overwrite'} onChange={() => setMergeMode('overwrite')} />
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
        </div>
    );
};

export default AttestationIntemperieManager;
