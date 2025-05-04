import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import TextInput from '../../../components/common/Form/Input/TextInput';
import CheckboxInput from '../../../components/common/Form/Input/CheckboxInput';
import Spinner from '../../../components/common/Spinner';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, error: authError } = useSupabaseAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      await login(email, password);
      
      // Nach erfolgreichem Login zur Startseite oder vorherigen Seite weiterleiten
      navigate('/');
    } catch (err) {
      // Fehlermeldungen auf Deutsch anzeigen
      let errorMessage = 'Login fehlgeschlagen. Bitte überprüfe deine Angaben.';
      
      if (err.message.includes('Invalid login credentials')) {
        errorMessage = 'Ungültige Anmeldedaten. Bitte überprüfe deine E-Mail-Adresse und dein Passwort.';
      } else if (err.message.includes('Email not confirmed')) {
        errorMessage = 'Deine E-Mail-Adresse wurde noch nicht bestätigt. Bitte prüfe deinen Posteingang.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="auth-container">
      <div className="auth-header">
        <h1>Anmelden</h1>
        <p>Melde dich mit deinem Konto an, um fortzufahren</p>
      </div>
      
      {error && (
        <div className="auth-error-message">
          {error}
        </div>
      )}
      
      <form className="auth-form" onSubmit={handleSubmit}>
        <TextInput
          id="email"
          label="E-Mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="deine@email.de"
          autoComplete="email"
        />
        
        <TextInput
          id="password"
          label="Passwort"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="Passwort"
          autoComplete="current-password"
        />
        
        <CheckboxInput
          id="remember-me"
          label="Angemeldet bleiben"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
        />
        
        <button 
          type="submit" 
          className="auth-submit-button" 
          disabled={loading}
        >
          {loading ? <Spinner size="small" white /> : 'Anmelden'}
        </button>
      </form>
      
      <div className="auth-links">
        <Link to="/request-password-reset">Passwort vergessen?</Link>
        <span>
          Noch kein Konto? <Link to="/register">Registrieren</Link>
        </span>
      </div>
    </div>
  );
};

export default LoginPage; 