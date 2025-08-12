import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PropTypes from 'prop-types';
import './LoginRequired.css';

// Helper function to extract page name from pathname
const getPageName = (pathname) => {
  const pathSegments = pathname.split('/').filter(Boolean);
  if (pathSegments.length === 0) return 'Diese Seite';
  
  // Map common paths to readable names
  const pathMap = {
    'sharepic': 'Sharepic Generator',
    'antrag': 'Antragsversteher',
    'universal': 'Universal Generator',
    'presse': 'Presse Generator',
    'gruene-jugend': 'Grüne Jugend Generator',
    'subtitler': 'Untertitel Generator',
    'voice': 'Sprach-zu-Text',
    'chat': 'KI-Chat',
    'profile': 'Profil',
    'groups': 'Gruppen',
    'campaigns': 'Kampagnen',
    'search': 'Suche',
    'documents': 'Dokumente',
    'qa': 'Fragen & Antworten',
    'generators': 'Generatoren',
    'you': 'Grüne Ideen für dich'
  };
  
  const mainPath = pathSegments[0];
  return pathMap[mainPath] || 'Diese Seite';
};

const LoginRequired = ({ 
  title,
  message,
  className = '',
  variant = 'card', // 'card', 'inline', 'fullpage'
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Auto-generate title and message if not provided
  const pageName = title || getPageName(location.pathname);
  const defaultMessage = message || `Diese Seite steht nur angemeldeten Nutzer*innen zur Verfügung. Bitte melde dich an, um ${pageName === 'Diese Seite' ? 'fortzufahren' : 'den ' + pageName + ' zu nutzen'}. Die Anmeldung dauert nur 30 Sekunden und nutzt den Standard-Login für Bündnis 90/Die Grünen und Netzbegrünung.`;

  const handleLoginClick = () => {
    // Save current location for redirect after login
    const currentPath = window.location.pathname + window.location.search;
    sessionStorage.setItem('redirectAfterLogin', currentPath);
    navigate('/login');
  };

  if (variant === 'inline') {
    return (
      <div className={`login-required-inline ${className}`}>
        <div className="login-required-icon">🔒</div>
        <span>{defaultMessage}</span>
        <button 
          onClick={handleLoginClick}
          className="login-required-link"
        >
          Jetzt anmelden
        </button>
      </div>
    );
  }

  if (variant === 'fullpage') {
    return (
      <div className={`login-required-fullpage ${className}`}>
        <div className="login-required-container">
          <div className="login-required-icon-large">🔒</div>
          <h1>{pageName}</h1>
          <p>{defaultMessage}</p>
          <button 
            onClick={handleLoginClick}
            className="login-required-button primary"
          >
            <span className="login-icon">👤</span> Zur Anmeldung
          </button>
        </div>
      </div>
    );
  }

  // Default card variant
  return (
    <div className={`login-required-card ${className}`}>
      <div className="login-required-header">
        <div className="login-required-icon">🔒</div>
        <h2>{pageName}</h2>
      </div>
      <p className="login-required-message">{defaultMessage}</p>
      <div className="login-required-actions">
        <button 
          onClick={handleLoginClick}
          className="login-required-button"
        >
          <span className="login-icon">👤</span> Anmelden
        </button>
      </div>
    </div>
  );
};

LoginRequired.propTypes = {
  title: PropTypes.string,
  message: PropTypes.string,
  className: PropTypes.string,
  variant: PropTypes.oneOf(['card', 'inline', 'fullpage']),
};

export default LoginRequired;