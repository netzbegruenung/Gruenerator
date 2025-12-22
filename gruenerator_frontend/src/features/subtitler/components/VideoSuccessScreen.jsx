import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'motion/react';
import { FaPlus, FaEdit, FaShareAlt, FaInstagram, FaTimes, FaDownload, FaFileAlt } from 'react-icons/fa';
import CopyButton from '../../../components/common/CopyButton';
import { useSubtitlerExportStore } from '../../../stores/subtitlerExportStore';
import { ShareMediaModal } from '../../../components/common/ShareMediaModal';
import '../../../assets/styles/components/ui/button.css';
import '../styles/VideoSuccessScreen.css';

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

const VideoSuccessScreen = ({ onReset, onEditAgain, isLoading, socialText, uploadId, projectTitle, projectId, onGenerateSocialText, isGeneratingSocialText, videoUrl }) => {
  const [showSpinner, setShowSpinner] = useState(isLoading);
  const [showShareModal, setShowShareModal] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const exportStore = useSubtitlerExportStore();
  const {
    status: exportStatus,
    progress: exportProgress,
    error: exportError,
    subscribe
  } = exportStore;

  useEffect(() => {
    const unsubscribe = subscribe();
    return unsubscribe;
  }, [subscribe]);

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

  useEffect(() => {
    const checkShareCapability = async () => {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || (navigator.maxTouchPoints > 0 && window.innerWidth <= 768);

      if (!isMobile || !navigator.share || !navigator.canShare) {
        setCanNativeShare(false);
        return;
      }
      try {
        const testFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
        setCanNativeShare(navigator.canShare({ files: [testFile] }));
      } catch {
        setCanNativeShare(false);
      }
    };
    checkShareCapability();
  }, []);

  const handleDownload = () => {
    if (!videoUrl) return;
    const link = document.createElement('a');
    link.href = videoUrl;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShareToInstagram = useCallback(async () => {
    if (!videoUrl) return;
    setIsSharing(true);
    try {
      const response = await fetch(videoUrl, { credentials: 'include' });
      const blob = await response.blob();
      const file = new File([blob], 'gruenerator_video.mp4', { type: 'video/mp4' });

      await navigator.share({
        files: [file],
        title: 'Gruenerator Video',
        text: socialText || '',
      });
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Share failed:', error);
      }
    } finally {
      setIsSharing(false);
    }
  }, [videoUrl, socialText]);

  return (
    <div className="video-success-screen">
      <div className="video-success-content">
        <div className="video-success-main">
          {showSpinner ? (
            <>
              <div className="video-success-icon loading">
                <div className="spinner-container">
                  <div className="video-success-spinner" />
                  {exportProgress > 0 && (
                    <div className="video-spinner-percentage">
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
              <div className="video-success-icon error">
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
              <div className="video-success-info">
                {!videoUrl && (
                  <div className="video-success-icon">
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
                  {videoUrl && canNativeShare && (
                    <button
                      className="btn-primary"
                      onClick={handleShareToInstagram}
                      disabled={isSharing}
                      title="Auf Instagram posten"
                    >
                      {isSharing ? (
                        <div className="button-spinner" />
                      ) : (
                        <FaInstagram />
                      )}
                      Posten
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
                      Video Teilen
                    </button>
                  )}
                </div>

                <div className="video-success-buttons">
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
                      <FaFileAlt />
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {socialText && (
          <div className="video-social-text-result">
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
        <ShareMediaModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          mediaType="video"
          projectId={exportStore.projectId || projectId}
          exportToken={exportStore.exportToken}
          defaultTitle={projectTitle}
        />
      )}
    </div>
  );
};

VideoSuccessScreen.propTypes = {
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

export default VideoSuccessScreen;
