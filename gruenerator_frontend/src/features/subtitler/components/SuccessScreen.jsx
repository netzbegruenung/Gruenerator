import React, { useState, useEffect, lazy, Suspense } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'motion/react';
import CopyButton from '../../../components/common/CopyButton';
import { useSubtitlerExportStore } from '../../../stores/subtitlerExportStore';

const ReactMarkdown = lazy(() => import('react-markdown'));

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
        stroke="var(--weiß, #ffffff)"
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
        stroke="var(--weiß, #ffffff)"
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
  const [showSpinner, setShowSpinner] = useState(isLoading);
  
  // Use centralized export store for progress tracking
  const exportStore = useSubtitlerExportStore();
  const {
    status: exportStatus,
    progress: exportProgress,
    error: exportError,
    subscribe
  } = exportStore;

  // Subscribe to export store
  useEffect(() => {
    const unsubscribe = subscribe();
    return unsubscribe;
  }, [subscribe]);
  
  // Update spinner based on export status or legacy isLoading prop
  useEffect(() => {
    const shouldShowSpinner = isLoading || exportStatus === 'starting' || exportStatus === 'exporting';
    
    if (!shouldShowSpinner) {
      // Kurze Verzögerung, damit die Animation sauber beendet werden kann
      const timer = setTimeout(() => {
        setShowSpinner(false);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setShowSpinner(true);
    }
  }, [isLoading, exportStatus]);

  return (
    <div className="success-screen">
      <div className="success-content">
        <div className="success-main">
          <div className={`success-icon ${showSpinner ? 'loading' : ''}`}>
            {showSpinner ? (
              <div className="spinner-container">
                <div className="spinner" />
                {exportProgress > 0 && (
                  <div className="spinner-percentage">
                    {exportProgress}%
                  </div>
                )}
              </div>
            ) : (
              <AnimatedCheckmark />
            )}
          </div>
          <h2>{showSpinner ? 'Dein Video wird verarbeitet' : 'Dein Video wurde heruntergeladen'}</h2>
          <p>
            {showSpinner
              ? 'Während dein Video mit Untertiteln versehen wird, kannst du dir schon den generierten Beitragstext ansehen.' 
              : 'Dein Video wurde erfolgreich mit Untertiteln versehen und heruntergeladen.'}
          </p>
          
          {/* Show error if export failed */}
          {exportError && (
            <div className="error-message" style={{ marginBottom: 'var(--spacing-medium)' }}>
              <p>Fehler beim Export: {exportError}</p>
            </div>
          )}
          

          {!showSpinner && (
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
          <div className="markdown-content">
            <Suspense fallback={<div>Loading...</div>}>
              <ReactMarkdown>{socialText}</ReactMarkdown>
            </Suspense>
          </div>
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