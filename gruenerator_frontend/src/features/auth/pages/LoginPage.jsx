import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useInstantAuth } from '../../../hooks/useAuth';

// Auth Backend URL aus Environment Variable oder Fallback zu aktuellem Host
const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL || '';

const LoginPage = () => {
  const location = useLocation();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const { loading, isAuthenticated, setLoginIntent } = useInstantAuth();

  // Get success message from navigation state (e.g., from registration)
  const successMessage = location.state?.message;

  const handleLogin = async () => {
    setIsAuthenticating(true);
    try {
      // Set login intent to allow auth after logout cooldown
      setLoginIntent();
      
      // Keycloak verwaltet alle Identity Provider - ein einziger Login-Endpunkt
      const authUrl = `${AUTH_BASE_URL}/api/auth/login`;
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
        <p>Melde dich mit deinem Account an:</p>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="auth-success-message">
          {successMessage}
        </div>
      )}

      <div className="login-options">
        <button
          className="login-option primary"
          onClick={handleLogin}
          disabled={isAuthenticating}
        >
          <div className="login-content">
            <span className="login-icon">🔐</span>
            <div className="login-text-content">
              <h3 className="login-title">Anmelden</h3>
              <p className="login-description">
                Grünerator • Netzbegrünung • Grünes Netz
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