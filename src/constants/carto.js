// ponytail: Clé d'API CARTO Basemaps requise depuis fin août 2026 pour supprimer le watermark
export const CARTO_KEY = import.meta.env.VITE_CARTO_KEY || 'cb1_41pe_1_f2e58b13e617a48e7edd32f6';

export const CARTO_TILES = {
    DARK_NOLABELS: `https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`,
    DARK_ONLY_LABELS: `https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`,
    DARK_ALL: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`,
    LIGHT_NOLABELS: `https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`,
    LIGHT_ONLY_LABELS: `https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`,
    LIGHT_ALL: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`,
};
