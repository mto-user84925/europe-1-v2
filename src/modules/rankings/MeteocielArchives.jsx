import React, { useState, useEffect } from 'react';
import { Calendar, Search, Download, Wind, Droplets, Thermometer, Info, ChevronLeft, ChevronRight, FileSpreadsheet, Loader2 } from 'lucide-react';
import { fetchMeteocielArchives, fetchMultiDateArchives, METEOCIEL_MODES } from '../../services/meteocielService';
import './MeteocielArchives.css';

const MeteocielArchives = () => {
    const today = new Date().toISOString().split('T')[0];
    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);
    const [mode, setMode] = useState(METEOCIEL_MODES.TEMPERATURE_MAX.id);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingMulti, setLoadingMulti] = useState(false);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Charger les données au démarrage pour aujourd'hui
    useEffect(() => {
        handleFetch();
    }, []);

    const handleFetch = async () => {
        setLoading(true);
        setError(null);
        try {
            const results = await fetchMeteocielArchives(startDate, mode);
            setData(results.map(item => ({ ...item, date: startDate })));
        } catch (err) {
            setError("Impossible de récupérer les données depuis Meteociel.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleMultiFetch = async () => {
        if (startDate === endDate) {
            handleFetch();
            return;
        }

        setLoadingMulti(true);
        setError(null);
        try {
            const results = await fetchMultiDateArchives(startDate, endDate, mode);
            setData(results);
        } catch (err) {
            setError("Erreur lors de la récupération multi-dates.");
            console.error(err);
        } finally {
            setLoadingMulti(false);
        }
    };

    const changeDate = (days) => {
        const d = new Date(startDate);
        d.setDate(d.getDate() + days);
        const newDate = d.toISOString().split('T')[0];
        setStartDate(newDate);
        setEndDate(newDate);
    };

    // Export Excel compatible (identique à PowerQuery CombinedData)
    const exportToCSV = () => {
        if (!data.length) return;

        const currentMode = Object.values(METEOCIEL_MODES).find(m => m.id === mode);
        // On imite les colonnes utiles de PowerQuery
        const headers = ["Date", "Station", "Département", `Valeur (${currentMode.unit})`].join(";");
        const rows = data.map(item => `${item.date};${item.station};${item.dept};${item.value}`).join("\n");
        const csvContent = "\uFEFF" + headers + "\n" + rows;

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `meteociel_${currentMode.label.replace(/ /g, '_')}_${startDate}_${endDate}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getModeIcon = (mId) => {
        switch (mId) {
            case METEOCIEL_MODES.TEMPERATURE_MAX.id:
            case METEOCIEL_MODES.TEMPERATURE_MIN.id:
                return <Thermometer size={20} />;
            case METEOCIEL_MODES.WIND_GUSTS.id:
                return <Wind size={20} />;
            case METEOCIEL_MODES.RAINFALL.id:
                return <Droplets size={20} />;
            default:
                return <Info size={20} />;
        }
    };

    const currentMode = Object.values(METEOCIEL_MODES).find(m => m.id === mode);

    const filteredData = data.filter(item =>
        item.station.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.dept.includes(searchTerm)
    );

    const isMultiMode = startDate !== endDate;

    return (
        <div className="archives-page">
            <header className="archives-hero">
                <h1>Archives Meteociel</h1>
                <p>Consultation et extraction des classements nationaux (Moteur PowerQuery intégré)</p>
            </header>

            <div className="archives-controls">
                <div className="control-group" style={{ flex: 1.5 }}>
                    <label><Calendar size={18} /> Période d'archive :</label>
                    <div className="date-input-wrapper">
                        {!isMultiMode && (
                            <button className="date-nav-btn" onClick={() => changeDate(-1)} disabled={loadingMulti}>
                                <ChevronLeft size={20} />
                            </button>
                        )}
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => {
                                setStartDate(e.target.value);
                                if (!isMultiMode) setEndDate(e.target.value);
                            }}
                            className="archive-date-input"
                        />
                        <span style={{ display: 'flex', alignItems: 'center', padding: '0 5px' }}>au</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="archive-date-input"
                        />
                        {!isMultiMode && (
                            <button className="date-nav-btn" onClick={() => changeDate(1)} disabled={loadingMulti}>
                                <ChevronRight size={20} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="control-group">
                    <label>📊 Type de données :</label>
                    <select
                        value={mode}
                        onChange={(e) => setMode(e.target.value)}
                        className="archive-mode-select"
                        disabled={loadingMulti}
                    >
                        {Object.values(METEOCIEL_MODES).map(m => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                        ))}
                    </select>
                </div>

                <div className="control-actions">
                    <button
                        onClick={isMultiMode ? handleMultiFetch : handleFetch}
                        className="fetch-btn"
                        disabled={loading || loadingMulti}
                    >
                        {loading || loadingMulti ? (
                            <><Loader2 className="animate-spin" size={18} /> Récupération VPS...</>
                        ) : (
                            <><Search size={18} /> {isMultiMode ? 'Lancer Extraction' : 'Actualiser'}</>
                        )}
                    </button>
                    <button onClick={exportToCSV} className="export-btn" disabled={!data.length || loadingMulti}>
                        <FileSpreadsheet size={18} /> Export Excel
                    </button>
                </div>
            </div>

            <div className="archives-filters" style={{ maxWidth: '1200px', margin: '0 auto 20px', display: 'flex', gap: '15px' }}>
                <div className="search-box" style={{ flex: 1, position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                    <input
                        type="text"
                        placeholder="Filtrer par station ou département (ex: 59, Lille...)"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ width: '100%', padding: '10px 10px 10px 40px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }}
                    />
                </div>
            </div>

            {error && <div className="archive-error">{error}</div>}

            <section className="archive-results-section">
                <div className="ranking-table-container">
                    <div className="ranking-table-header" style={{ borderLeftColor: mode === '25' ? '#ef4444' : mode === '26' ? '#3b82f6' : mode === '27' ? '#f97316' : '#2563eb' }}>
                        {getModeIcon(mode)}
                        <h3>
                            {currentMode?.label} - {isMultiMode ? `Du ${new Date(startDate).toLocaleDateString()} au ${new Date(endDate).toLocaleDateString()}` : new Date(startDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </h3>
                        <span className="results-count">{filteredData.length} lignes</span>
                    </div>

                    <div className="ranking-table-wrapper">
                        <table className="ranking-table">
                            <thead>
                                <tr>
                                    <th className="rank-col">#</th>
                                    {isMultiMode && <th style={{ width: '100px' }}>Date</th>}
                                    <th className="station-col">Station</th>
                                    <th className="dept-col">Dép.</th>
                                    <th className="value-col">Valeur</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading || loadingMulti ? (
                                    <tr>
                                        <td colSpan={isMultiMode ? 5 : 4} className="loading-row">
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                                                <Loader2 className="animate-spin" size={32} />
                                                <span>{loadingMulti ? "Extraction multi-dates via VPS OVH en cours... (jusqu'à 1 min selon la période)" : "Récupération des données Météociel via VPS OVH (15.235.120.41)..."}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredData.length > 0 ? (
                                    filteredData.map((item, idx) => (
                                        <tr key={`${item.date}-${item.station}-${idx}`} className={!isMultiMode && idx < 3 ? 'top-rank' : ''}>
                                            <td className="rank-col">
                                                <span className="rank-number" style={{
                                                    background: !isMultiMode && idx === 0 ? (mode === '25' ? '#ef4444' : mode === '26' ? '#3b82f6' : '#475569') : !isMultiMode && idx < 3 ? '#475569' : 'transparent',
                                                    color: !isMultiMode && idx < 3 ? '#fff' : '#94a3b8'
                                                }}>
                                                    {idx + 1}
                                                </span>
                                            </td>
                                            {isMultiMode && <td style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{new Date(item.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</td>}
                                            <td className="station-col">{item.station}</td>
                                            <td className="dept-col">{item.dept}</td>
                                            <td className="value-col">
                                                <strong style={{ color: mode === '25' && item.value > 30 ? '#ef4444' : mode === '28' && item.value > 0 ? '#60a5fa' : 'inherit' }}>
                                                    {item.value} {currentMode?.unit}
                                                </strong>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan={isMultiMode ? 5 : 4} className="no-data">Aucune donnée trouvée</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default MeteocielArchives;
