import React, { createContext, useContext, useState, useEffect } from 'react';
import { templatesSupabase } from '../components/utils/templatesSupabaseClient';

// Context erstellen
export const SupabaseAuthContext = createContext(null);

// Custom Hook für einfachen Zugriff auf den Context
export const useSupabaseAuth = () => {
  const context = useContext(SupabaseAuthContext);
  if (!context) {
    throw new Error('useSupabaseAuth muss innerhalb eines SupabaseAuthProviders verwendet werden');
  }
  return context;
};

export const SupabaseAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Initialen Sitzungszustand abrufen
    const initializeAuth = async () => {
      try {
        const { data: { session: initialSession }, error: sessionError } = await templatesSupabase.auth.getSession();
        
        if (sessionError) {
          throw sessionError;
        }

        setSession(initialSession);
        setUser(initialSession?.user ?? null);
      } catch (err) {
        console.error('Fehler beim Abrufen der Session:', err.message);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Auth state change listener einrichten
    const { data: { subscription } } = templatesSupabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });

    // Cleanup-Funktion für den Event-Listener
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Auth-Funktionen
  const login = async (email, password) => {
    try {
      setError(null);
      const { data, error } = await templatesSupabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) throw error;
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const signup = async (email, password) => {
    try {
      setError(null);
      const { data, error } = await templatesSupabase.auth.signUp({
        email,
        password
      });
      
      if (error) throw error;
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const logout = async () => {
    try {
      setError(null);
      const { error } = await templatesSupabase.auth.signOut();
      
      if (error) throw error;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const sendPasswordResetEmail = async (email) => {
    try {
      setError(null);
      const { error } = await templatesSupabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      
      if (error) throw error;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const updatePassword = async (newPassword) => {
    try {
      setError(null);
      const { error } = await templatesSupabase.auth.updateUser({
        password: newPassword
      });
      
      if (error) throw error;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const value = {
    user,
    session,
    loading,
    error,
    login,
    signup,
    logout,
    sendPasswordResetEmail,
    updatePassword
  };

  return (
    <SupabaseAuthContext.Provider value={value}>
      {children}
    </SupabaseAuthContext.Provider>
  );
};

export default SupabaseAuthProvider; 