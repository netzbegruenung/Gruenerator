import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useInstantAuth } from '../../../hooks/useAuth';

const GRUENERATOR_LOGIN_SOURCE_SLUG = import.meta.env.VITE_AUTHENTIK_GRUENERATOR_SOURCE_SLUG || 'gruenerator-login';
const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL || '';

const RegistrationPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useInstantAuth();
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/profile');
    }
  }, [isAuthenticated, navigate]);

  const handleRegistration = async () => {
    setIsRedirecting(true);
    try {
      // Redirect to Authentik's registration flow
      const registrationUrl = `${AUTH_BASE_URL}/api/auth/login?source=${encodeURIComponent(GRUENERATOR_LOGIN_SOURCE_SLUG)}&prompt=register`;
      console.log(`[RegistrationPage] Redirecting to Authentik registration: ${registrationUrl}`);
      window.location.href = registrationUrl;
    } catch (err) {
      console.error('Fehler beim Initiieren der Registrierung:', err);
      setIsRedirecting(false);
    }
  };

  // Show loading while checking auth status
  if (loading) {
    return (
      <div className="auth-container">
        <div className="auth-header">
          <h1>Lädt...</h1>
        </div>
        <div className="loading-container">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-header">
        <h1>Grünerator Konto erstellen</h1>
        <p>Erstellen Sie Ihr kostenloses Konto für den vollen Zugriff auf alle Grünerator Funktionen.</p>
      </div>

      <div className="login-options">
        <button
          className="login-option gruenerator"
          onClick={handleRegistration}
          disabled={isRedirecting}
        >
          <div className="login-content">
            <span className="login-icon">📝</span>
            <div className="login-text-content">
              <h3 className="login-title">Neues Konto erstellen</h3>
              <p className="login-description">Registrierung mit E-Mail & Passwort</p>
            </div>
          </div>
        </button>
      </div>

      {isRedirecting && (
        <div className="auth-status-message">
          <p>Weiterleitung zur Registrierung...</p>
        </div>
      )}

      {/* Login Link */}
      <div className="auth-links">
        <p>
          Haben Sie bereits ein Konto?{' '}
          <Link to="/login" className="auth-link">
            Hier anmelden
          </Link>
        </p>
      </div>

      {/* Support */}
      <div className="auth-links">
        <p className="auth-help-text">
          Brauchst du Hilfe? Kontaktiere den Support unter{' '}
          <a href="mailto:support@gruenerator.de">support@gruenerator.de</a>
        </p>
      </div>
    </div>
  );
};

export default RegistrationPage; 