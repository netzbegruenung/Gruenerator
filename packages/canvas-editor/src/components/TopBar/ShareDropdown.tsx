import { useCanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';
import { browserFileDelivery } from '@ggraphic/editor/hostServices';
import { useAutoSaveStoreApi } from '@ggraphic/editor/stores/useAutoSaveStore';
import { Button } from '@ggraphic/editor/ui/button';
import { IconButton, IconButtonRow } from '@ggraphic/editor/ui/icon-button';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@ggraphic/editor/ui/popover';
import { Skeleton } from '@ggraphic/editor/ui/skeleton';
import { stripInlineMarks } from '@ggraphic/schema';
import { useCallback, useMemo, useState } from 'react';
import { FaCheck, FaDownload, FaSave, FaUserPlus } from 'react-icons/fa';
import { IoShareOutline } from 'react-icons/io5';
import { PiArrowLeft, PiMegaphone } from 'react-icons/pi';

import { useIsCanvasMobile } from '../../hooks/useIsCanvasMobile';
import {
  AltTextField,
  useCaptionAltText,
  useShareAltText,
  withAltText,
} from '@ggraphic/editor/sidebar/components/AltTextField';
import { withPhotoCredit } from '../../utils/photoCredit';

import {
  DownloadSection,
  type CanvasDownloadChoice,
  type PrintExportProps,
  type SlideDeckExportProps,
} from './DownloadSection';

export interface ShareDropdownProps {
  onCaptureCanvas: () => Promise<string | null>;
  onDownload: (
    format: CanvasDownloadChoice,
    pixelRatio: number,
    transparent: boolean
  ) => void | Promise<void>;
  onNavigateToGallery: () => void;
  canvasText: string;
  canvasType: string;
  canvasWidth: number;
  canvasHeight: number;
  shareToken: string | null;
  pageCount?: number;
  onDownloadAllZip?: (format?: CanvasDownloadChoice) => Promise<void>;
  onShareAllPages?: () => Promise<void>;
  isMultiExporting?: boolean;
  exportProgress?: { current: number; total: number };
  exportError?: string | null;
  exportNotice?: string | null;
  /** Set for print formats: the download section offers the print PDF. */
  printExport?: PrintExportProps | null;
  /** Set for slide formats: the download section offers PowerPoint and a PDF of all pages. */
  slideDeck?: SlideDeckExportProps | null;
  /**
   * Optional host-supplied "invite people" action. When provided, the share
   * popover shows a "Personen" icon button that opens the host's collaborator
   * dialog. Kept opaque so the canvas-editor package stays unaware of who
   * resolves people/permissions.
   */
  onInvitePeople?: () => void;
  /**
   * Optional host-supplied "save as template" action, same contract as
   * {@link onInvitePeople}: the host owns the document identity a template is
   * built from, so it also owns the dialog. Hidden when absent.
   */
  onSaveAsTemplate?: () => void;
  /**
   * Opened by a host-drawn bar instead of the "Teilen" button: the menu is
   * controlled from outside and hangs from the top right of the editor.
   */
  hostControl?: { open: boolean; onOpenChange: (open: boolean) => void };
  /**
   * Bildnachweis aller Seiten („Foto: … auf Unsplash"), gelesen beim Öffnen.
   * Unsplash verlangt ihn im Beitragstext: er wird an den geteilten Text
   * gehängt und zum Kopieren angezeigt, weil Instagram & Co. den Text eines
   * geteilten Bilds verwerfen.
   */
  getPhotoCredit?: () => string;
}

export function ShareDropdown({
  onCaptureCanvas,
  onDownload,
  onNavigateToGallery,
  canvasText,
  canvasWidth,
  canvasHeight,
  shareToken,
  pageCount = 1,
  onDownloadAllZip,
  onShareAllPages,
  isMultiExporting = false,
  exportProgress,
  exportError,
  exportNotice,
  printExport,
  slideDeck,
  onInvitePeople,
  onSaveAsTemplate,
  hostControl,
  getPhotoCredit,
}: ShareDropdownProps) {
  const isMobile = useIsCanvasMobile();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = hostControl ? hostControl.open : ownOpen;
  const setOpen = hostControl ? hostControl.onOpenChange : setOwnOpen;
  const [view, setView] = useState<'main' | 'download'>('main');
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [creditCopied, setCreditCopied] = useState(false);
  const photoCredit = useMemo(
    () => (open && getPhotoCredit ? getPhotoCredit() : ''),
    [open, getPhotoCredit]
  );
  const [altText, setAltText] = useShareAltText(stripInlineMarks(canvasText));
  const captionAltText = useCaptionAltText(altText);
  const shareText = withAltText(withPhotoCredit(canvasText, photoCredit), captionAltText);

  const autoSaveStoreApi = useAutoSaveStoreApi();
  const { fileDelivery = browserFileDelivery, imageShares, feedback } = useCanvasEditorServices();
  const shareRoute = fileDelivery.pickShareRoute();

  const publishDraftIfNeeded = useCallback(async () => {
    const token = shareToken || autoSaveStoreApi.getState().autoSavedShareToken;
    if (token && imageShares) {
      try {
        await imageShares.publishShare(token);
      } catch (err) {
        console.warn('[ShareDropdown] Failed to publish draft:', err);
      }
    }
  }, [shareToken, autoSaveStoreApi, imageShares]);

  const handleNativeShare = useCallback(async () => {
    setIsSharing(true);
    try {
      const dataUrl = await onCaptureCanvas();
      if (!dataUrl) return;
      if (shareRoute === 'native-host') {
        fileDelivery.shareDataUrlViaNativeHost(dataUrl, 'gruenerator.png', {
          title: 'Grünerator Share',
          text: shareText,
        });
      } else {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], 'gruenerator.png', { type: 'image/png' });

        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], text: shareText, title: 'Grünerator Share' });
        } else {
          await navigator.share({ text: shareText, title: 'Grünerator Share' });
        }
      }
      void publishDraftIfNeeded();
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2000);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') console.error('Share failed:', err);
    } finally {
      setIsSharing(false);
    }
  }, [onCaptureCanvas, shareText, publishDraftIfNeeded, shareRoute, fileDelivery]);

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setView('main');
      }}
    >
      {hostControl ? (
        <PopoverAnchor className="absolute right-3 top-0 size-0" />
      ) : (
        <PopoverTrigger asChild>
          <Button
            size="sm"
            className="ml-auto h-9 rounded-full bg-white px-4 font-extrabold text-[var(--editor-green-deep)] hover:bg-white/90 max-canvas-mobile:h-8 max-canvas-mobile:px-3"
          >
            <IoShareOutline className="size-4" />
            <span>Teilen</span>
          </Button>
        </PopoverTrigger>
      )}
      <PopoverContent align="end" sideOffset={8} className="w-80 p-0 overflow-hidden">
        {view === 'download' ? (
          <>
            {/* Download detail view */}
            <div className="px-4 pt-3 pb-1">
              <button
                type="button"
                onClick={() => setView('main')}
                className="flex items-center gap-2 bg-transparent border-none cursor-pointer p-0 text-sm font-semibold text-foreground transition-colors duration-150 hover:text-primary-600"
              >
                <PiArrowLeft size={16} />
                Download
              </button>
            </div>
            <div className="px-4 pt-2 pb-4">
              <DownloadSection
                onDownload={onDownload}
                onDownloadAllZip={onDownloadAllZip}
                pageCount={pageCount}
                isMultiExporting={isMultiExporting}
                exportProgress={exportProgress}
                exportError={exportError}
                exportNotice={exportNotice}
                printExport={printExport}
                slideDeck={slideDeck}
              />
            </div>
          </>
        ) : (
          <>
            {/* Main view — icon buttons */}
            <div className="px-4 pt-4 pb-2">
              <h3 className="text-base font-semibold text-foreground m-0">Teilen</h3>
            </div>

            <IconButtonRow gap="lg" padding="md" className="justify-center py-3">
              <IconButton
                size="sm"
                icon={<FaDownload />}
                label="Download"
                onClick={() => setView('download')}
              />

              {shareRoute !== null && (
                <IconButton
                  size="sm"
                  icon={
                    isSharing ? (
                      <Skeleton className="size-4 rounded-full" />
                    ) : shareSuccess ? (
                      <FaCheck />
                    ) : (
                      <IoShareOutline />
                    )
                  }
                  label={shareSuccess ? 'Geteilt!' : 'Teilen'}
                  onClick={handleNativeShare}
                  disabled={isSharing}
                />
              )}

              {onSaveAsTemplate && (
                <IconButton
                  size="sm"
                  icon={<FaSave />}
                  label="Vorlage"
                  onClick={() => {
                    setOpen(false);
                    onSaveAsTemplate();
                  }}
                />
              )}

              {onInvitePeople && (
                <IconButton
                  size="sm"
                  icon={<FaUserPlus />}
                  label="Personen"
                  onClick={() => {
                    setOpen(false);
                    onInvitePeople();
                  }}
                />
              )}

              {/* Mobil schwebt kein Feedback-Knopf über dem Editor — er wohnt hier. */}
              {isMobile && feedback?.canRequest() && (
                <IconButton
                  size="sm"
                  icon={<PiMegaphone />}
                  label="Feedback"
                  onClick={() => {
                    setOpen(false);
                    feedback?.request();
                  }}
                />
              )}
            </IconButtonRow>
            <div className="px-4 pb-4">
              <AltTextField value={altText} onChange={setAltText} />
            </div>
          </>
        )}
        {photoCredit && (
          <div className="mx-4 mb-4 flex flex-col gap-2 rounded-md border border-[var(--editor-border-soft)] p-3">
            <p className="m-0 text-xs font-semibold text-foreground">
              Bildnachweis für deinen Beitrag
            </p>
            <p className="m-0 text-xs text-muted-foreground">
              Das Foto gehört nicht dir: Nenne die Fotograf*in und Unsplash im Beitragstext.
            </p>
            <p className="m-0 select-all text-sm text-foreground">{photoCredit}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(photoCredit).then(() => {
                  setCreditCopied(true);
                  setTimeout(() => setCreditCopied(false), 2000);
                });
              }}
            >
              {creditCopied ? <FaCheck className="size-3" /> : null}
              {creditCopied ? 'Kopiert' : 'Bildnachweis kopieren'}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
