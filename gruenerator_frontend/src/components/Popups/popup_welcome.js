import React, { useState, useEffect } from 'react';

const WelcomePopup = () => {
  const [isWelcomePopupOpen, setIsWelcomePopupOpen] = useState(false);

  useEffect(() => {
    const hasSeenWelcomePopup = localStorage.getItem('hasSeenWelcomePopup');
    if (!hasSeenWelcomePopup) {
      setIsWelcomePopupOpen(true);
      localStorage.setItem('hasSeenWelcomePopup', 'true');
    }
  }, []);

  const handleCloseWelcomePopup = () => {
    setIsWelcomePopupOpen(false);
  };

  const handleNewsletterSignup = () => {
    window.open('https://896ca129.sibforms.com/serve/MUIFAFnH3lov98jrw3d75u_DFByChA39XRS6JkBKqjTsN9gx0MxCvDn1FMnkvHLgzxEh1JBcEOiyHEkyzRC-XUO2DffKsVccZ4r7CCaYiugoiLf1a-yoTxDwoctxuzCsmDuodwrVwEwnofr7K42jQc-saIKeVuB_8UxrwS18QIaahZml1qMExNno2sEC7HyMy9Nz4f2f8-UJ4QmW', '_blank');
    setIsWelcomePopupOpen(false);
  };

  if (!isWelcomePopupOpen) return null;

  return (
    <div className="welcome-popup-overlay">
      <div className="welcome-popup">
        <h1>Willkommen bei der Grünerator Open Beta!</h1>
        <p>
          Du gehörst zu den Ersten, die den neuen Grünerator erleben dürfen. Er kann jetzt vieles besser:
        </p>
        <ul>
          <li>Komplett neuer Code & verbesserte UI auf Open-Source-Basis</li>
          <li>Automatischer Dark Mode: Respektiert die Arbeitszeiten des Ehrenamts</li>
          <li>Neuer Grünerator: Schreibe politische Reden für Parteitage, Ratssitzungen & Co</li>
          <li>Verwendet das beste Sprachmodell der Welt: Bessere Ergebnisse bei allen Grüneratoren</li>
        </ul>
        <p>
          Der neue Grünerator ist noch in der Testphase und kann Fehler enthalten. Gib gerne Feedback
        </p>
        <p>
          Ich empfehle dir, dich für das GRÜNERATOR FAX anzumelden, den neuen Grünerator Newsletter. Dort erhälst du Tipps und Tricks, um deine Arbeit im Ehrenamt, im Abgeordnetenbüro oder in den Geschäftsstellen zu vereinfachen.
        </p>
        <div className="welcome-button-container">
          <button
            onClick={handleNewsletterSignup}
            className="welcome-button welcome-button-signup"
          >
            Ja, anmelden
          </button>
          <button
            onClick={handleCloseWelcomePopup}
            className="welcome-button"
          >
            Erstmal nicht
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomePopup;