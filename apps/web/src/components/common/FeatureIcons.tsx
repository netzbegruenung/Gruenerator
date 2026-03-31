import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@gruenerator/ui';
import React, { type JSX, useState, useRef, useMemo, useCallback } from 'react';
import {
  HiGlobeAlt,
  HiPaperClip,
  HiPlusCircle,
  HiClipboardList,
  HiAnnotation,
  HiBeaker,
  HiDocument,
  HiX,
  HiCheck,
} from 'react-icons/hi';
import { useShallow } from 'zustand/react/shallow';

import LoginPage from '../../features/auth/pages/LoginPage';
import { useAuth } from '../../hooks/useAuth';
import { useGeneratorSelectionStore } from '../../stores/core/generatorSelectionStore';
import { cn } from '../../utils/cn';
import { getPDFPageCount } from '../../utils/fileAttachmentUtils';

import AttachedFilesList from './AttachedFilesList';
import ContentSelector, { type AttachedFile } from './ContentSelector';

/* ── Memoized sub-components to avoid re-renders on dropdown open/close ── */

interface SelectedContentBadgesProps {
  selectedDocumentIds: string[];
  selectedTextIds: string[];
  availableDocuments: Array<{ id: string; title?: string; [key: string]: unknown }>;
  availableTexts: Array<{ id: string; title?: string; [key: string]: unknown }>;
  toggleDocumentSelection: (id: string) => void;
  toggleTextSelection: (id: string) => void;
}

const SelectedContentBadges = React.memo(function SelectedContentBadges({
  selectedDocumentIds,
  selectedTextIds,
  availableDocuments,
  availableTexts,
  toggleDocumentSelection,
  toggleTextSelection,
}: SelectedContentBadgesProps) {
  if (selectedDocumentIds.length === 0 && selectedTextIds.length === 0) return null;

  return (
    <div className="mt-xs flex flex-wrap gap-xs">
      {selectedDocumentIds.map((docId) => {
        const doc = availableDocuments.find((d) => d.id === docId);
        if (!doc) return null;
        return (
          <Badge key={`doc-${docId}`} variant="secondary" className="max-w-full gap-1">
            <HiDocument className="shrink-0 text-sm opacity-70" />
            <span className="truncate">{doc.title ?? 'Unbenannt'}</span>
            <button
              type="button"
              className="ml-0.5 shrink-0 rounded-full p-0 text-error transition-colors hover:bg-error/10"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                toggleDocumentSelection(docId);
              }}
              aria-label={`${doc.title ?? 'Unbenannt'} entfernen`}
            >
              <HiX className="size-3" />
            </button>
          </Badge>
        );
      })}
      {selectedTextIds.map((textId) => {
        const text = availableTexts.find((t) => t.id === textId);
        if (!text) return null;
        return (
          <Badge key={`text-${textId}`} variant="secondary" className="max-w-full gap-1">
            <HiClipboardList className="shrink-0 text-sm opacity-70" />
            <span className="truncate">{text.title ?? 'Unbenannt'}</span>
            <button
              type="button"
              className="ml-0.5 shrink-0 rounded-full p-0 text-error transition-colors hover:bg-error/10"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                toggleTextSelection(textId);
              }}
              aria-label={`${text.title ?? 'Unbenannt'} entfernen`}
            >
              <HiX className="size-3" />
            </button>
          </Badge>
        );
      })}
    </div>
  );
});

interface ContentSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ContentSelectorDialog = React.memo(function ContentSelectorDialog({
  open,
  onOpenChange,
}: ContentSelectorDialogProps) {
  const {
    availableTexts,
    selectedTextIds,
    toggleTextSelection,
    availableDocuments,
    selectedDocumentIds,
    toggleDocumentSelection,
    isLoadingTexts,
    isLoadingDocuments,
    uiConfig,
  } = useGeneratorSelectionStore(
    useShallow((state) => ({
      availableTexts: state.availableTexts,
      selectedTextIds: state.selectedTextIds,
      toggleTextSelection: state.toggleTextSelection,
      availableDocuments: state.availableDocuments,
      selectedDocumentIds: state.selectedDocumentIds,
      toggleDocumentSelection: state.toggleDocumentSelection,
      isLoadingTexts: state.isLoadingTexts,
      isLoadingDocuments: state.isLoadingDocuments,
      uiConfig: state.uiConfig,
    }))
  );

  const { enableDocuments = false, enableTexts = false } = uiConfig;

  const completedDocuments = useMemo(
    () => (enableDocuments ? availableDocuments.filter((doc) => doc.status === 'completed') : []),
    [enableDocuments, availableDocuments]
  );

  const isLoading = isLoadingTexts || isLoadingDocuments;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-[28rem]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Inhalte auswählen</DialogTitle>
        </DialogHeader>

        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
          {completedDocuments.length > 0 && (
            <div className="mb-sm">
              <div className="px-sm py-xs text-xs font-semibold uppercase tracking-wider opacity-50">
                Dokumente
              </div>
              {completedDocuments.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-sm rounded-md px-md py-sm text-left transition-colors hover:bg-hover-alt',
                    selectedDocumentIds.includes(doc.id) &&
                      'bg-secondary-100 dark:bg-secondary-100/25'
                  )}
                  onClick={() => toggleDocumentSelection(doc.id)}
                >
                  <HiDocument className="shrink-0 text-xl opacity-70" />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{doc.title}</span>
                    {doc.filename && (
                      <span className="block truncate text-sm opacity-60">{doc.filename}</span>
                    )}
                  </div>
                  {selectedDocumentIds.includes(doc.id) && (
                    <HiCheck className="shrink-0 text-xl text-primary-500" />
                  )}
                </button>
              ))}
            </div>
          )}

          {enableTexts && availableTexts.length > 0 && (
            <div className="mb-sm">
              <div className="px-sm py-xs text-xs font-semibold uppercase tracking-wider opacity-50">
                Texte
              </div>
              {availableTexts.map((text) => (
                <button
                  key={text.id}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-sm rounded-md px-md py-sm text-left transition-colors hover:bg-hover-alt',
                    selectedTextIds.includes(text.id) && 'bg-secondary-100 dark:bg-secondary-100/25'
                  )}
                  onClick={() => toggleTextSelection(text.id)}
                >
                  <HiClipboardList className="shrink-0 text-xl opacity-70" />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{text.title}</span>
                    {text.type && (
                      <span className="block truncate text-sm opacity-60">{text.type}</span>
                    )}
                  </div>
                  {selectedTextIds.includes(text.id) && (
                    <HiCheck className="shrink-0 text-xl text-primary-500" />
                  )}
                </button>
              ))}
            </div>
          )}

          {isLoading && <div className="py-lg text-center opacity-60">Lade...</div>}
        </div>

        <DialogFooter className="shrink-0">
          <Button className="w-full" onClick={() => onOpenChange(false)}>
            Fertig
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

const DEFAULT_ATTACHED_FILES: AttachedFile[] = [];
interface FeatureIconsProps {
  onAttachmentClick?: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
  onInteractiveModeClick?: () => void;
  interactiveModeActive?: boolean;
  attachedFiles?: AttachedFile[];
  attachmentActive?: boolean;
  className?: string;
  noBorder?: boolean;
  hideLoginPrompt?: boolean;
  showAgentMode?: boolean;
}

const FeatureIcons = ({
  onAttachmentClick,
  onRemoveFile,
  onInteractiveModeClick,
  interactiveModeActive = true,
  attachedFiles = DEFAULT_ATTACHED_FILES,
  className = '',
  noBorder = false,
  hideLoginPrompt = false,
  showAgentMode = false,
}: FeatureIconsProps): JSX.Element | null => {
  // Data selector — useShallow for change detection on values that actually change
  const { useAgentMode, selectedDocumentIds, selectedTextIds, availableDocuments, availableTexts } =
    useGeneratorSelectionStore(
      useShallow((state) => ({
        useAgentMode: state.useAgentMode,
        selectedDocumentIds: state.selectedDocumentIds,
        selectedTextIds: state.selectedTextIds,
        availableDocuments: state.availableDocuments,
        availableTexts: state.availableTexts,
      }))
    );

  // Action selectors — Zustand functions are referentially stable, no useShallow needed
  const toggleAgentMode = useGeneratorSelectionStore((s) => s.toggleAgentMode);
  const toggleDocumentSelection = useGeneratorSelectionStore((s) => s.toggleDocumentSelection);
  const toggleTextSelection = useGeneratorSelectionStore((s) => s.toggleTextSelection);

  const [isValidatingFiles, setIsValidatingFiles] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [fileMetadata, setFileMetadata] = useState<Record<number, { pageCount: number | null }>>(
    {}
  );
  const [showLoginModal, setShowLoginModal] = useState(false);

  const [contentOpen, setContentOpen] = useState(false);
  const [selectorDialogOpen, setSelectorDialogOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { user } = useAuth();

  const handleOpenSelector = useCallback(() => {
    setContentOpen(false);
    setSelectorDialogOpen(true);
  }, []);

  const totalContentCount = useMemo(() => {
    return attachedFiles.length + selectedDocumentIds.length + selectedTextIds.length;
  }, [attachedFiles.length, selectedDocumentIds.length, selectedTextIds.length]);

  const processFiles = useCallback(
    async (files: File[]): Promise<void> => {
      if (files.length === 0) return;

      setValidationError(null);
      setFileMetadata({});
      setIsValidatingFiles(true);

      try {
        const metadata: Record<number, { pageCount: number | null }> = {};

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          metadata[i] = { pageCount: null };

          if (file.type === 'application/pdf') {
            try {
              const pageCount = await getPDFPageCount(file);
              metadata[i].pageCount = pageCount;
            } catch {
              metadata[i].pageCount = null;
            }
          }
        }

        setFileMetadata(metadata);
        if (onAttachmentClick) onAttachmentClick(files);
      } catch {
        setValidationError('Fehler bei der Dateiverarbeitung. Bitte versuchen Sie es erneut.');
      } finally {
        setIsValidatingFiles(false);
      }
    },
    [onAttachmentClick]
  );

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []) as File[];
    await processFiles(files);
    event.target.value = '';
  };

  const isLocalhost =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if (!user && !isLocalhost) {
    if (hideLoginPrompt) return null;
    return (
      <>
        <div
          className={cn(
            'relative flex w-full flex-col gap-xs',
            !noBorder && 'mb-xs rounded-sm border border-grey-200 dark:border-grey-700 p-sm',
            className
          )}
        >
          <div className="px-md py-sm text-[0.9rem] leading-relaxed text-foreground/70">
            Für alle Features logge dich mit deinem Parteiaccount ein.{' '}
            <button
              type="button"
              onClick={() => setShowLoginModal(true)}
              className="inline font-medium text-link underline underline-offset-2 transition-colors hover:opacity-90"
            >
              Login
            </button>
          </div>
        </div>

        {showLoginModal && (
          <LoginPage
            mode="required"
            pageName="Features"
            customMessage="Melde dich an, um alle Features zu nutzen."
            onClose={() => setShowLoginModal(false)}
          />
        )}
      </>
    );
  }

  return (
    <div
      className={cn(
        'relative flex flex-col gap-xs',
        !noBorder
          ? 'w-full mb-xs rounded-sm border border-grey-200 dark:border-grey-700 p-sm'
          : 'w-auto',
        className
      )}
    >
      <TooltipProvider>
        <div className="flex flex-nowrap items-center justify-start gap-xs">
          {/* Pro Mode Toggle */}
          {showAgentMode && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'size-9 sm:size-10 text-grey-600 dark:text-grey-400 hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors duration-150',
                    useAgentMode && 'bg-secondary-100 dark:bg-secondary-700 text-primary-500'
                  )}
                  onClick={toggleAgentMode}
                  aria-label="Pro-Modus"
                  type="button"
                >
                  <HiPlusCircle className="size-5 sm:size-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {useAgentMode
                  ? 'Pro-Modus aktiv: Recherche + Strategie'
                  : 'Pro-Modus: Recherchiert und erstellt Kommunikationsstrategie'}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Content Popover */}
          <Popover open={contentOpen} onOpenChange={setContentOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'size-9 sm:size-10 text-grey-600 dark:text-grey-400 hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors duration-150',
                      totalContentCount > 0 &&
                        'bg-secondary-100 dark:bg-secondary-700 text-primary-500'
                    )}
                    aria-label="Inhalt"
                    type="button"
                    disabled={isValidatingFiles}
                  >
                    <HiPaperClip className="size-5 sm:size-6" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>
                {isValidatingFiles
                  ? 'Prüfe...'
                  : totalContentCount > 0
                    ? `${totalContentCount} Inhalt(e)`
                    : 'Inhalt'}
              </TooltipContent>
            </Tooltip>
            <PopoverContent align="center" className="w-72">
              <ContentSelector
                onAttachmentClick={onAttachmentClick}
                onRemoveFile={onRemoveFile}
                attachedFiles={attachedFiles}
                onOpenSelector={handleOpenSelector}
              />
            </PopoverContent>
          </Popover>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={handleFileSelect}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            className="hidden"
            aria-hidden="true"
            disabled={isValidatingFiles}
          />

          {/* Interactive Mode */}
          {onInteractiveModeClick && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'size-9 sm:size-10 text-grey-600 dark:text-grey-400 hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors duration-150',
                    interactiveModeActive &&
                      'bg-secondary-100 dark:bg-secondary-700 text-primary-500'
                  )}
                  onClick={onInteractiveModeClick}
                  aria-label="Interaktiver Modus"
                  type="button"
                >
                  <HiAnnotation className="size-5 sm:size-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {interactiveModeActive ? 'Interaktiv aktiv' : 'Interaktiv'}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>

      {/* Attached Files List */}
      <AttachedFilesList
        files={attachedFiles}
        onRemoveFile={onRemoveFile}
        fileMetadata={fileMetadata}
        compact={true}
      />

      {/* Selected Documents and Texts */}
      <SelectedContentBadges
        selectedDocumentIds={selectedDocumentIds}
        selectedTextIds={selectedTextIds}
        availableDocuments={availableDocuments}
        availableTexts={availableTexts}
        toggleDocumentSelection={toggleDocumentSelection}
        toggleTextSelection={toggleTextSelection}
      />

      {validationError && (
        <div
          className="mt-xs flex flex-col gap-xs rounded-sm border-l-[3px] border-l-error bg-error/5 p-sm"
          role="alert"
          aria-live="assertive"
        >
          <span className="text-[0.9em] text-error">{validationError}</span>
        </div>
      )}

      {/* Dialog lives outside the Popover so it survives popover close */}
      <ContentSelectorDialog open={selectorDialogOpen} onOpenChange={setSelectorDialogOpen} />
    </div>
  );
};

export default React.memo(FeatureIcons);
