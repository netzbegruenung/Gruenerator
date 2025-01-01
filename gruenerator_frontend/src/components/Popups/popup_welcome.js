import React, { useState } from 'react';

const WelcomePopup = () => {
  const [isVisible, setIsVisible] = useState(() => {
    return !localStorage.getItem('popupShown2024');
  });

  const handleCloseWelcomePopup = (e) => {
    e.preventDefault();
    localStorage.setItem('popupShown2024', 'true');
    setIsVisible(false);
  };

  const handleNewsletterClick = () => {
    window.open('https://896ca129.sibforms.com/serve/MUIFAFnH3lov98jrw3d75u_DFByChA39XRS6JkBKqjTsN9gx0MxCvDn1FMnkvHLgzxEh1JBcEOiyHEkyzRC-XUO2DffKsVccZ4r7CCaYiugoiLf1a-yoTxDwoctxuzCsmDuodwrVwEwnofr7K42jQc-saIKeVuB_8UxrwS18QIaahZml1qMExNno2sEC7HyMy9Nz4f2f8-UJ4QmW', '_blank');
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="welcome-popup-overlay">
      <div className="welcome-popup">
        <h1>Willkommen in 2024! 🎉</h1>
        <div className="welcome-content">
          <section className="feature-section">
            <h2>Neue Features</h2>
            <div className="feature-grid">
              <div className="feature-card">
                <span className="feature-emoji">🎨</span>
                <h3>KI-Sharepics</h3>
                <p>
                  Erstelle professionelle Sharepics mit KI-Unterstützung.
                  Beta-Version für Fax-Abonnenten.
                </p>
              </div>
              <div className="feature-card">
                <span className="feature-emoji">📱</span>
                <h3>Canva Vorlagen</h3>
                <p>
                  Professionelle Vorlagen für Social Media und Print.
                  Beta-Version für Newsletter-Abonnenten.
                </p>
              </div>
              <div className="feature-card">
                <span className="feature-emoji">✨</span>
                <h3>Neues Design</h3>
                <p>
                  Moderner Look, bessere Übersicht und neue Startseite.
                </p>
              </div>
            </div>
          </section>
          <p className="beta-info">
            Beta-Features werden zeitnah für alle freigeschaltet
          </p>
        </div>
        
        <div className="welcome-button-container">
          <button
            onClick={handleNewsletterClick}
            className="welcome-button newsletter-button"
          >
            Newsletter abonnieren
          </button>
          <button
            onClick={handleCloseWelcomePopup}
            className="welcome-button later-button"
          >
            Später und zum Grünerator
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomePopup;