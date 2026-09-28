
import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Calendar, ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import { CARTO_TILES } from '../../constants/carto';

// Component to handle map center changes
function MapController({ center }) {
    const map = useMap();
    useEffect(() => {
        map.flyTo(center, 6);
    }, [center, map]);
    return null;
}

const OrageArchives = () => {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [stormData, setStormData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Helper to format date as YYYYMMDD
    const formatDate = (date) => {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}${mm}${dd}`;
    };

    const loadData = async (date) => {
        setLoading(true);
        setError(null);
        setStormData([]);

        const dateStr = formatDate(date);
        const ARCHIVE_BASE = 'https://raw.githubusercontent.com/monsieurmeteo/europe-1-v2/master/public/archives_orage';
        const jsonPath = `${ARCHIVE_BASE}/orage_${dateStr}.json?t=${Date.now()}`;

        try {
            const response = await fetch(jsonPath, { cache: 'no-store' });
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error("Aucune donnée archivée pour cette date (ou fichier pas encore téléchargé).");
                }
                throw new Error(`Erreur chargement: ${response.status}`);
            }
            const data = await response.json();

            // Validation simple
            if (Array.isArray(data)) {
                setStormData(data);
            } else {
                setStormData([]);
                console.warn("Format de données inattendu", data);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Load data when date changes
    useEffect(() => {
        loadData(selectedDate);
    }, [selectedDate]);

    const changeDate = (days) => {
        const newDate = new Date(selectedDate);
        newDate.setDate(newDate.getDate() + days);
        setSelectedDate(newDate);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', width: '100%', backgroundColor: '#0f172a', color: 'white', overflow: 'hidden', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}>
            {/* Header controls */}
            <div className="p-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between z-10 shadow-md" style={{ backgroundColor: '#1e293b', borderColor: '#334155', padding: '1rem' }}>
                <div className="flex items-center gap-2">
                    <Zap className="text-yellow-400" size={24} style={{ color: '#fbbf24' }} />
                    <h1 className="text-xl font-bold" style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'white' }}>
                        Archives Foudre
                    </h1>
                </div>

                <div className="flex items-center gap-4 bg-slate-700 p-1 rounded-lg" style={{ backgroundColor: '#334155' }}>
                    <button
                        onClick={() => changeDate(-1)}
                        className="p-2 hover:bg-slate-600 rounded-md transition-colors"
                    >
                        <ChevronLeft size={20} />
                    </button>

                    <div className="flex items-center gap-2 font-mono text-lg justify-center">
                        <input
                            type="date"
                            className="bg-slate-800 text-white border border-slate-600 rounded px-2 py-1 outline-none focus:border-yellow-400"
                            style={{ colorScheme: 'dark' }}
                            value={selectedDate.toISOString().split('T')[0]}
                            onChange={(e) => {
                                const d = new Date(e.target.value);
                                if (!isNaN(d.getTime())) setSelectedDate(d);
                            }}
                        />
                    </div>

                    <button
                        onClick={() => changeDate(1)}
                        className="p-2 hover:bg-slate-600 rounded-md transition-colors"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>

                <div className="text-sm text-slate-400" style={{ color: '#94a3b8' }}>
                    {loading ? (
                        <span className="flex items-center gap-2 text-yellow-400">
                            <span className="animate-spin">⏳</span> Chargement...
                        </span>
                    ) : (
                        <span>
                            {stormData.length > 0
                                ? `${stormData.length.toLocaleString()} impacts détectés`
                                : "Aucune activité orageuse"}
                        </span>
                    )}
                </div>
            </div>

            {/* Main Map Area */}
            <div className="flex-1 relative w-full" style={{ flex: 1, position: 'relative', width: '100%', isolation: 'isolate' }}>
                <MapContainer
                    center={[46.603354, 1.888334]}
                    zoom={6}
                    style={{ height: '100%', width: '100%', background: '#0f172a', zIndex: 0 }}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                        url={CARTO_TILES.DARK_ALL}
                    />

                    <MapController center={[46.603354, 1.888334]} />

                    {!loading && stormData.map((strike, idx) => {
                        const lat = parseFloat(strike.lat);
                        const lon = parseFloat(strike.lon);
                        if (isNaN(lat) || isNaN(lon)) return null;

                        return (
                            <CircleMarker
                                key={idx}
                                center={[lat, lon]}
                                radius={2}
                                pathOptions={{
                                    color: '#fbbf24',
                                    fillColor: '#fbbf24',
                                    fillOpacity: 0.8,
                                    weight: 0
                                }}
                            >
                                <Popup>
                                    <div className="text-slate-900">
                                        <strong>Impact de foudre</strong><br />
                                        Heure: {strike.heure}<br />
                                        Lat: {lat.toFixed(3)}, Lon: {lon.toFixed(3)}
                                    </div>
                                </Popup>
                            </CircleMarker>
                        );
                    })}
                </MapContainer>

                {/* Error / Status Overlay */}
                {error && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500/90 text-white px-4 py-2 rounded-md backdrop-blur-sm z-[1000] shadow-lg border border-red-400">
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
};

export default OrageArchives;
