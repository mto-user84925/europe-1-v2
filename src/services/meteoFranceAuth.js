/**
 * Service d'authentification OAuth pour Météo France
 * Gère le renouvellement automatique du token toutes les heures
 */

const OAUTH_URL = '/mf-token';
const TOKEN_DURATION = 3600; // 1 heure en secondes

class MeteoFranceAuth {
    constructor() {
        this.currentToken = null;
        this.tokenExpiry = null;
        this.refreshTimer = null;
        this.consumerKey = 'Mhar9YSs8LEluq4neXqP0YeHaaka';
        this.consumerSecret = 'nDKPWzVr2_2o5Ej1aPZa7O6hu4Ia';
    }

    /**
     * Initialiser avec les credentials
     */
    initialize(consumerKey, consumerSecret) {
        if (consumerKey) this.consumerKey = consumerKey;
        if (consumerSecret) this.consumerSecret = consumerSecret;
        console.log('[MeteoAuth] 🔑 Credentials configurés');
    }

    /**
     * Obtenir un token valide (génère ou utilise le cache mémoire/localStorage)
     */
    async getValidToken() {
        // 1. Vérifier dans localStorage si pas en mémoire
        if (!this.currentToken && typeof window !== 'undefined') {
            try {
                const storedToken = localStorage.getItem('mf_access_token');
                const storedExpiry = parseInt(localStorage.getItem('mf_token_expiry'), 10);
                if (storedToken && storedExpiry && Date.now() < (storedExpiry - 300000)) {
                    this.currentToken = storedToken;
                    this.tokenExpiry = storedExpiry;
                    return this.currentToken;
                }
            } catch (e) {}
        }

        // 2. Si token déjà généré et valide en mémoire (> 5 minutes restantes)
        if (this.currentToken && this.tokenExpiry && Date.now() < (this.tokenExpiry - 300000)) {
            return this.currentToken;
        }

        // 3. Générer un nouveau token d'accès OAuth frais
        return await this.generateToken();
    }

    /**
     * Générer un nouveau token OAuth
     */
    async generateToken() {
        try {
            // 1. Essayer la fonction serverless Vercel /api/mf-token (sans risque de popup Basic Auth)
            try {
                const apiResp = await fetch('/api/mf-token', { method: 'POST' });
                if (apiResp.ok) {
                    const apiData = await apiResp.json();
                    if (apiData.access_token) {
                        this.currentToken = apiData.access_token;
                        this.tokenExpiry = Date.now() + (apiData.expires_in * 1000);
                        try {
                            localStorage.setItem('mf_access_token', this.currentToken);
                            localStorage.setItem('mf_token_expiry', String(this.tokenExpiry));
                        } catch (e) {}
                        this.scheduleRefresh(apiData.expires_in - 300);
                        return this.currentToken;
                    }
                }
            } catch (e) {
                console.warn('[MeteoAuth] /api/mf-token non disponible, fallback direct');
            }

            // 2. Fallback direct avec credentials
            const key = this.consumerKey || 'Mhar9YSs8LEluq4neXqP0YeHaaka';
            const sec = this.consumerSecret || 'nDKPWzVr2_2o5Ej1aPZa7O6hu4Ia';
            const credentials = btoa(`${key}:${sec}`);

            const response = await fetch('/mf-token', {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: 'grant_type=client_credentials'
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OAuth failed: ${response.status} - ${errorText}`);
            }

            const data = await response.json();

            this.currentToken = data.access_token;
            this.tokenExpiry = Date.now() + (data.expires_in * 1000);

            const expiryDate = new Date(this.tokenExpiry);
            console.log(`[MeteoAuth] ✅ Nouveau token généré`);
            console.log(`[MeteoAuth] ⏰ Expire à: ${expiryDate.toLocaleTimeString('fr-FR')}`);

            this.scheduleRefresh(data.expires_in - 300);
            return this.currentToken;

        } catch (error) {
            console.error('[MeteoAuth] ❌ Erreur génération token:', error);
            throw error;
        }
    }

    /**
     * Programmer le renouvellement automatique du token
     */
    scheduleRefresh(delaySeconds) {
        // Annuler le timer précédent
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }

        const delayMs = delaySeconds * 1000;
        const refreshDate = new Date(Date.now() + delayMs);

        console.log(`[MeteoAuth] ⏱️ Renouvellement programmé à: ${refreshDate.toLocaleTimeString('fr-FR')}`);

        this.refreshTimer = setTimeout(async () => {
            console.log('[MeteoAuth] 🔄 Renouvellement automatique du token...');
            try {
                await this.generateToken();
            } catch (error) {
                console.error('[MeteoAuth] ❌ Erreur renouvellement auto:', error);
                // Réessayer dans 1 minute
                this.scheduleRefresh(60);
            }
        }, delayMs);
    }

    /**
     * Forcer le renouvellement du token
     */
    async forceRefresh() {
        console.log('[MeteoAuth] 🔄 Renouvellement forcé du token...');
        this.currentToken = null;
        this.tokenExpiry = null;
        return await this.generateToken();
    }

    /**
     * Arrêter le renouvellement automatique
     */
    stopAutoRefresh() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
            console.log('[MeteoAuth] ⏸️ Renouvellement automatique arrêté');
        }
    }

    /**
     * Obtenir les informations du token actuel
     */
    getTokenInfo() {
        if (!this.currentToken) {
            return { valid: false, message: 'Aucun token' };
        }

        const now = Date.now();
        const isValid = this.tokenExpiry && now < this.tokenExpiry;
        const remainingMs = this.tokenExpiry ? this.tokenExpiry - now : 0;
        const remainingMinutes = Math.floor(remainingMs / 60000);

        return {
            valid: isValid,
            expiresAt: this.tokenExpiry ? new Date(this.tokenExpiry) : null,
            remainingMinutes: remainingMinutes,
            token: this.currentToken.substring(0, 20) + '...' // Aperçu
        };
    }
}

// Instance singleton
export const meteoAuth = new MeteoFranceAuth();

export default meteoAuth;
