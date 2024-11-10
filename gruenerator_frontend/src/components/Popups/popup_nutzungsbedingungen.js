import React, { useState, useEffect } from 'react';
import '../../assets/styles/common/variables.css';
import '../../assets/styles/common/global.css';
import '../../assets/styles/components/button.css';
import '../../assets/styles/components/popup.css';

const PopupNutzungsbedingungen = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hasAccepted = localStorage.getItem('termsAccepted');
    if (!hasAccepted) {
      setVisible(true);
    }
  }, []);

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
