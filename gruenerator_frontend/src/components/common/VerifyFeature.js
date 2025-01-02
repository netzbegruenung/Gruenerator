import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from '../utils/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../../assets/styles/components/verify.css';

const EyeIcon = ({ closed }) => (
  <svg 
    width="20" 
    height="20" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    {closed ? (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    ) : (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </svg>
);

EyeIcon.propTypes = {
  closed: PropTypes.bool,
};

export default function VerifyFeature({ feature, children, onVerified, onCancel }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { verifyPassword, isFeatureVerified } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    console.log('Eingegebenes Passwort:', password);
    console.log('Feature:', feature);
    console.log('ENV Passwort:', process.env.REACT_APP_VERIFY_PASSWORD);
    
    try {
      const success = await verifyPassword(password, feature);
      console.log('Verifizierungsergebnis:', success);
      if (!success) {
        setError('Falsches Passwort');
      } else if (onVerified) {
        onVerified();
      }
    } catch (err) {
      setError('Ein Fehler ist aufgetreten');
    }
  };

  const handleBack = () => {
    if (onCancel) {
      onCancel();
    } else {
      navigate('/');
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  if (isFeatureVerified(feature) && !onVerified) {
    return children;
  }

  return (
    <div className="verify-container">
      <div className="verify-box">
        <h2>Zugriff verifizieren</h2>
        <p>Diese Funktion erfordert eine Verifizierung.</p>
        
        <form onSubmit={handleSubmit} className="verify-form">
          <div className="verify-input-group">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Passwort eingeben"
              className="verify-input"
            />
            <button
              type="button"
              onClick={togglePasswordVisibility}
              className="verify-password-toggle"
              aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
            >
              <EyeIcon closed={!showPassword} />
            </button>
          </div>
          {error && <div className="verify-error">{error}</div>}
          <div className="verify-buttons">
            <button type="button" onClick={handleBack} className="verify-button verify-button-secondary">
              {onCancel ? 'Abbrechen' : 'Zurück'}
            </button>
            <button type="submit" className="verify-button">
              Verifizieren
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

VerifyFeature.propTypes = {
  feature: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  onVerified: PropTypes.func,
  onCancel: PropTypes.func,
}; 