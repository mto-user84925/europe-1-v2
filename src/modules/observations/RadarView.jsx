import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { Play, Pause, FastForward, Rewind, Info } from 'lucide-react';
import clsx from 'clsx';
import './RadarView.css';
import { CARTO_TILES } from '../../constants/carto';
import L from 'leaflet';

// Fix Leaflet icons
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

import { useLocation } from '../../contexts/LocationContext';

const DEFAULT_CENTER = [46.603354, 1.888334]; // France

function MapControllerComp({ center, zoom }) {
    const map = useMap();
    useEffect(() => {
        map.setView(center, zoom);
    }, [center, zoom, map]);
    return null;
}

export default function RadarView({ mode = 'france', type = 'radar' }) {
    const { location } = useLocation();
    const isHD = mode === 'hd';
    // Use selected location for HD center, otherwise default France
    const center = isHD ? [location.lat, location.lon] : DEFAULT_CENTER;
    const zoom = isHD ? 9 : 6;

    const [timestamps, setTimestamps] = useState([]);
    const [currentFrame, setCurrentFrame] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [speed, setSpeed] = useState(1);
    const [mapType, setMapType] = useState('dark');

    // Fetch RainViewer timestamps
    useEffect(() => {
        setIsPlaying(false);
        setTimestamps([]);

        // RainViewer discontinued Satellite Infrared (Jan 2026).
        // We now use Radar data for both modes, but with different aesthetics for Storms.

        fetch('https://api.rainviewer.com/public/weather-maps.json')
            .then(res => res.json())
            .then(data => {
                // Always fetch radar data
                const frames = [...(data.radar?.past || []), ...(data.radar?.nowcast || [])];
                setTimestamps(frames);
                setCurrentFrame(Math.max(0, frames.length - 1)); // Start at latest

                // Set map type based on mode, but only use available layers
                if (type === 'storms') {
                    setMapType('dark'); // Dark map makes colorful storm cells pop
                } else {
                    setMapType('dark'); // Default to dark for consistency or user pref
                }
            })
            .catch(e => console.error("RainViewer API error", e));
    }, [type]); // Re-fetch/Reset when type changes

    // Animation Loop
    useEffect(() => {
        let interval;
        if (isPlaying && timestamps.length > 0) {
            interval = setInterval(() => {
                setCurrentFrame(prev => (prev + 1) % timestamps.length);
            }, 1000 / speed);
        }
        return () => clearInterval(interval);
    }, [isPlaying, speed, timestamps]);

    const handleStep = (dir) => {
        setIsPlaying(false);
        setCurrentFrame(prev => {
            const next = prev + dir;
            if (next < 0) return timestamps.length - 1;
            if (next >= timestamps.length) return 0;
            return next;
        });
    };

    const currentTs = timestamps[currentFrame];
    const formattedTime = currentTs
        ? new Date(currentTs.time * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : '--:--';

    // Layer Configuration
    // Radar: Color 2 (Universal Blue), Smooth 1_1
    // Storms: Color 6 (TITAN - defines heavy rain well), Smooth 1_1
    // See https://www.rainviewer.com/api/color-schemes.html
    const layerType = type === 'storms' ? '6/1_1' : '2/1_1';
    const opacity = type === 'storms' ? 0.8 : 0.8;

    const radarTileUrl = currentTs
        ? `https://tilecache.rainviewer.com/v2/radar/${currentTs.time}/256/{z}/{x}/{y}/${layerType}.png`
        : null;

    // Base Map Provider
    const getBaseLayer = () => {
        switch (mapType) {
            case 'light': return CARTO_TILES.LIGHT_ALL;
            case 'satellite': return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
            default: return CARTO_TILES.DARK_ALL;
        }
    };

    return (
        <div className="radar-view-container">
            <div className="radar-header card">
                <div className="header-left">
                    <h3>{type === 'storms' ? 'Suivi Orages (Radar Intensité)' : 'Radar Précipitations'} {isHD ? '(Nord)' : '(France)'}</h3>
                    <div className="live-badge">
                        {currentFrame >= timestamps.length - 4 ? 'LIVE' : 'ARCHIVE'} : {formattedTime}
                    </div>
                </div>

                <div className="map-toggles">
                    <button className={clsx("toggle-btn", { active: mapType === 'dark' })} onClick={() => setMapType('dark')}>Sombre</button>
                    <button className={clsx("toggle-btn", { active: mapType === 'light' })} onClick={() => setMapType('light')}>Clair</button>
                    <button className={clsx("toggle-btn", { active: mapType === 'satellite' })} onClick={() => setMapType('satellite')}>Sat</button>
                </div>
            </div>

            <div className="map-wrapper card">
                <MapContainer
                    center={center}
                    zoom={zoom}
                    scrollWheelZoom={true}
                    className="leaflet-map"
                    zoomControl={false}
                    // Force remount when center changes to avoid tile issues
                    key={`${center[0]}-${center[1]}`}
                >
                    <TileLayer
                        attribution='&copy; CARTO / RainViewer'
                        url={getBaseLayer()}
                    />

                    {radarTileUrl && (
                        <TileLayer
                            key={`${radarTileUrl}-${opacity}`}
                            url={radarTileUrl}
                            opacity={opacity}
                            zIndex={100}
                        />
                    )}

                    {isHD && <L.Marker position={[location.lat, location.lon]}></L.Marker>}

                    <MapControllerComp center={center} zoom={zoom} />
                </MapContainer>

                <div className="animation-overlay">
                    <div className="control-bar">
                        <button className="ctrl-btn" onClick={() => handleStep(-1)}><Rewind size={18} /></button>
                        <button className={clsx("ctrl-btn play", { active: isPlaying })} onClick={() => setIsPlaying(!isPlaying)}>
                            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                        </button>
                        <button className="ctrl-btn" onClick={() => handleStep(1)}><FastForward size={18} /></button>
                    </div>

                    <div className="timeline-bar">
                        <input
                            type="range"
                            min={0}
                            max={Math.max(0, timestamps.length - 1)}
                            value={currentFrame}
                            onChange={(e) => { setIsPlaying(false); setCurrentFrame(Number(e.target.value)); }}
                        />
                    </div>
                </div>
            </div>

            <div className="info-panel">
                <p><Info size={16} />
                    {type === 'storms'
                        ? "Mode Orage: Visualisation des fortes intensités (Orange/Rouge/Mauve) indiquant un risque de grêle ou foudre."
                        : "Radar: Précipitations détectées (Bleu=Faible, Rouge=Fort)."
                    }
                </p>
            </div>
        </div>
    );
}
