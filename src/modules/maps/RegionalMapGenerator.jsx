import React, { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import html2canvas from 'html2canvas';
import { Download, RefreshCw, Calendar, Map as MapIcon, Layers } from 'lucide-react';
import stationNamesData from '../../data/stationNames.json';
import './RegionalMapGenerator.css';
import { CARTO_TILES } from '../../constants/carto';

// --- Configuration ---
const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Définition des régions et leurs départements
const REGIONS = {
    "Auvergne-Rhône-Alpes": { depts: ["01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"], center: [45.5, 4.8], zoom: 7 },
    "Bourgogne-Franche-Comté": { depts: ["21", "25", "39", "58", "70", "71", "89", "90"], center: [47.2, 5.0], zoom: 7 },
    "Bretagne": { depts: ["22", "29", "35", "56"], center: [48.2, -2.9], zoom: 8 },
    "Centre-Val de Loire": { depts: ["18", "28", "36", "37", "41", "45"], center: [47.5, 1.7], zoom: 7 },
    "Corse": { depts: ["20"], center: [42.1, 9.1], zoom: 8 },
    "Grand Est": { depts: ["08", "10", "51", "52", "54", "55", "57", "67", "68", "88"], center: [48.6, 5.9], zoom: 7 },
    "Hauts-de-France": { depts: ["02", "59", "60", "62", "80"], center: [50.0, 3.0], zoom: 8 },
    "Île-de-France": { depts: ["75", "77", "78", "91", "92", "93", "94", "95"], center: [48.8, 2.3], zoom: 9 },
    "Normandie": { depts: ["14", "27", "50", "61", "76"], center: [49.1, 0.2], zoom: 8 },
    "Nouvelle-Aquitaine": { depts: ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"], center: [45.5, 0.5], zoom: 6 },
    "Occitanie": { depts: ["09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82"], center: [43.6, 2.2], zoom: 7 },
    "Pays de la Loire": { depts: ["44", "49", "53", "72", "85"], center: [47.5, -0.6], zoom: 7 },
    "Provence-Alpes-Côte d'Azur": { depts: ["04", "05", "06", "13", "83", "84"], center: [43.9, 6.0], zoom: 8 },
    "France Entière": { depts: "ALL", center: [46.6, 2.5], zoom: 6 }
};

// Fonctions de couleurs (échelles)
const getColor = (value, type) => {
    if (value === null || value === undefined) return 'transparent';
    const v = parseFloat(value);

    if (type === 'temp_max' || type === 'temp_min') {
        if (v < -5) return '#000080'; // Bleu nuit très froid
        if (v < 0) return '#0047AB'; // Bleu
        if (v < 5) return '#5DADE2'; // Bleu clair
        if (v < 10) return '#2ECC71'; // Vert
        if (v < 15) return '#F1C40F'; // Jaune
        if (v < 20) return '#F39C12'; // Orange clair
        if (v < 25) return '#E67E22'; // Orange
        if (v < 30) return '#E74C3C'; // Rouge clair
        if (v < 35) return '#C0392B'; // Rouge foncé
        return '#641E16'; // Bordeaux extrême
    }

    if (type === 'wind_gust_max') {
        if (v < 40) return '#2ECC71'; // Vert
        if (v < 60) return '#F1C40F'; // Jaune
        if (v < 80) return '#E67E22'; // Orange
        if (v < 100) return '#E74C3C'; // Rouge
        if (v < 120) return '#C0392B'; // Violet/Rouge vif
        return '#8E44AD'; // Violet tempête
    }

    if (type === 'rain_total') {
        if (v < 1) return '#EAECEE'; // Gris très clair (rien)
        if (v < 5) return '#AED6F1'; // Bleu très clair
        if (v < 10) return '#5DADE2'; // Bleu
        if (v < 20) return '#2E86C1'; // Bleu moyen
        if (v < 40) return '#2874A6'; // Bleu foncé
        return '#1B4F72'; // Bleu nuit
    }

    return '#95a5a6';
};

// Composant pour mettre à jour la vue de la carte quand la région change ou via fitBounds
function MapUpdater({ center, zoom, bounds }) {
    const map = useMap();
    useEffect(() => {
        if (bounds && bounds.length > 0) {
            map.fitBounds(bounds, { padding: [50, 50] });
        } else {
            map.setView(center, zoom);
        }
    }, [center, zoom, bounds, map]);
    return null;
}

const RegionalMapGenerator = () => {
    const [selectedRegion, setSelectedRegion] = useState("Hauts-de-France");
    const [selectedParam, setSelectedParam] = useState("temp_max");
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [framedMode, setFramedMode] = useState(false);
    const mapRef = useRef(null);

    const params = {
        temp_max: { label: "Température Max", unit: "°C" },
        temp_min: { label: "Température Min", unit: "°C" },
        wind_gust_max: { label: "Rafales Max", unit: "km/h" },
        rain_total: { label: "Précipitations", unit: "mm" },
        foudre: { label: "Impacts Foudre ⚡", unit: "Impacts" }
    };

    const stationsLookup = useMemo(() => {
        const map = {};
        if (stationsListData && stationsListData.features) {
            stationsListData.features.forEach(f => {
                const sid = f.properties.num;
                map[sid] = {
                    lat: f.geometry.coordinates[1],
                    lon: f.geometry.coordinates[0],
                    name: f.properties.nom
                };
            });
        }
        return map;
    }, []);

    useEffect(() => {
        if (selectedParam === 'foudre') {
            loadLightning();
        } else {
            loadData();
        }
    }, [selectedDate, selectedParam]);

    const [lightningData, setLightningData] = useState([]);

    const loadLightning = async () => {
        setLoading(true);
        try {
            // API publique meteo-npdc.fr (Blitzortung) — 24h, anonyme
            const todayStr = new Date().toISOString().split('T')[0];
            
            // L'API meteo-npdc ne donne que les dernières 24h glissantes, donc on ne peut charger que si c'est aujourd'hui
            if (selectedDate === todayStr) {
                const res = await fetch('https://meteo-npdc.fr/api/v2/lightning/get_latest?minutes=1440', {
                    referrerPolicy: "no-referrer"
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const json = await res.json();
                if (json.success && Array.isArray(json.data)) {
                    setLightningData(json.data.map((s, i) => {
                        const dateObj = new Date(s.timestamp ? s.timestamp.replace(' ', 'T') : Date.now());
                        const timeMs = dateObj.getTime();
                        const validTime = isNaN(timeMs) ? Date.now() : timeMs;
                        const validDObj = new Date(validTime);
                        return {
                            lat: parseFloat(s.latitude),
                            lon: parseFloat(s.longitude),
                            time: validTime,
                            h: validDObj.getHours(),
                            raw: validDObj.toISOString().substring(11, 19)
                        };
                    }));
                } else {
                    setLightningData([]);
                }
            } else {
                // Autre date : pas de support d'archive directe via meteo-npdc (car seulement 24h live)
                setLightningData([]);
            }
        } catch (e) {
            console.error("Erreur foudre:", e);
            setLightningData([]);
        }
        setLoading(false);
    };

    const loadData = async () => {
        setLoading(true);
        try {
            console.log(`📊 Chargement paginé (RegionalMap) pour ${selectedDate}...`);
            let allData = [];
            let from = 0;
            const batch = 1000;

            while (true) {
                const { data, error } = await supabase
                    .rpc('get_daily_extremes_full', { target_date: selectedDate })
                    .range(from, from + batch - 1);

                if (error) throw error;
                if (!data || data.length === 0) break;
                allData.push(...data);
                if (data.length < batch) break;
                from += batch;
                if (from > 10000) break;
            }
            console.log(`✅ RegionalMap loaded: ${allData.length} stations`);
            setData(allData);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    // Hook pour charger les coordonnées des communes via API Géo
    const [stationsCoords, setStationsCoords] = useState({});

    useEffect(() => {
        const fetchCoords = async () => {
            if (data.length === 0) return;

            let deptsToFetch = [];

            if (REGIONS[selectedRegion].depts === 'ALL') {
                deptsToFetch = [...new Set(data.map(d => d.station_id.substring(0, 2)))]
                    .filter(d => d < '96' && d !== '20');
                if (data.some(d => d.station_id.startsWith('20'))) {
                    deptsToFetch.push('2A'); deptsToFetch.push('2B');
                }
            } else {
                deptsToFetch = REGIONS[selectedRegion].depts;
                if (deptsToFetch.includes('20')) {
                    deptsToFetch = deptsToFetch.filter(d => d !== '20').concat(['2A', '2B']);
                }
            }

            const newCoords = { ...stationsCoords };
            let hasNew = false;
            const promises = deptsToFetch.map(async (dept) => {
                try {
                    const res = await fetch(`https://geo.api.gouv.fr/departements/${dept}/communes?fields=code,centre`);
                    if (!res.ok) return;
                    const communes = await res.json();
                    communes.forEach(c => {
                        if (c.centre && c.centre.coordinates) {
                            if (!newCoords[c.code]) {
                                newCoords[c.code] = { lat: c.centre.coordinates[1], lon: c.centre.coordinates[0] };
                                hasNew = true;
                            }
                        }
                    });
                } catch (e) { }
            });
            await Promise.all(promises);
            if (hasNew) setStationsCoords(newCoords);
        };
        fetchCoords();
    }, [selectedRegion, data]);

    const handleDownload = async () => {
        if (!mapRef.current) return;
        const canvas = await html2canvas(mapRef.current, {
            useCORS: true,
            allowTaint: true,
            logging: false,
            scale: 2
        });
        const link = document.createElement('a');
        link.download = `Carte_${selectedRegion}_${selectedParam}_${selectedDate}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    // Filtrage des données
    const regionConfig = REGIONS[selectedRegion];
    const filteredData = React.useMemo(() => {
        return data.filter(d => {
            if (regionConfig.depts === 'ALL') return d.station_id < '96000000';
            const dept = d.station_id.substring(0, 2);
            return regionConfig.depts.includes(dept);
        }).filter(d => {
            const val = d[selectedParam];
            return val !== null && val !== undefined;
        });
    }, [data, selectedRegion, selectedParam, regionConfig]);

    // Calcul Min/Max dynamiques
    const { minVal, maxVal } = React.useMemo(() => {
        if (selectedParam === 'foudre') return { minVal: 0, maxVal: 0 };
        if (filteredData.length === 0) return { minVal: 0, maxVal: 100 };
        const vals = filteredData.map(d => d[selectedParam]);
        return { minVal: Math.min(...vals), maxVal: Math.max(...vals) };
    }, [filteredData, selectedParam, lightningData]);

    // 1. Couleurs DYNAMIQUES (pour les zooms régionaux) - Nuances fines
    const getDynamicColor = (val, min, max, type) => {
        let ratio = (val - min) / (max - min);
        if (max === min) ratio = 0.5;
        ratio = Math.max(0, Math.min(1, ratio));

        if (type.includes('temp')) {
            const hue = 220 - (ratio * 220); // Bleu -> Rouge
            return `hsl(${hue}, 85%, 50%)`;
        }
        if (type.includes('wind')) {
            const hue = 120 - (ratio * 120); // Vert -> Rouge
            return `hsl(${hue}, 90%, 45%)`;
        }
        if (type.includes('rain')) {
            const l = 90 - (ratio * 60); // Blanc -> Bleu foncé
            return `hsl(210, 90%, ${l}%)`;
        }
        return '#888';
    };

    // 2. Couleurs ABSOLUES (pour la France entière) - Seuils fixes standards
    // 2. Couleurs ABSOLUES (Interpolées pour plus de précision)
    const getInterpolatedAbsoluteColor = (val, type) => {
        if (type.includes('temp')) {
            // Echelle France standard: -5 (Bleu) -> 0 (Cyan) -> 10 (Vert) -> 20 (Jaune) -> 30 (Rouge) -> 40 (Violet)
            // On interpole entre ces points clés pour avoir une variation continue
            const stops = [
                { val: -10, h: 260 }, // Violet froid
                { val: -5, h: 240 },  // Bleu
                { val: 0, h: 200 },   // Cyan
                { val: 10, h: 140 },  // Vert
                { val: 15, h: 100 },  // Vert clair
                { val: 20, h: 60 },   // Jaune
                { val: 25, h: 30 },   // Orange
                { val: 30, h: 0 },    // Rouge
                { val: 35, h: 340 },  // Rose
                { val: 40, h: 280 }   // Violet chaud
            ];

            // Trouver les bornes
            let lower = stops[0];
            let upper = stops[stops.length - 1];

            for (let i = 0; i < stops.length - 1; i++) {
                if (val >= stops[i].val && val <= stops[i + 1].val) {
                    lower = stops[i];
                    upper = stops[i + 1];
                    break;
                }
            }

            // Interpoler
            if (val <= lower.val) return `hsl(${lower.h}, 85%, 50%)`;
            if (val >= upper.val) return `hsl(${upper.h}, 85%, 50%)`;

            const ratio = (val - lower.val) / (upper.val - lower.val);
            const hue = lower.h + (upper.h - lower.h) * ratio;
            return `hsl(${hue}, 85%, 50%)`;
        }

        if (type.includes('wind')) {
            const stops = [
                { val: 0, h: 140 },   // Vert
                { val: 40, h: 100 },  // Vert clair
                { val: 60, h: 60 },   // Jaune
                { val: 80, h: 30 },   // Orange
                { val: 100, h: 0 },   // Rouge
                { val: 120, h: 300 }  // Violet
            ];
            // ... (similar logic or simplify)
            // Pour le vent, on peut garder des paliers ou interpoler. Interpolons pour la cohérence.
            let lower = stops[0];
            let upper = stops[stops.length - 1];
            for (let i = 0; i < stops.length - 1; i++) {
                if (val >= stops[i].val && val <= stops[i + 1].val) {
                    lower = stops[i];
                    upper = stops[i + 1];
                    break;
                }
            }
            if (val <= lower.val) return `hsl(${lower.h}, 90%, 45%)`;
            if (val >= upper.val) return `hsl(${upper.h}, 90%, 45%)`;

            const ratio = (val - lower.val) / (upper.val - lower.val);
            const hue = lower.h + (upper.h - lower.h) * ratio;
            return `hsl(${hue}, 90%, 45%)`;
        }

        if (type.includes('rain')) {
            // Pluie : on garde des seuils, la pluie est souvent analysée par classe
            if (val < 2) return '#bdc3c7';  // Faible
            if (val < 10) return '#3498db'; // Modérée
            if (val < 30) return '#2980b9'; // Forte
            return '#2c3e50';               // Intense
        }
        return '#95a5a6';
    };

    // Génération du dégradé CSS pour la légende dynamique
    const getGradientStyle = (type) => {
        if (type.includes('temp')) return 'linear-gradient(to top, hsl(220, 85%, 50%), hsl(110, 85%, 50%), hsl(0, 85%, 50%))';
        if (type.includes('wind')) return 'linear-gradient(to top, hsl(120, 90%, 45%), hsl(60, 90%, 45%), hsl(0, 90%, 45%))';
        if (type.includes('rain')) return 'linear-gradient(to top, hsl(210, 90%, 90%), hsl(210, 90%, 30%))';
        return 'none';
    };

    const bounds = React.useMemo(() => {
        const points = filteredData
            .map(d => stationsCoords[d.station_id.substring(0, 5)])
            .filter(c => c);

        if (points.length === 0) return null;

        const lats = points.map(p => p.lat);
        const lons = points.map(p => p.lon);
        return [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]];
    }, [filteredData, stationsCoords]);

    const isFrance = selectedRegion === 'France Entière';

    return (
        <div className="map-generator-container">
            <h1>Générateur de Cartes Régionales</h1>

            <div className="map-controls">
                <div className="control-group">
                    <label><Calendar size={14} /> Date</label>
                    <input type="date" className="map-select" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
                </div>
                <div className="control-group">
                    <label><MapIcon size={14} /> Région</label>
                    <select className="map-select" value={selectedRegion} onChange={e => setSelectedRegion(e.target.value)}>
                        {Object.keys(REGIONS).map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </div>
                <div className="control-group">
                    <label><Layers size={14} /> Paramètre</label>
                    <select className="map-select" value={selectedParam} onChange={e => setSelectedParam(e.target.value)}>
                        {Object.entries(params).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                </div>
                <div className="control-group" style={{ flexDirection: 'row', alignItems: 'center', marginTop: 'auto', marginBottom: 'auto' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', color: '#e2e8f0' }}>
                        <input
                            type="checkbox"
                            checked={framedMode}
                            onChange={e => setFramedMode(e.target.checked)}
                        />
                        Style « Cadre »
                    </label>
                </div>
                <button onClick={handleDownload} className="download-btn" style={{ marginTop: 'auto' }}>
                    <Download size={16} /> Télécharger Image
                </button>
                <div style={{ marginLeft: 'auto', fontSize: '0.9rem', color: '#94a3b8' }}>
                    {selectedParam === 'foudre' ? (
                        <span>{lightningData.length} impacts</span>
                    ) : (
                        <>
                            {filteredData.length} stations
                            {!isFrance && <span> • Min: {minVal.toFixed(1)} / Max: {maxVal.toFixed(1)}</span>}
                        </>
                    )}
                </div>
            </div>

            <div className="capture-scroll-container">
                <div className="capture-wrapper" ref={mapRef}>
                    <MapContainer
                        center={regionConfig.center}
                        zoom={regionConfig.zoom}
                        zoomControl={false}
                        attributionControl={false}
                        style={{ height: '100%', width: '100%' }}
                    >
                        <TileLayer url={CARTO_TILES.LIGHT_ALL} />
                        <MapUpdater center={regionConfig.center} zoom={regionConfig.zoom} bounds={bounds} />

                        {selectedParam === 'foudre' ? (
                            // RENDU FOUDRE (POINTS)
                            lightningData.map((s, i) => {
                                // Filtrage basique : afficher tous les points
                                // ou filtrer si hors de la vue (optionnel, Leaflet gère bien)
                                const HOUR_COLORS = [
                                    "#0000FF", "#0022FF", "#0044FF", "#0066FF", "#0088FF", "#00AAFF",
                                    "#00CCFF", "#00EEFF", "#00FFDD", "#00FFBB", "#00FF99", "#00FF77",
                                    "#00FF00", "#77FF00", "#BBFF00", "#FFFF00", "#FFCC00", "#FFAA00",
                                    "#FF8800", "#FF6600", "#FF4400", "#FF2200", "#FF0000", "#8B0000"
                                ];
                                const color = HOUR_COLORS[s.h] || '#ff0000';

                                // On utilise CircleMarker de Leaflet qui est vectoriel et performant
                                const { CircleMarker } = React.useMemo(() => require('react-leaflet'), []);

                                return (
                                    <CircleMarker
                                        key={i}
                                        center={[s.lat, s.lon]}
                                        radius={3}
                                        pathOptions={{
                                            fillColor: color,
                                            fillOpacity: 1,
                                            color: 'black',
                                            weight: 0.5
                                        }}
                                    />
                                );
                            })
                        ) : (
                            // RENDU STATIONS CLASSIQUE
                            filteredData.map(station => {
                                let sid = String(station.station_id);
                                if (sid.length === 7) sid = "0" + sid;
                                
                                const meta = stationsLookup[sid];
                                const lat = meta?.lat || station.lat;
                                const lon = meta?.lon || station.lon;
                                
                                if (!lat || !lon) return null;

                                const val = station[selectedParam];
                                const displayVal = Math.round(val).toString();

                                // FORCE CONSISTENCY: Use the DISPLAYED value for color calculation
                                // This ensures that if we see "5" and "5", they have the same color, 
                                // even if the raw values were 4.6 and 5.4.
                                const valForColor = parseFloat(displayVal);

                                // CHOIX DE LA COULEUR : Dynamique pour région, Interpolée pour France
                                const color = isFrance
                                    ? getInterpolatedAbsoluteColor(valForColor, selectedParam)
                                    : getDynamicColor(valForColor, minVal, maxVal, selectedParam);

                                // 4. Calcul de la couleur du texte (Contraste)
                                let textColor = 'white';
                                if (isFrance) {
                                    // Utiliser la même logique de contraste que region
                                    if (selectedParam.includes('rain')) {
                                        if (val < 10) textColor = '#1e293b';
                                    } else {
                                        // On recalcule la teinte approx pour savoir
                                        // Ou simplifié: on check si val est dans range "clair"
                                        // Temp: 10-25 => clair
                                        if (selectedParam.includes('temp') && val > 10 && val < 25) textColor = '#1e293b';
                                        if (selectedParam.includes('wind') && val < 70) textColor = '#1e293b';
                                    }
                                } else {
                                    // Logique simple basée sur les Teintes/Luminosité connues
                                    if (selectedParam.includes('rain')) {
                                        // Pluie : Blanc sauf si très clair (L > 60)
                                        // Mon algo : L = 90 - (ratio*60). Si ratio proche de 0 => L=90 (Blanc) => Texte Noir.
                                        // Si ratio proche de 1 => L=30 (Bleu Nuit) => Texte Blanc.
                                        const ratio = (val - minVal) / (maxVal - minVal);
                                        if (ratio < 0.5) textColor = '#1e293b'; // Noir gris
                                    }
                                    else if (selectedParam.includes('temp') || selectedParam.includes('wind')) {
                                        // Temp/Wind : Dégradé HSL.
                                        // Jaune/Vert/Orange clair (Hue 40-160) => Texte Noir
                                        // Bleu/Rouge sombre => Texte Blanc
                                        // On recalcule le hue approx pour décider
                                        let r = (val - minVal) / (maxVal - minVal);
                                        if (maxVal === minVal) r = 0.5;
                                        let hue = 0;
                                        if (selectedParam.includes('temp')) hue = 220 - (r * 220);
                                        if (selectedParam.includes('wind')) hue = 120 - (r * 120);

                                        // Zones claires : Vert clair (100-140), Jaune (50-70), Cyan clair
                                        // Zones sombres : Bleu (200+), Rouge (0-20), Violet
                                        if (hue > 45 && hue < 180) textColor = '#1e293b'; // Noir
                                    }
                                }

                                // 5. Rendu Icone
                                let iconHtml;
                                if (isFrance) {
                                    iconHtml = `<div style="background-color: ${color}; width: 8px; height: 8px; border-radius: 50%; opacity: 0.9; border: 0.5px solid rgba(0,0,0,0.1);"></div>`;
                                } else {
                                    if (framedMode) {
                                        // Style CADRE: Fond blanc, Bordure couleur, Texte noir
                                        iconHtml = `<div class="value-marker" style="background-color: white; color: #1e293b; border: 2.5px solid ${color}; width: 52px; height: 52px; font-size: 28px; font-weight: 800;">${displayVal}</div>`;
                                    } else {
                                        // Style PLEIN: Fond couleur, Texte contrasté
                                        iconHtml = `<div class="value-marker" style="background-color: ${color}; color: ${textColor}; width: 52px; height: 52px; font-size: 28px; font-weight: 800;">${displayVal}</div>`;
                                    }
                                }

                                const iconSize = isFrance ? [8, 8] : [52, 52];
                                const iconAnchor = isFrance ? [4, 4] : [26, 26];

                                const icon = L.divIcon({
                                    className: 'custom-div-icon',
                                    html: iconHtml,
                                    iconSize: iconSize,
                                    iconAnchor: iconAnchor
                                });

                                return <Marker key={station.station_id} position={[lat, lon]} icon={icon} />;
                            })
                        )}
                    </MapContainer>

                    <div className="legend-overlay">
                        <div className="legend-title">{params[selectedParam].label}</div>
                        <div className="legend-date">{new Date(selectedDate).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                        <div className="legend-unit" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: '0.8rem' }}>Unité : {params[selectedParam].unit}</div>

                        {/* LÉGENDE CONDITIONNELLE */}
                        {isFrance ? (
                            <div className="legend-scale-fixed">
                                {/* Légende GRADIENT pour la France */}
                                <div style={{
                                    width: '100%', height: '16px', borderRadius: '4px', marginBottom: '4px',
                                    background: selectedParam.includes('temp')
                                        ? 'linear-gradient(to right, hsl(260,85%,50%), hsl(240,85%,50%), hsl(200,85%,50%), hsl(140,85%,50%), hsl(60,85%,50%), hsl(0,85%,50%), hsl(280,85%,50%))'
                                        : selectedParam.includes('wind')
                                            ? 'linear-gradient(to right, hsl(140,90%,45%), hsl(60,90%,45%), hsl(0,90%,45%), hsl(300,90%,45%))'
                                            : '#ccc'
                                }}></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b' }}>
                                    {selectedParam.includes('temp') && <>
                                        <span>-10°</span><span>0°</span><span>10°</span><span>20°</span><span>30°</span><span>40°</span>
                                    </>}
                                    {selectedParam.includes('wind') && <>
                                        <span>0</span><span>40</span><span>80</span><span>120+</span>
                                    </>}
                                </div>
                            </div>
                        ) : selectedParam === 'foudre' ? (
                            <div className="legend-dynamic" style={{ display: 'flex', flexDirection: 'column', height: 'auto', gap: '5px' }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '5px' }}>Chronologie (Heure UTC+1)</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                                    {[0, 6, 12, 18].map(h => {
                                        const cs = [
                                            "#0000FF", "#00CCFF", "#00FF00", "#FF8800"
                                        ];
                                        const labels = ["0h-6h", "6h-12h", "12h-18h", "18h-24h"];
                                        const idx = h / 6;
                                        return (
                                            <div key={h} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                <div style={{ width: '100%', height: '8px', background: cs[idx], borderRadius: '2px' }}></div>
                                                <span style={{ fontSize: '0.6rem', color: '#64748b' }}>{labels[idx]}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                                <div style={{ textAlign: 'center', marginTop: '5px', fontSize: '0.8rem', fontWeight: 900, color: '#ef4444' }}>
                                    {lightningData.length} impacts
                                </div>
                            </div>
                        ) : (
                            <div className="legend-dynamic" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px', height: '150px' }}>
                                <div className="gradient-bar" style={{
                                    width: '20px',
                                    height: '100%',
                                    background: getGradientStyle(selectedParam),
                                    borderRadius: '4px',
                                    border: '1px solid #fff'
                                }}></div>
                                <div className="legend-labels" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', fontSize: '0.9rem', fontWeight: 'bold' }}>
                                    <div>{maxVal.toFixed(1)}</div>
                                    <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>{((maxVal + minVal) / 2).toFixed(1)}</div>
                                    <div>{minVal.toFixed(1)}</div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{ position: 'absolute', bottom: '10px', left: '10px', zIndex: 1000, color: '#64748b', fontSize: '10px', background: 'rgba(255,255,255,0.8)', padding: '2px 5px', borderRadius: '4px' }}>
                        Météo Climat Pros
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RegionalMapGenerator;
