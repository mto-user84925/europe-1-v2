import React, { useEffect, useState } from 'react';
import { Check, Trash2, AlertTriangle, RefreshCw, Thermometer, Wind, CloudRain, MapPin } from 'lucide-react';
import stationNames from '../../data/stationNames.json';

import { supabase } from '../../services/supabaseClient';

// Helper to format date
const formatDate = (ts) => {
    return new Date(ts).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
};

const QualityControl = () => {
    const [suspiciousData, setSuspiciousData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);

    const loadSuspicious = async () => {
        setLoading(true);
        try {
            // Timeout sur 48h -> on passe à 12h pour la réactivité
            const { data, error } = await supabase.rpc('get_suspicious_observations', { lookback_hours: 12 });
            if (error) throw error;
            setSuspiciousData(data || []);
        } catch (err) {
            console.error("Error loading suspicious data:", err);
            alert("Erreur lors du chargement des données suspectes.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSuspicious();
    }, []);

    const handleAction = async (obs, action) => {
        setProcessingId(obs.id);
        try {
            // Determine param_to_clear if deleting
            let param = null;
            if (action === 'delete') {
                if (obs.threshold_msg.includes('Temp')) param = 'temp';
                else if (obs.threshold_msg.includes('Rafale') || obs.threshold_msg.includes('Vent')) param = 'wind';
                else if (obs.threshold_msg.includes('Pluie')) param = 'rain';
            }

            const { data, error } = await supabase.rpc('manage_observation', {
                target_id: obs.id,
                action_type: action, // 'validate' or 'delete'
                param_to_clear: param
            });

            if (error) throw error;

            // Remove from list immediately
            setSuspiciousData(prev => prev.filter(item => item.id !== obs.id));

        } catch (err) {
            console.error("Action error:", err);
            alert("Erreur lors de l'action: " + err.message);
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <AlertTriangle color="#f59e0b" /> Contrôle Qualité
                    </h1>
                    <p style={{ color: '#64748b', margin: '5px 0 0' }}>
                        Détection automatique des anomalies (24h-48h)
                    </p>
                </div>
                <button
                    onClick={loadSuspicious}
                    disabled={loading}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 16px', borderRadius: '8px',
                        border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer'
                    }}
                >
                    <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Actualiser
                </button>
            </div>

            {loading && suspiciousData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Chargement...</div>
            ) : suspiciousData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', background: '#f0fdf4', borderRadius: '12px', color: '#166534' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '10px' }}>✅</div>
                    <strong>Tout semble calme !</strong>
                    <p>Aucune anomalie détectée récemment.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {suspiciousData.map(obs => (
                        <div key={obs.id} style={{
                            background: 'white', borderRadius: '12px', padding: '16px',
                            border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                            display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap'
                        }}>
                            {/* Icon Type */}
                            <div style={{
                                width: '40px', height: '40px', borderRadius: '50%',
                                background: obs.threshold_msg.includes('Temp') ? '#fee2e2' : obs.threshold_msg.includes('Pluie') ? '#dbeafe' : '#fef3c7',
                                color: obs.threshold_msg.includes('Temp') ? '#ef4444' : obs.threshold_msg.includes('Pluie') ? '#3b82f6' : '#d97706',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                {obs.threshold_msg.includes('Temp') ? <Thermometer size={20} /> :
                                    obs.threshold_msg.includes('Pluie') ? <CloudRain size={20} /> : <Wind size={20} />}
                            </div>

                            {/* Info */}
                            <div style={{ flex: 1, minWidth: '200px' }}>
                                <div style={{ fontSize: '0.85rem', color: '#64748b', display: 'flex', gap: '8px' }}>
                                    <span>{formatDate(obs.obs_time)}</span>
                                    <span>•</span>
                                    <span>{obs.station_id}</span>
                                </div>
                                <div style={{ fontWeight: '600', fontSize: '1.1rem', color: '#1e293b' }}>
                                    {stationNames[obs.station_id] || `Station ${obs.station_id}`}
                                </div>
                                <div style={{ color: '#ef4444', fontWeight: '500', marginTop: '2px' }}>
                                    {obs.threshold_msg} : <strong>{obs.value}</strong>
                                </div>
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    onClick={() => handleAction(obs, 'delete')}
                                    disabled={processingId === obs.id}
                                    style={{
                                        padding: '8px 16px', borderRadius: '8px', border: 'none',
                                        background: '#fee2e2', color: '#dc2626', fontWeight: '600',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                        opacity: processingId === obs.id ? 0.5 : 1
                                    }}
                                >
                                    <Trash2 size={16} /> Supprimer
                                </button>
                                <button
                                    onClick={() => handleAction(obs, 'validate')}
                                    disabled={processingId === obs.id}
                                    style={{
                                        padding: '8px 16px', borderRadius: '8px', border: 'none',
                                        background: '#dcfce7', color: '#166534', fontWeight: '600',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                        opacity: processingId === obs.id ? 0.5 : 1
                                    }}
                                >
                                    <Check size={16} /> C'est Validé !
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default QualityControl;
