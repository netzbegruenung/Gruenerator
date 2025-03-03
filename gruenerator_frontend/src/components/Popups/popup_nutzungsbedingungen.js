import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import '../../assets/styles/common/variables.css';
import '../../assets/styles/common/global.css';
import '../../assets/styles/components/button.css';
import '../../assets/styles/components/popup.css';

const PopupNutzungsbedingungen = () => {
  const [visible, setVisible] = useState(false);
  const location = useLocation();

  // Prüfen, ob wir uns in einer Route ohne Header und Footer befinden
  const isNoHeaderFooterRoute = location.pathname.includes('-no-header-footer');

  useEffect(() => {
    // Popup nur anzeigen, wenn wir nicht in einer Route ohne Header und Footer sind
    // und die Nutzungsbedingungen noch nicht akzeptiert wurden
    const hasAccepted = localStorage.getItem('termsAccepted');
    if (!hasAccepted && !isNoHeaderFooterRoute) {
      setVisible(true);
    }
  }, [isNoHeaderFooterRoute]);

  const handleAccept = () => {
    localStorage.setItem('termsAccepted', 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="popup-terms">
      <button className="close-button" onClick={handleAccept}>&times;</button>
      <p className="terms-text">
        Durch die Nutzung dieser Website stimmst du den{' '}
        <a href="/datenschutz#nutzungsbedingungen" className="terms-link">
          Nutzungsbedingungen
        </a> zu.
      </p>
      <button className="button-terms" onClick={handleAccept}>Zustimmen</button>
    </div>
  );
};

export default PopupNutzungsbedingungen;
