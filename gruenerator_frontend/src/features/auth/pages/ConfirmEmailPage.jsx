import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';
import Spinner from '../../../components/common/Spinner';

const ConfirmEmailPage = () => {
  const { session, user, loading: authLoading } = useSupabaseAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  // Prüfen ob ein Token in der URL ist und automatisch die E-Mail bestätigen
  useEffect(() => {
    // Supabase verarbeitet das Token automatisch, wir müssen nur prüfen ob sich etwas geändert hat
    const handleConfirmation = async () => {
      // Warten bis der Auth-Status geladen ist
      if (authLoading) return;
      
      try {
        // Hash in der URL checken
        const hash = window.location.hash;
        
        if (!hash || !hash.includes('type=signup')) {
          // Kein gültiges Token in der URL gefunden
          setError('Kein gültiger Bestätigungslink. Bitte überprüfe die URL oder fordere einen neuen Link an.');
          setLoading(false);
          return;
        }
        
        // Wenn wir einen User haben, wurde die Bestätigung erfolgreich durchgeführt
        if (user) {
          setSuccess(true);
          // Nach 2 Sekunden zum Login weiterleiten
          setTimeout(() => {
            navigate('/login');
          }, 2000);
        } else {
          setError('Die E-Mail-Bestätigung wurde nicht erkannt. Bitte kontaktiere den Support, falls du Hilfe benötigst.');
        }
      } catch (err) {
        setError('Bei der Bestätigung ist ein Fehler aufgetreten: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    
    handleConfirmation();
  }, [authLoading, user, navigate]);
  
  if (loading || authLoading) {
    return (
      <div className="auth-container">
        <div className="auth-header">
          <h1>E-Mail wird bestätigt</h1>
          <p>Bitte warte, während wir deine E-Mail bestätigen...</p>
        </div>
        <div className="loading-container">
          <Spinner size="large" />
        </div>
      </div>
    );
  }
  
  return (
    <div className="auth-container">
      <div className="auth-header">
        <h1>E-Mail-Bestätigung</h1>
      </div>
      
      {success && (
        <div className="auth-success-message">
          <h2>E-Mail erfolgreich bestätigt!</h2>
          <p>Deine E-Mail-Adresse wurde erfolgreich bestätigt. Du wirst jetzt zum Login weitergeleitet...</p>
        </div>
      )}
      
      {error && (
        <div className="auth-error-message">
          <h2>Bestätigung fehlgeschlagen</h2>
          <p>{error}</p>
        </div>
      )}
      
      <div className="auth-links">
        <Link to="/login">Zum Login</Link>
        <Link to="/email-verification">Neuen Bestätigungslink anfordern</Link>
      </div>
    </div>
  );
};

export default ConfirmEmailPage; 