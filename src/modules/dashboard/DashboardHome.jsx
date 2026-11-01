import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
    Thermometer, Wind, Droplets, Map, Zap,
    ShieldAlert, Search, ArrowRight, Activity,
    Clock, ChevronRight, LayoutDashboard, Radio
} from 'lucide-react';
import { DEPARTMENTS, REGIONS } from '../../data/departments';
import stationNames from '../../data/stationNames.json';
import './DashboardHome.css';

import { supabase } from '../../services/supabaseClient';

// OFFICIAL MF COLORS
const VIGILANCE_COLORS = {
    1: '#31aa35', // Vert
    2: '#fff600', // Jaune
    3: '#ffb21e', // Orange
    4: '#cc0000', // Rouge
};

export default function DashboardHome() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        tmax: { val: null, city: '...' },
        fmax: { val: null, city: '...' },
        rrmax: { val: null, city: '...' },
        vigilanceCount: { orange: 0, red: 0 },
        lightningCount: 0
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        loadDashboardData();
        return () => clearInterval(timer);
    }, []);

    const loadDashboardData = async () => {
        setLoading(true);
        try {
            const today = new Date().toISOString().split('T')[0];

            // 1. Fetch National Extremes
            const { data: extremes, error: extError } = await supabase.rpc('get_daily_extremes_fast', {
                target_date: today,
                dept_codes: []
            });

            let nationalStats = { ...stats };

            if (!extError && extremes && extremes.length > 0) {
                const sortedT = [...extremes].sort((a, b) => (b.temp_max || -99) - (a.temp_max || -99))[0];
                const sortedW = [...extremes].sort((a, b) => (b.wind_gust_max || 0) - (a.wind_gust_max || 0))[0];
                const sortedR = [...extremes].sort((a, b) => (b.rain_total || 0) - (a.rain_total || 0))[0];

                nationalStats.tmax = {
                    val: sortedT?.temp_max,
                    city: sortedT ? (stationNames[sortedT.station_id] || sortedT.station_id).replace(/\s\(\d+\)$/, '') : '...'
                };
                nationalStats.fmax = {
                    val: sortedW?.wind_gust_max,
                    city: sortedW ? (stationNames[sortedW.station_id] || sortedW.station_id).replace(/\s\(\d+\)$/, '') : '...'
                };
                nationalStats.rrmax = {
                    val: sortedR?.rain_total,
                    city: sortedR ? (stationNames[sortedR.station_id] || sortedR.station_id).replace(/\s\(\d+\)$/, '') : '...'
                };
            }

            // 2. Fetch Vigilance Status
            const { data: vigi, error: vigiError } = await supabase.from('vigilance_status').select('*').eq('period', 0);
            if (!vigiError && vigi) {
                nationalStats.vigilanceCount = {
                    orange: vigi.filter(d => d.level === 3).length,
                    red: vigi.filter(d => d.level === 4).length
                };
            }

            // 3. Fetch Lightning (24h count from meteo-npdc.fr public API)
            try {
                const res = await fetch('https://meteo-npdc.fr/api/v2/lightning/get_latest?minutes=1440', {
                    referrerPolicy: "no-referrer"
                });
                if (res.ok) {
                    const json = await res.json();
                    if (json.success && Array.isArray(json.data)) {
                        nationalStats.lightningCount = json.data.length;
                    }
                }
            } catch (e) { console.warn("Lightning fetch failed", e); }

            setStats(nationalStats);
        } catch (err) {
            console.error("Dashboard load error:", err);
        } finally {
            setLoading(false);
        }
    };

    const filteredDepts = useMemo(() => {
        if (!searchTerm) return [];
        return DEPARTMENTS.filter(d =>
            d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            d.code.includes(searchTerm)
        ).slice(0, 6);
    }, [searchTerm]);

    return (
        <div className="dashboard-root">
            {/* TOP NAVIGATION BAR (INTERNAL) */}
            <div className="dash-top-bar">
                <div className="time-display">
                    <Clock size={16} />
                    <span>{currentTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    <span className="date-tag">{currentTime.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</span>
                </div>
                <div className="vigi-ribbon">
                    {stats.vigilanceCount.red > 0 && <span className="vigi-tag red">{stats.vigilanceCount.red} Vigilance Rouge</span>}
                    {stats.vigilanceCount.orange > 0 && <span className="vigi-tag orange">{stats.vigilanceCount.orange} Vigilance Orange</span>}
                    {stats.vigilanceCount.orange === 0 && stats.vigilanceCount.red === 0 && <span className="vigi-tag green">Situation Calme</span>}
                </div>
            </div>

            {/* HERO SECTION */}
            <header className="dash-hero">
                <div className="hero-content">
                    <div className="badge">MÉTÉO-FRANCE OBSERVATORY</div>
                    <h1>Monitorage National <span className="gradient-text">Temps Réel</span></h1>
                    <p>Accédez aux données haute résolution du réseau automatique français et aux alertes de vigilance officielles.</p>

                    <div className="hero-search-box">
                        <Search size={22} className="search-icon" />
                        <input
                            type="text"
                            placeholder="Rechercher un département ou une station..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <div className="search-dropdown">
                                {filteredDepts.map(d => (
                                    <button key={d.code} onClick={() => navigate(`/observations/departement/${d.code}`)}>
                                        <span className="code">{d.code}</span>
                                        <span className="name">{d.name}</span>
                                        <ArrowRight size={14} />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="hero-stats">
                    <div className="stat-card">
                        <div className="icon-wrap temp"><Thermometer size={20} /></div>
                        <div className="stat-info">
                            <span className="label">Temp. Max</span>
                            <span className="value">{stats.tmax.val?.toFixed(1) || '--'}°C</span>
                            <span className="city">{stats.tmax.city}</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="icon-wrap wind"><Wind size={20} /></div>
                        <div className="stat-info">
                            <span className="label">Rafale Max</span>
                            <span className="value">{stats.fmax.val || '--'} <small>km/h</small></span>
                            <span className="city">{stats.fmax.city}</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="icon-wrap rain"><Droplets size={20} /></div>
                        <div className="stat-info">
                            <span className="label">Pluie Max</span>
                            <span className="value">{stats.rrmax.val?.toFixed(1) || '--'} <small>mm</small></span>
                            <span className="city">{stats.rrmax.city}</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* MAIN GRID */}
            <div className="dash-main-grid">
                {/* VIGILANCE CARD */}
                <div className="grid-item card-vigi" onClick={() => navigate('/vigilance')}>
                    <div className="card-header">
                        <ShieldAlert size={20} className="text-warning" />
                        <h2>Vigilance Météo</h2>
                        <ChevronRight size={18} className="chevron" />
                    </div>
                    <div className="vigi-preview-content">
                        {/* Summary Numbers */}
                        <div className="vigi-stats-mini">
                            <div className="v-stat">
                                <span className="v-num">{stats.vigilanceCount.orange}</span>
                                <span className="v-label">Orange</span>
                            </div>
                            <div className="v-stat">
                                <span className="v-num">{stats.vigilanceCount.red}</span>
                                <span className="v-label">Rouge</span>
                            </div>
                        </div>
                        <p className="vigi-footer-text">Consultez les bulletins de suivi et la chronologie par phénomène.</p>
                    </div>
                    <div className="card-bg-icon"><ShieldAlert /></div>
                </div>

                {/* RADAR CARD */}
                <div className="grid-item card-radar" onClick={() => navigate('/radar')}>
                    <div className="card-header">
                        <Radio size={20} className="text-primary" />
                        <h2>Précipitations</h2>
                        <span className="live-tag">LIVE</span>
                    </div>
                    <div className="radar-preview">
                        <div className="radar-waves">
                            <div className="wave"></div>
                            <div className="wave"></div>
                            <div className="wave"></div>
                        </div>
                        <p>Suivre l'évolution des pluies sur le territoire en temps réel.</p>
                    </div>
                    <button className="card-btn">Ouvrir le Radar</button>
                    <div className="card-bg-icon"><Map /></div>
                </div>

                {/* FOUDRE CARD */}
                <div className="grid-item card-foudre" onClick={() => navigate('/foudre-expert')}>
                    <div className="card-header">
                        <Zap size={20} className="text-orange" />
                        <h2>Activité Électrique</h2>
                        <ChevronRight size={18} className="chevron" />
                    </div>
                    <div className="foudre-display">
                        <div className="foudre-count">{stats.lightningCount.toLocaleString() || '0'}</div>
                        <div className="foudre-label">Impacts détectés ce jour</div>
                    </div>
                    <div className="lightning-bolt"></div>
                    <div className="card-bg-icon"><Zap /></div>
                </div>

                {/* MODULES QUICK NAV */}
                <div className="grid-item card-modules">
                    <div className="card-header">
                        <LayoutDashboard size={20} />
                        <h2>Expertises & Outils</h2>
                    </div>
                    <div className="modules-list">
                        <Link to="/btp" className="mod-link">
                            <Activity size={16} />
                            <span>Module BTP Pro</span>
                        </Link>
                        <Link to="/crues" className="mod-link">
                            <Activity size={16} />
                            <span>Vigilance Crues</span>
                        </Link>
                        <Link to="/supervision" className="mod-link">
                            <Activity size={16} />
                            <span>Carte Supervision</span>
                        </Link>
                        <Link to="/climatologie" className="mod-link">
                            <Activity size={16} />
                            <span>Records & Normales</span>
                        </Link>
                        <Link to="/mes-liens" className="mod-link">
                            <Activity size={16} />
                            <span>Favoris & Liens</span>
                        </Link>
                    </div>
                </div>
            </div>

            {/* REVIEWS / LATEST NEWS SECTION (Compact) */}
            <footer className="dash-footer">
                <p>&copy; 2026 MÉTÉO CLIMAT PRO - Données issues des réseaux officiels Météo-France & Agate.</p>
            </footer>
        </div>
    );
}
