import React, { useEffect } from 'react';

// Components
import DocumentOverview from '../../../../../../../components/common/DocumentOverview';

// Hooks
import { useOptimizedAuth } from '../../../../../../../hooks/useAuth';
import { useUserTexts } from '../../../../../hooks/useProfileData';

// Utils
import { handleError } from '../../../../../../../components/utils/errorHandling';
import * as documentAndTextUtils from '../../../../../../../components/utils/documentAndTextUtils';

const TextsSection = ({
    isActive,
    onSuccessMessage,
    onErrorMessage,
    onShareToGroup
}) => {
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
    const { data: texts = [], isLoading: textsLoading, error: textsError } = textsQuery;

    // =====================================================================
    // TEXTS FUNCTIONALITY
    // =====================================================================

    // Text handlers
    const handleTextTitleUpdate = async (textId, newTitle) => {
        try {
            await updateTextTitle(textId, newTitle);
            onSuccessMessage('Texttitel erfolgreich aktualisiert.');
        } catch (error) {
            console.error('[TextsSection] Error updating text title:', error);
            onErrorMessage('Fehler beim Aktualisieren des Texttitels: ' + error.message);
            throw error;
        }
    };

    const handleEditText = (text) => {
        window.open(`/editor/collab/${text.id}`, '_blank');
    };

    const handleBulkDeleteTexts = async (textIds) => {
        try {
            const result = await documentAndTextUtils.bulkDeleteTexts(textIds);
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
            onErrorMessage(error.message);
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
            handleError(textsError, onErrorMessage);
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
                onBulkDelete={handleBulkDeleteTexts}
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
