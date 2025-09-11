import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { HiPlus } from 'react-icons/hi';

// Components
import DocumentOverview from '../../../../../../../components/common/DocumentOverview';
import DocumentUpload from '../../../../../../../components/common/DocumentUpload';
import { WolkeSyncManager } from '../../../../../../documents/components/WolkeSyncManager';
import { ProfileIconButton } from '../../../../../../../components/profile/actions/ProfileActionButton';

// Hooks
import { useOptimizedAuth } from '../../../../../../../hooks/useAuth';
import { useTabIndex } from '../../../../../../../hooks/useTabIndex';
import { useDocumentMode } from '../../../../../../documents/hooks/useDocumentMode';

// Stores
import { useDocumentsStore } from '../../../../../../../stores/documentsStore';
import { useWolkeStore } from '../../../../../../../stores/wolkeStore';

// Utils
import { handleError } from '../../../../../../../components/utils/errorHandling';
import * as documentAndTextUtils from '../../../../../../../components/utils/documentAndTextUtils';

// Memoized DocumentUpload wrapper to prevent re-renders
const MemoizedDocumentUpload = memo(({ onUploadComplete, onDeleteComplete, showDocumentsList = true, showTitle = true, forceShowUploadForm = false, showAsModal = false }) => {
    return (
        <DocumentUpload 
            onUploadComplete={onUploadComplete}
            onDeleteComplete={onDeleteComplete}
            showTitle={showTitle}
            showDocumentsList={showDocumentsList}
            forceShowUploadForm={forceShowUploadForm}
            showAsModal={showAsModal}
        />
    );
});

MemoizedDocumentUpload.displayName = 'MemoizedDocumentUpload';

const DocumentsSection = ({ 
    isActive, 
    onSuccessMessage, 
    onErrorMessage,
    onShareToGroup
}) => {
    // Tab index configuration
    const tabIndex = useTabIndex('PROFILE_CONTENT_MANAGEMENT');
    
    // Auth state
    const { user, isAuthenticated } = useOptimizedAuth();

    // Document mode management
    const { 
        loading: modeLoading 
    } = useDocumentMode();

    // =====================================================================
    // DOCUMENTS-RELATED STATE AND FUNCTIONALITY
    // =====================================================================
    
    // Document upload form state
    const [showUploadForm, setShowUploadForm] = useState(false);

    // Documents store integration
    const {
        documents,
        isLoading: documentsLoading,
        error: documentsError,
        fetchDocuments,
        deleteDocument,
        updateDocumentTitle,
        refreshDocument,
        searchDocuments: searchDocumentsApi,
        isSearching: isDocumentsSearching,
        searchResults: documentSearchResults,
        clearSearchResults,
    } = useDocumentsStore();

    // Wolke store integration
    const {
        shareLinks: wolkeShareLinks,
        isLoading: wolkeLoading,
        error: wolkeError,
        fetchShareLinks,
        initialized: wolkeInitialized
    } = useWolkeStore();

    // Stable remote search handler to avoid re-triggering effect
    const handleDocumentsRemoteSearch = useCallback((q, mode) => {
        return searchDocumentsApi(q, { limit: 10, mode });
    }, [searchDocumentsApi]);

    // =====================================================================
    // DOCUMENTS FUNCTIONALITY
    // =====================================================================

    // Document handlers
    const handleDocumentDelete = async (documentId) => {
        try {
            await deleteDocument(documentId);
            onSuccessMessage('Dokument wurde erfolgreich gelöscht.');
        } catch (error) {
            console.error('[DocumentsSection] Error deleting document:', error);
            onErrorMessage('Fehler beim Löschen des Dokuments: ' + error.message);
            throw error;
        }
    };

    const handleDocumentEdit = (document) => {
        onSuccessMessage('Dokumentbearbeitung wird bald verfügbar sein.');
    };

    const handleDocumentTitleUpdate = async (documentId, newTitle) => {
        try {
            await updateDocumentTitle(documentId, newTitle);
        } catch (error) {
            console.error('[DocumentsSection] Error updating document title:', error);
            onErrorMessage('Fehler beim Aktualisieren des Dokumenttitels: ' + error.message);
            throw error;
        }
    };

    const handleDocumentRefresh = async (documentId) => {
        try {
            await refreshDocument(documentId);
        } catch (error) {
            console.error('[DocumentsSection] Error refreshing document:', error);
            onErrorMessage('Fehler beim Aktualisieren des Dokumentstatus: ' + error.message);
            throw error;
        }
    };

    const handleBulkDeleteDocuments = async (documentIds) => {
        try {
            const result = await documentAndTextUtils.bulkDeleteDocuments(documentIds);
            fetchDocuments();
            if (result.message) {
                if (result.hasErrors) {
                    onErrorMessage(result.message);
                } else {
                    onSuccessMessage(result.message);
                }
            }
            return result;
        } catch (error) {
            console.error('[DocumentsSection] Error in bulk delete documents:', error);
            onErrorMessage(error.message);
            throw error;
        }
    };

    // Upload handlers
    const handleUploadComplete = React.useCallback((document) => {
        onSuccessMessage(`Dokument "${document.title}" wurde erfolgreich hochgeladen und wird verarbeitet.`);
    }, [onSuccessMessage]);

    const handleDeleteComplete = React.useCallback(() => {
        onSuccessMessage('Dokument wurde erfolgreich gelöscht.');
    }, [onSuccessMessage]);

    const handleModalUploadComplete = React.useCallback((document) => {
        if (document) {
            handleUploadComplete(document);
        }
        setShowUploadForm(false);
    }, [handleUploadComplete]);

    // =====================================================================
    // WOLKE SYNC FUNCTIONALITY
    // =====================================================================

    // Wolke sync handlers
    const handleWolkeSyncComplete = useCallback(() => {
        // Refresh documents after Wolke sync completes
        fetchDocuments();
        onSuccessMessage('Wolke-Synchronisation erfolgreich abgeschlossen.');
    }, [fetchDocuments, onSuccessMessage]);

    const handleRefreshWolkeShareLinks = useCallback(async (forceRefresh = false) => {
        try {
            await fetchShareLinks();
        } catch (error) {
            console.error('[DocumentsSection] Error refreshing Wolke share links:', error);
            onErrorMessage('Fehler beim Aktualisieren der Wolke-Verbindungen: ' + error.message);
        }
    }, [fetchShareLinks, onErrorMessage]);

    // =====================================================================
    // EFFECTS
    // =====================================================================

    // Handle errors
    useEffect(() => {
        if (documentsError) {
            console.error('[DocumentsSection] Fehler beim Laden der Dokumente:', documentsError);
            onErrorMessage('Fehler beim Laden der Dokumente: ' + documentsError);
        }
    }, [documentsError, onErrorMessage]);

    // Handle Wolke errors
    useEffect(() => {
        if (wolkeError) {
            console.error('[DocumentsSection] Fehler beim Laden der Wolke-Daten:', wolkeError);
            onErrorMessage('Fehler beim Laden der Wolke-Verbindungen: ' + wolkeError);
        }
    }, [wolkeError, onErrorMessage]);

    // Fetch documents when documents tab becomes active - use ref to prevent loops
    const fetchDocumentsRef = useRef();
    fetchDocumentsRef.current = fetchDocuments;
    
    useEffect(() => {
        if (isActive) {
            fetchDocumentsRef.current();
            // Also fetch Wolke share links when tab becomes active
            if (!wolkeInitialized) {
                handleRefreshWolkeShareLinks();
            }
        }
    }, [isActive, wolkeInitialized, handleRefreshWolkeShareLinks]);

    // Document types from utilities
    const documentTypes = documentAndTextUtils.DOCUMENT_TYPES;

    // =====================================================================
    // RENDER METHODS
    // =====================================================================

    // Render Documents content with mode selector
    const renderDocumentsContent = () => (
        <div
            role="tabpanel"
            id="documents-panel"
            aria-labelledby="documents-tab"
            tabIndex={-1}
        >
            {/* Conditional content based on mode */}
            {modeLoading ? (
                <div className="loading-state">
                </div>
            ) : (
                <>
                    {/* Wolke Sync Manager Section */}
                    <WolkeSyncManager
                        wolkeShareLinks={wolkeShareLinks}
                        onRefreshShareLinks={handleRefreshWolkeShareLinks}
                        onSyncComplete={handleWolkeSyncComplete}
                    />

                    <DocumentOverview
                            documents={documents}
                            loading={documentsLoading}
                            onFetch={fetchDocuments}
                            onDelete={handleDocumentDelete}
                            onBulkDelete={handleBulkDeleteDocuments}
                            onUpdateTitle={handleDocumentTitleUpdate}
                            onEdit={handleDocumentEdit}
                            onRefreshDocument={handleDocumentRefresh}
                            onShare={onShareToGroup}
                            documentTypes={documentTypes}
                            emptyStateConfig={{
                                noDocuments: 'Keine Dokumente vorhanden.',
                                createMessage: 'Lade dein erstes Dokument hoch um loszulegen. Alle Dokumente werden als durchsuchbare Vektoren gespeichert.'
                            }}
                            searchPlaceholder="Alle Dokumente durchsuchen..."
                            title="Meine Dokumente"
                            subtitle="Dokumente und Dateien"
                            onSuccessMessage={onSuccessMessage}
                            onErrorMessage={onErrorMessage}
                            enableGrouping={true}
                            remoteSearchEnabled={true}
                            onRemoteSearch={handleDocumentsRemoteSearch}
                            isRemoteSearching={isDocumentsSearching}
                            remoteResults={documentSearchResults}
                            onClearRemoteSearch={clearSearchResults}
                            headerActions={
                                <div style={{ display: 'flex', gap: 'var(--spacing-small)' }}>
                                    <ProfileIconButton
                                        action="refresh"
                                        onClick={fetchDocuments}
                                        disabled={documentsLoading}
                                        ariaLabel="Alle Dokumente aktualisieren"
                                        title="Aktualisieren"
                                    />
                                    <button
                                        type="button"
                                        className="btn-primary size-s"
                                        onClick={() => setShowUploadForm(true)}
                                        tabIndex={tabIndex.addContentButton}
                                        aria-label="Neuen Inhalt hinzufügen"
                                    >
                                        <HiPlus className="icon" />
                                        Inhalt hinzufügen
                                    </button>
                                </div>
                            }
                        />
                        
                    {/* Upload form modal/overlay */}
                    {showUploadForm && (
                        <DocumentUpload 
                            onUploadComplete={handleModalUploadComplete}
                            onDeleteComplete={handleDeleteComplete}
                            showDocumentsList={false}
                            showTitle={false}
                            forceShowUploadForm={true}
                            showAsModal={true}
                        />
                    )}
                </>
            )}
        </div>
    );

    return (
        <div className="documents-section">
            {renderDocumentsContent()}
        </div>
    );
};

export default DocumentsSection;