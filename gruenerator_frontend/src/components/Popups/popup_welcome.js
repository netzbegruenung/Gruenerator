import React, { useState } from 'react';

const WelcomePopup = () => {
  const [isVisible, setIsVisible] = useState(() => {
    return !localStorage.getItem('popupShownAgain');
  });

  const handleCloseWelcomePopup = (e) => {
    e.preventDefault();
    localStorage.setItem('popupShownAgain', 'true');
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="welcome-popup-overlay">
      <div className="welcome-popup">
        <h1>Willkommen beim Grünerator!</h1>
        <div className="welcome-content">
          <section>
            <h2>Neue Features</h2>
            <p>
              Die meisten Fehler des Grünerators konnten wir beheben! 
              Falls du dennoch eine Fehlermeldung erhältst, kannst du jetzt &ldquo;Grünerator Backup&rdquo; nutzen.
            </p>
          </section>
          
          <section>
            <h2>Mobile App Installation</h2>
            <p>
              Du kannst den Grünerator auch als App auf deinem Smartphone installieren:
            </p>
            <ul>
              <li><strong>Android:</strong> Öffne Chrome → Menü (⋮) → &quot;Zum Startbildschirm hinzufügen&quot;</li>
              <li><strong>iOS:</strong> Öffne Safari → Teilen (⋯) → &quot;Zum Home-Bildschirm&quot;</li>
            </ul>
          </section>
        </div>
        
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