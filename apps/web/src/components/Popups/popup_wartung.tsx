import '../../assets/styles/components/popups/welcome-popup.css';

const PopupWartung = () => {
  return (
    <div className="welcome-2025-overlay" style={{ cursor: 'default' }}>
      <div className="welcome-2025-modal">
        <div className="welcome-2025-content" style={{ textAlign: 'center' }}>
          <span className="welcome-2025-emoji" style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>
            🔧
          </span>
          <h2 className="welcome-2025-title">Wartungsarbeiten</h2>
          <p className="welcome-2025-intro">
            Grünerator wird gerade gewartet und kommt zeitnah wieder.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PopupWartung;
