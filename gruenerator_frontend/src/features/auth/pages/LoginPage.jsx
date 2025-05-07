import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import TextInput from '../../../components/common/Form/Input/TextInput';
import CheckboxInput from '../../../components/common/Form/Input/CheckboxInput';
import Spinner from '../../../components/common/Spinner';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, supabase, error: authErrorFromContext } = useSupabaseAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [error, setError] = useState('');
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      await login(email, password);
      
      navigate('/');
    } catch (err) {
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

  const handleGruenesNetzLogin = async () => {
    setSsoLoading(true);
    setError('');
    try {
      if (!supabase) {
        setError("Supabase Client ist nicht verfügbar für SSO Login.");
        setSsoLoading(false);
        return;
      }
      const { data, error: ssoError } = await supabase.auth.signInWithSSO({
        domain: 'gruenerator.de',
        options: {
          redirectTo: window.location.origin
        },
      });

      if (ssoError) {
        throw ssoError;
      }

      // Redirect to the SSO provider URL
      if (data && data.url) {
        window.location.href = data.url;
      } else {
        // This case should ideally not happen if ssoError is not thrown,
        // but it's good practice to handle it.
        console.error("SSO Login: No URL returned from Supabase, but no error was thrown.");
        setError("Fehler beim SSO-Login: Keine Weiterleitungs-URL erhalten.");
      }
    } catch (err) {
      console.error("Grünes Netz SSO Error:", err);
      setError(err.message || 'Fehler beim Grünes Netz Login.');
    } finally {
      setSsoLoading(false);
    }
  };
  
  return (
    <div className="auth-container">
      <div className="auth-header">
        <h1>Grünerator Login</h1>
        <p>Melde dich mit deinem Grünen Netz Login an, um fortzufahren.</p>
      </div>
      
      {error && (
        <div className="auth-error-message">
          {error}
        </div>
      )}
      
      {authErrorFromContext && !error && (
         <div className="auth-error-message">
           {authErrorFromContext.message}
         </div>
       )}

      <button
        type="button"
        className="auth-sso-button gruenes-netz-button"
        onClick={handleGruenesNetzLogin}
        disabled={ssoLoading || loading}
        style={{ marginBottom: 'var(--spacing-medium)' }}
      >
        {ssoLoading ? <Spinner size="small" /> : 'Mit Grünes Netz anmelden'}
      </button>

      <button
        type="button"
        className="auth-link-button"
        onClick={() => setShowEmailLogin(prev => !prev)}
        disabled={loading || ssoLoading}
        style={{ 
          display: 'block',
          margin: 'var(--spacing-medium) auto var(--spacing-large) auto',
          textAlign: 'center'
        }}
      >
        {showEmailLogin ? 'E-Mail Login ausblenden' : 'Mit E-Mail und Passwort anmelden'}
      </button>

      {showEmailLogin && (
        <>
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
              disabled={loading || ssoLoading}
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
        </>
      )}

      {/* Footer links are shown only if email login is not expanded, otherwise they are part of the expanded section */}
      {/* The following block will be removed to ensure links are only within the expanded email section
      {!showEmailLogin && (
        <div className="auth-links" style={{ marginTop: '0' }}> 
          
          <Link to="/request-password-reset">Passwort vergessen?</Link>
          <span>
            Noch kein Konto? <Link to="/register">Registrieren</Link>
          </span>
        </div>
      )}
      */}
    </div>
  );
};

export default LoginPage; 