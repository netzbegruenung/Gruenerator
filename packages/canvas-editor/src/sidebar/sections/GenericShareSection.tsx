import { useShareStore, shareApi } from '@gruenerator/shared/share';
import { useCallback, useState, useMemo, useRef, useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  FaDownload,
  FaImages,
  FaSave,
  FaCheck,
  FaFileArchive,
  FaFileImage,
  FaFilePowerpoint,
  FaFilePdf,
} from 'react-icons/fa';
import { IoCheckmarkOutline, IoShareOutline } from 'react-icons/io5';

import { Skeleton } from '@gruenerator/ui';

import { useAutoSaveStore } from '../../stores/useAutoSaveStore';
import { SubsectionTabBar } from '../SubsectionTabBar';

export interface GenericShareSectionProps {
  exportedImage: string | null;
  shareToken: string | null;
  onCaptureCanvas: () => void;
  onDownload: () => void;
  onNavigateToGallery: () => void;
  canvasText: string;
  canvasType: string;
  pageCount?: number;
  onDownloadAllZip?: () => Promise<void>;
  onShareAllPages?: () => Promise<void>;
  isMultiExporting?: boolean;
  exportProgress?: { current: number; total: number };
  onDownloadPptx?: () => Promise<void>;
  onDownloadPdf?: () => Promise<void>;
}

const iconBtn =
  'size-10 rounded-xl border-none bg-grey-100 dark:bg-grey-800 cursor-pointer flex items-center justify-center text-foreground text-lg transition-[background-color,color,transform] duration-200 hover:bg-primary-100 hover:text-primary-600 dark:hover:bg-primary-900 dark:hover:text-primary-400 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed';

const primaryBtn =
  'w-full py-2.5 px-4 rounded-lg border-none bg-primary-600 text-white font-medium text-sm cursor-pointer flex items-center justify-center gap-2 transition-[background-color,transform] duration-200 hover:bg-primary-700 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed';

const secondaryBtn =
  'w-full py-2 px-4 rounded-lg border border-grey-200 dark:border-grey-700 bg-transparent text-foreground font-medium text-sm cursor-pointer flex items-center justify-center gap-2 transition-[background-color,border-color] duration-200 hover:bg-grey-100 dark:hover:bg-grey-800';

const dropdownMenu =
  'bg-background-pure border border-grey-200 dark:border-grey-700 rounded-xl shadow-lg p-1 min-w-[200px]';

const dropdownOption =
  'w-full py-2 px-3 rounded-lg border-none bg-transparent text-foreground text-sm cursor-pointer flex items-center gap-2 transition-[background-color] duration-150 hover:bg-grey-100 dark:hover:bg-grey-800 disabled:opacity-40 disabled:cursor-not-allowed';

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
  onDownloadPptx,
  onDownloadPdf,
}: Omit<GenericShareSectionProps, 'canvasType'>) {
  const [downloadState, setDownloadState] = useState<'idle' | 'capturing' | 'success'>('idle');
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

  const dlDropdown = usePortalDropdown();
  const shareDropdown = usePortalDropdown();

  const autoSaveStatus = useAutoSaveStore((s) => s.autoSaveStatus);
  const canUseNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const isMultiPage = pageCount > 1 && onDownloadAllZip;

  const publishDraftIfNeeded = useCallback(async () => {
    const token = shareToken || useAutoSaveStore.getState().autoSavedShareToken;
    if (token) {
      try {
        await shareApi.publishShare(token);
      } catch (err) {
        console.warn('[DownloadShareSubsection] Failed to publish draft:', err);
      }
    }
  }, [shareToken]);

  const handleSingleDownload = async () => {
    dlDropdown.setOpen(false);
    setDownloadState('capturing');
    try {
      onCaptureCanvas();
      await new Promise((resolve) => setTimeout(resolve, 150));
      onDownload();
      void publishDraftIfNeeded();
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
      void publishDraftIfNeeded();
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2000);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    } finally {
      setIsSharing(false);
    }
  }, [exportedImage, canvasText, onCaptureCanvas, shareDropdown, publishDraftIfNeeded]);

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
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-foreground m-0">Download & Teilen</h3>

      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            ref={dlDropdown.triggerRef}
            className={iconBtn}
            onClick={handleDownloadClick}
            disabled={downloadState !== 'idle' && !isMultiPage}
            title="Herunterladen"
            aria-label="Bild herunterladen"
            aria-haspopup={isMultiPage ? 'menu' : undefined}
            aria-expanded={isMultiPage ? dlDropdown.open : undefined}
            type="button"
          >
            {downloadState === 'capturing' ? (
              <Skeleton className="size-4 rounded-full" />
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
                className={dropdownMenu}
                style={dlDropdown.style}
                role="menu"
              >
                <button
                  className={dropdownOption}
                  onClick={handleSingleDownload}
                  role="menuitem"
                  type="button"
                >
                  <FaFileImage />
                  <span>Diese Seite (PNG)</span>
                </button>
                <button
                  className={dropdownOption}
                  onClick={handleDownloadAllZip}
                  disabled={isMultiExporting}
                  role="menuitem"
                  type="button"
                >
                  {isMultiExporting ? (
                    <>
                      <Skeleton className="size-4 rounded-full" />
                      <span>Exportiere...</span>
                    </>
                  ) : (
                    <>
                      <FaFileArchive />
                      <span>Alle {pageCount} Seiten (ZIP)</span>
                    </>
                  )}
                </button>
                {onDownloadPptx && (
                  <button
                    className={dropdownOption}
                    onClick={onDownloadPptx}
                    disabled={isMultiExporting}
                    role="menuitem"
                    type="button"
                  >
                    <FaFilePowerpoint />
                    <span>PowerPoint (PPTX)</span>
                  </button>
                )}
                {onDownloadPdf && (
                  <button
                    className={dropdownOption}
                    onClick={onDownloadPdf}
                    disabled={isMultiExporting}
                    role="menuitem"
                    type="button"
                  >
                    <FaFilePdf />
                    <span>PDF</span>
                  </button>
                )}
              </div>,
              document.body
            )}
        </div>

        {canUseNativeShare && (
          <div className="relative">
            <button
              ref={shareDropdown.triggerRef}
              className={iconBtn}
              onClick={handleShareClick}
              disabled={isSharing}
              title="Teilen"
              aria-label="Bild teilen"
              aria-haspopup={isMultiPage && onShareAllPages ? 'menu' : undefined}
              aria-expanded={isMultiPage && onShareAllPages ? shareDropdown.open : undefined}
              type="button"
            >
              {isSharing ? (
                <Skeleton className="size-4 rounded-full" />
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
                  className={dropdownMenu}
                  style={shareDropdown.style}
                  role="menu"
                >
                  <button
                    className={dropdownOption}
                    onClick={handleNativeShare}
                    role="menuitem"
                    type="button"
                  >
                    <IoShareOutline />
                    <span>Diese Seite teilen</span>
                  </button>
                  <button
                    className={dropdownOption}
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
      </div>

      {isMultiExporting && exportProgress && exportProgress.total > 0 && (
        <div className="relative w-full h-6 bg-grey-100 dark:bg-grey-800 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-primary-600 rounded-full transition-[width] duration-300"
            style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }}
          />
          <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-foreground">
            {exportProgress.current}/{exportProgress.total} Seiten
          </span>
        </div>
      )}

      {downloadState === 'success' && autoSaveStatus === 'saving' && (
        <div className="flex items-center gap-2 text-sm text-foreground-muted">
          <Skeleton className="size-3 rounded-full" />
          <span>Wird synchronisiert...</span>
        </div>
      )}

      {downloadState === 'success' && autoSaveStatus === 'saved' && shareToken && (
        <>
          <div className="flex items-center gap-2 text-sm text-primary-600">
            <IoCheckmarkOutline />
            <span>In Galerie gesichert</span>
          </div>
          <button className={secondaryBtn} onClick={onNavigateToGallery} type="button">
            <FaImages />
            Zur Galerie
          </button>
        </>
      )}

      {downloadState === 'success' && autoSaveStatus === 'error' && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <span>Fehler beim Speichern</span>
        </div>
      )}
    </div>
  );
}

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

      if (!tokenToUse) {
        onCaptureCanvas();
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
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-foreground m-0">Vorlage</h3>

      {!templateUrl ? (
        <button
          className={primaryBtn}
          onClick={handleSaveAsTemplate}
          disabled={isSaving}
          type="button"
        >
          {isSaving ? (
            <>
              <Skeleton className="size-4 rounded-full" />
              Speichern...
            </>
          ) : (
            <>
              <FaSave /> Als Vorlage speichern
            </>
          )}
        </button>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm text-primary-600">
            <IoCheckmarkOutline />
            <span>Gespeichert</span>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-foreground-muted">Link</label>
            <input
              type="text"
              value={templateUrl}
              readOnly
              className="w-full py-2 px-3 text-sm text-foreground bg-grey-100 dark:bg-grey-800 border border-grey-200 dark:border-grey-700 rounded-lg outline-none cursor-text"
              onClick={(e) => e.currentTarget.select()}
            />
          </div>

          <button className={secondaryBtn} onClick={copyTemplateLink} type="button">
            Link kopieren
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
  onDownloadPptx,
  onDownloadPdf,
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
            onDownloadPptx={onDownloadPptx}
            onDownloadPdf={onDownloadPdf}
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
