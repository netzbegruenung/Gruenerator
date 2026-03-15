import { Button } from '@gruenerator/ui';
import { motion } from 'motion/react';
import React, { useState, useEffect, useCallback } from 'react';
import {
  FaPlus,
  FaEdit,
  FaShareAlt,
  FaInstagram,
  FaTimes,
  FaDownload,
  FaFileAlt,
} from 'react-icons/fa';

import CopyButton from '../../../components/common/CopyButton';
import { Markdown } from '../../../components/common/Markdown';
import { ShareMediaModal } from '../../../components/common/ShareMediaModal';
import Spinner from '../../../components/common/Spinner';
import apiClient from '../../../components/utils/apiClient';
import { useSubtitlerExportStore } from '../../../stores/subtitlerExportStore';

interface VideoSuccessScreenProps {
  onReset: () => void;
  onEditAgain: () => void;
  isLoading: boolean;
  socialText?: string;
  uploadId?: string;
  projectTitle?: string;
  projectId?: string;
  onGenerateSocialText: () => void;
  isGeneratingSocialText: boolean;
  videoUrl?: string;
}

const AnimatedCheckmark = () => {
  return (
    <motion.svg
      width="60"
      height="60"
      viewBox="0 0 60 60"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 20,
        delay: 0.2,
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
          ease: 'easeInOut',
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
          ease: 'easeInOut',
          delay: 0.4,
        }}
      />
    </motion.svg>
  );
};

const VideoSuccessScreen: React.FC<VideoSuccessScreenProps> = ({
  onReset,
  onEditAgain,
  isLoading,
  socialText,
  uploadId,
  projectTitle,
  projectId,
  onGenerateSocialText,
  isGeneratingSocialText,
  videoUrl,
}) => {
  const [showSpinner, setShowSpinner] = useState(isLoading);
  const [showShareModal, setShowShareModal] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const exportStore = useSubtitlerExportStore();
  const {
    status: exportStatus,
    progress: exportProgress,
    error: exportError,
    subscribe,
  } = exportStore;

  useEffect(() => {
    const unsubscribe = subscribe();
    return unsubscribe;
  }, [subscribe]);

  useEffect(() => {
    const shouldShowSpinner =
      isLoading || exportStatus === 'starting' || exportStatus === 'exporting';

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
      const isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        ) ||
        (navigator.maxTouchPoints > 0 && window.innerWidth <= 768);

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
      const urlPath = videoUrl.startsWith('/api') ? videoUrl.replace('/api', '') : videoUrl;
      const response = await apiClient.get(urlPath, { responseType: 'blob' });
      const blob = response.data;
      const file = new File([blob], 'gruenerator_video.mp4', { type: 'video/mp4' });

      await navigator.share({
        files: [file],
        title: 'Gruenerator Video',
        text: socialText || '',
      });
    } catch (error: unknown) {
      const shareError = error as { name: string };
      if (shareError.name !== 'AbortError') {
        console.error('Share failed:', error);
      }
    } finally {
      setIsSharing(false);
    }
  }, [videoUrl, socialText]);

  return (
    <div className="flex justify-center">
      <div className="flex w-full max-w-[600px] flex-col items-center p-xl text-center">
        <div className="flex w-full flex-col items-center gap-md">
          {showSpinner ? (
            <>
              <div className="flex size-20 items-center justify-center rounded-full bg-primary-500">
                <Spinner size="large" white />
              </div>
              <h2 className="text-xl font-semibold text-foreground-heading">
                Dein Video wird verarbeitet
              </h2>
              <p className="text-foreground">Dein Video wird mit Untertiteln versehen...</p>
            </>
          ) : exportError ? (
            <>
              <div className="flex size-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <FaTimes className="text-[40px] text-red-600" />
              </div>
              <h2 className="text-xl font-semibold text-foreground-heading">
                Export fehlgeschlagen
              </h2>
              <p className="text-foreground">{exportError}</p>
            </>
          ) : (
            <>
              {videoUrl && (
                <div className="flex justify-center overflow-hidden rounded-lg">
                  <video
                    className="block aspect-[9/16] max-h-[60vh] rounded-lg object-contain max-md:max-h-[40vh]"
                    controls
                    src={videoUrl}
                  />
                </div>
              )}
              <div className="flex w-full flex-col items-center gap-md">
                {!videoUrl && (
                  <div className="flex size-20 items-center justify-center rounded-full bg-primary-500">
                    <AnimatedCheckmark />
                  </div>
                )}
                <h2 className="text-xl font-semibold text-foreground-heading">
                  Dein Video ist fertig!
                </h2>
                <p className="text-foreground">
                  Dein Video wurde erfolgreich mit Untertiteln versehen.
                </p>

                <div className="flex flex-wrap justify-center gap-sm max-md:w-full max-md:flex-col">
                  {videoUrl && (
                    <Button onClick={handleDownload}>
                      <FaDownload />
                      Herunterladen
                    </Button>
                  )}
                  {videoUrl && canNativeShare && (
                    <Button
                      onClick={handleShareToInstagram}
                      disabled={isSharing}
                      title="Auf Instagram posten"
                    >
                      {isSharing ? <Spinner size="small" white /> : <FaInstagram />}
                      Posten
                    </Button>
                  )}
                  <Button onClick={onEditAgain}>
                    <FaEdit />
                    Bearbeiten
                  </Button>
                  {(exportStore.projectId || projectId) && (
                    <Button onClick={() => setShowShareModal(true)}>
                      <FaShareAlt />
                      Video Teilen
                    </Button>
                  )}
                </div>

                <div className="flex justify-center gap-sm">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={onReset}
                    title="Neues Video verarbeiten"
                  >
                    <FaPlus />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={onGenerateSocialText}
                    disabled={isGeneratingSocialText || !!socialText}
                    title="Beitragstext erstellen"
                  >
                    {isGeneratingSocialText ? <Spinner size="small" /> : <FaFileAlt />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        {socialText && (
          <div className="mt-lg w-full rounded-lg bg-background-alt p-lg text-left dark:bg-background max-md:bg-transparent max-md:p-0 max-md:pt-lg">
            <h3 className="mb-sm text-base font-semibold text-foreground-heading">
              Dein Instagram Reel Text:
            </h3>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <Markdown fallback={<div>Loading...</div>}>{socialText}</Markdown>
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
          exportToken={exportStore.exportToken || undefined}
          defaultTitle={projectTitle}
        />
      )}
    </div>
  );
};

export default VideoSuccessScreen;
