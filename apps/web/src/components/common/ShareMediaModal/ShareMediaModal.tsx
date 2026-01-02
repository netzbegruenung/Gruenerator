import { useState, useEffect } from 'react';
import type { JSX } from 'react';
import QRCode from 'react-qr-code';
import { useShareStore, getShareUrl } from '@gruenerator/shared';
import { canShare, shareContent } from '../../../utils/shareUtils';
import './ShareMediaModal.css';

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

const ShareMediaModal = ({ isOpen,
  onClose,
  mediaType,
  projectId,
  exportToken,
  imageData,
  defaultTitle,
  onShareCreated,
  getOriginalImage, }: ShareMediaModalProps): JSX.Element | null => {
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
          share = await createVideoShareFromToken(exportToken, shareTitle || null, projectId);
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
        onShareCreated(share);
      }
    } catch (err) {
      console.error('Failed to create share:', err);
    }
  };

  const handleCopyLink = () => {
    if (currentShare?.shareToken) {
      const url = getShareUrl(currentShare.shareToken);
      navigator.clipboard.writeText(url);
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
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal" onClick={(e) => e.stopPropagation()}>
        <button className="share-modal-close" onClick={onClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <h2>{mediaLabel} teilen</h2>

        {!currentShare ? (
          <>
            <p className="share-modal-description">
              Erstelle einen Link, den du mit anderen teilen kannst.
            </p>

            <div className="share-modal-form">
              <div className="form-group">
                <label htmlFor="shareTitle">Titel</label>
                <input
                  id="shareTitle"
                  type="text"
                  value={shareTitle}
                  onChange={(e) => setShareTitle(e.target.value)}
                  placeholder={`Titel für ${mediaType === 'video' ? 'das geteilte Video' : 'das geteilte Bild'}`}
                />
              </div>
            </div>

            {error && (
              <div className={`share-modal-error ${errorCode === 'NO_SUBTITLES' ? 'export-required' : ''}`}>
                {errorCode === 'NO_SUBTITLES' ? (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{error}</span>
                  </>
                ) : error}
              </div>
            )}

            <div className="share-modal-actions">
              <button
                className="btn-secondary"
                onClick={onClose}
                disabled={isCreating}
              >
                Abbrechen
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateShare}
                disabled={isCreating}
              >
                {isCreating ? 'Wird erstellt...' : 'Link erstellen'}
              </button>
            </div>
          </>
        ) : (
          <>
            {currentShare.status === 'processing' && (
              <p className="share-modal-info share-modal-rendering-info">
                {mediaType === 'video'
                  ? 'Das Video wird im Hintergrund gerendert. Der Empfänger kann es herunterladen, sobald es fertig ist.'
                  : 'Das Bild wird verarbeitet...'}
              </p>
            )}

            <div className="share-modal-success-layout">
              <div className="share-modal-left">
                <div className="share-qr-container">
                  <QRCode
                    value={getShareUrl(currentShare.shareToken)}
                    size={160}
                    level="M"
                  />
                </div>
              </div>

              <div className="share-modal-right">
                <label className="share-link-label">Link kopieren</label>
                <div className="share-link-container">
                  <input
                    type="text"
                    readOnly
                    value={getShareUrl(currentShare.shareToken)}
                    className="share-link-input"
                  />
                  <button
                    className="share-copy-button"
                    onClick={handleCopyLink}
                  >
                    {copied ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20,6 9,17 4,12" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                  </button>
                  {canShare() && (
                    <button
                      className="share-native-button"
                      onClick={handleNativeShare}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

            <div className="share-modal-actions-centered">
              <button
                className="btn-primary"
                onClick={onClose}
              >
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
