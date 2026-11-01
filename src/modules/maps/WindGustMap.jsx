import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from 'react-router-dom';
import { geoConicConformal, geoPath } from "d3-geo";
import { supabase } from "../../services/api";
import { meteoCollector } from "../../services/meteoFranceCollector";
import { Download, RefreshCw, AlertCircle, Wind, Calendar, ChevronLeft, ChevronRight, ChevronDown, Info } from "lucide-react";
import html2canvas from "html2canvas";
import { format, isValid, subDays, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import stationNamesData from "../../data/stationNames.json";
import stationsMetadata from "../../data/stationsMetadata.json";
import stationsListData from "../../data/stations_list.json";
import { Delaunay } from "d3-delaunay";
import { REGIONS } from "../../data/departments";
// Échelle de couleurs officielle (60 -> 180 km/h) extraite de l'image de référence
const WIND_SCALE = [
    { min: 0, max: 60, color: '#ffffe0', label: '< 60' },
    { min: 60, max: 70, color: '#fef0b9', label: '60 - 70' },
    { min: 70, max: 80, color: '#fde492', label: '70 - 80' },
    { min: 80, max: 90, color: '#fccb70', label: '80 - 90' },
    { min: 90, max: 100, color: '#fbaf53', label: '90 - 100' },
    { min: 100, max: 110, color: '#f88e36', label: '100 - 110' },
    { min: 110, max: 120, color: '#f26829', label: '110 - 120' },
    { min: 120, max: 130, color: '#e23b30', label: '120 - 130' },
    { min: 130, max: 140, color: '#c61d5f', label: '130 - 140' },
    { min: 140, max: 150, color: '#a02c91', label: '140 - 150' },
    { min: 150, max: 160, color: '#802eaf', label: '150 - 160' },
    { min: 160, max: 170, color: '#9d66e5', label: '160 - 170' },
    { min: 170, max: 180, color: '#c39cf5', label: '170 - 180' },
    { min: 180, max: Infinity, color: '#e6d8ff', label: '> 180' },
];

const WIND_SCALE_LIVE = [
    { min: 0, max: 20, color: '#ffffff', label: '< 20' },
    { min: 20, max: 30, color: '#e6f2ff', label: '20 - 30' },
    { min: 30, max: 40, color: '#cce6ff', label: '30 - 40' },
    { min: 40, max: 50, color: '#99ccff', label: '40 - 50' },
    { min: 50, max: 60, color: '#66b2ff', label: '50 - 60' },
    { min: 60, max: 70, color: '#fef0b9', label: '60 - 70' },
    { min: 70, max: 80, color: '#fde492', label: '70 - 80' },
    { min: 80, max: 90, color: '#fccb70', label: '80 - 90' },
    { min: 90, max: 100, color: '#fbaf53', label: '90 - 100' },
    { min: 100, max: 110, color: '#f88e36', label: '100 - 110' },
    { min: 110, max: 120, color: '#f26829', label: '110 - 120' },
    { min: 120, max: 130, color: '#e23b30', label: '120 - 130' },
    { min: 130, max: 140, color: '#c61d5f', label: '130 - 140' },
    { min: 140, max: Infinity, color: '#a02c91', label: '> 140' },
];

const getWindColor = (value, scale = WIND_SCALE) => {
    if (value === null || value === undefined || value <= 0) return '#ffffff';
    const range = scale.find(r => value >= r.min && value < r.max);
    return range ? range.color : scale[scale.length - 1].color;
};

const WindGustMap = () => {
    const navigate = useNavigate();
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [geoData, setGeoData] = useState(null);
    const [regionsGeoData, setRegionsGeoData] = useState(null);
    const [deptData, setDeptData] = useState({}); // code -> maxGust
    const [stations, setStations] = useState([]); // Stations avec coordonnées et valeurs
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isRealTime, setIsRealTime] = useState(true);
    const [mapTitle, setMapTitle] = useState("Rafales de vent maximales");
    const [showLabels, setShowLabels] = useState(true);
    const [showRegions, setShowRegions] = useState(true);
    const [isSmooth, setIsSmooth] = useState(true);
    const [selectedRegionName, setSelectedRegionName] = useState("France");
    const [hoveredStation, setHoveredStation] = useState(null);
    const [lastDataTimestamp, setLastDataTimestamp] = useState(null);
    const mapContainerRef = useRef(null);

    const WIDTH = 1000;
    const HEIGHT = 900;

    // Créer un lookup des coordonnées statique
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

    // Charger le GeoJSON des départements et des régions au montage
    useEffect(() => {
        // Départements
        fetch("/data/departements-version-simplifiee.geojson")
            .then(res => res.json())
            .then(data => {
                console.log("[Diagnostic] GéoData Départements chargée:", data.features.length);
                setGeoData(data);
            })
            .catch(err => console.error("Erreur GeoJSON Dépt:", err));

        // Régions
        fetch("/data/regions-version-simplifiee.geojson")
            .then(res => res.json())
            .then(data => {
                console.log("[Diagnostic] GéoData Régions chargée:", data.features.length);
                setRegionsGeoData(data);
            })
            .catch(err => console.error("Erreur GeoJSON Régions:", err));
    }, []);

    // Déterminer si on est en temps réel
    const [windMode, setWindMode] = useState("max"); // "max" ou "direct"
    const activeWindScale = windMode === 'direct' ? WIND_SCALE_LIVE : WIND_SCALE;

    useEffect(() => {
        const today = new Date().toISOString().split('T')[0];
        const realTime = selectedDate === today;
        setIsRealTime(realTime);
        if (!realTime && windMode === "direct") {
            setWindMode("max");
        }
    }, [selectedDate, windMode]);

    // Auto-update title when mode changes
    useEffect(() => {
        if (windMode === "max") {
            setMapTitle("Rafales de vent maximales");
        } else {
            setMapTitle("Rafales de vent en Temps Réel");
        }
    }, [windMode]);

    const loadData = async () => {
        setLoading(true);
        setError(null);

        try {
            let gustMap = {};
            let stationList = [];

            try {
                if (windMode === "direct") {
                    console.log("[WindGustMap] Chargement des rafales en temps réel...");
                    let liveData = [];
                    let from = 0;
                    const batchSize = 1000;
                    let hasMore = true;

                    while (hasMore) {
                        const { data, error: liveError } = await supabase
                            .rpc('get_france_live')
                            .range(from, from + batchSize - 1);

                        if (liveError) throw liveError;
                        if (data && data.length > 0) {
                            liveData.push(...data);
                            if (data.length < batchSize) hasMore = false;
                            else from += batchSize;
                        } else {
                            hasMore = false;
                        }
                    }

                    if (liveData && liveData.length > 0) {
                        let maxTimestamp = null;
                        liveData.forEach(item => {
                            if (item.obs_time) {
                                const d = new Date(item.obs_time);
                                if (!maxTimestamp || d > maxTimestamp) {
                                    maxTimestamp = d;
                                }
                            }
                        });
                        setLastDataTimestamp(maxTimestamp);

                        const uniqueStations = new Map();
                        liveData.forEach(s => {
                            // Wind gust is 'gust' in get_france_live, with fallback to 'wind'
                            const gustVal = s.gust !== null && s.gust !== undefined ? s.gust : s.wind;
                            if (gustVal !== null && gustVal !== undefined && !isNaN(gustVal)) {
                                let sid = String(s.station_id);
                                if (sid.length === 7) sid = "0" + sid;

                                const meta = stationsLookup[sid];
                                const lat = meta?.lat;
                                const lon = meta?.lon;

                                if (lat && lon) {
                                    const geoKey = `${(Math.round(lat * 20) / 20).toFixed(2)}_${(Math.round(lon * 20) / 20).toFixed(2)}`;
                                    const existing = uniqueStations.get(geoKey);
                                    if (!existing || gustVal > existing.value) {
                                        uniqueStations.set(geoKey, {
                                            id: sid,
                                            lat,
                                            lon,
                                            value: gustVal,
                                            name: stationNamesData[sid] || meta?.name || sid
                                        });
                                    }
                                }
                            }
                        });

                        stationList = Array.from(uniqueStations.values());

                        console.log(`[WindGustMap] ${stationList.length} stations temps réel uniques.`);
                    }
                } else {
                    let allData = [];
                    let from = 0;
                    const batchSize = 1000;
                    let hasMore = true;

                    while (hasMore) {
                        const { data, error: tableError } = await supabase
                            .from('daily_summaries')
                            .select('station_id, wind_gust_max, wind_mean_max, temp_min, temp_max, rain_total')
                            .eq('date', selectedDate)
                            .range(from, from + batchSize - 1);

                        if (tableError) {
                            console.error("[WindGustMap] Erreur de lecture daily_summaries:", tableError);
                            break;
                        }
                        if (data && data.length > 0) {
                            allData.push(...data);
                            if (data.length < batchSize) hasMore = false;
                            else from += batchSize;
                        } else {
                            hasMore = false;
                        }
                    }

                    if (allData.length > 0) {
                        console.log(`[Diagnostic] ${allData.length} stations traitées pour le ${selectedDate}`);

                        const uniqueStations = new Map();

                        allData.forEach(s => {
                            // On utilise en priorité wind_gust_max, avec fallback sur wind_mean_max
                            const gust = s.wind_gust_max !== null && s.wind_gust_max !== undefined ? s.wind_gust_max : s.wind_mean_max;
                            if (gust !== null && gust !== undefined && gust > 0) {
                                let sid = String(s.station_id);
                                if (sid.length === 7) sid = "0" + sid;

                                const dept = sid.substring(0, 2);
                                gustMap[dept] = Math.max(gustMap[dept] || 0, gust);

                                const meta = stationsLookup[sid];
                                const lat = meta?.lat || s.lat;
                                const lon = meta?.lon || s.lon;

                                if (lat && lon) {
                                    const geoKey = `${(Math.round(lat * 20) / 20).toFixed(2)}_${(Math.round(lon * 20) / 20).toFixed(2)}`;

                                    if (!uniqueStations.has(geoKey) || uniqueStations.get(geoKey).value < gust) {
                                        uniqueStations.set(geoKey, {
                                            id: sid,
                                            lat,
                                            lon,
                                            value: gust,
                                            name: stationNamesData[sid] || meta?.name || sid
                                        });
                                    }
                                }
                            }
                        });

                        stationList = Array.from(uniqueStations.values());

                        console.log(`[Diagnostic] ${stationList.length} stations uniques après regroupement.`);
                    }
                }
            } catch (err) {
                console.error("[WindGustMap] Erreur critique de chargement:", err);
            }

            setDeptData(gustMap);
            setStations(stationList.sort((a, b) => b.value - a.value));

            // Capturer le timestamp max pour afficher l'heure de mise à jour
            let maxTimestamp = null;
            if (isRealTime) {
                try {
                    const { data: latestObs } = await supabase
                        .from('observations_6mn')
                        .select('timestamp')
                        .order('timestamp', { ascending: false })
                        .limit(1);
                    if (latestObs && latestObs[0]) {
                        maxTimestamp = new Date(latestObs[0].timestamp);
                    }
                } catch (err) {
                    console.warn("Erreur fetch latest obs timestamp:", err);
                }
            }
            if (windMode === "direct" && !maxTimestamp && stationList.length > 0) {
                // En temps réel on utilise déjà le timestamp du obs_time extrait plus haut
            } else {
                setLastDataTimestamp(maxTimestamp);
            }

            if (stationList.length === 0) {
                setError(windMode === "direct" ? "Aucune donnée de vent en direct disponible." : "Aucune rafale archivée pour cette date.");
            }
        } catch (err) {
            console.error("Erreur chargement données vent:", err);
            setError("Impossible de charger les données météo.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [selectedDate, isRealTime, windMode]);

    // Auto-refresh in real-time mode every 3 minutes
    useEffect(() => {
        if (windMode !== "direct" || !isRealTime) return;
        const interval = setInterval(() => {
            console.log("[WindGustMap] Auto-refreshing real-time wind gust observations...");
            loadData();
        }, 3 * 60 * 1000);
        return () => clearInterval(interval);
    }, [windMode, isRealTime, selectedDate]);

    const projection = useMemo(() => {
        if (!geoData) return null;
        let proj;
        if (selectedRegionName !== "France" && regionsGeoData) {
            const regionFeature = regionsGeoData.features.find(f => f.properties.nom === selectedRegionName);
            if (regionFeature) proj = geoConicConformal().fitExtent([[20, 20], [WIDTH - 20, HEIGHT - 180]], regionFeature);
        }
        if (!proj) {
            proj = geoConicConformal().fitExtent([[20, 20], [WIDTH - 20, HEIGHT - 180]], geoData);
        }
        const t = proj.translate();
        return proj.translate([t[0] - 70, t[1]]);
    }, [geoData, regionsGeoData, selectedRegionName]);

    const pathGenerator = useMemo(() => projection ? geoPath().projection(projection) : null, [projection]);

    // Combiner les frontières pour le clip-path (France ou Région spécifique)
    const combinedPath = useMemo(() => {
        if (!geoData || !pathGenerator) return "";

        if (selectedRegionName !== "France" && regionsGeoData) {
            const regionFeature = regionsGeoData.features.find(f => f.properties.nom === selectedRegionName);
            if (regionFeature) return pathGenerator(regionFeature);
        }

        return geoData.features.map(f => pathGenerator(f)).join(" ");
    }, [geoData, regionsGeoData, selectedRegionName, pathGenerator]);

    // Filtrage synchrone des stations par région pour éliminer les flashs visuels
    const visibleStations = useMemo(() => {
        if (selectedRegionName === "France" || !REGIONS[selectedRegionName]) return stations;
        const regionDepts = REGIONS[selectedRegionName];
        return stations.filter(s => regionDepts.includes(s.id.startsWith("20") ? "2A" : s.id.substring(0, 2)));
    }, [stations, selectedRegionName]);

    // Générer les cellules de Voronoi (Pour le mode standard)
    const voronoiCells = useMemo(() => {
        if (!projection || !visibleStations.length) return [];
        // On projette les stations filtrées
        const points = visibleStations.map(s => projection([s.lon, s.lat]));
        const delaunay = Delaunay.from(points);
        const voronoi = delaunay.voronoi([0, 0, WIDTH, HEIGHT]);
        return visibleStations.map((s, i) => ({
            station: s,
            path: voronoi.renderCell(i)
        }));
    }, [projection, visibleStations]);

    // --- MOTEUR D'INTERPOLATION POUR LE MODE LISSAGE (Style Modèle Météo) ---
    const interpolatedGrid = useMemo(() => {
        // Pour les petites régions, on réduit le seuil de stations requis à 5 au lieu de 20
        if (!isSmooth || visibleStations.length < 5 || !projection) return null;

        const gridResX = 60; // Résolution augmentée pour plus de finesse
        const gridResY = 55;
        const grid = [];

        for (let y = 0; y < gridResY; y++) {
            for (let x = 0; x < gridResX; x++) {
                const posX = (x / gridResX) * WIDTH;
                const posY = (y / gridResY) * HEIGHT;

                const geoCoords = projection.invert([posX, posY]);
                if (!geoCoords) continue;

                let weightSum = 0;
                let valueSum = 0;

                // Algorithme IDW avec puissance 3 pour des contours beaucoup plus nets (bulles)
                visibleStations.forEach(s => {
                    const dx = s.lon - geoCoords[0];
                    const dy = s.lat - geoCoords[1];
                    const d2 = dx * dx + dy * dy;

                    if (d2 < 6) { // Rayon d'influence 
                        // Puissance 3 = beaucoup moins de mélange, les records restent records
                        const w = 1 / (Math.pow(d2, 1.5) + 0.001);
                        weightSum += w;
                        valueSum += s.value * w;
                    }
                });

                if (weightSum > 0) {
                    const finalVal = valueSum / weightSum;
                    // On ne garde que ce qui est au-dessus d'un seuil pour l'effet "taches" de vent
                    if (finalVal > 28) {
                        grid.push({
                            x: posX,
                            y: posY,
                            val: finalVal,
                            opacity: finalVal < 40 ? 0.3 : finalVal < 70 ? 0.6 : 0.9,
                            w: WIDTH / gridResX,
                            h: HEIGHT / gridResY
                        });
                    }
                }
            }
        }
        return grid;
    }, [isSmooth, visibleStations, projection]);

    const handleExport = () => {
        const el = document.getElementById("wind-map-container");
        if (!el) return;
        html2canvas(el, { scale: 2, useCORS: true }).then(canvas => {
            const link = document.createElement("a");
            link.download = `carte-rafales-${selectedDate}.png`;
            link.href = canvas.toDataURL();
            link.click();
        });
    };

    const changeDate = (days) => {
        const d = new Date(selectedDate);
        const newDate = days > 0 ? addDays(d, days) : subDays(d, Math.abs(days));
        const today = new Date();
        if (newDate <= today) {
            setSelectedDate(newDate.toISOString().split('T')[0]);
        }
    };

    return (
        <div className="wind-map-page" style={{ padding: '20px', background: '#f8fafc', minHeight: '100vh', fontFamily: 'Outfit, sans-serif' }}>
            <header style={{
                maxWidth: '1300px',
                margin: '0 auto 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '15px',
                background: 'white',
                padding: '24px',
                borderRadius: '20px',
                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: '900', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Wind style={{ color: windMode === 'direct' ? '#10b981' : '#3b82f6' }} size={28} />
                            {windMode === 'direct' ? 'Rafales Direct' : 'Rafales Max'} : {selectedRegionName}
                        </h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isRealTime ? '#10b981' : '#f59e0b' }}></div>
                            <span style={{ color: '#64748b', fontSize: '0.95rem', fontWeight: '500' }}>
                                {isRealTime ? "Météo-France (Temps Réel)" : `Archives du ${format(new Date(selectedDate), "EEEE d MMMM yyyy", { locale: fr })}`}
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginRight: '10px' }}>
                        {/* Sélecteur Max / Temps Réel */}
                        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '12px', padding: '3px' }}>
                            {isRealTime && (
                                <button
                                    onClick={() => setWindMode('direct')}
                                    style={{
                                        padding: '6px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                                        fontWeight: '800', fontSize: '0.85rem', transition: 'all 0.2s',
                                        background: windMode === 'direct' ? '#3b82f6' : 'transparent',
                                        color: windMode === 'direct' ? 'white' : '#64748b'
                                    }}
                                >
                                    Temps Réel
                                </button>
                            )}
                            <button
                                onClick={() => setWindMode('max')}
                                style={{
                                    padding: '6px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                                    fontWeight: '800', fontSize: '0.85rem', transition: 'all 0.2s',
                                    background: windMode === 'max' ? '#3b82f6' : 'transparent',
                                    color: windMode === 'max' ? 'white' : '#64748b'
                                }}
                            >
                                Max Journée
                            </button>
                        </div>

                        {/* Sélecteur de Région */}
                        <div style={{ position: 'relative' }}>
                            <select
                                value={selectedRegionName}
                                onChange={(e) => setSelectedRegionName(e.target.value)}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '12px',
                                    border: '1px solid #e2e8f0',
                                    background: '#f8fafc',
                                    fontSize: '0.85rem',
                                    fontWeight: '700',
                                    color: '#1e293b',
                                    outline: 'none',
                                    cursor: 'pointer',
                                    appearance: 'none',
                                    paddingRight: '30px'
                                }}
                            >
                                <option value="France">Toute la France</option>
                                {regionsGeoData?.features.map(f => (
                                    <option key={f.properties.nom} value={f.properties.nom}>{f.properties.nom}</option>
                                ))}
                            </select>
                            <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#64748b' }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button onClick={() => setShowLabels(!showLabels)} style={{ ...navBtnStyle, background: showLabels ? '#ebf5ff' : 'transparent', color: showLabels ? '#2563eb' : '#64748b', fontSize: '0.75rem', fontWeight: '800', padding: '6px 10px', border: '1px solid #e2e8f0' }}>
                                VALEURS
                            </button>
                            <button onClick={() => setShowRegions(!showRegions)} style={{ ...navBtnStyle, background: showRegions ? '#ebf5ff' : 'transparent', color: showRegions ? '#2563eb' : '#64748b', fontSize: '0.75rem', fontWeight: '800', padding: '6px 10px', border: '1px solid #e2e8f0' }}>
                                RÉGIONS
                            </button>
                            <button onClick={() => setIsSmooth(!isSmooth)} style={{ ...navBtnStyle, background: isSmooth ? '#ebf5ff' : 'transparent', color: isSmooth ? '#2563eb' : '#64748b', fontSize: '0.75rem', fontWeight: '800', padding: '6px 10px', border: '1px solid #e2e8f0' }}>
                                LISSAGE
                            </button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', padding: '6px', borderRadius: '14px' }}>
                            <button onClick={() => changeDate(-1)} style={navBtnStyle}><ChevronLeft size={20} /></button>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '0 12px' }}>
                                <Calendar size={18} style={{ marginRight: '10px', color: '#3b82f6' }} />
                                <span style={{ fontWeight: '700', fontSize: '1rem', color: '#1e293b' }}>{format(new Date(selectedDate), "dd MMM yyyy", { locale: fr })}</span>
                                <input
                                    type="date"
                                    value={selectedDate}
                                    max={new Date().toISOString().split('T')[0]}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                                />
                            </div>
                            <button
                                onClick={() => changeDate(1)}
                                style={navBtnStyle}
                                disabled={selectedDate === new Date().toISOString().split('T')[0]}
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>

                        <button onClick={loadData} disabled={loading} style={iconBtnStyle} title="Actualiser">
                            <RefreshCw size={22} className={loading ? "animate-spin" : ""} />
                        </button>
                        <button onClick={handleExport} style={{ ...iconBtnStyle, background: '#1e293b', color: 'white' }} title="Exporter l'image">
                            <Download size={22} />
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '12px 18px', background: '#f8fafc', borderRadius: '15px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#475569', minWidth: 'fit-content' }}>Titre personnalisé :</span>
                    <input
                        type="text"
                        value={mapTitle}
                        onChange={(e) => setMapTitle(e.target.value)}
                        placeholder="Ex: Épisode Méditerranéen..."
                        style={{
                            flex: 1,
                            padding: '10px 15px',
                            borderRadius: '10px',
                            border: '1px solid #cbd5e1',
                            fontSize: '1rem',
                            outline: 'none',
                            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                        }}
                    />
                </div>
            </header>

            <main style={{ maxWidth: '1300px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 340px', gap: '25px', paddingBottom: '30px' }}>
                <div ref={mapContainerRef} id="wind-map-container" style={{
                    background: 'white',
                    borderRadius: '4px',
                    padding: '0',
                    boxShadow: 'none',
                    position: 'relative',
                    aspectRatio: '1000 / 920',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    border: '1px solid #000'
                }}>
                    {loading && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                            <div className="loader" style={{ width: '48px', height: '48px', border: '5px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                            <p style={{ marginTop: '20px', fontWeight: '700', color: '#1e40af', fontSize: '1.1rem' }}>Saisie des mesures météo...</p>
                        </div>
                    )}

                    {/* Légende flottante intégrée au téléchargement (haut-droite) */}
                    <div style={{
                        position: 'absolute', top: '15px', right: '15px',
                        background: 'rgba(255, 255, 255, 0.92)', border: '1px solid #000',
                        borderRadius: '8px', padding: '10px 14px', zIndex: 5,
                        boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                        display: 'flex', flexDirection: 'column', gap: '4px'
                    }}>
                        <div style={{ fontSize: '11px', fontWeight: '900', color: '#1e293b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.05em' }}>
                            {windMode === 'direct' ? 'RAFALES EN DIRECT (KM/H)' : 'RAFALES MAX. (KM/H)'}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 8px' }}>
                            {activeWindScale.map(range => (
                                <div key={range.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: range.color, border: '0.5px solid rgba(0,0,0,0.2)', flexShrink: 0 }} />
                                    <span style={{ fontSize: '9.5px', fontWeight: '700', color: '#1e293b' }}>{range.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 5, padding: '20px', textAlign: 'center' }}>
                            <Info size={40} style={{ color: '#ef4444', marginBottom: '12px' }} />
                            <p style={{ fontWeight: '700', color: '#64748b', fontSize: '1.1rem', margin: 0 }}>{error}</p>
                        </div>
                    )}

                    {geoData && !error && (
                        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ width: '100%', height: '100%' }}>
                            <defs>
                                <clipPath id="france-clip">
                                    <path d={combinedPath} />
                                </clipPath>

                                {/* Filtre de flou final pour le mode grille (Heatmap) */}
                                <filter id="grid-blur">
                                    <feGaussianBlur stdDeviation="12" />
                                </filter>
                            </defs>

                            {/* Rendu des Données (Voronoi vs Interpolé) */}
                            <g clipPath="url(#france-clip)">
                                {isSmooth && interpolatedGrid ? (
                                    // MODE LISSÉ : Grille interpolée (Style Modèle Météo)
                                    <g filter="url(#grid-blur)">
                                        {interpolatedGrid.map((p, i) => (
                                            <rect
                                                key={`grid-${i}`}
                                                x={p.x - 1}
                                                y={p.y - 1}
                                                width={p.w + 2}
                                                height={p.h + 2}
                                                fill={getWindColor(p.val, activeWindScale)}
                                                fillOpacity={p.opacity}
                                            />
                                        ))}
                                    </g>
                                ) : (
                                    // MODE STANDARD : Voronoi (Cellules nettes)
                                    <g>
                                        {voronoiCells?.map((cell, idx) => (
                                            <path
                                                key={`cell-${cell.station.id}-${idx}`}
                                                d={cell.path}
                                                fill={getWindColor(cell.station.value, activeWindScale)}
                                                style={{ transition: 'fill 0.4s ease' }}
                                            />
                                        ))}
                                    </g>
                                )}
                            </g>

                            {/* Frontières des départements (superposées - style IGN fin) */}
                            <g fill="none" stroke="black" strokeWidth="0.2" strokeOpacity="0.4">
                                {geoData.features.map((f, idx) => (
                                    <path key={`dept-${f.properties.code || idx}`} d={pathGenerator(f)} />
                                ))}
                            </g>

                            {/* Frontières des Régions (les 13 régions - trait plus fort) */}
                            {showRegions && regionsGeoData && (
                                <g fill="none" stroke="black" strokeWidth="1.2" strokeOpacity="1">
                                    {regionsGeoData.features.map((f, idx) => (
                                        <path
                                            key={`region-${f.properties.code || f.properties.nom || idx}`}
                                            d={pathGenerator(f)}
                                        />
                                    ))}
                                </g>
                            )}

                            {/* Contour de la France plus marqué */}
                            <path
                                d={combinedPath}
                                fill="none"
                                stroke="black"
                                strokeWidth="1.5"
                            />

                            <g>
                                {visibleStations.map(s => {
                                    const coords = projection([s.lon, s.lat]);
                                    if (!coords) return null;
                                    return (
                                        <g key={`marker-${s.id}`} transform={`translate(${coords[0]}, ${coords[1]})`}
                                            style={{ cursor: 'pointer' }}
                                            onMouseEnter={(e) => {
                                                const rect = mapContainerRef.current?.getBoundingClientRect();
                                                if (rect) setHoveredStation({ ...s, x: e.clientX - rect.left, y: e.clientY - rect.top });
                                            }}
                                            onMouseLeave={() => setHoveredStation(null)}
                                            onClick={() => navigate(`/observations/station/${s.id}`)}
                                        >
                                            <circle r={3} fill="transparent" />
                                            <circle r={0.6} fill="black" fillOpacity="0.2" />

                                            {showLabels && s.value !== null && s.value !== undefined && (
                                                <text
                                                    y={selectedRegionName === "France" ? -6 : 0}
                                                    dy={selectedRegionName === "France" ? 0 : "0.35em"}
                                                    textAnchor="middle"
                                                    style={{
                                                        fontSize: selectedRegionName === "France" ? '14px' : '28px',
                                                        fontWeight: 'bold',
                                                        fill: s.value > (windMode === 'direct' ? 60 : 100) ? '#fff' : '#000',
                                                        stroke: s.value > (windMode === 'direct' ? 60 : 100) ? '#000' : '#fff',
                                                        strokeWidth: selectedRegionName === "France" ? '2px' : '4px',
                                                        paintOrder: 'stroke',
                                                        pointerEvents: 'none',
                                                        fontFamily: 'sans-serif'
                                                    }}
                                                >
                                                    {Math.round(s.value)}
                                                </text>
                                            )}
                                        </g>
                                    );
                                })}
                            </g>
                        </svg>
                    )}

                    {/* Tooltip au survol */}
                    {hoveredStation && (
                        <div style={{
                            position: 'absolute',
                            left: hoveredStation.x + 15, top: hoveredStation.y - 10,
                            background: 'rgba(15,23,42,0.95)', color: 'white',
                            padding: '8px 12px', borderRadius: '8px',
                            fontSize: '0.8rem', fontWeight: '700',
                            pointerEvents: 'none', zIndex: 20,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                            whiteSpace: 'nowrap', maxWidth: '250px'
                        }}>
                            <div style={{ fontWeight: '800', marginBottom: '2px' }}>{hoveredStation.name}</div>
                            <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>Station {hoveredStation.id} — Dpt {hoveredStation.id.substring(0, 2)}</div>
                            <div style={{ marginTop: '4px', fontSize: '1rem', fontWeight: '900', color: '#fbbf24' }}>{Math.round(hoveredStation.value)} km/h</div>
                        </div>
                    )}

                     {/* Bloc Titre Image (Style épuré et pro) */}
                     <div style={{ position: 'absolute', bottom: '55px', left: '30px', padding: '12px 20px', background: 'rgba(255,255,255,0.85)', borderRadius: '8px', border: '1px solid #000' }}>
                         <div style={{ fontSize: '1.6rem', fontWeight: '1000', color: '#000', textTransform: 'uppercase', lineHeight: '1.2' }}>{mapTitle}</div>
                         <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#000', marginTop: '4px' }}>
                             {format(new Date(selectedDate), "EEEE d MMMM yyyy", { locale: fr })}
                         </div>
                         {lastDataTimestamp && (
                             <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#555', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                 <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: isRealTime ? '#10b981' : '#f59e0b', flexShrink: 0 }} />
                                 Dernière obs. à {lastDataTimestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                             </div>
                         )}
                     </div>

                    {/* Logo Personnel (Bas Droite) */}
                    <div style={{ position: 'absolute', bottom: '55px', right: '30px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                        <img src="/logo.jpg" alt="Logo" style={{ height: '60px', borderRadius: '8px', border: '1px solid #000', background: 'white' }} />
                        <span style={{ fontSize: '0.75rem', color: '#000', fontWeight: '900', letterSpacing: '0.05em' }}>WWW.METEO-CLIMAT.PRO</span>
                    </div>

                    {/* Légende Horizontale (sous la carte, pas de chevauchement) */}
                    <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        background: 'rgba(255,255,255,0.95)',
                        padding: '6px 12px',
                        borderTop: '1px solid #000',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: '2px', flexWrap: 'wrap'
                    }}>
                        <span style={{ fontSize: '10px', fontWeight: '1000', color: '#000', marginRight: '6px' }}>km/h</span>
                        {activeWindScale.filter(r => r.min >= (windMode === 'direct' ? 20 : 60) && r.max !== Infinity).map(range => (
                            <div key={range.min} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div style={{ width: '28px', height: '14px', background: range.color, border: '0.5px solid rgba(0,0,0,0.3)' }} />
                                <span style={{ fontSize: '8px', fontWeight: '800', color: '#000', marginTop: '1px' }}>{range.min}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Légende */}
                    <div style={{ background: 'white', borderRadius: '20px', padding: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>
                            {windMode === 'direct' ? 'Vent Temps Réel (km/h)' : 'Vitesse Rafales (km/h)'}
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                            {activeWindScale.map(range => (
                                <div key={range.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: '18px', height: '18px', borderRadius: '4px', background: range.color, border: '1px solid rgba(0,0,0,0.05)' }}></div>
                                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569' }}>{range.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Top Rafales */}
                    <div style={{ background: 'white', borderRadius: '20px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ margin: '0 0 15px', fontSize: '1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Wind size={18} style={{ color: windMode === 'direct' ? '#10b981' : '#3b82f6' }} /> Top Rafales
                        </h3>
                        <div style={{ overflowY: 'auto', flex: 1 }} className="custom-scrollbar">
                                {visibleStations.length > 0 ? (
                                    [...visibleStations].sort((a, b) => b.value - a.value).slice(0, 15).map((s, i) => (
                                    <div key={s.id} style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '8px 0',
                                        borderBottom: i === 14 ? 'none' : '1px solid #f1f5f9'
                                    }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '180px' }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Dpt {s.id.substring(0, 2)}</span>
                                        </div>
                                        <div style={{
                                            background: getWindColor(s.value, activeWindScale),
                                            color: s.value > (windMode === 'direct' ? 60 : 100) ? 'white' : '#1e293b',
                                            padding: '4px 8px',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem',
                                            fontWeight: '800'
                                        }}>
                                            {Math.round(s.value)} <small>km/h</small>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p style={{ fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center' }}>Aucune donnée</p>
                            )}
                        </div>
                    </div>

                    {/* Infos API */}
                    <div style={{ background: '#e0f2fe', borderRadius: '20px', padding: '15px', display: 'flex', gap: '12px' }}>
                        <Info className="text-blue-600" size={20} style={{ shrink: 0 }} />
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#0369a1', lineHeight: '1.4' }}>
                            {windMode === 'direct' ? (
                                "Données issues des stations automatiques du réseau Météo-France en temps réel (mesures sur les 6 dernières minutes). La valeur affichée est la rafale ou vitesse moyenne maximale enregistrée récemment."
                            ) : (
                                "Données issues des stations automatiques du réseau Météo-France. La valeur affichée est la rafale maximale (FXI3S) enregistrée par département sur la journée."
                            )}
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
};

const navBtnStyle = {
    padding: '6px',
    borderRadius: '8px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    color: '#64748b',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s'
};

const iconBtnStyle = {
    width: '40px',
    height: '40px',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
    background: 'white',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#64748b',
    transition: 'all 0.2s'
};

export default WindGustMap;
