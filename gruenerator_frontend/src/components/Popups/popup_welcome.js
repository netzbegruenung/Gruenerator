import React, { useState } from 'react';

const WelcomePopup = () => {
  const [isVisible, setIsVisible] = useState(() => {
    return !localStorage.getItem('popupShown');
  });

  const handleCloseWelcomePopup = (e) => {
    e.preventDefault();
    localStorage.setItem('popupShown', 'true');
    setIsVisible(false);
  };


  if (!isVisible) {
    return null;
  }

  return (
    <div className="welcome-popup-overlay">
      <div className="welcome-popup">
        <h1>Störung des Grünerators.</h1>
        <p>
          Leider kommt es aktuell insbesondere zwischen 15 und 19 Uhr zu vermehrten Ausfällen des Grünerators. 
          Das Problem liegt bei unserem Dienstanbieter Anthropic. Wir arbeiten an einer Lösung.
        </p>
        <p>
          Tipps bei Problemen:
        </p>
        <ul>
          <li>Versuche es zu einem späteren Zeitpunkt erneut</li>
          <li>Außerhalb der Stoßzeiten läuft der Dienst meist störungsfrei</li>
        </ul>
        <p>
          Danke für dein Verständnis und deine Geduld.
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