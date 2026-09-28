import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, GeoJSON, Circle } from 'react-leaflet';
import { createClient } from '@supabase/supabase-js';
import 'leaflet/dist/leaflet.css';
import { Zap, Search, X, Crosshair, RefreshCw, Calendar, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import './FoudreFrance.css';
import { CARTO_TILES } from '../../constants/carto';

// const supabase = createClient(
//     import.meta.env.VITE_SUPABASE_URL,
//     import.meta.env.VITE_SUPABASE_ANON_KEY
// );

const ZONES = {
    METROPOLE: { name: 'France (Métropole)', center: [46.6, 2.2], zoom: 6 }
};

const HOUR_COLORS = [
    "#0000FF", "#0022FF", "#0044FF", "#0066FF", "#0088FF", "#00AAFF", // 0h-5h (Bleus)
    "#00CCFF", "#00EEFF", "#00FFDD", "#00FFBB", "#00FF99", "#00FF77", // 6h-11h (Cyans/Verts)
    "#00FF00", "#77FF00", "#BBFF00", "#FFFF00", "#FFCC00", "#FFAA00", // 12h-17h (Vert/Jaune/Orange)
    "#FF8800", "#FF6600", "#FF4400", "#FF2200", "#FF0000", "#8B0000"  // 18h-23h (Rouge/Brun)
];

function MapController({ center, zoom }) {
    const map = useMap();
    useEffect(() => { map.setView(center, zoom, { animate: true }); }, [center, zoom, map]);
    return null;
}

const FoudreCommunes = () => {
    const [strikes, setStrikes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [deptGeojson, setDeptGeojson] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // ÉTATS MODE & PÉRIODE
    const [mode, setMode] = useState('LIVE');
    // const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    // const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    // const [isRange, setIsRange] = useState(false);

    const radii = [1, 3, 5, 10, 15, 20];

    useEffect(() => {
        fetch('/data/departements-version-simplifiee.geojson')
            .then(res => res.json()).then(data => setDeptGeojson(data));
    }, []);

    const fetchStrikes = async () => {
        setLoading(true);
        setIsRefreshing(true);
        try {
            // API publique meteo-npdc.fr (Blitzortung) — 24h, anonyme
            const res = await fetch('https://meteo-npdc.fr/api/v2/lightning/get_latest?minutes=1440', {
                referrerPolicy: "no-referrer"
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const json = await res.json();
            if (json.success && Array.isArray(json.data)) {
                setStrikes(json.data.map(s => {
                    const d = new Date(s.timestamp ? s.timestamp.replace(' ', 'T') : Date.now());
                    const timeMs = d.getTime();
                    const validTime = isNaN(timeMs) ? Date.now() : timeMs;
                    const validD = new Date(validTime);
                    return {
                        lat: parseFloat(s.latitude),
                        lon: parseFloat(s.longitude),
                        time: validTime,
                        h: validD.getUTCHours(),
                        raw: validD.toISOString().substring(11, 19),
                        date: validD.toISOString().substring(0, 10),
                        isLive: true
                    };
                }).sort((a, b) => b.time - a.time));
            }

        } catch (e) { console.error(e); }
        finally { setLoading(false); setIsRefreshing(false); }
    };

    useEffect(() => {
        fetchStrikes();
        const interval = setInterval(fetchStrikes, 60000);
        return () => clearInterval(interval);
    }, []);

    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const handleSearch = async (q) => {
        setSearchQuery(q);
        if (q.length < 3) { setSuggestions([]); return; }
        const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5&type=municipality`);
        const d = await res.json();
        setSuggestions(d.features || []);
    };

    const selectCity = (city) => {
        const [lon, lat] = city.geometry.coordinates;
        setSelectedLocation({ lat, lon, name: city.properties.city, postcode: city.properties.postcode });
        setSearchQuery(''); setSuggestions([]);
    };

    const getStyle = (s) => {
        const age = (Date.now() - s.time) / 60000;
        const isRecent = s.isLive && age < 15;
        return {
            fill: HOUR_COLORS[s.h] || '#ff0000',
            rad: isRecent ? 8 : 5,
            border: '#000'
        };
    };

    const stats = selectedLocation ? radii.map(r => ({
        radius: r,
        count: strikes.filter(s => calculateDistance(selectedLocation.lat, selectedLocation.lon, s.lat, s.lon) <= r).length
    })) : null;

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <header style={{ background: mode === 'LIVE' ? '#ef4444' : '#0f172a', padding: '12px 20px', color: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <Zap fill="#fbbf24" color="#fbbf24" size={20} />
                        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.1)', padding: '4px', borderRadius: '8px' }}>
                            <button style={{ padding: '5px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 800, background: 'white', color: '#ef4444' }}>DIRECT</button>
                        </div>
                    </div>
                    <div style={{ background: strikes.length > 0 ? (mode === 'LIVE' ? 'white' : '#3b82f6') : '#334155', color: mode === 'LIVE' ? '#ef4444' : 'white', padding: '6px 15px', borderRadius: '10px', fontWeight: 900 }}>
                        {strikes.length.toLocaleString()} IMPACTS
                    </div>
                </div>
            </header>

            <nav style={{ background: '#f8fafc', padding: '10px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1, position: 'relative', maxWidth: '500px' }}>
                    <Search style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} size={16} color="#94a3b8" />
                    <input type="text" placeholder="Analyser une commune..." value={searchQuery} onChange={e => handleSearch(e.target.value)} style={{ width: '100%', padding: '8px 10px 8px 35px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }} />
                    {suggestions.length > 0 && (
                        <div className="search-suggestions" style={{ position: 'absolute', zIndex: 2000, width: '100%', background: 'white', border: '1px solid #e2e8f0', borderTop: 'none' }}>
                            {suggestions.map((s, i) => (
                                <div key={i} onClick={() => selectCity(s)} style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{s.properties.label}</span>
                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{s.properties.postcode}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <button onClick={fetchStrikes} disabled={isRefreshing} style={{ background: 'white', border: '1px solid #e2e8f0', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}><RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} /></button>
            </nav>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                <aside style={{ width: '320px', borderRight: '1px solid #e2e8f0', background: 'white', padding: '20px', overflowY: 'auto' }}>
                    {!selectedLocation ? (
                        <div style={{ textAlign: 'center', marginTop: '40px', color: '#94a3b8' }}>
                            <Crosshair size={48} style={{ opacity: 0.1, marginBottom: '20px' }} />
                            <p style={{ fontSize: '0.8rem' }}>Lancez une analyse de proximité foudre sur une commune via la barre de recherche.</p>
                        </div>
                    ) : (
                        <div>
                            <div style={{ background: '#eff6ff', padding: '15px', borderRadius: '12px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1rem' }}>{selectedLocation.name}</h3>
                                    <small style={{ color: '#2563eb', fontWeight: 700 }}>{selectedLocation.postcode}</small>
                                </div>
                                <X size={16} onClick={() => setSelectedLocation(null)} style={{ cursor: 'pointer' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {stats.map(s => (
                                    <div key={s.radius} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 15px', borderRadius: '10px', background: s.count > 0 ? '#fef2f2' : '#f8fafc', border: s.count > 0 ? '1px solid #fee2e2' : '1px solid #f1f5f9' }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Rayon {s.radius}km</span>
                                        <span style={{ color: s.count > 0 ? '#ef4444' : '#94a3b8', fontWeight: 900 }}>{s.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </aside>

                <main style={{ flex: 1, position: 'relative' }}>
                    <MapContainer center={[46.6, 2.2]} zoom={6} style={{ height: '100%' }} preferCanvas={true}>
                        {selectedLocation && <MapController center={[selectedLocation.lat, selectedLocation.lon]} zoom={10} />}
                        <TileLayer url={CARTO_TILES.LIGHT_NOLABELS} />
                        <TileLayer url="https://api.metetclimat.ovh/tiles/mask_france/{z}/{x}/{y}.png" opacity={0.8} />
                        {selectedLocation && radii.map(r => (
                            <Circle key={r} center={[selectedLocation.lat, selectedLocation.lon]} radius={r * 1000} pathOptions={{ color: '#ef4444', weight: 1, dashArray: '5,5', fillOpacity: 0 }} />
                        ))}
                        {strikes.map((s, i) => {
                            const st = getStyle(s);
                            return (
                                <CircleMarker key={i} center={[s.lat, s.lon]} radius={st.rad} pathOptions={{ fillColor: st.fill, fillOpacity: 0.9, color: st.border, weight: 1.2, stroke: true }}>
                                    <Popup>Impact le {s.date} à {s.raw}</Popup>
                                </CircleMarker>
                            );
                        })}

                        <div className="leaflet-bottom leaflet-right">
                            <div style={{ background: 'white', padding: '15px', margin: '20px', borderRadius: '15px', border: '1px solid #e2e8f0', boxShadow: '0 10px 20px rgba(0,0,0,0.1)', width: '220px' }}>
                                <div style={{ fontWeight: 900, fontSize: '0.7rem', color: '#0f172a', marginBottom: '10px', textAlign: 'center', borderBottom: '2px solid #f1f5f9', paddingBottom: '5px' }}>
                                    LÉGENDE 24H
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                                    {HOUR_COLORS.map((col, h) => (
                                        <div key={h} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <div style={{ width: '100%', height: '10px', background: col, borderRadius: '2px', border: '0.5px solid #000' }} />
                                            <span style={{ fontSize: '0.5rem', fontWeight: 800, color: '#64748b' }}>{h}h</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </MapContainer>
                </main>
            </div>
        </div>
    );
};

export default FoudreCommunes;
