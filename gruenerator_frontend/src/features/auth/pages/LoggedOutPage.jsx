import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../stores/authStore';

const LoggedOutPage = () => {
  const navigate = useNavigate();
  const clearAuth = useAuthStore((state) => state.clearAuth);

  useEffect(() => {
    // Clear any remaining auth state when landing on this page
    clearAuth();
  }, [clearAuth]);

  const handleBackToHome = () => {
    // Clear logout timestamp to allow normal auth flow
    localStorage.removeItem('gruenerator_logout_timestamp');
    navigate('/');
  };

  const handleNewLogin = () => {
    // Set login intent and clear logout timestamp for immediate login
    localStorage.setItem('gruenerator_login_intent', Date.now().toString());
    localStorage.removeItem('gruenerator_logout_timestamp');
    navigate('/auth/login');
  };

  return (
    <div className="auth-container">
      <div className="auth-header">
        <h1>Erfolgreich abgemeldet</h1>
        <p className="auth-help-text">
          Du wurdest sicher vom Grünerator abgemeldet
        </p>
      </div>

      <div className="auth-success-message">
        <h3 style={{ margin: '0 0 var(--spacing-small) 0', color: 'var(--font-color)' }}>
          ✅ Logout erfolgreich
        </h3>
        <p style={{ margin: 0, color: 'var(--font-color)', opacity: 0.9 }}>
          Deine Session wurde sicher beendet. Alle persönlichen Daten wurden aus dem Browser entfernt.
        </p>
      </div>

      <div className="auth-form">
        <button 
          onClick={handleBackToHome}
          className="auth-submit-button"
          style={{ marginBottom: 'var(--spacing-small)' }}
        >
          Zur Startseite
        </button>
        
        <button 
          onClick={handleNewLogin}
          className="auth-submit-button"
          style={{ 
            backgroundColor: 'transparent',
            color: 'var(--tanne)',
            border: '1px solid var(--tanne)'
          }}
        >
          Neu anmelden
        </button>
      </div>

      <div className="auth-legal">
        <p>
          Du kannst dich jederzeit wieder mit deinem Account anmelden.<br />
          Alle deine gespeicherten Daten und Einstellungen bleiben erhalten.
        </p>
        <p style={{ marginTop: 'var(--spacing-small)' }}>
          Für Fragen oder Probleme wende dich an{' '}
          <a href="mailto:support@gruenerator.de">support@gruenerator.de</a>
        </p>
      </div>
    </div>
  );
};

export default LoggedOutPage; 