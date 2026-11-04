import React, { useState } from 'react';
import { useAuth } from './AuthProvider';
import { useNavigate } from 'react-router-dom';
import { Lock, User, AlertCircle } from 'lucide-react';
import './Login.css';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const { login } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            // Connexion via Supabase Auth uniquement (aucun identifiant en dur).
            const { error } = await login(username.trim(), password);

            if (error) throw error;

            navigate('/');
        } catch (err) {
            console.error(err);
            setError("Identifiants incorrects.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <div className="logo-icon"><Lock size={32} /></div>
                    <h2>Espace Sécurisé</h2>
                    <p>METEO-CLIMAT PRO</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <User size={18} className="input-icon" />
                        <input
                            type="text"
                            placeholder="Identifiant"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <Lock size={18} className="input-icon" />
                        <input
                            type="password"
                            placeholder="Mot de passe"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    {error && (
                        <div className="error-message">
                            <AlertCircle size={16} /> {error}
                        </div>
                    )}

                    <button type="submit" className="btn-login" disabled={loading}>
                        {loading ? 'Connexion...' : 'Se connecter'}
                    </button>
                </form>

                <div className="login-footer">
                    <p>Accès réservé aux services autorisés.</p>
                </div>
            </div>
        </div>
    );
}
