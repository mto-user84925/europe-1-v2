import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, ImageOverlay, useMap, Marker, Popup, GeoJSON, Tooltip, ScaleControl } from 'react-leaflet';
import { Play, ChevronRight, Clock, Globe, Map as MapIcon, Layers, Square, Download, Thermometer, Wind, Zap, Calendar, Film, Radio } from 'lucide-react';
import html2canvas from 'html2canvas';
import gifshot from 'gifshot';
import L from 'leaflet';
import { createClient } from '@supabase/supabase-js';
import 'leaflet/dist/leaflet.css';
import './RadarFrance.css';
import { MAIN_CITIES } from "../../data/mainCities";
import { CARTO_TILES } from '../../constants/carto';

const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Fix pour les icônes Leaflet par défaut
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const ZONES = {
    METROPOLE: { name: 'France (Métropole)', center: [46.4, 2.2], zoom: 5.7 },
    HAUTS_DE_FRANCE: { name: 'Hauts-de-France', center: [50.1, 2.9], zoom: 8 },
    NORMANDIE: { name: 'Normandie', center: [49.1, 0.4], zoom: 8 },
    ILE_DE_FRANCE: { name: 'Île-de-France', center: [48.8, 2.3], zoom: 9 },
    GRAND_EST: { name: 'Grand Est', center: [48.7, 5.8], zoom: 7 },
    BRETAGNE: { name: 'Bretagne', center: [48.2, -2.9], zoom: 8 },
    OCCITANIE: { name: 'Occitanie', center: [43.6, 1.4], zoom: 7 },
    PACA: { name: 'PACA', center: [43.9, 6.0], zoom: 8 },
    AUVERGNE_RHONE_ALPES: { name: 'Auvergne-Rhône-Alpes', center: [45.5, 5.3], zoom: 7 },
    NOUVELLE_AQUITAINE: { name: 'Nouvelle-Aquitaine', center: [45.4, 0.5], zoom: 7 }
};

const RADAR_SCHEMES = [
    { id: 6, name: 'Arc-en-Ciel (Officiel HD)', colors: ['#00009c', '#2d65d4', '#4aa4ff', '#00d000', '#faff00', '#ff9c00', '#ff0000'] },
    { id: 2, name: 'Météo-France (Soft)', colors: ['#dbeafe', '#3b82f6', '#10b981', '#facc15', '#ef4444'] }
];

const MAP_STYLES = {
    DARK:      { name: 'Nuit Expert (Recommandé)', url: CARTO_TILES.DARK_ALL },
    RELIEF:    { name: 'Relief / Terrain',           url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}' },
    SATELLITE: { name: 'Photo satellite',             url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' },
    STANDARD:  { name: 'Villes & Frontières',       url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' }
};

const MAIN_STATIONS = [
    { id: '59350001', name: 'Lille', pos: [50.57, 3.10] },
    { id: '59178001', name: 'Douai', pos: [50.37, 3.08] },
    { id: '80001001', name: 'Abbeville', pos: [50.14, 1.83] },
    { id: '75114001', name: 'Paris', pos: [48.82, 2.34] },
    { id: '67124001', name: 'Strasbourg', pos: [48.55, 7.63] },
    { id: '29019001', name: 'Brest', pos: [48.45, -4.41] },
    { id: '44020001', name: 'Nantes', pos: [47.15, -1.61] },
    { id: '69029001', name: 'Lyon', pos: [45.72, 4.95] },
    { id: '33281001', name: 'Bordeaux', pos: [44.83, -0.69] },
    { id: '34172002', name: 'Montpellier', pos: [43.58, 3.96] },
    { id: '13054001', name: 'Marseille', pos: [43.44, 5.21] },
    { id: '06088001', name: 'Nice', pos: [43.65, 7.21] },
    { id: '31069001', name: 'Toulouse', pos: [43.63, 1.37] }
];

const PERIODS = [
    { id: '2H', name: 'Dernières 2h', count: 12 },
    { id: '6H', name: 'Dernières 6h', count: 36 },
    { id: '12H', name: 'Dernières 12h', count: 72 },
    { id: '24H', name: 'Dernières 24h', count: 144 }
];



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
        <div className="mouse-coords-overlay-radar">
            <span className="coord-label">LAT:</span> <span className="coord-val">{pos.lat.toFixed(4)}°</span>
            <span className="coord-label">LON:</span> <span className="coord-val">{pos.lng.toFixed(4)}°</span>
        </div>
    );
};

function MapController({ lat, lon, zoom }) {
    const map = useMap();
    const lastPos = useRef(null);

    useEffect(() => {
        const currentPos = `${lat},${lon},${zoom}`;
        if (lastPos.current === currentPos) return;

        map.setView([lat, lon], zoom, { animate: false });
        lastPos.current = currentPos;
    }, [lat, lon, zoom, map]);
    return null;
}

const RadarMap = ({ zone, currentZoneId, timestamps, currentIndex, mapStyle, showCities, deptGeojson, overlayType, observations, lightningStrikes, selectedCity, radarSource }) => {
    const radarScheme = 6; // Fixed Arc-en-Ciel HD
    const isSmoothed = false; // Fixed sharp pixels
    const showRoads = false; // Fixed no roads

    return (
        <div className="radar-map-inner-wrapper" style={{ width: '100%', height: '100%', position: 'relative' }}>
            <MapContainer
                key={`${mapStyle}-${currentZoneId}`}
                center={zone.center}
                zoom={zone.zoom}
                zoomSnap={0.1}
                zoomDelta={0.1}
                className={`radar-leaflet-map style-${mapStyle}`}
                zoomControl={false}
                maxZoom={20}
                preferCanvas={false}
            >
                <TileLayer
                    url={MAP_STYLES[mapStyle].url}
                    attribution='&copy; ESRI &copy; OpenStreetMap'
                />





                <ScaleControl position="bottomleft" imperial={false} />
                <MousePosition />

                {deptGeojson && (
                    <GeoJSON
                        data={deptGeojson}
                        style={{
                            color: mapStyle === 'RELIEF' ? '#444' : '#000',
                            weight: mapStyle === 'RELIEF' ? 0.8 : 1.2,
                            fillOpacity: 0,
                            interactive: false
                        }}
                    />
                )}

                {/* Radar RainViewer — TileLayer animé */}
                {radarSource === 'rainviewer' && timestamps.map((ts, idx) => {
                    if (!ts.path) return null;
                    const isCurrent = idx === currentIndex;
                    const host = ts.host || 'https://tilecache.rainviewer.com';
                    const url = `${host}${ts.path}/256/{z}/{x}/{y}/6/1_1.png`;

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

                {/* Radar Météo-France — ImageOverlay animé */}
                {radarSource === 'meteofrance' && timestamps.map((ts, idx) => {
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

                <MapController lat={zone.center[0]} lon={zone.center[1]} zoom={zone.zoom} />

                {showCities && MAIN_CITIES.map((city, i) => (
                    <Marker
                        key={i}
                        position={[city.lat, city.lon]}
                        icon={L.divIcon({
                            className: 'city-label-expert',
                            html: `<div style="text-align:center;"><span style="font-size:11px;font-weight:900;color:#fff;text-transform:uppercase;text-shadow: 2px 2px 2px #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;">${city.name}</span></div>`,
                            iconSize: [80, 40],
                            iconAnchor: [40, 20]
                        })}
                    />
                ))}

                {/* Overlay observations selectionnées */}
                {overlayType !== 'NONE' && MAIN_STATIONS.map(station => {
                    const obs = observations[station.id];
                    if (!obs) return null;

                    if (overlayType === 'LIGHTNING') return null;

                    return (
                        <Marker
                            key={station.id}
                            position={station.pos}
                            icon={L.divIcon({
                                className: 'obs-marker',
                                html: `<div class="obs-badge ${overlayType === 'TEMP' ? 'temp' : 'wind'}" style="opacity: 0.9;">
                                    ${overlayType === 'TEMP' ? (obs.t !== null ? obs.t + '°' : 'N/A') : (obs.ff !== null ? obs.ff + ' km/h' : 'N/A')}
                                </div>`,
                                iconSize: L.point(40, 20)
                            })}
                        >
                            <Tooltip direction="top" offset={[0, -5]}>
                                <strong>{station.name}</strong><br />
                                {obs.t !== null && `Temp: ${obs.t}°C`}<br />
                                {obs.ff !== null && `Vent: ${obs.ff} km/h`}
                            </Tooltip>
                        </Marker>
                    );
                })}

                {/* COUCHE FOUDRE (VIA AGATE API - VECTEURS COULEURS) */}
                {overlayType === 'LIGHTNING' && lightningStrikes.map((s) => {
                    const color = '#facc15'; // Jaune vif pour tous les impacts récents
                    return (
                        <Marker
                            key={s.id}
                            position={[s.lat, s.lon]}
                            icon={L.divIcon({
                                className: 'lightning-dot',
                                html: `<div style="width:8px;height:8px;background:${color};border-radius:50%;border:1px solid black;box-shadow: 0 0 5px ${color}"></div>`,
                                iconSize: [8, 8],
                                iconAnchor: [4, 4]
                            })}
                            zIndexOffset={500}
                        >
                            <Tooltip direction="top" offset={[0, -5]}>
                                <strong>Impact Foudre</strong><br />
                                Heure: {s.raw}<br />
                                Date: {s.date}
                            </Tooltip>
                        </Marker>
                    );
                })}

                {/* Marqueur de cible pour la ville recherchée */}
                {selectedCity && (
                    <Marker
                        position={[selectedCity.lat, selectedCity.lon]}
                        icon={L.divIcon({
                            className: 'target-marker',
                            html: `<div style="position: relative;">
                                <div style="width: 24px; height: 24px; border: 3px solid #ef4444; border-radius: 50%; display: flex; alignItems: center; justifyContent: center; background: rgba(239, 68, 68, 0.1)">
                                    <div style="width: 6px; height: 6px; background: #ef4444; border-radius: 50%;"></div>
                                </div>
                                <div style="position: absolute; width: 40px; height: 2px; background: #ef4444; top: 11px; left: -8px;"></div>
                                <div style="position: absolute; width: 2px; height: 40px; background: #ef4444; top: -8px; left: 11px;"></div>
                            </div>`,
                            iconSize: [24, 24],
                            iconAnchor: [12, 12]
                        })}
                        zIndexOffset={1000}
                    >
                        <Tooltip permanent direction="top" offset={[0, -15]} className="custom-city-label">
                            <span style={{ fontWeight: 900, color: '#1e293b', fontSize: '0.9rem', textShadow: '2px 2px 0 white, -2px -2px 0 white, 2px -2px 0 white, -2px 2px 0 white' }}>
                                {selectedCity.name.toUpperCase()}
                            </span>
                        </Tooltip>
                    </Marker>
                )}
            </MapContainer>

            <div className={`map-legend-compact ${mapStyle === 'RELIEF' ? 'expert' : ''}`}>
                <div className="legend-gradient-bar" style={{
                    background: `linear-gradient(to right, ${RADAR_SCHEMES.find(s => s.id === radarScheme)?.colors.join(', ') || '#ccc'})`
                }}></div>
                <div className="legend-numbers">
                    <span>0.1 mm/h</span>
                    <span>Extreme</span>
                </div>
                <div className="map-timestamp-overlay">
                    {timestamps[currentIndex] && (new Date(timestamps[currentIndex].time * 1000)).toLocaleString('fr-FR')}
                </div>
            </div>
        </div>
    );
};

const RadarFrance = () => {
    const [timestamps, setTimestamps] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(true);
    const [loading, setLoading] = useState(true);
    const [currentZone, setCurrentZone] = useState('METROPOLE');
    const [deptGeojson, setDeptGeojson] = useState(null);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [mapStyle, setMapStyle] = useState('DARK');
    const [overlayType, setOverlayType] = useState('NONE');
    const [radarSource, setRadarSource] = useState('rainviewer'); // 'rainviewer' or 'meteofrance'
    const [currentPeriod, setCurrentPeriod] = useState('2H');
    const [showCities, setShowCities] = useState(true);
    const [isArchiveMode, setIsArchiveMode] = useState(false);
    const [archiveDate, setArchiveDate] = useState(() => {
        const now = new Date();
        now.setMinutes(0, 0, 0);
        const offset = now.getTimezoneOffset() * 60000;
        return new Date(now.getTime() - offset).toISOString().slice(0, 16);
    });
    const [isSmoothed, setIsSmoothed] = useState(true); // Default to smoothed
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [observations, setObservations] = useState({});
    const [lightningStrikes, setLightningStrikes] = useState([]);

    // Recherche de ville
    const [searchQuery, setSearchQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [selectedCity, setSelectedCity] = useState(null);

    const [lastRadarUpdate, setLastRadarUpdate] = useState(null);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const timerRef = useRef(null);
    const preloadedRadar = useRef({}); // Cache des images radar préchargées

    // Préchargement des images radar pour une animation sans blanc
    const preloadRadarImages = async (frames) => {
        const cache = {};
        await Promise.all(frames.map(frame => {
            return new Promise((resolve) => {
                const url = frame.imageUrl || `/radar-mf/${frame.filename}`;
                const img = new Image();
                img.onload = img.onerror = () => {
                    cache[frame.filename] = true;
                    resolve();
                };
                img.src = url;
            });
        }));
        preloadedRadar.current = cache;
    };

    useEffect(() => {
        fetch('/data/departements-version-simplifiee.geojson')
            .then(res => res.json())
            .then(data => setDeptGeojson(data))
            .catch(err => console.error("Erreur GeoJSON:", err));

        fetchLiveObservations();
        fetchLightningData();

        // Rafraîchir les données toutes les 5 minutes
        const refreshInterval = setInterval(() => {
            fetchTimestamps();
            fetchLiveObservations();
            fetchLightningData();
        }, 5 * 60 * 1000);

        return () => clearInterval(refreshInterval);
    }, []);

    const fetchLiveObservations = async () => {
        try {
            const stationIds = MAIN_STATIONS.map(s => s.id);
            const { data, error } = await supabase
                .from('observations_horaire')
                .select('station_id, t, ff, timestamp')
                .in('station_id', stationIds)
                .order('timestamp', { ascending: false });

            if (!error && data) {
                // Keep only latest per station
                const latest = {};
                data.forEach(obs => {
                    if (!latest[obs.station_id]) {
                        latest[obs.station_id] = obs;
                    }
                });
                setObservations(latest);
            }
        } catch (err) {
            console.error("Error fetching live obs:", err);
        }
    };

    const fetchLightningData = async () => {
        try {
            // API publique meteo-npdc.fr (Blitzortung) — 24h, zéro clé API
            const res = await fetch('https://meteo-npdc.fr/api/v2/lightning/get_latest?minutes=1440');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const json = await res.json();
            if (!json.success || !Array.isArray(json.data)) throw new Error('Format inattendu');

            const allStrikes = json.data.map((s, i) => {
                const dObj = new Date(s.timestamp ? s.timestamp.replace(' ', 'T') : Date.now());
                const timeMs = dObj.getTime();
                const validTime = isNaN(timeMs) ? Date.now() : timeMs;
                const validDObj = new Date(validTime);
                return {
                    lat: parseFloat(s.latitude),
                    lon: parseFloat(s.longitude),
                    time: validTime,
                    h: validDObj.getUTCHours(),
                    raw: validDObj.toISOString().substring(11, 19),
                    date: validDObj.toISOString().substring(0, 10),
                    id: `live-${s.timestamp || i}-${i}`
                };
            });

            const limit24h = Date.now() - (24 * 60 * 60 * 1000);
            const filtered = allStrikes.filter(s => s.time > limit24h).sort((a, b) => a.time - b.time);
            setLightningStrikes(filtered);

        } catch (err) {
            console.error("Error fetching lightning:", err);
        }
    };

    useEffect(() => {
        if (isArchiveMode) {
            loadArchiveImage();
        } else {
            fetchTimestamps();
        }
    }, [currentPeriod, isArchiveMode, archiveDate, radarSource]);

    const loadArchiveImage = () => {
        // Mode archive : on ne peut pas animer, on affiche juste le radar direct
        fetchTimestamps();
        setIsPlaying(false);
    };

    const fetchTimestamps = async () => {
        setIsLoadingData(true);
        try {
            if (radarSource === 'rainviewer') {
                // Chargement via RainViewer — API publique, fiable, sans clé
                const res = await fetch(`https://api.rainviewer.com/public/weather-maps.json`);
                const data = await res.json();

                const frames = data.radar?.past || [];
                if (frames.length === 0) throw new Error('Aucune frame radar RainViewer disponible');

                // Appliquer le filtre de période
                const count = PERIODS.find(p => p.id === currentPeriod)?.count || 12;
                const sliced = frames.slice(-count);

                // Construire les timestamps compatibles avec le composant
                const framesToSet = sliced.map(frame => ({
                    time: frame.time,
                    path: frame.path,
                    host: data.host,
                }));

                setTimestamps(framesToSet);
                setCurrentIndex(framesToSet.length - 1);

                if (framesToSet.length > 0) {
                    setLastRadarUpdate(new Date(framesToSet[framesToSet.length - 1].time * 1000));
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
                    });

                    const count = PERIODS.find(p => p.id === currentPeriod)?.count || 12;
                    const sliced = framesToSet.slice(-count);

                    setTimestamps(sliced);
                    setCurrentIndex(sliced.length - 1);

                    if (sliced.length > 0) {
                        setLastRadarUpdate(new Date(sliced[sliced.length - 1].time * 1000));
                    }
                }
            }

            setIsLoadingData(false);
            setLoading(false);
        } catch (error) {
            console.error('Erreur chargement radar:', error);
            setTimestamps([]);
            setCurrentIndex(0);
            setIsLoadingData(false);
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isPlaying || timestamps.length === 0) {
            if (timerRef.current) clearTimeout(timerRef.current);
            return;
        }

        const isLastFrame = currentIndex === timestamps.length - 1;
        // ponytail: pause fluide de 1400ms sur la dernière frame (vs 3000ms avant) pour éviter l'impression de blocage
        const delay = isLastFrame ? 1400 : Math.round(800 / playbackSpeed);

        timerRef.current = setTimeout(() => {
            setCurrentIndex((prev) => {
                if (timestamps.length === 0) return 0;
                const next = (prev >= timestamps.length - 1) ? 0 : prev + 1;
                return next;
            });
        }, delay);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [isPlaying, currentIndex, timestamps.length, playbackSpeed]);

    const handleSearch = async (query) => {
        setSearchQuery(query);
        if (query.length < 3) { setSuggestions([]); return; }
        try {
            const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${query}&limit=5&type=municipality`);
            const data = await res.json();
            setSuggestions(data.features || []);
        } catch (err) { console.error(err); }
    };

    const selectCity = (city) => {
        const [lon, lat] = city.geometry.coordinates;
        setSelectedCity({ lat, lon, name: city.properties.city });
        setCurrentZone('CUSTOM'); // Mode zone personnalisée
        setSearchQuery('');
        setSuggestions([]);
    };

    const formatTime = (ts) => {
        const timeValue = typeof ts === 'object' ? ts.time : ts;
        const date = new Date(timeValue * 1000);
        return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    };

    const handleDownload = async () => {
        const mapElement = document.querySelector('.radar-map-wrapper');
        if (!mapElement) return;
        try {
            const canvas = await html2canvas(mapElement, {
                useCORS: true,
                backgroundColor: "#f1f5f9",
                scale: 2
            });
            const link = document.createElement('a');
            link.download = `radar-${currentTs ? formatTime(currentTs).replace(':', 'h') : 'capture'}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (err) { console.error(err); }
    };

    const handleExportGIF = async () => {
        if (timestamps.length === 0) return;
        setIsExporting(true);
        setIsPlaying(false);
        setExportProgress(0);

        const mapElement = document.querySelector('.radar-map-wrapper');
        const overlay = mapElement.querySelector('.map-settings-panel');
        const rect = mapElement.getBoundingClientRect();

        // Dimensions strictes en entiers
        const w = Math.floor(rect.width);
        const h = Math.floor(rect.height);

        const frames = [];
        const step = Math.max(1, Math.floor(timestamps.length / 48));
        const framesToCapture = [];
        for (let i = 0; i < timestamps.length; i += step) {
            framesToCapture.push(i);
        }

        try {
            // Cacher l'overlay pendant la capture
            if (overlay) overlay.style.display = 'none';

            for (let i = 0; i < framesToCapture.length; i++) {
                const idx = framesToCapture[i];
                setCurrentIndex(idx);
                // Laisser le temps à Leaflet de faire le rendu
                await new Promise(r => setTimeout(r, 850));

                const canvas = await html2canvas(mapElement, {
                    useCORS: true,
                    scale: 1,
                    logging: false,
                    width: w,
                    height: h
                });

                frames.push(canvas.toDataURL('image/png'));
                setExportProgress(Math.round(((i + 1) / framesToCapture.length) * 50));
            }

            gifshot.createGIF({
                images: frames,
                gifWidth: w,
                gifHeight: h,
                interval: 0.15,
                numFrames: frames.length,
                sampleInterval: 5, // Meilleur compromis performance/qualité
            }, (obj) => {
                if (!obj.error) {
                    const link = document.createElement('a');
                    link.download = `animation-radar-${currentPeriod}.gif`;
                    link.href = obj.image;
                    link.click();
                }
                setIsExporting(false);
                setExportProgress(0);
                if (overlay) overlay.style.display = 'block';
            });
        } catch (err) {
            console.error("Export Error:", err);
            setIsExporting(false);
            setExportProgress(0);
            if (overlay) overlay.style.display = 'block';
        }
    };

    if (loading) return <div className="radar-loading"><div className="spinner"></div><p>Récupération des échos radar...</p></div>;

    const currentTs = timestamps[currentIndex];

    return (
        <div className="radar-container">
            <div className="radar-controls-compact">
                <div className="control-section main-player">
                    <button className={`btn-compact ${isPlaying ? 'active' : ''}`} onClick={() => setIsPlaying(true)} title="Lecture">
                        <Play size={16} fill="currentColor" />
                    </button>
                    <button className={`btn-compact ${!isPlaying ? 'active' : ''}`} onClick={() => { setIsPlaying(false); setCurrentIndex(timestamps.length - 1); }} title="Stop/Direct">
                        <Square size={16} fill="currentColor" />
                    </button>
                    <div className="step-group">
                        <button className="btn-compact" onClick={() => { setIsPlaying(false); setCurrentIndex((prev) => (prev + 1) % timestamps.length); }}>
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>

                <div className="control-divider"></div>



                <div className="control-divider"></div>

                <div className="control-section timeline">
                    <div className="time-badge">
                        <Clock size={14} />
                        <span>{currentTs ? formatTime(currentTs) : '--:--'}</span>
                    </div>
                    {lastRadarUpdate && (
                        <div className="last-update-tag">
                            Données de {lastRadarUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    )}
                    <input
                        type="range"
                        min="0"
                        max={timestamps.length - 1}
                        value={currentIndex}
                        onChange={(e) => {
                            setCurrentIndex(parseInt(e.target.value));
                            setIsPlaying(false);
                        }}
                        className="compact-range"
                    />
                </div>

                <div className="control-divider"></div>

                <div className="control-section settings-grid">
                    <div className="mini-setting">
                        <span className="tiny-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', color: isArchiveMode ? '#ef4444' : '#94a3b8' }} onClick={() => setIsArchiveMode(!isArchiveMode)}>
                            {isArchiveMode ? 'ARCHIVE' : 'DIRECT'} <Calendar size={10} style={{ marginLeft: 4 }} />
                        </span>

                        {!isArchiveMode ? (
                            <select value={currentPeriod} onChange={(e) => setCurrentPeriod(e.target.value)} className="compact-select">
                                {PERIODS.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        ) : (
                            <input
                                type="datetime-local"
                                className="compact-select"
                                style={{ fontSize: '10px', width: '100%', padding: '0 2px' }}
                                value={archiveDate}
                                onChange={(e) => setArchiveDate(e.target.value)}
                                step="3600"
                            />
                        )}
                    </div>

                    {!isArchiveMode && (
                        <div className="mini-setting">
                            <span className="tiny-label">Vitesse</span>
                            <select value={playbackSpeed} onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))} className="compact-select">
                                <option value="0.5">0.5x</option>
                                <option value="1">1x</option>
                                <option value="2">2x</option>
                                <option value="3">3x</option>
                            </select>
                        </div>
                    )}
                </div>

                <div className="control-section actions">
                    <button className={`btn-compact ${overlayType === 'TEMP' ? 'active' : ''}`} onClick={() => setOverlayType(overlayType === 'TEMP' ? 'NONE' : 'TEMP')} title="Temp">
                        <Thermometer size={16} />
                    </button>
                    <button className={`btn-compact ${overlayType === 'WIND' ? 'active' : ''}`} onClick={() => setOverlayType(overlayType === 'WIND' ? 'NONE' : 'WIND')} title="Vent">
                        <Wind size={16} />
                    </button>
                    <button className={`btn-compact ${overlayType === 'LIGHTNING' ? 'active' : ''}`} onClick={() => setOverlayType(overlayType === 'LIGHTNING' ? 'NONE' : 'LIGHTNING')} title="Foudre">
                        <Zap size={16} />
                    </button>
                    <button className="btn-compact action" onClick={handleDownload} title="PNG HD">
                        <Download size={16} />
                    </button>
                    <button className="btn-compact action export" onClick={handleExportGIF} disabled={isExporting} title="Export Animation">
                        <Film size={16} />
                        <span className="btn-text">{isExporting ? 'Calcul...' : 'GIF'}</span>
                    </button>
                </div>
            </div>

            {isLoadingData && (
                <div className="radar-glass-loader">
                    <div className="loader-content">
                        <div className="spinner"></div>
                        <p>Synchronisation Radar...</p>
                    </div>
                </div>
            )}

            {isExporting && (
                <div className="radar-glass-loader export-overlay">
                    <div className="loader-content">
                        <div className="spinner"></div>
                        <p>Génération de l'animation... {exportProgress}%</p>
                        <div className="progress-bar-container">
                            <div className="progress-bar-fill" style={{ width: `${exportProgress}%` }}></div>
                        </div>
                    </div>
                </div>
            )}

            <div className="radar-main-content SINGLE">
                <div className="radar-map-wrapper">
                    <div className="map-settings-panel">
                        <div className="settings-header">RÉGLAGES CARTE</div>
                        <div className="settings-body">
                            <div className="setting-item">
                                <Globe size={14} />
                                <select value={currentZone} onChange={(e) => setCurrentZone(e.target.value)} className="settings-select">
                                    {Object.entries(ZONES).map(([key, zone]) => (
                                        <option key={key} value={key}>{zone.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="setting-item">
                                <Radio size={14} />
                                <select value={radarSource} onChange={(e) => setRadarSource(e.target.value)} className="settings-select">
                                    <option value="rainviewer">Source : RainViewer</option>
                                    <option value="meteofrance">Source : Météo-France HD</option>
                                </select>
                            </div>
                            <div className="setting-item">
                                <Layers size={14} />
                                <select value={mapStyle} onChange={(e) => setMapStyle(e.target.value)} className="settings-select">
                                    {Object.entries(MAP_STYLES).map(([key, s]) => (
                                        <option key={key} value={key}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                            <label className="settings-toggle">
                                <input type="checkbox" checked={showCities} onChange={(e) => setShowCities(e.target.checked)} />
                                <span>Afficher les Grandes Villes</span>
                            </label>
                        </div>
                    </div>
                    <RadarMap
                        zone={currentZone === 'CUSTOM' && selectedCity ? { center: [selectedCity.lat, selectedCity.lon], zoom: 11 } : ZONES[currentZone]}
                        timestamps={timestamps}
                        currentIndex={currentIndex}
                        mapStyle={mapStyle}
                        showCities={showCities}
                        deptGeojson={deptGeojson}
                        overlayType={overlayType}
                        observations={observations}
                        lightningStrikes={lightningStrikes}
                        selectedCity={selectedCity}
                        currentZoneId={currentZone}
                        radarSource={radarSource}
                    />
                </div>
            </div>
        </div>
    );
};

export default RadarFrance;
