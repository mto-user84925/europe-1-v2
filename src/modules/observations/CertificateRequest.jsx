import React, { useState, useEffect } from 'react';
import { weatherAPI } from '../../services/api';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

import { useLocation } from '../../contexts/LocationContext';

export default function CertificateRequest() {
    const { location } = useLocation();
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        commune: `${location.name} (${location.postcode || ''})`,
        date: '',
        type: '',
        nom: '',
        prenom: ''
    });
    const [weatherData, setWeatherData] = useState(null);

    // Update form when location changes (if not submitted)
    useEffect(() => {
        if (!submitted) {
            setFormData(prev => ({
                ...prev,
                commune: `${location.name} (${location.postcode || ''})`
            }));
        }
    }, [location, submitted]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        // Fetch Real Historical Data
        try {
            // Use API to get data for that specific day
            // getHistoricalData expects startDate, endDate, lat, lon
            const data = await weatherAPI.getHistoricalData(
                formData.date,
                formData.date,
                location.lat,
                location.lon
            );

            if (data && data.length > 0) {
                setWeatherData(data[0]);
                setSubmitted(true);
            } else {
                alert("Impossible de récupérer les données pour cette date via l'archive publique.");
            }
        } catch (error) {
            console.error(error);
            alert("Erreur lors de la récupération des données.");
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    if (submitted && weatherData) {
        return (
            <div className="certificate-preview-container">
                <div className="no-print actions-bar">
                    <button className="btn-secondary" onClick={() => setSubmitted(false)}>Retour</button>
                    <button className="btn-primary" onClick={handlePrint}>Imprimer / Sauvegarder PDF</button>
                </div>

                <div className="certificate-paper" id="certificate-print">
                    <div className="cert-header">
                        <h1>Certificat d'Intempéries</h1>
                        <p className="cert-id">Réf: {Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
                    </div>

                    <div className="cert-body">
                        <p>Je soussigné, système automatisé de relevés météorologiques, certifie que les conditions suivantes ont été observées :</p>

                        <div className="cert-details">
                            <div className="detail-row">
                                <strong>Lieu :</strong> <span>{formData.commune}</span>
                            </div>
                            <div className="detail-row">
                                <strong>Date du sinistre :</strong> <span>{format(new Date(formData.date), 'dd MMMM yyyy', { locale: fr })}</span>
                            </div>
                            <div className="detail-row">
                                <strong>Phénomène déclaré :</strong> <span>{formData.type}</span>
                            </div>
                        </div>

                        <h3>Relevés Officiels (Source: Open-Meteo Archive)</h3>
                        <div className="meteo-record card">
                            <div className="record-item">
                                <span className="label">Température Min</span>
                                <span className="value">{weatherData.min}°C</span>
                            </div>
                            <div className="record-item">
                                <span className="label">Température Max</span>
                                <span className="value">{weatherData.max}°C</span>
                            </div>
                            {/* Note: Archive API might not have wind gusts everywhere, but we try */}
                            <div className="record-item">
                                <span className="label">Précipitations (24h)</span>
                                <span className="value">{weatherData.rain !== undefined ? weatherData.rain : 'N/A'} mm</span>
                            </div>
                            <div className="record-item">
                                <span className="label">Rafales Max</span>
                                <span className="value">{weatherData.gust !== undefined ? weatherData.gust : 'N/A'} km/h</span>
                            </div>
                        </div>

                        <p className="cert-disclaimer">
                            Ce document est généré automatiquement sur la base des données rejouées (Reanalysis) du modèle ERA5 / Open-Meteo.
                            Il peut servir de pièce justificative pour une déclaration d'assurance, sous réserve d'acceptation par l'organisme.
                        </p>

                        <div className="cert-footer">
                            <p>Fait à Douai, le {format(new Date(), 'dd/MM/yyyy')}</p>
                            <p>Pour faire valoir ce que de droit.</p>
                            <div className="signature-box">
                                Signature Numérique
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="certificate-container no-print-container">
            <div className="header-section">
                <h2>Demande de Certificat d'Intempéries</h2>
                <p className="subtitle">Générez gratuitement un relevé officiel pour votre assurance.</p>
            </div>

            <div className="form-wrapper card">
                <form onSubmit={handleSubmit}>
                    <div className="form-grid">
                        <div className="form-group">
                            <label>Commune du sinistre</label>
                            <input
                                type="text"
                                name="commune"
                                value={formData.commune}
                                onChange={handleInputChange}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Date du sinistre</label>
                            <input
                                type="date"
                                name="date"
                                value={formData.date}
                                onChange={handleInputChange}
                                required
                                max={new Date().toISOString().split('T')[0]}
                            />
                        </div>

                        <div className="form-group">
                            <label>Type de phénomène</label>
                            <select name="type" value={formData.type} onChange={handleInputChange} required>
                                <option value="">Sélectionner...</option>
                                <option value="Vent / Tempête">Vent / Tempête</option>
                                <option value="Pluie / Inondation">Pluie / Inondation</option>
                                <option value="Grêle">Grêle</option>
                                <option value="Orage">Foudre / Orage</option>
                            </select>
                        </div>
                    </div>

                    <div className="form-actions">
                        <button type="submit" className="btn-primary" disabled={loading}>
                            {loading ? 'Recherche des données...' : 'Générer le Certificat'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
