import { useShareStore, getShareUrl } from '@gruenerator/shared';
import { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';

import { btn } from '../../../utils/buttonStyles';
import { cn } from '../../../utils/cn';
import { canShare, shareContent } from '../../../utils/shareUtils';

import type { JSX } from 'react';

interface ShareData {
  shareToken: string;
  [key: string]: unknown;
}

interface ImageData {
  image?: string;
  type?: string;
  metadata?: Record<string, unknown>;
  originalImage?: string;
}

interface ShareMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaType: 'video' | 'image';
  projectId?: string;
  exportToken?: string;
  imageData?: ImageData;
  defaultTitle?: string;
  onShareCreated?: (share?: ShareData) => void;
  getOriginalImage?: () => Promise<string | undefined> | string | undefined;
}

const ShareMediaModal = ({
  isOpen,
  onClose,
  mediaType,
  projectId,
  exportToken,
  imageData,
  defaultTitle,
  onShareCreated,
  getOriginalImage,
}: ShareMediaModalProps): JSX.Element | null => {
  const [shareTitle, setShareTitle] = useState(defaultTitle || '');
  const [copied, setCopied] = useState(false);

  const {
    createVideoShare,
    createVideoShareFromToken,
    createImageShare,
    currentShare,
    isCreating,
    error,
    errorCode,
    clearError,
    clearCurrentShare,
  } = useShareStore();

  useEffect(() => {
    if (isOpen) {
      clearCurrentShare();
      clearError();
      setShareTitle(defaultTitle || '');
      setCopied(false);
    }
  }, [isOpen, defaultTitle, clearCurrentShare, clearError]);

  const handleCreateShare = async () => {
    try {
      clearError();
      let share;

      if (mediaType === 'video') {
        if (exportToken) {
          share = await createVideoShareFromToken(exportToken, shareTitle || undefined, projectId);
        } else if (projectId) {
          share = await createVideoShare({ projectId, title: shareTitle || undefined });
        }
      } else if (mediaType === 'image' && imageData) {
        // Get the original image if a getter function was provided
        let originalImage: string | undefined = imageData.originalImage;
        if (originalImage === 'pending' && getOriginalImage) {
          const result = getOriginalImage();
          originalImage = result instanceof Promise ? await result : result;
        }

        share = await createImageShare({
          imageData: imageData.image,
          title: shareTitle || undefined,
          metadata: imageData.metadata || {},
          originalImage: originalImage || undefined,
        } as Parameters<typeof createImageShare>[0]);
      }

      if (share && onShareCreated) {
        onShareCreated(share as unknown as ShareData);
      }
    } catch (err) {
      console.error('Failed to create share:', err);
    }
  };

  const handleCopyLink = () => {
    if (currentShare?.shareToken) {
      const url = getShareUrl(currentShare.shareToken);
      void navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNativeShare = async () => {
    if (currentShare?.shareToken) {
      const url = getShareUrl(currentShare.shareToken);
      await shareContent({
        title: shareTitle || (mediaType === 'video' ? 'Geteiltes Video' : 'Geteiltes Bild'),
        text: mediaType === 'video' ? 'Schau dir dieses Video an!' : 'Schau dir dieses Bild an!',
        url,
      });
    }
  };

  if (!isOpen) return null;

  const mediaLabel = mediaType === 'video' ? 'Video' : 'Bild';

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-md animate-[fadeIn_0.2s_ease]"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[640px] rounded-lg bg-background p-lg shadow-xl border border-grey-200 dark:border-grey-700 max-[480px]:p-md max-[480px]:rounded-md"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <button
          className="absolute top-md right-md flex h-8 w-8 items-center justify-center rounded-full border-none bg-transparent text-foreground text-2xl leading-none p-xxs opacity-60 transition-opacity duration-200 hover:opacity-100 hover:bg-background-alt cursor-pointer"
          onClick={onClose}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <h2 className="m-0 mb-sm text-xl text-foreground-heading">{mediaLabel} teilen</h2>

        {!currentShare ? (
          <>
            <p className="text-grey-400 mb-lg leading-relaxed">
              Erstelle einen Link, den du mit anderen teilen kannst.
            </p>

            <div className="flex flex-col gap-md mb-lg">
              <div className="flex flex-col gap-xs">
                <label htmlFor="shareTitle" className="text-sm font-medium text-foreground">
                  Titel
                </label>
                <input
                  id="shareTitle"
                  type="text"
                  value={shareTitle}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setShareTitle(e.target.value)
                  }
                  placeholder={`Titel für ${mediaType === 'video' ? 'das geteilte Video' : 'das geteilte Bild'}`}
                  className="rounded-sm border border-grey-200 dark:border-grey-700 bg-[var(--input-background)] px-md py-sm text-foreground text-base min-h-[var(--form-element-min-height)] transition-[border,box-shadow] duration-200 focus:outline-none focus:border-[var(--primary-600)] focus:shadow-[var(--input-shadow-focus)]"
                />
              </div>
            </div>

            {error && (
              <div
                className={cn(
                  'rounded-sm mb-md px-md py-sm text-sm',
                  errorCode === 'NO_SUBTITLES'
                    ? 'flex items-center gap-sm bg-[rgba(255,193,7,0.15)] text-[#856404]'
                    : 'bg-[rgba(211,47,47,0.1)] text-[var(--error-red)]'
                )}
              >
                {errorCode === 'NO_SUBTITLES' ? (
                  <>
                    <svg
                      className="shrink-0"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{error}</span>
                  </>
                ) : (
                  error
                )}
              </div>
            )}

            <div className="flex gap-md justify-end max-[480px]:flex-col-reverse max-[480px]:*:w-full">
              <button className={btn.secondary} onClick={onClose} disabled={isCreating}>
                Abbrechen
              </button>
              <button className={btn.primary} onClick={handleCreateShare} disabled={isCreating}>
                {isCreating ? 'Wird erstellt...' : 'Link erstellen'}
              </button>
            </div>
          </>
        ) : (
          <>
            {currentShare.status === 'processing' && (
              <p className="text-sm text-grey-400 text-center mb-lg bg-[rgba(33,150,243,0.1)] px-md py-sm rounded-sm">
                {mediaType === 'video'
                  ? 'Das Video wird im Hintergrund gerendert. Der Empfänger kann es herunterladen, sobald es fertig ist.'
                  : 'Das Bild wird verarbeitet...'}
              </p>
            )}

            <div className="flex items-center gap-lg max-[600px]:flex-col max-[600px]:items-center">
              <div className="flex flex-1 flex-col items-center justify-center max-[600px]:w-full">
                <div className="flex items-center justify-center rounded-sm bg-white p-md">
                  <QRCode value={getShareUrl(currentShare.shareToken)} size={160} level="M" />
                </div>
              </div>

              <div className="flex flex-[2] flex-col justify-center max-[600px]:w-full">
                <label className="text-sm font-medium text-foreground mb-xs">Link kopieren</label>
                <div className="flex gap-sm mb-md max-[480px]:flex-col">
                  <input
                    type="text"
                    readOnly
                    value={getShareUrl(currentShare.shareToken)}
                    className="flex-1 rounded-sm border border-grey-200 dark:border-grey-700 bg-[var(--input-background)] px-md py-sm text-foreground text-sm font-mono min-h-[var(--form-element-min-height)]"
                  />
                  <button
                    className="flex items-center justify-center rounded-sm border-none bg-primary-600 px-md py-sm text-white cursor-pointer transition-colors duration-200 hover:bg-primary-700"
                    onClick={handleCopyLink}
                  >
                    {copied ? (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polyline points="20,6 9,17 4,12" />
                      </svg>
                    ) : (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                  </button>
                  {canShare() && (
                    <button
                      className="flex items-center justify-center rounded-sm border-none bg-primary-600 px-md py-sm text-white cursor-pointer transition-colors duration-200 hover:bg-primary-700"
                      onClick={handleNativeShare}
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="18" cy="5" r="3" />
                        <circle cx="6" cy="12" r="3" />
                        <circle cx="18" cy="19" r="3" />
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-center mt-md">
              <button className={btn.primary} onClick={onClose}>
                Fertig
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ShareMediaModal;
