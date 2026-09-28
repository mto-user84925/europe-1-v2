import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, ImageOverlay, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Waves, RefreshCw, Anchor, Compass, Info, ShieldAlert } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import './SeaTemperatureMap.css';
import { CARTO_TILES } from '../../constants/carto';

// Supabase base URL
const SUPA_URL = 'https://ubdevaemtwbzxksjlhjg.supabase.co/storage/v1/object/public/vigilance-captures';

// Color stops for legend (same as Python script, in °C)
const COLOR_STOPS = [
    [6,  '#08306b'], [10, '#08519c'], [13, '#2171b5'],
    [15, '#4292c6'], [17, '#6baed6'], [19, '#9ecae1'],
    [20, '#31a354'], [21, '#74c476'], [22, '#c7e55c'],
    [23, '#fee027'], [24, '#fd9f61'], [26, '#e6550d'],
    [28, '#a50f15'], [30, '#67000d'],
];

// Bounds: same as Python script [south, west, north, east] (extended to cover UK and Atlantic edges)
const SST_BOUNDS = [[30.0, -18.0], [62.0, 18.0]]; // [[sw_lat, sw_lon], [ne_lat, ne_lon]]

function createMarkerIcon(temp) {
    const color = temp !== null ? tempToHex(temp) : '#64748b';
    const displayVal = temp !== null ? temp.toFixed(1) : '?';
    return L.divIcon({
        className: 'custom-sea-marker',
        html: `<div class="sea-marker-circle" style="background-color:${color};">
                 <span>${displayVal}</span>
               </div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
    });
}

function tempToHex(t) {
    for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
        if (t >= COLOR_STOPS[i][0] && t <= COLOR_STOPS[i + 1][0]) return COLOR_STOPS[i][1];
    }
    return t < COLOR_STOPS[0][0] ? COLOR_STOPS[0][1] : COLOR_STOPS[COLOR_STOPS.length - 1][1];
}

// Sub-component to listen to leaflet map mouse events
function MapHoverController({ grid, onHover }) {
    useMapEvents({
        mousemove(e) {
            if (!grid || !grid.data) return;
            const { lat, lng } = e.latlng;
            
            // Check boundaries
            if (lat < grid.lat_min || lat > grid.lat_max || lng < grid.lon_min || lng > grid.lon_max) {
                onHover(null);
                return;
            }
            
            // Find grid coordinates
            const latPct = (grid.lat_max - lat) / (grid.lat_max - grid.lat_min);
            const lonPct = (lng - grid.lon_min) / (grid.lon_max - grid.lon_min);
            
            const r = Math.round(latPct * (grid.rows - 1));
            const c = Math.round(lonPct * (grid.cols - 1));
            
            if (r >= 0 && r < grid.rows && c >= 0 && c < grid.cols) {
                const idx = r * grid.cols + c;
                const temp = grid.data[idx];
                onHover(temp !== null && temp !== undefined ? { temp, lat, lng } : null);
            } else {
                onHover(null);
            }
        },
        mouseout() {
            onHover(null);
        }
    });
    return null;
}

export default function SeaTemperatureMap() {
    const [stations, setStations]   = useState([]);
    const [metadata, setMetadata]   = useState(null);  // SST image metadata
    const [sstUrl, setSstUrl]       = useState(null);
    const [grid, setGrid]           = useState(null);  // Interactive grid
    const [hoverInfo, setHoverInfo] = useState(null);  // Mouse hover details
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState(null);
    const [showMarkers, setShowMarkers] = useState(true);
    const [opacity, setOpacity]     = useState(0.8);
    const [selectedStation, setSelectedStation] = useState(null);
    const [filterType, setFilterType] = useState('all');

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const ts = Date.now();

            // Load SST metadata (image URL + date)
            const metaRes = await fetch(`${SUPA_URL}/sst_metadata.json?t=${ts}`);
            if (metaRes.ok) {
                const meta = await metaRes.json();
                setMetadata(meta);
                // Cache-bust the image URL
                setSstUrl(`${SUPA_URL}/sst_france.png?t=${ts}`);
            } else {
                // No Copernicus image yet → show notice
                setMetadata(null);
                setSstUrl(null);
            }

            // Load station buoy data (always)
            const stRes = await fetch(`${SUPA_URL}/sea_temperatures.json?t=${ts}`);
            if (stRes.ok) setStations(await stRes.json());

            // Load interactive grid data
            try {
                const gridRes = await fetch(`${SUPA_URL}/sst_grid.json?t=${ts}`);
                if (gridRes.ok) setGrid(await gridRes.json());
            } catch (e) {
                console.error("Failed to load sst_grid.json:", e);
            }

        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const filteredStations = stations.filter(s => {
        if (filterType === 'all') return true;
        return s.type === filterType;
    });

    const validStations = stations.filter(s => s.temperature !== null);
    const avgTemp = validStations.length
        ? (validStations.reduce((a, s) => a + s.temperature, 0) / validStations.length).toFixed(1)
        : null;
    const maxTemp = validStations.length
        ? Math.max(...validStations.map(s => s.temperature)).toFixed(1)
        : null;

    // Gradient CSS for legend
    const gradientCss = COLOR_STOPS.map(([t, c], i) => {
        const pct = ((t - COLOR_STOPS[0][0]) / (COLOR_STOPS[COLOR_STOPS.length-1][0] - COLOR_STOPS[0][0]) * 100).toFixed(1);
        return `${c} ${pct}%`;
    }).join(', ');

    return (
        <div className="sea-map-container">
            <header className="sea-map-header">
                <h1>
                    <Waves size={24} style={{ color: '#0ea5e9' }} />
                    <span>Température de la Mer (SST)</span>
                </h1>
                <div className="sea-map-header-actions">
                    {metadata && (
                        <span className="sst-date-badge">
                            Données du {metadata.date}
                        </span>
                    )}
                    <button className="sea-btn" onClick={loadData} disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        <span>Actualiser</span>
                    </button>
                </div>
            </header>

            <div className="sea-map-body">
                <div className="leaflet-map-wrapper">
                    {loading && (
                        <div className="map-overlay-loader">
                            <RefreshCw className="animate-spin text-sky-400" size={36} />
                            <span>Chargement des données marines...</span>
                        </div>
                    )}
                    {error && (
                        <div className="map-overlay-error">
                            <ShieldAlert className="text-rose-500" size={48} />
                            <h3>Impossible de charger la carte</h3>
                            <p>{error}</p>
                            <button className="sea-btn" onClick={loadData}>Réessayer</button>
                        </div>
                    )}

                    {!loading && (
                        <MapContainer
                            center={[44.0, 3.0]}
                            zoom={5}
                            style={{ height: '100%', width: '100%', background: '#0f172a' }}
                        >
                            {/* Base map — light, no labels */}
                            <TileLayer
                                url={CARTO_TILES.LIGHT_NOLABELS}
                                attribution='&copy; CartoDB'
                                zIndex={100}
                            />

                            {/* SST Satellite image overlay (Copernicus) */}
                            {sstUrl && (
                                <ImageOverlay
                                    url={sstUrl}
                                    bounds={metadata?.bounds ? [
                                        [metadata.bounds.south, metadata.bounds.west],
                                        [metadata.bounds.north, metadata.bounds.east]
                                    ] : SST_BOUNDS}
                                    opacity={opacity}
                                    zIndex={300}
                                />
                            )}

                            {/* Labels on top */}
                            <TileLayer
                                url={CARTO_TILES.LIGHT_ONLY_LABELS}
                                zIndex={500}
                                opacity={0.9}
                            />

                            {/* Station markers */}
                            {showMarkers && filteredStations.map(stn => (
                                <Marker
                                    key={stn.id}
                                    position={[stn.latitude, stn.longitude]}
                                    icon={createMarkerIcon(stn.temperature)}
                                    eventHandlers={{ click: () => setSelectedStation(stn) }}
                                >
                                    <Popup>
                                        <div className="popup-details">
                                            <h3 className="popup-title">{stn.name}</h3>
                                            <div className="sea-info-row">
                                                <span className="label">Type :</span>
                                                <span className="value capitalize">{stn.type === 'bouee' ? 'Bouée météo' : 'Bateau'}</span>
                                            </div>
                                            <div className="sea-info-row">
                                                <span className="label">Température :</span>
                                                <span className="value text-warning">{stn.temperature !== null ? `${stn.temperature.toFixed(1)} °C` : 'N/A'}</span>
                                            </div>
                                            <div className="sea-info-row">
                                                <span className="label">Heure UTC :</span>
                                                <span className="value">{stn.time || 'N/A'}</span>
                                            </div>
                                        </div>
                                    </Popup>
                                </Marker>
                            ))}
                            {/* Hover controller */}
                            <MapHoverController grid={grid} onHover={setHoverInfo} />
                        </MapContainer>
                    )}

                    {/* Floating badge for live sea temperature at cursor */}
                    {hoverInfo && (
                        <div className="sst-hover-badge">
                            <span className="sst-hover-label">Eau :</span>
                            <span className="sst-hover-val">{hoverInfo.temp.toFixed(1)} °C</span>
                        </div>
                    )}

                    {/* Notice if no SST image yet */}
                    {!loading && !sstUrl && !error && (
                        <div className="sst-notice">
                            <Waves size={20} />
                            <span>Image satellite en attente de la première génération (ce soir après 21h30)</span>
                        </div>
                    )}
                </div>

                {/* Sidebar */}
                <div className="sea-sidebar">
                    {/* Stats */}
                    <div className="sea-stats-row">
                        <div className="sea-stat">
                            <span className="stat-val">{validStations.length}</span>
                            <span className="stat-lbl">Stations</span>
                        </div>
                        <div className="sea-stat">
                            <span className="stat-val">{avgTemp ? `${avgTemp}°C` : '—'}</span>
                            <span className="stat-lbl">Moy. mer</span>
                        </div>
                        <div className="sea-stat">
                            <span className="stat-val">{maxTemp ? `${maxTemp}°C` : '—'}</span>
                            <span className="stat-lbl">Max</span>
                        </div>
                    </div>

                    {/* Affichage controls */}
                    <div className="filter-section">
                        <span className="filter-title">Affichage</span>
                        <div className="sst-controls">
                            <label className="sst-toggle">
                                <input type="checkbox" checked={showMarkers} onChange={e => setShowMarkers(e.target.checked)} />
                                <span>Afficher les bouées</span>
                            </label>
                            <label className="sst-slider-label">
                                <span>Opacité carte : {Math.round(opacity * 100)}%</span>
                                <input
                                    type="range" min="0.2" max="1" step="0.05"
                                    value={opacity}
                                    onChange={e => setOpacity(parseFloat(e.target.value))}
                                    className="sst-slider"
                                />
                            </label>
                        </div>
                    </div>

                    {/* Filter type */}
                    <div className="filter-section">
                        <span className="filter-title">Filtrer les stations</span>
                        <div className="filter-buttons">
                            {[['all', 'Toutes'], ['bouee', 'Bouées'], ['bateau', 'Bateaux']].map(([val, lbl]) => (
                                <button
                                    key={val}
                                    className={`sea-btn ${filterType === val ? 'active' : ''}`}
                                    onClick={() => setFilterType(val)}
                                >
                                    {val === 'bouee' ? <Waves size={14} /> : val === 'bateau' ? <Anchor size={14} /> : <Compass size={14} />}
                                    <span>{lbl}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Legend */}
                    <div className="sst-legend">
                        <span className="filter-title">Légende SST</span>
                        <div className="sst-gradient-bar" style={{ background: `linear-gradient(to right, ${gradientCss})` }} />
                        <div className="sst-legend-labels">
                            <span>{COLOR_STOPS[0][0]}°C</span>
                            <span>18°C</span>
                            <span>{COLOR_STOPS[COLOR_STOPS.length-1][0]}°C</span>
                        </div>
                    </div>

                    {/* Selected station */}
                    {selectedStation && (
                        <div className="sea-info-card">
                            <h2>Détail Station</h2>
                            <div className="sea-info-row"><span className="label">Nom</span><span className="value">{selectedStation.name}</span></div>
                            <div className="sea-info-row"><span className="label">Type</span><span className="value">{selectedStation.type === 'bouee' ? 'Bouée' : 'Bateau'}</span></div>
                            <div className="sea-info-row"><span className="label">Température</span>
                                <span className="value temp">{selectedStation.temperature !== null ? `${selectedStation.temperature.toFixed(1)} °C` : 'N/A'}</span>
                            </div>
                            <div className="sea-info-row"><span className="label">Heure (UTC)</span><span className="value">{selectedStation.time || 'N/A'}</span></div>
                            <div className="sea-info-row"><span className="label">Position</span>
                                <span className="value">{selectedStation.latitude?.toFixed(2)}°N, {selectedStation.longitude?.toFixed(2)}°E</span>
                            </div>
                        </div>
                    )}

                    {/* Source */}
                    <div className="sea-info-card" style={{ background: 'rgba(14,165,233,0.05)', borderColor: 'rgba(14,165,233,0.2)' }}>
                        <div className="flex gap-2 text-sky-400 mb-1 items-center">
                            <Info size={16} />
                            <span className="font-semibold text-xs text-sky-400 uppercase tracking-wider">Source</span>
                        </div>
                        <p className="text-slate-400 text-xs leading-relaxed m-0">
                            {metadata
                                ? `© ${metadata.attribution || 'Copernicus Marine Service'} — L4 NRT ~2km`
                                : 'Données bouées : Meteociel. Image SST : Copernicus Marine Service (générée chaque soir après 21h30).'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
