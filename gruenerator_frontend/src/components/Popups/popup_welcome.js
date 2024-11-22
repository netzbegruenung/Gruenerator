import React, { useState } from 'react';

const WelcomePopup = () => {
  const [isVisible, setIsVisible] = useState(() => {
    return !localStorage.getItem('popupShownAgain'); // Name geändert
  });

  const handleCloseWelcomePopup = (e) => {
    e.preventDefault();
    localStorage.setItem('popupShownAgain', 'true'); // Name geändert
    setIsVisible(false);
  };


  if (!isVisible) {
    return null;
  }

  return (
    <div className="welcome-popup-overlay">
      <div className="welcome-popup">
        <h1>Neues Backup-Feature</h1>
        <p>
          Gute Nachrichten: Die meisten Fehler des Grünerators konnten wir beheben! 
          Falls du dennoch eine Fehlermeldung erhältst, kannst du jetzt "Grünerator Backup" nutzen.
        </p>
        <p>
          Vielen Dank für deine Geduld!
        </p>
        <div className="welcome-button-container">
          <button
            onClick={handleCloseWelcomePopup}
            className="welcome-button"
          >
            Verstanden
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomePopup;