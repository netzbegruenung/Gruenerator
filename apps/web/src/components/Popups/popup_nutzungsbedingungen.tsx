import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { usePopupDismiss } from '../../hooks/usePopupDismiss';
import '../../assets/styles/components/popups/popup.css';

declare global {
  interface Window {
    grantAnalyticsConsent?: () => void;
  }
}

const PopupNutzungsbedingungen = () => {
  const location = useLocation();
  const isNoHeaderFooterRoute = location.pathname.includes('-no-header-footer');

  const { isDismissed, dismiss, isHydrated } = usePopupDismiss('termsAccepted');

  const [visible, setVisible] = useState(() => {
    return !isDismissed && !isNoHeaderFooterRoute;
  });

  // Hide if server state arrives and says dismissed (cross-device sync)
  useEffect(() => {
    if (isHydrated && isDismissed && visible) {
      setVisible(false);
    }
  }, [isHydrated, isDismissed, visible]);

  const handleAcceptAll = () => {
    dismiss();
    if (typeof window.grantAnalyticsConsent === 'function') {
      window.grantAnalyticsConsent();
    }
    setVisible(false);
  };

  const handleAcceptNecessary = () => {
    dismiss();
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
