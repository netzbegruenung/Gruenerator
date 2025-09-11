import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import '../../assets/styles/components/popups/welcome-popup.css';
const WelcomePopup = () => {
  const location = useLocation();
  const isNoHeaderFooterRoute = location.pathname.includes('-no-header-footer');

  const [isVisible, setIsVisible] = useState(() => {
    if (isNoHeaderFooterRoute) return false;
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

  const handleCardClick = (url) => {
    window.open(url, '_blank');
  };

  // Function to handle clicks outside the modal (on the overlay)
  const handleOverlayClick = (e) => {
    // Check if the click is directly on the overlay and if screen width is mobile
    if (e.target === e.currentTarget && window.innerWidth <= 768) {
      handleCloseWelcomePopup(e);
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="welcome-2025-overlay" onClick={handleOverlayClick}>
      <div className="welcome-2025-modal">
        <h2 className="welcome-2025-title">Das neue Grünerator-Update ist da</h2>
        <div className="welcome-2025-content">
          <p className="welcome-2025-intro">Entdecke die neuen Features:</p>
          <div className="welcome-2025-grid">
            <div 
              className="welcome-2025-card welcome-2025-card-clickable"
              onClick={() => handleCardClick('/reel')}
            >
              <span className="welcome-2025-emoji">🎬</span>
              <h3>Reel-Grünerator</h3>
              <p>
                Erstelle tolle Reels mit automatischen Untertiteln
              </p>
            </div>
            <div 
              className="welcome-2025-card welcome-2025-card-clickable"
              onClick={() => handleCardClick('/suche')}
            >
              <span className="welcome-2025-emoji">🔍</span>
              <h3>Gruugo-Suche</h3>
              <p>
                Finde schnell Infos zu grünen Themen mit KI!
              </p>
            </div>
            <div 
              className="welcome-2025-card welcome-2025-card-clickable"
              onClick={() => handleCardClick('/universal')}
            >
              <span className="welcome-2025-emoji">📝</span>
              <h3>Neue Grüneratoren</h3>
              <p>
                Universal-Tool mit Reden & Wahlprogrammen + Grüne Jugend
              </p>
            </div>
            <div className="welcome-2025-card">
              <span className="welcome-2025-emoji">✨</span>
              <h3>Neues Design</h3>
              <p>
                Frischer Look & schnellere Textgenerierung
              </p>
            </div>
          </div>
        </div>
        
        <p className="welcome-2025-exclusive-note">
          Diese Features waren zunächst exklusiv für unsere Fax-Abonnenten verfügbar. Jetzt für alle zugänglich!
        </p>
        
        <div className="welcome-2025-buttons">
          <button
            onClick={handleNewsletterClick}
            className="welcome-2025-button welcome-2025-button-primary"
          >
            Newsletter
          </button>
          <button
            onClick={handleCloseWelcomePopup}
            className="welcome-2025-button welcome-2025-button-secondary"
          >
            Los geht&apos;s!
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomePopup;