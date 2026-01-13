import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import '../../assets/styles/components/popups/popup.css';

declare global {
  interface Window {
    grantMatomoConsent?: () => void;
  }
}

const PopupNutzungsbedingungen = () => {
  const [visible, setVisible] = useState(false);
  const location = useLocation();

  const isNoHeaderFooterRoute = location.pathname.includes('-no-header-footer');

  useEffect(() => {
    const hasAccepted = localStorage.getItem('termsAccepted');
    if (!hasAccepted && !isNoHeaderFooterRoute) {
      setVisible(true);
    }
  }, [isNoHeaderFooterRoute]);

  const handleAcceptAll = () => {
    localStorage.setItem('termsAccepted', 'true');
    if (typeof window.grantMatomoConsent === 'function') {
      window.grantMatomoConsent();
    }
    setVisible(false);
  };

  const handleAcceptNecessary = () => {
    localStorage.setItem('termsAccepted', 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="popup-terms">
      <p className="terms-text">
        Diese Website verwendet Cookies. Durch die Nutzung stimmst du den{' '}
        <a href="/datenschutz#nutzungsbedingungen" className="terms-link">
          Nutzungsbedingungen
        </a>{' '}
        zu.{' '}
        <a href="/datenschutz#webanalyse" className="terms-link">
          Mehr erfahren
        </a>
      </p>
      <div className="terms-buttons">
        <button className="button-terms-secondary" onClick={handleAcceptNecessary}>
          Nur Notwendige
        </button>
        <button className="button-terms" onClick={handleAcceptAll}>
          Alle akzeptieren
        </button>
      </div>
    </div>
  );
};

export default PopupNutzungsbedingungen;
