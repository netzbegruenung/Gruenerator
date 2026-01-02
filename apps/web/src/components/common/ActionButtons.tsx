import { JSX, useState, useEffect, useRef, ReactNode, MouseEvent, createElement } from 'react';
import { IoCopyOutline, IoCheckmarkOutline, IoCloseOutline, IoRefreshOutline } from "react-icons/io5";
import { HiCog, HiPencil, HiSave } from "react-icons/hi";
import '../../assets/styles/components/actions/action-buttons.css';
import { IoArrowUndoOutline, IoArrowRedoOutline } from "react-icons/io5";
import { copyFormattedContent } from '../utils/commonFunctions';
import ExportDropdown from './ExportDropdown';
import { useLazyAuth } from '../../hooks/useAuth';
import { useBetaFeatures } from '../../hooks/useBetaFeatures';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import { useProfileStore } from '../../stores/profileStore';
import { useSaveToLibrary } from '../../hooks/useSaveToLibrary';
import { hashContent } from '../../utils/contentHash';

interface GeneratedContentObject {
  content?: string;
  social?: { content?: string };
  sharepic?: Record<string, unknown>;
  [key: string]: unknown;
}

type GeneratedContent = string | GeneratedContentObject;

interface ActionButtonsProps {
  isEditing?: boolean;
  onEdit?: () => void;
  allowEditing?: boolean;
  hideEditButton?: boolean;
  className?: string;
  showExport?: boolean;
  showDownload?: boolean;
  showExportDropdown?: boolean;
  showRegenerate?: boolean;
  showSave?: boolean;
  showSaveToLibrary?: boolean;
  showEditMode?: boolean;
  showUndo?: boolean;
  showRedo?: boolean;
  onEditModeToggle?: () => void;
  onRequestEdit?: () => void;
  onReset?: () => void;
  showReset?: boolean;
  isEditModeActive?: boolean;
  onRegenerate?: () => void;
  onSave?: () => void;
  onSaveToLibrary?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  regenerateLoading?: boolean;
  saveLoading?: boolean;
  saveToLibraryLoading?: boolean;
  exportableContent?: string;
  generatedPost?: string;
  generatedContent?: GeneratedContent;
  title?: string;
  componentName?: string;
  customExportOptions?: {
    id?: string;
    label?: string;
    subtitle?: string;
    icon?: ReactNode;
    onClick: (event: React.MouseEvent) => void;
    disabled?: boolean
  }[];
  hideDefaultExportOptions?: boolean;
}

const ActionButtons = ({ onEdit,
  isEditing,
  allowEditing = true,
  hideEditButton = false,
  className = 'display-actions',
  showExport = false,
  showDownload = true,
  showExportDropdown = true,
  showRegenerate = false,
  showSave = false,
  showSaveToLibrary = true,
  showEditMode = false,
  showUndo = true,
  showRedo = true,
  onEditModeToggle,
  onRequestEdit,
  onReset,
  showReset = false,
  isEditModeActive = false,
  onRegenerate,
  onSave,
  onSaveToLibrary,
  onUndo,
  onRedo,
  regenerateLoading = false,
  saveLoading = false,
  saveToLibraryLoading = false,
  exportableContent,
  generatedPost,
  generatedContent,
  title,
  componentName = 'default',
  customExportOptions = [],
  hideDefaultExportOptions = false }: ActionButtonsProps): JSX.Element => {
  const { isAuthenticated } = useLazyAuth();
  const { getBetaFeatureState } = useBetaFeatures();
  const getGeneratedText = useGeneratedTextStore(state => state.getGeneratedText);
  const getGeneratedTextMetadata = useGeneratedTextStore(state => state.getGeneratedTextMetadata);
  const generatedText = getGeneratedText(componentName);
  const generatedTextMetadata = getGeneratedTextMetadata(componentName) as { contentType?: string } | null;
  const undo = useGeneratedTextStore(state => state.undo);
  const redo = useGeneratedTextStore(state => state.redo);
  const [copyIcon, setCopyIcon] = useState(<IoCopyOutline size={16} />);
  const [saveIcon, setSaveIcon] = useState(<HiSave size={16} />);

  const profile = useProfileStore((s) => s.profile);
  const { saveToLibrary: autoSaveToLibrary } = useSaveToLibrary();
  const exportedContentHashesRef = useRef(new Set());

  // Directly compute undo/redo availability from store without local state
  const canUndoState = useGeneratedTextStore(state => {
    const currentHistory = state.history[componentName];
    const currentIndex = state.historyIndex[componentName] ?? 0;
    return !!(currentHistory && currentHistory.length > 1 && currentIndex > 0);
  });
  const canRedoState = useGeneratedTextStore(state => {
    const currentHistory = state.history[componentName];
    const currentIndex = state.historyIndex[componentName] ?? 0;
    return !!(currentHistory && currentHistory.length > 1 && currentIndex < currentHistory.length - 1);
  });

  const hasDatabaseAccess = isAuthenticated && getBetaFeatureState('database');

  // Use generatedContent prop if available, fall back to store's generatedText
  const activeContent = generatedContent || generatedText;

  // Extract string content from GeneratedContent
  const extractStringContent = (content: GeneratedContent | undefined): string => {
    if (!content) return '';
    if (typeof content === 'string') return content;
    return content.content || content.social?.content || JSON.stringify(content);
  };

  const handleCopyToClipboard = async () => {
    console.log('[ActionButtons] Copy button clicked');

    const contentString = extractStringContent(activeContent);

    // First do the copy
    await copyFormattedContent(
      contentString,
      () => {
        setCopyIcon(<IoCheckmarkOutline size={16} />);
        setTimeout(() => {
          setCopyIcon(<IoCopyOutline size={16} />);
        }, 2000);
      },
      () => {}
    );

    console.log('[ActionButtons] Auto-save check', {
      enabled: profile?.auto_save_on_export,
      authenticated: isAuthenticated,
      hasContent: !!activeContent
    });

    // Then check if auto-save is enabled
    if (!profile?.auto_save_on_export || !isAuthenticated || !activeContent) {
      return;
    }

    // Extract string content for hashing (handle both object and string content)
    const contentForHash = contentString;

    const contentHash = hashContent(contentForHash, title);
    if (exportedContentHashesRef.current.has(contentHash)) {
      console.log('[ActionButtons Auto-save] Skipping duplicate content');
      return;
    }

    try {
      const contentType = generatedTextMetadata?.contentType || 'universal';
      console.log('[ActionButtons Auto-save] Saving to library', { contentType });

      // Use the same content extraction for saving
      await autoSaveToLibrary(
        contentForHash,
        title || 'Auto-gespeichert: Kopieren',
        contentType
      );

      exportedContentHashesRef.current.add(contentHash);
      console.log('[ActionButtons Auto-save] Successfully saved');
    } catch (error) {
      console.warn('[ActionButtons Auto-save] Failed:', error);
    }
  };

  const isMobileView = window.innerWidth <= 768;

  // Helper function to detect sharepic-only content
  const isSharepicOnlyContent = (content: GeneratedContent | undefined): boolean => {
    if (!content || typeof content !== 'object') return false;

    const contentObj = content as GeneratedContentObject;
    // Check if we have sharepic but no social content
    const hasSharepic = contentObj.sharepic && Object.keys(contentObj.sharepic).length > 0;
    const hasSocialContent = contentObj.social?.content ||
                            (contentObj.content && !contentObj.sharepic);

    return hasSharepic && !hasSocialContent;
  };

  // Determine if buttons should be hidden (sharepic-only content)
  const shouldHideButtons = isSharepicOnlyContent(activeContent);

  // Handle regular save with success indicator
  const handleSave = () => {
    if (onSave) {
      onSave();
      // Show checkmark after save attempt
      setTimeout(() => {
        setSaveIcon(<IoCheckmarkOutline size={16} />);
        setTimeout(() => {
          setSaveIcon(<HiSave size={16} />);
        }, 2000);
      }, 500);
    }
  };

  const handleUndo = () => {
    if (canUndoState) {
      if (onUndo) {
        onUndo();
      } else {
        undo(componentName);
      }
    }
  };

  const handleRedo = () => {
    if (canRedoState) {
      if (onRedo) {
        onRedo();
      } else {
        redo(componentName);
      }
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Z') ||
                 ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
        e.preventDefault();
        handleRedo();
      }
    };

    if (activeContent && !shouldHideButtons) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [canUndoState, canRedoState, activeContent, shouldHideButtons]);

  // Button definitions for easy reordering
  const renderButton = (type: string) => {
    const exportDropdownProps = {
      content: extractStringContent(activeContent),
      title,
      onSaveToLibrary: showSaveToLibrary && isAuthenticated ? onSaveToLibrary : null,
      saveToLibraryLoading,
      customExportOptions,
      hideDefaultOptions: hideDefaultExportOptions
    };

    const buttons = {
      copy: (
        <button
          key="copy"
          onClick={handleCopyToClipboard}
          className="action-button"
          aria-label="Kopieren"
          {...(!isMobileView && {
            'data-tooltip-id': "action-tooltip",
            'data-tooltip-content': "Kopieren"
          })}
        >
          {copyIcon}
        </button>
      ),
      share: (showExport || showDownload || showExportDropdown) && (
        <ExportDropdown
          key="share"
          {...exportDropdownProps}
          showShareButton={true}
          showMoreMenu={false}
        />
      ),
      undo: showUndo && (canUndoState || isEditModeActive) && (
        <button
          key="undo"
          onClick={handleUndo}
          className="action-button"
          aria-label="Rückgängig (Strg+Z)"
          disabled={!canUndoState}
          {...(!isMobileView && {
            'data-tooltip-id': "action-tooltip",
            'data-tooltip-content': "Rückgängig (Strg+Z)"
          })}
        >
          <IoArrowUndoOutline size={16} />
        </button>
      ),
      redo: showRedo && (canRedoState || isEditModeActive) && (
        <button
          key="redo"
          onClick={handleRedo}
          className="action-button"
          aria-label="Wiederholen (Strg+Y)"
          disabled={!canRedoState}
          {...(!isMobileView && {
            'data-tooltip-id': "action-tooltip",
            'data-tooltip-content': "Wiederholen (Strg+Y)"
          })}
        >
          <IoArrowRedoOutline size={16} />
        </button>
      ),
      regenerate: showRegenerate && generatedPost && onRegenerate && (
        <button
          key="regenerate"
          onClick={onRegenerate}
          className="action-button"
          aria-label="Regenerieren"
          disabled={regenerateLoading}
          {...(!isMobileView && {
            'data-tooltip-id': "action-tooltip",
            'data-tooltip-content': "Regenerieren"
          })}
        >
          <HiCog size={16} />
        </button>
      ),
      save: showSave && hasDatabaseAccess && generatedContent && onSave && (
        <button
          key="save"
          onClick={handleSave}
          className="action-button"
          aria-label="In Supabase speichern"
          disabled={saveLoading}
          {...(!isMobileView && {
            'data-tooltip-id': "action-tooltip",
            'data-tooltip-content': "In Supabase speichern"
          })}
        >
          {saveIcon}
        </button>
      ),
      reset: showReset && onReset && (
        <button
          key="reset"
          onClick={onReset}
          className="action-button"
          aria-label="Zurücksetzen"
          {...(!isMobileView && {
            'data-tooltip-id': "action-tooltip",
            'data-tooltip-content': "Zurücksetzen"
          })}
        >
          <IoRefreshOutline size={16} />
        </button>
      ),
      edit: showEditMode && activeContent && (onRequestEdit || onEditModeToggle) && (
        <button
          key="edit"
          onClick={() => {
            if (onRequestEdit) {
              onRequestEdit();
            } else if (onEditModeToggle) {
              onEditModeToggle();
            }
          }}
          className={`action-button ${isEditModeActive ? 'active' : ''}`}
          aria-label={isEditModeActive ? "Edit Mode schließen" : "Edit Mode umschalten"}
          {...(!isMobileView && {
            'data-tooltip-id': "action-tooltip",
            'data-tooltip-content': isEditModeActive ? "Schließen" : "Edit Mode"
          })}
        >
          {isEditModeActive ? <IoCloseOutline size={16} /> : <HiPencil size={16} />}
        </button>
      ),
      more: (showExport || showDownload || showExportDropdown) && (
        <ExportDropdown
          key="more"
          {...exportDropdownProps}
          showShareButton={false}
          showMoreMenu={true}
        />
      )
    };

    return buttons[type];
  };

  // Button order: copy, share, undo, redo, edit, more (3-dot menu)
  const buttonOrder = ['copy', 'share', 'undo', 'redo', 'edit', 'more'];

  return (
    <div className={className}>
      {activeContent && !shouldHideButtons && (
        <>
          {buttonOrder.map(type => renderButton(type))}
        </>
      )}
    </div>
  );
};

export default ActionButtons;
