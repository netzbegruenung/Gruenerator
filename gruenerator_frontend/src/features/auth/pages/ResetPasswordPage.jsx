import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TextInput from '../../../components/common/Form/Input/TextInput';
import Spinner from '../../../components/common/Spinner';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';

const ResetPasswordPage = () => {
  const { updatePassword } = useSupabaseAuth();
  const navigate = useNavigate();
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [tokenError, setTokenError] = useState(false);
  
  // Beim Laden der Komponente prüfen, ob der Access-Token in der URL vorhanden ist
  useEffect(() => {
    // Der Parameter und Hash werden automatisch vom Supabase Client
    // beim Auth State Change verarbeitet, wir müssen nur prüfen ob ein Hash existiert
    const hash = window.location.hash;
    if (!hash || (!hash.includes('access_token=') && !hash.includes('type=recovery'))) {
      setTokenError(true);
    }
  }, []);
  
  const validatePassword = () => {
    if (password.length < 8) {
      return 'Das Passwort muss mindestens 8 Zeichen lang sein.';
    }
    if (password !== confirmPassword) {
      return 'Die Passwörter stimmen nicht überein.';
    }
    return null;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const passwordError = validatePassword();
    if (passwordError) {
      setError(passwordError);
      setLoading(false);
      return;
    }
    
    try {
      await updatePassword(password);
      setSuccess(true);
      // Nach 3 Sekunden zur Login-Seite weiterleiten
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err) {
      let errorMessage = 'Passwort konnte nicht geändert werden. Bitte fordere einen neuen Link an.';
      
      if (err.message.includes('Invalid')) {
        errorMessage = 'Der Link zum Zurücksetzen des Passworts ist ungültig oder abgelaufen. Bitte fordere einen neuen Link an.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };
  
  if (tokenError) {
    return (
      <div className="auth-container">
        <div className="auth-header">
          <h1>Fehler</h1>
        </div>
        <div className="auth-error-message">
          <p>Der Link zum Zurücksetzen des Passworts ist ungültig oder abgelaufen. Bitte fordere einen neuen Link an.</p>
        </div>
        <div className="auth-links">
          <Link to="/request-password-reset">Neuen Link anfordern</Link>
          <Link to="/login">Zurück zum Login</Link>
        </div>
      </div>
    );
  }
  
  if (success) {
    return (
      <div className="auth-container">
        <div className="auth-header">
          <h1>Passwort geändert</h1>
        </div>
        <div className="auth-success-message">
          <p>Dein Passwort wurde erfolgreich geändert. Du wirst in wenigen Sekunden zum Login weitergeleitet.</p>
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
        <h1>Neues Passwort festlegen</h1>
        <p>Bitte gib dein neues Passwort ein</p>
      </div>
      
      {error && (
        <div className="auth-error-message">
          {error}
        </div>
      )}
      
      <form className="auth-form" onSubmit={handleSubmit}>
        <TextInput
          id="password"
          label="Neues Passwort"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="Passwort (mind. 8 Zeichen)"
          helpText="Mindestens 8 Zeichen"
          autoComplete="new-password"
        />
        
        <TextInput
          id="confirm-password"
          label="Passwort bestätigen"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          placeholder="Passwort wiederholen"
          autoComplete="new-password"
        />
        
        <button 
          type="submit" 
          className="auth-submit-button" 
          disabled={loading}
        >
          {loading ? <Spinner size="small" white /> : 'Passwort ändern'}
        </button>
      </form>
      
      <div className="auth-links">
        <Link to="/login">Zurück zum Login</Link>
      </div>
    </div>
  );
};

export default ResetPasswordPage; 