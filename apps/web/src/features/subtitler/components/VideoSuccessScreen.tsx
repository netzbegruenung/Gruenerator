import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { motion } from 'motion/react';
import React, { useState, useEffect, useCallback } from 'react';
import {
  FaChevronDown,
  FaEdit,
  FaEllipsisH,
  FaFileAlt,
  FaPlus,
  FaShareAlt,
  FaTimes,
  FaDownload,
} from 'react-icons/fa';
import { PiFilmSlate, PiSubtitles } from 'react-icons/pi';

import CopyButton from '../../../components/common/CopyButton';
import JobErrorNotice from '../../../components/common/JobErrorNotice';
import { Markdown } from '../../../components/common/Markdown';
import { ShareMediaModal } from '../../../components/common/ShareMediaModal';
import Spinner from '../../../components/common/Spinner';
import apiClient from '../../../components/utils/apiClient';
import { useSubtitlerExportStore } from '../../../stores/subtitlerExportStore';

interface VideoSuccessScreenProps {
  onReset: () => void;
  onEditAgain: () => void;
  /** Opens the saved project in the video editor; absent without a saved project. */
  onOpenInEditor?: () => void;
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
  onOpenInEditor,
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
    errorCode: exportErrorCode,
    retryable: exportRetryable,
    errorId: exportErrorId,
    retryExport,
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
      // Reaction to the loading/export status changing — the hide side is a timed
      // 300ms fade (setTimeout above), so this show/hide gate must stay an effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
    void checkShareCapability();
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

  const handleNativeShare = useCallback(async () => {
    if (!videoUrl) return;
    setIsSharing(true);
    try {
      const urlPath = videoUrl.startsWith('/api') ? videoUrl.replace('/api', '') : videoUrl;
      const response = await apiClient.get<Blob>(urlPath, { responseType: 'blob' });
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

  const shareProjectId = exportStore.projectId || projectId;
  // One „Teilen“: the phone's share sheet with the file where it can take one
  // (that was the Instagram button), the link dialog otherwise.
  const canShare = (canNativeShare && !!videoUrl) || !!shareProjectId;
  const handleShare = () => {
    if (canNativeShare && videoUrl) void handleNativeShare();
    else setShowShareModal(true);
  };

  return (
    <div className="flex justify-center">
      <div className="flex w-full max-w-[800px] flex-col items-center p-xl">
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
              <JobErrorNotice
                className="w-full max-w-md"
                message={exportError}
                code={exportErrorCode}
                retryable={exportRetryable}
                errorId={exportErrorId}
                onRetry={() => void retryExport()}
              />
            </>
          ) : (
            <div
              className={
                videoUrl
                  ? 'flex w-full gap-xl max-lg:flex-col max-lg:items-center'
                  : 'flex w-full flex-col items-center'
              }
            >
              {videoUrl && (
                <div className="flex shrink-0 justify-center overflow-hidden rounded-lg">
                  <video
                    className="block aspect-[9/16] max-h-[60vh] rounded-lg object-contain max-md:max-h-[40vh]"
                    controls
                    src={videoUrl}
                  />
                </div>
              )}
              <div
                className={`flex w-full flex-col gap-md ${videoUrl ? 'justify-center max-lg:items-center max-lg:text-center' : 'items-center'}`}
              >
                {!videoUrl && (
                  <div className="flex size-20 items-center justify-center rounded-full bg-primary-500">
                    <AnimatedCheckmark />
                  </div>
                )}
                {videoUrl && (
                  <div className="flex size-16 items-center justify-center rounded-full bg-primary-500 max-lg:size-20">
                    <AnimatedCheckmark />
                  </div>
                )}
                <h2 className="text-xl font-semibold text-foreground-heading">
                  Dein Video ist fertig!
                </h2>
                <p className="text-foreground">
                  Dein Video wurde erfolgreich mit Untertiteln versehen.
                </p>

                <div className="flex flex-col gap-sm max-lg:w-full max-lg:max-w-sm max-lg:items-stretch">
                  <div className="flex gap-sm">
                    {videoUrl && (
                      <Button
                        variant="brand"
                        size="brand-md"
                        className="max-lg:flex-1 max-lg:px-4"
                        onClick={handleDownload}
                      >
                        <FaDownload />
                        Herunterladen
                      </Button>
                    )}
                    {canShare && (
                      <Button
                        variant="brand-outline"
                        size="brand-md"
                        className="max-lg:flex-1 max-lg:px-4"
                        onClick={handleShare}
                        disabled={isSharing}
                      >
                        {isSharing ? <Spinner size="small" /> : <FaShareAlt />}
                        Teilen
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-sm">
                    {onOpenInEditor ? (
                      // Two editors, so „Bearbeiten“ asks which one: the simple
                      // subtitle editor and the video editor looked alike as icons.
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="brand-outline" size="brand" className="max-lg:flex-1">
                            <FaEdit />
                            Bearbeiten
                            <FaChevronDown className="size-3" aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-72">
                          <DropdownMenuItem
                            onSelect={onEditAgain}
                            className="items-start gap-sm py-2"
                          >
                            <PiSubtitles className="mt-0.5 size-5 text-primary-500" aria-hidden />
                            <span className="flex flex-col">
                              <span className="font-medium">Untertitel anpassen</span>
                              <span className="text-xs text-foreground-muted">
                                Text und Zeiten korrigieren
                              </span>
                            </span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={onOpenInEditor}
                            className="items-start gap-sm py-2"
                          >
                            <PiFilmSlate className="mt-0.5 size-5 text-primary-500" aria-hidden />
                            <span className="flex flex-col">
                              <span className="font-medium">Im Video Editor schneiden</span>
                              <span className="text-xs text-foreground-muted">
                                Kürzen, Clips, Musik. Untertitel wandern mit
                              </span>
                            </span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <Button
                        variant="brand-outline"
                        size="brand"
                        className="max-lg:flex-1"
                        onClick={onEditAgain}
                      >
                        <FaEdit />
                        Bearbeiten
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="brand-ghost"
                          size="brand-icon"
                          aria-label="Mehr"
                          title="Mehr"
                        >
                          {isGeneratingSocialText ? <Spinner size="small" /> : <FaEllipsisH />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem
                          onSelect={onGenerateSocialText}
                          disabled={isGeneratingSocialText || !!socialText}
                        >
                          <FaFileAlt aria-hidden />
                          {isGeneratingSocialText
                            ? 'Beitragstext wird erstellt …'
                            : 'Beitragstext erstellen'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={onReset}>
                          <FaPlus aria-hidden />
                          Neues Video
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {socialText && (
          <div className="mt-lg w-full rounded-lg bg-background-alt p-lg text-left dark:bg-background max-lg:bg-transparent max-lg:p-0 max-lg:pt-lg">
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
