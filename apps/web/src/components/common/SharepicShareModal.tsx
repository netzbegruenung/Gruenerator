import { JSX, useState, useRef, useMemo, useCallback, useEffect, ReactNode } from 'react';
import { IconType } from 'react-icons';
import { HiX, HiCheck, HiDownload } from 'react-icons/hi';
import { FaInstagram, FaFacebook, FaTwitter, FaLinkedin } from 'react-icons/fa';
import { IoShareOutline, IoCopyOutline } from 'react-icons/io5';
import {
  canShareFiles,
  shareImageFile,
  copyToClipboard,
  copyImageToClipboard,
  parsePlatformSections,
  getPlatformDisplayName,
  isMobileDevice,
  openPlatformShare,
  hasPlatformShareUrl
} from '../../utils/shareUtils';

type SharePlatform = 'instagram' | 'facebook' | 'twitter' | 'linkedin';
import '../../assets/styles/components/ui/button.css';
import '../../assets/styles/components/common/sharepic-share-modal.css';

const PLATFORM_ICONS: Record<SharePlatform, IconType> = {
  instagram: FaInstagram,
  facebook: FaFacebook,
  twitter: FaTwitter,
  linkedin: FaLinkedin
};

const PLATFORM_COLORS: Record<SharePlatform, string> = {
  instagram: '#E4405F',
  facebook: '#1877F2',
  twitter: '#1DA1F2',
  linkedin: '#0A66C2'
};

interface SharepicShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  sharepicData: {
    image?: string;
    text?: string;
    type?: string
  };
  socialContent?: string;
  selectedPlatforms?: string[];
}

const SharepicShareModal = ({ isOpen,
  onClose,
  sharepicData,
  socialContent,
  selectedPlatforms = [] }: SharepicShareModalProps): JSX.Element => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    const checkShareCapability = async () => {
      const canShareFilesResult = await canShareFiles();
      setCanShare(canShareFilesResult);
    };
    if (isOpen) {
      checkShareCapability();
    }
  }, [isOpen]);

  const platformTexts = useMemo(() => {
    if (!socialContent) return {};
    const socialPlatforms = selectedPlatforms.filter(p => p !== 'sharepic' && p !== 'pressemitteilung') as SharePlatform[];
    const parsed = parsePlatformSections(socialContent, socialPlatforms);
    return parsed;
  }, [socialContent, selectedPlatforms]);

  const availablePlatforms = useMemo(() => {
    const socialPlatformIds = ['instagram', 'facebook', 'twitter', 'linkedin'];

    // Get platforms from selectedPlatforms (what user chose)
    const userSelectedSocial = selectedPlatforms.filter(p =>
      p !== 'sharepic' && p !== 'pressemitteilung' && socialPlatformIds.includes(p)
    );

    // If user selected social platforms, show those
    if (userSelectedSocial.length > 0) {
      return userSelectedSocial;
    }

    // Fallback to parsed platforms if no explicit selection
    const parsedPlatforms = Object.keys(platformTexts).filter(p => socialPlatformIds.includes(p));
    return parsedPlatforms;
  }, [platformTexts, selectedPlatforms]);

  useEffect(() => {
    if (!isOpen) {
      setCopySuccess(null);
      setShareError(null);
    }
  }, [isOpen]);

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleKeyDown]);

  const handleShareToPlatform = useCallback(async (platformId: string) => {
    if (!sharepicData?.image || isSharing) return;

    setIsSharing(true);
    setShareError(null);

    const text = platformTexts[platformId as SharePlatform] || socialContent || '';

    try {
      // Mobile: use native share (best UX)
      if (isMobileDevice() && canShare) {
        const success = await shareImageFile(sharepicData.image, `Grünerator ${getPlatformDisplayName(platformId)}`);
        if (success) {
          setCopySuccess(`shared-${platformId}`);
          setTimeout(() => setCopySuccess(null), 2000);
        }
        return;
      }

      // Desktop with platform URL (Twitter, Facebook, LinkedIn)
      if (hasPlatformShareUrl(platformId)) {
        openPlatformShare(platformId, text);
        setCopySuccess(`shared-${platformId}`);
        setTimeout(() => setCopySuccess(null), 2000);
        return;
      }

      // Instagram desktop: copy image to clipboard
      if (platformId === 'instagram') {
        await copyImageToClipboard(sharepicData.image);
        setCopySuccess(`shared-${platformId}`);
        setTimeout(() => setCopySuccess(null), 3000);
        return;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Fehler beim Teilen';
      setShareError(errorMessage);
    } finally {
      setIsSharing(false);
    }
  }, [sharepicData?.image, isSharing, platformTexts, socialContent, canShare]);

  const handleDownloadImage = useCallback((platformId: string) => {
    if (!sharepicData?.image) return;

    try {
      const link = document.createElement('a');
      link.href = sharepicData.image;
      link.download = `gruenerator-${platformId || 'sharepic'}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setCopySuccess(`downloaded-${platformId}`);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (error) {
      setShareError('Fehler beim Herunterladen');
    }
  }, [sharepicData?.image]);

  const handleCopyText = useCallback(async (platformId: string) => {
    const text = platformTexts[platformId as SharePlatform] || socialContent;
    if (!text) return;

    try {
      await copyToClipboard(text);
      setCopySuccess(`text-${platformId}`);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (error) {
      setShareError('Fehler beim Kopieren des Textes');
    }
  }, [platformTexts, socialContent]);

  if (!isOpen) return null as unknown as JSX.Element;

  const hasPlatforms = availablePlatforms.length > 0;

  return (
    <div className="sharepic-share-overlay" onClick={handleOverlayClick}>
      <div className="sharepic-share-modal" ref={modalRef} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="sharepic-share-header">
          <div className="sharepic-share-title">
            <IoShareOutline className="sharepic-share-icon" />
            <h4>Auf Social Media teilen</h4>
          </div>
          <button
            className="sharepic-share-close"
            onClick={onClose}
            aria-label="Schließen"
          >
            <HiX />
          </button>
        </div>

        <div className="sharepic-share-content">
          {sharepicData?.image && (
            <div className="sharepic-share-image-section">
              <div className="sharepic-share-image-container">
                <img
                  src={sharepicData.image}
                  alt="Sharepic"
                  className="sharepic-share-preview"
                />
              </div>
            </div>
          )}

          <div className="sharepic-share-right-section">
            {shareError && (
              <div className="sharepic-share-error">{shareError}</div>
            )}

            {hasPlatforms ? (
            <div className="sharepic-share-platforms">
              {availablePlatforms.map((platformId) => {
                const Icon = PLATFORM_ICONS[platformId as SharePlatform];
                const platformText = platformTexts[platformId as SharePlatform];
                const color = PLATFORM_COLORS[platformId as SharePlatform];

                return (
                  <div key={platformId} className="sharepic-platform-card">
                    <div className="sharepic-platform-header" style={{ borderLeftColor: color }}>
                      {Icon && <Icon className="sharepic-platform-icon" style={{ color }} />}
                      <span className="sharepic-platform-name">{getPlatformDisplayName(platformId)}</span>
                    </div>

                    {(platformText || socialContent) && (
                      <div className="sharepic-platform-text">
                        <div className="sharepic-platform-text-preview">
                          {(() => {
                            const text = platformText || socialContent || '';
                            return text.length > 150 ? text.substring(0, 150) + '...' : text;
                          })()}
                        </div>
                      </div>
                    )}

                    <div className="action-buttons three-buttons sharepic-action-row">
                      {(platformText || socialContent) && (
                        <div className="button-wrapper">
                          <button
                            className="copy-button"
                            onClick={() => handleCopyText(platformId)}
                            disabled={isSharing}
                          >
                            {copySuccess === `text-${platformId}` ? (
                              <><HiCheck /> Kopiert!</>
                            ) : (
                              <><IoCopyOutline /> Text kopieren</>
                            )}
                          </button>
                        </div>
                      )}
                      <div className="button-wrapper">
                        <button
                          className="copy-button"
                          onClick={() => handleShareToPlatform(platformId)}
                          disabled={isSharing}
                        >
                          {Icon && <Icon />}
                          {copySuccess === `shared-${platformId}` ? (
                            <span>{platformId === 'instagram' && !isMobileDevice() ? 'Bild kopiert!' : 'Geöffnet!'}</span>
                          ) : (
                            <span>
                              {platformId === 'instagram' && !isMobileDevice()
                                ? 'Bild kopieren'
                                : isMobileDevice()
                                  ? 'Teilen'
                                  : `Auf ${getPlatformDisplayName(platformId)} posten`
                              }
                            </span>
                          )}
                        </button>
                      </div>
                      <div className="button-wrapper">
                        <button
                          className="download-button"
                          onClick={() => handleDownloadImage(platformId)}
                          disabled={isSharing}
                        >
                          {copySuccess === `downloaded-${platformId}` ? (
                            <><HiCheck /> Heruntergeladen!</>
                          ) : (
                            <><HiDownload /> Herunterladen</>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="sharepic-share-fallback">
              <p>Teile dein Sharepic auf Social Media:</p>
              <div className="action-buttons three-buttons sharepic-action-row">
                {socialContent && (
                  <div className="button-wrapper">
                    <button
                      className="copy-button"
                      onClick={() => handleCopyText('default')}
                    >
                      {copySuccess === 'text-default' ? (
                        <><HiCheck /> Kopiert!</>
                      ) : (
                        <><IoCopyOutline /> Text kopieren</>
                      )}
                    </button>
                  </div>
                )}
                <div className="button-wrapper">
                  <button
                    className="btn-primary"
                    onClick={() => handleShareToPlatform('instagram')}
                    disabled={isSharing}
                  >
                    {isMobileDevice() ? (
                      <><IoShareOutline /> Bild teilen</>
                    ) : (
                      <><FaInstagram /> Bild kopieren</>
                    )}
                  </button>
                </div>
                <div className="button-wrapper">
                  <button
                    className="download-button"
                    onClick={() => handleDownloadImage('sharepic')}
                    disabled={isSharing}
                  >
                    <HiDownload /> Herunterladen
                  </button>
                </div>
              </div>
            </div>
          )}

            <p className="sharepic-share-hint">
              {isMobileDevice()
                ? 'Tipp: Nach dem Teilen den kopierten Text in die Bildunterschrift einfügen.'
                : 'Tipp: Kopiere zuerst den Text, dann klicke auf die Plattform. Das Bild kannst du separat herunterladen und hochladen.'
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharepicShareModal;
