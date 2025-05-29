import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'motion/react';
import CopyButton from '../../../components/common/CopyButton';

const AnimatedCheckmark = () => {
  return (
    <motion.svg
      width="60"
      height="60"
      viewBox="0 0 60 60"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ 
        type: "spring", 
        stiffness: 300, 
        damping: 20,
        delay: 0.2
      }}
    >
      <motion.circle
        cx="30"
        cy="30"
        r="25"
        fill="none"
        stroke="var(--klee, #4CAF50)"
        strokeWidth="3"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ 
          duration: 0.6,
          ease: "easeInOut"
        }}
      />
      <motion.path
        d="M18 30l8 8 16-16"
        fill="none"
        stroke="var(--klee, #4CAF50)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ 
          duration: 0.8,
          ease: "easeInOut",
          delay: 0.4
        }}
      />
    </motion.svg>
  );
};

const SuccessScreen = ({ onReset, onEditAgain, isLoading, socialText, uploadId }) => {
<<<<<<< HEAD
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isLoading || !uploadId) {
      setProgress(0); // Reset progress when not loading or no uploadId
      return;
    }
=======
  const [showSpinner, setShowSpinner] = useState(isLoading);
  const [progress, setProgress] = useState(0);

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

  // Progress Polling
  useEffect(() => {
    if (!isLoading || !uploadId) return;
>>>>>>> f2cbc8c2fcc3868bd014a17f22a2c2b04103dcf5

    const pollProgress = async () => {
      try {
        const response = await fetch(`/api/subtitler/export-progress/${uploadId}`);
        if (response.ok) {
          const data = await response.json();
          setProgress(data.progress || 0);
        }
      } catch (error) {
        console.warn('Progress polling error:', error);
      }
    };

    const interval = setInterval(pollProgress, 2000);
    return () => clearInterval(interval);
  }, [isLoading, uploadId]);

  return (
    <div className="success-screen">
      <div className="success-content">
        <div className="success-main">
<<<<<<< HEAD
          <div className={`success-icon ${isLoading ? 'loading' : ''}`}>
            {isLoading ? (
=======
          <div className={`success-icon ${showSpinner ? 'loading' : ''}`}>
            {showSpinner ? (
>>>>>>> f2cbc8c2fcc3868bd014a17f22a2c2b04103dcf5
              <div className="spinner" />
            ) : (
              <AnimatedCheckmark />
            )}
          </div>
          <h2>{isLoading ? 'Dein Video wird verarbeitet' : 'Dein Video wurde heruntergeladen'}</h2>
          <p>
<<<<<<< HEAD
            {isLoading
              ? 'Während dein Video mit Untertiteln versehen wird, kannst du dir schon den generierten Beitragstext ansehen.'
=======
            {isLoading 
              ? 'Während dein Video mit Untertiteln versehen wird, kannst du dir schon den generierten Beitragstext ansehen.' 
>>>>>>> f2cbc8c2fcc3868bd014a17f22a2c2b04103dcf5
              : 'Dein Video wurde erfolgreich mit Untertiteln versehen und heruntergeladen.'}
          </p>
          
          {isLoading && progress > 0 && (
            <div className="progress-container">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="progress-text">{progress}%</span>
            </div>
          )}

          {!isLoading && (
            <div className="success-buttons">
              <button 
                className="btn-primary"
                onClick={onReset}
              >
                Neues Video verarbeiten
              </button>
              <button 
                className="btn-secondary"
                onClick={onEditAgain}
              >
                Zurück zur Bearbeitung
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
  onEditAgain: PropTypes.func.isRequired,
  isLoading: PropTypes.bool,
  socialText: PropTypes.string.isRequired,
  uploadId: PropTypes.string
};

export default SuccessScreen; 