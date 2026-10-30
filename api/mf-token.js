/**
 * Proxy OAuth Météo-France.
 *
 * Utilise les identifiants OAuth Météo-France (consumer key / secret)
 * ou bascule automatiquement et de manière résiliente sur le jeton API
 * officiel permanent en cas d'indisponibilité du portail.
 */

let cachedToken = null;
let cachedExpiry = 0;
let inFlight = null;

const PERMANENT_DPCLIM_TOKEN = process.env.DPCLIM_TOKEN || process.env.MF_DPCLIM_API_KEY || "eyJ4NXQiOiJZV0kxTTJZNE1qWTNOemsyTkRZeU5XTTRPV014TXpjek1UVmhNbU14T1RSa09ETXlOVEE0Tnc9PSIsImtpZCI6ImdhdGV3YXlfY2VydGlmaWNhdGVfYWxpYXMiLCJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJHcmVnNTk4ODBAY2FyYm9uLnN1cGVyIiwiYXBwbGljYXRpb24iOnsib3duZXIiOiJHcmVnNTk4ODAiLCJ0aWVyUXVvdGFUeXBlIjpudWxsLCJ0aWVyIjoiVW5saW1pdGVkIiwibmFtZSI6IkRlZmF1bHRBcHBsaWNhdGlvbiIsImlkIjoyMzg0MCwidXVpZCI6IjA3YTRhZjk0LWE4MzktNDllZC05MjJlLTAyZDMyMTM1ZjVlZSJ9LCJpc3MiOiJodHRwczpcL1wvcG9ydGFpbC1hcGkubWV0ZW9mcmFuY2UuZnI6NDQzXC9vYXV0aDJcL3Rva2VuIiwidGllckluZm8iOnsiNTBQZXJNaW4iOnsidGllclF1b3RhVHlwZSI6InJlcXVlc3RDb3VudCIsImdyYXBoUUxNYXhDb21wbGV4aXR5IjowLCJncmFwaFFMTWF4RGVwdGgiOjAsInN0b3BPblF1b3RhUmVhY2giOnRydWUsInNwaWtlQXJyZXN0TGltaXQiOjAsInNwaWtlQXJyZXN0VW5pdCI6InNlYyJ9LCI2MFJlcVBhck1pbiI6eyJ0aWVyUXVvdGFUeXBlIjoicmVxdWVzdENvdW50IiwiZ3JhcGhRTE1heENvbXBsZXhpdHkiOjAsImdyYXBoUUxNYXhEZXB0aCI6MCwic3RvcE9uUXVvdGFSZWFjaCI6dHJ1ZSwic3Bpa2VBcnJlc3RMaW1pdCI6MCwic3Bpa2VBcnJlc3RVbml0Ijoic2VjIn19LCJrZXl0eXBlIjoiUFJPRFVDVElPTiIsInN1YnNjcmliZWRBUElzIjpbeyJzdWJzY3JpYmVyVGVuYW50RG9tYWluIjoiY2FyYm9uLnN1cGVyIiwibmFtZSI6IkFST01FIiwiY29udGV4dCI6IlwvcHVibGljXC9hcm9tZVwvMS4wIiwicHVibGlzaGVyIjoiYWRtaW5fbWYiLCJ2ZXJzaW9uIjoiMS4wIiwic3Vic2NyaXB0aW9uVGllciI6IjUwUGVyTWluIn0seyJzdWJzY3JpYmVyVGVuYW50RG9tYWluIjoiY2FyYm9uLnN1cGVyIiwibmFtZSI6IkRvbm5lZXNQdWJsaXF1ZXNWaWdpbGFuY2UiLCJjb250ZXh0IjoiXC9wdWJsaWNcL0RQVmlnaWxhbmNlXC92MSIsInB1Ymxpc2hlciI6ImFkbWluIiwidmVyc2lvbiI6InYxIiwic3Vic2NyaXB0aW9uVGllciI6IjYwUmVxUGFyTWluIn0seyJzdWJzY3JpYmVyVGVuYW50RG9tYWluIjoiY2FyYm9uLnN1cGVyIiwibmFtZSI6IkRvbm5lZXNQdWJsaXF1ZXNPYnNlcnZhdGlvbiIsImNvbnRleHQiOiJcL3B1YmxpY1wvRFBPYnNcL3YyIiwicHVibGlzaGVyIjoiYmFzdGllbmciLCJ2ZXJzaW9uIjoidjIiLCJzdWJzY3JpcHRpb25UaWVyIjoiNTBQZXJNaW4ifSx7InN1YnNjcmliZXJUZW5hbnREb21haW4iOiJjYXJib24uc3VwZXIiLCJuYW1lIjoiRG9ubmVlc1B1YmxpcXVlc1BhcXVldFJhZGFyIiwiY29udGV4dCI6IlwvcHVibGljXC9EUFBhcXVldFJhZGFyXC92MSIsInB1Ymxpc2hlciI6ImxvaWMubWFydGluIiwidmVyc2lvbiI6InYxIiwic3Vic2NyaXB0aW9uVGllciI6IjUwUGVyTWluIn0seyJzdWJzY3JpYmVyVGVuYW50RG9tYWluIjoiY2FyYm9uLnN1cGVyIiwibmFtZSI6IkRvbm5lZXNQdWJsaXF1ZXNQYXF1ZXRPYnNlcnZhdGlvbiIsImNvbnRleHQiOiJcL3B1YmxpY1wvRFBQYXF1ZXRPYnNcL3YxIiwicHVibGlzaGVyIjoiYmFzdGllbmciLCJ2ZXJzaW9uIjoidjEiLCJzdWJzY3JpcHRpb25UaWVyIjoiNTBQZXJNaW4ifSx7InN1YnNjcmliZXJUZW5hbnREb21haW4iOiJjYXJib24uc3VwZXIiLCJuYW1lIjoiRG9ubmVlc1B1YmxpcXVlc09ic2VydmF0aW9uIiwiY29udGV4dCI6IlwvcHVibGljXC9EUE9ic1wvdjEiLCJwdWJsaXNoZXIiOiJiYXN0aWVuZyIsInZlcnNpb24iOiJ2MSIsInN1YnNjcmlwdGlvblRpZXIiOiI1MFBlck1pbiJ9LHsic3Vic2NyaWJlclRlbmFudERvbWFpbiI6ImNhcmJvbi5zdXBlciIsIm5hbWUiOiJEb25uZWVzUHVibGlxdWVzQ2xpbWF0b2xvZ2llIiwiY29udGV4dCI6IlwvcHVibGljXC9EUENsaW1cL3YxIiwicHVibGlzaGVyIjoiYWRtaW5fbWYiLCJ2ZXJzaW9uIjoidjEiLCJzdWJzY3JpcHRpb25UaWVyIjoiNTBQZXJNaW4ifSx7InN1YnNjcmliZXJUZW5hbnREb21haW4iOiJjYXJib24uc3VwZXIiLCJuYW1lIjoiRG9ubmVlc1B1YmxpcXVlc1BhcXVldE9ic2VydmF0aW9uIiwiY29udGV4dCI6IlwvcHVibGljXC9EUFBhcXVldE9ic1wvdjIiLCJwdWJsaXNoZXIiOiJiYXN0aWVuZyIsInZlcnNpb24iOiJ2MiIsInN1YnNjcmlwdGlvblRpZXIiOiI1MFBlck1pbiJ9LHsic3Vic2NyaWJlclRlbmFudERvbWFpbiI6ImNhcmJvbi5zdXBlciIsIm5hbWUiOiJEb25uZWVzUHVibGlxdWVzTWV0ZW9Gb3JldHMiLCJjb250ZXh0IjoiXC9wdWJsaWNcL0RQTWV0ZW9Gb3JldHNcL3YxIiwicHVibGlzaGVyIjoibXVyaWVsLmF1YmluIiwidmVyc2lvbiI6InYxIiwic3Vic2NyaXB0aW9uVGllciI6IjUwUGVyTWluIn1dLCJleHAiOjE4MTYwODg5ODAsInRva2VuX3R5cGUiOiJhcGlLZXkiLCJpYXQiOjE3ODc1NzY5ODAsImp0aSI6ImVlOGIyOWU2LTMwOGMtNDk3My05MmMwLWRiZDliZTZhMjdmNyJ9.Dks7MvNXViqUCkZe25rhLNi7wPMTYANHKegyTi1qgiT0PViDjQuJNhNyjkJxDnjHdTrm4Mk9sYZdpMfDYZuYbeV8JWkJj_sGixmZEPO0vyAGqLyq_DOibJvo1_wrMLqS4qFiiOiM6zTmrZiwZz-KBD2Lf_BoVzEV2ve0jHZX9T4F6A3frG9HtrCllVxIONB7nEKpXVsw1bbfbCxvkqPhy_4HUCwQgex4lN58e6TiRI8iRMMYGl_f7jWbCSfAJoE0pHOrQi07BA-mTPD0Lk29i0-YcgrASiehU1vpSQEimBMXCeLdtPNIjr9J_d0KyMcn8rNTu39IJ9pbJ6CTpaoP4Q==";

const send = (res, status, payload) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(status).json(payload);
};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Cache : un token dure ~1h, marge 5 min
    if (cachedToken && Date.now() < cachedExpiry - 300000) {
        return send(res, 200, { access_token: cachedToken, expires_in: Math.floor((cachedExpiry - Date.now()) / 1000), cached: true });
    }

    if (inFlight) {
        try {
            const data = await inFlight;
            return send(res, 200, data);
        } catch (e) {
            return send(res, 200, { access_token: PERMANENT_DPCLIM_TOKEN, expires_in: 31536000, fallback: true });
        }
    }

    const consumerKey = process.env.MF_CONSUMER_KEY || process.env.VITE_METEO_CONSUMER_KEY;
    const consumerSecret = process.env.MF_CONSUMER_SECRET || process.env.VITE_METEO_CONSUMER_SECRET;

    // Si pas de clés OAuth, servir directement le token permanent officiel
    if (!consumerKey || !consumerSecret) {
        cachedToken = PERMANENT_DPCLIM_TOKEN;
        cachedExpiry = Date.now() + 3600000 * 24;
        return send(res, 200, { access_token: cachedToken, expires_in: 86400, permanent: true });
    }

    inFlight = (async () => {
        try {
            const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
            const response = await fetch('https://portail-api.meteofrance.fr/token', {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: 'grant_type=client_credentials'
            });

            if (!response.ok) {
                const errText = await response.text();
                console.warn('[API mf-token] OAuth rejeté (' + response.status + '), bascule sur token permanent:', errText);
                return { access_token: PERMANENT_DPCLIM_TOKEN, expires_in: 31536000, fallback: true };
            }

            const data = await response.json();
            if (!data?.access_token) {
                return { access_token: PERMANENT_DPCLIM_TOKEN, expires_in: 31536000, fallback: true };
            }

            cachedToken = data.access_token;
            cachedExpiry = Date.now() + (data.expires_in || 3600) * 1000;
            return { access_token: cachedToken, expires_in: data.expires_in || 3600 };
        } catch (err) {
            console.warn('[API mf-token] Erreur OAuth, bascule sur token permanent:', err.message);
            return { access_token: PERMANENT_DPCLIM_TOKEN, expires_in: 31536000, fallback: true };
        }
    })();

    try {
        const data = await inFlight;
        return send(res, 200, data);
    } catch (error) {
        return send(res, 200, { access_token: PERMANENT_DPCLIM_TOKEN, expires_in: 31536000, fallback: true });
    } finally {
        inFlight = null;
    }
}
