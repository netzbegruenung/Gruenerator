import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useInstantAuth } from '../../../hooks/useAuth';

// Auth Backend URL aus Environment Variable oder Fallback zu aktuellem Host
const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL || '';

const RegistrationPage = () => {
  const location = useLocation();
  const [isRegistering, setIsRegistering] = useState(false);
  const { loading, isAuthenticated, setLoginIntent } = useInstantAuth();

  const handleRegister = async () => {
    setIsRegistering(true);
    try {
      // Set login intent to allow auth after logout cooldown
      setLoginIntent();
      
      // Keycloak verwaltet auch die Registrierung
      const authUrl = `${AUTH_BASE_URL}/api/auth/login?prompt=register`;
      console.log(`[RegistrationPage] Redirecting to: ${authUrl}`);
      window.location.href = authUrl;
    } catch (err) {
      console.error('Fehler beim Initiieren der Registrierung:', err);
      setIsRegistering(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-header">
        <h1>Registrierung</h1>
        <p>Erstelle dein kostenloses Grünerator-Konto:</p>
      </div>

      <div className="registration-options">
        <button
          className="registration-option primary"
          onClick={handleRegister}
          disabled={isRegistering}
        >
          <div className="registration-content">
            <span className="registration-icon">📝</span>
            <div className="registration-text-content">
              <h3 className="registration-title">Konto erstellen</h3>
              <p className="registration-description">Kostenlose Registrierung</p>
            </div>
          </div>
        </button>
      </div>

      {/* Login Link */}
      <div className="auth-footer">
        <p className="auth-help-text">
          Schon ein Konto? <Link to="/login">Hier anmelden</Link>
        </p>
      </div>

      {/* Legal Notice */}
      <div className="auth-legal">
        <p>
          Mit der Registrierung stimmst du unseren{' '}
          <Link to="/legal/terms">Nutzungsbedingungen</Link> und der{' '}
          <Link to="/legal/privacy">Datenschutzerklärung</Link> zu.
        </p>
      </div>
    </div>
  );
};

export default RegistrationPage; 