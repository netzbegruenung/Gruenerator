import React, { type JSX, useState, useRef, useMemo, useCallback } from 'react';
import {
  HiGlobeAlt,
  HiPaperClip,
  HiLightningBolt,
  HiPlusCircle,
  HiClipboardList,
  HiAnnotation,
  HiBeaker,
  HiDocument,
  HiX,
  HiCheck,
} from 'react-icons/hi';
import { HiSparkles } from 'react-icons/hi2';
import { useShallow } from 'zustand/react/shallow';

import LoginPage from '../../features/auth/pages/LoginPage';
import { useAuth } from '../../hooks/useAuth';
import { useGeneratorSelectionStore } from '../../stores/core/generatorSelectionStore';
import { cn } from '../../utils/cn';
import { getPDFPageCount } from '../../utils/fileAttachmentUtils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

import AttachedFilesList from './AttachedFilesList';
import ContentSelector, { type AttachedFile } from './ContentSelector';
import GrueneratorGPTIcon from './GrueneratorGPTIcon';

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
  console.debug('[SelectedContentBadges] render', {
    docs: selectedDocumentIds.length,
    texts: selectedTextIds.length,
  });
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

interface ModeDropdownItemsProps {
  usePrivacyMode: boolean;
  useProMode: boolean;
  onSelectKreativ: () => void;
  onSelectPrivacy: () => void;
  onSelectPro: () => void;
}

const ModeDropdownItems = React.memo(function ModeDropdownItems({
  usePrivacyMode,
  useProMode,
  onSelectKreativ,
  onSelectPrivacy,
  onSelectPro,
}: ModeDropdownItemsProps) {
  console.debug('[ModeDropdownItems] render', { usePrivacyMode, useProMode });
  return (
    <>
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-sm border-b border-grey-200 px-sm py-sm text-left transition-colors hover:bg-hover-alt dark:border-grey-700',
          !usePrivacyMode && !useProMode && 'bg-primary-500 text-white hover:bg-primary-600'
        )}
        onClick={onSelectKreativ}
      >
        <HiSparkles className="shrink-0 text-lg" />
        <div className="flex flex-col gap-xxs">
          <span className="text-sm font-medium leading-tight">Kreativ</span>
          <span className="text-xs leading-tight opacity-70">Mistral Medium.</span>
        </div>
      </button>

      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-sm border-b border-grey-200 px-sm py-sm text-left transition-colors hover:bg-hover-alt dark:border-grey-700',
          usePrivacyMode && 'bg-primary-500 text-white hover:bg-primary-600'
        )}
        onClick={onSelectPrivacy}
      >
        <GrueneratorGPTIcon className="shrink-0 text-lg" />
        <div className="flex flex-col gap-xxs">
          <span className="text-sm font-medium leading-tight">Gruenerator-GPT</span>
          <span className="text-xs leading-tight opacity-70">Selbstgehostete, sichere KI.</span>
        </div>
      </button>

      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-sm px-sm py-sm text-left transition-colors hover:bg-hover-alt',
          useProMode && 'bg-primary-500 text-white hover:bg-primary-600'
        )}
        onClick={onSelectPro}
      >
        <HiPlusCircle className="shrink-0 text-lg" />
        <div className="flex flex-col gap-xxs">
          <span className="text-sm font-medium leading-tight">Reasoning</span>
          <span className="text-xs leading-tight opacity-70">Kann nachdenken. Dauert länger.</span>
        </div>
      </button>
    </>
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
  console.debug('[ContentSelectorDialog] render', { open });

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
    useAutomaticSearch,
    toggleAutomaticSearch,
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
      useAutomaticSearch: state.useAutomaticSearch,
      toggleAutomaticSearch: state.toggleAutomaticSearch,
    }))
  );

  const { enableDocuments = false, enableTexts = false } = uiConfig;

  const completedDocuments = useMemo(
    () => (enableDocuments ? availableDocuments.filter((doc) => doc.status === 'completed') : []),
    [enableDocuments, availableDocuments]
  );

  const isLoading = isLoadingTexts || isLoadingDocuments;

  const handleAutoToggle = () => {
    toggleAutomaticSearch();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-[28rem]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Inhalte auswählen</DialogTitle>
        </DialogHeader>

        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
          <div className="mb-sm">
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-sm rounded-md px-md py-sm text-left transition-colors hover:bg-hover-alt',
                useAutomaticSearch && 'bg-secondary-100 dark:bg-secondary-100/25'
              )}
              onClick={handleAutoToggle}
            >
              <HiLightningBolt className="shrink-0 text-xl opacity-70 text-[var(--himmel)]" />
              <div className="min-w-0 flex-1">
                <span className="block font-medium">Automatische Suche</span>
                <span className="block text-sm opacity-60">KI wählt relevante Inhalte</span>
              </div>
              {useAutomaticSearch && <HiCheck className="shrink-0 text-xl text-primary-500" />}
            </button>
          </div>

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
const DEFAULT_TAB_INDEX = {
  webSearch: 11,
  balancedMode: 12,
  attachment: 13,
  interactiveMode: 14,
} as const;

interface FeatureIconsProps {
  onBalancedModeClick?: () => void;
  onAttachmentClick?: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
  onInteractiveModeClick?: () => void;
  interactiveModeActive?: boolean;
  attachedFiles?: AttachedFile[];
  attachmentActive?: boolean;
  className?: string;
  tabIndex?: {
    webSearch?: number;
    balancedMode?: number;
    attachment?: number;
    interactiveMode?: number;
  };
  showPrivacyInfoLink?: boolean;
  onPrivacyInfoClick?: () => void;
  showWebSearchInfoLink?: boolean;
  onWebSearchInfoClick?: () => void;
  noBorder?: boolean;
  hideLoginPrompt?: boolean;
  showAgentMode?: boolean;
}

const FeatureIcons = ({
  onBalancedModeClick,
  onAttachmentClick,
  onRemoveFile,
  onInteractiveModeClick,
  interactiveModeActive = true,
  attachedFiles = DEFAULT_ATTACHED_FILES,
  className = '',
  tabIndex = DEFAULT_TAB_INDEX,
  showPrivacyInfoLink = false,
  onPrivacyInfoClick,
  showWebSearchInfoLink = false,
  onWebSearchInfoClick,
  noBorder = false,
  hideLoginPrompt = false,
  showAgentMode = false,
}: FeatureIconsProps): JSX.Element | null => {
  // Single batched selector — prevents N re-renders when store hydrates
  const {
    useWebSearch,
    usePrivacyMode,
    useProMode,
    useAutomaticSearch,
    useAgentMode,
    toggleWebSearch,
    togglePrivacyMode,
    toggleProMode,
    toggleAgentMode,
    selectedDocumentIds,
    selectedTextIds,
    availableDocuments,
    availableTexts,
    toggleDocumentSelection,
    toggleTextSelection,
  } = useGeneratorSelectionStore(
    useShallow((state) => ({
      useWebSearch: state.useWebSearch,
      usePrivacyMode: state.usePrivacyMode,
      useProMode: state.useProMode,
      useAutomaticSearch: state.useAutomaticSearch,
      useAgentMode: state.useAgentMode,
      toggleWebSearch: state.toggleWebSearch,
      togglePrivacyMode: state.togglePrivacyMode,
      toggleProMode: state.toggleProMode,
      toggleAgentMode: state.toggleAgentMode,
      selectedDocumentIds: state.selectedDocumentIds,
      selectedTextIds: state.selectedTextIds,
      availableDocuments: state.availableDocuments,
      availableTexts: state.availableTexts,
      toggleDocumentSelection: state.toggleDocumentSelection,
      toggleTextSelection: state.toggleTextSelection,
    }))
  );

  const [isValidatingFiles, setIsValidatingFiles] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [fileMetadata, setFileMetadata] = useState<Record<number, { pageCount: number | null }>>(
    {}
  );
  const [showLoginModal, setShowLoginModal] = useState(false);

  const [balancedOpen, setBalancedOpen] = useState(false);
  const [contentOpen, setContentOpen] = useState(false);
  const [selectorDialogOpen, setSelectorDialogOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { user } = useAuth();

  // Stable callbacks for memoized children
  const handleSelectKreativ = useCallback(() => {
    if (usePrivacyMode) togglePrivacyMode();
    if (useProMode) toggleProMode();
    if (onBalancedModeClick) onBalancedModeClick();
    setBalancedOpen(false);
  }, [usePrivacyMode, useProMode, togglePrivacyMode, toggleProMode, onBalancedModeClick]);

  const handleSelectPrivacy = useCallback(() => {
    togglePrivacyMode();
    setBalancedOpen(false);
  }, [togglePrivacyMode]);

  const handleSelectPro = useCallback(() => {
    toggleProMode();
    setBalancedOpen(false);
  }, [toggleProMode]);

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
            !noBorder && 'mb-xs rounded-sm border border-foreground p-sm',
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
        'relative flex w-full flex-col gap-xs',
        !noBorder && 'mb-xs rounded-sm border border-foreground p-sm',
        className
      )}
    >
      <TooltipProvider>
        <div className="flex flex-nowrap items-center justify-center gap-xs">
          {/* Web Search Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn('size-9 sm:size-10', useWebSearch && 'text-primary-500')}
                onClick={toggleWebSearch}
                aria-label="Websuche aktivieren"
                tabIndex={tabIndex.webSearch}
                type="button"
              >
                <HiGlobeAlt className="size-5 sm:size-6" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Websuche</TooltipContent>
          </Tooltip>

          {/* AI Mode Dropdown */}
          <DropdownMenu
            open={balancedOpen}
            onOpenChange={(open) => {
              setBalancedOpen(open);
              if (open) setContentOpen(false);
            }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'size-9 sm:size-10',
                      (usePrivacyMode || useProMode) && 'text-primary-500'
                    )}
                    aria-label={usePrivacyMode ? 'Gruenerator-GPT' : useProMode ? 'Pro' : 'Kreativ'}
                    tabIndex={tabIndex.balancedMode}
                    type="button"
                  >
                    {usePrivacyMode ? (
                      <GrueneratorGPTIcon className="size-5 sm:size-6" />
                    ) : useProMode ? (
                      <HiPlusCircle className="size-5 sm:size-6" />
                    ) : (
                      <HiSparkles className="size-5 sm:size-6" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                {usePrivacyMode ? 'Gruenerator-GPT' : useProMode ? 'Reasoning' : 'Kreativ'}
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="center" className="w-72 p-0">
              <ModeDropdownItems
                usePrivacyMode={usePrivacyMode}
                useProMode={useProMode}
                onSelectKreativ={handleSelectKreativ}
                onSelectPrivacy={handleSelectPrivacy}
                onSelectPro={handleSelectPro}
              />
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Agent Mode Toggle */}
          {showAgentMode && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'size-9 sm:size-10 hover:bg-transparent',
                    useAgentMode && 'text-primary-500'
                  )}
                  onClick={toggleAgentMode}
                  aria-label="Agent-Modus"
                  type="button"
                >
                  <HiBeaker className="size-5 sm:size-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {useAgentMode
                  ? 'Agent-Modus aktiv: Recherche + Strategie'
                  : 'Agent-Modus: Recherchiert und erstellt Kommunikationsstrategie'}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Content Popover */}
          <Popover
            open={contentOpen}
            onOpenChange={(open) => {
              setContentOpen(open);
              if (open) setBalancedOpen(false);
            }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'size-9 sm:size-10',
                      (totalContentCount > 0 || useAutomaticSearch) && 'text-primary-500'
                    )}
                    aria-label="Inhalt"
                    tabIndex={tabIndex.attachment}
                    type="button"
                    disabled={isValidatingFiles}
                  >
                    {useAutomaticSearch ? (
                      <HiLightningBolt className="size-5 sm:size-6" />
                    ) : (
                      <HiPaperClip className="size-5 sm:size-6" />
                    )}
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>
                {isValidatingFiles
                  ? 'Prüfe...'
                  : useAutomaticSearch
                    ? 'Auto'
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
                  className={cn('size-9 sm:size-10', interactiveModeActive && 'text-primary-500')}
                  onClick={onInteractiveModeClick}
                  aria-label="Interaktiver Modus"
                  tabIndex={tabIndex.interactiveMode}
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

      {showWebSearchInfoLink && (
        <div className="mt-xxs text-[0.85rem] leading-relaxed" role="status" aria-live="polite">
          <span>Websuche aktiviert. </span>
          <button
            type="button"
            className="text-primary-500 underline underline-offset-2 hover:opacity-90"
            onClick={onWebSearchInfoClick}
          >
            Was ist das?
          </button>
        </div>
      )}
      {showPrivacyInfoLink && (
        <div className="mt-xxs text-[0.85rem] leading-relaxed" role="status" aria-live="polite">
          <span>Privacy-Mode aktiviert. </span>
          <button
            type="button"
            className="text-primary-500 underline underline-offset-2 hover:opacity-90"
            onClick={onPrivacyInfoClick}
          >
            Was ist das?
          </button>
        </div>
      )}

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
