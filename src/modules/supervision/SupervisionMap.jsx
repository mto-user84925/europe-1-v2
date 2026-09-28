import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, ImageOverlay, useMap, Marker, Tooltip, GeoJSON, Circle, ScaleControl } from 'react-leaflet';
import {
    Activity, Zap, Waves, Radio, ShieldAlert, Clock, Play, Pause, ChevronRight,
    Square, Search, Layers, Maximize, RefreshCw, X, Crosshair, Settings2, Calendar
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchDepartementsGeoJSON } from '../../services/vigicruuesService';
import { MAIN_CITIES } from "../../data/mainCities";
import { LIGHTNING_DESIGNS } from '../foudre/LightningStyles';
import { CARTO_TILES } from '../../constants/carto';
import './SupervisionMap.css';

const HOUR_COLORS = [
    "#0000FF", "#0022FF", "#0044FF", "#0066FF", "#0088FF", "#00AAFF", // 0h-5h
    "#00CCFF", "#00EEFF", "#00FFDD", "#00FFBB", "#00FF99", "#00FF77", // 6h-11h
    "#00FF00", "#77FF00", "#BBFF00", "#FFFF00", "#FFCC00", "#FFAA00", // 12h-17h
    "#FF8800", "#FF6600", "#FF4400", "#FF2200", "#FF0000", "#8B0000"  // 18h-23h
];

const RADAR_SCHEMES = [
    { id: 2, name: 'Météo-France (HD)', colors: ['#dbeafe', '#3b82f6', '#10b981', '#facc15', '#ef4444'] },
    { id: 1, name: 'Bleu Universel', colors: ['#eff6ff', '#60a5fa', '#2563eb', '#1e40af', '#1e3a8a'] },
    { id: 6, name: 'Arc-en-Ciel', colors: ['#3b82f6', '#10b981', '#facc15', '#f97316', '#ef4444'] },
    { id: 8, name: 'Contrasté (OWM)', colors: ['#ffffff', '#0000ff', '#00ff00', '#ffff00', '#ff0000'] }
];

const MAP_STYLES = {
    DARK: { name: 'Mode Carbone', url: CARTO_TILES.DARK_NOLABELS, labels: CARTO_TILES.DARK_ONLY_LABELS },
    LIGHT: { name: 'Mode Clair', url: CARTO_TILES.LIGHT_NOLABELS, labels: CARTO_TILES.LIGHT_ONLY_LABELS }
};

const MousePosition = () => {
    const [pos, setPos] = useState(null);
    const map = useMap();

    useEffect(() => {
        const onMouseMove = (e) => setPos(e.latlng);
        map.on('mousemove', onMouseMove);
        return () => map.off('mousemove', onMouseMove);
    }, [map]);

    if (!pos) return null;

    return (
        <div className="mouse-coords-overlay">
            <span className="coord-label">LAT:</span> <span className="coord-val">{pos.lat.toFixed(4)}°</span>
            <span className="coord-label">LON:</span> <span className="coord-val">{pos.lng.toFixed(4)}°</span>
        </div>
    );
};

const FRANCE_BOUNDS = [[41.3, -5.2], [51.1, 9.6]]; // France métro + Corse

function MapController({ center, zoom, bounds }) {
    const map = useMap();
    useEffect(() => {
        if (bounds) map.fitBounds(bounds, { animate: true, padding: [20, 20] });
        else if (center) map.setView(center, zoom, { animate: true });
    }, [center, zoom, bounds, map]);
    return null;
}


const FastLightningLayer = ({ strikes, colors, designId = 'Classic' }) => {
    const map = useMap();
    const canvasRef = useRef(null);
    const requestRef = useRef();
    const lastDrawRef = useRef(0);

    // ponytail: stocke les props dans des refs pour que la boucle RAF les lise à jour sans recréer le canvas ni relancer l'effet
    const strikesRef = useRef(strikes);
    const designIdRef = useRef(designId);
    strikesRef.current = strikes;
    designIdRef.current = designId;

    useEffect(() => {
        if (!canvasRef.current) {
            const container = map.getContainer();
            const newCanvas = document.createElement('canvas');
            newCanvas.style.position = 'absolute';
            newCanvas.style.top = '0';
            newCanvas.style.left = '0';
            newCanvas.style.pointerEvents = 'none';
            newCanvas.style.zIndex = '5000';
            newCanvas.className = 'lightning-canvas-overlay';
            container.appendChild(newCanvas);
            canvasRef.current = newCanvas;
        }

        const FRAME_MS = 50;

        const draw = () => {
            const c = canvasRef.current;
            if (!c) return;
            const size = map.getSize();
            if (c.width !== size.x || c.height !== size.y) { c.width = size.x; c.height = size.y; }
            const ctx = c.getContext('2d');
            ctx.clearRect(0, 0, c.width, c.height);

            const design = LIGHTNING_DESIGNS[designIdRef.current] || LIGHTNING_DESIGNS.Classic;
            const strobe = Math.sin(Date.now() / 150) > 0;
            const currentStrikes = strikesRef.current;

            // ponytail: Algorithme du peintre — on dessine du plus ancien au plus récent (boucle inversée)
            for (let i = currentStrikes.length - 1; i >= 0; i--) {
                const s = currentStrikes[i];
                const px = map.latLngToContainerPoint([s.lat, s.lon]);
                if (px.x < -20 || px.y < -20 || px.x > size.x + 20 || px.y > size.y + 20) continue;
                const color = '#ff0000';
                ctx.save();
                design.render(ctx, px.x, px.y, 4, color, false);
                ctx.restore();
                if (s.isRecent && strobe) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(px.x, px.y, 10, 0, Math.PI * 2);
                    ctx.fillStyle = color;
                    ctx.globalAlpha = 0.4;
                    ctx.fill();
                    ctx.globalAlpha = 1;
                    ctx.restore();
                }
            }
        };

        const animate = (ts) => {
            if (ts - lastDrawRef.current >= FRAME_MS) {
                draw();
                lastDrawRef.current = ts;
            }
            requestRef.current = requestAnimationFrame(animate);
        };

        requestRef.current = requestAnimationFrame(animate);

        return () => {
            cancelAnimationFrame(requestRef.current);
            if (canvasRef.current) {
                canvasRef.current.remove();
                canvasRef.current = null;
            }
        };
    }, [map]);

    return null;
};


const SupervisionMap = () => {
    // --- LAYERS STATE ---
    const [layers, setLayers] = useState({
        radar: true,
        foudre: true,
        villes: true
    });
    const [mapStyle, setMapStyle] = useState('LIGHT');
    const [foudreDesign, setFoudreDesign] = useState('Classic');

    useEffect(() => {
        console.log("Designs Foudre chargés:", Object.keys(LIGHTNING_DESIGNS || {}));
    }, []);

    // --- RADAR STATE ---
    const [timestamps, setTimestamps] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(true);
    const [radarScheme, setRadarScheme] = useState(2);
    const [radarSource, setRadarSource] = useState('rainviewer'); // 'rainviewer' or 'meteofrance'
    const [radarHost, setRadarHost] = useState('https://tilecache.rainviewer.com');
    const [isSmoothed, setIsSmoothed] = useState(true);
    const timerRef = useRef(null);
    const searchTimeoutRef = useRef(null);

    useEffect(() => {
        return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
    }, []);

    useEffect(() => {
        fetchRadarTimestamps(radarSource);
    }, [radarSource]);

    // --- FOUDRE STATE ---
    const [strikes, setStrikes] = useState([]);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('sv-SE')); // YYYY-MM-DD
    const [bilanImage, setBilanImage] = useState(null); // Image bilan si disponible
    const [viewMode, setViewMode] = useState('live'); // 'live' ou 'bilan'

    // --- DEPARTEMENTS STATE ---
    const [deptGeo, setDeptGeo] = useState(null);

    // --- GLOBAL ---
    const [loading, setLoading] = useState(true);
    const [mapCenter, setMapCenter] = useState(null); // null = fitBounds auto
    const [mapZoom, setMapZoom] = useState(null);
    const [mapBounds, setMapBounds] = useState(FRANCE_BOUNDS); // France + Corse auto
    const [searchQuery, setSearchQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);

    // Vérifier si un bilan image existe pour la date sélectionnée
    const checkBilanImage = async (date) => {
        try {
            const { data } = await supabase
                .from('foudre_bilans')
                .select('image_url, impact_count')
                .eq('date', date)
                .single();

            if (data && data.image_url) {
                setBilanImage(data);
                setViewMode('bilan'); // Auto-basculer en mode bilan
                return true;
            }
        } catch {
            // Pas de bilan
        }
        setBilanImage(null);
        setViewMode('live');
        return false;
    };

    const fetchRadarTimestamps = async (source) => {
        try {
            if (source === 'rainviewer') {
                const res = await fetch(`https://api.rainviewer.com/public/weather-maps.json`);
                const data = await res.json();
                const frames = data.radar?.past || [];
                if (frames.length > 0) {
                    // Conserver les 13 dernières frames (~1h de historique à intervalles de 5 min)
                    const sliced = frames.slice(-13);
                    const framesToSet = sliced.map(frame => ({
                        time: frame.time,
                        path: frame.path,
                        host: data.host,
                    }));
                    setTimestamps(framesToSet);
                    setCurrentIndex(framesToSet.length - 1);
                }
            } else {
                // meteofrance
                let manifest;
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                const supabaseManifestUrl = supabaseUrl
                    ? `${supabaseUrl}/storage/v1/object/public/radar-mf/manifest.json?t=${Date.now()}`
                    : null;

                try {
                    if (supabaseManifestUrl) {
                        const res = await fetch(supabaseManifestUrl);
                        if (res.ok) manifest = await res.json();
                    }
                } catch (e) { /* fallback to local */ }

                if (!manifest) {
                    const response = await fetch(`/radar-mf/manifest.json?t=${Date.now()}`);
                    manifest = await response.json();
                }

                if (manifest.frames && manifest.frames.length > 0) {
                    const baseUrl = manifest.base_url || '/radar-mf/';
                    const framesToSet = manifest.frames.map(frame => {
                        const ts = frame.timestamp;
                        const year = parseInt(ts.substring(0, 4));
                        const month = parseInt(ts.substring(4, 6)) - 1;
                        const day = parseInt(ts.substring(6, 8));
                        const hour = parseInt(ts.substring(8, 10));
                        const min = parseInt(ts.substring(10, 12));
                        const sec = parseInt(ts.substring(12, 14));
                        const date = new Date(Date.UTC(year, month, day, hour, min, sec));

                        return {
                            time: date.getTime() / 1000,
                            filename: frame.filename,
                            imageUrl: `${baseUrl}${frame.filename}`,
                            leaflet_bounds: manifest.leaflet_bounds,
                            iso: date.toISOString(),
                        };
                    }).slice(-13);

                    setTimestamps(framesToSet);
                    setCurrentIndex(framesToSet.length - 1);
                }
            }
        } catch (err) {
            console.error("Error fetching radar timestamps:", err);
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            // ponytail: Chargement parallèle complet pour afficher simultanément la foudre, le radar et les contours
            await Promise.all([
                fetchRadarTimestamps(radarSource),
                fetchStrikes(),
                fetchDepartementsGeoJSON().then(depts => {
                    if (depts) setDeptGeo(depts);
                })
            ]);
        } catch (e) {
            console.error("Supervision fetch error:", e);
        } finally {
            setLoading(false);
        }
    };

    const fetchStrikes = async () => {
        try {
            const now = new Date();
            const today = now.toLocaleDateString('sv-SE');
            const isLive = selectedDate === today;
            let allData = [];

            // Pour le mode LIVE : récupérer les dernières 24h glissantes (aujourd'hui + hier)
            // Pour le mode ARCHIVE : récupérer uniquement la date sélectionnée
            const datesToFetch = isLive
                ? [today, new Date(now.getTime() - 24 * 60 * 60 * 1000).toLocaleDateString('sv-SE')]
                : [selectedDate];

            console.log(`⚡ Supervision: Fetching strikes for ${datesToFetch.join(' + ')} (Live 24h: ${isLive})...`);

            if (isLive) {
                try {
                    // ponytail: 90min pour le live supervision (vs 1440 avant — cause principale des latences)
                    const res = await fetch('https://meteo-npdc.fr/api/v2/lightning/get_latest?minutes=90', {
                        referrerPolicy: "no-referrer"
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);

                    const json = await res.json();
                    if (json.success && Array.isArray(json.data)) {
                        // Filtre bbox France métropolitaine (NPDC couvre toute l'Europe)
                        allData = json.data
                            .filter(s => {
                                const lat = parseFloat(s.latitude), lon = parseFloat(s.longitude);
                                return lat >= 41 && lat <= 52 && lon >= -5.5 && lon <= 10;
                            })
                            .map((s, i) => {
                            const d = new Date(s.timestamp ? s.timestamp.replace(' ', 'T') : Date.now());
                            const timeMs = d.getTime();
                            const validTime = isNaN(timeMs) ? Date.now() : timeMs;
                            const validD = new Date(validTime);
                            return {
                                lat: parseFloat(s.latitude),
                                lon: parseFloat(s.longitude),
                                time: validTime,
                                h: validD.getHours(),
                                minute: validD.getHours() * 60 + validD.getMinutes(),
                                isRecent: (Date.now() - validTime) / 60000 < 15,
                                id: `live-super-${s.timestamp || i}-${i}`
                            };
                        });
                        console.log(`✅ Supervision: ${allData.length} impacts récupérés via meteo-npdc.fr (90min, bbox France).`);
                    }
                } catch (err) {
                    console.warn(`⚠️ Supervision: Fetch lightning warning:`, err.message);
                }
            } else {
                // ponytail: Mode archive 100% statique GitHub sans Supabase
                try {
                    const formattedDateFile = selectedDate.replace(/-/g, '');
                    const ARCHIVE_BASE = 'https://raw.githubusercontent.com/monsieurmeteo/europe-1-v2/master/public/archives_orage';
                    const res = await fetch(`${ARCHIVE_BASE}/orage_${formattedDateFile}.json?t=${Date.now()}`, { cache: 'no-store' });
                    if (res.ok) {
                        const json = await res.json();
                        if (Array.isArray(json)) {
                            allData = json.map((s, i) => {
                                const cleanDate = s.date.replace(/\//g, '-');
                                const d = new Date(`${cleanDate}T${s.heure}:00`);
                                return {
                                    lat: parseFloat(s.lat), lon: parseFloat(s.lon),
                                    time: d.getTime(), h: d.getHours(),
                                    minute: d.getHours() * 60 + d.getMinutes(),
                                    isRecent: false,
                                    id: `strike-super-arch-${i}`
                                };
                            });
                            console.log(`✅ Supervision: ${allData.length} impacts chargés depuis l'archive statique.`);
                        }
                    }
                } catch (err) {
                    console.warn(`Aucune archive statique trouvée pour la supervision : ${selectedDate}`);
                }
            }

            // En mode LIVE, filtrer pour ne garder que les dernières 24h
            if (isLive && allData.length > 0) {
                const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
                const before = allData.length;
                allData = allData.filter(s => s.time >= cutoff);
                console.log(`📊 Filtrage 24h: ${before} → ${allData.length} impacts`);
            }

            setStrikes(allData);
        } catch (e) { console.error("Strikes error:", e); }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Refresh strikes when date changes
    useEffect(() => {
        const isLive = selectedDate === new Date().toLocaleDateString('sv-SE');

        let timer;
        // Si mode archive, vérifier si un bilan image existe avec un debounce de 300ms
        if (!isLive) {
            timer = setTimeout(() => {
                checkBilanImage(selectedDate);
            }, 300);
        } else {
            setBilanImage(null);
            setViewMode('live');
        }

        fetchStrikes();
        // Only auto-refresh if viewing live data
        const interval = isLive ? setInterval(fetchStrikes, 60000) : null;
        return () => {
            if (timer) clearTimeout(timer);
            if (interval) clearInterval(interval);
        };
    }, [selectedDate]);

    useEffect(() => {
        if (!isPlaying || timestamps.length === 0) return;
        const isLastFrame = currentIndex === timestamps.length - 1;
        // ponytail: pause fluide de 1400ms sur la dernière frame (vs 4000ms avant) pour éviter l'impression de blocage
        const delay = isLastFrame ? 1400 : 800;
        timerRef.current = setTimeout(() => {
            setCurrentIndex(prev => (prev === timestamps.length - 1 ? 0 : prev + 1));
        }, delay);
        return () => clearTimeout(timerRef.current);
    }, [isPlaying, currentIndex, timestamps]);

    const animatedStrikes = useMemo(() => {
        if (timestamps.length === 0 || currentIndex >= timestamps.length) {
            return strikes;
        }
        const activeFrame = timestamps[currentIndex];
        const frameTimeMs = activeFrame.time * 1000;
        
        // Filtrer les impacts dans une fenêtre de 15 minutes se terminant au moment de l'image active
        const windowSizeMs = 15 * 60 * 1000;
        
        return strikes.filter(s => s.time <= frameTimeMs && s.time >= (frameTimeMs - windowSizeMs));
    }, [strikes, timestamps, currentIndex]);

    const handleSearch = (q) => {
        setSearchQuery(q);
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

        const isNumeric = /^\d+$/.test(q);
        if (q.length < (isNumeric ? 2 : 3)) { setSuggestions([]); return; }

        searchTimeoutRef.current = setTimeout(async () => {
            try {
                const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5&type=municipality`);
                const d = await res.json();
                setSuggestions(d.features || []);
            } catch (e) { }
        }, 300);
    };

    const selectCity = (city) => {
        const [lon, lat] = city.geometry.coordinates;
        setSelectedLocation({ lat, lon, name: city.properties.city, postcode: city.properties.postcode });
        setMapBounds(null); // Désactive fitBounds pour utiliser setView
        setMapCenter([lat, lon]);
        setMapZoom(10);
        setSearchQuery('');
        setSuggestions([]);
    };

    return (
        <div className="super-app">
            <nav className="super-nav">
                <div className="nav-group main-branding">
                    <div className="status-dot-container">
                        <div className="status-dot pulsing" />
                        <span className="live-label">LIVE SYSTEM</span>
                    </div>
                    <h1>COMMAND CENTER <span className="v-tag">PRO</span></h1>
                </div>

                <div className="nav-divider" />

                <div className="nav-group layer-selector-compact">
                    <label className="layer-option">
                        <input type="checkbox" checked={layers.radar} onChange={() => setLayers(l => ({ ...l, radar: !l.radar }))} />
                        <span>RADAR</span>
                    </label>
                    <label className="layer-option">
                        <input type="checkbox" checked={layers.foudre} onChange={() => setLayers(l => ({ ...l, foudre: !l.foudre }))} />
                        <span>FOUDRE</span>
                    </label>
                    <label className="layer-option">
                        <input type="checkbox" checked={layers.villes} onChange={() => setLayers(l => ({ ...l, villes: !l.villes }))} />
                        <span>VILLES</span>
                    </label>
                    <label className="layer-option" style={{ color: '#3b82f6' }}>
                        <input type="checkbox" checked={isSmoothed} onChange={(e) => setIsSmoothed(e.target.checked)} />
                        <span>LISSAGE</span>
                    </label>
                </div>

                <div className="nav-divider flex-grow" />

                <div className="nav-group center-actions">
                    <button className="icon-btn" onClick={fetchData} title="Resynchroniser">
                        <RefreshCw size={18} className={loading ? 'spin' : ''} />
                    </button>

                    <div className="style-selector">
                        <Zap size={16} className="style-icon" />
                        <select value={foudreDesign} onChange={e => setFoudreDesign(e.target.value)}>
                            {LIGHTNING_DESIGNS && Object.entries(LIGHTNING_DESIGNS).map(([id, d]) => (
                                <option key={id} value={id}>{d.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="style-selector">
                        <Radio size={16} className="style-icon" />
                        <select value={radarSource} onChange={e => setRadarSource(e.target.value)}>
                            <option value="rainviewer">Radar RainViewer (Mondial)</option>
                            <option value="meteofrance">Radar Météo-France (HD)</option>
                        </select>
                    </div>

                    <div className="style-selector">
                        <Waves size={16} className="style-icon" />
                        <select value={radarScheme} onChange={e => setRadarScheme(parseInt(e.target.value))}>
                            {RADAR_SCHEMES.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="style-selector">
                        <Layers size={16} className="style-icon" />
                        <select value={mapStyle} onChange={e => setMapStyle(e.target.value)}>
                            {Object.entries(MAP_STYLES).map(([id, s]) => (
                                <option key={id} value={id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </nav>

            <main className="super-layout">
                <div className="super-overlay-panel left">
                    {/* Sélecteur de date en premier */}
                    <div className="panel-box date-panel">
                        <div className="date-header">
                            <Zap size={14} />
                            <span>FOUDRE - {selectedDate === new Date().toLocaleDateString('sv-SE') ? 'DIRECT 24H' : 'ARCHIVES'}</span>
                        </div>
                        <div className="date-selector-supervision">
                            <Calendar size={14} />
                            <input
                                type="date"
                                value={selectedDate}
                                max={new Date().toISOString().split('T')[0]}
                                onChange={(e) => setSelectedDate(e.target.value)}
                            />
                            {selectedDate !== new Date().toLocaleDateString('sv-SE') && (
                                <button className="reset-date-btn" onClick={() => setSelectedDate(new Date().toLocaleDateString('sv-SE'))}>
                                    LIVE
                                </button>
                            )}
                        </div>
                        <div className="strike-count-inline">
                            <span className="count-value">{strikes.length.toLocaleString()}</span>
                            <span className="count-label">impacts</span>
                        </div>
                    </div>

                    {/* Recherche */}
                    <div className="panel-box search-panel">
                        <div className="search-input-wrapper">
                            <Search size={16} className="search-icon" />
                            <input
                                type="text" placeholder="Analyser un lieu..."
                                value={searchQuery} onChange={e => handleSearch(e.target.value)}
                            />
                            {suggestions.length > 0 && (
                                <div className="floating-suggestions">
                                    {suggestions.map((s, i) => (
                                        <div key={i} onClick={() => selectCity(s)} className="suggestion-item">
                                            <span>{s.properties.city}</span> <small>{s.properties.postcode}</small>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {layers.radar && timestamps.length > 0 && (
                        <div className="panel-box player-panel">
                            <div className="player-top">
                                <span className="time-display">{new Date(timestamps[currentIndex].time * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                                <button className="play-btn" onClick={() => setIsPlaying(!isPlaying)}>
                                    {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                                </button>
                            </div>
                            <div className="player-track">
                                {timestamps.map((_, i) => (
                                    <div key={i} className={`track-segment ${i <= currentIndex ? 'filled' : ''} ${i === currentIndex ? 'active' : ''}`} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="map-view-wrapper">
                    {/* Overlay bilan image si mode archive avec image */}
                    {viewMode === 'bilan' && bilanImage && (
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            zIndex: 2000,
                            background: '#0f172a',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <div style={{
                                background: 'rgba(239, 68, 68, 0.15)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '12px',
                                padding: '10px 24px',
                                marginBottom: '15px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px'
                            }}>
                                <span style={{ fontSize: '1.5rem' }}>📷</span>
                                <div>
                                    <div style={{ color: '#fff', fontWeight: 900, fontSize: '1rem' }}>
                                        BILAN ARCHIVÉ - {new Date(selectedDate).toLocaleDateString('fr-FR')}
                                    </div>
                                    <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700 }}>
                                        {bilanImage.impact_count?.toLocaleString() || 'N/A'} impacts détectés
                                    </div>
                                </div>
                            </div>
                            <img
                                src={bilanImage.image_url}
                                alt={`Bilan foudre ${selectedDate}`}
                                style={{
                                    maxWidth: '95%',
                                    maxHeight: 'calc(100% - 120px)',
                                    borderRadius: '12px',
                                    border: '2px solid rgba(255,255,255,0.1)',
                                    boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
                                }}
                            />
                            <button
                                onClick={() => setViewMode('live')}
                                style={{
                                    marginTop: '15px',
                                    background: '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    padding: '10px 25px',
                                    borderRadius: '10px',
                                    fontWeight: 900,
                                    fontSize: '0.8rem',
                                    cursor: 'pointer'
                                }}
                            >
                                ← VOIR LES DONNÉES EN TEMPS RÉEL
                            </button>
                        </div>
                    )}
                    <MapContainer
                        center={mapCenter || [46.5, 2.5]} zoom={mapZoom || 5}
                        zoomControl={false}
                        zoomSnap={0.1}
                        zoomDelta={0.1}
                        className="super-map-container"
                    >
                        <MapController center={mapCenter} zoom={mapZoom} bounds={mapBounds} />
                        <TileLayer url={MAP_STYLES[mapStyle].url} />
                        <ScaleControl position="bottomleft" imperial={false} />
                        <MousePosition />

                        {/* Couche Radar RainViewer */}
                        {layers.radar && radarSource === 'rainviewer' && timestamps.map((ts, idx) => {
                            if (!ts.path) return null;
                            const isCurrent = idx === currentIndex;
                            const host = ts.host || radarHost || 'https://tilecache.rainviewer.com';
                            const url = `${host}${ts.path}/256/{z}/{x}/{y}/${radarScheme}/1_1.png`;

                            return (
                                <TileLayer
                                    key={`radar-rv-${ts.time}`}
                                    url={url}
                                    className="radar-tile-layer"
                                    opacity={isCurrent ? 0.85 : 0}
                                    zIndex={isCurrent ? 1000 : 100}
                                    maxNativeZoom={12}
                                    maxZoom={18}
                                    tileSize={256}
                                    keepBuffer={8}
                                />
                            );
                        })}

                        {/* Couche Radar Météo-France */}
                        {layers.radar && radarSource === 'meteofrance' && timestamps.map((ts, idx) => {
                            const filename = ts.filename;
                            const bounds = ts.leaflet_bounds;
                            if (!filename || !bounds) return null;
                            const isCurrent = idx === currentIndex;

                            return (
                                <ImageOverlay
                                    key={`radar-mf-${filename}`}
                                    url={ts.imageUrl || `/radar-mf/${filename}`}
                                    bounds={bounds}
                                    className="radar-tile-pro"
                                    opacity={isCurrent ? 0.75 : 0}
                                    zIndex={isCurrent ? 1000 : 100}
                                />
                            );
                        })}

                        {layers.foudre && <FastLightningLayer strikes={animatedStrikes} colors={HOUR_COLORS} designId={foudreDesign} />}

                        {deptGeo && (
                            <GeoJSON
                                key="supervision-depts"
                                data={deptGeo}
                                style={{
                                    color: '#000',
                                    weight: 1.2,
                                    fillOpacity: 0,
                                    interactive: false
                                }}
                            />
                        )}

                        {layers.villes && MAIN_CITIES.map((city, i) => (
                            <Marker
                                key={i}
                                position={[city.lat, city.lon]}
                                icon={L.divIcon({
                                    className: 'city-label-expert',
                                    html: `<div style="text-align:center;"><div style="width:4px;height:4px;background:#000;border-radius:50%;margin:0 auto 1px;"></div><span style="font-size:11px;font-weight:1000;color:#000;text-shadow:0 0 4px #fff, 0 0 2px #fff;">${city.name}</span></div>`,
                                    iconSize: [60, 40],
                                    iconAnchor: [30, 5]
                                })}
                            />
                        ))}

                        {selectedLocation && (
                            <Marker position={[selectedLocation.lat, selectedLocation.lon]}>
                                <Tooltip permanent direction="top" offset={[0, -10]}>{selectedLocation.name}</Tooltip>
                            </Marker>
                        )}
                    </MapContainer>
                </div>

                <div className="super-overlay-panel right">
                    <button className="view-btn" onClick={() => { setMapCenter([46.4, 2.2]); setMapZoom(5.7); setSelectedLocation(null); }}>
                        <Maximize size={16} /> RECADRER FRANCE
                    </button>

                    <div className="legend-group-container">
                        {layers.foudre && (
                            <div className="legend-box-glass large">
                                <label className="legend-header-main">Chronologie des Impacts (24h)</label>
                                <div className="foudre-grid-24-large">
                                    {HOUR_COLORS.map((c, i) => (
                                        <div key={i} className="color-tick-large" style={{ backgroundColor: c }}>
                                            {i % 4 === 0 && <span className="tick-label">{i}h</span>}
                                        </div>
                                    ))}
                                </div>
                                <div className="legend-status-live">
                                    <div className="pulse-dot-red" />
                                    <span>EN DIRECT (-15 MIN) : CLIGNOTEMENT SYSTÉMATIQUE</span>
                                </div>
                            </div>
                        )}

                        {layers.radar && (
                            <div className="legend-box-glass large">
                                <label className="legend-header-main">Intensité des Précipitations</label>
                                <div 
                                    className="radar-gradient-line-large" 
                                    style={radarSource === 'rainviewer' ? {
                                        background: `linear-gradient(to right, ${RADAR_SCHEMES.find(s => s.id === radarScheme)?.colors.join(', ') || '#ccc'})`
                                    } : {}}
                                />
                                <div className="legend-range-labels-pro">
                                    <span className="lvl-low">FAIBLE</span>
                                    <span className="lvl-med">MODÉRÉE</span>
                                    <span className="lvl-high">FORTE</span>
                                    <span className="lvl-extreme">ORAGE</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default SupervisionMap;
