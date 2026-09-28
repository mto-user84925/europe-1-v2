import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Upload, Trash2, Zap, AlertTriangle } from 'lucide-react';
import { CARTO_TILES } from '../../constants/carto';

// Dynamically load proj4js for Lambert 93 projection
const loadProj4 = () => {
    return new Promise((resolve, reject) => {
        if (window.proj4) {
            resolve(window.proj4);
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.15.0/proj4.js';
        script.onload = () => {
            // Define Lambert 93
            window.proj4.defs("EPSG:2154", "+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
            resolve(window.proj4);
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
};

function MapController({ center, zoom }) {
    const map = useMap();
    useEffect(() => {
        if (center) map.flyTo(center, zoom);
    }, [center, zoom, map]);
    return null;
}

const FoudreImportMap = () => {
    const [strikes, setStrikes] = undefined ? useState([]) : useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [proj4Loaded, setProj4Loaded] = useState(false);
    const [filesLoaded, setFilesLoaded] = useState([]);
    const [mapCenter, setMapCenter] = useState([46.603354, 1.888334]);
    const [mapZoom, setMapZoom] = useState(6);

    useEffect(() => {
        loadProj4().then(() => setProj4Loaded(true)).catch(() => setError("Erreur de chargement de Proj4js. Les conversions Lambert pourraient échouer."));
    }, []);

    const handleFileUpload = async (event) => {
        const files = Array.from(event.target.files);
        if (!files.length) return;

        setLoading(true);
        setError(null);

        const newStrikes = [];
        const newFileNames = [];

        for (const file of files) {
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                newFileNames.push(file.name);

                // Validation simple et extraction des coordonnées
                if (Array.isArray(data)) {
                    data.forEach(item => {
                        let lat, lon;
                        let isLambert = false;

                        // Try to find Lambert coordinates (usually X, Y or large lat/lon values)
                        if (item.x && item.y) {
                            lat = parseFloat(item.y);
                            lon = parseFloat(item.x);
                            isLambert = true;
                        } else if (item.lat && item.lon) {
                            lat = parseFloat(item.lat);
                            lon = parseFloat(item.lon);
                            // Simple heuristic: if lat/lon are huge numbers, they are likely Lambert
                            if (lat > 1000 || lon > 1000 || lon < -1000) {
                                isLambert = true;
                                // sometimes they might be swapped depending on the file format
                                // Standard Lambert 93: X ~ 100,000 to 1,200,000 | Y ~ 6,000,000 to 7,200,000
                                if (lon > lat) {
                                    const temp = lat;
                                    lat = lon;
                                    lon = temp;
                                }
                            }
                        }

                        if (!isNaN(lat) && !isNaN(lon)) {
                            if (isLambert && window.proj4) {
                                // Convert Lambert 93 to WGS84
                                // Note: proj4 expects [x, y], returns [lon, lat]
                                try {
                                    // Make sure lon is X and lat is Y
                                    const x = lon > 10000 ? lon : lat; // X usually smaller than Y in Lambert 93
                                    const y = lon > 10000 ? lat : lon; 
                                    const wgs84 = window.proj4("EPSG:2154", "EPSG:4326", [lon, lat]); // Assuming [X, Y]
                                    lon = wgs84[0];
                                    lat = wgs84[1];
                                } catch (e) {
                                    console.warn("Lambert conversion failed for", item, e);
                                    return; // Skip this point if conversion fails
                                }
                            }

                            // Keep valid WGS84 coordinates inside/around France roughly
                            if (lat > 40 && lat < 52 && lon > -6 && lon < 10) {
                                newStrikes.push({
                                    lat,
                                    lon,
                                    date: item.date || item.Date || 'Inconnue',
                                    heure: item.heure || item.Heure || item.Time || '',
                                    original: item
                                });
                            }
                        }
                    });
                }
            } catch (err) {
                console.error(`Erreur avec le fichier ${file.name}:`, err);
                setError(`Erreur de lecture du fichier ${file.name}`);
            }
        }

        if (newStrikes.length > 0) {
            setStrikes(prev => [...prev, ...newStrikes]);
            setFilesLoaded(prev => [...prev, ...newFileNames]);
            
            // Recenter map on the first new strike
            setMapCenter([newStrikes[0].lat, newStrikes[0].lon]);
            setMapZoom(7);
        } else if (!error) {
            setError("Aucune coordonnée valide trouvée dans ces fichiers.");
        }

        setLoading(false);
        // Reset the input so the same files can be re-uploaded if needed
        event.target.value = '';
    };

    const handleClear = () => {
        setStrikes([]);
        setFilesLoaded([]);
        setError(null);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', width: '100%', backgroundColor: '#0f172a', color: 'white', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}>
            {/* Header / Controls */}
            <div className="p-4 bg-slate-800 border-b border-slate-700 flex flex-wrap items-center justify-between z-10 shadow-md gap-4">
                <div className="flex items-center gap-2">
                    <Zap className="text-yellow-400" size={24} />
                    <h1 className="text-xl font-bold">Import Impacts Lambert</h1>
                </div>

                <div className="flex items-center gap-4">
                    <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2">
                        <Upload size={18} />
                        Importer JSON
                        <input 
                            type="file" 
                            accept=".json" 
                            multiple 
                            className="hidden" 
                            onChange={handleFileUpload}
                            disabled={!proj4Loaded || loading}
                        />
                    </label>

                    {strikes.length > 0 && (
                        <button 
                            onClick={handleClear}
                            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2"
                        >
                            <Trash2 size={18} className="text-red-400" />
                            Effacer
                        </button>
                    )}
                </div>

                <div className="text-sm text-slate-400 min-w-[200px] text-right">
                    {loading ? (
                        <span className="flex items-center justify-end gap-2 text-yellow-400">
                            <span className="animate-spin">⏳</span> Traitement...
                        </span>
                    ) : (
                        <span>
                            {strikes.length > 0 
                                ? <span className="text-green-400 font-bold">{strikes.length.toLocaleString()} impacts chargés</span>
                                : "En attente de fichiers..."}
                        </span>
                    )}
                </div>
            </div>

            {/* Main Area */}
            <div className="flex-1 relative flex">
                {/* Map Container */}
                <div className="flex-1 relative isolation-isolate">
                    <MapContainer 
                        center={mapCenter} 
                        zoom={mapZoom} 
                        style={{ height: '100%', width: '100%', background: '#0f172a', zIndex: 0 }}
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
                            url={CARTO_TILES.DARK_ALL}
                        />
                        <MapController center={mapCenter} zoom={mapZoom} />

                        {strikes.map((strike, idx) => (
                            <CircleMarker
                                key={idx}
                                center={[strike.lat, strike.lon]}
                                radius={3}
                                pathOptions={{ 
                                    color: '#fbbf24', 
                                    fillColor: '#fbbf24', 
                                    fillOpacity: 0.8, 
                                    weight: 1
                                }}
                            >
                                <Popup>
                                    <div className="text-slate-900 font-sans">
                                        <strong className="text-lg mb-1 block">Impact détecté</strong>
                                        <div className="text-sm">
                                            {strike.date !== 'Inconnue' && <div><strong>Date:</strong> {strike.date}</div>}
                                            {strike.heure && <div><strong>Heure:</strong> {strike.heure}</div>}
                                            <div className="text-slate-500 mt-2 text-xs">
                                                <div>Lat: {strike.lat.toFixed(4)}</div>
                                                <div>Lon: {strike.lon.toFixed(4)}</div>
                                            </div>
                                        </div>
                                    </div>
                                </Popup>
                            </CircleMarker>
                        ))}
                    </MapContainer>

                    {/* Messages Overlay */}
                    <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2 max-w-sm">
                        {error && (
                            <div className="bg-red-500/90 text-white px-4 py-3 rounded-lg shadow-lg border border-red-400 flex items-start gap-3">
                                <AlertTriangle className="shrink-0 mt-0.5" size={20} />
                                <div className="text-sm">{error}</div>
                            </div>
                        )}
                        
                        {filesLoaded.length > 0 && (
                            <div className="bg-slate-800/90 text-slate-200 px-4 py-3 rounded-lg shadow-lg border border-slate-600 backdrop-blur-sm text-sm">
                                <strong className="block mb-1 text-white">Fichiers ({filesLoaded.length}) :</strong>
                                <ul className="max-h-32 overflow-y-auto list-disc pl-4 space-y-1">
                                    {filesLoaded.map((name, i) => (
                                        <li key={i} className="truncate" title={name}>{name}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FoudreImportMap;
