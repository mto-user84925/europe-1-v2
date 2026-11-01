import React, { useEffect, useState } from 'react';
import { Trophy, TrendingUp, TrendingDown, Wind, Droplets } from 'lucide-react';
import stationNamesData from '../../data/stationNames.json';
import './Rankings.css';

import { supabase } from '../../services/supabaseClient';

const Rankings = () => {
    const [rankings1h, setRankings1h] = useState(null);
    const [rankings24h, setRankings24h] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedDept, setSelectedDept] = useState('');

    const allDepts = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '21', '22', '23', '24', '25', '26', '27', '28', '29', '2A', '2B', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49', '50', '51', '52', '53', '54', '55', '56', '57', '58', '59', '60', '61', '62', '63', '64', '65', '66', '67', '68', '69', '70', '71', '72', '73', '74', '75', '76', '77', '78', '79', '80', '81', '82', '83', '84', '85', '86', '87', '88', '89', '90', '91', '92', '93', '94', '95'];

    useEffect(() => {
        loadRankings();
    }, [selectedDept]);

    const loadRankings = async () => {
        setLoading(true);
        try {
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

            const buildQuery = (timeLimit) => {
                let query = supabase
                    .from('observations_6mn')
                    .select('*')
                    .gte('timestamp', timeLimit.toISOString());

                if (selectedDept) {
                    const prefix = selectedDept === '2A' || selectedDept === '2B' ? '20' : selectedDept;
                    query = query.like('station_id', `${prefix}%`);
                }

                return query.order('timestamp', { ascending: false }).limit(5000);
            };

            const { data: data1h } = await buildQuery(oneHourAgo);
            const { data: data24h } = await buildQuery(twentyFourHoursAgo);

            const processData = (data) => {
                if (!data || data.length === 0) return { tempMax: [], tempMin: [], windMax: [], rainMax: [] };

                const tempMaxMap = {};
                const tempMinMap = {};
                const windMaxMap = {};
                const rainMaxMap = {};

                data.forEach(obs => {
                    const sid = obs.station_id;
                    // Utiliser le fichier JSON local
                    const stationName = stationNamesData[sid] || `Station ${sid.substring(0, 5)}`;

                    if (obs.t != null) {
                        if (!tempMaxMap[sid] || obs.t > tempMaxMap[sid].t) {
                            tempMaxMap[sid] = { ...obs, stationName };
                        }
                        if (!tempMinMap[sid] || obs.t < tempMinMap[sid].t) {
                            tempMinMap[sid] = { ...obs, stationName };
                        }
                    }

                    if (obs.fxi != null) {
                        if (!windMaxMap[sid] || obs.fxi > windMaxMap[sid].fxi) {
                            windMaxMap[sid] = { ...obs, stationName };
                        }
                    }

                    if (obs.rr_per != null && obs.rr_per > 0) {
                        if (!rainMaxMap[sid] || obs.rr_per > rainMaxMap[sid].rr_per) {
                            rainMaxMap[sid] = { ...obs, stationName };
                        }
                    }
                });

                return {
                    tempMax: Object.values(tempMaxMap).filter(s => s.t != null).sort((a, b) => b.t - a.t).slice(0, 50),
                    tempMin: Object.values(tempMinMap).filter(s => s.t != null).sort((a, b) => a.t - b.t).slice(0, 50),
                    windMax: Object.values(windMaxMap).filter(s => s.fxi != null && s.fxi > 0).sort((a, b) => b.fxi - a.fxi).slice(0, 50),
                    rainMax: Object.values(rainMaxMap).filter(s => s.rr_per != null && s.rr_per > 0).sort((a, b) => b.rr_per - a.rr_per).slice(0, 50)
                };
            };

            setRankings1h(processData(data1h));
            setRankings24h(processData(data24h));

        } catch (error) {
            console.error('Erreur classements:', error);
        }
        setLoading(false);
    };

    const RankingTable = ({ title, icon: Icon, data, valueKey, unit, color }) => (
        <div className="ranking-table-container">
            <div className="ranking-table-header" style={{ borderLeftColor: color }}>
                <Icon size={20} color={color} />
                <h3>{title}</h3>
            </div>
            <div className="ranking-table-wrapper">
                <table className="ranking-table">
                    <thead>
                        <tr>
                            <th className="rank-col">#</th>
                            <th className="station-col">Station</th>
                            <th className="value-col">Valeur</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data && data.length > 0 ? data.map((item, idx) => (
                            <tr key={idx} className={idx < 3 ? 'top-rank' : ''}>
                                <td className="rank-col">
                                    <span className="rank-number" style={{
                                        background: idx === 0 ? color : idx < 3 ? '#475569' : 'transparent',
                                        color: idx < 3 ? '#fff' : '#94a3b8'
                                    }}>
                                        {idx + 1}
                                    </span>
                                </td>
                                <td className="station-col">{item.stationName || item.station_id}</td>
                                <td className="value-col" style={{ color: idx === 0 ? color : idx < 3 ? '#e2e8f0' : '#cbd5e1' }}>
                                    <strong>
                                        {valueKey === 'fxi' ? Math.round(item[valueKey]) : item[valueKey]?.toFixed(1)} {unit}
                                    </strong>
                                </td>
                            </tr>
                        )) : (
                            <tr><td colSpan="3" className="no-data">Aucune donnée</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    if (loading) {
        return <div className="rankings-loading">⏳ Chargement des classements...</div>;
    }

    return (
        <div className="rankings-page">
            <header className="rankings-hero">
                <Trophy size={48} />
                <h1>Classements Météo</h1>
                <p>Top 50 des stations par catégorie</p>
            </header>

            <div className="dept-filter">
                <label htmlFor="dept-select">📍 Zone :</label>
                <select
                    id="dept-select"
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    className="dept-select-rankings"
                >
                    <option value="">🇫🇷 France entière</option>
                    {allDepts.map(d => (
                        <option key={d} value={d}>Département {d}</option>
                    ))}
                </select>
            </div>

            <section className="rankings-section">
                <h2>📊 Dernière Heure</h2>
                <div className="rankings-grid-tables">
                    <RankingTable title="🔥 Plus Chaud" icon={TrendingUp} data={rankings1h?.tempMax} valueKey="t" unit="°C" color="#ef4444" />
                    <RankingTable title="❄️ Plus Froid" icon={TrendingDown} data={rankings1h?.tempMin} valueKey="t" unit="°C" color="#3b82f6" />
                    <RankingTable title="💨 Rafales Max" icon={Wind} data={rankings1h?.windMax} valueKey="fxi" unit="km/h" color="#f97316" />
                    <RankingTable title="🌧️ Pluie Max" icon={Droplets} data={rankings1h?.rainMax} valueKey="rr_per" unit="mm" color="#2563eb" />
                </div>
            </section>

            <section className="rankings-section">
                <h2>📊 Dernières 24 Heures</h2>
                <div className="rankings-grid-tables">
                    <RankingTable title="🔥 Plus Chaud" icon={TrendingUp} data={rankings24h?.tempMax} valueKey="t" unit="°C" color="#ef4444" />
                    <RankingTable title="❄️ Plus Froid" icon={TrendingDown} data={rankings24h?.tempMin} valueKey="t" unit="°C" color="#3b82f6" />
                    <RankingTable title="💨 Rafales Max" icon={Wind} data={rankings24h?.windMax} valueKey="fxi" unit="km/h" color="#f97316" />
                    <RankingTable title="🌧️ Pluie Max" icon={Droplets} data={rankings24h?.rainMax} valueKey="rr_per" unit="mm" color="#2563eb" />
                </div>
            </section>
        </div>
    );
};

export default Rankings;
