import { useDocumentStore, createDocsApiClient } from '@gruenerator/docs';
import React, { forwardRef, lazy, Suspense, type ReactNode, useMemo } from 'react';

import { webAppDocsAdapter } from '../../../../features/docs/docsAdapter';
import { useLazyAuth } from '../../../../hooks/useAuth';
import { useDeferredTitle, awaitDeferredTitle } from '../../../../hooks/useDeferredTitle';
import { useSaveToLibrary } from '../../../../hooks/useSaveToLibrary';
import useGeneratedTextStore from '../../../../stores/core/generatedTextStore';
import ActionButtons from '../../ActionButtons';
import AutoSaveIndicator from '../../AutoSaveIndicator';
import EnrichmentSourcesDisplay from '../../EnrichmentSourcesDisplay';
import { useFormStateSelector } from '../FormStateProvider';

import ContentRenderer from './ContentRenderer';
import ErrorDisplay from './ErrorDisplay';

import type {
  GeneratedContent,
  HelpContent,
  CustomExportOption,
  ContentMetadata,
} from '@/types/baseform';

const DocsEditorModal = lazy(() => import('../../DocsEditorModal'));

// Extended content type for internal use that includes all possible properties
interface ExtendedContent {
  content?: string;
  text?: string;
  sharepic?: unknown;
  social?: { content?: string };
  metadata?: Record<string, unknown>;
}

interface DisplaySectionProps {
  title: string;
  error?: string | Error | { message?: string } | null;
  value?: string | null;
  generatedContent?: GeneratedContent;
  useMarkdown?: boolean | null;
  helpContent?: HelpContent | null;
  generatedPost?: string;
  onGeneratePost?: () => void | Promise<void>;
  getExportableContent?: ((content: unknown) => string) | (() => string);
  displayActions?: ReactNode;
  onSave?: () => void;
  saveLoading?: boolean;
  componentName?: string;
  onErrorDismiss?: () => void;
  onEditModeToggle?: () => void;
  onRequestEdit?: () => void;
  showUndoControls?: boolean;
  showRedoControls?: boolean;
  renderActions?: (actionButtons: ReactNode) => ReactNode;
  showResetButton?: boolean;
  onReset?: () => void;
  renderEmptyState?: () => ReactNode;
  customEditContent?: ReactNode;
  customRenderer?:
    | ((props: {
        content: unknown;
        generatedContent: unknown;
        componentName: string;
        helpContent?: HelpContent | null;
        onEditModeToggle?: () => void;
      }) => ReactNode)
    | null;
  customExportOptions?: CustomExportOption[];
  hideDefaultExportOptions?: boolean;
  isStartMode?: boolean;
}

const DisplaySection = forwardRef<HTMLDivElement, DisplaySectionProps>(
  (
    {
      title,
      error,
      value,
      generatedContent,
      useMarkdown = null,

      helpContent,
      generatedPost,
      onGeneratePost,
      getExportableContent,
      displayActions = null,
      onSave,
      saveLoading: propSaveLoading = false,
      componentName = 'default',
      onErrorDismiss,
      onEditModeToggle,
      onRequestEdit,
      showUndoControls = true,
      showRedoControls = true,
      renderActions = null,
      showResetButton = false,
      onReset,
      renderEmptyState = null,
      customEditContent = null,
      customRenderer = null,
      customExportOptions = [],
      hideDefaultExportOptions = false,
      isStartMode = false,
    },
    ref
  ) => {
    const { user } = useLazyAuth();
    const storeGeneratedText = useGeneratedTextStore(
      (state) => state.generatedTexts[componentName] || ''
    );
    const storeGeneratedTextMetadata = useGeneratedTextStore((state) =>
      state.getGeneratedTextMetadata(componentName)
    ) as ContentMetadata | null;
    const isStreaming = useGeneratedTextStore((state) => state.isStreaming);
    const isLoading = useGeneratedTextStore((state) => state.isLoading);
    const [generatePostLoading, setGeneratePostLoading] = React.useState(false);
    const {
      saveToLibrary,
      isLoading: saveToLibraryLoading,
      error: saveToLibraryError,
      success: saveToLibrarySuccess,
    } = useSaveToLibrary();

    // Store selectors for potential future use
    const storeSaveLoading = useFormStateSelector((state) => state.saveLoading);

    // Use store state with prop fallback
    const saveLoading = storeSaveLoading || propSaveLoading;

    // Determine the content to display and use for actions
    // Priority: store content -> props fallback (no edit mode)
    const activeContent = React.useMemo(() => {
      if (storeGeneratedText) {
        return storeGeneratedText;
      } else {
        return generatedContent || value || '';
      }
    }, [storeGeneratedText, generatedContent, value]);

    const hasRenderableContent = React.useMemo(() => {
      if (!activeContent) return false;
      if (typeof activeContent === 'string') {
        return activeContent.trim().length > 0;
      }
      if (typeof activeContent === 'object') {
        const content = activeContent as ExtendedContent;
        if (content.sharepic) return true;
        if (typeof content.content === 'string' && content.content.trim().length > 0) return true;
        if (typeof content.text === 'string' && content.text.trim().length > 0) return true;
        if (
          content.social?.content &&
          typeof content.social.content === 'string' &&
          content.social.content.trim().length > 0
        )
          return true;
      }
      return false;
    }, [activeContent]);

    const handleGeneratePost = React.useCallback(async () => {
      if (!onGeneratePost) return;

      setGeneratePostLoading(true);
      try {
        await onGeneratePost();
      } catch {
        // Error handled by onGeneratePost
      } finally {
        setGeneratePostLoading(false);
      }
    }, [onGeneratePost]);

    // Check if activeContent is mixed content (has both social and sharepic)
    const isMixedContent =
      activeContent &&
      typeof activeContent === 'object' &&
      ((activeContent as ExtendedContent).sharepic || (activeContent as ExtendedContent).social);

    const currentExportableContent = React.useMemo((): string => {
      // For export, use the social content string if it's mixed content
      if (isMixedContent && typeof activeContent === 'object' && activeContent !== null) {
        const extContent = activeContent as ExtendedContent;
        return extContent.social?.content || extContent.content || '';
      }
      // Convert to string if not already
      if (typeof activeContent === 'string') {
        return activeContent;
      }
      if (typeof activeContent === 'object' && activeContent !== null) {
        return (activeContent as ExtendedContent).content || '';
      }
      return '';
    }, [activeContent, isMixedContent]);

    const handleSaveToLibrary = React.useCallback(async () => {
      try {
        await awaitDeferredTitle(componentName);
        const meta = useGeneratedTextStore
          .getState()
          .getGeneratedTextMetadata(componentName) as ContentMetadata | null;
        const titleToUse = meta?.title || title || 'Unbenannter Text';

        await saveToLibrary(currentExportableContent, titleToUse, meta?.contentType || 'universal');
      } catch (error) {
        // Error handling is managed by the hook
      }
    }, [currentExportableContent, title, componentName, saveToLibrary]);

    // "Edit in Docs" — create a collaborative document and open full-screen modal
    const createDocument = useDocumentStore((state) => state.createDocument);
    const docsApiClient = useMemo(() => createDocsApiClient(webAppDocsAdapter), []);
    const [editInDocsLoading, setEditInDocsLoading] = React.useState(false);
    const [editorModal, setEditorModal] = React.useState<{
      documentId: string;
      initialContent: string;
      title: string;
    } | null>(null);

    useDeferredTitle(
      componentName,
      currentExportableContent,
      storeGeneratedTextMetadata,
      isStreaming
    );

    const handleEditInDocs = React.useCallback(async () => {
      if (!currentExportableContent) return;

      setEditInDocsLoading(true);
      try {
        await awaitDeferredTitle(componentName);
        const meta = useGeneratedTextStore
          .getState()
          .getGeneratedTextMetadata(componentName) as ContentMetadata | null;
        const docTitle = meta?.title || title || 'Generierter Text';
        const doc = await createDocument(docsApiClient, docTitle);
        setEditorModal({
          documentId: doc.id,
          initialContent: currentExportableContent,
          title: docTitle,
        });
      } catch (error) {
        console.error('[DisplaySection] Failed to create document:', error);
      } finally {
        setEditInDocsLoading(false);
      }
    }, [currentExportableContent, componentName, title, createDocument, docsApiClient]);

    const actionButtons = (
      <ActionButtons
        isEditing={false}
        showExport={true}
        showDownload={true}
        showRegenerate={true}
        showSave={!!onSave}
        showSaveToLibrary={true}
        showUndo={showUndoControls}
        showRedo={showRedoControls}
        onRegenerate={onGeneratePost}
        onSave={onSave}
        onSaveToLibrary={handleSaveToLibrary}
        onEditModeToggle={onEditModeToggle}
        regenerateLoading={generatePostLoading || isStreaming}
        saveLoading={saveLoading}
        saveToLibraryLoading={saveToLibraryLoading}
        exportableContent={currentExportableContent}
        generatedPost={generatedPost}
        generatedContent={activeContent as string | undefined}
        title={storeGeneratedTextMetadata?.title || title}
        componentName={componentName}
        onRequestEdit={onRequestEdit}
        onEditInDocs={handleEditInDocs}
        editInDocsLoading={editInDocsLoading}
        showReset={showResetButton}
        onReset={onReset}
        customExportOptions={customExportOptions}
        hideDefaultExportOptions={hideDefaultExportOptions}
      />
    );

    const actionsNode = hasRenderableContent ? (
      renderActions ? (
        renderActions(actionButtons)
      ) : (
        <div className="display-header">
          {actionButtons}
          <AutoSaveIndicator componentName={componentName} />
        </div>
      )
    ) : null;

    return (
      <div
        className={`display-container ${isStartMode ? 'display-container--start-mode' : ''}`}
        id="display-section-container"
        ref={ref}
      >
        {actionsNode}
        <div className="display-content">
          {hasRenderableContent ? (
            <>
              <ErrorDisplay
                error={
                  typeof error === 'string'
                    ? error
                    : error instanceof Error
                      ? error.message
                      : (error?.message ?? null)
                }
                onDismiss={onErrorDismiss}
              />
              {customRenderer ? (
                customRenderer({
                  content: activeContent,
                  generatedContent: storeGeneratedText || generatedContent || activeContent,
                  componentName,
                  helpContent,
                  onEditModeToggle,
                })
              ) : (
                <ContentRenderer
                  value={activeContent}
                  generatedContent={storeGeneratedText || generatedContent || activeContent}
                  useMarkdown={useMarkdown}
                  componentName={componentName}
                  helpContent={helpContent}
                  onEditModeToggle={onEditModeToggle}
                />
              )}
            </>
          ) : renderEmptyState ? (
            renderEmptyState()
          ) : null}
        </div>
        {/* Render enrichment sources if available */}
        {hasRenderableContent && storeGeneratedTextMetadata?.enrichmentSummary && (
          <EnrichmentSourcesDisplay
            enrichmentSummary={storeGeneratedTextMetadata.enrichmentSummary}
          />
        )}
        {/* Render additional display actions if provided */}
        {displayActions && <div className="display-action-section">{displayActions}</div>}
        {/* Full-screen docs editor modal */}
        {editorModal && (
          <Suspense fallback={null}>
            <DocsEditorModal
              documentId={editorModal.documentId}
              initialContent={editorModal.initialContent}
              title={editorModal.title}
              onClose={() => setEditorModal(null)}
            />
          </Suspense>
        )}
      </div>
    );
  }
);

DisplaySection.displayName = 'DisplaySection';

export default React.memo(DisplaySection);
