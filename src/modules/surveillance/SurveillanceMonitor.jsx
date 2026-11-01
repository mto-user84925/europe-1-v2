import React, { useEffect, useState } from 'react';
import { useLocation } from '../../contexts/LocationContext';
import { weatherAPI } from '../../services/api';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import './Surveillance.css';

const THRESHOLDS = {
    neige: { param: 'snowfall', label: 'Neige', unit: 'cm', levels: [3, 10, 15] }, // 3-10 (J), 10-15 (O), >15 (R)
    gel: { param: 'temperature_2m', label: 'Gel', unit: '°C', levels: [0, -10, -20], extreme: -30, operator: '<=' }, // <=0 (J), <=-10 (O), <=-20 (R)
    pluies: { param: 'precipitation', label: 'Pluie', unit: 'mm', levels: [10, 20, 30] }, // 10-20 (J), 20-30 (O), >30 (R)
    orages: { param: 'weather_code', label: 'Orages', unit: '', levels: [90, 95, 96], operator: '>=' }, // Mapped approx to codes: 90-95 (Possible?), >95 (Probable?), >96 (Violent?) - Need correct mapping
    // Weather code mapping for Orages is tricky directly from code. Let's use:
    // Jaune: Code >= 50 (Showers/Rain with risk?) or strictly TS codes?
    // Let's stick to standard TS codes: 95 (Thunderstorm), 96/99 (Thunderstorm with Hail)
    // Actually user says: Jaune=Possible, Orange=Probable, Rouge=Violent. 
    // Open-Meteo codes: 95 (Small), 96 (Slight Hail), 99 (Heavy Hail).
    // Let's map: Jaune (95), Orange (96), Rouge (99).
    canicule: { param: 'temperature_2m', label: 'Canicule', unit: '°C', levels: [28, 30, 36] }, // >=28 (J), >=30 (O), >=36 (R)
    arrosage: { label: 'Arrosage', unit: 'mm/m²' }
};

export default function SurveillanceMonitor({ type }) {
    const { location } = useLocation();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const config = THRESHOLDS[type];

    useEffect(() => {
        async function load() {
            setLoading(true);
            try {
                // Get 10 days of hourly data to compute daily aggregates
                const res = await weatherAPI.getHourlyForecast(location.lat, location.lon, 10);

                // For Arrosage, we also need Daily ETP (evapotranspiration)
                // getDailyForecast returns ~15 days
                let dailyEtp = [];
                if (type === 'arrosage') {
                    dailyEtp = await weatherAPI.getDailyForecast(location.lat, location.lon);
                }

                // Process hourly data into Daily Aggregates
                const processed = processDailyData(res, type, dailyEtp);
                setData(processed);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [location, type]);

    if (loading) return <div className="card p-4">Chargement surveillance pour {location.name}...</div>;

    // Helper to get color class for a value
    const getStatusClass = (val) => {
        if (!config.levels) return '';

        let status = 'normal';
        const isLower = config.operator === '<=';

        if (isLower) {
            if (config.extreme && val <= config.extreme) status = 'extreme-purple'; // Special purple for Gel
            else if (val <= config.levels[2]) status = 'extreme';
            else if (val <= config.levels[1]) status = 'high';
            else if (val <= config.levels[0]) status = 'moderate';
        } else {
            if (val >= config.levels[2]) status = 'extreme';
            else if (val >= config.levels[1]) status = 'high';
            else if (val >= config.levels[0]) status = 'moderate';
        }
        return status;
    };

    // Helper to process hourly -> daily
    const processDailyData = (hourly, type, dailyEtp = []) => {
        if (!hourly || hourly.length === 0) return [];

        const days = {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        hourly.forEach(h => {
            const d = new Date(h.time);
            const dateKey = d.toISOString().split('T')[0];

            // Filter past days
            if (d < today) return;

            if (!days[dateKey]) {
                days[dateKey] = {
                    date: d,
                    temps: [],
                    rains: [],
                    snows: [],
                    codes: []
                };
            }
            days[dateKey].temps.push(h.temp);
            days[dateKey].rains.push(h.rain);
            days[dateKey].snows.push(h.snowfall);
            days[dateKey].codes.push(h.code);
        });

        // Convert to array and limit to 9 days
        const result = Object.values(days).slice(0, 9).map((d, i) => {
            // Calculate value based on type
            let val = 0;
            let etp = 0;

            if (type === 'neige') val = d.snows.reduce((a, b) => a + b, 0); // Sum snow
            else if (type === 'pluies') val = d.rains.reduce((a, b) => a + b, 0); // Sum rain
            else if (type === 'gel') val = Math.min(...d.temps); // Min temp
            else if (type === 'canicule') val = Math.max(...d.temps); // Max temp
            else if (type === 'orages') val = Math.max(...d.codes); // Max code
            else if (type === 'arrosage') {
                // For Arrosage: We need ETP and Rain
                // Get ETP from dailyEtp array matched by date
                const dayEtp = dailyEtp.find(de => de.date === d.date.toISOString().split('T')[0]);
                etp = dayEtp ? dayEtp.etp : 0;
                val = d.rains.reduce((a, b) => a + b, 0); // Rain sum
            }

            return {
                time: d.date,
                value: val,
                etp: etp // Only used for arrosage
            };
        });

        return result;
    };

    // Determine global status based on worst day in the period
    const worstVal = data.reduce((acc, curr) => {
        if (type === 'arrosage') return 0; // Arrosage doesn't have a single "danger" status
        if (config.operator === '<=') return Math.min(acc, curr.value);
        return Math.max(acc, curr.value);
    }, config.operator === '<=' ? 100 : -100);

    const currentStatus = getStatusClass(worstVal);

    return (
        <div className="surveillance-container">
            <div className={clsx("card status-card", currentStatus)}>
                <div className="status-icon">
                    {currentStatus === 'normal' ? <CheckCircle size={48} /> : <AlertTriangle size={48} />}
                </div>
                <div className="status-content">
                    <h2>Surveillance {config.label}</h2>
                    <p className="status-message">
                        {currentStatus === 'normal' && "Aucun risque identifié."}
                        {currentStatus === 'moderate' && "Risque modéré identifié."}
                        {currentStatus === 'high' && "Risque fort ! Soyez vigilants."}
                        {currentStatus === 'extreme' && "Risque EXTRÊME. Danger confirmé."}
                    </p>
                </div>
            </div>

            <div className="card full-width">
                <div className="surveillance-header">
                    <h2 className="text-xl font-bold text-gray-800 mb-2">Plan de surveillance {config.label} - {location.name}</h2>
                </div>

                <div className="surveillance-grid-wrapper">
                    <table className="surveillance-grid">
                        <thead>
                            {/* Days Row */}
                            <tr>
                                <th className="row-header blue-header">Jours</th>
                                {data.map((d, i) => (
                                    <th key={i} className="time-header blue-header">
                                        {new Date(d.time).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>


                            {/* Arrosage Special View */}
                            {type === 'arrosage' ? (
                                <>
                                    <tr className="row-values">
                                        <td className="row-header blue-light">ETP (mm)</td>
                                        {data.map((d, i) => (
                                            <td key={i} className="cell-value">
                                                {d.etp}
                                            </td>
                                        ))}
                                    </tr>
                                    <tr className="row-values">
                                        <td className="row-header blue-light">Pluie (mm)</td>
                                        {data.map((d, i) => (
                                            <td key={i} className="cell-value">
                                                {Math.round(d.value * 10) / 10}
                                            </td>
                                        ))}
                                    </tr>
                                    <tr className="row-values">
                                        <td className="row-header blue-light">Bilan</td>
                                        {data.map((d, i) => {
                                            const balance = d.value - d.etp;
                                            return (
                                                <td key={i} className="cell-value" style={{ fontSize: '0.8rem' }}>
                                                    {balance < 0 ? <span className="text-orange-600">Déficit</span> : <span className="text-green-600">Positif</span>}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                </>
                            ) : (
                                /* Normal Surveillance View */
                                <tr className="row-values">
                                    <td className="row-header blue-light">
                                        {type === 'neige' ? 'Hauteur (cm)' :
                                            type === 'gel' ? 'Min Temp (°C)' :
                                                type === 'canicule' ? 'Max Temp (°C)' :
                                                    type === 'pluies' ? 'Cumul (mm)' :
                                                        'Valeur'}
                                    </td>
                                    {data.map((d, i) => {
                                        const status = getStatusClass(d.value);

                                        let displayVal = Math.round(d.value * 10) / 10;
                                        let unit = config.unit;

                                        if (type === 'orages') {
                                            // Override value display for Orages
                                            unit = '';
                                            if (d.value >= 99) displayVal = 'Violent';
                                            else if (d.value >= 96) displayVal = 'Probable';
                                            else if (d.value >= 95) displayVal = 'Possible';
                                            else displayVal = '-';
                                        }

                                        return (
                                            <td key={i} className={clsx("cell-value", status)}>
                                                {displayVal} {unit}
                                            </td>
                                        );
                                    })}
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* LEGENDES */}
                <div className="legend-container mt-4 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                    <h4 className="text-sm font-bold text-gray-700 mb-3 border-b pb-2">LÉGENDE</h4>

                    <div className="flex flex-wrap gap-3 text-sm">
                        {type === 'canicule' && <>
                            <div className="legend-item">
                                <span className="legend-color-box" style={{ backgroundColor: '#ffeb3b' }}></span>
                                <span>≥ 28°C (Fortes chaleurs)</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-color-box" style={{ backgroundColor: '#fd7e14' }}></span>
                                <span>≥ 30°C</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-color-box" style={{ backgroundColor: '#dc3545' }}></span>
                                <span className="font-bold text-red-700">≥ 36°C</span>
                            </div>
                        </>}

                        {type === 'gel' && <>
                            <div className="legend-item">
                                <span className="legend-color-box" style={{ backgroundColor: '#ffeb3b' }}></span>
                                <span>≤ 0°C</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-color-box" style={{ backgroundColor: '#fd7e14' }}></span>
                                <span>≤ -10°C</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-color-box" style={{ backgroundColor: '#dc3545' }}></span>
                                <span>≤ -20°C</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-color-box" style={{ backgroundColor: '#6a1b9a' }}></span>
                                <span className="font-bold text-purple-900">≤ -30°C</span>
                            </div>
                        </>}

                        {type === 'neige' && <>
                            <div className="legend-item">
                                <span className="legend-color-box" style={{ backgroundColor: '#ffeb3b' }}></span>
                                <span>3 à 10 cm</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-color-box" style={{ backgroundColor: '#fd7e14' }}></span>
                                <span>10 à 15 cm</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-color-box" style={{ backgroundColor: '#dc3545' }}></span>
                                <span className="font-bold text-red-700">&gt; 15 cm</span>
                            </div>
                        </>}

                        {type === 'pluies' && <>
                            <div className="legend-item">
                                <span className="legend-color-box" style={{ backgroundColor: '#ffeb3b' }}></span>
                                <span>10 à 20 mm</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-color-box" style={{ backgroundColor: '#fd7e14' }}></span>
                                <span>20 à 30 mm</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-color-box" style={{ backgroundColor: '#dc3545' }}></span>
                                <span className="font-bold text-red-700">&gt; 30 mm</span>
                            </div>
                        </>}

                        {type === 'orages' && <>
                            <div className="legend-item">
                                <span className="legend-color-box" style={{ backgroundColor: '#ffeb3b' }}></span>
                                <span>Possible</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-color-box" style={{ backgroundColor: '#fd7e14' }}></span>
                                <span>Probable</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-color-box" style={{ backgroundColor: '#dc3545' }}></span>
                                <span className="font-bold text-red-700">Violent</span>
                            </div>
                        </>}
                    </div>

                    {(type === 'neige' || type === 'pluies') && (
                        <div className="mt-3 text-xs text-gray-500 bg-gray-50 p-2 rounded border border-gray-100 italic flex items-center gap-2">
                            <span>📌</span>
                            <span>Les valeurs sont exprimées en cumul sur 24 heures.</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
