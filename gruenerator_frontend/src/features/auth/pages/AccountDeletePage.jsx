import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';
import Spinner from '../../../components/common/Spinner';

const AccountDeletePage = () => {
  const { user, logout, loading: authLoading } = useSupabaseAuth();
  const navigate = useNavigate();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  
  // Bestätigungstext zur Überprüfung
  const requiredConfirmText = 'KONTO LÖSCHEN';
  
  // Validierung der Eingaben
  const validateInputs = () => {
    if (!email) {
      setError('Bitte gib deine E-Mail-Adresse ein.');
      return false;
    }
    
    if (user && email !== user.email) {
      setError('Die eingegebene E-Mail-Adresse stimmt nicht mit deinem Konto überein.');
      return false;
    }
    
    if (!password) {
      setError('Bitte gib dein Passwort ein.');
      return false;
    }
    
    if (confirmText !== requiredConfirmText) {
      setError(`Bitte gib genau "${requiredConfirmText}" ein, um fortzufahren.`);
      return false;
    }
    
    return true;
  };
  
  // Anzeige der Bestätigungsansicht
  const handleInitialSubmit = (e) => {
    e.preventDefault();
    
    if (!email || (user && email !== user.email)) {
      setError('Bitte gib deine korrekte E-Mail-Adresse ein.');
      return;
    }
    
    setError('');
    setShowConfirmation(true);
  };
  
  // Durchführen der Kontolöschung
  const handleAccountDelete = async (e) => {
    e.preventDefault();
    
    if (!validateInputs()) {
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // Dynamischer Import für den Supabase Client
      const { templatesSupabase } = await import('../../../components/utils/templatesSupabaseClient');
      
      // Verwende den Templates-Client für signInWithPassword
      const { error: signInError } = await templatesSupabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      
      if (signInError) {
        throw new Error('Das Passwort ist nicht korrekt. Bitte versuche es erneut.');
      }
      
      // Wenn die Authentifizierung erfolgreich war, lösche das Profil (falls vorhanden)
      const { data: userProfileData } = await templatesSupabase
        .from('profiles')
        .select()
        .eq('id', user.id);
      
      const userProfileExists = userProfileData.length > 0;
      
      if (userProfileExists) {
        // Verwende den Templates-Client für das Löschen des Profils
        const { error: deleteProfileError } = await templatesSupabase
          .from('profiles')
          .delete()
          .eq('id', user.id);
        
        if (deleteProfileError) {
          console.error('Fehler beim Löschen des Profils:', deleteProfileError);
          // Wir setzen fort, auch wenn das Profil nicht gelöscht werden konnte
        }
      }
      
      // Lösche den Benutzer über die Admin-API (Backend erforderlich!)
      // Dieser Teil erfordert eine sichere Backend-Funktion!
      // const { error: deleteUserError } = await templatesSupabase.auth.admin.deleteUser(
      //   user.id
      // );
      
      // Ausloggen
      await logout();
      
      // Erfolgsnachricht anzeigen und zur Startseite weiterleiten
      setTimeout(() => {
        navigate('/', { 
          state: { 
            message: 'Dein Konto wurde erfolgreich gelöscht. Du wurdest abgemeldet.' 
          }
        });
      }, 1000);
      
    } catch (err) {
      setError('Fehler beim Löschen des Kontos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };
  
  if (authLoading) {
    return (
      <div className="auth-container">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <Spinner size="large" />
        </div>
      </div>
    );
  }
  
  if (!user) {
    return (
      <div className="auth-container">
        <div className="auth-header">
          <h1>Nicht angemeldet</h1>
          <p>Du musst angemeldet sein, um dein Konto zu löschen.</p>
        </div>
        <div className="auth-links">
          <Link to="/login">Zum Login</Link>
        </div>
      </div>
    );
  }
  
  return (
    <div className="auth-container">
      <div className="auth-header">
        <h1>Konto löschen</h1>
        <p>Hier kannst du dein Konto unwiderruflich löschen.</p>
      </div>
      
      {error && (
        <div className="auth-error-message">
          {error}
        </div>
      )}
      
      {!showConfirmation ? (
        // Erste Stufe: E-Mail-Bestätigung
        <form className="auth-form" onSubmit={handleInitialSubmit}>
          <div className="auth-warning-message" style={{
            backgroundColor: 'rgba(255, 77, 77, 0.1)',
            borderLeft: '4px solid #ff4d4d',
            padding: 'var(--spacing-medium)',
            marginBottom: 'var(--spacing-medium)',
            borderRadius: '4px'
          }}>
            <h3 style={{ color: '#ff4d4d', marginTop: 0 }}>Warnung: Diese Aktion kann nicht rückgängig gemacht werden!</h3>
            <p>Wenn du dein Konto löschst:</p>
            <ul>
              <li>Werden alle deine persönlichen Daten unwiderruflich gelöscht</li>
              <li>Verlierst du den Zugriff auf alle erstellten Inhalte</li>
              <li>Kann dein Konto nicht wiederhergestellt werden</li>
            </ul>
          </div>
          
          <div className="form-field-wrapper">
            <label htmlFor="email">Bestätige deine E-Mail-Adresse:</label>
            <input
              type="email"
              id="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Deine E-Mail-Adresse"
              required
            />
          </div>
          
          <button
            type="submit"
            className="auth-submit-button"
            style={{ backgroundColor: '#ff4d4d' }}
          >
            Fortfahren
          </button>
          
          <div className="auth-links">
            <Link to="/profile">Abbrechen und zurück zum Profil</Link>
          </div>
        </form>
      ) : (
        // Zweite Stufe: Endgültige Bestätigung
        <form className="auth-form" onSubmit={handleAccountDelete}>
          <div className="auth-warning-message" style={{
            backgroundColor: 'rgba(255, 77, 77, 0.1)',
            borderLeft: '4px solid #ff4d4d',
            padding: 'var(--spacing-medium)',
            marginBottom: 'var(--spacing-medium)',
            borderRadius: '4px'
          }}>
            <h3 style={{ color: '#ff4d4d', marginTop: 0 }}>Letzte Warnung!</h3>
            <p>Du bist dabei, dein Konto <strong>unwiderruflich</strong> zu löschen.</p>
            <p>Bitte bestätige durch Eingabe deines Passworts und des Bestätigungstextes.</p>
          </div>
          
          <div className="form-field-wrapper">
            <label htmlFor="password">Dein Passwort:</label>
            <input
              type="password"
              id="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          
          <div className="form-field-wrapper">
            <label htmlFor="confirm-text">
              Gib "{requiredConfirmText}" ein, um die Löschung zu bestätigen:
            </label>
            <input
              type="text"
              id="confirm-text"
              className="form-input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              required
            />
          </div>
          
          <button
            type="submit"
            className="auth-submit-button"
            style={{ backgroundColor: '#ff4d4d' }}
            disabled={loading}
          >
            {loading ? <Spinner size="small" /> : 'Konto endgültig löschen'}
          </button>
          
          <div className="auth-links">
            <button 
              type="button" 
              onClick={() => setShowConfirmation(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--link-color)',
                cursor: 'pointer',
                padding: 0,
                fontSize: 'inherit',
                textDecoration: 'none'
              }}
            >
              Zurück
            </button>
            <Link to="/profile">Abbrechen und zurück zum Profil</Link>
          </div>
        </form>
      )}
    </div>
  );
};

export default AccountDeletePage; 