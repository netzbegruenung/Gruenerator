import React from 'react';
import '../../assets/styles/components/popups/help.css';

const EditorMaintenancePopup = ({ isVisible, onClose }) => {
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && window.innerWidth <= 768) {
      onClose();
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="welcome-2025-overlay" onClick={handleOverlayClick}>
      <div className="welcome-2025-modal">
        <h2 className="welcome-2025-title">Editor wird überarbeitet</h2>
        <div className="welcome-2025-content">
          <p className="welcome-2025-intro">
            Unser Editor wird gerade komplett überarbeitet und ist vorübergehend nicht verfügbar.
          </p>
          <div className="editor-maintenance-info">
            <span className="welcome-2025-emoji">⚠️</span>
            <p>
              <strong>Voraussichtliche Rückkehr:</strong> 3. Quartal 2025
            </p>
            <p>
              In der Zwischenzeit nutze bitte den <strong>Textbegrünung Export</strong> für deine Textbearbeitung.
            </p>
          </div>
        </div>
        
        <div className="welcome-2025-buttons">
          <button
            onClick={onClose}
            className="welcome-2025-button welcome-2025-button-secondary"
          >
            Verstanden
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditorMaintenancePopup; 