import React, { useState, useEffect } from 'react';
import { Bell, Trash2, Plus, Search, MapPin, Wind, Thermometer, Droplets } from 'lucide-react';

import { supabase } from '../../services/supabaseClient';

const AlertsManager = () => {
    const [email, setEmail] = useState(localStorage.getItem('user_email') || '');
    const [myAlerts, setMyAlerts] = useState([]);
    const [loading, setLoading] = useState(false);

    // Formulaire d'ajout
    const [cityQuery, setCityQuery] = useState('');
    const [citySuggestions, setCitySuggestions] = useState([]);
    const [selectedStation, setSelectedStation] = useState(null); // { id, name, dist }
    const [paramType, setParamType] = useState('wind'); // wind, rain, temp_high, temp_low
    const [threshold, setThreshold] = useState(50);

    // Initialisation
    useEffect(() => {
        if (email) {
            fetchAlerts();
            localStorage.setItem('user_email', email);
        }
    }, [email]);

    const fetchAlerts = async () => {
        if (!email) return;
        setLoading(true);
        const { data } = await supabase.from('user_alerts').select('*').eq('email', email).order('created_at', { ascending: false });
        if (data) setMyAlerts(data);
        setLoading(false);
    };

    // Chercher une ville -> Trouver station la plus proche
    const searchCity = async (q) => {
        setCityQuery(q);
        if (q.length < 3) { setCitySuggestions([]); return; }
        try {
            const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${q}&limit=5`);
            const data = await res.json();
            setCitySuggestions(data.features || []);
        } catch (e) { console.error(e); }
    };

    const selectCity = async (feature) => {
        setCityQuery(feature.properties.label);
        setCitySuggestions([]);

        // Trouver la station la plus proche
        const [lon, lat] = feature.geometry.coordinates;
        const { data, error } = await supabase.rpc('find_nearest_stations', { lat_input: lat, lon_input: lon, limit_count: 1 });

        if (data && data.length > 0) {
            setSelectedStation(data[0]);
        } else {
            alert("Aucune station trouvée à proximité.");
        }
    };

    // Sauvegarder l'alerte
    const addAlert = async () => {
        if (!email || !selectedStation) return;

        const newAlert = {
            email,
            station_id: selectedStation.id,
            station_name: selectedStation.name,
            parameter: paramType,
            threshold: parseFloat(threshold)
        };

        const { error } = await supabase.from('user_alerts').insert([newAlert]);

        if (error) {
            alert("Erreur lors de l'ajout : " + error.message);
        } else {
            setCityQuery('');
            setSelectedStation(null);
            fetchAlerts();
        }
    };

    const deleteAlert = async (id) => {
        if (!confirm("Supprimer cette alerte ?")) return;
        // Use RPC to delete (Secure method avoiding RLS warnings)
        const { error } = await supabase.rpc('delete_user_alert', { target_id: id });
        if (error) {
            console.error(error);
            alert("Erreur lors de la suppression.");
        } else {
            fetchAlerts();
        }
    };

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px', fontFamily: 'system-ui' }}>
            <h1 style={{ fontSize: '1.8rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Bell color="#ea580c" /> Mes Alertes Météo
            </h1>

            {/* Config Email */}
            <div style={{ marginBottom: '30px', background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Votre Email pour recevoir les alertes :</label>
                <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="exemple@email.com"
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
            </div>

            {/* Ajouter une alerte */}
            <div style={{ marginBottom: '40px', background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                <h3 style={{ marginTop: 0, color: '#334155' }}>Nouvelle Alerte</h3>

                {/* 1. Lieu */}
                <div style={{ marginBottom: '15px', position: 'relative' }}>
                    <label style={{ fontSize: '0.9rem', color: '#64748b' }}>1. Lieu (Ville)</label>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '2px 10px' }}>
                        <Search size={16} color="#94a3b8" />
                        <input
                            type="text"
                            value={cityQuery}
                            onChange={e => searchCity(e.target.value)}
                            placeholder="Chercher une ville..."
                            style={{ border: 'none', padding: '8px', width: '100%', outline: 'none' }}
                        />
                    </div>
                    {/* Suggestions */}
                    {citySuggestions.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', zIndex: 10, maxHeight: '200px', overflowY: 'auto' }}>
                            {citySuggestions.map((s, i) => (
                                <div key={i} onClick={() => selectCity(s)} style={{ padding: '8px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
                                    {s.properties.label}
                                </div>
                            ))}
                        </div>
                    )}
                    {selectedStation && (
                        <div style={{ marginTop: '5px', fontSize: '0.85rem', color: '#0ea5e9', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <MapPin size={14} /> Station cible : <strong>{selectedStation.name}</strong> ({Math.round(selectedStation.dist_km * 10) / 10} km)
                        </div>
                    )}
                </div>

                {/* 2. Paramètre */}
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ fontSize: '0.9rem', color: '#64748b' }}>2. Condition</label>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                        <select
                            value={paramType}
                            onChange={e => setParamType(e.target.value)}
                            style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', flex: 1 }}
                        >
                            <option value="wind">Rafale de Vent &gt;</option>
                            <option value="rain">Pluie (1h) &gt;</option>
                            <option value="temp_high">Température &gt;</option>
                            <option value="temp_low">Température &lt;</option>
                        </select>
                        <input
                            type="number"
                            value={threshold}
                            onChange={e => setThreshold(e.target.value)}
                            style={{ width: '80px', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                        />
                        <span style={{ alignSelf: 'center' }}>
                            {paramType === 'wind' ? 'km/h' : (paramType === 'rain' ? 'mm' : '°C')}
                        </span>
                    </div>
                </div>

                <button
                    onClick={addAlert}
                    disabled={!selectedStation || !email}
                    style={{ background: (!selectedStation || !email) ? '#94a3b8' : '#0f172a', color: 'white', padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', width: '100%', fontWeight: '600' }}
                >
                    Activer l'alerte
                </button>
            </div>

            {/* Liste des alertes */}
            <div>
                <h3 style={{ color: '#334155' }}>Vos alertes actives ({myAlerts.length})</h3>
                {myAlerts.length === 0 && <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>Aucune alerte configurée.</p>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {myAlerts.map(alert => (
                        <div key={alert.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '15px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                {alert.parameter === 'wind' && <div style={{ background: '#eff6ff', padding: '8px', borderRadius: '50%' }}><Wind size={20} color="#3b82f6" /></div>}
                                {alert.parameter === 'rain' && <div style={{ background: '#f0f9ff', padding: '8px', borderRadius: '50%' }}><Droplets size={20} color="#0ea5e9" /></div>}
                                {(alert.parameter === 'temp_high' || alert.parameter === 'temp_low') && <div style={{ background: '#fff7ed', padding: '8px', borderRadius: '50%' }}><Thermometer size={20} color="#ea580c" /></div>}

                                <div>
                                    <div style={{ fontWeight: '600', color: '#1e293b' }}>
                                        {alert.parameter === 'wind' && `Vent > ${alert.threshold} km/h`}
                                        {alert.parameter === 'rain' && `Pluie > ${alert.threshold} mm`}
                                        {alert.parameter === 'temp_high' && `Temp > ${alert.threshold} °C`}
                                        {alert.parameter === 'temp_low' && `Temp < ${alert.threshold} °C`}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>à {alert.station_name}</div>
                                </div>
                            </div>
                            <button onClick={() => deleteAlert(alert.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }} title="Supprimer">
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default AlertsManager;
