import React, { useEffect } from 'react';

// Components
import DocumentOverview, { type DocumentItem } from '../../../../../../../components/common/DocumentOverview';

// Hooks
import { useOptimizedAuth } from '../../../../../../../hooks/useAuth';
import { useUserTexts } from '../../../../../hooks/useProfileData';

// Utils
import { handleError, type ErrorState, type SetErrorFn } from '../../../../../../../components/utils/errorHandling';
import * as documentAndTextUtils from '../../../../../../../components/utils/documentAndTextUtils';

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

const TextsSection = ({
    isActive,
    onSuccessMessage,
    onErrorMessage,
    onShareToGroup
}: TextsSectionProps): React.ReactElement => {
    // Auth state
    const { user, isAuthenticated } = useOptimizedAuth();

    // =====================================================================
    // TEXTS-RELATED STATE AND FUNCTIONALITY
    // =====================================================================

    // Use centralized hooks
    const {
        query: textsQuery,
        updateTextTitle,
        deleteText,
        isUpdatingTitle: isUpdatingTextTitle,
        isDeleting: isDeletingText
    } = useUserTexts({ isActive });
    const { data: textsData = [], isLoading: textsLoading, error: textsError } = textsQuery;
    const texts = textsData as DocumentItem[];

    // =====================================================================
    // TEXTS FUNCTIONALITY
    // =====================================================================

    // Text handlers
    const handleTextTitleUpdate = async (textId: string, newTitle: string) => {
        try {
            await updateTextTitle(textId, newTitle);
            onSuccessMessage('Texttitel erfolgreich aktualisiert.');
        } catch (error) {
            console.error('[TextsSection] Error updating text title:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            onErrorMessage('Fehler beim Aktualisieren des Texttitels: ' + errorMessage);
            throw error;
        }
    };

    const handleEditText = (text: TextItem) => {
        window.open(`/editor/collab/${text.id}`, '_blank');
    };

    const handleBulkDeleteTexts = async (textIds: string[]): Promise<BulkDeleteResult> => {
        try {
            const result = await documentAndTextUtils.bulkDeleteTexts(textIds) as BulkDeleteResult;
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
    };

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

    // Document types from utilities
    const textDocumentTypes = documentAndTextUtils.TEXT_DOCUMENT_TYPES;

    // =====================================================================
    // RENDER METHODS
    // =====================================================================

    // Render Texts content
    const renderTextsContent = () => (
        <div
            role="tabpanel"
            id="texts-panel"
            aria-labelledby="texts-tab"
            tabIndex={-1}
        >
            <DocumentOverview
                documents={texts}
                loading={textsLoading}
                onFetch={async () => {
                    try {
                        await textsQuery.refetch();
                    } catch (error) {
                        console.error('[TextsSection] Error refreshing texts:', error);
                        onErrorMessage('Fehler beim Aktualisieren der Texte: ' + error.message);
                    }
                }}
                onDelete={(textId) => deleteText(textId)}
                onBulkDelete={async (ids) => { await handleBulkDeleteTexts(ids); }}
                onUpdateTitle={handleTextTitleUpdate}
                onEdit={handleEditText}
                onShare={onShareToGroup}
                documentTypes={textDocumentTypes}
                emptyStateConfig={{
                    noDocuments: 'Du hast noch keine Texte erstellt.',
                    createMessage: 'Erstelle deinen ersten Text mit einem der Grueneratoren und er wird hier angezeigt.'
                }}
                searchPlaceholder="Texte durchsuchen..."
                title="Meine Texte"
                onSuccessMessage={onSuccessMessage}
                onErrorMessage={onErrorMessage}
            />
        </div>
    );

    return (
        <div className="texts-section">
            {renderTextsContent()}
        </div>
    );
};

export default TextsSection;
