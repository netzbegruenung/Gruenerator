import React, { useState, useEffect, type JSX } from 'react';
import { HiDownload } from 'react-icons/hi';

import { useAltTextStore } from '../../features/image-studio/hooks/useAltText';
import { cn } from '../../utils/cn';
import useAltTextGeneration from '../hooks/useAltTextGeneration';
import { ProfileIconButton, ProfileActionButton } from '../profile/actions/ProfileActionButton';
import apiClient from '../utils/apiClient';

import CanvaTemplateModal from './CanvaTemplateModal';
import CopyButton from './CopyButton';
import HelpTooltip from './HelpTooltip';
import SharepicShareModal from './SharepicShareModal';

/**
 * Component for displaying generated images with preview, lightbox, and download functionality
 * @param {Object} props - Component props
 * @param {Object|Array} props.sharepicData - Single image data object or array of image data objects
 * @param {string} props.sharepicData.text - The generated text/description (for single)
 * @param {string} props.sharepicData.image - Base64 encoded image data (for single)
 * @param {string} props.sharepicData.type - The type of image (info, quote, etc.) (for single)
 * @param {Function} props.onEdit - Callback function when edit button is clicked (optional)
 * @returns {JSX.Element} ImageDisplay component
 */
export interface SharepicDataItem {
  text?: string;
  image?: string;
  type?: string;
  canvaTemplateUrl?: string;
  canvaPreviewImage?: string;
  previewImage?: string;
  slogans?: string[];
  line1?: string;
  line2?: string;
  line3?: string;
  line4?: string;
  line5?: string;
  [key: string]: unknown;
}

interface ImageDisplayProps {
  sharepicData: SharepicDataItem | SharepicDataItem[];
  onEdit?: (sharepic: SharepicDataItem) => void;
  showEditButton?: boolean;
  title?: string;
  downloadButtonText?: string;
  downloadFilename?: string;
  enableKiLabel?: boolean;
  enableCanvaEdit?: boolean;
  canvaTemplateUrl?: string;
  onSharepicUpdate?: (data: SharepicDataItem | SharepicDataItem[]) => void;
  minimal?: boolean;
  onEditModeToggle?: () => void;
  editMode?: string;
  socialContent?: string;
  selectedPlatforms?: string[];
  fullscreenMode?: boolean;
}

const ImageDisplay = ({
  sharepicData,
  onEdit,
  showEditButton = true,
  title = 'Generiertes Bild',
  downloadButtonText = 'Bild herunterladen',
  downloadFilename,
  enableKiLabel = false,
  enableCanvaEdit = false,
  canvaTemplateUrl,
  onSharepicUpdate,
  minimal = false,
  onEditModeToggle,
  editMode,
  socialContent,
  selectedPlatforms = [],
  fullscreenMode = false,
}: ImageDisplayProps): JSX.Element | null => {
  // Determine if we have multiple sharepics
  const isMultiple = Array.isArray(sharepicData);
  const sharepicItems = isMultiple ? sharepicData.filter(Boolean) : [sharepicData];

  // State for multiple image handling
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const currentSharepic = sharepicItems[activeImageIndex] || sharepicItems[0];
  // Lightbox state
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isKiLabelLoading, setIsKiLabelLoading] = useState(false);
  const [kiLabelError, setKiLabelError] = useState<string | null>(null);
  const [isCanvaModalOpen, setIsCanvaModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Determine if share button should be shown (when social content and platforms are available)
  const showShareButton = socialContent && selectedPlatforms && selectedPlatforms.length > 0;

  // Resolve Canva template URL (prop > sharepicData > null)
  const resolvedCanvaUrl = canvaTemplateUrl || currentSharepic?.canvaTemplateUrl || null;
  const resolvedCanvaPreview =
    currentSharepic?.canvaPreviewImage || currentSharepic?.previewImage || null;
  const showCanvaButton = enableCanvaEdit && !!resolvedCanvaUrl;

  // Alt text functionality
  const { generateAltTextForImage } = useAltTextGeneration();
  const {
    altText,
    isAltTextLoading,
    altTextError,
    showAltText,
    setAltText,
    setAltTextLoading,
    setAltTextError,
    setShowAltText,
  } = useAltTextStore();

  // Compute values needed by hooks
  const effectiveDownloadFilename = downloadFilename || 'sharepic.png';

  // All hooks must be called before any early returns
  // Keyboard event listener for lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isLightboxOpen) {
        setIsLightboxOpen(false);
      }
    };

    if (isLightboxOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden'; // Prevent background scroll
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isLightboxOpen]);

  const handleDownload = React.useCallback(
    (imageIndex: number | null = null) => {
      if (!sharepicItems.length) return;
      try {
        const targetSharepic = imageIndex !== null ? sharepicItems[imageIndex] : currentSharepic;
        const targetFilename =
          imageIndex !== null
            ? `${effectiveDownloadFilename.replace(/\.([^.]+)$/, '')}-${imageIndex + 1}.$1`
            : effectiveDownloadFilename;

        const link = document.createElement('a');
        link.href = targetSharepic?.image || '';
        link.download = targetFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (error) {
        console.error('[ImageDisplay] Download failed:', error);
      }
    },
    [sharepicItems, currentSharepic, effectiveDownloadFilename]
  );

  const handleDownloadAll = React.useCallback(() => {
    sharepicItems.forEach((_item, index) => {
      setTimeout(() => {
        handleDownload(index);
      }, index * 200);
    });
  }, [sharepicItems, handleDownload]);

  // Early return after all hooks
  if (!sharepicItems.length || !sharepicItems.some((item) => item?.image)) {
    return null;
  }

  // Lightbox handlers
  const openLightbox = () => setIsLightboxOpen(true);
  const closeLightbox = () => setIsLightboxOpen(false);

  const handleLightboxOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeLightbox();
    }
  };

  const handleGenerateAltText = async () => {
    if (isAltTextLoading || isKiLabelLoading) return;

    setAltTextLoading(true);
    setAltTextError(null);

    try {
      // Extract base64 data from image
      const imageBase64 = (currentSharepic.image || '').replace(/^data:image\/[^;]+;base64,/, '');

      // Generate alt text using the existing hook
      const textInput = typeof currentSharepic.text === 'string' ? currentSharepic.text : null;
      const response = await generateAltTextForImage(imageBase64, textInput);

      if (
        response &&
        typeof response === 'object' &&
        'altText' in response &&
        typeof response.altText === 'string'
      ) {
        setAltText(response.altText);
        setShowAltText(true);
      } else {
        throw new Error('Keine Alt-Text-Antwort erhalten');
      }
    } catch (error) {
      console.error('[ImageDisplay] Alt text generation failed:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Fehler bei der Alt-Text-Generierung';
      setAltTextError(errorMessage);
    } finally {
      setAltTextLoading(false);
    }
  };

  const handleEditSharepic = async () => {
    // Priority 1: Inline edit mode (for Kampagnen)
    if (editMode === 'inline' && onEditModeToggle && typeof onEditModeToggle === 'function') {
      console.log('[ImageDisplay] Triggering inline edit mode');
      onEditModeToggle();
      return;
    }

    // Priority 2: Custom onEdit handler (for PresseSocial)
    if (onEdit && typeof onEdit === 'function') {
      onEdit(currentSharepic);
      return;
    }

    // Priority 3: Default behavior (new tab with sessionStorage)
    // Create unique editing session ID
    const editingSessionId = `sharepic-edit-${Date.now()}`;

    try {
      let imageSessionId = null;

      // Upload image to backend Redis storage if available
      if (currentSharepic.image) {
        try {
          const imageResponse = await apiClient.post('/sharepic/edit-session', {
            imageData: currentSharepic.image,
            metadata: {
              type: currentSharepic.type,
              timestamp: Date.now(),
            },
          });

          // Handle Axios response wrapper - extract data
          const result = imageResponse.data || imageResponse;
          imageSessionId = result.sessionId;
          console.log('[ImageDisplay] Image stored in backend:', imageSessionId);
        } catch (imageUploadError) {
          console.warn('[ImageDisplay] Failed to store image in backend:', imageUploadError);
        }
      }

      // Store minimal data in sessionStorage
      const sessionData = {
        text: currentSharepic.text,
        type: currentSharepic.type,
        slogans: currentSharepic.slogans,
        hasImage: !!currentSharepic.image,
        imageSessionId: imageSessionId, // Store session ID instead of image
      };

      sessionStorage.setItem(
        editingSessionId,
        JSON.stringify({
          source: 'presseSocial',
          data: sessionData,
          timestamp: Date.now(),
        })
      );
    } catch (error) {
      console.error('[ImageDisplay] Error preparing edit session:', error);
      // Fallback: store without image
      sessionStorage.setItem(
        editingSessionId,
        JSON.stringify({
          source: 'presseSocial',
          data: {
            text: currentSharepic.text,
            type: currentSharepic.type,
            slogans: currentSharepic.slogans,
            hasImage: false,
          },
          timestamp: Date.now(),
        })
      );
    }

    // Open Image Studio in new tab with editing session
    const url = new URL(window.location.origin + '/studio/templates');
    url.searchParams.append('editSession', editingSessionId);
    window.open(url.toString(), '_blank');
  };

  const resetAltTextState = () => {
    setAltText('');
    setAltTextError(null);
    setShowAltText(false);
  };

  const handleAddKiLabel = async () => {
    if (!enableKiLabel || isKiLabelLoading || !currentSharepic?.image) {
      return;
    }

    setKiLabelError(null);
    setIsKiLabelLoading(true);

    try {
      const response = await fetch(currentSharepic.image);
      if (!response.ok) {
        throw new Error('Bild konnte nicht gelesen werden.');
      }

      const blob = await response.blob();
      const mimeType = blob.type || 'image/png';
      const extension = mimeType.split('/')[1] || 'png';

      const formData = new FormData();
      formData.append('image', blob, `imagine-sharepic.${extension}`);

      const labelResponse = await apiClient.post('/imagine_label_canvas', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const labeledImage = labelResponse?.data?.image;
      if (!labeledImage) {
        throw new Error('Keine Antwort vom KI-Label-Service erhalten.');
      }

      if (typeof onSharepicUpdate === 'function') {
        // Update the current sharepic in the array if multiple, or single item
        if (isMultiple) {
          const updatedItems = [...sharepicItems];
          updatedItems[activeImageIndex] = { ...currentSharepic, image: labeledImage };
          onSharepicUpdate(updatedItems);
        } else {
          onSharepicUpdate({ ...currentSharepic, image: labeledImage });
        }
      }

      resetAltTextState();
    } catch (error) {
      console.error('[ImageDisplay] KI label generation failed:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Fehler beim Hinzufügen des KI-Labels';
      setKiLabelError(errorMessage);
    } finally {
      setIsKiLabelLoading(false);
    }
  };

  const effectiveDownloadText = minimal ? 'Herunterladen' : downloadButtonText;

  return (
    <>
      <div
        className={cn(
          'flex flex-col gap-md rounded-lg border border-grey-200 bg-background-alt p-md text-base dark:border-grey-700 max-md:gap-sm max-md:p-sm',
          isMultiple && 'gap-lg',
          fullscreenMode &&
            'items-center justify-center border-none bg-transparent p-lg max-md:min-h-[40vh] max-md:p-md min-h-[50vh] max-sm:p-sm'
        )}
      >
        {!minimal && (
          <div className="mb-sm flex flex-wrap items-center justify-between gap-sm max-md:flex-col max-md:items-start">
            <h4 className="m-0">
              {isMultiple ? `${title} (${sharepicItems.length} Bilder)` : title}
            </h4>
          </div>
        )}

        <div className={cn('flex flex-col items-center gap-md', fullscreenMode && 'w-full')}>
          {isMultiple && !minimal && (
            <div className="flex max-w-full flex-wrap items-center justify-center gap-sm rounded-sm border border-grey-200 bg-background p-sm dark:border-grey-700 max-md:flex-nowrap max-md:justify-start max-md:overflow-x-auto max-md:[scrollbar-width:thin] max-md:[-webkit-overflow-scrolling:touch] max-sm:gap-xs max-sm:p-xs">
              {sharepicItems.map((item, index) => (
                <button
                  key={index}
                  className={cn(
                    'flex min-w-[80px] flex-shrink-0 cursor-pointer flex-col items-center gap-xs rounded-sm border-2 border-transparent bg-transparent p-xs transition-all duration-200 max-md:min-w-[70px] max-sm:min-w-[60px]',
                    index === activeImageIndex
                      ? 'border-[var(--interactive-accent-color)] bg-background-alt shadow-sm'
                      : 'hover:border-[var(--klee)] hover:bg-background-alt'
                  )}
                  onClick={() => setActiveImageIndex(index)}
                  title={`${item.type || 'Sharepic'} ${index + 1}`}
                >
                  <img
                    src={item.image}
                    alt={`Thumbnail ${index + 1}`}
                    className="h-10 w-[60px] rounded border border-grey-200 object-cover dark:border-grey-700 max-md:h-[35px] max-md:w-[50px] max-sm:h-[30px] max-sm:w-10"
                  />
                  <span className="max-w-[80px] truncate text-center text-xs font-medium capitalize text-foreground max-sm:max-w-[60px] max-sm:text-[0.7rem]">
                    {item.type || `Bild ${index + 1}`}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className={cn('flex w-full justify-center', fullscreenMode && 'w-full')}>
            <div
              className={cn(
                'relative inline-block',
                fullscreenMode && 'flex flex-col items-center'
              )}
            >
              <img
                src={currentSharepic.image}
                alt="Generiertes Bild"
                className={cn(
                  fullscreenMode
                    ? 'max-h-[65vh] max-w-full cursor-pointer rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.15)] transition-all duration-200 hover:scale-[1.01] hover:shadow-[0_12px_40px_rgba(0,0,0,0.2)] max-md:max-h-[50vh] max-md:rounded-lg max-sm:max-h-[45vh]'
                    : 'w-full max-w-[300px] cursor-pointer rounded-lg border border-grey-200 shadow-[0_2px_8px_rgba(0,0,0,0.1)] transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)] dark:border-grey-700 max-md:max-w-[250px] max-sm:max-w-[200px]'
                )}
                onClick={openLightbox}
              />
              <div
                className={cn(
                  fullscreenMode
                    ? 'mt-md static flex gap-sm rounded-3xl bg-background-alt px-md py-sm shadow-[0_2px_8px_rgba(0,0,0,0.1)] max-md:flex-wrap max-md:justify-center'
                    : 'absolute right-xs top-sm z-[2] flex gap-xs'
                )}
              >
                <ProfileIconButton
                  action="altText"
                  onClick={handleGenerateAltText}
                  disabled={isAltTextLoading || isKiLabelLoading}
                  loading={isAltTextLoading}
                  size="s"
                  className={cn(
                    '!flex !items-center !justify-center !rounded-full !border-none !p-xs',
                    fullscreenMode
                      ? '!min-h-10 !min-w-10 !bg-background !text-foreground hover:!bg-[var(--klee)] hover:!text-white max-sm:!min-h-9 max-sm:!min-w-9'
                      : '!min-h-8 !min-w-8 !bg-black/60 !text-white hover:!bg-black/80'
                  )}
                  title="Alt-Text generieren"
                />
                {enableKiLabel && (
                  <ProfileIconButton
                    action="kiLabel"
                    onClick={handleAddKiLabel}
                    disabled={isKiLabelLoading || isAltTextLoading}
                    loading={isKiLabelLoading}
                    size="s"
                    className={cn(
                      '!flex !items-center !justify-center !rounded-full !border-none !p-xs',
                      fullscreenMode
                        ? '!min-h-10 !min-w-10 !bg-background !text-foreground hover:!bg-[var(--klee)] hover:!text-white max-sm:!min-h-9 max-sm:!min-w-9'
                        : '!min-h-8 !min-w-8 !bg-black/60 !text-white hover:!bg-black/80'
                    )}
                    title="KI-Label hinzufügen"
                  />
                )}
                {showCanvaButton && (
                  <ProfileIconButton
                    action="canva"
                    onClick={() => setIsCanvaModalOpen(true)}
                    size="s"
                    className={cn(
                      '!flex !items-center !justify-center !rounded-full !border-none !p-xs',
                      fullscreenMode
                        ? '!min-h-10 !min-w-10 !bg-background !text-foreground hover:!bg-[var(--klee)] hover:!text-white max-sm:!min-h-9 max-sm:!min-w-9'
                        : '!min-h-8 !min-w-8 !bg-black/60 !text-white hover:!bg-black/80'
                    )}
                    title="In Canva bearbeiten"
                  />
                )}
                {showEditButton && (
                  <ProfileIconButton
                    action="edit"
                    onClick={handleEditSharepic}
                    size="s"
                    className={cn(
                      '!flex !items-center !justify-center !rounded-full !border-none !p-xs',
                      fullscreenMode
                        ? '!min-h-10 !min-w-10 !bg-background !text-foreground hover:!bg-[var(--klee)] hover:!text-white max-sm:!min-h-9 max-sm:!min-w-9'
                        : '!min-h-8 !min-w-8 !bg-black/60 !text-white hover:!bg-black/80'
                    )}
                    title="Bild bearbeiten"
                  />
                )}
                {showShareButton && (
                  <ProfileIconButton
                    action="share"
                    onClick={() => setIsShareModalOpen(true)}
                    size="s"
                    className={cn(
                      '!flex !items-center !justify-center !rounded-full !border-none !p-xs',
                      fullscreenMode
                        ? '!min-h-10 !min-w-10 !bg-background !text-foreground hover:!bg-[var(--klee)] hover:!text-white max-sm:!min-h-9 max-sm:!min-w-9'
                        : '!min-h-8 !min-w-8 !bg-black/60 !text-white hover:!bg-black/80'
                    )}
                    title="Bild teilen"
                  />
                )}
                <ProfileIconButton
                  action="download"
                  onClick={() => handleDownload()}
                  size="s"
                  className={cn(
                    '!flex !items-center !justify-center !rounded-full !border-none !p-xs',
                    fullscreenMode
                      ? '!min-h-10 !min-w-10 !bg-background !text-foreground hover:!bg-[var(--klee)] hover:!text-white max-sm:!min-h-9 max-sm:!min-w-9'
                      : '!min-h-8 !min-w-8 !bg-black/60 !text-white hover:!bg-black/80'
                  )}
                  title="Bild herunterladen"
                />
              </div>
            </div>
          </div>

          {!minimal && kiLabelError && (
            <div className="mt-sm text-center text-sm text-[var(--error-color,#d73a49)]">
              <span>⚠️ {kiLabelError}</span>
            </div>
          )}
        </div>

        {/* Alt text display section */}
        {!minimal && showAltText && (
          <div className="alt-text-inline-section">
            <div className="alt-text-header">
              <h3>Alt-Text für Barrierefreiheit</h3>
              <HelpTooltip>
                <p>
                  Alt-Text beschreibt Bilder für Menschen mit Sehbehinderung. Er wird von
                  Screenreadern vorgelesen und macht Inhalte barrierefrei.
                </p>
                <p>
                  <a
                    href="https://www.dbsv.org/bildbeschreibung-4-regeln.html"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    DBSV-Richtlinien für Bildbeschreibungen →
                  </a>
                </p>
              </HelpTooltip>
              {altText && !isAltTextLoading && (
                <CopyButton
                  directContent={altText}
                  variant="icon"
                  className="alt-text-copy-button"
                />
              )}
            </div>

            {isAltTextLoading && (
              <div className="alt-text-loading">
                <span className="loading-spinner">⏳</span>
                <span>Alt-Text wird generiert...</span>
              </div>
            )}

            {altTextError && (
              <div className="alt-text-error">
                <span>⚠️</span>
                <span>Fehler bei der Alt-Text-Generierung: {altTextError}</span>
              </div>
            )}

            {altText && !isAltTextLoading && <div className="alt-text-content">{altText}</div>}
          </div>
        )}
      </div>

      {/* Canva Template Modal */}
      {isCanvaModalOpen && resolvedCanvaUrl && (
        <CanvaTemplateModal
          url={resolvedCanvaUrl}
          previewImage={resolvedCanvaPreview ?? undefined}
          sharepicLines={{
            line1: currentSharepic?.line1,
            line2: currentSharepic?.line2,
            line3: currentSharepic?.line3,
            line4: currentSharepic?.line4,
            line5: currentSharepic?.line5,
          }}
          onClose={() => setIsCanvaModalOpen(false)}
        />
      )}

      {/* Share Modal */}
      <SharepicShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        sharepicData={currentSharepic}
        socialContent={socialContent}
        selectedPlatforms={selectedPlatforms}
      />

      {/* Lightbox */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/90 p-md animate-[fadeIn_0.3s_ease-out]"
          onClick={handleLightboxOverlayClick}
        >
          <div className="relative flex max-h-[95vh] max-w-[95vw] items-center justify-center animate-[scaleIn_0.3s_ease-out]">
            <button
              className="absolute right-md top-md z-[1101] flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none bg-black/70 text-2xl leading-none text-white transition-all duration-200 hover:scale-110 hover:bg-black/90"
              onClick={closeLightbox}
              aria-label="Lightbox schließen"
            >
              ×
            </button>
            {isMultiple && sharepicItems.length > 1 && (
              <>
                <button
                  className="absolute left-md top-1/2 z-[1102] flex h-[50px] w-[50px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-none bg-black/70 text-xl font-bold text-white transition-all duration-200 hover:scale-110 hover:bg-black/90 max-md:h-10 max-md:w-10 max-md:text-base max-sm:h-[35px] max-sm:w-[35px] max-sm:text-sm"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    setActiveImageIndex(
                      (prev) => (prev - 1 + sharepicItems.length) % sharepicItems.length
                    );
                  }}
                  title="Vorheriges Bild"
                >
                  ←
                </button>
                <button
                  className="absolute right-md top-1/2 z-[1102] flex h-[50px] w-[50px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-none bg-black/70 text-xl font-bold text-white transition-all duration-200 hover:scale-110 hover:bg-black/90 max-md:h-10 max-md:w-10 max-md:text-base max-sm:h-[35px] max-sm:w-[35px] max-sm:text-sm"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    setActiveImageIndex((prev) => (prev + 1) % sharepicItems.length);
                  }}
                  title="Nächstes Bild"
                >
                  →
                </button>
              </>
            )}
            <img
              src={currentSharepic.image}
              alt="Vergrößertes Bild"
              className="max-h-[90vh] max-w-[90vw] rounded-md object-contain shadow-[0_8px_32px_rgba(0,0,0,0.4)] max-md:max-h-[85%] max-md:max-w-[95%]"
            />
            {isMultiple && (
              <div className="absolute bottom-md left-1/2 z-[1102] flex -translate-x-1/2 items-center gap-xs rounded-sm bg-black/70 px-sm py-xs text-sm text-white">
                <span>
                  {activeImageIndex + 1} / {sharepicItems.length}
                </span>
                {currentSharepic.type && (
                  <span className="italic opacity-80">({currentSharepic.type})</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default React.memo(ImageDisplay);
