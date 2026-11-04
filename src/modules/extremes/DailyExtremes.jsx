import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Table, ArrowUpDown, Loader, Settings, FileText, X, ChevronLeft, ChevronRight, Mountain, Wind, Droplets, Thermometer, Calendar, Trophy } from 'lucide-react';
import stationNamesData from '../../data/stationNames.json';
import stationsMetadata from '../../data/stationsMetadata.json';
import { DEPARTMENTS, REGIONS } from '../../data/departments.js';
import './DailyExtremes.css';

import { supabase } from '../../services/supabaseClient';

const DailyExtremes = () => {
    const navigate = useNavigate();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [climatologyData, setClimatologyData] = useState({});
    const [loadingClim, setLoadingClim] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: 'stationName', direction: 'asc' });
    const [filter, setFilter] = useState('');
    const [selectedStations, setSelectedStations] = useState(new Set());

    const menuItemStyle = { textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#1e293b', width: '100%', transition: 'background 0.2s' };

    const [activeTab, setActiveTab] = useState('resume'); // resume, pluie, vent, temp, soleil, export, records
    const [minAlt, setMinAlt] = useState('');
    const [maxAlt, setMaxAlt] = useState('');
    const [selectedRegion, setSelectedRegion] = useState('');
    const [selectedDept, setSelectedDept] = useState('');
    const [selectedExportCols, setSelectedExportCols] = useState(['station_id', 'stationName', 'dept', 'altitude', 'temp_min', 'temp_max', 'rain_total', 'wind_gust_max']);

    const EXPORT_COLUMNS = [
        { id: 'station_id', label: 'ID Station' },
        { id: 'stationName', label: 'Nom Station' },
        { id: 'dept', label: 'Dpt' },
        { id: 'altitude', label: 'Alt.' },
        { id: 'temp_min', label: 'Tn' },
        { id: 'temp_min_time', label: 'Heure Tn' },
        { id: 'temp_max', label: 'Tx' },
        { id: 'temp_max_time', label: 'Heure Tx' },
        { id: 'rain_total', label: 'Pluie' },
        { id: 'rain_max_time', label: 'Heure Pluie' },
        { id: 'wind_gust_max', label: 'FXI 3s' },
        { id: 'wind_gust_fxi', label: 'FXI Brut' },
        { id: 'wind_gust_time', label: 'Heure Rafale' },
        { id: 'wind_mean_max', label: 'Vent Moy' },
        { id: 'sun_total', label: 'Soleil' },
        { id: 'vis_min', label: 'Vis. Min' }
    ];

    const getLocalToday = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const [selectedDate, setSelectedDate] = useState(getLocalToday());
    const [showExportSettings, setShowExportSettings] = useState(false);

    useEffect(() => {
        loadData();
    }, [selectedDate]);

    useEffect(() => {
        if (selectedRegion && selectedDept) {
            const regionDepts = REGIONS[selectedRegion];
            if (!regionDepts.includes(selectedDept)) {
                setSelectedDept('');
            }
        }
    }, [selectedRegion]);

    useEffect(() => {
        if (activeTab === 'records' && Object.keys(climatologyData).length === 0 && !loadingClim) {
            fetchClimatology();
        }
    }, [activeTab]);

    const fetchClimatology = async () => {
        setLoadingClim(true);
        try {
            console.log("Fetching Climatology Data...");
            // Fetch only necessary columns: station_id and data (JSON)
            // Note: This might be large, but it's loaded only on demand
            const { data: clim, error } = await supabase
                .from('station_climatology')
                .select('station_id, data');

            if (error) {
                console.error("Error fetching climatology:", error);
            } else if (clim) {
                const map = {};
                clim.forEach(row => {
                    map[row.station_id] = row.data; // Store JSON blob
                });
                setClimatologyData(map);
                console.log(`Climatology loaded for ${clim.length} stations.`);
            }
        } catch (err) {
            console.error("Clim fetch error:", err);
        }
        setLoadingClim(false);
    };

    const loadData = async () => {
        setLoading(true);
        try {
            console.log(`📊 Chargement optimisé pour ${selectedDate}...`);
            let allData = [];
            let from = 0;
            const batch = 1000;

            // 1. Tenter la méthode ULTRA-RAPIDE (Résumés pré-calculés)
            while (true) {
                const { data, error } = await supabase
                    .rpc('get_daily_extremes_fast', { target_date: selectedDate, dept_codes: [] })
                    .range(from, from + batch - 1);

                if (error) break; // If RPC fails, fallback to full scan
                if (!data || data.length === 0) break;

                // Mapper wind_mean_max vers wind_speed pour compatibilité
                allData.push(...data.map(d => ({ ...d, wind_speed: d.wind_mean_max })));

                if (data.length < batch) break;
                from += batch;
                if (from > 10000) break;
            }

            if (allData.length < 100) {
                // 2. Fallback Méthode LENTE (Scan complet paginé)
                console.log("⚠️ Fast path vide ou insuffisant, passage en mode scan complet...");
                allData = [];
                from = 0;
                while (true) {
                    const { data, error } = await supabase
                        .rpc('get_daily_extremes_full', { target_date: selectedDate })
                        .range(from, from + batch - 1);

                    if (error) throw error;
                    if (!data || data.length === 0) break;

                    allData.push(...data);
                    if (data.length < batch) break;
                    from += batch;
                    if (from > 10000) break;
                }
            } else {
                console.log(`🚀 Fast path: ${allData.length} stations chargées`);
            }

            const enrichedData = allData
                .filter(item => {
                    const sid = String(item.station_id);
                    const deptPrefix = sid.substring(0, 2);
                    const num = parseInt(deptPrefix);
                    // Métropole strictly 01-95 + logic exclusion
                    // On exclut explicitement 97 et 98 pour éviter les stations d'outre-mer
                    if (num >= 97 || num === 0) return false;
                    return num >= 1 && num <= 95 && sid.length === 8 && !sid.startsWith('SIMULATION');
                })
                .map(item => {
                    const sid = String(item.station_id);
                    return {
                        ...item,
                        sun_total: item.sun_total || 0,
                        snow_depth: item.snow_depth || 0,
                        hum_avg: item.hum_avg || null,
                        pres_avg: item.pres_min && item.pres_max ? (item.pres_min + item.pres_max) / 2 : null,
                        stationName: stationNamesData[sid] || sid,
                        altitude: stationsMetadata[sid] ?? item.altitude ?? null,
                        dept: sid.substring(0, 2)
                    };
                });
            setData(enrichedData);
        } catch (e) {
            console.error("Erreur chargement:", e);
        }
        setLoading(false);
    };

    const handleSort = (key) => {
        let direction = 'desc';
        if (key === 'stationName' || key === 'station_id') direction = 'asc';

        if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    const sortedData = useMemo(() => {
        return [...data].filter(item => {
            const sid = String(item.station_id);
            const num = parseInt(sid.substring(0, 2));
            if (num >= 97 || num === 0 || sid.length !== 8) return false;

            // Text Search
            if (filter) {
                const search = filter.toLowerCase();
                const matchesSearch = item.stationName.toLowerCase().includes(search) ||
                    item.station_id.includes(search) ||
                    item.dept.includes(search);
                if (!matchesSearch) return false;
            }

            // Region
            if (selectedRegion) {
                const regionDepts = REGIONS[selectedRegion];
                if (!regionDepts || !regionDepts.includes(item.dept)) return false;
            }

            // Dept
            if (selectedDept && item.dept !== selectedDept) return false;

            // Altitude
            if (minAlt && item.altitude < parseInt(minAlt)) return false;
            if (maxAlt && item.altitude > parseInt(maxAlt)) return false;

            return true;
        }).sort((a, b) => {
            if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
            if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [data, filter, selectedRegion, selectedDept, minAlt, maxAlt, sortConfig]);

    // Helpers
    const toggleSelection = (id) => {
        const newSelection = new Set(selectedStations);
        if (newSelection.has(id)) newSelection.delete(id);
        else newSelection.add(id);
        setSelectedStations(newSelection);
    };

    const toggleAll = () => {
        const visibleIds = sortedData.map(d => d.station_id);
        const allVisibleSelected = visibleIds.every(id => selectedStations.has(id));
        const newSelection = new Set(selectedStations);

        if (allVisibleSelected) visibleIds.forEach(id => newSelection.delete(id));
        else visibleIds.forEach(id => newSelection.add(id));
        setSelectedStations(newSelection);
    };

    const SortIcon = ({ colKey }) => (
        <span className="sort-icon">
            {sortConfig.key === colKey ? (sortConfig.direction === 'asc' ? '▲' : '▼') : <ArrowUpDown size={12} />}
        </span>
    );

    const availableDepartments = useMemo(() => {
        if (!selectedRegion) return DEPARTMENTS;
        const regionDeptCodes = REGIONS[selectedRegion];
        return DEPARTMENTS.filter(d => regionDeptCodes.includes(d.code));
    }, [selectedRegion]);

    // Coloring Helpers
    const getTnClass = (val) => {
        if (val === null || val === undefined) return '';
        if (val < 0) return 'very-cold';
        if (val < 7) return 'cold';
        if (val < 15) return 'cool';
        return 'mild';
    };

    const getTxClass = (val) => {
        if (val === null || val === undefined) return '';
        if (val < 15) return 'mild';
        if (val < 25) return 'warm';
        if (val < 32) return 'hot';
        return 'very-hot';
    };

    const getRainClass = (val) => {
        if (val === null || val === undefined || val === 0) return 'none';
        if (val > 10) return 'heavy';
        return '';
    };

    const getWindClass = (val) => {
        if (val === null || val === undefined) return '';
        if (val > 100) return 'storm';
        if (val > 70) return 'gale';
        if (val > 40) return 'strong';
        return '';
    };

    const getVisClass = (val) => {
        if (val === null || val === undefined) return '';
        if (val < 100) return 'danger-vis';
        if (val < 1000) return 'poor-vis';
        if (val < 5000) return 'mod-vis';
        return 'good-vis';
    };

    const Missing = () => <span className="missing-line" title="Donnée manquante"></span>;

    const renderCell = (val, fixed = 1, unit = '', className = '') => {
        if (val === null || val === undefined || isNaN(val)) return <Missing />;
        return <span className={className}>{val.toFixed(fixed)}<small className="unit">{unit}</small></span>;
    };

    // --- EXPORT FUNCTIONS ---
    const exportData = (format) => {
        if (!sortedData || sortedData.length === 0) return;

        let content = '';
        let mimeType = 'text/plain';
        let extension = 'txt';
        const dateStr = selectedDate.replace(/-/g, '');

        if (format === 'csv') {
            const entetes = EXPORT_COLUMNS.filter(c => selectedExportCols.includes(c.id)).map(c => c.label);
            content = entetes.join(';') + '\n';
            sortedData.forEach(row => {
                const line = EXPORT_COLUMNS
                    .filter(c => selectedExportCols.includes(c.id))
                    .map(c => {
                        const val = row[c.id];
                        if (val === null || val === undefined) return '';
                        if (c.id === 'stationName') return `"${val}"`;
                        if ((c.id === 'wind_gust_time' || c.id === 'temp_min_time' || c.id === 'temp_max_time' || c.id === 'rain_max_time') && val) {
                            return new Date(val).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                        }
                        return typeof val === 'number' ? val.toFixed(1) : val;
                    }).join(';');
                content += line + '\n';
            });
            mimeType = 'text/csv;charset=utf-8;';
            extension = 'csv';
        }
        else if (format === 'vent') {
            // Bloc 1: Vent (FXI en m/s)
            content = "POSTE;DATE;FXI;HXI\n";
            sortedData.forEach(row => {
                // FXI : On convertit km/h (DB) -> m/s pour l'export .data
                const fxi = (row.wind_gust_max !== null && row.wind_gust_max !== undefined && !isNaN(row.wind_gust_max)) ? (row.wind_gust_max / 3.6).toFixed(1) : '';
                let hxi = '';
                if (row.wind_gust_time) {
                    const d = new Date(row.wind_gust_time);
                    hxi = String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
                }
                if (fxi !== '') content += `${row.station_id};${dateStr};${fxi};${hxi}\n`;
            });
            extension = 'data';
        }
        else if (format === 'rr_tn') {
            // Bloc 2: Pluie / TN
            content = "POSTE;DATE;RR;TN\n";
            sortedData.forEach(row => {
                const rr = (row.rain_total !== null && row.rain_total !== undefined && !isNaN(row.rain_total)) ? row.rain_total.toFixed(1) : '';
                const tn = (row.temp_min !== null && row.temp_min !== undefined && !isNaN(row.temp_min)) ? row.temp_min.toFixed(1) : '';
                if (rr !== '' || tn !== '') content += `${row.station_id};${dateStr};${rr};${tn}\n`;
            });
            extension = 'data';
        }
        else if (format === 'tx') {
            // Bloc 3: TX
            content = "POSTE;DATE;TX\n";
            sortedData.forEach(row => {
                const tx = (row.temp_max !== null && row.temp_max !== undefined && !isNaN(row.temp_max)) ? row.temp_max.toFixed(1) : '';
                if (tx !== '') content += `${row.station_id};${dateStr};${tx}\n`;
            });
            extension = 'data';
        }

        const blob = new Blob([content], { type: mimeType });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `climato_${format}_${dateStr}.${extension}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setShowExportSettings(false);
    };

    // Columns config
    return (
        <div className="extremes-page">
            <header className="extremes-header">
                <div className="header-title">
                    <Table size={32} />
                    <div>
                        <h1>Extrêmes Climato</h1>
                        <p>Données quotidiennes (0h - 23h UTC)</p>
                    </div>
                </div>

                <div className="tabs-container">
                    <button className={`tab-btn ${activeTab === 'resume' ? 'active' : ''}`} onClick={() => setActiveTab('resume')}>
                        <Table size={16} /> Résumé
                    </button>
                    <button className={`tab-btn ${activeTab === 'vent' ? 'active' : ''}`} onClick={() => setActiveTab('vent')}>
                        <Wind size={16} /> Vent
                    </button>
                    <button className={`tab-btn ${activeTab === 'temp' ? 'active' : ''}`} onClick={() => setActiveTab('temp')}>
                        <Thermometer size={16} /> Température
                    </button>
                    <button className={`tab-btn ${activeTab === 'records' ? 'active' : ''}`} onClick={() => setActiveTab('records')}>
                        <Trophy size={16} /> Records
                    </button>
                    <button className={`tab-btn ${activeTab === 'export' ? 'active' : ''}`} onClick={() => setActiveTab('export')}>
                        <Download size={16} /> Export & Flux
                    </button>
                </div>

                <div className="header-actions">
                    {/* ALTITUDE FILTER */}
                    <div className="alt-filter">
                        <Mountain size={16} color="#1e40af" />
                        <input
                            type="number"
                            placeholder="Min m"
                            className="alt-input"
                            value={minAlt}
                            onChange={(e) => setMinAlt(e.target.value)}
                        />
                        <span style={{ color: '#94a3b8' }}>-</span>
                        <input
                            type="number"
                            placeholder="Max m"
                            className="alt-input"
                            value={maxAlt}
                            onChange={(e) => setMaxAlt(e.target.value)}
                        />
                    </div>

                    {/* DATE SELECTOR */}
                    <div className="date-nav-group-pro">
                        <button className="date-arrow-btn" onClick={() => {
                            const d = new Date(selectedDate);
                            d.setDate(d.getDate() - 1);
                            setSelectedDate(d.toISOString().split('T')[0]);
                        }}><ChevronLeft size={18} /></button>

                        <div className="date-display-box">
                            <Calendar size={16} className="cal-icon" />
                            <span className="current-date-text">
                                {new Date(selectedDate).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            </span>
                            <input
                                type="date"
                                value={selectedDate}
                                max={getLocalToday()}
                                onChange={e => setSelectedDate(e.target.value)}
                                className="hidden-date-picker"
                            />
                        </div>

                        <button className="date-arrow-btn" onClick={() => {
                            const d = new Date(selectedDate);
                            d.setDate(d.getDate() + 1);
                            const today = getLocalToday();
                            if (d.toISOString().split('T')[0] <= today) {
                                setSelectedDate(d.toISOString().split('T')[0]);
                            }
                        }}><ChevronRight size={18} /></button>
                    </div>

                    {/* REGION FILTER */}
                    <div className="filter-select-wrapper">
                        <select
                            value={selectedRegion}
                            onChange={(e) => setSelectedRegion(e.target.value)}
                            className="filter-select"
                        >
                            <option value="">Toutes les régions</option>
                            {Object.keys(REGIONS).sort().map(region => (
                                <option key={region} value={region}>{region}</option>
                            ))}
                        </select>
                    </div>

                    {/* SEARCH */}
                    <div className="search-wrapper">
                        <input
                            type="text"
                            placeholder="Ville, code..."
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                            className="search-input"
                        />
                        {filter && (
                            <button className="clear-search" onClick={() => setFilter('')}>
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* EXPORT BUTTON */}
                    <div className="export-wrapper" style={{ position: 'relative' }}>
                        <button
                            className="icon-btn"
                            onClick={() => setShowExportSettings(!showExportSettings)}
                            title="Télécharger les données"
                            style={{ backgroundColor: showExportSettings ? '#e2e8f0' : 'transparent' }}
                        >
                            <Download size={20} />
                        </button>
                        {showExportSettings && (
                            <div className="export-menu" style={{
                                position: 'absolute', top: '100%', right: 0, zIndex: 100,
                                background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px',
                                padding: '0.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                                display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '160px'
                            }}>
                                <button onClick={() => exportData('csv')} style={menuItemStyle}>
                                    <FileText size={14} /> CSV Complet
                                </button>
                                <div style={{ height: '1px', background: '#e2e8f0', margin: '2px 0' }}></div>
                                <button onClick={() => exportData('vent')} style={menuItemStyle}>
                                    <Wind size={14} /> Vent (.data)
                                </button>
                                <button onClick={() => exportData('rr_tn')} style={menuItemStyle}>
                                    <Droplets size={14} /> Pluie/Tn (.data)
                                </button>
                                <button onClick={() => exportData('tx')} style={menuItemStyle}>
                                    <Thermometer size={14} /> Tx (.data)
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {loading ? (
                <div className="loading-state">
                    <Loader className="spin" size={32} />
                    <p style={{ marginTop: '1rem' }}>Chargement des données complètes...</p>
                </div>
            ) : (
                <div className="table-container">
                    {activeTab !== 'export' ? (
                        <table className="extremes-table">
                            <thead>
                                <tr>
                                    <th onClick={() => handleSort('station_id')}>ID <SortIcon colKey="station_id" /></th>
                                    <th onClick={() => handleSort('stationName')}>Ville <SortIcon colKey="stationName" /></th>
                                    <th onClick={() => handleSort('altitude')}>Alt. <SortIcon colKey="altitude" /></th>

                                    {activeTab === 'resume' && (
                                        <>
                                            <th onClick={() => handleSort('temp_min')} className="right">Tn <SortIcon colKey="temp_min" /></th>
                                            <th onClick={() => handleSort(sortConfig.key === 'temp_max' ? 'vis_min' : 'temp_max')} className="right">Tx <SortIcon colKey="temp_max" /></th>
                                            <th onClick={() => handleSort('rain_total')} className="right">Pluie 24h <SortIcon colKey="rain_total" /></th>
                                            <th onClick={() => handleSort('wind_gust_max')} className="right">Rafale (H) <SortIcon colKey="wind_gust_max" /></th>
                                            <th onClick={() => handleSort('sun_total')} className="right">Soleil <SortIcon colKey="sun_total" /></th>
                                            <th onClick={() => handleSort('pres_avg')} className="right">Pres. Moy <SortIcon colKey="pres_avg" /></th>
                                            <th onClick={() => handleSort('vis_min')} className="right">Vis Mini <SortIcon colKey="vis_min" /></th>
                                        </>
                                    )}


                                    {activeTab === 'vent' && (
                                        <>
                                            <th onClick={() => handleSort('wind_mean_max')} className="right">Vent Moy Max <SortIcon colKey="wind_mean_max" /></th>
                                            <th onClick={() => handleSort('wind_gust_max')} className="right">FXI 3s Max <SortIcon colKey="wind_gust_max" /></th>
                                            <th onClick={() => handleSort('wind_gust_fxi')} className="right">FXI Max <SortIcon colKey="wind_gust_fxi" /></th>
                                            <th className="center">Heure Rafale</th>
                                        </>
                                    )}

                                    {activeTab === 'temp' && (
                                        <>
                                            <th onClick={() => handleSort('temp_min')} className="right">Min (Tn) <SortIcon colKey="temp_min" /></th>
                                            <th onClick={() => handleSort('temp_max')} className="right">Max (Tx) <SortIcon colKey="temp_max" /></th>
                                        </>
                                    )}

                                    {activeTab === 'records' && (
                                        <>
                                            <th onClick={() => handleSort('temp_min')} className="right">Min / Rec <SortIcon colKey="temp_min" /></th>
                                            <th onClick={() => handleSort('temp_max')} className="right">Max / Rec <SortIcon colKey="temp_max" /></th>
                                            <th onClick={() => handleSort('wind_gust_max')} className="right">Vent / Rec <SortIcon colKey="wind_gust_max" /></th>
                                            <th onClick={() => handleSort('rain_total')} className="right">Pluie / Rec <SortIcon colKey="rain_total" /></th>
                                        </>
                                    )}


                                </tr>
                            </thead>
                            <tbody>
                                {sortedData.length > 0 ? sortedData.map(row => {
                                    const sid = String(row.station_id);
                                    if (sid.startsWith('97') || sid.startsWith('98')) return null;

                                    if (activeTab === 'records') {
                                        const monthIdx = new Date(selectedDate).getMonth();
                                        const clim = climatologyData[row.station_id];
                                        if (!clim) return null; // Wait for data or skip

                                        const recTn = clim?.records?.minT?.vals?.[monthIdx];
                                        const recTx = clim?.records?.maxT?.vals?.[monthIdx];
                                        const recWind = clim?.records?.maxWind?.vals?.[monthIdx];
                                        const recRain = clim?.records?.maxRain?.vals?.[monthIdx];

                                        const isBrokenTn = recTn !== undefined && row.temp_min !== null && row.temp_min <= recTn;
                                        const isBrokenTx = recTx !== undefined && row.temp_max !== null && row.temp_max >= recTx;
                                        const isBrokenWind = recWind !== undefined && row.wind_gust_max !== null && row.wind_gust_max >= recWind;
                                        const isBrokenRain = recRain !== undefined && row.rain_total !== null && row.rain_total >= recRain && row.rain_total > 0;

                                        if (!isBrokenTn && !isBrokenTx && !isBrokenWind && !isBrokenRain) return null;
                                    }

                                    return (
                                        <tr key={row.station_id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/observations/station/${row.station_id}`)}>
                                            <td className="station-id-cell">{row.station_id}</td>
                                            <td className="station-name-cell">
                                                {row.stationName.replace(/\s\(\d+\)$/, '')}
                                            </td>
                                            <td>{row.altitude ? <>{row.altitude}<small>m</small></> : <Missing />}</td>

                                            {activeTab === 'resume' && (
                                                <>
                                                    <td className="right">
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                            {renderCell(row.temp_min, 1, '°', `val-tn ${getTnClass(row.temp_min)}`)}
                                                            {row.temp_min_time && (
                                                                <span className="time-sub" style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                                                                    à {new Date(row.temp_min_time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="right">
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                            {renderCell(row.temp_max, 1, '°', `val-tx ${getTxClass(row.temp_max)}`)}
                                                            {row.temp_max_time && (
                                                                <span className="time-sub" style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                                                                    à {new Date(row.temp_max_time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="right">
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                            {renderCell(row.rain_total, 1, 'mm', `val-rain ${getRainClass(row.rain_total)}`)}
                                                            {row.rain_max_time && row.rain_total > 0 && (
                                                                <span className="time-sub" style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                                                                    à {new Date(row.rain_max_time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="right">
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                                            {renderCell(row.wind_gust_max, 0, ' km/h', `val-wind ${getWindClass(row.wind_gust_max)}`)}
                                                            {row.wind_gust_time && (
                                                                <span className="time-sub" style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                                                                    à {new Date(row.wind_gust_time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="right">{renderCell(row.sun_total ? row.sun_total / 60 : null, 1, 'h', 'val-sun')}</td>
                                                    <td className="right">{renderCell(row.pres_avg, 1, 'hPa', 'val-pres')}</td>
                                                    <td className="right">{renderCell(row.vis_min ? row.vis_min / 1000 : null, 1, 'km', `val-vis ${getVisClass(row.vis_min)}`)}</td>
                                                </>
                                            )}


                                            {activeTab === 'vent' && (
                                                <>
                                                    <td className="right">{renderCell(row.wind_mean_max, 0, ' km/h', `val-wind ${getWindClass(row.wind_mean_max)}`)}</td>
                                                    <td className="right">{renderCell(row.wind_gust_max, 0, ' km/h', `val-wind ${getWindClass(row.wind_gust_max)}`)}</td>
                                                    <td className="right">{renderCell(row.wind_gust_fxi || row.wind_gust_max, 0, ' km/h', `val-wind ${getWindClass(row.wind_gust_fxi || row.wind_gust_max)}`)}</td>
                                                    <td className="center time-cell">
                                                        {row.wind_gust_time ? new Date(row.wind_gust_time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : <Missing />}
                                                    </td>
                                                </>
                                            )}

                                            {activeTab === 'temp' && (
                                                <>
                                                    <td className="right">
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                                                            {renderCell(row.temp_min, 1, '°C', `val-tn ${getTnClass(row.temp_min)}`)}
                                                            {row.temp_min_time && (
                                                                <span className="time-sub" style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                                                                    à {new Date(row.temp_min_time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="right">
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                                                            {renderCell(row.temp_max, 1, '°C', `val-tx ${getTxClass(row.temp_max)}`)}
                                                            {row.temp_max_time && (
                                                                <span className="time-sub" style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                                                                    à {new Date(row.temp_max_time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                </>
                                            )}

                                            {activeTab === 'records' && (() => {
                                                const monthIdx = new Date(selectedDate).getMonth();
                                                const clim = climatologyData[row.station_id];
                                                const recTn = clim?.records?.minT?.vals?.[monthIdx];
                                                const recTx = clim?.records?.maxT?.vals?.[monthIdx];
                                                const recWind = clim?.records?.maxWind?.vals?.[monthIdx];
                                                const recRain = clim?.records?.maxRain?.vals?.[monthIdx];

                                                const isBrokenTn = recTn !== undefined && row.temp_min !== null && row.temp_min <= recTn;
                                                const isBrokenTx = recTx !== undefined && row.temp_max !== null && row.temp_max >= recTx;
                                                const isBrokenWind = recWind !== undefined && row.wind_gust_max !== null && row.wind_gust_max >= recWind;
                                                const isBrokenRain = recRain !== undefined && row.rain_total !== null && row.rain_total >= recRain && row.rain_total > 0;

                                                return (
                                                    <>
                                                        <td className="right">
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                                <span className={isBrokenTn ? 'broken-val' : getTnClass(row.temp_min)} style={isBrokenTn ? { fontWeight: 'bold', color: '#000' } : {}}>{row.temp_min !== null ? row.temp_min.toFixed(1) + '°' : '-'}</span>
                                                                {recTn !== undefined && <small style={{ color: '#64748b', fontSize: '10px' }}>Rec: {recTn.toFixed(1)}</small>}
                                                            </div>
                                                        </td>
                                                        <td className="right">
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                                <span className={isBrokenTx ? 'broken-val' : getTxClass(row.temp_max)} style={isBrokenTx ? { fontWeight: 'bold', color: '#000' } : {}}>{row.temp_max !== null ? row.temp_max.toFixed(1) + '°' : '-'}</span>
                                                                {recTx !== undefined && <small style={{ color: '#64748b', fontSize: '10px' }}>Rec: {recTx.toFixed(1)}</small>}
                                                            </div>
                                                        </td>
                                                        <td className="right">
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                                <span className={isBrokenWind ? 'broken-val' : getWindClass(row.wind_gust_max)} style={isBrokenWind ? { fontWeight: 'bold', color: '#000' } : {}}>{row.wind_gust_max !== null ? Math.round(row.wind_gust_max) + ' km/h' : '-'}</span>
                                                                {recWind !== undefined && <small style={{ color: '#64748b', fontSize: '10px' }}>Rec: {Math.round(recWind)}</small>}
                                                            </div>
                                                        </td>
                                                        <td className="right">
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                                <span className={isBrokenRain ? 'broken-val' : getRainClass(row.rain_total)} style={isBrokenRain ? { fontWeight: 'bold', color: '#000' } : {}}>{row.rain_total !== null ? row.rain_total.toFixed(1) + 'mm' : '-'}</span>
                                                                {recRain !== undefined && <small style={{ color: '#64748b', fontSize: '10px' }}>Rec: {recRain.toFixed(1)}</small>}
                                                            </div>
                                                        </td>
                                                    </>
                                                );
                                            })()}
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan="10" className="center" style={{ padding: '2rem' }}>
                                            Aucune donnée trouvée pour cette sélection.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    ) : (
                        <div className="export-tab-content" style={{ padding: '2.5rem' }}>
                            <div className="export-grid">
                                <div className="export-card">
                                    <div className="card-header-pro">
                                        <FileText size={20} />
                                        <h3>Export CSV Personnalisé</h3>
                                    </div>
                                    <p className="card-desc">Sélectionnez les colonnes à inclure dans votre fichier CSV.</p>

                                    <div className="column-selector-grid">
                                        {EXPORT_COLUMNS.map(col => (
                                            <label key={col.id} className="col-checkbox">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedExportCols.includes(col.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedExportCols([...selectedExportCols, col.id]);
                                                        else setSelectedExportCols(selectedExportCols.filter(c => c !== col.id));
                                                    }}
                                                />
                                                <span>{col.label}</span>
                                            </label>
                                        ))}
                                    </div>

                                    <button className="btn-primary-large" onClick={() => exportData('csv')} style={{ marginTop: '1.5rem', width: '100%' }}>
                                        <Download size={18} /> Télécharger CSV ({selectedExportCols.length} colonnes)
                                    </button>
                                </div>

                                <div className="export-card data-formats">
                                    <div className="card-header-pro">
                                        <Settings size={20} />
                                        <h3>Flux de données (.data)</h3>
                                    </div>
                                    <p className="card-desc">Formats spécialisés pour l'intégration logicielle.</p>

                                    <div className="data-buttons-list">
                                        <div className="data-item-action" onClick={() => exportData('vent')}>
                                            <div className="icon-box"><Wind size={18} /></div>
                                            <div className="item-info">
                                                <strong>Bloc Vent (FXI/HXI)</strong>
                                                <span>Rafales max et heures (m/s)</span>
                                            </div>
                                            <div className="ext-label">.data</div>
                                        </div>

                                        <div className="data-item-action" onClick={() => exportData('rr_tn')}>
                                            <div className="icon-box"><Droplets size={18} /></div>
                                            <div className="item-info">
                                                <strong>Bloc Pluie / TN</strong>
                                                <span>Cumuls RR et Temp. Min</span>
                                            </div>
                                            <div className="ext-label">.data</div>
                                        </div>

                                        <div className="data-item-action" onClick={() => exportData('tx')}>
                                            <div className="icon-box"><Thermometer size={18} /></div>
                                            <div className="item-info">
                                                <strong>Bloc Temp. Max (TX)</strong>
                                                <span>Températures maximales</span>
                                            </div>
                                            <div className="ext-label">.data</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DailyExtremes;
