import React, { useState } from 'react';

const WelcomePopup = () => {
  const [isVisible, setIsVisible] = useState(() => {
    return !localStorage.getItem('welcomePopupShown');
  });

  const handleCloseWelcomePopup = (e) => {
    e.preventDefault();
    localStorage.setItem('welcomePopupShown', 'true');
    setIsVisible(false);
  };

  const handleNewsletterSignup = (e) => {
    e.preventDefault();
    window.location.href = '/newsletter';
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="welcome-popup-overlay">
      <div className="welcome-popup">
        <h1>Das Work Update ist da!</h1>
<<<<<<< Updated upstream
=======
        <p>
          Der Grünerator hat neue Features bekommen:
        </p>
>>>>>>> Stashed changes
        <ul>
          <li>Grünerator Editor: Nach der &quot;Grünerierung&quot; kannst du den Text direkt anpassen</li>
          <li>Grünerator KI-Textverbesserung: Markiere Text im Editor und nutze die neue KI-Anpassung (Desktop only)</li>
          <li>Grünerator Office: Erstelle automatisch ein Dokument (wie Google Docs), verschicke einen Link und bearbeite es im Team</li>
          <li>Neuer Grünerator &quot;Wahlprogramm&quot;: Erstelle Kapitel für dein Wahlprogramm</li>
        </ul>
        <p>
          Melde dich für das GRÜNERATOR FAX an und erhalte die wichtigsten Infos zu KI und dem Grünerator. Kostenlos, kein Spam, nur wenige E-Mails. Versprochen!
<<<<<<< Updated upstream
=======
        </p>
        <p>
          <strong>Viel Spaß mit dem Grünerator<br/>Euer Moritz</strong>
>>>>>>> Stashed changes
        </p>
        <div className="welcome-button-container">
          <button
            onClick={handleNewsletterSignup}
            className="welcome-button welcome-button-signup"
          >
            Anmelden
          </button>
          <button
            onClick={handleCloseWelcomePopup}
            className="welcome-button"
          >
            Hab ich schon
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomePopup;