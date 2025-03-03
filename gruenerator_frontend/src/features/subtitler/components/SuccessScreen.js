import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import CopyButton from '../../../components/common/CopyButton';
import '../styles/SuccessScreen.css';

const SuccessScreen = ({ onReset, isLoading, socialText }) => {
  const [showSpinner, setShowSpinner] = useState(isLoading);

  useEffect(() => {
    if (!isLoading) {
      // Kurze Verzögerung, damit die Animation sauber beendet werden kann
      const timer = setTimeout(() => {
        setShowSpinner(false);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setShowSpinner(true);
    }
  }, [isLoading]);

  return (
    <div className="success-screen">
      <div className="success-content">
        <div className="success-main">
          <div className={`success-icon ${showSpinner ? 'loading' : ''}`}>
            {showSpinner ? (
              <div className="spinner" />
            ) : '✓'}
          </div>
          <h2>{isLoading ? 'Dein Video wird verarbeitet' : 'Dein Video wurde heruntergeladen'}</h2>
          <p>
            {isLoading 
              ? 'Während dein Video mit Untertiteln versehen wird, kannst du dir schon den generierten Beitragstext ansehen.' 
              : 'Dein Video wurde erfolgreich mit Untertiteln versehen und heruntergeladen.'}
          </p>

          {!isLoading && (
            <div className="success-buttons">
              <button 
                className="btn-primary"
                onClick={onReset}
              >
                Neues Video verarbeiten
              </button>
            </div>
          )}
        </div>

        <div className="social-text-result">
          <h3>Dein Instagram Reel Text:</h3>
          <p>{socialText}</p>
          <CopyButton content={socialText} />
        </div>
      </div>
    </div>
  );
};

SuccessScreen.propTypes = {
  onReset: PropTypes.func.isRequired,
  isLoading: PropTypes.bool,
  socialText: PropTypes.string.isRequired
};

export default SuccessScreen; 