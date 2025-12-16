import React, { useState, useEffect, lazy, Suspense } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'motion/react';
import { FaPlus, FaEdit, FaShareAlt, FaInstagram, FaTimes, FaDownload } from 'react-icons/fa';
import CopyButton from '../../../components/common/CopyButton';
import { useSubtitlerExportStore } from '../../../stores/subtitlerExportStore';
import ShareVideoModal from './ShareVideoModal';
import '../../../assets/styles/components/ui/button.css';
import '../styles/SuccessScreen.css';

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

const SuccessScreen = ({ onReset, onEditAgain, isLoading, socialText, uploadId, projectTitle, projectId, onGenerateSocialText, isGeneratingSocialText, videoUrl }) => {
  const [showSpinner, setShowSpinner] = useState(isLoading);
  const [showShareModal, setShowShareModal] = useState(false);

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
      const timer = setTimeout(() => {
        setShowSpinner(false);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setShowSpinner(true);
    }
  }, [isLoading, exportStatus]);

  const handleDownload = () => {
    if (!videoUrl) return;
    const link = document.createElement('a');
    link.href = videoUrl;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="success-screen">
      <div className="success-content">
        <div className="success-main">
          {showSpinner ? (
            <>
              <div className="success-icon loading">
                <div className="spinner-container">
                  <div className="spinner" />
                  {exportProgress > 0 && (
                    <div className="spinner-percentage">
                      {exportProgress}%
                    </div>
                  )}
                </div>
              </div>
              <h2>Dein Video wird verarbeitet</h2>
              <p>Dein Video wird mit Untertiteln versehen...</p>
            </>
          ) : exportError ? (
            <>
              <div className="success-icon error">
                <FaTimes style={{ fontSize: '60px', color: 'var(--error-red)' }} />
              </div>
              <h2>Export fehlgeschlagen</h2>
              <p>{exportError}</p>
            </>
          ) : (
            <>
              {videoUrl && (
                <div className="video-preview-container">
                  <video
                    className="video-preview"
                    controls
                    src={videoUrl}
                  />
                </div>
              )}
              <div className="success-info">
                {!videoUrl && (
                  <div className="success-icon">
                    <AnimatedCheckmark />
                  </div>
                )}
                <h2>Dein Video ist fertig!</h2>
                <p>Dein Video wurde erfolgreich mit Untertiteln versehen.</p>

                <div className="action-buttons">
                  {videoUrl && (
                    <button
                      className="btn-primary"
                      onClick={handleDownload}
                    >
                      <FaDownload />
                      Herunterladen
                    </button>
                  )}
                  <button
                    className="btn-primary"
                    onClick={onEditAgain}
                  >
                    <FaEdit />
                    Bearbeiten
                  </button>
                  {(exportStore.projectId || projectId) && (
                    <button
                      className="btn-primary"
                      onClick={() => setShowShareModal(true)}
                    >
                      <FaShareAlt />
                      Teilen
                    </button>
                  )}
                </div>

                <div className="success-buttons">
                  <button
                    className="btn-icon btn-secondary"
                    onClick={onReset}
                    title="Neues Video verarbeiten"
                  >
                    <FaPlus />
                  </button>
                  <button
                    className="btn-icon btn-secondary"
                    onClick={onGenerateSocialText}
                    disabled={isGeneratingSocialText || !!socialText}
                    title="Beitragstext erstellen"
                  >
                    {isGeneratingSocialText ? (
                      <div className="button-spinner" />
                    ) : (
                      <FaInstagram />
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {socialText && (
          <div className="social-text-result">
            <h3>Dein Instagram Reel Text:</h3>
            <div className="markdown-content">
              <Suspense fallback={<div>Loading...</div>}>
                <ReactMarkdown>{socialText}</ReactMarkdown>
              </Suspense>
            </div>
            <CopyButton content={socialText} />
          </div>
        )}
      </div>

      {showShareModal && (exportStore.projectId || projectId) && (
        <ShareVideoModal
          projectId={exportStore.projectId || projectId}
          title={projectTitle}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </div>
  );
};

SuccessScreen.propTypes = {
  onReset: PropTypes.func.isRequired,
  onEditAgain: PropTypes.func.isRequired,
  isLoading: PropTypes.bool,
  socialText: PropTypes.string,
  uploadId: PropTypes.string,
  projectTitle: PropTypes.string,
  projectId: PropTypes.string,
  onGenerateSocialText: PropTypes.func,
  isGeneratingSocialText: PropTypes.bool,
  videoUrl: PropTypes.string
};

export default SuccessScreen; 