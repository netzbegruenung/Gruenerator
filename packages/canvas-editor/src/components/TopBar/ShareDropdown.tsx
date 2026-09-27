import { shareApi } from '@gruenerator/shared/share';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  IconButton,
  IconButtonRow,
  Skeleton,
} from '@gruenerator/ui';
import { useCallback, useState } from 'react';
import { FaCheck, FaDownload, FaSave, FaUserPlus } from 'react-icons/fa';
import { PiArrowLeft } from 'react-icons/pi';
import { IoShareOutline } from 'react-icons/io5';

import { useAutoSaveStoreApi } from '../../stores/useAutoSaveStore';

import { DownloadSection, type CanvasDownloadChoice } from './DownloadSection';

export interface ShareDropdownProps {
  onCaptureCanvas: () => Promise<string | null>;
  onDownload: (format: CanvasDownloadChoice, pixelRatio: number, transparent: boolean) => void;
  onNavigateToGallery: () => void;
  canvasText: string;
  canvasType: string;
  canvasWidth: number;
  canvasHeight: number;
  shareToken: string | null;
  pageCount?: number;
  onDownloadAllZip?: () => Promise<void>;
  onShareAllPages?: () => Promise<void>;
  isMultiExporting?: boolean;
  exportProgress?: { current: number; total: number };
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
  onInvitePeople,
  onSaveAsTemplate,
}: ShareDropdownProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'main' | 'download'>('main');
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

  const autoSaveStoreApi = useAutoSaveStoreApi();
  const canUseNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;

  const publishDraftIfNeeded = useCallback(async () => {
    const token = shareToken || autoSaveStoreApi.getState().autoSavedShareToken;
    if (token) {
      try {
        await shareApi.publishShare(token);
      } catch (err) {
        console.warn('[ShareDropdown] Failed to publish draft:', err);
      }
    }
  }, [shareToken, autoSaveStoreApi]);

  const handleNativeShare = useCallback(async () => {
    setIsSharing(true);
    try {
      const dataUrl = await onCaptureCanvas();
      if (!dataUrl) return;
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'gruenerator.png', { type: 'image/png' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: canvasText, title: 'Grünerator Share' });
      } else {
        await navigator.share({ text: canvasText, title: 'Grünerator Share' });
      }
      void publishDraftIfNeeded();
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2000);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') console.error('Share failed:', err);
    } finally {
      setIsSharing(false);
    }
  }, [onCaptureCanvas, canvasText, publishDraftIfNeeded]);

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setView('main');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          size="sm"
          className="ml-auto h-9 rounded-full bg-white px-4 font-extrabold text-[var(--editor-green-deep)] hover:bg-white/90 max-canvas-mobile:h-8 max-canvas-mobile:px-2.5"
        >
          <IoShareOutline className="size-4" />
          <span className="max-canvas-mobile:hidden">Teilen</span>
        </Button>
      </PopoverTrigger>
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

              {canUseNativeShare && (
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
            </IconButtonRow>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
