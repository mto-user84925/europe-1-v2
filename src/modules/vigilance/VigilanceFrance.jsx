import React, { useState, useEffect, useMemo } from 'react';
import { geoConicConformal, geoPath } from "d3-geo";
import {
    Droplets, Waves, Wind, Zap, Snowflake, Info, Thermometer, Flame,
    ChevronDown, Activity, Loader, ShieldAlert, FileText, X,
    Image as ImageIcon, Link as LinkIcon, Eye
} from 'lucide-react';
import './VigilanceFrance.css';
import VigilanceSocialCard from './VigilanceSocialCard';

import { supabase } from '../../services/supabaseClient';

// OFFICIAL MF COLORS
const OFFICIAL_COLORS = {
    1: '#31aa35', // Vert
    2: '#fff600', // Jaune
    3: '#ffb21e', // Orange
    4: '#cc0000', // Rouge
};

const FOREST_FIRE_DESCRIPTIONS = {
    1: {
        title: "Danger faible (vert)",
        text: "Les conditions météorologiques prévues et les dernières précipitations atténuent le risque de départ et de propagation de feux de forêt et de végétation."
    },
    2: {
        title: "Danger modéré (jaune)",
        text: "Les conditions météorologiques n'aggravent pas significativement le risque de départ et de propagation de feux de forêt et de végétation comparativement aux normales estivales. Le risque de feux peut être localement élevé."
    },
    3: {
        title: "Danger élevé (orange)",
        text: "Les conditions météorologiques aggravent significativement le risque de départ et de propagation de feux de forêt et de végétation comparativement aux normales estivales. Le risque de feux peut être localement très élevé."
    },
    4: {
        title: "Danger très élevé (rouge)",
        text: "Les conditions météorologiques rendent le risque de départ et de propagation de feux de forêt et de végétation très élevé comparativement aux normales estivales."
    }
};

const PHENOMENONS = [
    { id: "2", name: "Pluie-inondation", icon: Droplets },
    { id: "9", name: "Vagues-submersion", icon: Waves },
    { id: "4", name: "Crues", icon: Waves },
    { id: "1", name: "Vent", icon: Wind },
    { id: "3", name: "Orages", icon: Zap },
    { id: "5", name: "Neige-verglas", icon: Snowflake },
    { id: "6", name: "Canicule", icon: Thermometer },
    { id: "7", name: "Grand Froid", icon: Thermometer },
    { id: "8", name: "Avalanches", icon: Info },
    { id: "100", name: "Météo des forêts", icon: Flame },
];

const REGIONS = [
    { id: 'ARA', name: 'Auvergne-Rhône-Alpes', deps: ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'] },
    { id: 'BFC', name: 'Bourgogne-Franche-Comté', deps: ['21', '25', '39', '58', '70', '71', '89', '90'] },
    { id: 'BRE', name: 'Bretagne', deps: ['22', '29', '35', '56'] },
    { id: 'CVL', name: 'Centre-Val de Loire', deps: ['18', '28', '36', '37', '41', '45'] },
    { id: 'COR', name: 'Corse', deps: ['2A', '2B'] },
    { id: 'GES', name: 'Grand Est', deps: ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'] },
    { id: 'HDF', name: 'Hauts-de-France', deps: ['02', '59', '60', '62', '80'] },
    { id: 'IDF', name: 'Île-de-France', deps: ['75', '77', '78', '91', '92', '93', '94', '95'] },
    { id: 'NOR', name: 'Normandie', deps: ['14', '27', '50', '61', '76'] },
    { id: 'NAQ', name: 'Nouvelle-Aquitaine', deps: ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'] },
    { id: 'OCC', name: 'Occitanie', deps: ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'] },
    { id: 'PDL', name: 'Pays de la Loire', deps: ['44', '49', '53', '72', '85'] },
    { id: 'PAC', name: 'Provence-Alpes-Côte d\'Azur', deps: ['04', '05', '06', '13', '83', '84'] },
];

const VigilanceFrance = () => {
    const [vigilanceData, setVigilanceData] = useState([]);
    const [bulletins, setBulletins] = useState([]);
    const [geoData, setGeoData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedDep, setSelectedDep] = useState(null);
    const [period, setPeriod] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        const p = params.get('period');
        return p !== null ? parseInt(p) : 0;
    });
    const [selectedPhenom, setSelectedPhenom] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('phenom') || null;
    });
    const [viewMode, setViewMode] = useState('national'); // 'national' or 'regional'
    const [selectedRegion, setSelectedRegion] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('region') || null;
    });
    const [localData, setLocalData] = useState({ stations: [], obs: [] });
    const [localLoading, setLocalLoading] = useState(false);

    useEffect(() => {
        fetchInitialData();
        const interval = setInterval(fetchInitialData, 10 * 60 * 1000); // 10 min
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (selectedDep) fetchLocalDeptData(selectedDep);
    }, [selectedDep]);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const res = await fetch("/data/departements-version-simplifiee.geojson");
            const geo = await res.json();
            setGeoData(geo);

            const [statusRes, bulletinRes] = await Promise.all([
                supabase.from('vigilance_status').select('*'),
                supabase.from('vigilance_bulletins').select('*')
            ]);
            if (!statusRes.error) setVigilanceData(statusRes.data);
            if (!bulletinRes.error) setBulletins(bulletinRes.data);
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    const fetchLocalDeptData = async (depCode) => {
        setLocalLoading(true);
        try {
            const { data: stations } = await supabase.from('stations').select('*').eq('dept', depCode);
            if (stations && stations.length > 0) {
                const ids = stations.map(s => s.id);
                const { data: obs } = await supabase
                    .from('observations_horaire')
                    .select('*')
                    .in('station_id', ids)
                    .order('timestamp', { ascending: false })
                    .limit(stations.length * 2);
                setLocalData({ stations, obs: obs || [] });
            } else {
                setLocalData({ stations: [], obs: [] });
            }
        } catch (err) { console.error(err); }
        setLocalLoading(false);
    };

    const currentMap = useMemo(() => {
        const map = {};
        vigilanceData.filter(d => d.period === period).forEach(d => {
            let displayLevel = d.level;
            if (selectedPhenom) {
                const risk = d.risks?.find(r => r.id === selectedPhenom);
                displayLevel = risk ? risk.level : 1;
            }
            map[d.dep_code] = { ...d, displayLevel };
        });
        return map;
    }, [vigilanceData, period, selectedPhenom]);

    // Calcul des décomptes par phénomène
    const phenomCounts = useMemo(() => {
        const counts = {};
        PHENOMENONS.forEach(p => {
            counts[p.id] = vigilanceData
                .filter(d =>
                    d.period === period &&
                    d.dep_code &&
                    !['FRA', '99', 'METRO', '00'].includes(d.dep_code.toString().trim())
                )
                .map(d => d.risks?.find(r => r.id === p.id)?.level || 1)
                .filter(lvl => lvl >= 2).length;
        });
        return counts;
    }, [vigilanceData, period]);

    const globalLastUpdate = useMemo(() => {
        if (!vigilanceData.length) return null;
        const updates = vigilanceData
            .filter(d => d.last_update)
            .map(d => new Date(d.last_update).getTime());
        if (updates.length === 0) return null;
        return new Date(Math.max(...updates));
    }, [vigilanceData]);

    const getBulletinForScope = (regionId = null) => {
        if (!vigilanceData.length || !geoData) return "";
        const regionConfig = regionId ? REGIONS.find(r => r.id === regionId) : null;

        const currentVigi = vigilanceData.filter(d => {
            const isBaseFilter = d.period === period &&
                d.dep_code &&
                !['FRA', '99', 'METRO', '00'].includes(d.dep_code.toString().trim());
            
            if (!isBaseFilter) return false;
            
            if (regionConfig) {
                return regionConfig.deps.includes(d.dep_code);
            }
            return true;
        });

        const depNames = {};
        geoData.features.forEach(f => {
            depNames[f.properties.code] = f.properties.nom;
        });

        const sections = [];

        // 1. ROUGE & ORANGE
        [4, 3].forEach(level => {
            PHENOMENONS.forEach(phenom => {
                const depsInVigi = currentVigi.filter(d => {
                    const r = d.risks?.find(r => r.id === phenom.id);
                    return r && r.level === level;
                }).sort((a, b) => {
                    const codeA = a.dep_code.replace('2A', '20.1').replace('2B', '20.2');
                    const codeB = b.dep_code.replace('2A', '20.1').replace('2B', '20.2');
                    return parseFloat(codeA) - parseFloat(codeB);
                });

                if (depsInVigi.length > 0) {
                    const emoji = level === 4 ? "🔴" : "🟠";
                    const lvlName = level === 4 ? "ROUGE" : "ORANGE";
                    const count = depsInVigi.length;
                    const depList = depsInVigi.map(d => `${depNames[d.dep_code] || d.dep_code} (${d.dep_code})`);

                    let depString = "";
                    if (depList.length === 1) {
                        depString = depList[0];
                    } else if (depList.length > 1) {
                        const last = depList.pop();
                        depString = depList.join(", ") + " et " + last;
                    }

                    const line = `${emoji} Vigilance ${lvlName} – ${phenom.name.toUpperCase()} : ${depString}`;
                    sections.push(line);
                }
            });
        });

        const now = new Date();
        const targetDate = new Date(now);
        if (period === 1) targetDate.setDate(now.getDate() + 1);
        
        const dateStrFull = new Intl.DateTimeFormat('fr-FR', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        }).format(targetDate).toUpperCase();

        const regionName = regionConfig ? regionConfig.name.toUpperCase() : "MÉTÉOROLOGIQUE";
        const header = `📋 VIGILANCE ${regionName} DU ${dateStrFull}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

        // 2. JAUNE (Résumé spécifique demandé)
        const yellowParts = [];
        PHENOMENONS.forEach(phenom => {
            const count = currentVigi.filter(d => {
                const r = d.risks?.find(r => r.id === phenom.id);
                return r && r.level === 2;
            }).length;
            if (count > 0) {
                yellowParts.push(`${phenom.name.toUpperCase()} pour ${count} département${count > 1 ? 's' : ''}`);
            }
        });

        if (yellowParts.length > 0) {
            sections.push(`🟡 Vigilance JAUNE – ${yellowParts.join(", ")}.`);
        }

        return header + (sections.length > 0 ? sections.join("\n\n").trim() : "✅ RAS : Aucune vigilance.");
    };

    const generatedBulletin = useMemo(() => {
        return getBulletinForScope(selectedRegion);
    }, [vigilanceData, geoData, period, selectedRegion]);

    const projection = useMemo(() => {
        if (!geoData) return null;
        let dataToFit = geoData;
        if (selectedRegion) {
            const regionConfig = REGIONS.find(r => r.id === selectedRegion);
            if (regionConfig) {
                dataToFit = {
                    ...geoData,
                    features: geoData.features.filter(f => regionConfig.deps.includes(f.properties.code))
                };
            }
        }
        return geoConicConformal().fitSize([800, 600], dataToFit);
    }, [geoData, selectedRegion]);

    const pathGenerator = useMemo(() => projection ? geoPath().projection(projection) : null, [projection]);

    const mapTransform = useMemo(() => {
        return "scale(1)";
    }, [selectedDep, geoData, pathGenerator]);

    const renderHourlyTimeline = (risks, startTime, title) => {
        if (!risks || risks.length === 0) return null;

        const hours = Array.from({ length: 24 }, (_, i) => i);
        const refDate = new Date(startTime);
        refDate.setHours(0, 0, 0, 0);
        const startDayTs = refDate.getTime();

        const activeRisks = risks.filter(r => r.level > 1);
        if (activeRisks.length === 0) return null;

        return (
            <div className="hourly-timeline-block">
                <h4 className="timeline-title">{title}</h4>
                <div className="hourly-grid-header">
                    {hours.filter(h => h % 4 === 0).map(h => (
                        <span key={h} className="h-label">{h}h</span>
                    ))}
                    <span className="h-label">24h</span>
                </div>
                <div className="phenom-hourly-rows">
                    {activeRisks.map(risk => {
                        const P = PHENOMENONS.find(p => p.id === risk.id);
                        const Icon = P?.icon || Activity;
                        return (
                            <div key={risk.id} className="hourly-row">
                                <div className="row-meta">
                                    <Icon size={14} style={{ color: OFFICIAL_COLORS[risk.level] }} />
                                    <span className="tiny-label">{P?.name}</span>
                                </div>
                                <div className="hour-boxes">
                                    {hours.map(h => {
                                        const hStart = startDayTs + (h * 3600000);
                                        const hEnd = hStart + 3600000;

                                        const segment = risk.timelines?.find(seg => {
                                            const b = new Date(seg.begin_time).getTime();
                                            const e = new Date(seg.end_time).getTime();
                                            return b < hEnd && e > hStart;
                                        });

                                        const color = segment ? OFFICIAL_COLORS[segment.color_id] : '#f1f5f9';
                                        return (
                                            <div
                                                key={h}
                                                className="hour-box"
                                                style={{ backgroundColor: color }}
                                                title={`${h}h-${h + 1}h: ${P?.name}`}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderBulletinCard = (bulletin, idx, titlePrefix = "") => {
        let Icon = FileText;
        let color = '#3453a2';

        const titleLower = (bulletin.title || "").toLowerCase();
        if (titleLower.includes('pluie')) { Icon = Droplets; color = OFFICIAL_COLORS[3]; }
        if (titleLower.includes('crues')) { Icon = Waves; color = OFFICIAL_COLORS[3]; }
        if (titleLower.includes('vent')) { Icon = Wind; color = OFFICIAL_COLORS[3]; }
        if (titleLower.includes('orage')) { Icon = Zap; color = OFFICIAL_COLORS[3]; }
        if (titleLower.includes('neige') || titleLower.includes('froid')) { Icon = Snowflake; color = OFFICIAL_COLORS[3]; }

        return (
            <div key={idx} className="bulletin-card">
                <div className="bulletin-header-mini">
                    <div className="bulletin-icon" style={{
                        background: color,
                        color: '#fff'
                    }}>
                        <Icon size={20} />
                    </div>
                    <div className="bulletin-title-group">
                        <h4>{titlePrefix} {bulletin.title || 'Bulletin de Vigilance'}</h4>
                        <span className="bulletin-time">
                            {bulletin.update_time ? new Date(bulletin.update_time).toLocaleDateString('fr-FR', {
                                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                            }) : ""}
                        </span>
                    </div>
                </div>
                <div className="bulletin-text-content" style={{ whiteSpace: 'pre-wrap' }}>
                    {bulletin.content || 'Contenu indisponible'}
                </div>
            </div>
        );
    };

    return (
        <div className="vigilance-container official">
            <div className="tabs-official no-capture">
                <div className="tabs-left">
                    <div className={`tab-item ${period === 0 ? 'active' : ''}`} onClick={() => { setPeriod(0); setSelectedPhenom(null); }}>Aujourd'hui</div>
                    <div className={`tab-item ${period === 1 ? 'active' : ''}`} onClick={() => { setPeriod(1); setSelectedPhenom(null); }}>Demain</div>
                </div>

                <div className="tabs-center ml-4">
                    <div className={`tab-item mini ${viewMode === 'national' ? 'active' : ''}`} onClick={() => setViewMode('national')}>Vue Nationale</div>
                    <div className={`tab-item mini ${viewMode === 'regional' ? 'active' : ''}`} onClick={() => setViewMode('regional')}>Hub des 13 Régions</div>
                </div>

                <div className="dept-selector-inline">
                    <select
                        className="dept-select-official"
                        value={selectedRegion || ""}
                        onChange={(e) => {
                            const val = e.target.value || null;
                            setSelectedRegion(val);
                            const url = new URL(window.location);
                            if (val) url.searchParams.set('region', val);
                            else url.searchParams.delete('region');
                            window.history.pushState({}, '', url);
                        }}
                    >
                        <option value="">Toute la France</option>
                        {REGIONS.map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                    </select>
                </div>

                <div className="dept-selector-inline">
                    <select
                        className="dept-select-official"
                        value={selectedDep || ""}
                        onChange={(e) => setSelectedDep(e.target.value || null)}
                    >
                        <option value="">Choisissez votre département</option>
                        {geoData?.features.sort((a, b) => a.properties.nom.localeCompare(b.properties.nom)).map(f => (
                            <option key={f.properties.code} value={f.properties.code}>
                                {f.properties.code} - {f.properties.nom}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {viewMode === 'national' ? (
                <div className="vigilance-main">
                    <main className="map-column">
                        <div className="map-panel">
                            <div className="map-view-box">
                                {loading ? <div className="loader-center"><Loader className="spin" size={40} /></div> : (
                                    <svg id="vigilance-map-svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid meet">
                                        <g style={{ transform: mapTransform, transition: 'transform 0.6s ease' }}>
                                            {geoData?.features.map(f => {
                                                const code = f.properties.code;
                                                const d = currentMap[code];
                                                const color = d ? OFFICIAL_COLORS[d.displayLevel] : '#f1f5f9';
                                                const isActive = selectedDep === code;
                                                return (
                                                    <path
                                                        key={code}
                                                        d={pathGenerator(f)}
                                                        fill={color}
                                                        stroke={isActive ? "#3453a2" : "#475569"}
                                                        strokeWidth={isActive ? 2.5 : 1.2}
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedDep(code);
                                                        }}
                                                        style={{ cursor: 'pointer', transition: 'fill 0.3s ease' }}
                                                    />
                                                );
                                            })}
                                        </g>
                                    </svg>
                                )}
                            </div>
                            <div className="map-legend-official">
                                <span className="legend-prefix">
                                    {selectedPhenom === "100" ? "Danger Feux :" : "Vigilance :"}
                                </span>
                                <div className="legend-items-list">
                                    {[1, 2, 3, 4].map(lvl => {
                                        let label = lvl === 1 ? 'Vert' : lvl === 2 ? 'Jaune' : lvl === 3 ? 'Orange' : 'Rouge';
                                        if (selectedPhenom === "100") {
                                            label = lvl === 1 ? 'Faible' : lvl === 2 ? 'Modéré' : lvl === 3 ? 'Elevé' : 'Très élevé';
                                        }
                                        return (
                                            <div key={lvl} className="legend-item">
                                                <span className="dot" style={{ background: OFFICIAL_COLORS[lvl] }}></span>
                                                <span className="label-text">{label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {selectedPhenom === "100" && (
                                <div className="forest-fire-explanation-panel no-capture animate-in">
                                    <h4 className="explanation-title">Les 4 niveaux de représentation du danger de feux</h4>
                                    <div className="forest-fire-levels-grid-mini">
                                        {[4, 3, 2, 1].map(lvl => {
                                            const desc = FOREST_FIRE_DESCRIPTIONS[lvl];
                                            const color = OFFICIAL_COLORS[lvl];
                                            return (
                                                <div key={lvl} className="forest-fire-level-card-mini">
                                                    <div className="level-card-header-mini">
                                                        <div className="level-circle-icon-mini" style={{ backgroundColor: color, color: lvl === 2 ? '#334155' : '#ffffff' }}>
                                                            <svg viewBox="0 0 24 24" fill="currentColor" className="tree-svg">
                                                                <rect x="11.2" y="14" width="1.6" height="7" rx="0.4" />
                                                                <path d="M12 2.5a5.5 5.5 0 0 0-4.5 8.64A3.5 3.5 0 0 0 9 17.5h6a3.5 3.5 0 0 0 1.5-6.36A5.5 5.5 0 0 0 12 2.5z" />
                                                            </svg>
                                                        </div>
                                                        <h5>{desc.title}</h5>
                                                    </div>
                                                    <p>{desc.text}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {selectedDep && (
                            <div className="dept-info-footer animate-in">
                                <div className="footer-top-row">
                                    <div className="f-title">
                                        <span className="f-code">{selectedDep}</span>
                                        <h3>{geoData?.features.find(f => f.properties.code === selectedDep)?.properties.nom}</h3>
                                        <button className="close-dept-btn" onClick={() => setSelectedDep(null)}><X size={20} /></button>
                                    </div>
                                    <div className="f-level-tags">
                                        <div className="tag-group">
                                            <span className="tag-label">Aujourd'hui</span>
                                            {(() => {
                                                const dToday = vigilanceData.find(d => d.dep_code === selectedDep && d.period === 0);
                                                let lvlToday = dToday?.level || 1;
                                                let textToday = lvlToday === 1 ? "Vert" : "Vigilance";
                                                if (selectedPhenom) {
                                                    const risk = dToday?.risks?.find(r => r.id === selectedPhenom);
                                                    lvlToday = risk ? risk.level : 1;
                                                    if (selectedPhenom === "100") {
                                                        const labels = { 1: "Faible", 2: "Modéré", 3: "Elevé", 4: "Très élevé" };
                                                        textToday = labels[lvlToday] || "Faible";
                                                    }
                                                }
                                                return (
                                                    <div className="f-level-tag" style={{ backgroundColor: OFFICIAL_COLORS[lvlToday] }}>
                                                        {textToday}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        <div className="tag-group">
                                            <span className="tag-label">Demain</span>
                                            {(() => {
                                                const dTomorrow = vigilanceData.find(d => d.dep_code === selectedDep && d.period === 1);
                                                let lvlTomorrow = dTomorrow?.level || 1;
                                                let textTomorrow = lvlTomorrow === 1 ? "Vert" : "Vigilance";
                                                if (selectedPhenom) {
                                                    const risk = dTomorrow?.risks?.find(r => r.id === selectedPhenom);
                                                    lvlTomorrow = risk ? risk.level : 1;
                                                    if (selectedPhenom === "100") {
                                                        const labels = { 1: "Faible", 2: "Modéré", 3: "Elevé", 4: "Très élevé" };
                                                        textTomorrow = labels[lvlTomorrow] || "Faible";
                                                    }
                                                }
                                                return (
                                                    <div className="f-level-tag" style={{ backgroundColor: OFFICIAL_COLORS[lvlTomorrow] }}>
                                                        {textTomorrow}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>

                                {selectedPhenom === "100" ? (
                                    <div className="forest-fire-detail-block" style={{ 
                                        marginTop: '20px', 
                                        background: '#f8fafc', 
                                        padding: '15px', 
                                        borderRadius: '8px', 
                                        border: '1px solid #e2e8f0' 
                                    }}>
                                        <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', fontWeight: '600' }}>Niveaux de danger feux détaillés</h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '15px' }}>
                                            {(() => {
                                                const lvlToday = vigilanceData.find(d => d.dep_code === selectedDep && d.period === 0)?.risks?.find(r => r.id === "100")?.level || 1;
                                                const lvlTomorrow = vigilanceData.find(d => d.dep_code === selectedDep && d.period === 1)?.risks?.find(r => r.id === "100")?.level || 1;
                                                
                                                const descToday = FOREST_FIRE_DESCRIPTIONS[lvlToday];
                                                const descTomorrow = FOREST_FIRE_DESCRIPTIONS[lvlTomorrow];

                                                return (
                                                    <>
                                                        <div className="day-desc" style={{ padding: '4px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                                                                <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: OFFICIAL_COLORS[lvlToday], marginRight: '8px' }}></span>
                                                                <strong style={{ fontSize: '13px', color: '#1e293b' }}>Aujourd'hui : {descToday.title}</strong>
                                                            </div>
                                                            <p style={{ margin: 0, fontSize: '12px', color: '#475569', lineHeight: '1.4' }}>{descToday.text}</p>
                                                        </div>
                                                        <div className="day-desc" style={{ padding: '4px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                                                                <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: OFFICIAL_COLORS[lvlTomorrow], marginRight: '8px' }}></span>
                                                                <strong style={{ fontSize: '13px', color: '#1e293b' }}>Demain : {descTomorrow.title}</strong>
                                                            </div>
                                                            <p style={{ margin: 0, fontSize: '12px', color: '#475569', lineHeight: '1.4' }}>{descTomorrow.text}</p>
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="footer-chronology-grid">
                                        {renderHourlyTimeline(
                                            vigilanceData.find(d => d.dep_code === selectedDep && d.period === 0)?.risks,
                                            vigilanceData.find(d => d.dep_code === selectedDep && d.period === 0)?.start_time,
                                            "Chronologie Aujourd'hui"
                                        )}
                                        {renderHourlyTimeline(
                                            vigilanceData.find(d => d.dep_code === selectedDep && d.period === 1)?.risks,
                                            vigilanceData.find(d => d.dep_code === selectedDep && d.period === 1)?.start_time || new Date(new Date().getTime() + 86400000).toISOString(),
                                            "Chronologie Demain"
                                        )}
                                    </div>
                                )}

                                <section className="detail-section" style={{ marginTop: '30px' }}>
                                    <h3 className="section-label">Relevés Stations ({selectedDep})</h3>
                                    {localLoading ? <Loader className="spin" size={20} /> : (
                                        <div className="station-grid-row">
                                            {localData.stations.length > 0 ? localData.stations.slice(0, 6).map(s => {
                                                const obs = localData.obs.find(o => o.station_id === s.id);
                                                let valStr = "--";
                                                if (obs) {
                                                    if (selectedPhenom === "1") valStr = (obs.fxi || obs.ff) !== null ? `${obs.fxi || obs.ff} km/h` : "--";
                                                    else if (selectedPhenom === "2" || selectedPhenom === "4") valStr = obs.rr1 !== null ? `${obs.rr1} mm` : "--";
                                                    else valStr = obs.t !== null ? `${Math.round(obs.t)}°C` : "--";
                                                }
                                                return (
                                                    <div key={s.id} className="station-mini-card">
                                                        <span className="s-name">{s.name}</span>
                                                        <span className="s-val">{valStr}</span>
                                                    </div>
                                                );
                                            }) : <p className="no-data">Aucune station.</p>}
                                        </div>
                                    )}
                                </section>
                            </div>
                        )}
                    </main>

                    <aside className="phenomenon-sidebar">
                        <div className="sidebar-card">
                            <div className="sidebar-header-main">
                                <div className="icon-main-wrap"><ShieldAlert size={22} /></div>
                                <h3>Risques en cours</h3>
                            </div>
                            <div className="phenom-grid">
                                <div className={`phenom-card-item global ${selectedPhenom === null ? 'active' : ''}`} onClick={() => setSelectedPhenom(null)}>
                                    <div className="card-inner"><Activity size={20} /><span>Synthèse</span></div>
                                </div>
                                {PHENOMENONS.map(p => {
                                    const Icon = p.icon;
                                    const isSelected = selectedPhenom === p.id;
                                    const levels = vigilanceData.filter(d => d.period === period).map(d => d.risks?.find(r => r.id === p.id)?.level || 1);
                                    const maxLvl = Math.max(...levels);
                                    return (
                                        <div key={p.id} className={`phenom-card-item ${isSelected ? 'active' : ''} lvl-${maxLvl}`} onClick={() => setSelectedPhenom(isSelected ? null : p.id)}>
                                            <div className="card-indicator" style={{ backgroundColor: OFFICIAL_COLORS[maxLvl] }}></div>
                                            <div className="card-inner"><Icon size={20} /><span>{p.name}</span></div>
                                        </div>
                                    );
                                })}
                            </div>
                            {selectedPhenom === "100" && (
                                <div className="phenom-info-note animate-in" style={{ 
                                    marginTop: '15px', 
                                    padding: '12px', 
                                    background: '#fff7ed', 
                                    borderRadius: '8px', 
                                    borderLeft: '4px solid #ea580c', 
                                    fontSize: '13px', 
                                    color: '#7c2d12',
                                    lineHeight: '1.4'
                                }}>
                                    <Flame size={16} style={{ color: '#ea580c', display: 'inline', marginRight: '6px', marginBottom: '-3px' }} />
                                    La <strong>Météo des forêts</strong> estime le danger d'incendie de forêt et de végétation à l'échelle départementale. Elle est émise quotidiennement par Météo-France de juin à septembre.
                                </div>
                            )}
                        </div>

                        <div className="sidebar-card share-card no-capture">
                            <div className="share-header">
                                <ImageIcon size={20} />
                                <h3>Images & Partage</h3>
                            </div>
                            <div className="share-links-hub">
                                <h4 className="share-link-group-title">AUJOURD'HUI</h4>
                                <div className="share-link-box-modern">
                                    <div className="url-preview">
                                        <LinkIcon size={12} />
                                        <span>{selectedRegion ? `vigilance_region_${selectedRegion}_today.png` : 'vigilance_france_today.png'} (Carte Seule)</span>
                                    </div>
                                    <button className="copy-btn-modern-blue" onClick={() => {
                                        const file = selectedRegion ? `vigilance_region_${selectedRegion}_today.png` : 'vigilance_france_today.png';
                                        const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/vigilance-captures/${file}`;
                                        navigator.clipboard.writeText(url);
                                        alert("Lien copié !");
                                    }}>
                                        <FileText size={16} /> Copier
                                    </button>
                                </div>

                                <div className="share-link-box-modern">
                                    <div className="url-preview">
                                        <LinkIcon size={12} />
                                        <span>{selectedRegion ? `vigilance_region_${selectedRegion}_today_social.png` : 'vigilance_france_today_social.png'} (Social Title)</span>
                                    </div>
                                    <button className="copy-btn-modern-blue" onClick={() => {
                                        const file = selectedRegion ? `vigilance_region_${selectedRegion}_today_social.png` : 'vigilance_france_today_social.png';
                                        const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/vigilance-captures/${file}`;
                                        navigator.clipboard.writeText(url);
                                        alert("Lien copié !");
                                    }}>
                                        <FileText size={16} /> Copier
                                    </button>
                                </div>

                                <h4 className="share-link-group-title" style={{ marginTop: '15px' }}>DEMAIN</h4>
                                <div className="share-link-box-modern">
                                    <div className="url-preview">
                                        <LinkIcon size={12} />
                                        <span>{selectedRegion ? `vigilance_region_${selectedRegion}_tomorrow.png` : 'vigilance_france_tomorrow.png'} (Carte Seule)</span>
                                    </div>
                                    <button className="copy-btn-modern-blue" onClick={() => {
                                        const file = selectedRegion ? `vigilance_region_${selectedRegion}_tomorrow.png` : 'vigilance_france_tomorrow.png';
                                        const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/vigilance-captures/${file}`;
                                        navigator.clipboard.writeText(url);
                                        alert("Lien copié !");
                                    }}>
                                        <FileText size={16} /> Copier
                                    </button>
                                </div>

                                <div className="share-link-box-modern">
                                    <div className="url-preview">
                                        <LinkIcon size={12} />
                                        <span>{selectedRegion ? `vigilance_region_${selectedRegion}_tomorrow_social.png` : 'vigilance_france_tomorrow_social.png'} (Social Title)</span>
                                    </div>
                                    <button className="copy-btn-modern-blue" onClick={() => {
                                        const file = selectedRegion ? `vigilance_region_${selectedRegion}_tomorrow_social.png` : 'vigilance_france_tomorrow_social.png';
                                        const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/vigilance-captures/${file}`;
                                        navigator.clipboard.writeText(url);
                                        alert("Lien copié !");
                                    }}>
                                        <FileText size={16} /> Copier
                                    </button>
                                </div>
                            </div>
                            <p className="share-footer-note">Les captures sont générées toutes les 30 minutes.</p>
                        </div>
                    </aside>
                </div>
            ) : (
                <div className="vigilance-regions-hub">
                    <div className="hub-grid">
                        {REGIONS.map(region => {
                            // On filtre les départements appartenant à cette région
                            const regionDeps = geoData?.features.filter(f => region.deps.includes(f.properties.code)) || [];
                            
                            // On calcule une projection locale pour cette région
                            const localProjection = geoConicConformal().fitSize([300, 200], {
                                type: 'FeatureCollection',
                                features: regionDeps
                            });
                            const localPathGen = geoPath().projection(localProjection);

                            return (
                                <div key={region.id} className="region-hub-card">
                                    <div className="region-hub-header">
                                        <div className="region-title-box">
                                            <ImageIcon size={18} />
                                            <h4>{region.name}</h4>
                                        </div>
                                        <div className="region-actions">
                                            <button 
                                                className="copy-region-link-btn"
                                                title="Copier le lien pour Aujourd'hui"
                                                onClick={() => {
                                                    const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/vigilance-captures/vigilance_region_${region.id}_today.png`;
                                                    navigator.clipboard.writeText(url);
                                                    alert(`Lien Aujourd'hui (${region.id}) copié !`);
                                                }}
                                            >
                                                <LinkIcon size={12} /> Auj.
                                            </button>
                                            <button 
                                                className="copy-region-link-btn highlight-tomorrow-btn"
                                                title="Copier le lien pour Demain"
                                                onClick={() => {
                                                    const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/vigilance-captures/vigilance_region_${region.id}_tomorrow.png`;
                                                    navigator.clipboard.writeText(url);
                                                    alert(`Lien Demain (${region.id}) copié !`);
                                                }}
                                            >
                                                <LinkIcon size={12} /> Demain
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <div className="region-hub-map-container">
                                        <svg viewBox="0 0 300 200" preserveAspectRatio="xMidYMid meet">
                                            {regionDeps.map(f => {
                                                const code = f.properties.code;
                                                const d = currentMap[code];
                                                const color = d ? OFFICIAL_COLORS[d.displayLevel] : '#f1f5f9';
                                                return (
                                                    <path
                                                        key={code}
                                                        d={localPathGen(f)}
                                                        fill={color}
                                                        stroke="#475569"
                                                        strokeWidth="1"
                                                    />
                                                );
                                            })}
                                        </svg>
                                    </div>

                                    <div className="region-hub-bulletin">
                                        <pre>{getBulletinForScope(region.id)}</pre>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div id="vigilance-capture-full" className="social-capture-container no-display-web">
                <VigilanceSocialCard
                    key={`${selectedRegion}-${period}-${selectedPhenom}`}
                    geoData={geoData}
                    vigilanceData={vigilanceData}
                    period={period}
                    lastUpdate={globalLastUpdate}
                    phenoms={PHENOMENONS}
                    regionId={selectedRegion}
                    selectedPhenom={selectedPhenom}
                />
            </div>



            <div className="vigilance-text-list-section">
                {generatedBulletin && (
                    <div className="text-list-card bulletin-auto-card">
                        <div className="bulletin-header">
                            <h3>Bulletin Automatisé ({selectedRegion || 'National'})</h3>
                            <button className="copy-bulletin-btn" onClick={() => {
                                navigator.clipboard.writeText(generatedBulletin);
                                alert("Bulletin copié !");
                            }}>
                                <FileText size={16} /> Copier
                            </button>
                        </div>
                        <pre className="bulletin-text-display">{generatedBulletin}</pre>
                    </div>
                )}

                <div className="text-list-card">
                    <h3>Détails par phénomène</h3>
                    <div className="phenomenon-text-groups">
                        {PHENOMENONS.map(phenom => {
                            const activeDepts = vigilanceData
                                .filter(d => d.period === period && d.dep_code !== "FRA")
                                .map(d => ({ ...d, riskLevel: d.risks?.find(r => r.id === phenom.id)?.level || 1 }))
                                .filter(d => d.riskLevel >= 2)
                                .sort((a, b) => a.dep_code.localeCompare(b.dep_code));

                            if (activeDepts.length === 0) return null;
                            const Icon = phenom.icon;
                            return (
                                <div key={phenom.id} className="phenom-summary-card">
                                    <div className="phenom-summary-header">
                                        <Icon size={20} />
                                        <h4>{phenom.name}</h4>
                                    </div>
                                    <div className="phenom-summary-levels">
                                        {[4, 3, 2].map(lvl => {
                                            const depts = activeDepts.filter(d => d.riskLevel === lvl);
                                            if (depts.length === 0) return null;
                                            return (
                                                <div key={lvl} className={`level-summary-row lvl-${lvl}`}>
                                                    <span className="level-badge" style={{ background: OFFICIAL_COLORS[lvl] }}>
                                                        {lvl === 4 ? 'Rouge' : lvl === 3 ? 'Orange' : 'Jaune'}
                                                    </span>
                                                    <div className="level-depts-list">
                                                        {depts.map(d => <span key={d.dep_code} className="dept-pill"><strong>{d.dep_code}</strong></span>)}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VigilanceFrance;
