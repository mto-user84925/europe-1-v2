import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import {
    Waves, AlertTriangle, Loader, TrendingUp, Droplets, MapPin,
    ChevronDown, ChevronRight, Minimize2, CheckCircle, Layers
} from 'lucide-react';
import {
    fetchTronçonsGeoJSON,
    calculateVigilanceStats,
    groupTronconsByTerritory,
    fetchDepartementsGeoJSON
} from '../../services/vigicruuesService';
import 'leaflet/dist/leaflet.css';
import './CruesDashboard.css';
import { CARTO_TILES } from '../../constants/carto';

const VIGI_COLORS = {
    1: '#006400', // Vert Foncé
    2: '#F5E800', // Jaune
    3: '#F7941D', // Orange
    4: '#CC0000', // Rouge
};

const VIGI_LABELS = {
    1: 'Vigilance Verte',
    2: 'Vigilance Jaune',
    3: 'Vigilance Orange',
    4: 'Vigilance Rouge',
};

function MapController({ center, zoom }) {
    const map = useMap();
    useEffect(() => {
        map.setView(center, zoom);
    }, [center, zoom, map]);
    return null;
}

const RegionList = ({ regions, onTronconClick }) => {
    const [expandedRegions, setExpandedRegions] = useState(new Set());

    const toggleRegion = (regionName) => {
        const newExpanded = new Set(expandedRegions);
        if (newExpanded.has(regionName)) newExpanded.delete(regionName);
        else newExpanded.add(regionName);
        setExpandedRegions(newExpanded);
    };

    // Filtre : Uniquement Jaune/Orange/Rouge
    const alertRegions = Object.entries(regions).filter(([_, data]) =>
        (data.stats.jaune + data.stats.orange + data.stats.rouge) > 0
    );

    return (
        <div className="region-list">
            <div className="region-list-header">
                <AlertTriangle size={16} className="text-orange-600" />
                <h3>Cours d'eau en Vigilance</h3>
            </div>
            <div className="regions-container">
                {alertRegions.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
                        Aucune vigilance en cours (Tout est vert).
                    </div>
                ) : (
                    alertRegions.map(([regionName, data]) => {
                        const isExpanded = expandedRegions.has(regionName);
                        const tronconsAlerte = data.troncons.filter(t => t.vigilance >= 2);

                        const nbJaune = data.stats.jaune;
                        const nbOrange = data.stats.orange;
                        const nbRouge = data.stats.rouge;

                        return (
                            <div key={regionName} className="region-item">
                                <div
                                    className="region-header"
                                    onClick={() => toggleRegion(regionName)}
                                >
                                    <div className="region-title">
                                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        <span>{regionName}</span>
                                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400 }}>
                                            ({tronconsAlerte.length})
                                        </span>
                                    </div>
                                    <div className="region-badges">
                                        {nbRouge > 0 && <span className="vigi-badge rouge">{nbRouge}</span>}
                                        {nbOrange > 0 && <span className="vigi-badge orange">{nbOrange}</span>}
                                        {nbJaune > 0 && <span className="vigi-badge jaune">{nbJaune}</span>}
                                    </div>
                                </div>
                                {isExpanded && (
                                    <div className="troncons-list">
                                        {tronconsAlerte.map(troncon => (
                                            <div
                                                key={troncon.code}
                                                className="troncon-item"
                                                onClick={() => onTronconClick(troncon)}
                                            >
                                                <div
                                                    className="troncon-indicator"
                                                    style={{ background: VIGI_COLORS[troncon.vigilance] }}
                                                />
                                                <span className="troncon-name">{troncon.nom}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

const CruesDashboard = () => {
    const [geoData, setGeoData] = useState(null);
    const [departementsGeoData, setDepartementsGeoData] = useState(null); // Nouveau state
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [stats, setStats] = useState({ vert: 0, jaune: 0, orange: 0, rouge: 0 });
    const [regions, setRegions] = useState({});

    // 'osm' ou 'light'
    const [mapStyle, setMapStyle] = useState('osm');

    const [mapCenter, setMapCenter] = useState([46.4, 2.2]);
    const [mapZoom, setMapZoom] = useState(5.7);

    useEffect(() => {
        loadVigicruesData();
    }, []);

    const loadVigicruesData = async () => {
        setLoading(true);
        setError(null);
        try {
            // Paralléliser le chargement pour speeder
            const [geoJSON, deptsJSON] = await Promise.all([
                fetchTronçonsGeoJSON(),
                fetchDepartementsGeoJSON()
            ]);

            setGeoData(geoJSON);
            setDepartementsGeoData(deptsJSON);

            const vigilanceStats = calculateVigilanceStats(geoJSON);
            setStats(vigilanceStats);

            const regionGroups = await groupTronconsByTerritory(geoJSON);
            setRegions(regionGroups);

        } catch (err) {
            console.error('Error loading data:', err);
            setError('Impossible de charger les données');
        }
        setLoading(false);
    };

    const getFeatureStyle = (feature) => {
        const niveau = feature.properties?.NivInfViCr || 1;
        const weight = niveau === 1 ? 4 : niveau === 2 ? 7 : niveau >= 3 ? 10 : 4;
        return {
            color: VIGI_COLORS[niveau] || '#006400',
            weight: weight,
            opacity: 1.0,
        };
    };

    // Style pour les départements (gris fin)
    const getDepartementStyle = () => {
        return {
            color: '#94a3b8', // Gris 'Slate'
            weight: 1,
            fillOpacity: 0,   // Pas de remplissage
            dashArray: '3, 3' // Pointillés discrets
        };
    };

    const onEachFeature = (feature, layer) => {
        const props = feature.properties;
        const niveau = props?.NivInfViCr || 1;

        layer.bindPopup(`
            <div style="font-family: -apple-system, sans-serif; padding: 5px;">
                <h3 style="margin: 0 0 5px; font-size: 14px; font-weight: 700;">${props.lbentcru || 'Tronçon'}</h3>
                <div style="font-size: 12px; font-weight: 600; color: ${VIGI_COLORS[niveau] === '#F5E800' ? '#D4B106' : VIGI_COLORS[niveau]}">
                    ${VIGI_LABELS[niveau]}
                </div>
            </div>
        `);

        if (niveau >= 3) {
            let className = 'vigi-label';
            if (niveau === 3) className += ' label-orange';
            if (niveau === 4) className += ' label-rouge';

            layer.bindTooltip(props.lbentcru, {
                permanent: true, // Re-enable permanent but with transparent style
                direction: 'top',
                className: className,
                offset: [0, -10]
            });
        }

        layer.on({
            mouseover: (e) => { e.target.setStyle({ weight: 12 }); },
            mouseout: (e) => { e.target.setStyle(getFeatureStyle(feature)); }
        });
    };

    return (
        <div className="crues-container">
            <header className="crues-header">
                <div className="title-row">
                    <div className="icon-badge">
                        <Waves size={20} className="waves-icon" />
                    </div>
                    <h1>Vigilance Crues France</h1>
                </div>
            </header>

            {/* KPI Stats */}
            <div className="stats-grid">
                <div className="stat-card success">
                    <div className="stat-value">{stats.vert}</div>
                    <div className="stat-label">Vert</div>
                </div>

                <div className="stat-card warning">
                    <div className="stat-value">{stats.jaune}</div>
                    <div className="stat-label">Jaune</div>
                </div>

                <div className="stat-card orange-card">
                    <div className="stat-value">{stats.orange}</div>
                    <div className="stat-label">Orange</div>
                </div>

                <div className="stat-card danger">
                    <div className="stat-value">{stats.rouge}</div>
                    <div className="stat-label">Rouge</div>
                </div>
            </div>

            <div className="dashboard-grid-new">
                <div className="map-section">
                    <div className="map-header">
                        <h2>Carte des Cours d'eau</h2>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                className="reset-btn"
                                onClick={() => setMapStyle(prev => prev === 'osm' ? 'light' : 'osm')}
                                title="Changer le fond de carte"
                            >
                                <Layers size={14} style={{ marginRight: 4 }} />
                                {mapStyle === 'osm' ? 'Fond Blanc' : 'Fond Routier'}
                            </button>

                            <button
                                className="reset-btn"
                                onClick={() => {
                                    setMapCenter([46.4, 2.2]);
                                    setMapZoom(5.7);
                                }}
                            >
                                <Minimize2 size={14} style={{ marginRight: 4 }} />
                                Vue générale
                            </button>
                        </div>
                    </div>

                    <div className="map-container">
                        {loading ? (
                            <div className="map-loader">
                                <Loader className="spin" size={32} />
                            </div>
                        ) : error ? (
                            <div className="map-error">
                                <AlertTriangle size={32} />
                                <p>{error}</p>
                            </div>
                        ) : (
                            <MapContainer
                                center={mapCenter}
                                zoom={mapZoom}
                                zoomSnap={0.1}
                                zoomDelta={0.1}
                                style={{ height: '100%', width: '100%' }}
                                zoomControl={true}
                            >
                                <MapController center={mapCenter} zoom={mapZoom} />

                                {mapStyle === 'osm' ? (
                                    <TileLayer
                                        attribution='&copy; OpenStreetMap France'
                                        url="https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png"
                                    />
                                ) : (
                                    <>
                                        {/* Fond Gris sans étiquettes */}
                                        <TileLayer
                                            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                                            url={CARTO_TILES.LIGHT_NOLABELS}
                                        />
                                        {/* Contours Départements (uniquement en mode light) */}
                                        {/* Department borders removed as per user request */}
                                    </>
                                )}

                                {geoData && (
                                    <GeoJSON
                                        data={geoData}
                                        style={getFeatureStyle}
                                        onEachFeature={onEachFeature}
                                    />
                                )}
                            </MapContainer>
                        )}
                    </div>
                </div>

                <RegionList
                    regions={regions}
                    onTronconClick={() => { }}
                />
            </div>
        </div>
    );
};

export default CruesDashboard;
