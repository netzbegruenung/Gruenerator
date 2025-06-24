import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useInstantAuth } from '../../../hooks/useAuth';

// Auth Backend URL aus Environment Variable oder Fallback zu relativem Pfad
const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const LoginPage = () => {
  const location = useLocation();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const { loading, isAuthenticated, setLoginIntent } = useInstantAuth();

  // Get success message from navigation state (e.g., from registration)
  const successMessage = location.state?.message;


  const handleGruenesNetzLogin = async () => {
    setIsAuthenticating(true);
    try {
      setLoginIntent();
      
      const authUrl = `${AUTH_BASE_URL}/auth/login?source=gruenes-netz-login`;
      console.log(`[LoginPage] Grünes Netz Login - Redirecting to: ${authUrl}`);
      window.location.href = authUrl;
    } catch (err) {
      console.error('Fehler beim Initiieren des Grünes Netz Logins:', err);
      setIsAuthenticating(false);
    }
  };

  const handleNetzbegrueungLogin = async () => {
    setIsAuthenticating(true);
    try {
      setLoginIntent();
      
      const authUrl = `${AUTH_BASE_URL}/auth/login?source=netzbegruenung-login`;
      console.log(`[LoginPage] Netzbegrünung Login - Redirecting to: ${authUrl}`);
      window.location.href = authUrl;
    } catch (err) {
      console.error('Fehler beim Initiieren des Netzbegrünung Logins:', err);
      setIsAuthenticating(false);
    }
  };

  const handleGrueneratorLogin = async () => {
    setIsAuthenticating(true);
    try {
      setLoginIntent();
      
      const authUrl = `${AUTH_BASE_URL}/auth/login?source=gruenerator-login`;
      console.log(`[LoginPage] Grünerator Login - Redirecting to: ${authUrl}`);
      window.location.href = authUrl;
    } catch (err) {
      console.error('Fehler beim Initiieren des Grünerator Logins:', err);
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-header">
        <h1>Willkommen zurück!</h1>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="auth-success-message">
          {successMessage}
        </div>
      )}

      <div className="login-options">

        <button
          className="login-option gruenes-netz"
          onClick={handleGruenesNetzLogin}
          disabled={isAuthenticating}
        >
          <div className="login-content">
            <img 
              src="/images/Sonnenblume_RGB_gelb.png" 
              alt="Grünes Netz" 
              className="login-logo"
              width="50"
              height="50"
              loading="eager"
            />
            <div className="login-text-content">
              <h3 className="login-title">Grünes Netz Login</h3>
              <p className="login-description">
                Mit deinem Grünes Netz Account anmelden
              </p>
            </div>
          </div>
        </button>

        <button
          className="login-option netzbegruenung"
          onClick={handleNetzbegrueungLogin}
          disabled={isAuthenticating}
        >
          <div className="login-content">
            <img 
              src="/images/nb_icon.png" 
              alt="Netzbegrünung" 
              className="login-logo"
              width="50"
              height="50"
              loading="eager"
            />
            <div className="login-text-content">
              <h3 className="login-title">Netzbegrünung Login</h3>
              <p className="login-description">
                Mit deinem Netzbegrünung Account anmelden
              </p>
            </div>
          </div>
        </button>

        <button
          className="login-option gruenerator"
          onClick={handleGrueneratorLogin}
          disabled={isAuthenticating}
        >
          <div className="login-content">
            <span className="login-icon">🌱</span>
            <div className="login-text-content">
              <h3 className="login-title">Grünerator Login</h3>
              <p className="login-description">
                Für Mitarbeitende von Abgeordneten und Geschäftsstellen (soon)
              </p>
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
      <div className="auth-footer">
        <p className="auth-help-text">
          Noch kein Konto? <Link to="/register">Hier registrieren</Link>
        </p>
      </div>

      {/* Legal Notice */}
      <div className="auth-legal">
        <p>
          Mit der Anmeldung stimmst du unseren{' '}
          <Link to="/legal/terms">Nutzungsbedingungen</Link> und der{' '}
          <Link to="/legal/privacy">Datenschutzerklärung</Link> zu.
        </p>
      </div>
    </div>
  );
};

export default LoginPage; 