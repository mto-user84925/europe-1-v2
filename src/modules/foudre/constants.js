import { CARTO_TILES } from '../../constants/carto';

// Constantes partagées pour le module Foudre

/**
 * Palette de couleurs chronologiques pour les impacts de foudre (24h)
 * Gradient du bleu (nuit) au rouge (soir) en passant par le vert et le jaune
 */
export const HOUR_COLORS = [
    "#0000FF", "#0022FF", "#0044FF", "#0066FF", "#0088FF", "#00AAFF", // 0h-5h (Bleus)
    "#00CCFF", "#00EEFF", "#00FFDD", "#00FFBB", "#00FF99", "#00FF77", // 6h-11h (Cyans/Verts)
    "#00FF00", "#77FF00", "#BBFF00", "#FFFF00", "#FFCC00", "#FFAA00", // 12h-17h (Vert/Jaune/Orange)
    "#FF8800", "#FF6600", "#FF4400", "#FF2200", "#FF0000", "#8B0000"  // 18h-23h (Rouge/Brun)
];

/**
 * Retourne la couleur associée à une heure donnée
 * @param {number} hour - Heure (0-23)
 * @returns {string} Code couleur hexadécimal
 */
export const getHourColor = (hour) => HOUR_COLORS[hour] || "#ff0000";

/**
 * Palettes de couleurs pour les cartes
 */
export const MAP_PALETTES = {
    default: {
        name: "Classique",
        fill: "#f1f5f9",
        stroke: "#cbd5e1",
        bg: "#ffffff",
        tiles: CARTO_TILES.LIGHT_NOLABELS
    },
    dark: {
        name: "Sombre Expert",
        fill: "#1e293b",
        stroke: "#475569",
        bg: "#0f172a",
        tiles: CARTO_TILES.DARK_NOLABELS
    },
    blue: {
        name: "Océan",
        fill: "#dbeafe",
        stroke: "#3b82f6",
        bg: "#f0f9ff",
        tiles: CARTO_TILES.LIGHT_NOLABELS
    },
    night: {
        name: "Nuit Noire",
        fill: "#020617",
        stroke: "#1e293b",
        bg: "#000000",
        tiles: CARTO_TILES.DARK_NOLABELS
    }
};

/**
 * Rayons de recherche par défaut pour l'analyse de proximité (en km)
 */
export const DEFAULT_RADII = [1, 3, 5, 10, 15, 20];

/**
 * Intervalle de rafraîchissement en mode LIVE (en ms)
 */
export const LIVE_REFRESH_INTERVAL = 60000; // 1 minute

/**
 * Seuil de temps pour considérer un impact comme "récent" (en minutes)
 */
export const RECENT_STRIKE_THRESHOLD = 15;
