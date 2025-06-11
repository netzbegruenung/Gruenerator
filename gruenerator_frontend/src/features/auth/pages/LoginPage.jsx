import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useInstantAuth } from '../../../hooks/useAuth';

// Die Sourcen-Slugs sollten idealerweise aus einer Konfiguration oder Umgebungsvariablen kommen
const GRUENERATOR_LOGIN_SOURCE_SLUG = import.meta.env.VITE_AUTHENTIK_GRUENERATOR_SOURCE_SLUG || 'gruenerator-login';
const NETZBEGRUENUNG_LOGIN_SOURCE_SLUG = import.meta.env.VITE_AUTHENTIK_NETZBEGRUENUNG_SOURCE_SLUG || 'netzbegruenung-login';
const GRUENES_NETZ_LOGIN_SOURCE_SLUG = import.meta.env.VITE_AUTHENTIK_GRUENES_NETZ_SOURCE_SLUG || 'gruenes-netz-login';

// Auth Backend URL aus Environment Variable oder Fallback zu aktuellem Host
const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL || '';

const LoginPage = () => {
  const location = useLocation();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const { loading, isAuthenticated } = useInstantAuth();

  // Get success message from navigation state (e.g., from registration)
  const successMessage = location.state?.message;

  const handleLogin = async (sourceSlug) => {
    setIsAuthenticating(true);
    try {
      // Die Backend-Route /api/auth/login kümmert sich um den Redirect zu Authentik
      const authUrl = `${AUTH_BASE_URL}/api/auth/login?source=${encodeURIComponent(sourceSlug)}`;
      console.log(`[LoginPage] Redirecting to: ${authUrl}`);
      window.location.href = authUrl;
    } catch (err) {
      console.error('Fehler beim Initiieren des Logins:', err);
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-header">
        <h1>Willkommen zurück!</h1>
        <p>Bitte wähle deine Anmeldeoption:</p>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="auth-success-message">
          {successMessage}
        </div>
      )}

      <div className="login-options">
        <button
          className="login-option gruenerator"
          onClick={() => handleLogin(GRUENERATOR_LOGIN_SOURCE_SLUG)}
          disabled={isAuthenticating}
        >
          <div className="login-content">
            <span className="login-icon">⚙️</span>
            <div className="login-text-content">
              <h3 className="login-title">Grünerator Login</h3>
              <p className="login-description">Mit E-Mail & Passwort</p>
            </div>
          </div>
        </button>

        <button
          className="login-option netzbegruenung"
          onClick={() => handleLogin(NETZBEGRUENUNG_LOGIN_SOURCE_SLUG)}
          disabled={isAuthenticating}
        >
          <div className="login-content">
            <span className="login-icon">🌱</span>
            <div className="login-text-content">
              <h3 className="login-title">Netzbegrünung Login</h3>
              <p className="login-description">SAML Single Sign-On</p>
            </div>
          </div>
        </button>

        <button
          className="login-option gruenes-netz"
          onClick={() => handleLogin(GRUENES_NETZ_LOGIN_SOURCE_SLUG)}
        >
          <div className="login-content">
            <span className="login-icon">🌻</span>
            <div className="login-text-content">
              <h3 className="login-title">Grünes Netz Login</h3>
              <p className="login-description">SAML Single Sign-On</p>
            </div>
          </div>
        </button>
      </div>

      {isAuthenticating && (
        <div className="auth-status-message">
          <p>Weiterleitung zum Login...</p>
        </div>
      )}

      {/* Registration Link */}
      <div className="auth-links">
        <p>
          Noch kein Grünerator Konto?{' '}
          <a 
            href={`${AUTH_BASE_URL}/api/auth/login?source=${encodeURIComponent(GRUENERATOR_LOGIN_SOURCE_SLUG)}&prompt=register`}
            className="auth-link"
          >
            Jetzt kostenlos registrieren
          </a>
        </p>
      </div>

      <div className="auth-links">
        <p className="auth-help-text">
          Brauchst du Hilfe? Kontaktiere den Support unter{' '}
          <a href="mailto:support@gruenerator.de">support@gruenerator.de</a>
        </p>
      </div>
    </div>
  );
};

export default LoginPage; 