import React, { useState, useRef, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from "motion/react";
import { HiDocumentText, HiPlus, HiExclamationCircle, HiRefresh, HiChatAlt2, HiCollection } from 'react-icons/hi';
import DocumentUpload from '../../../../components/common/DocumentUpload';
import DocumentOverview from '../../../../components/common/DocumentOverview';
// import QAList from '../../../qa/components/QAList'; // Replaced with DocumentOverview
import QACreator from '../../../qa/components/QACreator';
import { useQACollections } from '../../utils/profileUtils';
import { useDocumentsStore } from '../../../../stores/documentsStore';
import { handleError } from '../../../../components/utils/errorHandling';

// Memoized DocumentUpload wrapper to prevent re-renders
const MemoizedDocumentUpload = memo(({ onUploadComplete, onDeleteComplete, showDocumentsList = true, showTitle = true, forceShowUploadForm = false, showAsModal = false }) => {
    console.log('[MemoizedDocumentUpload] Rendering with props:', {
        showDocumentsList,
        showTitle,
        forceShowUploadForm,
        showAsModal,
        hasOnUploadComplete: !!onUploadComplete,
        hasOnDeleteComplete: !!onDeleteComplete
    });
    
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

const DocumentsTab = ({ isActive, onSuccessMessage, onErrorMessage }) => {
    const navigate = useNavigate();
    const [currentView, setCurrentView] = useState('documents');
    const [showQACreator, setShowQACreator] = useState(false);
    const [editingQA, setEditingQA] = useState(null);
    const [availableDocuments, setAvailableDocuments] = useState([]);
    const [showUploadForm, setShowUploadForm] = useState(false);
    const showUploadFormRef = useRef(false);
    
    // Debug log for showUploadForm state changes
    React.useEffect(() => {
        console.log('[DocumentsTab] showUploadForm state changed to:', showUploadForm);
        console.log('[DocumentsTab] Stack trace for state change:', new Error().stack);
    }, [showUploadForm]);

    // Documents store integration
    const {
        documents,
        isLoading: documentsLoading,
        error: documentsError,
        fetchDocuments,
        deleteDocument,
        updateDocumentTitle,
        refreshDocument,
    } = useDocumentsStore();

    // Q&A functionality with centralized hook pattern (like IntelligenceTab)
    const { 
        query: qaQuery, 
        createQACollection, 
        updateQACollection, 
        deleteQACollection,
        fetchAvailableDocuments,
        getQACollection,
        isCreating,
        isUpdating, 
        isDeleting
    } = useQACollections({ isActive });
    
    const { data: qaCollections = [], isLoading: qaLoading, error: qaError, refetch } = qaQuery;

    // Handle Q&A errors like CustomGeneratorsTab
    useEffect(() => {
        if (qaError) {
            console.error('[DocumentsTab] Fehler beim Laden der Q&A-Sammlungen:', qaError);
            handleError(qaError, onErrorMessage);
        }
    }, [qaError, onErrorMessage]);

    // Handle documents errors
    useEffect(() => {
        if (documentsError) {
            console.error('[DocumentsTab] Fehler beim Laden der Dokumente:', documentsError);
            onErrorMessage('Fehler beim Laden der Dokumente: ' + documentsError);
        }
    }, [documentsError, onErrorMessage]);

    // Fetch documents when tab becomes active
    useEffect(() => {
        if (isActive && currentView === 'documents') {
            console.log('[DocumentsTab] Fetching documents due to tab/view change');
            fetchDocuments();
        }
    }, [isActive, currentView, fetchDocuments]);

    // Monitor documents changes
    useEffect(() => {
        console.log('[DocumentsTab] Documents changed:', documents?.length, 'loading:', documentsLoading);
    }, [documents, documentsLoading]);

    const handleTabClick = (view) => {
        setCurrentView(view);
        if (view === 'qa') {
            // Clear any previous error messages
            onErrorMessage('');
        }
    };

    const handleCreateQA = async () => {
        setEditingQA(null);
        
        // Load available documents when showing Q&A creator
        try {
            onErrorMessage('');
            const docs = await fetchAvailableDocuments();
            setAvailableDocuments(docs);
            setShowQACreator(true);
        } catch (error) {
            console.error('[DocumentsTab] Fehler beim Laden der Dokumente:', error);
            handleError(error, onErrorMessage);
        }
    };

    const handleEditQA = async (qaId) => {
        const qa = getQACollection(qaId);
        setEditingQA(qa);
        
        // Load available documents when showing Q&A editor
        try {
            onErrorMessage('');
            const docs = await fetchAvailableDocuments();
            setAvailableDocuments(docs);
            setShowQACreator(true);
        } catch (error) {
            console.error('[DocumentsTab] Fehler beim Laden der Dokumente beim Bearbeiten:', error);
            handleError(error, onErrorMessage);
        }
    };

    const handleSaveQA = async (qaData) => {
        onErrorMessage('');
        onSuccessMessage('');
        
        try {
            if (qaData.id) {
                await updateQACollection(qaData.id, qaData);
                onSuccessMessage('Q&A-Sammlung wurde erfolgreich aktualisiert.');
            } else {
                await createQACollection(qaData);
                onSuccessMessage('Q&A-Sammlung wurde erfolgreich erstellt.');
            }
            setShowQACreator(false);
            setEditingQA(null);
        } catch (error) {
            console.error('[DocumentsTab] Fehler beim Speichern der Q&A:', error);
            handleError(error, onErrorMessage);
        }
    };

    const handleDeleteQA = async (qaId) => {
        if (!window.confirm('Möchten Sie diese Q&A-Sammlung wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
            return;
        }

        onErrorMessage('');
        onSuccessMessage('');
        
        try {
            await deleteQACollection(qaId);
            onSuccessMessage('Q&A-Sammlung wurde erfolgreich gelöscht.');
        } catch (error) {
            console.error('[DocumentsTab] Fehler beim Löschen der Q&A:', error);
            handleError(error, onErrorMessage);
        }
    };

    const handleShareQA = (qaId) => {
        // TODO: Implement sharing functionality
        onSuccessMessage('Sharing-Funktionalität wird bald verfügbar sein.');
    };

    const handleViewQA = (qaId) => {
        // Navigate to Q&A chat interface
        navigate(`/qa/${qaId}`);
    };

    const renderNavigationPanel = () => {
        return (
            <div className="profile-vertical-navigation">
                <button
                    className={`profile-vertical-tab ${currentView === 'documents' ? 'active' : ''}`}
                    onClick={() => handleTabClick('documents')}
                >
                    Meine Dokumente
                </button>
                <button
                    className={`profile-vertical-tab ${currentView === 'qa' ? 'active' : ''}`}
                    onClick={() => handleTabClick('qa')}
                >
                    Meine Q&As
                </button>
            </div>
        );
    };

    // Memoized callbacks to prevent unnecessary re-renders
    const handleUploadComplete = React.useCallback((document) => {
        onSuccessMessage(`Dokument "${document.title}" wurde erfolgreich hochgeladen und wird verarbeitet.`);
    }, [onSuccessMessage]);

    const handleDeleteComplete = React.useCallback(() => {
        onSuccessMessage('Dokument wurde erfolgreich gelöscht.');
    }, [onSuccessMessage]);

    // Memoized upload complete callback for modal
    const handleModalUploadComplete = React.useCallback((document) => {
        console.log('[DocumentsTab] Upload completed or cancelled, hiding form');
        if (document) {
            handleUploadComplete(document);
        }
        setShowUploadForm(false);
    }, [handleUploadComplete]);

    // Document action handlers for DocumentOverview
    const handleDocumentDelete = async (documentId) => {
        try {
            await deleteDocument(documentId);
            onSuccessMessage('Dokument wurde erfolgreich gelöscht.');
        } catch (error) {
            console.error('[DocumentsTab] Error deleting document:', error);
            onErrorMessage('Fehler beim Löschen des Dokuments: ' + error.message);
            throw error;
        }
    };

    const handleDocumentEdit = (document) => {
        // For documents, we could open them in a separate view or just show the preview
        // For now, just show a message that editing is not yet implemented
        onSuccessMessage('Dokumentbearbeitung wird bald verfügbar sein.');
    };

    const handleDocumentTitleUpdate = async (documentId, newTitle) => {
        try {
            await updateDocumentTitle(documentId, newTitle);
        } catch (error) {
            console.error('[DocumentsTab] Error updating document title:', error);
            onErrorMessage('Fehler beim Aktualisieren des Dokumenttitels: ' + error.message);
            throw error;
        }
    };

    const handleDocumentRefresh = async (documentId) => {
        try {
            await refreshDocument(documentId);
        } catch (error) {
            console.error('[DocumentsTab] Error refreshing document:', error);
            onErrorMessage('Fehler beim Aktualisieren des Dokumentstatus: ' + error.message);
            throw error;
        }
    };

    // Document types for display
    const documentTypes = {
        'pdf': 'PDF-Dokument',
        'document': 'Dokument',
        'text': 'Text',
        'upload': 'Hochgeladene Datei'
    };

    return (
        <motion.div 
            className="profile-content profile-management-layout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            <div className="profile-navigation-panel">
                {renderNavigationPanel()}
            </div>
            <div className="profile-content-panel profile-form-section">
                <div className="profile-content-card">
                    <div className="auth-form">
                        {currentView === 'documents' && (
                            <>
                                {console.log('[DocumentsTab] Rendering documents view. showUploadForm:', showUploadForm)}
                                <DocumentOverview
                                    documents={documents}
                                    loading={documentsLoading}
                                    onFetch={fetchDocuments}
                                    onDelete={handleDocumentDelete}
                                    onUpdateTitle={handleDocumentTitleUpdate}
                                    onEdit={handleDocumentEdit}
                                    onRefreshDocument={handleDocumentRefresh}
                                    documentTypes={documentTypes}
                                    emptyStateConfig={{
                                        noDocuments: 'Keine Dokumente vorhanden.',
                                        createMessage: 'Lade dein erstes Dokument hoch, um loszulegen.'
                                    }}
                                    searchPlaceholder="Dokumente durchsuchen..."
                                    title="Meine Dokumente"
                                    onSuccessMessage={onSuccessMessage}
                                    onErrorMessage={onErrorMessage}
                                    headerActions={
                                        <button
                                            type="button"
                                            className="btn-primary size-s"
                                            onClick={() => {
                                                console.log('[DocumentsTab] Upload button clicked, setting showUploadForm to true');
                                                setShowUploadForm(true);
                                                console.log('[DocumentsTab] showUploadForm state should now be true');
                                            }}
                                        >
                                            <HiPlus className="icon" />
                                            Dokument hochladen
                                        </button>
                                    }
                                />
                                
                                {/* Upload form modal/overlay */}
                                {console.log('[DocumentsTab] About to check showUploadForm condition:', showUploadForm)}
                                {showUploadForm && (
                                    <>
                                        {console.log('[DocumentsTab] Inside showUploadForm condition - about to render DocumentUpload directly')}
                                        <DocumentUpload 
                                            onUploadComplete={handleModalUploadComplete}
                                            onDeleteComplete={handleDeleteComplete}
                                            showDocumentsList={false}
                                            showTitle={false}
                                            forceShowUploadForm={true}
                                            showAsModal={true}
                                        />
                                    </>
                                )}
                            </>
                        )}

                        {currentView === 'qa' && (
                            <div className="profile-card">
                                <div className="profile-card-header">
                                    <h3>{showQACreator ? (editingQA ? 'Q&A bearbeiten' : 'Neue Q&A erstellen') : 'Meine Q&A-Sammlungen'}</h3>
                                    {!showQACreator && qaCollections && qaCollections.length === 0 && (
                                        <button
                                            type="button"
                                            className="btn-primary size-s"
                                            onClick={handleCreateQA}
                                            disabled={qaLoading}
                                        >
                                            <HiPlus className="icon" />
                                            Q&A erstellen
                                        </button>
                                    )}
                                </div>
                                <div className="profile-card-content">
                                    {showQACreator ? (
                                        <>
                                            <div style={{ marginBottom: 'var(--spacing-medium)' }}>
                                                <button
                                                    type="button"
                                                    className="qa-back-button"
                                                    onClick={() => {
                                                        setShowQACreator(false);
                                                        setEditingQA(null);
                                                    }}
                                                >
                                                    ← Zurück zur Übersicht
                                                </button>
                                            </div>
                                            <QACreator
                                                onSave={handleSaveQA}
                                                availableDocuments={availableDocuments}
                                                editingCollection={editingQA}
                                                loading={isCreating || isUpdating}
                                                onCancel={() => {
                                                    setShowQACreator(false);
                                                    setEditingQA(null);
                                                }}
                                            />
                                        </>
                                    ) : (
                                        <>
                                            {qaLoading ? (
                                                <div className="knowledge-empty-state centered">
                                                    <p>Q&A-Sammlungen werden geladen...</p>
                                                </div>
                                            ) : qaError ? (
                                                <div className="qa-error-state">
                                                    <div className="qa-error-content">
                                                        <HiExclamationCircle className="qa-error-icon" />
                                                        <div className="qa-error-text">
                                                            <h4>Fehler beim Laden</h4>
                                                            <p>Deine Q&A-Sammlungen konnten nicht geladen werden.</p>
                                                            <p className="qa-error-details">{qaError.message || 'Bitte versuche es später erneut.'}</p>
                                                        </div>
                                                    </div>
                                                    <button 
                                                        onClick={() => refetch()}
                                                        className="qa-retry-button"
                                                        disabled={qaLoading}
                                                    >
                                                        <HiRefresh className="icon" />
                                                        Erneut versuchen
                                                    </button>
                                                </div>
                                            ) : qaCollections && qaCollections.length === 0 ? (
                                                <div className="knowledge-empty-state centered">
                                                    <HiChatAlt2 size={48} className="empty-state-icon" />
                                                    <p>Keine Q&A-Sammlungen vorhanden</p>
                                                    <p className="empty-state-description">
                                                        Erstelle intelligente Fragesysteme basierend auf deinen Dokumenten.
                                                    </p>
                                                    <div className="qa-empty-features">
                                                        <div className="qa-feature-item">
                                                            <div className="qa-feature-icon">📚</div>
                                                            <span>Dokumentbasierte Antworten</span>
                                                        </div>
                                                        <div className="qa-feature-item">
                                                            <div className="qa-feature-icon">🔍</div>
                                                            <span>Intelligente Suche</span>
                                                        </div>
                                                        <div className="qa-feature-item">
                                                            <div className="qa-feature-icon">💬</div>
                                                            <span>Natürliche Gespräche</span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="btn-primary size-s"
                                                        onClick={handleCreateQA}
                                                        style={{ marginTop: 'var(--spacing-medium)' }}
                                                    >
                                                        <HiPlus className="icon" />
                                                        Erste Q&A erstellen
                                                    </button>
                                                </div>
                                            ) : (
                                                <DocumentOverview
                                                    items={qaCollections}
                                                    loading={qaLoading}
                                                    onFetch={() => refetch()}
                                                    onDelete={handleDeleteQA}
                                                    onEdit={handleEditQA}
                                                    onView={handleViewQA}
                                                    onShare={handleShareQA}
                                                    itemType="qa"
                                                    searchFields={['name', 'description', 'custom_prompt']}
                                                    sortOptions={[
                                                        { value: 'created_at', label: 'Erstellungsdatum' },
                                                        { value: 'title', label: 'Name' },
                                                        { value: 'word_count', label: 'Anzahl Dokumente' },
                                                        { value: 'view_count', label: 'Aufrufe' }
                                                    ]}
                                                    emptyStateConfig={{
                                                        noDocuments: 'Keine Q&A-Sammlungen vorhanden.',
                                                        createMessage: 'Erstelle intelligente Fragesysteme basierend auf deinen Dokumenten.'
                                                    }}
                                                    searchPlaceholder="Q&A-Sammlungen durchsuchen..."
                                                    title="Meine Q&A-Sammlungen"
                                                    onSuccessMessage={onSuccessMessage}
                                                    onErrorMessage={onErrorMessage}
                                                    headerActions={
                                                        <button
                                                            type="button"
                                                            className="btn-primary size-s"
                                                            onClick={handleCreateQA}
                                                            disabled={qaLoading}
                                                        >
                                                            <HiPlus className="icon" />
                                                            Q&A erstellen
                                                        </button>
                                                    }
                                                />
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default DocumentsTab;