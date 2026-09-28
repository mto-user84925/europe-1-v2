import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Circle, Marker, GeoJSON } from 'react-leaflet';
import { createClient } from '@supabase/supabase-js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Zap, RefreshCw, Calendar, Loader2, Search, X, Crosshair, HelpCircle, Download, Image as ImageIcon, Map as MapIcon, Palette, Maximize, Building2, Type, LayoutGrid, Play, Pause } from 'lucide-react';
import { LIGHTNING_DESIGNS } from './LightningStyles';
import html2canvas from 'html2canvas';
import { REGIONS, DEPARTMENTS } from "../../data/departments";
import { MAIN_CITIES } from "../../data/mainCities";
import './FoudreFrance.css';
import { supabase } from '../../services/supabaseClient';
import { CARTO_TILES } from '../../constants/carto';

const HOUR_COLORS = [
    "#0000FF", "#0022FF", "#0044FF", "#0066FF", "#0088FF", "#00AAFF", // 0h-5h (Bleus)
    "#00CCFF", "#00EEFF", "#00FFDD", "#00FFBB", "#00FF99", "#00FF77", // 6h-11h (Cyans/Verts)
    "#00FF00", "#77FF00", "#BBFF00", "#FFFF00", "#FFCC00", "#FFAA00", // 12h-17h (Vert/Jaune/Orange)
    "#FF8800", "#FF6600", "#FF4400", "#FF2200", "#FF0000", "#8B0000"  // 18h-23h (Rouge/Brun)
];

const getHourColor = (h) => HOUR_COLORS[h] || "#ff0000";

const MAP_PALETTES = {
    dark: { name: "Sombre Pro", fill: "#1e293b", stroke: "#475569", bg: "#0f172a", tiles: CARTO_TILES.DARK_NOLABELS },
    default: { name: "Classique", fill: "#f1f5f9", stroke: "#000", bg: "#ffffff", tiles: CARTO_TILES.LIGHT_NOLABELS },
    blue: { name: "Océan", fill: "#dbeafe", stroke: "#000", bg: "#f0f9ff", tiles: CARTO_TILES.LIGHT_NOLABELS }
};

const ALL_DEPTS = [...DEPARTMENTS.map(d => d.code), '2A', '2B'].filter((v, i, a) => a.indexOf(v) === i);

// Custom Icon for blinking impacts
const createBlinkingIcon = (color) => L.divIcon({
    className: 'custom-blinking-marker',
    html: `<div class="blinking-dot" style="background-color: ${color}; border: 1.5px solid #000; box-shadow: 0 0 15px ${color}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
});

function MapController({ center, zoom }) {
    const map = useMap();
    useEffect(() => {
        if (center) {
            map.setView(center, zoom || map.getZoom(), { animate: true });
        }
    }, [center, zoom, map]);
    return null;
}

// Pane de recherche (Doit être au top niveau pour les enfants)
const isPointInPolygon = (point, vs) => {
    const x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const xi = vs[i][0], yi = vs[i][1];
        const xj = vs[j][0], yj = vs[j][1];
        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

const isPointInFeature = (lat, lon, feature) => {
    const point = [lon, lat];
    if (feature.geometry.type === 'Polygon') {
        return isPointInPolygon(point, feature.geometry.coordinates[0]);
    } else if (feature.geometry.type === 'MultiPolygon') {
        return feature.geometry.coordinates.some(poly => isPointInPolygon(point, poly[0]));
    }
    return false;
};

const isPointInGeoJSON = (lat, lon, geojson) => {
    if (!geojson || !geojson.features || geojson.features.length === 0) return true;
    return geojson.features.some(f => isPointInFeature(lat, lon, f));
};

function GeoJSONController({ data, isFrance }) {
    const map = useMap();
    const prevModeRef = useRef(isFrance);
    const prevDataRef = useRef(data);

    useEffect(() => {
        const modeChanged = prevModeRef.current !== isFrance;
        const dataChanged = prevDataRef.current !== data;

        if (modeChanged || dataChanged) {
            if (isFrance) {
                map.setView([46.4, 2.2], 5.4); // Centre la France automatiquement en intégralité
            } else if (data) {
                const layer = L.geoJSON(data);
                map.fitBounds(layer.getBounds(), { padding: [20, 20], animate: true });
            }
            prevModeRef.current = isFrance;
            prevDataRef.current = data;
        }
    }, [data, isFrance, map]);
    return null;
}

const SearchCirclesPane = () => {
    const map = useMap();
    useEffect(() => {
        if (!map.getPane('search-circles-pane')) {
            const pane = map.createPane('search-circles-pane');
            pane.style.zIndex = 500;
            pane.style.pointerEvents = 'none';
        }
    }, [map]);
    return null;
};

// Composant de rendu ultra-performant pour les impacts (Expert)
const FastLightningLayer = ({ strikes, colors, filteredGeo, geoMode, sourceGeo, pointRadius = 4, designId = 'Classic' }) => {
    const map = useMap();
    const canvasRef = useRef(null);
    const requestRef = useRef();

    useEffect(() => {
        if (!canvasRef.current) {
            const container = map.getContainer();
            const newCanvas = document.createElement('canvas');
            newCanvas.style.position = 'absolute';
            newCanvas.style.top = '0';
            newCanvas.style.left = '0';
            newCanvas.style.pointerEvents = 'none';
            newCanvas.style.zIndex = '600'; // Au-dessus des tracés de cercles et de départements
            newCanvas.className = 'lightning-canvas-overlay';
            container.appendChild(newCanvas);
            canvasRef.current = newCanvas;
            console.log('⚡ Canvas foudre créé et attaché au conteneur');
        }

        const animate = () => {
            const time = Date.now();
            const pulse = (Math.sin(time / 200) + 1) / 2; // Valeur entre 0 et 1 pour le clignotement

            const c = canvasRef.current;
            if (!c) return;

            const size = map.getSize();
            c.width = size.x;
            c.height = size.y;

            // Plus besoin de L.DomUtil.setPosition car le canvas est fixe sur le container
            // On utilise les containerPoint directement

            const ctx = c.getContext('2d');
            ctx.clearRect(0, 0, c.width, c.height);

            // Masque de clipping (Uniquement en mode région/département)
            const clipGeo = geoMode !== 'france' ? filteredGeo : null;
            if (clipGeo) {
                ctx.save();
                ctx.beginPath();
                clipGeo.features.forEach(feature => {
                    const coords = feature.geometry.type === 'Polygon'
                        ? [feature.geometry.coordinates]
                        : feature.geometry.coordinates;

                    coords.forEach(ring => {
                        ring[0].forEach((coord, i) => {
                            const p = map.latLngToContainerPoint([coord[1], coord[0]]);
                            if (i === 0) ctx.moveTo(p.x, p.y);
                            else ctx.lineTo(p.x, p.y);
                        });
                        ctx.closePath();
                    });
                });
                ctx.clip();
            }

            const design = LIGHTNING_DESIGNS[designId] || LIGHTNING_DESIGNS.Classic;

            strikes.forEach(s => {
                const px = map.latLngToContainerPoint([s.lat, s.lon]);

                if (px.x < -50 || px.y < -50 || px.x > size.x + 50 || px.y > size.y + 50) return;

                const color = (colors && colors[s.h]) ? colors[s.h] : '#ff0000';
                ctx.save();
                design.render(ctx, px.x, px.y, pointRadius, color, s.isRecent);
                ctx.restore();
            });

            if (clipGeo) {
                ctx.restore();
            }

            requestRef.current = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            cancelAnimationFrame(requestRef.current);
            if (canvasRef.current) {
                canvasRef.current.remove();
                canvasRef.current = null;
            }
        };
    }, [strikes, map, colors, filteredGeo, geoMode, sourceGeo, designId, pointRadius]);

    useEffect(() => {
        if (strikes.length > 0) {
            console.log(`Rendering ${strikes.length} strikes on map`);
            window.debugLightningStrikes = strikes;
        }
    }, [strikes]);

    return null;
};

const FoudreFrance = () => {
    const queryParams = new URLSearchParams(window.location.search);
    const today = new Date().toLocaleDateString('sv-SE');
    const initialDate = today; // Toujours aujourd'hui
    const isAutomated = queryParams.get('automated') === 'true';
    const isEmbed = queryParams.get('embed') === '1' || queryParams.get('embed') === 'true';
    const urlForcePoints = queryParams.get('forcePoints') === 'true'; // Keep param but it will be unused for logic except forcing rendering

    const [strikes, setStrikes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [startDate, setStartDate] = useState(initialDate);
    const [endDate, setEndDate] = useState(initialDate);
    const [isRange, setIsRange] = useState(false);
    const [deptsGeo, setDeptsGeo] = useState(null);
    const [viewMode, setViewMode] = useState('points'); // 'points' ou 'bilan'
    const [exporting, setExporting] = useState(false);
    const [bilanImage, setBilanImage] = useState(null); // URL de l'image bilan si disponible

    // États Expert Merged
    const [geoMode, setGeoMode] = useState("france"); // "region", "dept", "france"
    const [selectedRegion, setSelectedRegion] = useState("Hauts-de-France");
    const [selectedDept, setSelectedDept] = useState("59");
    const [mapPalette, setMapPalette] = useState("default"); // Par défaut en Classique (Mode Clair)
    const [showCities, setShowCities] = useState(true);
    const [strikeSize, setStrikeSize] = useState(5.5);
    const [mapCenter, setMapCenter] = useState([46.4, 2.2]);
    const [mapZoom, setMapZoom] = useState(5.4); // Zoom à 5.4 pour afficher la France en intégralité d'office
    const [sourceGeo, setSourceGeo] = useState(null);
    const [filteredGeo, setFilteredGeo] = useState(null);
    const [foudreDesign, setFoudreDesign] = useState("Classic");

    // Search states
    const [searchMode, setSearchMode] = useState('commune'); // 'commune' ou 'adresse'
    const [searchQuery, setSearchQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const radii = [1, 3, 5, 10, 20];
    const [debugInfo, setDebugInfo] = useState({ status: 'Idle', error: 'Aucun' });

    // Animation states
    const [isPlaying, setIsPlaying] = useState(false);
    const [animationMinute, setAnimationMinute] = useState(1440);
    const [trailMode, setTrailMode] = useState("30"); // "cumulative", "15", "30", "60", "120"
    const [playSpeed, setPlaySpeed] = useState(150); // ms par pas de 5 min

    // Debug toggle
    const [showDebug, setShowDebug] = useState(false);

    // Filtrage spatial intelligent par région/département
    const filteredStrikes = React.useMemo(() => {
        if (geoMode === 'france' || !filteredGeo) {
            return strikes;
        }
        return strikes.filter(s => isPointInGeoJSON(s.lat, s.lon, filteredGeo));
    }, [strikes, geoMode, filteredGeo]);

    // Calcul de la minute de départ de l'orage pour l'animation (calé sur la région sélectionnée)
    const minMinute = React.useMemo(() => {
        if (filteredStrikes.length === 0) return 0;
        const minutes = filteredStrikes.map(s => {
            const d = new Date(s.time);
            return d.getHours() * 60 + d.getMinutes();
        });
        const minVal = Math.min(...minutes);
        // Commencer 1h avant le premier impact (arrondi à l'heure inférieure)
        return Math.max(0, Math.floor(minVal / 60) * 60 - 60);
    }, [filteredStrikes]);

    const isLive = !isRange && startDate === new Date().toLocaleDateString('sv-SE');

    // Vérifier si un bilan image existe pour la date sélectionnée
    const checkBilanImage = async (date) => {
        try {
            // Vérifier dans Supabase si une image de bilan existe
            const { data, error } = await supabase
                .from('foudre_bilans')
                .select('image_url, impact_count')
                .eq('date', date)
                .single();

            if (data && data.image_url) {
                setBilanImage(data);
                // Basculer automatiquement en mode bilan si image disponible
                setViewMode('bilan');
                return true;
            }
        } catch {
            // Pas de bilan disponible
        }
        setBilanImage(null);
        setViewMode('points');
        return false;
    };

    const fetchStrikes = async () => {
        if (loading) return;
        setLoading(true);
        setDebugInfo({ status: 'Chargement...', error: 'Aucun' });

        try {
            const now = new Date();
            const today = now.toLocaleDateString('sv-SE');
            const isLiveMode = !isRange && startDate === today;

            // Calcul dynamique de l'offset timezone (ex: UTC+2 en été, UTC+1 en hiver)
            // getTimezoneOffset() retourne -120 en UTC+2, on veut "+02:00"
            const tzOffsetMin = -now.getTimezoneOffset();
            const tzSign = tzOffsetMin >= 0 ? '+' : '-';
            const tzHours = String(Math.floor(Math.abs(tzOffsetMin) / 60)).padStart(2, '0');
            const tzMins = String(Math.abs(tzOffsetMin) % 60).padStart(2, '0');
            const tzString = `${tzSign}${tzHours}:${tzMins}`; // ex: "+02:00" en été

            console.log(`⚡ Fetching strikes for ${startDate} (Live 24h: ${isLiveMode}, TZ: ${tzString})...`);
            let allData = [];

            if (isLiveMode) {
                try {
                    const res = await fetch('https://meteo-npdc.fr/api/v2/lightning/get_latest?minutes=1440', {
                        referrerPolicy: "no-referrer"
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);

                    const json = await res.json();
                    if (json.success && Array.isArray(json.data)) {
                        console.log(`✅ ${json.data.length} impacts récupérés via meteo-npdc.fr.`);
                        allData = json.data.map((s, i) => {
                            const d = new Date(s.timestamp ? s.timestamp.replace(' ', 'T') : Date.now());
                            const timeMs = d.getTime();
                            const validTime = isNaN(timeMs) ? Date.now() : timeMs;
                            const validD = new Date(validTime);
                            return {
                                lat: parseFloat(s.latitude),
                                lon: parseFloat(s.longitude),
                                time: validTime,
                                h: validD.getHours(),
                                isRecent: (Date.now() - validTime) / 60000 < 15,
                                id: `live-${s.timestamp || i}-${i}`
                            };
                        });
                    }
                } catch (err) {
                    console.warn(`⚠️ Fetch lightning warning:`, err.message);
                    setDebugInfo(prev => ({ ...prev, error: `Lightning: ${err.message}` }));
                }

                // Filtrer pour ne garder que les dernières 24h
                if (allData.length > 0) {
                    const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
                    const before = allData.length;
                    allData = allData.filter(s => s.time > 0 && s.time >= cutoff);
                    console.log(`📊 Filtrage 24h: ${before} → ${allData.length} impacts`);
                }
            }

            // Fallback Supabase ou mode archive
            if (allData.length === 0) {
                console.log(`📜 Requête archive Supabase pour ${startDate}...`);
                let query = supabase.from('lightning_strikes').select('*');
                if (isRange) {
                    query = query.gte('strike_time', `${startDate}T00:00:00Z`).lte('strike_time', `${endDate}T23:59:59Z`);
                } else {
                    query = query.gte('strike_time', `${startDate}T00:00:00Z`).lte('strike_time', `${startDate}T23:59:59Z`);
                }
                const { data, error } = await query.order('strike_time', { ascending: true });
                if (error) {
                    console.error("❌ Erreur Supabase:", error.message);
                    setDebugInfo(prev => ({ ...prev, error: (prev.error !== 'Aucun' ? prev.error + ' | ' : '') + `Supa: ${error.message}` }));
                } else if (data) {
                    console.log(`✅ ${data.length} impacts récupérés depuis Supabase.`);
                    allData = data.map((s, i) => {
                        const d = new Date(s.strike_time);
                        // Utiliser l'heure locale (adaptée au timezone du navigateur)
                        return {
                            lat: parseFloat(s.lat), lon: parseFloat(s.lon),
                            time: d.getTime(),
                            h: d.getHours(), // getHours() retourne l'heure locale
                            isRecent: (Date.now() - d.getTime()) / 60000 < 15,
                            id: s.id || `strike-${i}`
                        };
                    });
                }
            }

            setStrikes(allData);
            setDebugInfo(prev => ({ ...prev, status: `Terminé (${allData.length} impacts)` }));
        } catch (e) {
            console.error("Error fetching strikes:", e);
            setDebugInfo({ status: 'Erreur', error: e.message });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Vérifier si un bilan image existe pour cette date
        if (!isLive && !isRange) {
            checkBilanImage(startDate);
        } else {
            setBilanImage(null);
        }

        fetchStrikes();
        const interval = setInterval(() => {
            if (isLive) fetchStrikes();
        }, 60000);
        return () => clearInterval(interval);
    }, [startDate, endDate, isRange]);

    useEffect(() => {
        setIsPlaying(false);
        const maxMin = isLive ? (new Date().getHours() * 60 + new Date().getMinutes()) : 1440;
        setAnimationMinute(maxMin);
    }, [startDate, endDate, isRange, minMinute]);

    useEffect(() => {
        let timer;
        if (isPlaying) {
            timer = setInterval(() => {
                setAnimationMinute(prev => {
                    const maxMin = isLive ? (new Date().getHours() * 60 + new Date().getMinutes()) : 1440;
                    if (prev >= maxMin) {
                        // Si une rémanence est définie (ex: 120 min), boucler sur cette fenêtre, sinon recommencer à minMinute
                        const windowSize = parseInt(trailMode);
                        return isNaN(windowSize) 
                            ? minMinute 
                            : Math.max(minMinute, maxMin - windowSize);
                    }
                    return Math.min(prev + 5, maxMin);
                });
            }, playSpeed);
        }
        return () => clearInterval(timer);
    }, [isPlaying, playSpeed, isLive, minMinute, trailMode]);


    useEffect(() => {
        const loadGeo = async () => {
            let base = sourceGeo;
            if (!base) {
                const res = await fetch("/data/departements-version-simplifiee.geojson");
                base = await res.json();
                setSourceGeo(base);
                setDeptsGeo(base);
            }

            if (geoMode === 'france') {
                setFilteredGeo(null); // Show everything with base styling
                return;
            }

            const activeCodes = geoMode === 'dept' ? [selectedDept] : (REGIONS[selectedRegion] || []);
            const filtered = {
                type: "FeatureCollection",
                features: base.features.filter(f => activeCodes.includes(f.properties.code))
            };
            setFilteredGeo(filtered);
        };
        loadGeo();
    }, [geoMode, selectedRegion, selectedDept, sourceGeo]);

    const handleSearch = async (q) => {
        setSearchQuery(q);
        if (q.length < 3) { setSuggestions([]); return; }
        try {
            const url = searchMode === 'commune'
                ? `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5&type=municipality`
                : `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5`;
            const res = await fetch(url);
            const d = await res.json();
            setSuggestions(d.features || []);
        } catch (e) { console.error(e); }
    };



    const selectCity = (city) => {
        const [lon, lat] = city.geometry.coordinates;
        const isAddress = city.properties.type !== 'municipality';
        setSelectedLocation({ 
            lat, 
            lon, 
            name: isAddress ? city.properties.name : city.properties.city, 
            postcode: city.properties.postcode,
            isAddress,
            label: city.properties.label
        });
        setSearchQuery('');
        setSuggestions([]);
    };

    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const visibleStrikes = filteredStrikes.filter(s => {
        const d = new Date(s.time);
        const strikeMinute = d.getHours() * 60 + d.getMinutes();
        
        const maxMin = isLive ? (new Date().getHours() * 60 + new Date().getMinutes()) : 1440;
        if (animationMinute >= maxMin && !isPlaying) {
            return true;
        }
        
        if (trailMode === "cumulative") {
            return strikeMinute <= animationMinute;
        } else {
            const windowSize = parseInt(trailMode) || 30;
            return strikeMinute <= animationMinute && strikeMinute >= (animationMinute - windowSize);
        }
    });

    const stats = selectedLocation ? radii.map(r => ({
        radius: r,
        count: visibleStrikes.filter(s => calculateDistance(selectedLocation.lat, selectedLocation.lon, s.lat, s.lon) <= r).length
    })) : null;

    // Distribution horaire pour audit (filtrée selon la région/département sélectionné)
    const hourlyDistribution = Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        count: filteredStrikes.filter(s => s.h === h).length
    }));

    const exportImage = async () => {
        const element = document.getElementById('foudre-module-container');
        if (!element) return;

        setExporting(true); // État local pour masquer le bouton sans afficher le gros sablier
        try {
            const exportHeader = element.querySelector('.export-only-header');
            const exportFooter = element.querySelector('.export-footer');
            const siteLegend = element.querySelector('.site-only-legend');
            const zoomControl = element.querySelector('.leaflet-control-zoom');
            const controls = element.querySelector('.site-controls-expert');
            const hiddenElements = element.querySelectorAll('.hide-on-export');

            if (exportHeader) exportHeader.style.display = 'block';
            if (exportFooter) exportFooter.style.display = 'flex';
            if (siteLegend) siteLegend.style.display = 'none';
            if (zoomControl) zoomControl.style.display = 'none';
            hiddenElements.forEach(el => el.style.display = 'none');

            await new Promise(r => setTimeout(r, 800));

            const canvas = await html2canvas(element, {
                useCORS: true,
                scale: 2,
                backgroundColor: '#ffffff'
            });

            if (exportHeader) exportHeader.style.display = 'none';
            if (exportFooter) exportFooter.style.display = 'none';
            if (siteLegend) siteLegend.style.display = 'block';
            if (zoomControl) zoomControl.style.display = 'block';
            hiddenElements.forEach(el => el.style.display = 'flex');

            const link = document.createElement('a');
            link.download = `bilan-foudre-${startDate}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } finally {
            setExporting(false);
        }
    };

    const isDarkPalette = mapPalette === 'dark';

    return (
        <div style={{ height: isEmbed ? '100vh' : 'calc(100vh - 4rem)', display: 'flex', flexDirection: 'column', background: isDarkPalette ? '#0b0f19' : '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' }} id="foudre-module-container">
            <header style={{ 
                background: isDarkPalette ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.9)', 
                backdropFilter: 'blur(16px)',
                borderBottom: isDarkPalette ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                padding: '10px 24px', 
                color: isDarkPalette ? 'white' : '#0f172a', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                zIndex: 1000, 
                boxShadow: isDarkPalette ? '0 4px 20px rgba(0,0,0,0.3)' : '0 4px 20px rgba(0,0,0,0.05)' 
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ 
                            background: isDarkPalette ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2', 
                            padding: '6px', 
                            borderRadius: '50%', 
                            display: 'flex',
                            boxShadow: isDarkPalette ? '0 0 12px rgba(239, 68, 68, 0.3)' : '0 0 12px rgba(239, 68, 68, 0.1)',
                            border: isDarkPalette ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid #fecaca'
                        }}>
                            <Zap fill="#ef4444" size={16} color="#ef4444" style={{ animation: 'pulse 1.5s infinite' }} />
                        </div>
                        <span style={{ fontWeight: 950, fontSize: '1rem', letterSpacing: '-0.5px' }}>IMPACTS DE FOUDRE</span>
                    </div>
 
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '10px', 
                        background: isDarkPalette ? 'rgba(255,255,255,0.06)' : '#f1f5f9', 
                        padding: '6px 14px', 
                        borderRadius: '12px', 
                        border: isDarkPalette ? '1px solid rgba(255,255,255,0.08)' : '1px solid #cbd5e1', 
                        backdropFilter: 'blur(5px)' 
                    }}>
                        <Calendar size={14} color={isDarkPalette ? "#38bdf8" : "#2563eb"} />
                        <span style={{ color: isDarkPalette ? '#38bdf8' : '#2563eb', fontWeight: 800, fontSize: '0.75rem', whiteSpace: 'nowrap', letterSpacing: '0.5px' }}>
                            {isLive ? 'DIRECT 24H' : 'ARCHIVE'}
                        </span>
                        <input
                            type="date"
                            value={startDate}
                            max={new Date().toISOString().split('T')[0]}
                            onChange={(e) => {
                                  setStartDate(e.target.value);
                                  setIsRange(false);
                            }}
                            style={{
                                background: isDarkPalette ? 'rgba(0,0,0,0.4)' : '#fff',
                                border: isDarkPalette ? '1px solid rgba(255,255,255,0.15)' : '1px solid #cbd5e1',
                                borderRadius: '8px',
                                padding: '4px 8px',
                                color: isDarkPalette ? '#fff' : '#0f172a',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                outline: 'none'
                            }}
                        />
                        {!isLive && (
                            <button
                                onClick={() => setStartDate(new Date().toLocaleDateString('sv-SE'))}
                                style={{
                                    background: '#ef4444',
                                    color: 'white',
                                    border: 'none',
                                    padding: '4px 12px',
                                    borderRadius: '8px',
                                    fontSize: '0.65rem',
                                    fontWeight: 900,
                                    cursor: 'pointer',
                                    boxShadow: '0 0 10px rgba(239, 68, 68, 0.4)',
                                    transition: 'transform 0.2s',
                                }}
                            >
                                🔴 LIVE
                            </button>
                        )}
                        {bilanImage && (
                            <button
                                onClick={() => setViewMode(viewMode === 'bilan' ? 'points' : 'bilan')}
                                style={{
                                    background: viewMode === 'bilan' ? '#10b981' : (isDarkPalette ? 'rgba(255,255,255,0.1)' : '#e2e8f0'),
                                    color: viewMode === 'bilan' ? 'white' : (isDarkPalette ? 'white' : '#0f172a'),
                                    border: 'none',
                                    padding: '4px 12px',
                                    borderRadius: '8px',
                                    fontSize: '0.65rem',
                                    fontWeight: 900,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                📷 {viewMode === 'bilan' ? 'DONNÉES' : 'BILAN'}
                            </button>
                        )}
                    </div>
                </div>
 
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {loading && <Loader2 size={16} className="animate-spin" color="#ef4444" />}
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '1.6rem', fontWeight: 1000, color: '#ef4444', lineHeight: 1, textShadow: isDarkPalette ? '0 0 8px rgba(239,68,68,0.2)' : 'none' }}>
                                {visibleStrikes.length.toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.55rem', fontWeight: 800, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {visibleStrikes.length !== filteredStrikes.length ? `Affichés / ${filteredStrikes.length.toLocaleString()}` : 'Impacts'}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={async () => {
                                // Force France view before export for "Bilan National"
                                setMapCenter([46.4, 2.2]);
                                setMapZoom(5.7);
                                setSelectedLocation(null);
                                await new Promise(r => setTimeout(r, 1000)); // Wait for map to settle
                                exportImage();
                            }}
                            disabled={loading || exporting}
                            className="hide-on-export"
                            style={{ 
                                background: '#10b981', 
                                color: 'white', 
                                border: 'none', 
                                padding: '6px 14px', 
                                borderRadius: '8px', 
                                fontSize: '0.7rem', 
                                fontWeight: 900, 
                                cursor: 'pointer', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px', 
                                transition: 'all 0.2s',
                                boxShadow: '0 4px 10px rgba(16,185,129,0.2)'
                            }}
                        >
                            {exporting ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
                            {exporting ? '...' : 'BILAN NATIONAL'}
                        </button>
                        <button onClick={fetchStrikes} className="hide-on-export" style={{ 
                            background: isDarkPalette ? 'rgba(255,255,255,0.06)' : '#f1f5f9', 
                            border: isDarkPalette ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1', 
                            width: '32px', 
                            height: '32px', 
                            borderRadius: '8px', 
                            color: isDarkPalette ? 'white' : '#64748b', 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center' 
                        }}>
                            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                        </button>
                    </div>
                </div>
            </header>
 
            <div style={{ 
                background: isDarkPalette ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)', 
                backdropFilter: 'blur(12px)', 
                padding: '8px 24px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '15px', 
                borderBottom: isDarkPalette ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0', 
                zIndex: 999 
            }} className="site-controls-expert">
                <div style={{ display: 'flex', gap: '12px', flex: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Filtres Géo (France / Région / Département) */}
                    <div style={{ display: 'flex', gap: '3px', background: isDarkPalette ? 'rgba(255,255,255,0.06)' : '#f1f5f9', padding: '3px', borderRadius: '9px', border: isDarkPalette ? '1px solid rgba(255,255,255,0.08)' : '1px solid #cbd5e1' }} className="hide-on-export">
                        {[
                            ['france', 'France'],
                            ['region', 'Région'],
                            ['dept', 'Dépt']
                        ].map(([m, l]) => (
                            <button
                                key={m}
                                onClick={() => {
                                    setGeoMode(m);
                                    setSelectedLocation(null); // Reset commune selection when changing mode
                                }}
                                style={{
                                    padding: '4px 10px',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: 800,
                                    fontSize: '0.7rem',
                                    background: geoMode === m ? (isDarkPalette ? '#3b82f6' : '#fff') : 'transparent',
                                    color: geoMode === m ? (isDarkPalette ? '#fff' : '#ef4444') : (isDarkPalette ? '#94a3b8' : '#64748b'),
                                    transition: 'all 0.15s',
                                    boxShadow: geoMode === m && !isDarkPalette ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                                }}
                            >
                                {l}
                            </button>
                        ))}
                    </div>

                    {/* Sélecteurs dynamiques selon geoMode */}
                    {geoMode === 'region' && (
                        <select
                            value={selectedRegion}
                            onChange={(e) => {
                                setSelectedRegion(e.target.value);
                                setSelectedLocation(null);
                            }}
                            className="hide-on-export"
                            style={{
                                padding: '6px 10px',
                                borderRadius: '8px',
                                border: isDarkPalette ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1',
                                background: isDarkPalette ? 'rgba(0,0,0,0.3)' : '#fff',
                                color: isDarkPalette ? '#fff' : '#0f172a',
                                fontWeight: 800,
                                fontSize: '0.75rem',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            {Object.keys(REGIONS).sort().map(r => (
                                <option key={r} value={r} style={{ background: isDarkPalette ? '#1e293b' : '#fff', color: isDarkPalette ? '#fff' : '#0f172a' }}>{r}</option>
                            ))}
                        </select>
                    )}

                    {geoMode === 'dept' && (
                        <select
                            value={selectedDept}
                            onChange={(e) => {
                                setSelectedDept(e.target.value);
                                setSelectedLocation(null);
                            }}
                            className="hide-on-export"
                            style={{
                                padding: '6px 10px',
                                borderRadius: '8px',
                                border: isDarkPalette ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1',
                                background: isDarkPalette ? 'rgba(0,0,0,0.3)' : '#fff',
                                color: isDarkPalette ? '#fff' : '#0f172a',
                                fontWeight: 800,
                                fontSize: '0.75rem',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            {DEPARTMENTS.map(d => (
                                <option key={d.code} value={d.code} style={{ background: isDarkPalette ? '#1e293b' : '#fff', color: isDarkPalette ? '#fff' : '#0f172a' }}>{d.code} - {d.name}</option>
                            ))}
                        </select>
                    )}

                    <div className="hide-on-export" style={{ width: '1px', height: '20px', background: isDarkPalette ? 'rgba(255,255,255,0.1)' : '#cbd5e1' }} />

                    {/* Recherche de Commune ou Adresse */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* Sélecteur de mode de recherche */}
                        <div style={{ display: 'flex', gap: '2px', background: isDarkPalette ? 'rgba(255,255,255,0.06)' : '#f1f5f9', padding: '2px', borderRadius: '7px', border: isDarkPalette ? '1px solid rgba(255,255,255,0.08)' : '1px solid #cbd5e1' }} className="hide-on-export">
                            <button 
                                onClick={() => {
                                    setSearchMode('commune');
                                    setSearchQuery('');
                                    setSuggestions([]);
                                }}
                                style={{
                                    padding: '3px 8px',
                                    border: 'none',
                                    borderRadius: '5px',
                                    cursor: 'pointer',
                                    fontSize: '0.65rem',
                                    fontWeight: 850,
                                    background: searchMode === 'commune' ? (isDarkPalette ? '#0284c7' : 'white') : 'transparent',
                                    color: searchMode === 'commune' ? (isDarkPalette ? '#fff' : '#0284c7') : (isDarkPalette ? '#94a3b8' : '#64748b'),
                                    transition: 'all 0.15s'
                                }}
                            >
                                Commune
                            </button>
                            <button 
                                onClick={() => {
                                    setSearchMode('adresse');
                                    setSearchQuery('');
                                    setSuggestions([]);
                                }}
                                style={{
                                    padding: '3px 8px',
                                    border: 'none',
                                    borderRadius: '5px',
                                    cursor: 'pointer',
                                    fontSize: '0.65rem',
                                    fontWeight: 850,
                                    background: searchMode === 'adresse' ? (isDarkPalette ? '#0284c7' : 'white') : 'transparent',
                                    color: searchMode === 'adresse' ? (isDarkPalette ? '#fff' : '#0284c7') : (isDarkPalette ? '#94a3b8' : '#64748b'),
                                    transition: 'all 0.15s'
                                }}
                            >
                                Adresse
                            </button>
                        </div>

                        <div style={{ position: 'relative', width: '220px' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} className="hide-on-export" />
                            <input 
                                type="text" 
                                placeholder={searchMode === 'commune' ? "Rechercher une commune..." : "Entrer une adresse..."} 
                                value={searchQuery} 
                                onChange={(e) => handleSearch(e.target.value)} 
                                style={{ 
                                    width: '100%', 
                                    padding: '6px 12px 6px 32px', 
                                    borderRadius: '8px', 
                                    border: isDarkPalette ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1', 
                                    background: isDarkPalette ? 'rgba(0,0,0,0.3)' : '#fff',
                                    color: isDarkPalette ? '#fff' : '#0f172a',
                                    fontSize: '0.8rem', 
                                    outline: 'none', 
                                    fontWeight: 600 
                                }} 
                            />
                            {suggestions.length > 0 && (
                                <div style={{ 
                                    position: 'absolute', 
                                    top: '100%', 
                                    left: 0, 
                                    right: 0, 
                                    background: isDarkPalette ? 'rgba(15, 23, 42, 0.95)' : '#fff', 
                                    backdropFilter: 'blur(15px)',
                                    border: isDarkPalette ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0', 
                                    borderRadius: '8px', 
                                    boxShadow: isDarkPalette ? '0 10px 25px rgba(0,0,0,0.5)' : '0 10px 25px rgba(0,0,0,0.1)', 
                                    zIndex: 2000,
                                    marginTop: '4px',
                                    minWidth: '250px'
                                }}>
                                    {suggestions.map((s, i) => {
                                        const isAddr = s.properties.type !== 'municipality';
                                        return (
                                            <div 
                                                key={i} 
                                                onClick={() => selectCity(s)} 
                                                style={{ 
                                                    padding: '8px 12px', 
                                                    cursor: 'pointer', 
                                                    borderBottom: isDarkPalette ? '1px solid rgba(255,255,255,0.05)' : '1px solid #f1f5f9', 
                                                    display: 'flex', 
                                                    flexDirection: 'column',
                                                    gap: '1px'
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.background = isDarkPalette ? 'rgba(255,255,255,0.05)' : '#f8fafc'}
                                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <span style={{ fontWeight: 800, color: isDarkPalette ? '#fff' : '#0f172a', fontSize: '0.75rem' }}>
                                                    {isAddr ? s.properties.name : s.properties.city}
                                                </span>
                                                <span style={{ color: isDarkPalette ? '#94a3b8' : '#64748b', fontSize: '0.65rem', fontWeight: 700 }}>
                                                    {isAddr ? s.properties.label : `${s.properties.postcode} — Dép. ${s.properties.context?.split(',')[0] || ''}`}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={() => { setMapCenter([46.4, 2.2]); setMapZoom(5.7); setSelectedLocation(null); }}
                        className="hide-on-export"
                        title="Recentrer sur la France"
                        style={{ 
                            background: isDarkPalette ? 'rgba(255,255,255,0.06)' : '#f1f5f9', 
                            border: isDarkPalette ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1', 
                            borderRadius: '8px', 
                            padding: '0 10px', 
                            cursor: 'pointer', 
                            color: '#94a3b8' 
                        }}
                    >
                        <Crosshair size={18} />
                    </button>
                </div>
 
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} className="hide-on-export">
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px', 
                        background: isDarkPalette ? 'rgba(255,255,255,0.06)' : '#f1f5f9', 
                        padding: '4px 10px', 
                        borderRadius: '8px', 
                        border: isDarkPalette ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1' 
                    }}>
                        <LayoutGrid size={14} color="#94a3b8" />
                        <select 
                            value={foudreDesign} 
                            onChange={e => setFoudreDesign(e.target.value)} 
                            style={{ 
                                background: 'transparent', 
                                border: 'none', 
                                fontWeight: 800, 
                                fontSize: '0.75rem', 
                                outline: 'none',
                                color: isDarkPalette ? '#fff' : '#0f172a',
                                cursor: 'pointer'
                            }}
                        >
                            {Object.entries(LIGHTNING_DESIGNS).map(([k, v]) => (
                                <option key={k} value={k} style={{ background: isDarkPalette ? '#1e293b' : '#fff', color: isDarkPalette ? '#fff' : '#0f172a' }}>{v.name}</option>
                            ))}
                        </select>
                    </div>
 
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px', 
                        background: isDarkPalette ? 'rgba(255,255,255,0.06)' : '#f1f5f9', 
                        padding: '4px 10px', 
                        borderRadius: '8px', 
                        border: isDarkPalette ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1' 
                    }}>
                        <Palette size={14} color="#94a3b8" />
                        <select 
                            value={mapPalette} 
                            onChange={e => setMapPalette(e.target.value)} 
                            style={{ 
                                background: 'transparent', 
                                border: 'none', 
                                fontWeight: 800, 
                                fontSize: '0.75rem', 
                                outline: 'none',
                                color: isDarkPalette ? '#fff' : '#0f172a',
                                cursor: 'pointer'
                            }}
                        >
                            {Object.entries(MAP_PALETTES).map(([k, v]) => (
                                <option key={k} value={k} style={{ background: isDarkPalette ? '#1e293b' : '#fff', color: isDarkPalette ? '#fff' : '#0f172a' }}>{v.name}</option>
                            ))}
                        </select>
                    </div>
 
                    <a href="/foudre-expert" className="hide-on-export" style={{
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: '#0f172a',
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontWeight: 900,
                        fontSize: '0.7rem',
                    }}>
                        <Maximize size={12} />
                        GÉNÉRATEUR
                    </a>

                    <button
                        onClick={exportImage}
                        disabled={loading || exporting}
                        className="hide-on-export"
                        style={{
                            background: '#2563eb',
                            color: 'white',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontWeight: 900,
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 4px 10px rgba(37,99,235,0.2)',
                            transition: 'all 0.2s'
                        }}
                        title="Télécharger l'image de la carte"
                    >
                        <Download size={12} />
                        TÉLÉCHARGER
                    </button>
                </div>
 
                {selectedLocation && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#eff6ff', padding: '8px 20px', borderRadius: '12px', border: '1px solid #bfdbfe', animation: 'fadeIn 0.3s' }}>
                        <span style={{ fontWeight: 800, color: '#1e40af', fontSize: '0.8rem' }}>{selectedLocation.name} ({selectedLocation.postcode})</span>
                        <X size={18} color="#1e40af" className="hide-on-export" style={{ cursor: 'pointer' }} onClick={() => setSelectedLocation(null)} />
                    </div>
                )}
            </div>
 
            <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
                {/* Affichage du BILAN IMAGE si mode bilan actif */}
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
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '12px',
                            padding: '8px 20px',
                            marginBottom: '15px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px'
                        }}>
                            <span style={{ fontSize: '1.5rem' }}>📷</span>
                            <div>
                                <div style={{ color: '#fff', fontWeight: 900, fontSize: '0.9rem' }}>
                                    BILAN ARCHIVÉ - {new Date(startDate).toLocaleDateString('fr-FR')}
                                </div>
                                <div style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 700 }}>
                                    {bilanImage.impact_count?.toLocaleString() || 'N/A'} impacts détectés
                                </div>
                            </div>
                        </div>
                        <img
                            src={bilanImage.image_url}
                            alt={`Bilan foudre ${startDate}`}
                            style={{
                                maxWidth: '95%',
                                maxHeight: 'calc(100% - 100px)',
                                borderRadius: '12px',
                                border: '2px solid rgba(255,255,255,0.1)',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
                            }}
                        />
                        <button
                            onClick={() => setViewMode('points')}
                            style={{
                                marginTop: '15px',
                                background: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                padding: '10px 25px',
                                borderRadius: '10px',
                                fontWeight: 900,
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            ← VOIR LES DONNÉES
                        </button>
                    </div>
                )}
 
                {/* Floating Overlays - Match Supervision Style */}
                <div style={{
                    position: 'absolute',
                    top: '15px',
                    left: '15px',
                    zIndex: 1000,
                    width: '240px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    pointerEvents: 'none'
                }}>
                    {selectedLocation && !isAutomated && (
                        <div style={{
                            background: isDarkPalette ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                            backdropFilter: 'blur(10px)',
                            padding: '10px',
                            borderRadius: '10px',
                            border: isDarkPalette ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
                            boxShadow: isDarkPalette ? '0 10px 30px rgba(0,0,0,0.5)' : '0 10px 30px rgba(0,0,0,0.1)',
                            pointerEvents: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: isDarkPalette ? '1px solid rgba(255,255,255,0.05)' : '1px solid #f1f5f9', paddingBottom: '6px' }}>
                                <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 900, color: isDarkPalette ? '#fff' : '#0f172a' }}>{selectedLocation.name}</div>
                                    <div style={{ fontSize: '0.65rem', color: isDarkPalette ? '#3b82f6' : '#2563eb', fontWeight: 700 }}>{selectedLocation.postcode}</div>
                                </div>
                                <X size={16} color="#94a3b8" className="hide-on-export" style={{ cursor: 'pointer' }} onClick={() => setSelectedLocation(null)} />
                            </div>
 
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {stats.map(s => (
                                    <div key={s.radius} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', borderRadius: '6px', background: s.count > 0 ? 'rgba(239, 68, 68, 0.08)' : 'transparent', border: s.count > 0 ? '1px solid rgba(239, 68, 68, 0.15)' : '1px solid transparent' }}>
                                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: isDarkPalette ? '#e2e8f0' : '#334155' }}>Rayon {s.radius} km</span>
                                        <span style={{ fontSize: '0.9rem', fontWeight: 900, color: s.count > 0 ? '#ef4444' : '#64748b' }}>{s.count}</span>
                                    </div>
                                ))}
                            </div>
 
                            <button
                                onClick={exportImage}
                                className="hide-on-export"
                                style={{
                                    marginTop: '8px',
                                    width: '100%',
                                    background: isDarkPalette ? '#1e293b' : '#f1f5f9',
                                    color: isDarkPalette ? 'white' : '#0f172a',
                                    border: isDarkPalette ? 'none' : '1px solid #cbd5e1',
                                    padding: '8px',
                                    borderRadius: '8px',
                                    fontSize: '0.65rem',
                                    fontWeight: 900,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px'
                                }}
                            >
                                <Download size={14} />
                                TÉLÉCHARGER LA VUE
                            </button>
                        </div>
                    )}
                </div>
 
                <main style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', background: 'white' }}>
                    {/* Header invisible pour l'export (Titre style Keraunos) */}
                    <div className="export-only-header" style={{
                        display: 'none',
                        padding: '15px 30px',
                        background: '#0f172a',
                        color: 'white',
                        borderBottom: '4px solid #ef4444'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '1px' }}>
                                    BILAN DE L'ACTIVITÉ ORAGEUSE
                                </h1>
                                <p style={{ margin: 0, fontSize: '1rem', opacity: 0.9, fontWeight: 700 }}>
                                    Situation du {new Date().toLocaleDateString('fr-FR', { dateStyle: 'long' })}
                                </p>
                            </div>
                            <div style={{ textAlign: 'right', display: 'flex', gap: '20px', alignItems: 'center' }}>
                                <div style={{ height: '40px', width: '2px', background: 'rgba(255,255,255,0.2)' }}></div>
                                <div>
                                    <div style={{ fontSize: '2.4rem', fontWeight: 1000, color: '#ef4444', lineHeight: 1 }}>{strikes.length.toLocaleString()}</div>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase' }}>Impacts Recensés</div>
                                </div>
                            </div>
                        </div>
                    </div>
 
                    {/* Mode Image d'Archive supprimé */}
                    <MapContainer
                        center={mapCenter}
                        zoom={mapZoom}
                        zoomSnap={0.1}
                        zoomDelta={0.1}
                        style={{ flex: 1, background: MAP_PALETTES[mapPalette].bg }}
                        zoomControl={false}
                    >
                        <SearchCirclesPane />
                        {selectedLocation && <MapController center={[selectedLocation.lat, selectedLocation.lon]} zoom={10} />}
                        <GeoJSONController data={filteredGeo} isFrance={geoMode === 'france'} />
 
                        <TileLayer url={MAP_PALETTES[mapPalette].tiles} attribution='&copy; CARTODB' />
                        {/* Le masque de France via api.metetclimat.ovh est désactivé car le domaine ne répond pas */}
 
                        {/* Fond de départements (Contours) */}
                        {sourceGeo && (
                            <GeoJSON
                                data={sourceGeo}
                                style={{
                                    fillColor: 'transparent',
                                    fill: false, // Empeche le remplissage blanc parasite ("truc blanc") sur fond clair
                                    color: isDarkPalette ? 'rgba(255,255,255,0.15)' : 'rgba(15, 23, 42, 0.12)',
                                    weight: isDarkPalette ? 0.8 : 1.0,
                                    opacity: 0.8
                                }}
                                interactive={false}
                            />
                        )}
 
                        {/* Impacts (Masqués par la région) */}
                        <FastLightningLayer
                            strikes={visibleStrikes}
                            colors={HOUR_COLORS}
                            filteredGeo={filteredGeo}
                            geoMode={geoMode}
                            sourceGeo={sourceGeo}
                            pointRadius={strikeSize}
                            designId={foudreDesign}
                        />
 
                        {filteredStrikes.length === 0 && !loading && (
                            <Marker
                                position={[mapCenter[0], mapCenter[1]]}
                                icon={L.divIcon({
                                    className: 'no-data-marker',
                                    html: `<div style="background: rgba(255,255,255,0.9); padding: 15px; border-radius: 12px; border: 2px solid #ef4444; width: 220px; textAlign: center; box-shadow: 0 10px 20px rgba(0,0,0,0.2);">
                                        <div style="font-weight: 1000; color: #ef4444; font-size: 0.8rem; margin-bottom: 5px;">AUCUN IMPACT DÉTECTÉ</div>
                                        <div style="font-size: 0.65rem; color: #64748b; font-weight: 700;">Aucune activité orageuse enregistrée pour le ${startDate}.</div>
                                    </div>`,
                                    iconSize: [220, 80],
                                    iconAnchor: [110, 40]
                                })}
                            />
                        )}
 
                        {/* Surbrillance (Optionnelle) */}
                        {filteredGeo && (
                            <GeoJSON
                                key={`${geoMode}-${selectedRegion}-${selectedDept}`}
                                data={filteredGeo}
                                style={{ fillColor: 'transparent', color: '#ef4444', weight: 3, opacity: 1 }}
                                interactive={false}
                            />
                        )}
 
                        {selectedLocation && radii.map(r => (
                            <React.Fragment key={r}>
                                <Circle
                                    center={[selectedLocation.lat, selectedLocation.lon]}
                                    radius={r * 1000}
                                    pane="search-circles-pane"
                                    pathOptions={{ color: '#ef4444', weight: 2, dashArray: '5, 10', fill: false, opacity: 1 }}
                                />
                                <Marker
                                    position={[selectedLocation.lat + (r / 111.3), selectedLocation.lon]}
                                    pane="search-circles-pane"
                                    icon={L.divIcon({
                                        className: 'circle-label',
                                        html: `<div style="color:#ef4444; font-weight:1000; font-size:10px; text-shadow:0 0 3px white;">${r}km</div>`,
                                        iconSize: [30, 20]
                                    })}
                                />
                            </React.Fragment>
                        ))}

                        {/* Villes Principales (Expert Mode) */}
                        {showCities && (
                            <>
                                {MAIN_CITIES.map((city, i) => (
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
                            </>
                        )}
                    </MapContainer>

                    {/* Légende flottante (Placée hors MapContainer pour éviter que le canvas de foudre dessine par-dessus) */}
                    <div className="site-only-legend" style={{ position: 'absolute', top: '15px', right: '15px', zIndex: 1000, pointerEvents: 'auto' }}>
                        <div style={{
                            background: isDarkPalette ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                            backdropFilter: 'blur(15px)',
                            padding: '10px',
                            borderRadius: '12px',
                            border: isDarkPalette ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0',
                            boxShadow: isDarkPalette ? '0 10px 30px rgba(0,0,0,0.5)' : '0 10px 30px rgba(0,0,0,0.05)',
                            width: '220px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px'
                        }}>
                            {/* Histogramme horaire 24h */}
                            <div>
                                <div style={{ fontWeight: 1000, fontSize: '0.65rem', color: isDarkPalette ? '#fff' : '#0f172a', marginBottom: '6px', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                    {isLive ? '⚡ Impacts sur 24h glissantes' : '⚡ Répartition horaire'}
                                </div>
                                {(() => {
                                    const maxCount = Math.max(1, ...hourlyDistribution.map(h => h.count));
                                    return (
                                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '40px' }}>
                                            {hourlyDistribution.map(({ hour, count }) => (
                                                <div
                                                    key={hour}
                                                    title={`${hour}h : ${count} impacts`}
                                                    style={{
                                                        flex: 1,
                                                        height: count === 0 ? '2px' : `${Math.max(4, (count / maxCount) * 40)}px`,
                                                        background: count === 0 ? (isDarkPalette ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)') : HOUR_COLORS[hour],
                                                        borderRadius: '2px 2px 0 0',
                                                        transition: 'height 0.3s ease',
                                                        cursor: 'default',
                                                        opacity: count === 0 ? 0.3 : 1
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    );
                                })()}
                                {/* Axe des heures */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
                                    {[0, 6, 12, 18, 23].map(h => (
                                        <span key={h} style={{ fontSize: '0.42rem', fontWeight: 800, color: '#64748b' }}>{h}h</span>
                                    ))}
                                </div>
                            </div>

                            {/* Légende couleurs par heure */}
                            <div>
                                <div style={{ fontWeight: 1000, fontSize: '0.6rem', color: isDarkPalette ? '#94a3b8' : '#475569', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Chronologie</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '3px' }}>
                                    {[0, 4, 8, 12, 16, 20].map((h) => (
                                        <div key={h} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                            <div style={{ width: '100%', height: '6px', background: HOUR_COLORS[h], borderRadius: '1.5px', border: isDarkPalette ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.05)' }} />
                                            <span style={{ fontSize: '0.45rem', fontWeight: 800, color: isDarkPalette ? '#94a3b8' : '#64748b' }}>{h}h</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={{ background: isDarkPalette ? 'rgba(0,0,0,0.3)' : '#f1f5f9', padding: '8px 10px', borderRadius: '8px', border: isDarkPalette ? '1px solid rgba(255,255,255,0.05)' : '1px solid #cbd5e1', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.55rem', fontWeight: 800, color: isDarkPalette ? '#94a3b8' : '#475569', marginBottom: '2px', textTransform: 'uppercase' }}>
                                    {isLive ? 'Dernières 24h' : `Période : ${startDate}`}
                                </div>
                                <span style={{ fontSize: '0.85rem', fontWeight: 1000, color: '#ef4444' }}>TOTAL : {filteredStrikes.length.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
 
                    {/* Lecteur d'animation temporel par pas de 5 minutes */}
                    <div className="hide-on-export" style={{
                        background: isDarkPalette ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(20px)',
                        borderTop: isDarkPalette ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #cbd5e1',
                        padding: '12px 24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '20px',
                        color: isDarkPalette ? '#fff' : '#0f172a',
                        zIndex: 1000,
                        borderBottomLeftRadius: '12px',
                        borderBottomRightRadius: '12px',
                        boxShadow: isDarkPalette ? 'none' : '0 -4px 20px rgba(0,0,0,0.05)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <button
                                onClick={() => setIsPlaying(!isPlaying)}
                                style={{
                                    background: isPlaying ? '#ef4444' : (isDarkPalette ? '#3b82f6' : '#2563eb'),
                                    color: 'white',
                                    border: 'none',
                                    width: '38px',
                                    height: '38px',
                                    borderRadius: '50%',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s',
                                    boxShadow: isPlaying ? '0 0 12px rgba(239, 68, 68, 0.4)' : '0 0 12px rgba(59, 130, 246, 0.3)'
                                }}
                                title={isPlaying ? "Pause" : "Play"}
                            >
                                {isPlaying ? <Pause size={18} fill="#fff" /> : <Play size={18} fill="#fff" style={{ marginLeft: '2px' }} />}
                            </button>
                            <div style={{ minWidth: '60px', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.1rem', fontWeight: 900, fontFamily: 'monospace', color: isDarkPalette ? '#38bdf8' : '#2563eb' }}>
                                    {String(Math.floor(animationMinute / 60)).padStart(2, '0')}:{String(animationMinute % 60).padStart(2, '0')}
                                </div>
                                <div style={{ fontSize: '0.55rem', fontWeight: 800, color: isDarkPalette ? '#94a3b8' : '#64748b', textTransform: 'uppercase' }}>Heure</div>
                            </div>
                        </div>
 
                        {/* Slider bar */}
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b' }}>
                                {String(Math.floor(minMinute / 60)).padStart(2, '0')}:{String(minMinute % 60).padStart(2, '0')}
                            </span>
                            <input
                                type="range"
                                min={minMinute}
                                max={isLive ? (new Date().getHours() * 60 + new Date().getMinutes()) : 1439}
                                step="5"
                                value={animationMinute}
                                onChange={(e) => {
                                    setIsPlaying(false);
                                    setAnimationMinute(parseInt(e.target.value));
                                }}
                                style={{
                                    flex: 1,
                                    height: '6px',
                                    borderRadius: '3px',
                                    outline: 'none',
                                    cursor: 'pointer',
                                    accentColor: isDarkPalette ? '#3b82f6' : '#2563eb',
                                    background: isDarkPalette ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
                                }}
                            />
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b' }}>
                                {isLive ? `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}` : '23:59'}
                            </span>
                        </div>
 
                        {/* Options de Trailing / Rémanence */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontSize: '0.55rem', fontWeight: 800, color: isDarkPalette ? '#94a3b8' : '#64748b', textTransform: 'uppercase' }}>Rémanence</span>
                                <select
                                    value={trailMode}
                                    onChange={(e) => setTrailMode(e.target.value)}
                                    style={{
                                        background: isDarkPalette ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                                        border: isDarkPalette ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1',
                                        borderRadius: '6px',
                                        padding: '4px 8px',
                                        color: isDarkPalette ? '#fff' : '#0f172a',
                                        fontSize: '0.7rem',
                                        fontWeight: 800,
                                        outline: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value="cumulative" style={{ background: isDarkPalette ? '#1e293b' : '#fff', color: isDarkPalette ? '#fff' : '#0f172a' }}>Cumulatif complet</option>
                                    <option value="15" style={{ background: isDarkPalette ? '#1e293b' : '#fff', color: isDarkPalette ? '#fff' : '#0f172a' }}>Fenêtre 15 min</option>
                                    <option value="30" style={{ background: isDarkPalette ? '#1e293b' : '#fff', color: isDarkPalette ? '#fff' : '#0f172a' }}>Fenêtre 30 min</option>
                                    <option value="60" style={{ background: isDarkPalette ? '#1e293b' : '#fff', color: isDarkPalette ? '#fff' : '#0f172a' }}>Fenêtre 1h</option>
                                    <option value="120" style={{ background: isDarkPalette ? '#1e293b' : '#fff', color: isDarkPalette ? '#fff' : '#0f172a' }}>Fenêtre 2h</option>
                                </select>
                            </div>
 
                            {/* Vitesse d'animation */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontSize: '0.55rem', fontWeight: 800, color: isDarkPalette ? '#94a3b8' : '#64748b', textTransform: 'uppercase' }}>Vitesse</span>
                                <div style={{ display: 'flex', gap: '2px', background: isDarkPalette ? 'rgba(255,255,255,0.06)' : '#f1f5f9', padding: '2px', borderRadius: '6px', border: isDarkPalette ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1' }}>
                                    {[
                                        { label: '1x', val: 250 },
                                        { label: '2x', val: 120 },
                                        { label: '4x', val: 50 }
                                    ].map(speed => (
                                        <button
                                            key={speed.label}
                                            onClick={() => setPlaySpeed(speed.val)}
                                            style={{
                                                background: playSpeed === speed.val ? (isDarkPalette ? '#3b82f6' : '#2563eb') : 'transparent',
                                                color: playSpeed === speed.val ? '#fff' : (isDarkPalette ? '#fff' : '#64748b'),
                                                border: 'none',
                                                borderRadius: '4px',
                                                padding: '2px 8px',
                                                fontSize: '0.65rem',
                                                fontWeight: 800,
                                                cursor: 'pointer',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {speed.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
 
                    {/* Footer pour l'export (Légende Hors Carte) */}
                    <div className="export-footer" style={{
                        background: 'white',
                        padding: '15px 30px',
                        borderTop: '1px solid #e2e8f0',
                        display: 'none',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <img src="/logo.jpg" style={{ height: '40px', borderRadius: '6px' }} />
                            <div>
                                <div style={{ fontWeight: 900, fontSize: '0.75rem', color: '#0f172a' }}>MÉTÉO CLIMAT PRO</div>
                                <div style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 700 }}>Source : Météo-NPDC</div>
                            </div>
                        </div>

                        {selectedLocation && stats && (
                            <div style={{ 
                                background: '#f8fafc', 
                                border: '1px solid #cbd5e1', 
                                borderRadius: '8px', 
                                padding: '6px 14px', 
                                display: 'flex', 
                                flexDirection: 'column', 
                                gap: '2px',
                                minWidth: '220px'
                            }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: 1000, color: '#0f172a' }}>
                                    📍 COMMUNE : {selectedLocation.name.toUpperCase()} ({selectedLocation.postcode})
                                </div>
                                <div style={{ display: 'flex', gap: '8px', fontSize: '0.55rem', fontWeight: 800 }}>
                                    {stats.map(s => (
                                        <span key={s.radius} style={{ 
                                            background: s.count > 0 ? '#fee2e2' : '#f1f5f9', 
                                            color: s.count > 0 ? '#ef4444' : '#64748b', 
                                            padding: '2px 6px', 
                                            borderRadius: '4px',
                                            border: s.count > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0'
                                        }}>
                                            {s.radius}km : {s.count}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
 
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', gap: '3px' }}>
                                {HOUR_COLORS.filter((_, i) => i % 1 === 0).map((col, h) => (
                                    <div key={h} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                        <div style={{ width: '10px', height: '10px', background: col, borderRadius: '2px' }} />
                                        {h % 6 === 0 && <span style={{ fontSize: '0.5rem', fontWeight: 800, color: '#94a3b8' }}>{h}h</span>}
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'flex-end' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <div className="blinking-dot-small" style={{ width: '8px', height: '8px' }}></div>
                                    <span style={{ fontSize: '0.55rem', fontWeight: 800, color: '#ef4444' }}>DIRECT (-15 MIN)</span>
                                </div>
                                <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#cbd5e1' }}>|</span>
                                <span style={{ fontSize: '0.55rem', fontWeight: 800, color: '#64748b' }}>ARCHIVES : POINTS FIXES</span>
                            </div>
                        </div>
                    </div>
                </main>
 
                {/* Bouton de Debug discret */}
                <div className="hide-on-export" style={{ position: 'absolute', bottom: '70px', left: '15px', zIndex: 3000 }}>
                    <button 
                        onClick={() => setShowDebug(!showDebug)}
                        style={{
                            background: showDebug ? '#ef4444' : (isDarkPalette ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.95)'),
                            backdropFilter: 'blur(10px)',
                            border: isDarkPalette ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #cbd5e1',
                            color: showDebug ? '#fff' : (isDarkPalette ? '#fff' : '#0f172a'),
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.8rem',
                            fontWeight: 'bold',
                            boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
                            transition: 'all 0.2s'
                        }}
                        title="Informations de débogage"
                    >
                        {showDebug ? 'X' : '⚙️'}
                    </button>
                </div>
 
                {showDebug && (
                    <div className="hide-on-export" style={{
                        position: 'absolute',
                        bottom: '110px',
                        left: '15px',
                        zIndex: 3000,
                        background: isDarkPalette ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)',
                        backdropFilter: 'blur(15px)',
                        border: isDarkPalette ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #cbd5e1',
                        padding: '12px',
                        borderRadius: '10px',
                        width: '300px',
                        color: isDarkPalette ? '#fff' : '#0f172a',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                    }}>
                        <div style={{ fontWeight: 'bold', borderBottom: isDarkPalette ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e2e8f0', paddingBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                            <span>CONSOLE DE DÉBOGAGE</span>
                            <span style={{ color: '#ef4444', cursor: 'pointer' }} onClick={() => setShowDebug(false)}>Fermer</span>
                        </div>
                        <div><b>Statut :</b> {debugInfo.status}</div>
                        <div><b>Erreur :</b> {debugInfo.error}</div>
                        <div><b>Nombre Impacts Total :</b> {filteredStrikes.length} (sur {strikes.length})</div>
                        <div><b>Nombre Impacts Visibles :</b> {visibleStrikes.length}</div>
                        <div><b>Minute Animation :</b> {animationMinute} ({Math.floor(animationMinute / 60)}h{animationMinute % 60}m)</div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FoudreFrance;
