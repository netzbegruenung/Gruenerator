import { useShareStore } from '@gruenerator/shared/share';
import { useCallback, useState, useMemo, useRef, useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  FaDownload,
  FaImages,
  FaSave,
  FaCheck,
  FaInstagram,
  FaCopy,
  FaFileArchive,
  FaFileImage,
} from 'react-icons/fa';
import { IoCheckmarkOutline, IoShareOutline } from 'react-icons/io5';
import { MdTextFields } from 'react-icons/md';

// TODO: enable when push-to-phone backend is deployed
// import { PushToPhoneButton } from '../../../../../components/common/PushToPhoneButton';
import Spinner from '../../../../../components/common/Spinner';
import { useGenerateSocialPost } from '../../../../../components/hooks/useGenerateSocialPost';
import { useAutoSaveStore } from '../../../hooks/useAutoSaveStore';
import { SubsectionTabBar } from '../SubsectionTabBar';
import '../../../../../assets/styles/features/templates.css';

export interface GenericShareSectionProps {
  exportedImage: string | null;
  shareToken: string | null;
  onCaptureCanvas: () => void;
  onDownload: () => void;
  onNavigateToGallery: () => void;
  canvasText: string;
  canvasType: string;
  // Multi-page export props
  pageCount?: number;
  onDownloadAllZip?: () => Promise<void>;
  onShareAllPages?: () => Promise<void>;
  isMultiExporting?: boolean;
  exportProgress?: { current: number; total: number };
}

// Reusable hook for portal dropdown positioning + click-outside
function usePortalDropdown() {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const position = () => {
      if (!triggerRef.current || !menuRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const menuRect = menuRef.current.getBoundingClientRect();
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openAbove = spaceBelow < menuRect.height + 8 && spaceAbove > spaceBelow;

      setStyle({
        position: 'fixed',
        left: `${Math.max(8, Math.min(rect.left + rect.width / 2 - menuRect.width / 2, window.innerWidth - menuRect.width - 8))}px`,
        ...(openAbove
          ? { bottom: `${window.innerHeight - rect.top + 6}px`, top: 'auto' }
          : { top: `${rect.bottom + 6}px`, bottom: 'auto' }),
        zIndex: 10000,
        opacity: 1,
      });
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    const frame = requestAnimationFrame(position);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      cancelAnimationFrame(frame);
    };
  }, [open]);

  return { open, setOpen, style, triggerRef, menuRef };
}

// Download & Share Subsection - combined with dropdown for multi-page
function DownloadShareSubsection({
  exportedImage,
  shareToken,
  onCaptureCanvas,
  onDownload,
  onNavigateToGallery,
  canvasText,
  pageCount = 1,
  onDownloadAllZip,
  onShareAllPages,
  isMultiExporting = false,
  exportProgress,
}: Omit<GenericShareSectionProps, 'canvasType'>) {
  const [downloadState, setDownloadState] = useState<'idle' | 'capturing' | 'success'>('idle');
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

  const dlDropdown = usePortalDropdown();
  const shareDropdown = usePortalDropdown();

  const autoSaveStatus = useAutoSaveStore((s) => s.autoSaveStatus);
  const canUseNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const isMultiPage = pageCount > 1 && onDownloadAllZip;

  const handleSingleDownload = async () => {
    dlDropdown.setOpen(false);
    setDownloadState('capturing');
    try {
      onCaptureCanvas();
      await new Promise((resolve) => setTimeout(resolve, 150));
      onDownload();
      setDownloadState('success');
      setTimeout(() => setDownloadState('idle'), 1500);
    } catch (error) {
      console.error('[DownloadShareSubsection] Download failed:', error);
      setDownloadState('idle');
    }
  };

  const handleDownloadAllZip = async () => {
    dlDropdown.setOpen(false);
    if (onDownloadAllZip) {
      await onDownloadAllZip();
    }
  };

  const handleDownloadClick = async () => {
    if (isMultiPage) {
      dlDropdown.setOpen((prev) => !prev);
    } else {
      await handleSingleDownload();
    }
  };

  const handleNativeShare = useCallback(async () => {
    shareDropdown.setOpen(false);
    if (!exportedImage) {
      onCaptureCanvas();
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    const imageToShare = exportedImage || useAutoSaveStore.getState().autoSavedShareToken;
    if (!imageToShare) return;

    setIsSharing(true);
    try {
      const blob = await (await fetch(exportedImage!)).blob();
      const file = new File([blob], 'gruenerator.png', { type: 'image/png' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          text: canvasText,
          title: 'Grünerator Share',
        });
      } else {
        await navigator.share({
          text: canvasText,
          title: 'Grünerator Share',
        });
      }
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2000);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    } finally {
      setIsSharing(false);
    }
  }, [exportedImage, canvasText, onCaptureCanvas, shareDropdown]);

  const handleShareAllPages = useCallback(async () => {
    shareDropdown.setOpen(false);
    if (!onShareAllPages) return;
    setIsSharing(true);
    try {
      await onShareAllPages();
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2000);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Share all pages failed:', err);
      }
    } finally {
      setIsSharing(false);
    }
  }, [onShareAllPages, shareDropdown]);

  const handleShareClick = useCallback(async () => {
    if (isMultiPage && onShareAllPages) {
      shareDropdown.setOpen((prev) => !prev);
    } else {
      await handleNativeShare();
    }
  }, [isMultiPage, onShareAllPages, shareDropdown, handleNativeShare]);

  return (
    <div className="share-subsection">
      <h3 className="share-subsection__title">Download & Teilen</h3>

      <div className="platform-icons">
        <div className="download-dropdown-container">
          <button
            ref={dlDropdown.triggerRef}
            className="platform-icon-btn platform-icon-btn--download"
            onClick={handleDownloadClick}
            disabled={downloadState !== 'idle' && !isMultiPage}
            title="Herunterladen"
            aria-label="Bild herunterladen"
            aria-haspopup={isMultiPage ? 'menu' : undefined}
            aria-expanded={isMultiPage ? dlDropdown.open : undefined}
            type="button"
          >
            {downloadState === 'capturing' ? (
              <Spinner size="small" />
            ) : downloadState === 'success' ? (
              <FaCheck />
            ) : (
              <FaDownload />
            )}
          </button>

          {dlDropdown.open &&
            isMultiPage &&
            createPortal(
              <div
                ref={dlDropdown.menuRef}
                className="download-dropdown-content"
                style={dlDropdown.style}
                role="menu"
              >
                <button
                  className="download-dropdown-option"
                  onClick={handleSingleDownload}
                  role="menuitem"
                  type="button"
                >
                  <FaFileImage />
                  <span>Diese Seite (PNG)</span>
                </button>
                <button
                  className="download-dropdown-option"
                  onClick={handleDownloadAllZip}
                  disabled={isMultiExporting}
                  role="menuitem"
                  type="button"
                >
                  {isMultiExporting ? (
                    <>
                      <Spinner size="small" />
                      <span>Exportiere...</span>
                    </>
                  ) : (
                    <>
                      <FaFileArchive />
                      <span>Alle {pageCount} Seiten (ZIP)</span>
                    </>
                  )}
                </button>
              </div>,
              document.body
            )}
        </div>

        {canUseNativeShare && (
          <div className="download-dropdown-container">
            <button
              ref={shareDropdown.triggerRef}
              className="platform-icon-btn platform-icon-btn--native"
              onClick={handleShareClick}
              disabled={isSharing}
              title="Teilen"
              aria-label="Bild teilen"
              aria-haspopup={isMultiPage && onShareAllPages ? 'menu' : undefined}
              aria-expanded={isMultiPage && onShareAllPages ? shareDropdown.open : undefined}
              type="button"
            >
              {isSharing ? (
                <Spinner size="small" />
              ) : shareSuccess ? (
                <FaCheck />
              ) : (
                <IoShareOutline />
              )}
            </button>

            {shareDropdown.open &&
              isMultiPage &&
              onShareAllPages &&
              createPortal(
                <div
                  ref={shareDropdown.menuRef}
                  className="download-dropdown-content"
                  style={shareDropdown.style}
                  role="menu"
                >
                  <button
                    className="download-dropdown-option"
                    onClick={handleNativeShare}
                    role="menuitem"
                    type="button"
                  >
                    <IoShareOutline />
                    <span>Diese Seite teilen</span>
                  </button>
                  <button
                    className="download-dropdown-option"
                    onClick={handleShareAllPages}
                    disabled={isSharing}
                    role="menuitem"
                    type="button"
                  >
                    <FaImages />
                    <span>Alle Seiten teilen</span>
                  </button>
                </div>,
                document.body
              )}
          </div>
        )}

        {/* TODO: enable when push-to-phone backend is deployed
        <PushToPhoneButton shareToken={shareToken} onCaptureCanvas={onCaptureCanvas} />
        */}
      </div>

      {/* Multi-page export progress */}
      {isMultiExporting && exportProgress && exportProgress.total > 0 && (
        <div className="multi-page-download__progress">
          <div
            className="multi-page-download__progress-bar"
            style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }}
          />
          <span className="multi-page-download__progress-text">
            {exportProgress.current}/{exportProgress.total} Seiten
          </span>
        </div>
      )}

      {downloadState === 'success' && autoSaveStatus === 'saving' && (
        <div className="share-status">
          <Spinner size="small" />
          <span>Wird synchronisiert...</span>
        </div>
      )}

      {downloadState === 'success' && autoSaveStatus === 'saved' && shareToken && (
        <>
          <div className="share-status share-status--success">
            <IoCheckmarkOutline />
            <span>In Galerie gesichert</span>
          </div>
          <button className="btn btn-secondary" onClick={onNavigateToGallery} type="button">
            <FaImages />
            Zur Galerie
          </button>
        </>
      )}

      {downloadState === 'success' && autoSaveStatus === 'error' && (
        <div className="share-status share-status--error">
          <span>Fehler beim Speichern</span>
        </div>
      )}
    </div>
  );
}

// Template Subsection
function TemplateSubsection({
  shareToken,
  onCaptureCanvas,
  canvasType,
}: Pick<GenericShareSectionProps, 'shareToken' | 'onCaptureCanvas' | 'canvasType'>) {
  const [isSaving, setIsSaving] = useState(false);
  const [templateUrl, setTemplateUrl] = useState<string | null>(null);
  const { saveAsTemplate } = useShareStore();
  const currentShareToken = useAutoSaveStore((s) => s.autoSavedShareToken);

  const handleSaveAsTemplate = async () => {
    setIsSaving(true);

    try {
      let tokenToUse = shareToken || currentShareToken;

      // Auto-capture if no shareToken exists
      if (!tokenToUse) {
        onCaptureCanvas();
        // Wait for auto-save to complete
        await new Promise<void>((resolve, reject) => {
          const checkStatus = () => {
            const status = useAutoSaveStore.getState().autoSaveStatus;
            const token = useAutoSaveStore.getState().autoSavedShareToken;
            if (status === 'saved' && token) {
              resolve();
            } else if (status === 'error') {
              reject(new Error('Auto-save failed'));
            } else {
              setTimeout(checkStatus, 100);
            }
          };
          setTimeout(checkStatus, 200);
        });
        tokenToUse = useAutoSaveStore.getState().autoSavedShareToken;
      }

      if (!tokenToUse) {
        throw new Error('Kein Share-Token verfügbar');
      }

      const result = await saveAsTemplate(tokenToUse, `${canvasType} Vorlage`, 'public');
      if (result.success) {
        setTemplateUrl(`${window.location.origin}${result.templateUrl}`);
      }
    } catch (error) {
      console.error('Failed to save template:', error);
      alert('Fehler beim Speichern der Vorlage');
    } finally {
      setIsSaving(false);
    }
  };

  const copyTemplateLink = () => {
    if (templateUrl) {
      void navigator.clipboard.writeText(templateUrl);
    }
  };

  return (
    <div className="share-subsection">
      <h3 className="share-subsection__title">Vorlage</h3>

      {!templateUrl ? (
        <>
          <button
            className="btn btn-primary"
            onClick={handleSaveAsTemplate}
            disabled={isSaving}
            type="button"
          >
            {isSaving ? (
              <>
                <Spinner size="small" />
                Speichern...
              </>
            ) : (
              <>
                <FaSave /> Als Vorlage speichern
              </>
            )}
          </button>
        </>
      ) : (
        <>
          <div className="share-status share-status--success">
            <IoCheckmarkOutline />
            <span>Gespeichert</span>
          </div>

          <div className="template-link-display">
            <label>Link</label>
            <input
              type="text"
              value={templateUrl}
              readOnly
              className="share-textarea"
              onClick={(e) => e.currentTarget.select()}
            />
          </div>

          <button className="btn btn-secondary" onClick={copyTemplateLink} type="button">
            Link kopieren
          </button>
        </>
      )}
    </div>
  );
}

// Instagram Text Subsection
interface GeneratedPosts {
  instagram?: string;
  [key: string]: string | undefined;
}

function InstagramTextSubsection({
  canvasText,
  canvasType,
}: Pick<GenericShareSectionProps, 'canvasText' | 'canvasType'>) {
  const [copied, setCopied] = useState(false);
  const socialPostHook = useGenerateSocialPost() as unknown as {
    generatedPosts: GeneratedPosts;
    generatePost: (
      thema: string,
      details: string,
      platforms: string[],
      includeActionIdeas: boolean
    ) => Promise<unknown>;
    loading: boolean;
  };
  const { generatedPosts, generatePost, loading } = socialPostHook;

  const handleGenerate = async () => {
    if (!canvasText.trim() || loading) return;
    await generatePost(canvasText, `Sharepic: ${canvasType}`, ['instagram'], false);
  };

  const handleCopy = async () => {
    if (generatedPosts?.instagram) {
      await navigator.clipboard.writeText(generatedPosts.instagram);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="share-subsection">
      <h3 className="share-subsection__title">Instagram Text</h3>

      {!generatedPosts?.instagram ? (
        <button
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={loading || !canvasText.trim()}
          type="button"
        >
          {loading ? (
            <>
              <Spinner size="small" />
              Generiere...
            </>
          ) : (
            <>
              <FaInstagram />
              Text generieren
            </>
          )}
        </button>
      ) : (
        <>
          <textarea
            readOnly
            value={generatedPosts.instagram}
            className="share-textarea"
            rows={6}
            onClick={(e) => e.currentTarget.select()}
          />
          <button className="btn btn-secondary" onClick={handleCopy} type="button">
            {copied ? <FaCheck /> : <FaCopy />}
            {copied ? 'Kopiert!' : 'Kopieren'}
          </button>
        </>
      )}
    </div>
  );
}

export function GenericShareSection({
  exportedImage,
  shareToken,
  onCaptureCanvas,
  onDownload,
  onNavigateToGallery,
  canvasText,
  canvasType,
  pageCount,
  onDownloadAllZip,
  onShareAllPages,
  isMultiExporting,
  exportProgress,
}: GenericShareSectionProps) {
  const subsections = useMemo(
    () => [
      {
        id: 'download',
        icon: FaDownload,
        label: 'Download',
        content: (
          <DownloadShareSubsection
            exportedImage={exportedImage}
            shareToken={shareToken}
            onCaptureCanvas={onCaptureCanvas}
            onDownload={onDownload}
            onNavigateToGallery={onNavigateToGallery}
            canvasText={canvasText}
            pageCount={pageCount}
            onDownloadAllZip={onDownloadAllZip}
            onShareAllPages={onShareAllPages}
            isMultiExporting={isMultiExporting}
            exportProgress={exportProgress}
          />
        ),
      },
      {
        id: 'template',
        icon: FaSave,
        label: 'Vorlage',
        content: (
          <TemplateSubsection
            shareToken={shareToken}
            onCaptureCanvas={onCaptureCanvas}
            canvasType={canvasType}
          />
        ),
      },
      {
        id: 'instagram-text',
        icon: MdTextFields,
        label: 'Text',
        content: <InstagramTextSubsection canvasText={canvasText} canvasType={canvasType} />,
      },
    ],
    [
      exportedImage,
      shareToken,
      onCaptureCanvas,
      onDownload,
      onNavigateToGallery,
      canvasText,
      canvasType,
      pageCount,
      onDownloadAllZip,
      onShareAllPages,
      isMultiExporting,
      exportProgress,
    ]
  );

  return <SubsectionTabBar subsections={subsections} defaultSubsection="download" />;
}
