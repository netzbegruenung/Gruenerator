import React, { useEffect, useCallback, memo } from 'react';

// Components
import DocumentOverview, {
  type DocumentItem,
} from '../../../../../../../components/common/DocumentOverview';

// Hooks
import * as documentAndTextUtils from '../../../../../../../components/utils/documentAndTextUtils';
import {
  handleError,
  type ErrorState,
  type SetErrorFn,
} from '../../../../../../../components/utils/errorHandling';
import { useOptimizedAuth } from '../../../../../../../hooks/useAuth';
import { useUserTexts } from '../../../../../hooks/useProfileData';

// Utils

// Static constants moved outside component
const TEXT_DOCUMENT_TYPES = documentAndTextUtils.TEXT_DOCUMENT_TYPES;

// Static empty state config - moved outside to prevent recreation
const EMPTY_STATE_CONFIG = {
  noDocuments: 'Du hast noch keine Texte erstellt.',
  createMessage:
    'Erstelle deinen ersten Text mit einem der Grueneratoren und er wird hier angezeigt.',
} as const;

// Adapter to convert string-based error handler to SetErrorFn
const createErrorAdapter = (onErrorMessage: (message: string) => void): SetErrorFn => {
  return (error: ErrorState | null): void => {
    if (error) {
      onErrorMessage(error.message || error.title || 'Ein Fehler ist aufgetreten');
    }
  };
};

interface TextItem extends DocumentItem {
  id: string;
  content?: string;
}

interface BulkDeleteResult {
  message?: string;
  hasErrors?: boolean;
}

interface TextsSectionProps {
  isActive: boolean;
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string) => void;
  onShareToGroup?: (text: DocumentItem) => void;
}

const TextsSection = memo(
  ({
    isActive,
    onSuccessMessage,
    onErrorMessage,
    onShareToGroup,
  }: TextsSectionProps): React.ReactElement => {
    // Auth state - only destructure what's needed
    const { isAuthenticated } = useOptimizedAuth();

    // =====================================================================
    // TEXTS-RELATED STATE AND FUNCTIONALITY
    // =====================================================================

    // Use centralized hooks
    const {
      query: textsQuery,
      updateTextTitle,
      deleteText,
      isUpdatingTitle: isUpdatingTextTitle,
      isDeleting: isDeletingText,
    } = useUserTexts({ isActive });
    const { data: textsData = [], isLoading: textsLoading, error: textsError } = textsQuery;
    const texts = textsData as DocumentItem[];

    // =====================================================================
    // TEXTS FUNCTIONALITY
    // =====================================================================

    // Text handlers - memoized to prevent unnecessary re-renders
    const handleTextTitleUpdate = useCallback(
      async (textId: string, newTitle: string) => {
        try {
          await updateTextTitle(textId, newTitle);
          onSuccessMessage('Texttitel erfolgreich aktualisiert.');
        } catch (error) {
          console.error('[TextsSection] Error updating text title:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          onErrorMessage('Fehler beim Aktualisieren des Texttitels: ' + errorMessage);
          throw error;
        }
      },
      [updateTextTitle, onSuccessMessage, onErrorMessage]
    );

    const handleEditText = useCallback((text: TextItem) => {
      window.open(`/editor/collab/${text.id}`, '_blank');
    }, []);

    const handleBulkDeleteTexts = useCallback(
      async (textIds: string[]): Promise<BulkDeleteResult> => {
        try {
          const result = (await documentAndTextUtils.bulkDeleteTexts(textIds)) as BulkDeleteResult;
          textsQuery.refetch();
          if (result.message) {
            if (result.hasErrors) {
              onErrorMessage(result.message);
            } else {
              onSuccessMessage(result.message);
            }
          }
          return result;
        } catch (error) {
          console.error('[TextsSection] Error in bulk delete texts:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          onErrorMessage(errorMessage);
          throw error;
        }
      },
      [textsQuery, onSuccessMessage, onErrorMessage]
    );

    // =====================================================================
    // EFFECTS
    // =====================================================================

    // Handle errors
    useEffect(() => {
      if (textsError) {
        console.error('[TextsSection] Fehler beim Laden der Texte:', textsError);
        handleError(textsError, createErrorAdapter(onErrorMessage));
      }
    }, [textsError, onErrorMessage]);

    // Memoized fetch handler to prevent inline function recreation
    const handleFetch = useCallback(async () => {
      try {
        await textsQuery.refetch();
      } catch (error) {
        console.error('[TextsSection] Error refreshing texts:', error);
        onErrorMessage(
          'Fehler beim Aktualisieren der Texte: ' +
            (error instanceof Error ? error.message : 'Unbekannter Fehler')
        );
      }
    }, [textsQuery, onErrorMessage]);

    // Memoized delete handler
    const handleDelete = useCallback((textId: string) => deleteText(textId), [deleteText]);

    // Memoized bulk delete handler wrapper
    const handleBulkDelete = useCallback(
      async (ids: string[]) => {
        await handleBulkDeleteTexts(ids);
      },
      [handleBulkDeleteTexts]
    );

    return (
      <div className="texts-section">
        <div role="tabpanel" id="texts-panel" aria-labelledby="texts-tab" tabIndex={-1}>
          <DocumentOverview
            documents={texts}
            loading={textsLoading}
            onFetch={handleFetch}
            onDelete={handleDelete}
            onBulkDelete={handleBulkDelete}
            onUpdateTitle={handleTextTitleUpdate}
            onEdit={handleEditText}
            onShare={onShareToGroup}
            documentTypes={TEXT_DOCUMENT_TYPES}
            emptyStateConfig={EMPTY_STATE_CONFIG}
            searchPlaceholder="Texte durchsuchen..."
            title="Meine Texte"
            onSuccessMessage={onSuccessMessage}
            onErrorMessage={onErrorMessage}
          />
        </div>
      </div>
    );
  }
);

TextsSection.displayName = 'TextsSection';

export default TextsSection;
