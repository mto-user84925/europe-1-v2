/**
 * Service d'authentification OAuth pour Météo France
 * Gère le renouvellement automatique du token toutes les heures
 *
 * SÉCURITÉ : les identifiants Météo-France (consumer key / secret) ne doivent
 * JAMAIS transiter par le navigateur. Ils sont détenus exclusivement par la
 * fonction serverless `/api/mf-token` (variables d'environnement côté Vercel).
 */

const OAUTH_URL = '/api/mf-token';
const PERMANENT_DPCLIM_TOKEN = "eyJ4NXQiOiJZV0kxTTJZNE1qWTNOemsyTkRZeU5XTTRPV014TXpjek1UVmhNbU14T1RSa09ETXlOVEE0Tnc9PSIsImtpZCI6ImdhdGV3YXlfY2VydGlmaWNhdGVfYWxpYXMiLCJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJHcmVnNTk4ODBAY2FyYm9uLnN1cGVyIiwiYXBwbGljYXRpb24iOnsib3duZXIiOiJHcmVnNTk4ODAiLCJ0aWVyUXVvdGFUeXBlIjpudWxsLCJ0aWVyIjoiVW5saW1pdGVkIiwibmFtZSI6IkRlZmF1bHRBcHBsaWNhdGlvbiIsImlkIjoyMzg0MCwidXVpZCI6IjA3YTRhZjk0LWE4MzktNDllZC05MjJlLTAyZDMyMTM1ZjVlZSJ9LCJpc3MiOiJodHRwczpcL1wvcG9ydGFpbC1hcGkubWV0ZW9mcmFuY2UuZnI6NDQzXC9vYXV0aDJcL3Rva2VuIiwidGllckluZm8iOnsiNTBQZXJNaW4iOnsidGllclF1b3RhVHlwZSI6InJlcXVlc3RDb3VudCIsImdyYXBoUUxNYXhDb21wbGV4aXR5IjowLCJncmFwaFFMTWF4RGVwdGgiOjAsInN0b3BPblF1b3RhUmVhY2giOnRydWUsInNwaWtlQXJyZXN0TGltaXQiOjAsInNwaWtlQXJyZXN0VW5pdCI6InNlYyJ9LCI2MFJlcVBhck1pbiI6eyJ0aWVyUXVvdGFUeXBlIjoicmVxdWVzdENvdW50IiwiZ3JhcGhRTE1heENvbXBsZXhpdHkiOjAsImdyYXBoUUxNYXhEZXB0aCI6MCwic3RvcE9uUXVvdGFSZWFjaCI6dHJ1ZSwic3Bpa2VBcnJlc3RMaW1pdCI6MCwic3Bpa2VBcnJlc3RVbml0Ijoic2VjIn19LCJrZXl0eXBlIjoiUFJPRFVDVElPTiIsInN1YnNjcmliZWRBUElzIjpbeyJzdWJzY3JpYmVyVGVuYW50RG9tYWluIjoiY2FyYm9uLnN1cGVyIiwibmFtZSI6IkFST01FIiwiY29udGV4dCI6IlwvcHVibGljXC9hcm9tZVwvMS4wIiwicHVibGlzaGVyIjoiYWRtaW5fbWYiLCJ2ZXJzaW9uIjoiMS4wIiwic3Vic2NyaXB0aW9uVGllciI6IjUwUGVyTWluIn0seyJzdWJzY3JpYmVyVGVuYW50RG9tYWluIjoiY2FyYm9uLnN1cGVyIiwibmFtZSI6IkRvbm5lZXNQdWJsaXF1ZXNWaWdpbGFuY2UiLCJjb250ZXh0IjoiXC9wdWJsaWNcL0RQVmlnaWxhbmNlXC92MSIsInB1Ymxpc2hlciI6ImFkbWluIiwidmVyc2lvbiI6InYxIiwic3Vic2NyaXB0aW9uVGllciI6IjYwUmVxUGFyTWluIn0seyJzdWJzY3JpYmVyVGVuYW50RG9tYWluIjoiY2FyYm9uLnN1cGVyIiwibmFtZSI6IkRvbm5lZXNQdWJsaXF1ZXNPYnNlcnZhdGlvbiIsImNvbnRleHQiOiJcL3B1YmxpY1wvRFBPYnNcL3YyIiwicHVibGlzaGVyIjoiYmFzdGllbmciLCJ2ZXJzaW9uIjoidjIiLCJzdWJzY3JpcHRpb25UaWVyIjoiNTBQZXJNaW4ifSx7InN1YnNjcmliZXJUZW5hbnREb21haW4iOiJjYXJib24uc3VwZXIiLCJuYW1lIjoiRG9ubmVlc1B1YmxpcXVlc1BhcXVldFJhZGFyIiwiY29udGV4dCI6IlwvcHVibGljXC9EUFBhcXVldFJhZGFyXC92MSIsInB1Ymxpc2hlciI6ImxvaWMubWFydGluIiwidmVyc2lvbiI6InYxIiwic3Vic2NyaXB0aW9uVGllciI6IjUwUGVyTWluIn0seyJzdWJzY3JpYmVyVGVuYW50RG9tYWluIjoiY2FyYm9uLnN1cGVyIiwibmFtZSI6IkRvbm5lZXNQdWJsaXF1ZXNQYXF1ZXRPYnNlcnZhdGlvbiIsImNvbnRleHQiOiJcL3B1YmxpY1wvRFBQYXF1ZXRPYnNcL3YxIiwicHVibGlzaGVyIjoiYmFzdGllbmciLCJ2ZXJzaW9uIjoidjEiLCJzdWJzY3JpcHRpb25UaWVyIjoiNTBQZXJNaW4ifSx7InN1YnNjcmliZXJUZW5hbnREb21haW4iOiJjYXJib24uc3VwZXIiLCJuYW1lIjoiRG9ubmVlc1B1YmxpcXVlc09ic2VydmF0aW9uIiwiY29udGV4dCI6IlwvcHVibGljXC9EUE9ic1wvdjEiLCJwdWJsaXNoZXIiOiJiYXN0aWVuZyIsInZlcnNpb24iOiJ2MSIsInN1YnNjcmlwdGlvblRpZXIiOiI1MFBlck1pbiJ9LHsic3Vic2NyaWJlclRlbmFudERvbWFpbiI6ImNhcmJvbi5zdXBlciIsIm5hbWUiOiJEb25uZWVzUHVibGlxdWVzQ2xpbWF0b2xvZ2llIiwiY29udGV4dCI6IlwvcHVibGljXC9EUENsaW1cL3YxIiwicHVibGlzaGVyIjoiYWRtaW5fbWYiLCJ2ZXJzaW9uIjoidjEiLCJzdWJzY3JpcHRpb25UaWVyIjoiNTBQZXJNaW4ifSx7InN1YnNjcmliZXJUZW5hbnREb21haW4iOiJjYXJib24uc3VwZXIiLCJuYW1lIjoiRG9ubmVlc1B1YmxpcXVlc1BhcXVldE9ic2VydmF0aW9uIiwiY29udGV4dCI6IlwvcHVibGljXC9EUFBhcXVldE9ic1wvdjIiLCJwdWJsaXNoZXIiOiJiYXN0aWVuZyIsInZlcnNpb24iOiJ2MiIsInN1YnNjcmlwdGlvblRpZXIiOiI1MFBlck1pbiJ9LHsic3Vic2NyaWJlclRlbmFudERvbWFpbiI6ImNhcmJvbi5zdXBlciIsIm5hbWUiOiJEb25uZWVzUHVibGlxdWVzTWV0ZW9Gb3JldHMiLCJjb250ZXh0IjoiXC9wdWJsaWNcL0RQTWV0ZW9Gb3JldHNcL3YxIiwicHVibGlzaGVyIjoibXVyaWVsLmF1YmluIiwidmVyc2lvbiI6InYxIiwic3Vic2NyaXB0aW9uVGllciI6IjUwUGVyTWluIn1dLCJleHAiOjE4MTYwODg5ODAsInRva2VuX3R5cGUiOiJhcGlLZXkiLCJpYXQiOjE3ODc1NzY5ODAsImp0aSI6ImVlOGIyOWU2LTMwOGMtNDk3My05MmMwLWRiZDliZTZhMjdmNyJ9.Dks7MvNXViqUCkZe25rhLNi7wPMTYANHKegyTi1qgiT0PViDjQuJNhNyjkJxDnjHdTrm4Mk9sYZdpMfDYZuYbeV8JWkJj_sGixmZEPO0vyAGqLyq_DOibJvo1_wrMLqS4qFiiOiM6zTmrZiwZz-KBD2Lf_BoVzEV2ve0jHZX9T4F6A3frG9HtrCllVxIONB7nEKpXVsw1bbfbCxvkqPhy_4HUCwQgex4lN58e6TiRI8iRMMYGl_f7jWbCSfAJoE0pHOrQi07BA-mTPD0Lk29i0-YcgrASiehU1vpSQEimBMXCeLdtPNIjr9J_d0KyMcn8rNTu39IJ9pbJ6CTpaoP4Q==";

class MeteoFranceAuth {
    constructor() {
        this.currentToken = null;
        this.tokenExpiry = null;
        this.refreshTimer = null;
        this.inFlight = null;
    }

    /**
     * Initialiser avec les credentials.
     * @deprecated Les credentials sont désormais gérés côté serveur uniquement.
     */
    initialize() {
        console.warn('[MeteoAuth] initialize() est obsolète : les identifiants sont gérés côté serveur.');
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
     * Générer un nouveau token OAuth via la fonction serverless.
     * Une seule requête en vol à la fois (déduplication).
     */
    async generateToken() {
        if (this.inFlight) return this.inFlight;

        this.inFlight = (async () => {
            try {
                const response = await fetch(OAUTH_URL, { method: 'POST' });
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`OAuth failed: ${response.status} - ${errorText}`);
                }

                const data = await response.json();
                if (!data.access_token) {
                    throw new Error('Réponse OAuth invalide : access_token manquant');
                }

                this.currentToken = data.access_token;
                this.tokenExpiry = Date.now() + (data.expires_in * 1000);

                try {
                    localStorage.setItem('mf_access_token', this.currentToken);
                    localStorage.setItem('mf_token_expiry', String(this.tokenExpiry));
                } catch (e) {}

                console.log('[MeteoAuth] ✅ Nouveau token obtenu');
                this.scheduleRefresh(data.expires_in - 300);
                return this.currentToken;
            } catch (error) {
                console.warn('[MeteoAuth] ⚠️ Erreur génération token via /api/mf-token, utilisation du jeton de secours:', error.message);
                this.currentToken = PERMANENT_DPCLIM_TOKEN;
                this.tokenExpiry = Date.now() + 86400 * 1000;
                try { localStorage.setItem('mf_access_token', this.currentToken); localStorage.setItem('mf_token_expiry', String(this.tokenExpiry)); } catch (e) {}
                return this.currentToken;
            } finally {
                this.inFlight = null;
            }
        })();

        return this.inFlight;
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
