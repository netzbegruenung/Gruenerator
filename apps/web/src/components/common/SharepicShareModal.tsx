import { type JSX, useState, useRef, useMemo, useCallback, useEffect, ReactNode } from 'react';
import { type IconType } from 'react-icons';
import { FaInstagram, FaFacebook, FaTwitter, FaLinkedin } from 'react-icons/fa';
import { HiX, HiCheck, HiDownload } from 'react-icons/hi';
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
  hasPlatformShareUrl,
} from '../../utils/shareUtils';

type SharePlatform = 'instagram' | 'facebook' | 'twitter' | 'linkedin';
import {
  actionButtonsThree,
  btn,
  buttonWrapper,
  copyButton,
  downloadButton,
} from '../../utils/buttonStyles';
import { cn } from '../../utils/cn';

const PLATFORM_ICONS: Record<SharePlatform, IconType> = {
  instagram: FaInstagram,
  facebook: FaFacebook,
  twitter: FaTwitter,
  linkedin: FaLinkedin,
};

const PLATFORM_COLORS: Record<SharePlatform, string> = {
  instagram: '#E4405F',
  facebook: '#1877F2',
  twitter: '#1DA1F2',
  linkedin: '#0A66C2',
};

interface SharepicShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  sharepicData: {
    image?: string;
    text?: string;
    type?: string;
  };
  socialContent?: string;
  selectedPlatforms?: string[];
}

const SharepicShareModal = ({
  isOpen,
  onClose,
  sharepicData,
  socialContent,
  selectedPlatforms = [],
}: SharepicShareModalProps): JSX.Element => {
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
      void checkShareCapability();
    }
  }, [isOpen]);

  const platformTexts = useMemo(() => {
    if (!socialContent) return {};
    const socialPlatforms = selectedPlatforms.filter(
      (p) => p !== 'sharepic' && p !== 'pressemitteilung'
    ) as SharePlatform[];
    const parsed = parsePlatformSections(socialContent, socialPlatforms);
    return parsed;
  }, [socialContent, selectedPlatforms]);

  const availablePlatforms = useMemo(() => {
    const socialPlatformIds = ['instagram', 'facebook', 'twitter', 'linkedin'];

    // Get platforms from selectedPlatforms (what user chose)
    const userSelectedSocial = selectedPlatforms.filter(
      (p) => p !== 'sharepic' && p !== 'pressemitteilung' && socialPlatformIds.includes(p)
    );

    // If user selected social platforms, show those
    if (userSelectedSocial.length > 0) {
      return userSelectedSocial;
    }

    // Fallback to parsed platforms if no explicit selection
    const parsedPlatforms = Object.keys(platformTexts).filter((p) => socialPlatformIds.includes(p));
    return parsedPlatforms;
  }, [platformTexts, selectedPlatforms]);

  useEffect(() => {
    if (!isOpen) {
      setCopySuccess(null);
      setShareError(null);
    }
  }, [isOpen]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

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

  const handleShareToPlatform = useCallback(
    async (platformId: string) => {
      if (!sharepicData?.image || isSharing) return;

      setIsSharing(true);
      setShareError(null);

      const text = platformTexts[platformId as SharePlatform] || socialContent || '';

      try {
        // Mobile: use native share (best UX)
        if (isMobileDevice() && canShare) {
          const success = await shareImageFile(
            sharepicData.image,
            `Grünerator ${getPlatformDisplayName(platformId)}`
          );
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
    },
    [sharepicData?.image, isSharing, platformTexts, socialContent, canShare]
  );

  const handleDownloadImage = useCallback(
    (platformId: string) => {
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
    },
    [sharepicData?.image]
  );

  const handleCopyText = useCallback(
    async (platformId: string) => {
      const text = platformTexts[platformId as SharePlatform] || socialContent;
      if (!text) return;

      try {
        await copyToClipboard(text);
        setCopySuccess(`text-${platformId}`);
        setTimeout(() => setCopySuccess(null), 2000);
      } catch (error) {
        setShareError('Fehler beim Kopieren des Textes');
      }
    },
    [platformTexts, socialContent]
  );

  if (!isOpen) return null as unknown as JSX.Element;

  const hasPlatforms = availablePlatforms.length > 0;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex justify-center items-center z-[1100] backdrop-blur-[5px] p-md box-border"
      onClick={handleOverlayClick}
    >
      <div
        className="bg-background rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.2)] max-w-[800px] w-full max-h-[90vh] overflow-y-auto animate-[sharepicModalFadeIn_0.25s_ease-out] max-sm:max-w-full max-sm:mx-sm max-sm:max-h-[calc(100vh-var(--spacing-large))] max-sm:rounded-xl max-md:max-w-[95%]"
        ref={modalRef}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-lg py-md border-b border-grey-200 dark:border-grey-700">
          <div className="flex items-center gap-sm">
            <IoShareOutline className="text-[1.25rem] text-primary-600" />
            <h4 className="m-0 text-[1.1rem] font-semibold text-foreground-heading">
              Auf Social Media teilen
            </h4>
          </div>
          <button
            className="bg-transparent border-none cursor-pointer p-xs rounded-lg text-grey-400 transition-all duration-200 flex items-center justify-center hover:bg-background-alt hover:text-foreground [&_svg]:text-[1.25rem]"
            onClick={onClose}
            aria-label="Schließen"
          >
            <HiX />
          </button>
        </div>

        <div className="p-lg grid grid-cols-2 gap-lg items-start max-md:grid-cols-1 max-sm:p-md max-sm:gap-md">
          {sharepicData?.image && (
            <div className="sticky top-lg max-md:relative max-md:top-0">
              <div className="flex justify-center">
                <img
                  src={sharepicData.image}
                  alt="Sharepic"
                  className="max-w-full max-h-[350px] object-contain rounded-xl shadow-md max-md:max-h-[250px] max-sm:max-h-[180px]"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-md">
            {shareError && (
              <div className="text-[#D32F2F] text-[0.85rem] text-center p-sm bg-[rgba(220,38,38,0.1)] rounded-lg col-span-full">
                {shareError}
              </div>
            )}

            {hasPlatforms ? (
              <div className="flex flex-col gap-md">
                {availablePlatforms.map((platformId) => {
                  const Icon = PLATFORM_ICONS[platformId as SharePlatform];
                  const platformText = platformTexts[platformId as SharePlatform];
                  const color = PLATFORM_COLORS[platformId as SharePlatform];

                  return (
                    <div
                      key={platformId}
                      className="bg-background-alt rounded-xl overflow-hidden border border-grey-200 dark:border-grey-700"
                    >
                      <div
                        className="flex items-center gap-sm px-md py-sm border-l-[3px] bg-background"
                        style={{ borderLeftColor: color }}
                      >
                        {Icon && <Icon className="text-[1.1rem]" style={{ color }} />}
                        <span className="font-semibold text-[0.95rem] text-foreground-heading">
                          {getPlatformDisplayName(platformId)}
                        </span>
                      </div>

                      {(platformText || socialContent) && (
                        <div className="px-md py-sm border-t border-grey-200 dark:border-grey-700">
                          <div className="text-[0.85rem] text-grey-400 leading-[1.4] whitespace-pre-wrap break-words max-sm:text-[0.8rem]">
                            {(() => {
                              const text = platformText || socialContent || '';
                              return text.length > 150 ? text.substring(0, 150) + '...' : text;
                            })()}
                          </div>
                        </div>
                      )}

                      <div
                        className={cn(
                          actionButtonsThree,
                          'px-md py-sm mb-0 max-sm:flex-col max-sm:gap-xs [&_.button-wrapper]:flex-1 [&_.button-wrapper]:min-w-0 max-sm:[&_.button-wrapper]:flex-none max-sm:[&_.button-wrapper]:w-full [&_button]:w-full [&_button]:whitespace-nowrap [&_button]:text-[0.85rem] [&_button]:h-10 [&_button]:rounded-[var(--button-border-radius,7px)]'
                        )}
                      >
                        {(platformText || socialContent) && (
                          <div className={buttonWrapper}>
                            <button
                              className={cn(copyButton, 'flex items-center justify-center gap-1.5')}
                              onClick={() => handleCopyText(platformId)}
                              disabled={isSharing}
                            >
                              {copySuccess === `text-${platformId}` ? (
                                <>
                                  <HiCheck /> Kopiert!
                                </>
                              ) : (
                                <>
                                  <IoCopyOutline /> Text kopieren
                                </>
                              )}
                            </button>
                          </div>
                        )}
                        <div className={buttonWrapper}>
                          <button
                            className={cn(copyButton, 'flex items-center justify-center gap-1.5')}
                            onClick={() => handleShareToPlatform(platformId)}
                            disabled={isSharing}
                          >
                            {Icon && <Icon />}
                            {copySuccess === `shared-${platformId}` ? (
                              <span>
                                {platformId === 'instagram' && !isMobileDevice()
                                  ? 'Bild kopiert!'
                                  : 'Geöffnet!'}
                              </span>
                            ) : (
                              <span>
                                {platformId === 'instagram' && !isMobileDevice()
                                  ? 'Bild kopieren'
                                  : isMobileDevice()
                                    ? 'Teilen'
                                    : `Auf ${getPlatformDisplayName(platformId)} posten`}
                              </span>
                            )}
                          </button>
                        </div>
                        <div className={buttonWrapper}>
                          <button
                            className={cn(
                              downloadButton,
                              'flex items-center justify-center gap-1.5'
                            )}
                            onClick={() => handleDownloadImage(platformId)}
                            disabled={isSharing}
                          >
                            {copySuccess === `downloaded-${platformId}` ? (
                              <>
                                <HiCheck /> Heruntergeladen!
                              </>
                            ) : (
                              <>
                                <HiDownload /> Herunterladen
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-sm">
                <p className="text-grey-400 m-0 text-center">
                  Teile dein Sharepic auf Social Media:
                </p>
                <div
                  className={cn(
                    actionButtonsThree,
                    'p-0 max-sm:flex-col max-sm:gap-xs max-sm:[&_.button-wrapper]:flex-none max-sm:[&_.button-wrapper]:w-full [&_button]:w-full [&_button]:whitespace-nowrap [&_button]:text-[0.85rem] [&_button]:h-10 [&_button]:rounded-[var(--button-border-radius,7px)]'
                  )}
                >
                  {socialContent && (
                    <div className={buttonWrapper}>
                      <button className={copyButton} onClick={() => handleCopyText('default')}>
                        {copySuccess === 'text-default' ? (
                          <>
                            <HiCheck /> Kopiert!
                          </>
                        ) : (
                          <>
                            <IoCopyOutline /> Text kopieren
                          </>
                        )}
                      </button>
                    </div>
                  )}
                  <div className={buttonWrapper}>
                    <button
                      className={btn.primary}
                      onClick={() => handleShareToPlatform('instagram')}
                      disabled={isSharing}
                    >
                      {isMobileDevice() ? (
                        <>
                          <IoShareOutline /> Bild teilen
                        </>
                      ) : (
                        <>
                          <FaInstagram /> Bild kopieren
                        </>
                      )}
                    </button>
                  </div>
                  <div className={buttonWrapper}>
                    <button
                      className={downloadButton}
                      onClick={() => handleDownloadImage('sharepic')}
                      disabled={isSharing}
                    >
                      <HiDownload /> Herunterladen
                    </button>
                  </div>
                </div>
              </div>
            )}

            <p className="text-center text-grey-400 text-[0.85rem] p-sm bg-background-alt rounded-lg mt-auto">
              {isMobileDevice()
                ? 'Tipp: Nach dem Teilen den kopierten Text in die Bildunterschrift einfügen.'
                : 'Tipp: Kopiere zuerst den Text, dann klicke auf die Plattform. Das Bild kannst du separat herunterladen und hochladen.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharepicShareModal;
