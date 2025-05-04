import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import Spinner from '../../../components/common/Spinner';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';

/**
 * Callback-Seite für OAuth-Authentifizierung
 * Wird angezeigt, wenn der Benutzer von einem OAuth-Provider zurückgeleitet wird
 */
const OAuthCallbackPage = () => {
  const { user, loading: authLoading } = useSupabaseAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Prüfen ob ein Token in der URL ist und zur richtigen Zielseite weiterleiten
  useEffect(() => {
    if (authLoading) return;
    
    const handleCallback = async () => {
      try {
        // Auf Hash und Token-Parameter in der URL prüfen
        const hash = window.location.hash;
        const params = new URLSearchParams(window.location.search);
        
        // Wenn wir schon einen Benutzer haben, zur Zielseite weiterleiten
        if (user) {
          // Prüfen, ob ein Redirect-Parameter in der URL vorhanden ist
          const redirectTo = params.get('redirectTo') || '/';
          
          // Kurz warten, dann weiterleiten
          setTimeout(() => {
            navigate(redirectTo);
          }, 1000);
          return;
        }
        
        // Wenn kein Benutzer vorhanden ist und kein Hash/Token, dann ist etwas schief gelaufen
        if (!hash && !params.has('access_token') && !params.has('error')) {
          setError('Fehler beim OAuth-Login. Es wurde kein gültiger Token erkannt.');
        }
        
        // Wenn ein Fehler-Parameter vorhanden ist, diesen anzeigen
        if (params.has('error') || params.has('error_description')) {
          const errorMsg = params.get('error_description') || params.get('error') || 'Unbekannter Fehler beim OAuth-Login.';
          setError(errorMsg);
        }
        
      } catch (err) {
        console.error('Fehler beim Verarbeiten des OAuth-Callbacks:', err);
        setError('Fehler beim Verarbeiten der Anmeldedaten. Bitte versuche es erneut.');
      } finally {
        setLoading(false);
      }
    };
    
    handleCallback();
  }, [authLoading, user, navigate]);
  
  // Zeige Lade-Spinner, solange wir auf den Auth-Status warten
  if (authLoading || loading) {
    return (
      <div className="auth-container">
        <div className="auth-header">
          <h1>Anmeldung wird verarbeitet</h1>
          <p>Bitte warte, während wir dich anmelden...</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <Spinner size="large" />
        </div>
      </div>
    );
  }
  
  // Bei erfolgreichem Login und vorhandenem Benutzer
  if (user) {
    return (
      <div className="auth-container">
        <div className="auth-header">
          <h1>Anmeldung erfolgreich</h1>
          <p>Du wirst weitergeleitet...</p>
        </div>
        <div className="auth-success-message">
          Du bist jetzt eingeloggt und wirst in Kürze weitergeleitet.
        </div>
      </div>
    );
  }
  
  // Bei Fehler
  if (error) {
    return (
      <div className="auth-container">
        <div className="auth-header">
          <h1>Anmeldung fehlgeschlagen</h1>
        </div>
        <div className="auth-error-message">
          <p>{error}</p>
        </div>
        <div className="auth-links">
          <a 
            href="#" 
            onClick={(e) => {
              e.preventDefault();
              navigate('/login');
            }}
          >
            Zurück zur Login-Seite
          </a>
        </div>
      </div>
    );
  }
  
  // Fallback: Zur Login-Seite umleiten
  return <Navigate to="/login" replace />;
};

export default OAuthCallbackPage; 