import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        // Session Supabase persistée
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!mounted) return;
            setUser(session?.user ?? null);
            setLoading(false);
        });

        // Écoute des changements d'état d'authentification
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!mounted) return;
            setUser(session?.user ?? null);
            setLoading(false);
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    /**
     * Connexion : uniquement via Supabase Auth.
     * Aucun identifiant en dur, aucun contournement de session.
     */
    const login = async (email, password) => {
        return supabase.auth.signInWithPassword({ email, password });
    };

    const logout = async () => {
        setUser(null);
        return supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
