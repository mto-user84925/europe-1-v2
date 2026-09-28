import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, ImageOverlay, ZoomControl } from 'react-leaflet';
import '../radar/RadarFrance.css';
import { Satellite, RefreshCw, Play, Square, ChevronLeft, ChevronRight } from 'lucide-react';
import { CARTO_TILES } from '../../constants/carto';

// ─────────────────────────────────────────────────────────────────────────────
// EUMETSAT WMS GetMap — 1 seule image par frame (pas de tuiles)
// Préchargé en cache navigateur → setUrl() instantané → 0 saccade
// ─────────────────────────────────────────────────────────────────────────────
const WMS_BASE = 'https://view.eumetsat.int/geoserver/wms';

// Boîte englobante Europe/France — EPSG:4326 WMS 1.3.0 : minLat,minLon,maxLat,maxLon
const BBOX_WMS  = '36,-16,57,20';
const IMG_W     = 900;
const IMG_H     = 700;
// Bounds Leaflet : [[minLat, minLon], [maxLat, maxLon]]
const BOUNDS    = [[36, -16], [57, 20]];

const LAYERS = {
    geocolor_hd: { wms: 'mtg_fd:rgb_geocolour',          label: 'Géo-Couleur HD (MTG)', step: 10, count: 12, color: '#0ea5e9', opacity: 0.9 },
    truecolor_hd:{ wms: 'mtg_fd:rgb_truecolour',         label: 'Couleur HD (MTG)',  step: 10, count: 12, color: '#10b981', opacity: 0.9 },
    infrared_hd: { wms: 'mtg_fd:ir105_hrfi',             label: 'IR HD (MTG)',       step: 10, count: 15, color: '#6366f1', opacity: 0.9 },
    visible_hd:  { wms: 'mtg_fd:vis06_hrfi',             label: 'Visible HD (MTG)',  step: 10, count: 15, color: '#f59e0b', opacity: 0.9 },
    foudre_li:   { wms: 'mtg_fd:li_afa',                 label: 'Foudre LI (MTG)',   step: 10, count: 15, color: '#ef4444', opacity: 0.8 },
    infrared:    { wms: 'msg_fes:ir108',                 label: 'IR Standard (MSG)', step: 15, count: 20, color: '#4f46e5', opacity: 0.9 },
    visible:     { wms: 'msg_fes:vis006',                label: 'Visible Standard',  step: 15, count: 16, color: '#d97706', opacity: 0.9 },
    natural:     { wms: 'mumi:wideareacoverage_rgb_natural', label: 'Couleur Standard', step: 60, count: 10, color: '#059669', opacity: 0.88 },
};

// Génère N timestamps ISO en remontant depuis maintenant (avec décalage de 20 minutes pour garantir la disponibilité)
const genTimestamps = (stepMin, count) => {
    const now = new Date(Date.now() - 20 * 60 * 1000);
    now.setSeconds(0, 0);
    now.setMinutes(Math.floor(now.getMinutes() / stepMin) * stepMin);
    return Array.from({ length: count }, (_, i) => {
        const d = new Date(now - (count - 1 - i) * stepMin * 60000);
        return d.toISOString().slice(0, 19) + 'Z';
    });
};

const buildUrl = (wmsLayer, time) =>
    `${WMS_BASE}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap` +
    `&LAYERS=${encodeURIComponent(wmsLayer)}&STYLES=` +
    `&CRS=EPSG%3A4326&BBOX=${BBOX_WMS}` +
    `&WIDTH=${IMG_W}&HEIGHT=${IMG_H}` +
    `&FORMAT=image%2Fpng&TRANSPARENT=TRUE` +
    `&TIME=${encodeURIComponent(time)}`;

// Préchargement : remplit le cache navigateur pour que setUrl() soit instantané
const preload = (url) =>
    new Promise(resolve => {
        const img = new window.Image();
        img.onload = img.onerror = () => resolve(url);
        img.src = url;
    });

// Formate un timestamp ISO en heure locale lisible
const fmtTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

// ─────────────────────────────────────────────────────────────────────────────
const SatelliteFrance = () => {
    const center = [46.5, 2.5];
    const zoom   = 5;

    const [layerKey,      setLayerKey]      = useState('geocolor_hd');
    const [urls,          setUrls]          = useState([]);
    const [timestamps,    setTimestamps]    = useState([]);
    const [currentIndex,  setCurrentIndex]  = useState(0);
    const [isPlaying,     setIsPlaying]     = useState(false);
    const [loading,       setLoading]       = useState(true);
    const [progress,      setProgress]      = useState(0);
    const [speed,         setSpeed]         = useState(600); // ms entre frames

    const timerRef   = useRef(null);
    const urlsRef    = useRef([]);

    const layer = LAYERS[layerKey];

    // ── Chargement + préchargement ────────────────────────────────────────────
    const loadFrames = useCallback(async () => {
        setLoading(true);
        setProgress(0);
        setIsPlaying(false);
        clearInterval(timerRef.current);

        const ts   = genTimestamps(layer.step, layer.count);
        const list = ts.map(t => buildUrl(layer.wms, t));

        // Préchargement asynchrone non bloquant pour le cache
        let loadedCount = 0;
        const checkComplete = () => {
            if (loadedCount === list.length) {
                setTimestamps(ts);
                setUrls(list);
                urlsRef.current = list;
                setCurrentIndex(list.length - 1);
                setLoading(false);
                setIsPlaying(true);
            }
        };

        list.forEach(url => {
            preload(url).then(() => {
                loadedCount++;
                setProgress(Math.round((loadedCount / list.length) * 100));
                checkComplete();
            }).catch(() => {
                loadedCount++;
                checkComplete();
            });
        });
    }, [layerKey]);

    useEffect(() => { loadFrames(); }, [loadFrames]);

    // ── Animation : changement d'opacités directes à 60 FPS ───────────────────
    useEffect(() => {
        clearInterval(timerRef.current);
        if (!isPlaying || urls.length === 0) return;

        timerRef.current = setInterval(() => {
            setCurrentIndex(prev => (prev + 1) % urlsRef.current.length);
        }, speed);

        return () => clearInterval(timerRef.current);
    }, [isPlaying, urls, speed]);

    // ── Navigation manuelle ───────────────────────────────────────────────────
    const goTo = (idx) => {
        const i = Math.max(0, Math.min(idx, urls.length - 1));
        setCurrentIndex(i);
    };

    return (
        <div className="radar-container">
            {/* ── BARRE DE CONTRÔLE ── */}
            <div className="radar-controls-compact" style={{ gap: '6px', flexWrap: 'wrap' }}>

                {/* Boutons de couche */}
                {Object.entries(LAYERS).map(([key, { label, color }]) => (
                    <button key={key}
                        className={`btn-compact ${layerKey === key ? 'active' : ''}`}
                        onClick={() => setLayerKey(key)}
                        style={{
                            width: 'auto', padding: '0 12px', gap: '6px',
                            background: layerKey === key ? color : 'transparent',
                            color:      layerKey === key ? '#fff'  : '#64748b',
                            border:    `1px solid ${layerKey === key ? color : '#e2e8f0'}`,
                            borderRadius: '8px', transition: 'all 0.2s',
                        }}>
                        <Satellite size={14} />
                        <span style={{ fontWeight: 800, fontSize: '0.73rem' }}>{label}</span>
                    </button>
                ))}

                <div className="control-divider" />

                {/* Navigation frame */}
                <button className="btn-compact" onClick={() => { setIsPlaying(false); goTo(currentIndex - 1); }}
                    style={{ width: 28, padding: 0 }} disabled={loading}>
                    <ChevronLeft size={14} />
                </button>

                <button className="btn-compact" onClick={() => setIsPlaying(p => !p)}
                    style={{ width: 28, padding: 0 }} disabled={loading}>
                    {isPlaying ? <Square size={13} /> : <Play size={13} />}
                </button>

                <button className="btn-compact" onClick={() => { setIsPlaying(false); goTo(currentIndex + 1); }}
                    style={{ width: 28, padding: 0 }} disabled={loading}>
                    <ChevronRight size={14} />
                </button>

                {/* Vitesse */}
                <select value={speed} onChange={e => setSpeed(Number(e.target.value))}
                    style={{ fontSize: '0.68rem', fontWeight: 700, padding: '3px 6px',
                             borderRadius: '6px', border: '1px solid #e2e8f0',
                             background: '#f8fafc', color: '#475569', cursor: 'pointer' }}>
                    <option value={1000}>x0.5</option>
                    <option value={600}>x1</option>
                    <option value={300}>x2</option>
                    <option value={150}>x4</option>
                </select>

                <button className="btn-compact" onClick={loadFrames}
                    style={{ width: 28, padding: 0 }} title="Actualiser">
                    <RefreshCw size={14} />
                </button>

                <div className="control-divider" />

                {/* Timeline Range Slider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexGrow: 1, minWidth: '150px' }}>
                    <input
                        type="range"
                        min="0"
                        max={urls.length - 1}
                        value={currentIndex}
                        onChange={(e) => {
                            setCurrentIndex(parseInt(e.target.value));
                            setIsPlaying(false);
                        }}
                        style={{
                            flexGrow: 1,
                            height: '6px',
                            borderRadius: '3px',
                            outline: 'none',
                            cursor: 'pointer',
                            accentColor: layer.color
                        }}
                        disabled={loading}
                    />
                </div>

                {/* Heure courante */}
                <span style={{ marginLeft: 'auto', fontSize: '0.72rem',
                               fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
                    {loading
                        ? `Chargement ${progress}%`
                        : `${fmtTime(timestamps[currentIndex])} UTC  (${currentIndex + 1}/${urls.length})`}
                </span>
            </div>

            {/* ── CARTE ── */}
            <div className="radar-main-content SINGLE">
                <div className="radar-map-wrapper">

                    {/* Loader avec barre de progression */}
                    {loading && (
                        <div className="radar-glass-loader">
                            <div className="loader-content">
                                <div className="spinner" />
                                <p style={{ marginBottom: 8 }}>Préchargement {layer.label}…</p>
                                <div style={{ width: 180, height: 6, background: '#e2e8f0',
                                              borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ width: `${progress}%`, height: '100%',
                                                  background: layer.color, borderRadius: 3,
                                                  transition: 'width 0.3s' }} />
                                </div>
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>
                                    {progress}% — {Math.round(progress * layer.count / 100)} / {layer.count} images
                                </span>
                            </div>
                        </div>
                    )}

                    <MapContainer center={center} zoom={zoom}
                        style={{ height: '100%', width: '100%' }}
                        minZoom={4} maxZoom={8} zoomControl={false}>

                        {/* Fond relief — ni noir ni trop coloré */}
                        <TileLayer
                            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}"
                            attribution="&copy; Esri" />

                        {/* Images satellites WMS superposées (transition d'opacités à 60 FPS sans clignotement) */}
                        {urls.map((url, idx) => {
                            const isCurrent = idx === currentIndex;

                            return (
                                <ImageOverlay
                                    key={url}
                                    url={url}
                                    bounds={BOUNDS}
                                    opacity={isCurrent ? layer.opacity : 0}
                                    zIndex={isCurrent ? 400 : 390}
                                />
                            );
                        })}

                        {/* Labels / frontières par-dessus */}
                        <TileLayer
                            url={CARTO_TILES.LIGHT_ONLY_LABELS}
                            zIndex={600}
                            opacity={0.85}
                        />

                        <ZoomControl position="bottomright" />
                    </MapContainer>
                </div>
            </div>
        </div>
    );
};

export default SatelliteFrance;
