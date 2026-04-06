import { useShareStore, shareApi } from '@gruenerator/shared/share';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  Separator,
  IconButton,
  IconButtonRow,
} from '@gruenerator/ui';
import { useCallback, useState } from 'react';
import { FaCheck, FaDownload, FaSave, FaInstagram, FaCopy } from 'react-icons/fa';
import { PiArrowLeft } from 'react-icons/pi';
import { IoShareOutline } from 'react-icons/io5';

import Spinner from '../../common/Spinner';
import { useCanvasEditorServices } from '../../CanvasEditorProvider';
import { useAutoSaveStore } from '../../stores/useAutoSaveStore';

import { DownloadSection } from './DownloadSection';

export interface ShareDropdownProps {
  onCaptureCanvas: () => Promise<string | null>;
  onDownload: (format: 'png' | 'jpeg', pixelRatio: number) => void;
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
}

interface GeneratedPosts {
  instagram?: string;
  [key: string]: string | undefined;
}

export function ShareDropdown({
  onCaptureCanvas,
  onDownload,
  onNavigateToGallery,
  canvasText,
  canvasType,
  canvasWidth,
  canvasHeight,
  shareToken,
  pageCount = 1,
  onDownloadAllZip,
  onShareAllPages,
  isMultiExporting = false,
  exportProgress,
}: ShareDropdownProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'main' | 'download'>('main');
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateUrl, setTemplateUrl] = useState<string | null>(null);
  const [templateCopied, setTemplateCopied] = useState(false);
  const [instagramCopied, setInstagramCopied] = useState(false);

  const currentShareToken = useAutoSaveStore((s) => s.autoSavedShareToken);
  const canUseNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const { saveAsTemplate } = useShareStore();

  const services = useCanvasEditorServices();
  const socialPostHook = services.useGenerateSocialPost?.() as unknown as
    | {
        generatedPosts: GeneratedPosts;
        generatePost: (
          thema: string,
          details: string,
          platforms: string[],
          includeActionIdeas: boolean
        ) => Promise<unknown>;
        loading: boolean;
      }
    | undefined;
  const generatedPosts = socialPostHook?.generatedPosts;
  const generatePost = socialPostHook?.generatePost;
  const socialLoading = socialPostHook?.loading ?? false;

  const publishDraftIfNeeded = useCallback(async () => {
    const token = shareToken || useAutoSaveStore.getState().autoSavedShareToken;
    if (token) {
      try {
        await shareApi.publishShare(token);
      } catch (err) {
        console.warn('[ShareDropdown] Failed to publish draft:', err);
      }
    }
  }, [shareToken]);

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

  const handleSaveAsTemplate = async () => {
    setIsSavingTemplate(true);
    try {
      let tokenToUse = shareToken || currentShareToken;
      if (!tokenToUse) {
        await onCaptureCanvas();
        await new Promise<void>((resolve, reject) => {
          const check = () => {
            const s = useAutoSaveStore.getState();
            if (s.autoSaveStatus === 'saved' && s.autoSavedShareToken) resolve();
            else if (s.autoSaveStatus === 'error') reject(new Error('Auto-save failed'));
            else setTimeout(check, 100);
          };
          setTimeout(check, 200);
        });
        tokenToUse = useAutoSaveStore.getState().autoSavedShareToken;
      }
      if (!tokenToUse) throw new Error('Kein Share-Token verfügbar');
      const result = await saveAsTemplate(tokenToUse, `${canvasType} Vorlage`, 'public');
      if (result.success) setTemplateUrl(`${window.location.origin}${result.templateUrl}`);
    } catch (error) {
      console.error('Failed to save template:', error);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleGenerateInstagram = async () => {
    if (!canvasText.trim() || socialLoading || !generatePost) return;
    await generatePost(canvasText, `Sharepic: ${canvasType}`, ['instagram'], false);
  };

  const handleCopyInstagram = async () => {
    if (generatedPosts?.instagram) {
      await navigator.clipboard.writeText(generatedPosts.instagram);
      setInstagramCopied(true);
      setTimeout(() => setInstagramCopied(false), 2000);
    }
  };

  const handleCopyTemplateLink = () => {
    if (templateUrl) {
      void navigator.clipboard.writeText(templateUrl);
      setTemplateCopied(true);
      setTimeout(() => setTemplateCopied(false), 2000);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setView('main');
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="brand" size="sm" className="ml-auto rounded-lg">
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
                canvasWidth={canvasWidth}
                canvasHeight={canvasHeight}
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
                      <Spinner size="small" />
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

              <IconButton
                size="sm"
                icon={
                  isSavingTemplate ? (
                    <Spinner size="small" />
                  ) : templateUrl ? (
                    <FaCheck />
                  ) : (
                    <FaSave />
                  )
                }
                label={templateUrl ? 'Gespeichert' : 'Vorlage'}
                onClick={templateUrl ? handleCopyTemplateLink : handleSaveAsTemplate}
                disabled={isSavingTemplate}
              />
            </IconButtonRow>

            {/* Template link (shown after saving) */}
            {templateUrl && (
              <>
                <Separator />
                <div className="px-4 py-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={templateUrl}
                    readOnly
                    className="flex-1 py-1.5 px-2.5 text-xs text-foreground bg-grey-100 dark:bg-grey-800 border border-grey-200 dark:border-grey-700 rounded-md outline-none cursor-text min-w-0"
                    onClick={(e) => e.currentTarget.select()}
                  />
                  <Button variant="outline" size="sm" onClick={handleCopyTemplateLink}>
                    {templateCopied ? (
                      <FaCheck className="size-3" />
                    ) : (
                      <FaCopy className="size-3" />
                    )}
                  </Button>
                </div>
              </>
            )}

            {/* Instagram text section */}
            <Separator />
            <div className="px-4 py-3 flex flex-col gap-2">
              <span className="text-xs font-medium text-foreground-muted">Instagram Text</span>
              {!generatedPosts?.instagram ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleGenerateInstagram}
                  disabled={socialLoading || !canvasText.trim()}
                >
                  {socialLoading ? <Spinner size="small" /> : <FaInstagram className="size-3.5" />}
                  {socialLoading ? 'Generiere...' : 'Text generieren'}
                </Button>
              ) : (
                <>
                  <textarea
                    readOnly
                    value={generatedPosts.instagram}
                    className="w-full py-2 px-2.5 text-xs text-foreground bg-grey-100 dark:bg-grey-800 border border-grey-200 dark:border-grey-700 rounded-md outline-none resize-none leading-relaxed"
                    rows={4}
                    onClick={(e) => e.currentTarget.select()}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handleCopyInstagram}
                  >
                    {instagramCopied ? (
                      <FaCheck className="size-3.5" />
                    ) : (
                      <FaCopy className="size-3.5" />
                    )}
                    {instagramCopied ? 'Kopiert!' : 'Kopieren'}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
