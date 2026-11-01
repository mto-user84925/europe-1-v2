import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Table, ArrowUpDown, Loader, Settings, FileText, X, ChevronLeft, ChevronRight, Mountain, Wind, Droplets, Thermometer, Zap, RefreshCw, Waves, Snowflake } from 'lucide-react';
import stationNamesData from '../../data/stationNames.json';
import stationsMetadata from '../../data/stationsMetadata.json';
import { DEPARTMENTS, REGIONS } from '../../data/departments.js';
import './LiveObservations.css';

import { supabase } from '../../services/supabaseClient';

const LiveObservations = () => {
    const navigate = useNavigate();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortConfig, setSortConfig] = useState({ key: 'stationName', direction: 'asc' });
    const [filter, setFilter] = useState('');

    // Filters
    const [minAlt, setMinAlt] = useState('');
    const [maxAlt, setMaxAlt] = useState('');
    const [selectedRegion, setSelectedRegion] = useState('');
    const [selectedDept, setSelectedDept] = useState('');

    useEffect(() => {
        loadData();
        // Refresh every 2 minutes (Mode Turbo)
        const interval = setInterval(loadData, 2 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            console.log("📊 Chargement des données LIVE (Paginé)...");

            // 1. Fetch current vigilance status
            const { data: vigiStatus } = await supabase.from('vigilance_status').select('dep_code, level, risks').eq('period', 0);
            const vigiMap = {};
            if (vigiStatus) vigiStatus.forEach(v => vigiMap[v.dep_code] = {
                level: v.level,
                activeRisks: v.risks?.filter(r => r.level > 1) || []
            });

            let allLiveData = [];
            let from = 0;
            const batchSize = 1000;

            while (true) {
                const { data: liveData, error } = await supabase
                    .rpc('get_france_live')
                    .range(from, from + batchSize - 1);

                if (error) throw error;
                if (!liveData || liveData.length === 0) break;

                allLiveData.push(...liveData);

                if (liveData.length < batchSize) break; // Finished
                from += batchSize;

                // Safety break to avoid infinite loop
                if (from > 10000) break;
            }

            const enrichedData = (allLiveData || [])
                .filter(item => item.station_id < '96000000' && !item.station_id.startsWith('SIMULATION'))
                .map(item => {
                    // Handle Corsica 2A/2B and 2-digit depts correctly
                    let dept = item.station_id.substring(0, 2);
                    if (dept === "20") {
                        const id = item.station_id;
                        if (id.startsWith("200") || id.startsWith("201")) dept = "2A";
                        else dept = "2B";
                    }

                    const vInfo = vigiMap[dept] || { level: 1, activeRisks: [] };
                    return {
                        ...item,
                        stationName: stationNamesData[item.station_id] || item.station_id,
                        altitude: stationsMetadata[item.station_id] ?? null,
                        dept,
                        vigilance: vInfo.level,
                        activeRisks: vInfo.activeRisks
                    };
                });
            setData(enrichedData);
        } catch (e) {
            console.error("Erreur chargement LIVE:", e);
        }
        setLoading(false);
    };

    const handleSort = (key) => {
        let direction = 'desc';
        if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    const filteredAndSortedData = useMemo(() => {
        let result = [...data];

        // Search filter
        if (filter) {
            const search = filter.toLowerCase();
            result = result.filter(item =>
                item.stationName.toLowerCase().includes(search) ||
                item.station_id.includes(search)
            );
        }

        // Region filter
        if (selectedRegion) {
            const depts = REGIONS[selectedRegion];
            result = result.filter(item => depts.includes(item.dept));
        }

        // Dept filter
        if (selectedDept) {
            result = result.filter(item => item.dept === selectedDept);
        }

        // Altitude filter
        if (minAlt !== '') {
            result = result.filter(item => item.altitude !== null && item.altitude >= parseInt(minAlt));
        }
        if (maxAlt !== '') {
            result = result.filter(item => item.altitude !== null && item.altitude <= parseInt(maxAlt));
        }

        // Sorting
        result.sort((a, b) => {
            let aVal = a[sortConfig.key];
            let bVal = b[sortConfig.key];

            if (aVal === null || aVal === undefined) return 1;
            if (bVal === null || bVal === undefined) return -1;

            if (sortConfig.direction === 'asc') {
                return aVal > bVal ? 1 : -1;
            } else {
                return aVal < bVal ? 1 : -1;
            }
        });

        return result;
    }, [data, filter, selectedRegion, selectedDept, minAlt, maxAlt, sortConfig]);

    const formatTime = (ts) => {
        if (!ts) return '-';
        const d = new Date(ts);
        return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    };

    // Coloring Helpers
    const getTempClass = (val) => {
        if (val === null || val === undefined) return '';
        if (val < 0) return 'very-cold';
        if (val < 10) return 'cold';
        if (val < 18) return 'cool';
        if (val < 25) return 'mild';
        if (val < 32) return 'warm';
        return 'hot';
    };

    const getWindClass = (val) => {
        if (val === null || val === undefined) return '';
        if (val > 100) return 'storm';
        if (val > 70) return 'gale';
        if (val > 40) return 'strong';
        return '';
    };

    const getRainClass = (val) => {
        if (val === null || val === undefined || val === 0) return 'none';
        if (val > 5) return 'heavy';
        if (val > 2) return 'moderate';
        return 'light';
    };

    return (
        <div className="live-container">
            <header className="live-header">
                <div className="title-section">
                    <h1><Zap size={24} className="icon-pulse" /> Observations en Direct</h1>
                    <p className="subtitle">Dernières mesures transmises par le réseau (6mn)</p>
                </div>

                <div className="stats-quick">
                    <div className="stat-card">
                        <span className="label">Stations actives</span>
                        <span className="value">{data.length}</span>
                    </div>
                </div>
            </header>

            <div className="controls-grid">
                <div className="search-box">
                    <Table size={18} />
                    <input
                        type="text"
                        placeholder="Rechercher une station ou un ID..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                    {filter && <X size={18} className="clear-btn" onClick={() => setFilter('')} />}
                </div>

                <div className="filter-group">
                    <select value={selectedRegion} onChange={(e) => setSelectedRegion(e.target.value)}>
                        <option value="">Toutes les régions</option>
                        {Object.keys(REGIONS).sort().map(r => <option key={r} value={r}>{r}</option>)}
                    </select>

                    <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)}>
                        <option value="">Tous les départements</option>
                        {DEPARTMENTS.map(d => <option key={d.code} value={d.code}>{d.code} - {d.name}</option>)}
                    </select>
                </div>

                <div className="altitude-filters">
                    <div className="alt-input">
                        <Mountain size={14} />
                        <input type="number" placeholder="Alt min" value={minAlt} onChange={(e) => setMinAlt(e.target.value)} />
                    </div>
                    <div className="alt-input">
                        <Mountain size={14} />
                        <input type="number" placeholder="Alt max" value={maxAlt} onChange={(e) => setMaxAlt(e.target.value)} />
                    </div>
                </div>

                <button className="refresh-btn" onClick={loadData} disabled={loading}>
                    <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                    Actualiser
                </button>
            </div>

            <div className="table-wrapper">
                <table className="live-table">
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('stationName')}>
                                Station <ArrowUpDown size={14} />
                            </th>
                            <th onClick={() => handleSort('dept')}>Dépt</th>
                            <th onClick={() => handleSort('altitude')}>Alt.</th>
                            <th onClick={() => handleSort('obs_time')}>Heure</th>
                            <th onClick={() => handleSort('t')} className="sortable">
                                <Thermometer size={14} /> Temp.
                            </th>
                            <th onClick={() => handleSort('wind')} className="sortable">
                                <Wind size={14} /> Vent
                            </th>
                            <th onClick={() => handleSort('gust')} className="sortable">
                                <Zap size={14} /> Rafale
                            </th>
                            <th onClick={() => handleSort('rain')} className="sortable">
                                <Droplets size={14} /> Pluie 6'
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && data.length === 0 ? (
                            <tr>
                                <td colSpan="8" className="loading-row">
                                    <Loader className="animate-spin" /> Chargement des données nationales...
                                </td>
                            </tr>
                        ) : filteredAndSortedData.map(item => (
                            <tr
                                key={item.station_id}
                                className={`vigi-row-${item.vigilance}`}
                                style={{ cursor: 'pointer' }}
                                onClick={() => navigate(`/observations/station/${item.station_id}`)}
                            >
                                <td className="station-cell">
                                    <div className="name-vigi-wrap" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span className="station-name">{item.stationName}</span>
                                        <div className="vigi-active-icons" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            {item.activeRisks?.map(risk => {
                                                const mapping = {
                                                    "1": { i: Wind, l: "Vent" },
                                                    "2": { i: Droplets, l: "Pluie" },
                                                    "3": { i: Zap, l: "Orage" },
                                                    "4": { i: Waves, l: "Crue" },
                                                    "5": { i: Snowflake, l: "Neige" },
                                                    "6": { i: Thermometer, l: "Canicule" },
                                                    "7": { i: Thermometer, l: "Froid" },
                                                    "8": { i: Mountain, l: "Avalanche" },
                                                    "9": { i: Waves, l: "Vagues" }
                                                };
                                                const M = mapping[risk.id];
                                                if (!M) return null;
                                                const Icon = M.i;
                                                return (
                                                    <span key={risk.id} style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.7rem', color: '#475569', fontWeight: 700 }}>
                                                        <Icon size={12} />
                                                        ({M.l})
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <span className="station-id">{item.station_id}</span>
                                </td>
                                <td>{item.dept}</td>
                                <td className="alt-cell">{item.altitude !== null ? `${item.altitude}m` : '-'}</td>
                                <td className="time-cell">{formatTime(item.obs_time)}</td>
                                <td className={`temp-cell val-temp ${getTempClass(item.t)}`}>
                                    {item.t !== null ? `${item.t.toFixed(1)}°C` : '-'}
                                </td>
                                <td className={`wind-cell val-wind ${getWindClass(item.wind)}`}>
                                    {item.wind !== null ? `${Math.round(item.wind)}` : '-'}
                                    {item.wind !== null && <small className="unit"> km/h</small>}
                                </td>
                                <td className={`gust-cell bold val-wind ${getWindClass(item.gust)}`}>
                                    {item.gust !== null ? `${Math.round(item.gust)}` : '-'}
                                    {item.gust !== null && <small className="unit"> km/h</small>}
                                </td>
                                <td className={`rain-cell val-rain ${getRainClass(item.rain)}`}>
                                    {item.rain !== null ? `${item.rain.toFixed(1)}` : '0.0'}
                                    <small className="unit"> mm</small>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default LiveObservations;
