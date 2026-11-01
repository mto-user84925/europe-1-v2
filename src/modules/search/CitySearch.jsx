import React, { useState, useEffect } from 'react';
import { Search, MapPin, Navigation, Wind, Thermometer, Droplets, ArrowRight } from 'lucide-react';

import { supabase } from '../../services/supabaseClient';

// Composant pour afficher une valeur avec son unité et sa station source, plus l'heure du relevé
const SmartValue = ({ icon: Icon, label, value, unit, station, distance, color, time }) => {
    if (value === null || value === undefined) return null;

    return (
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', flex: '1', minWidth: '280px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.9rem', fontWeight: '600' }}>
                    <Icon size={18} color={color} />
                    {label}
                </div>
                {time && <div style={{ fontSize: '0.75rem', color: '#94a3b8', background: '#f8fafc', padding: '2px 6px', borderRadius: '4px' }}>{time}</div>}
            </div>

            <div style={{ fontSize: '2rem', fontWeight: '800', color: '#0f172a' }}>
                {value} <span style={{ fontSize: '1rem', color: '#94a3b8', fontWeight: '600' }}>{unit}</span>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid #f1f5f9', fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <MapPin size={12} />
                <span>Source : <strong>{station}</strong> ({distance} km)</span>
            </div>
        </div>
    );
};

const CitySearch = () => {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [selectedCity, setSelectedCity] = useState(null);
    const [nearestData, setNearestData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [searching, setSearching] = useState(false);

    // Recherche d'adresse via API Gouv
    const searchAddress = async (q) => {
        setQuery(q);
        if (q.length < 3) {
            setSuggestions([]);
            return;
        }

        try {
            const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${q}&limit=5`);
            const data = await res.json();
            setSuggestions(data.features || []);
        } catch (e) {
            console.error("Erreur adresse:", e);
        }
    };

    const handleSelectCity = async (feature) => {
        setSelectedCity(feature);
        setSuggestions([]);
        setQuery(feature.properties.label);
        setNearestData(null);
        await fetchNearestStations(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
    };

    const handleGeolocation = () => {
        if (!navigator.geolocation) {
            alert("La géolocalisation n'est pas supportée par votre navigateur.");
            return;
        }
        setSearching(true);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const { latitude, longitude } = pos.coords;
                // Reverse geocoding pour avoir le nom de la ville (optionnel mais sympa)
                try {
                    const res = await fetch(`https://api-adresse.data.gouv.fr/reverse/?lon=${longitude}&lat=${latitude}`);
                    const data = await res.json();
                    if (data.features && data.features.length > 0) {
                        const city = data.features[0];
                        setSelectedCity(city);
                        setQuery(city.properties.label);
                    } else {
                        setSelectedCity({ properties: { label: "Ma position", city: "Localisation GPS" } });
                        setQuery("Ma position");
                    }
                } catch (e) {
                    setSelectedCity({ properties: { label: "Ma position", city: "Localisation GPS" } });
                }
                await fetchNearestStations(latitude, longitude);
                setSearching(false);
            },
            (err) => {
                console.error(err);
                alert("Impossible de vous localiser. Vérifiez vos autorisations.");
                setSearching(false);
            }
        );
    };

    const fetchNearestStations = async (lat, lon) => {
        setLoading(true);
        try {
            const { data: stations, error } = await supabase.rpc('find_nearest_stations', {
                lat_input: lat,
                lon_input: lon,
                limit_count: 10
            });

            if (error) throw error;

            const now = new Date();
            const timeWindow = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
            const stationIds = stations.map(s => s.id);

            const { data: obsData } = await supabase
                .from('observations_6mn')
                .select('*')
                .in('station_id', stationIds)
                .gte('timestamp', timeWindow)
                .order('timestamp', { ascending: false });

            // Fetch Normals for the primary station (the closest one)
            let primaryNormals = null;
            if (stations.length > 0) {
                const sid = stations[0].id;
                try {
                    const normalsData = await import('../../data/normals_1991_2020.json');
                    if (normalsData.default && normalsData.default[sid]) {
                        primaryNormals = normalsData.default[sid];
                    }
                } catch (e) { console.error("Normals local fetch error", e); }
            }

            const statsByStation = {};
            if (obsData) {
                obsData.forEach(obs => {
                    const sid = obs.station_id;
                    if (!statsByStation[sid]) {
                        statsByStation[sid] = {
                            latest: obs,
                            minT: { val: obs.t, time: obs.timestamp },
                            maxT: { val: obs.t, time: obs.timestamp },
                            maxGust: { val: (obs.fxi !== null ? obs.fxi : (obs.ff !== null ? obs.ff : null)), time: obs.timestamp },
                        };
                    } else {
                        const st = statsByStation[sid];
                        if (obs.t !== null && (st.minT.val === null || obs.t < st.minT.val)) st.minT = { val: obs.t, time: obs.timestamp };
                        if (obs.t !== null && (st.maxT.val === null || obs.t > st.maxT.val)) st.maxT = { val: obs.t, time: obs.timestamp };
                        const gust = obs.fxi !== null ? obs.fxi : obs.ff;
                        if (gust !== null && (st.maxGust.val === null || gust > st.maxGust.val)) st.maxGust = { val: gust, time: obs.timestamp };
                    }
                });
            }

            const fullStations = stations.map(s => ({
                ...s,
                obs: statsByStation[s.id]?.latest || null,
                stats: statsByStation[s.id] || null,
                dist_disp: Math.round(s.dist_km * 10) / 10
            }));

            setNearestData(fullStations);
            setSelectedCity(prev => ({ ...prev, normals: primaryNormals }));

        } catch (err) {
            console.error(err);
            setNearestData([]);
        } finally {
            setLoading(false);
        }
    };

    // Logique "Intelligente" pour trouver la meilleure source
    const getBestSource = (type) => {
        if (!nearestData) return null;

        // Parcourir les stations de la plus proche à la plus lointaine
        for (const s of nearestData) {
            // Pour les daily (Min/Max), on regarde dans .stats qui contient l'heure exacte
            if (type === 'temp_min' && s.stats?.minT?.val !== undefined && s.stats.minT.val !== null) return { val: s.stats.minT.val, unit: '°C', station: s.name, dist: s.dist_disp, time: s.stats.minT.time };
            if (type === 'temp_max' && s.stats?.maxT?.val !== undefined && s.stats.maxT.val !== null) return { val: s.stats.maxT.val, unit: '°C', station: s.name, dist: s.dist_disp, time: s.stats.maxT.time };
            // Gust Max sur 24h
            if (type === 'gust_max' && s.stats?.maxGust?.val !== undefined && s.stats.maxGust.val !== null) return { val: s.stats.maxGust.val, unit: 'km/h', station: s.name, dist: s.dist_disp, time: s.stats.maxGust.time };

            // Pour l'instant T, on regarde dans .obs
            if (!s.obs) continue;

            if (type === 'temp' && s.obs.t !== null) return { val: s.obs.t, unit: '°C', station: s.name, dist: s.dist_disp, time: s.obs.timestamp };
            if (type === 'wind' && s.obs.ff !== null) return { val: s.obs.ff, unit: 'km/h', station: s.name, dist: s.dist_disp, time: s.obs.timestamp };
            if (type === 'rain' && s.obs.rr_per !== null) return { val: Math.round(s.obs.rr_per * 10) / 10, unit: 'mm', station: s.name, dist: s.dist_disp, time: s.obs.timestamp };
        }
        return null;
    };

    const bestTemp = getBestSource('temp');
    const bestWind = getBestSource('wind');
    const bestRain = getBestSource('rain');
    // On utilise Gust Max comme "Rafales" principale ici
    const bestGust = getBestSource('gust_max');

    const bestMin = getBestSource('temp_min');
    const bestMax = getBestSource('temp_max');

    const getDeptNumber = () => {
        if (!selectedCity || !selectedCity.properties) return '';
        const { context, postcode } = selectedCity.properties;
        if (context) {
            const parts = context.split(',');
            if (parts.length > 0) {
                const dept = parts[0].trim();
                if (dept && (!isNaN(dept) || dept === '2A' || dept === '2B')) return dept;
            }
        }
        if (postcode && postcode.length >= 2) {
            return postcode.substring(0, 2);
        }
        return '';
    };
    const dept = getDeptNumber();

    const formatTime = (iso) => {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + ' le ' + d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    };

    // Format court pour les cartes d'extrêmes
    const formatTimeShort = (iso) => {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', fontFamily: 'system-ui, sans-serif' }}>

            <header style={{ marginBottom: '30px', textAlign: 'center' }}>
                <h1 style={{ fontSize: '1.8rem', color: '#0f172a', marginBottom: '8px' }}>Météo à ma proximité</h1>
                <p style={{ color: '#64748b' }}>Trouvez la station la plus proche de chez vous en un instant.</p>
            </header>

            {/* Barre de recherche */}
            <div style={{ position: 'relative', marginBottom: '40px' }}>
                <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '2px solid #e2e8f0', borderRadius: '12px', padding: '4px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', transition: 'border-color 0.2s' }}>
                    <Search size={20} color="#94a3b8" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => searchAddress(e.target.value)}
                        placeholder="Entrez votre ville ou code postal (ex: Douai, 75001)..."
                        style={{ width: '100%', padding: '12px', border: 'none', outline: 'none', fontSize: '1.1rem', background: 'transparent' }}
                    />
                    {loading && <div className="animate-spin" style={{ width: '20px', height: '20px', border: '2px solid #cbd5e1', borderTopColor: '#3b82f6', borderRadius: '50%' }} />}
                    <button onClick={handleGeolocation} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }} title="Me géolocaliser">
                        <Navigation size={20} color="#3b82f6" />
                    </button>
                </div>

                {/* Suggestions */}
                {suggestions.length > 0 && (
                    <div style={{ position: 'absolute', top: '110%', left: 0, right: 0, background: 'white', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 50, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                        {suggestions.map((s, i) => (
                            <div
                                key={i}
                                onClick={() => handleSelectCity(s)}
                                style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: i < suggestions.length - 1 ? '1px solid #f1f5f9' : 'none', display: 'flex', alignItems: 'center', gap: '10px', transition: 'background 0.1s' }}
                                onMouseEnter={(e) => e.target.style.background = '#f8fafc'}
                                onMouseLeave={(e) => e.target.style.background = 'white'}
                            >
                                <MapPin size={16} color="#64748b" />
                                <div>
                                    <div style={{ fontWeight: '600', color: '#1e293b' }}>{s.properties.label}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{s.properties.context}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Résultats */}
            {selectedCity && nearestData && (
                <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
                    <div style={{ marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <h2 style={{ fontSize: '2.2rem', fontWeight: '800', color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>
                            {selectedCity.properties.city || selectedCity.properties.label}
                        </h2>
                        {dept && (
                            <span style={{ fontSize: '1.4rem', fontWeight: '700', color: '#475569', background: '#f1f5f9', padding: '4px 12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                {dept}
                            </span>
                        )}
                    </div>

                    <div style={{ background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '12px', padding: '16px', marginBottom: '30px', fontSize: '0.95rem', color: '#1e40af', lineHeight: '1.6' }}>
                        <ul style={{ margin: 0, paddingLeft: '20px', listStyleType: 'disc' }}>
                            {bestTemp ? (
                                <li>La station mesurant la <strong>température</strong> la plus proche est <strong>{bestTemp.station}</strong>, située à {bestTemp.dist} km.</li>
                            ) : <li>Aucune station proche disponible pour la température.</li>}

                            {bestWind ? (
                                <li>La station mesurant le <strong>vent</strong> la plus proche est <strong>{bestWind.station}</strong>, située à {bestWind.dist} km.</li>
                            ) : <li>Aucune station proche disponible pour le vent.</li>}

                            {bestRain ? (
                                <li>La station mesurant la <strong>pluie</strong> la plus proche est <strong>{bestRain.station}</strong>, située à {bestRain.dist} km.</li>
                            ) : <li>Aucune station proche disponible pour la pluie.</li>}
                        </ul>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '40px' }}>
                        {bestTemp ? (
                            <SmartValue icon={Thermometer} label="Température Actuelle" value={bestTemp.val} unit="°C" station={bestTemp.station} distance={bestTemp.dist} color="#ea580c" time={formatTime(bestTemp.time)} />
                        ) : (
                            <div style={{ padding: '20px', background: '#f8fafc', borderRadius: '12px', flex: 1, color: '#64748b' }}>Aucune donnée de température disponible à proximité.</div>
                        )}

                        {bestWind && (
                            <SmartValue icon={Wind} label="Vent Moyen Actuel" value={bestWind.val} unit="km/h" station={bestWind.station} distance={bestWind.dist} color="#3b82f6" time={formatTime(bestWind.time)} />
                        )}

                        {bestGust ? (
                            <SmartValue icon={Wind} label="Rafale Max (24h)" value={bestGust.val} unit="km/h" station={bestGust.station} distance={bestGust.dist} color="#10b981" time={formatTime(bestGust.time)} />
                        ) : null}

                        {bestRain && (
                            <SmartValue icon={Droplets} label="Précipitations (1h)" value={bestRain.val} unit="mm" station={bestRain.station} distance={bestRain.dist} color="#0ea5e9" time={formatTime(bestRain.time)} />
                        )}
                    </div>

                    {/* SECTION CLIMATOLOGIE LOCALE (NOUVEAU) */}
                    {selectedCity.normals && (
                        <div style={{ marginBottom: '40px', background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}>
                                <Thermometer size={18} color="#0f172a" />
                                <h3 style={{ fontSize: '1.1rem', color: '#0f172a', margin: 0 }}>Climatologie Locale ({new Date().toLocaleDateString('fr-FR', { month: 'long' })})</h3>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px' }}>
                                <div style={{ background: 'white', padding: '12px', borderRadius: '10px', border: '1px dashed #cbd5e1' }}>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 800 }}>Normales de Temp.</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                                        <span style={{ color: '#ef4444' }}>{selectedCity.normals.tx[new Date().getMonth()].toFixed(1)}°</span> / <span style={{ color: '#3b82f6' }}>{selectedCity.normals.tn[new Date().getMonth()].toFixed(1)}°</span>
                                    </div>
                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Moyenne 1991-2020</div>
                                </div>
                                <div style={{ background: 'white', padding: '12px', borderRadius: '10px', border: '1px dashed #cbd5e1' }}>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 800 }}>Moyenne Pluie</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0ea5e9' }}>
                                        {selectedCity.normals.pr[new Date().getMonth()].toFixed(1)} mm
                                    </div>
                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Cumul mensuel moyen</div>
                                </div>
                                <div style={{ background: 'white', padding: '12px', borderRadius: '10px', border: '1px dashed #f59e0b', gridColumn: 'span 1' }}>
                                    <div style={{ fontSize: '0.75rem', color: '#b45309', textTransform: 'uppercase', fontWeight: 800 }}>Écart aujd.</div>
                                    {bestMax ? (
                                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: (bestMax.val - selectedCity.normals.tx[new Date().getMonth()]) > 0 ? '#ef4444' : '#3b82f6' }}>
                                            {(bestMax.val - selectedCity.normals.tx[new Date().getMonth()]) > 0 ? '+' : ''}
                                            {(bestMax.val - selectedCity.normals.tx[new Date().getMonth()]).toFixed(1)}°C
                                        </div>
                                    ) : <div style={{ fontSize: '1.1rem', color: '#cbd5e1' }}>--</div>}
                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>vs normale Max</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SECTION EXTRÊMES DU JOUR */}
                    <div style={{ marginBottom: '40px' }}>
                        <h3 style={{ fontSize: '1.1rem', color: '#334155', marginBottom: '15px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>Observations & Extrêmes (24h)</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                            {bestMin ? (
                                <div style={{ background: 'white', padding: '15px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '5px' }}>Température Min</div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#3b82f6' }}>{bestMin.val}°C</div>
                                        <div style={{ fontSize: '0.8rem', color: '#3b82f6', background: '#eff6ff', padding: '2px 6px', borderRadius: '4px' }}>à {formatTimeShort(bestMin.time)}</div>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '5px' }}>{bestMin.station}</div>
                                </div>
                            ) : null}
                            {bestMax ? (
                                <div style={{ background: 'white', padding: '15px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '5px' }}>Température Max</div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#ea580c' }}>{bestMax.val}°C</div>
                                        <div style={{ fontSize: '0.8rem', color: '#ea580c', background: '#fff7ed', padding: '2px 6px', borderRadius: '4px' }}>à {formatTimeShort(bestMax.time)}</div>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '5px' }}>{bestMax.station}</div>
                                </div>
                            ) : null}
                            {bestGust ? (
                                <div style={{ background: 'white', padding: '15px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '5px' }}>Rafale Max</div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#10b981' }}>{bestGust.val} km/h</div>
                                        <div style={{ fontSize: '0.8rem', color: '#10b981', background: '#ecfdf5', padding: '2px 6px', borderRadius: '4px' }}>à {formatTimeShort(bestGust.time)}</div>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '5px' }}>{bestGust.station}</div>
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <h3 style={{ fontSize: '1.2rem', color: '#0f172a', marginBottom: '15px' }}>Stations les plus proches</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {nearestData.map((s, i) => (
                            <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                                <div>
                                    <div style={{ fontWeight: '600', color: '#1e293b' }}>{s.name}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>à {s.dist_disp} km • ID: {s.id}</div>
                                </div>
                                <div style={{ display: 'flex', gap: '15px', fontSize: '0.9rem', fontWeight: '600' }}>
                                    {s.obs?.t !== undefined && <span style={{ color: '#ea580c' }}>{s.obs.t}°C</span>}
                                    {s.obs?.ff !== undefined && <span style={{ color: '#3b82f6' }}>{s.obs.ff} km/h</span>}
                                    {s.obs?.rr_per !== undefined && <span style={{ color: '#0ea5e9' }}>{s.obs.rr_per} mm</span>}
                                </div>
                            </div>
                        ))}
                    </div>

                </div>
            )}

            <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
};

export default CitySearch;
