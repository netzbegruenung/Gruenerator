import React, { useState, useRef, useEffect, memo, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from "motion/react";
import { HiPlus, HiExclamationCircle, HiRefresh, HiShare, HiExternalLink, HiDownload, HiOutlineEye, HiOutlineTrash, HiX, HiCheck, HiClipboard, HiUpload, HiPhotograph, HiPencil, HiChatAlt2 } from 'react-icons/hi';

// Common components
import DocumentOverview from '../../../../components/common/DocumentOverview';
import DocumentUpload from '../../../../components/common/DocumentUpload';
import ShareToGroupModal from '../../../../components/common/ShareToGroupModal';
import AddCanvaTemplateModal from '../../../../components/common/AddCanvaTemplateModal';
import TemplateLinkModal from '../../../../components/common/TemplateLinkModal';
import ProfileCard from '../../../../components/common/ProfileCard';
import EmptyState from '../../../../components/common/EmptyState';
import TabNavigation from '../../../../components/common/TabNavigation';

// Canva components
import CanvaOverview from '../../../templates/canva/components/CanvaOverview';
import CanvaAssetsPanel from '../../../templates/canva/components/CanvaAssetsPanel';
import CanvaButton from '../../../templates/canva/components/CanvaButton';

// Feature-specific components
import QACreator from '../../../qa/components/QACreator';

// Stores and hooks
import { useDocumentsStore } from '../../../../stores/documentsStore';
import { useOptimizedAuth } from '../../../../hooks/useAuth';
import { useQACollections, useUserTexts, useUserTemplates } from '../../hooks/useProfileData';
import { useTabIndex } from '../../../../hooks/useTabIndex';
import { useTabNavigation } from '../../../../hooks/useTabNavigation';
import { useMessageHandling } from '../../../../hooks/useMessageHandling';

// Utils
import { handleError } from '../../../../components/utils/errorHandling';
import { announceToScreenReader } from '../../../../utils/focusManagement';
import * as canvaUtils from '../../../../components/utils/canvaUtils';
import * as canvaTemplateUtils from '../../../../components/utils/canvaTemplateUtils';
import * as documentAndTextUtils from '../../../../components/utils/documentAndTextUtils';

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

const ContentManagementTab = ({ 
    isActive, 
    onSuccessMessage, 
    onErrorMessage,
    initialTab = 'dokumente',
    canvaSubsection = 'overview',
    onTabChange
}) => {
    const navigate = useNavigate();
    
    // Message handling
    const { clearMessages, showSuccess, showError } = useMessageHandling(onSuccessMessage, onErrorMessage);
    
    // Available tabs - combine Dokumente & Texte into one tab
    const availableTabs = [
        { key: 'dokumente', label: 'Dokumente & Texte' },
        { key: 'canva', label: 'Canva' }
    ];
    
    // Normalize initialTab: map 'texte' -> 'dokumente'
    const normalizedInitialTab = initialTab === 'texte' ? 'dokumente' : initialTab;

    // Simple tab navigation like IntelligenceTab
    const { currentTab, handleTabClick, setCurrentTab } = useTabNavigation(
        normalizedInitialTab,
        availableTabs,
        (tabKey) => {
            clearMessages();
            onTabChange?.(tabKey);
        }
    );
    
    // Sync tab state with URL changes
    useEffect(() => {
        const nextTab = initialTab === 'texte' ? 'dokumente' : initialTab;
        if (currentTab !== nextTab) {
            setCurrentTab(nextTab);
        }
    }, [initialTab, currentTab, setCurrentTab]);
    
    // Tab index configuration
    const tabIndex = useTabIndex('PROFILE_CONTENT_MANAGEMENT');
    
    // Auth state
    const { user, isAuthenticated } = useOptimizedAuth();

    // =====================================================================
    // CANVA SUBSECTION HANDLING
    // =====================================================================
    
    // Simple internal state for Canva subsections
    const [currentCanvaSubsection, setCurrentCanvaSubsection] = useState(canvaSubsection);
    
    // Keep Canva subtab state local to avoid flicker from URL sync
    
    // Handle Canva subsection changes
    const handleCanvaSubsectionChange = useCallback((subsection) => {
        setCurrentCanvaSubsection(subsection);
    }, []);

    // =====================================================================
    // CONTENT (DOCUMENTS & TEXTS) SUBSECTION HANDLING
    // =====================================================================

    // Local state for Documents/Texts subsections
    const [currentContentSubsection, setCurrentContentSubsection] = useState(
        initialTab === 'texte' ? 'texte' : 'dokumente'
    );

    // Update local content subsection when initialTab changes externally
    useEffect(() => {
        if (initialTab === 'texte') {
            setCurrentContentSubsection('texte');
        } else if (initialTab === 'dokumente') {
            setCurrentContentSubsection('dokumente');
        }
    }, [initialTab]);

    const handleContentSubsectionChange = useCallback((subsection) => {
        setCurrentContentSubsection(subsection);
    }, []);

    // =====================================================================
    // CANVA-RELATED STATE AND FUNCTIONALITY
    // =====================================================================
    
    // Share modal state
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareContent, setShareContent] = useState(null);
    
    // Add template modal state
    const [showAddTemplateModal, setShowAddTemplateModal] = useState(false);
    
    // Template URL link modal state
    const [showTemplateLinkModal, setShowTemplateLinkModal] = useState(false);
    const [templateToLink, setTemplateToLink] = useState(null);
    
    // Canva connection state
    const [canvaConnected, setCanvaConnected] = useState(false);
    const [canvaLoading, setCanvaLoading] = useState(false);
    const [canvaUser, setCanvaUser] = useState(null);
    
    // Canva designs state
    const [canvaDesigns, setCanvaDesigns] = useState([]);
    const [fetchingCanvaDesigns, setFetchingCanvaDesigns] = useState(false);
    const [canvaDesignsError, setCanvaDesignsError] = useState(null);
    
    // Saved Canva designs tracking
    const [savedCanvaDesigns, setSavedCanvaDesigns] = useState(new Set());
    const [savingDesign, setSavingDesign] = useState(null);

    // Templates hook
    const { 
        query: templatesQuery,
        updateTemplateTitle,
        deleteTemplate,
        isUpdatingTitle: isUpdatingTemplateTitle,
        isDeleting: isDeletingTemplate
    } = useUserTemplates({ isActive });
    
    const { data: templates = [], isLoading: templatesLoading, error: templatesError } = templatesQuery;

    // =====================================================================
    // DOCUMENTS-RELATED STATE AND FUNCTIONALITY
    // =====================================================================
    
    // QA Creator state
    const [showQACreator, setShowQACreator] = useState(false);
    const [editingQA, setEditingQA] = useState(null);
    const [availableDocuments, setAvailableDocuments] = useState([]);
    
    // Document upload form state
    const [showUploadForm, setShowUploadForm] = useState(false);
    const showUploadFormRef = useRef(false);

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

    // Use centralized hooks
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
    
    const { 
        query: textsQuery,
        updateTextTitle,
        deleteText,
        isUpdatingTitle: isUpdatingTextTitle,
        isDeleting: isDeletingText
    } = useUserTexts({ isActive });

    const { data: qaCollections = [], isLoading: qaLoading, error: qaError } = qaQuery;
    const { data: texts = [], isLoading: textsLoading, error: textsError } = textsQuery;


    // =====================================================================
    // CANVA FUNCTIONALITY
    // =====================================================================

    // Canva connection handlers
    const checkCanvaConnectionStatus = useCallback(async () => {
        if (!isAuthenticated) return;
        
        try {
            setCanvaLoading(true);
            const result = await canvaUtils.checkCanvaConnectionStatus(isAuthenticated);
            setCanvaConnected(result.connected);
            setCanvaUser(result.canva_user);
        } catch (error) {
            console.error('[ContentManagementTab] Error checking Canva connection:', error);
            setCanvaConnected(false);
            setCanvaUser(null);
        } finally {
            setCanvaLoading(false);
        }
    }, [isAuthenticated]);

    const handleCanvaLogin = async () => {
        if (canvaLoading) return;
        
        try {
            setCanvaLoading(true);
            onErrorMessage('');
            await canvaUtils.initiateCanvaLogin(onErrorMessage);
        } catch (error) {
            setCanvaLoading(false);
        }
    };

    const fetchCanvaDesigns = useCallback(async () => {
        if (!canvaConnected || !isAuthenticated) return;
        
        try {
            setFetchingCanvaDesigns(true);
            setCanvaDesignsError(null);
            
            const designs = await canvaUtils.fetchCanvaDesigns(
                canvaConnected, 
                isAuthenticated, 
                0, 
                2, 
                (errorMsg) => {
                    setCanvaDesignsError(errorMsg);
                    if (errorMsg.includes('abgelaufen')) {
                        setCanvaConnected(false);
                    }
                    onErrorMessage?.(errorMsg);
                }
            );
            
            setCanvaDesigns(designs);
        } catch (error) {
            setCanvaDesigns([]);
        } finally {
            setFetchingCanvaDesigns(false);
        }
    }, [canvaConnected, isAuthenticated, onErrorMessage]);

    const handleSaveCanvaTemplate = useCallback(async (canvaDesign) => {
        try {
            setSavingDesign(canvaDesign.id);
            
            await canvaUtils.saveCanvaTemplate(
                canvaDesign,
                (successMsg) => {
                    setSavedCanvaDesigns(prev => new Set(prev).add(canvaDesign.canva_id));
                    templatesQuery.refetch();
                    onSuccessMessage(successMsg);
                },
                (errorMsg) => {
                    if (errorMsg.includes('bereits gespeichert')) {
                        setSavedCanvaDesigns(prev => new Set(prev).add(canvaDesign.canva_id));
                    }
                    onErrorMessage(errorMsg);
                }
            );
        } catch (error) {
            // Error handling is done in canvaUtils
        } finally {
            setSavingDesign(null);
        }
    }, [onSuccessMessage, onErrorMessage, templatesQuery]);

    // =====================================================================
    // DOCUMENTS FUNCTIONALITY
    // =====================================================================

    // QA functionality
    const handleCreateQA = async () => {
        setEditingQA(null);
        
        try {
            onErrorMessage('');
            const docs = await fetchAvailableDocuments();
            setAvailableDocuments(docs);
            setShowQACreator(true);
        } catch (error) {
            console.error('[ContentManagementTab] Fehler beim Laden der Dokumente:', error);
            handleError(error, onErrorMessage);
        }
    };

    const handleEditQA = async (qaId) => {
        const qa = getQACollection(qaId);
        setEditingQA(qa);
        
        try {
            onErrorMessage('');
            const docs = await fetchAvailableDocuments();
            setAvailableDocuments(docs);
            setShowQACreator(true);
        } catch (error) {
            console.error('[ContentManagementTab] Fehler beim Laden der Dokumente beim Bearbeiten:', error);
            handleError(error, onErrorMessage);
        }
    };

    const handleSaveQA = async (qaData) => {
        onErrorMessage('');
        onSuccessMessage('');
        
        try {
            if (qaData.id) {
                await updateQACollection(qaData.id, qaData);
                showSuccess('Q&A-Sammlung wurde erfolgreich aktualisiert.');
            } else {
                await createQACollection(qaData);
                showSuccess('Q&A-Sammlung wurde erfolgreich erstellt.');
            }
            setShowQACreator(false);
            setEditingQA(null);
        } catch (error) {
            console.error('[ContentManagementTab] Fehler beim Speichern der Q&A:', error);
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
            showSuccess('Q&A-Sammlung wurde erfolgreich gelöscht.');
        } catch (error) {
            console.error('[ContentManagementTab] Fehler beim Löschen der Q&A:', error);
            handleError(error, onErrorMessage);
        }
    };

    const handleViewQA = (qaId) => {
        navigate(`/qa/${qaId}`);
    };

    // Document handlers
    const handleDocumentDelete = async (documentId) => {
        try {
            await deleteDocument(documentId);
            showSuccess('Dokument wurde erfolgreich gelöscht.');
        } catch (error) {
            console.error('[ContentManagementTab] Error deleting document:', error);
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
            console.error('[ContentManagementTab] Error updating document title:', error);
            onErrorMessage('Fehler beim Aktualisieren des Dokumenttitels: ' + error.message);
            throw error;
        }
    };

    const handleDocumentRefresh = async (documentId) => {
        try {
            await refreshDocument(documentId);
        } catch (error) {
            console.error('[ContentManagementTab] Error refreshing document:', error);
            onErrorMessage('Fehler beim Aktualisieren des Dokumentstatus: ' + error.message);
            throw error;
        }
    };

    // Text handlers
    const handleTextTitleUpdate = async (textId, newTitle) => {
        try {
            await updateTextTitle(textId, newTitle);
            showSuccess('Texttitel erfolgreich aktualisiert.');
        } catch (error) {
            console.error('[ContentManagementTab] Error updating text title:', error);
            onErrorMessage('Fehler beim Aktualisieren des Texttitels: ' + error.message);
            throw error;
        }
    };

    const handleEditText = (text) => {
        window.open(`/editor/collab/${text.id}`, '_blank');
    };

    // =====================================================================
    // SHARED FUNCTIONALITY
    // =====================================================================

    // Share functionality
    const handleShareToGroup = useCallback(async (contentType, contentId, contentTitle) => {
        // Handle Canva-specific sharing logic
        if (contentType === 'database' && contentId.startsWith('canva_')) {
            const template = canvaDesigns.find(t => t.id === contentId);
            if (template && template.has_user_link) {
                try {
                    const result = await canvaUtils.createShareableTemplate(
                        template,
                        (result) => {
                            setShareContent({
                                type: contentType,
                                id: result.data.id,
                                title: contentTitle
                            });
                            setShowShareModal(true);
                            templatesQuery.refetch();
                        },
                        onErrorMessage
                    );
                    return;
                } catch (error) {
                    return;
                }
            }
        }
        
        // Standard sharing logic
        setShareContent({
            type: contentType,
            id: contentId,
            title: contentTitle
        });
        setShowShareModal(true);
    }, [canvaDesigns, templatesQuery, onErrorMessage]);

    const handleCloseShareModal = () => {
        setShowShareModal(false);
        setShareContent(null);
    };

    const handleShareSuccess = (message) => {
        onSuccessMessage(message);
        handleCloseShareModal();
    };

    const handleShareError = (error) => {
        onErrorMessage(error);
    };

    const createShareAction = (contentType) => 
        documentAndTextUtils.createShareAction(contentType, handleShareToGroup);

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
    // EFFECTS
    // =====================================================================

    // Handle errors
    useEffect(() => {
        if (qaError) {
            console.error('[ContentManagementTab] Fehler beim Laden der Q&A-Sammlungen:', qaError);
            handleError(qaError, onErrorMessage);
        }
        if (textsError) {
            console.error('[ContentManagementTab] Fehler beim Laden der Texte:', textsError);
            handleError(textsError, onErrorMessage);
        }
        if (documentsError) {
            console.error('[ContentManagementTab] Fehler beim Laden der Dokumente:', documentsError);
            onErrorMessage('Fehler beim Laden der Dokumente: ' + documentsError);
        }
        if (templatesError) {
            console.error('[ContentManagementTab] Fehler beim Laden der Templates:', templatesError);
            handleError(templatesError, onErrorMessage);
        }
    }, [qaError, textsError, documentsError, templatesError, onErrorMessage]);

    // Check Canva connection when tab becomes active
    useEffect(() => {
        if (isActive && currentTab === 'canva' && isAuthenticated) {
            checkCanvaConnectionStatus();
        }
    }, [isActive, currentTab, isAuthenticated, checkCanvaConnectionStatus]);

    // Fetch Canva designs when connected and on templates subsection
    useEffect(() => {
        if (isActive && currentTab === 'canva' && currentCanvaSubsection === 'vorlagen' && canvaConnected && isAuthenticated) {
            fetchCanvaDesigns();
        }
    }, [isActive, currentTab, currentCanvaSubsection, canvaConnected, isAuthenticated, fetchCanvaDesigns]);

    // Fetch documents when documents tab becomes active
    useEffect(() => {
        if (isActive && currentTab === 'dokumente') {
            fetchDocuments();
        }
    }, [isActive, currentTab, fetchDocuments]);

    // Reset to overview when user disconnects from Canva while on restricted subsections
    useEffect(() => {
        if (currentTab === 'canva' && !canvaConnected) {
            if (currentCanvaSubsection === 'vorlagen' || currentCanvaSubsection === 'assets') {
                // Switch back to overview subsection
                handleCanvaSubsectionChange('overview');
                announceToScreenReader('Zurück zur Übersicht - Canva-Verbindung erforderlich für diese Funktion');
            }
        }
    }, [canvaConnected, currentTab, currentCanvaSubsection, handleCanvaSubsectionChange]);

    // =====================================================================
    // RENDER METHODS
    // =====================================================================


    // Render Canva subsections when on Canva tab
    const renderCanvaSubsections = () => {
        if (currentTab !== 'canva') return null;
        
        const canvaSubsectionTabs = [
            { key: 'overview', label: 'Übersicht' },
            ...(canvaConnected ? [
                { key: 'vorlagen', label: 'Vorlagen' },
                { key: 'assets', label: 'Assets' }
            ] : [])
        ];

        return (
            <div
                className="groups-horizontal-navigation"
                role="tablist"
                aria-label="Canva Navigation"
                style={{ marginTop: 'var(--spacing-medium)' }}
            >
                <button
                    className={`groups-vertical-tab ${currentCanvaSubsection === 'overview' ? 'active' : ''}`}
                    onClick={() => handleCanvaSubsectionChange('overview')}
                    role="tab"
                    aria-selected={currentCanvaSubsection === 'overview'}
                    aria-controls="canva-overview-panel"
                    id="canva-overview-tab"
                >
                    Übersicht
                </button>
                {canvaConnected && (
                    <>
                        <button
                            className={`groups-vertical-tab ${currentCanvaSubsection === 'vorlagen' ? 'active' : ''}`}
                            onClick={() => handleCanvaSubsectionChange('vorlagen')}
                            role="tab"
                            aria-selected={currentCanvaSubsection === 'vorlagen'}
                            aria-controls="canva-vorlagen-panel"
                            id="canva-vorlagen-tab"
                        >
                            Vorlagen
                        </button>
                        <button
                            className={`groups-vertical-tab ${currentCanvaSubsection === 'assets' ? 'active' : ''}`}
                            onClick={() => handleCanvaSubsectionChange('assets')}
                            role="tab"
                            aria-selected={currentCanvaSubsection === 'assets'}
                            aria-controls="canva-assets-panel"
                            id="canva-assets-tab"
                        >
                            Assets
                        </button>
                    </>
                )}
            </div>
        );
    };

    // Render Documents & Texts subsections when on combined tab
    const renderContentSubsections = () => {
        if (currentTab !== 'dokumente') return null;

        return (
            <div
                className="groups-horizontal-navigation"
                role="tablist"
                aria-label="Inhalte Navigation"
                style={{ marginTop: 'var(--spacing-medium)' }}
            >
                <button
                    className={`groups-vertical-tab ${currentContentSubsection === 'dokumente' ? 'active' : ''}`}
                    onClick={() => handleContentSubsectionChange('dokumente')}
                    role="tab"
                    aria-selected={currentContentSubsection === 'dokumente'}
                    aria-controls="documents-panel"
                    id="documents-tab"
                >
                    Dokumente
                </button>
                <button
                    className={`groups-vertical-tab ${currentContentSubsection === 'texte' ? 'active' : ''}`}
                    onClick={() => handleContentSubsectionChange('texte')}
                    role="tab"
                    aria-selected={currentContentSubsection === 'texte'}
                    aria-controls="texts-panel"
                    id="texts-tab"
                >
                    Texte
                </button>
            </div>
        );
    };

    // =====================================================================
    // ADDITIONAL HANDLERS AND UTILITIES
    // =====================================================================

    // Template handlers from CanvaTab
    const handleEditTemplate = (template) => {
        if (template.source === 'canva' && template.canva_url) {
            window.open(template.canva_url, '_blank');
        } else if (template.canva_url || template.external_url) {
            window.open(template.canva_url || template.external_url, '_blank');
        } else {
            onErrorMessage('Keine Canva-URL für diese Vorlage verfügbar.');
        }
    };
    
    const handleDeleteTemplate = async (templateId) => {
        try {
            const validation = canvaTemplateUtils.validateTemplateDeletability({ id: templateId });
            if (!validation.canDelete) {
                onErrorMessage(validation.reason);
                return;
            }
            
            await deleteTemplate(templateId);
            onSuccessMessage('Canva Vorlage wurde erfolgreich gelöscht.');
        } catch (error) {
            console.error('[ContentManagementTab] Error deleting Canva template:', error);
            onErrorMessage('Fehler beim Löschen der Canva Vorlage: ' + error.message);
            throw error;
        }
    };

    const handleTemplateTitleUpdate = async (templateId, newTitle) => {
        try {
            const validation = canvaTemplateUtils.validateTemplateEditability({ id: templateId });
            if (!validation.canEdit) {
                onErrorMessage(validation.reason);
                return;
            }
            
            await updateTemplateTitle(templateId, newTitle);
        } catch (error) {
            console.error('[ContentManagementTab] Error updating Canva template title:', error);
            onErrorMessage('Fehler beim Aktualisieren des Canva Vorlagentitels: ' + error.message);
            throw error;
        }
    };

    // Template link modal handlers
    const handleOpenTemplateLinkModal = useCallback((template) => {
        setTemplateToLink(template);
        setShowTemplateLinkModal(true);
    }, []);

    const handleCreateTemplateLink = useCallback(async (canvaUrl) => {
        if (!templateToLink) return;

        try {
            
            const enhancedTemplate = canvaTemplateUtils.enhanceTemplateWithUserUrl(templateToLink, canvaUrl);

            setCanvaDesigns(prevDesigns => 
                prevDesigns.map(design => 
                    design.id === templateToLink.id ? enhancedTemplate : design
                )
            );

            if (templateToLink.canva_id) {
                setSavedCanvaDesigns(prev => new Set(prev).add(templateToLink.canva_id));
            }
            
            showSuccess(`Template Link für "${templateToLink.title}" wurde erfolgreich hinzugefügt.`);
            setShowTemplateLinkModal(false);
            setTemplateToLink(null);
        } catch (error) {
            console.error('[ContentManagementTab] Error adding template link:', error);
            onErrorMessage('Fehler beim Hinzufügen des Template Links: ' + error.message);
        }
    }, [templateToLink, setSavedCanvaDesigns, onSuccessMessage, onErrorMessage]);

    // Add template modal handlers
    const handleOpenAddTemplateModal = () => {
        setShowAddTemplateModal(true);
    };

    const handleCloseAddTemplateModal = () => {
        setShowAddTemplateModal(false);
    };

    const handleAddTemplateSuccess = (template, message) => {
        showSuccess(message || 'Canva Vorlage wurde erfolgreich hinzugefügt.');
        templatesQuery.refetch();
        handleCloseAddTemplateModal();
    };

    const handleAddTemplateError = (error) => {
        onErrorMessage(error || 'Fehler beim Hinzufügen der Canva Vorlage.');
    };

    // Helper functions
    const getAvailableLinks = useCallback((template) => {
        return canvaTemplateUtils.getAvailableLinks(template);
    }, []);

    const copyToClipboard = useCallback(async (url, linkType, onClose) => {
        await canvaUtils.copyToClipboard(url, linkType, onSuccessMessage, onErrorMessage, onClose);
    }, [onSuccessMessage, onErrorMessage]);

    // Custom meta renderer for templates
    const renderTemplateMetadata = (template) => {
        const config = canvaTemplateUtils.getTemplateMetadataConfig(template, savedCanvaDesigns);
        
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-small)', flexWrap: 'wrap' }}>
                {config.badges.map((badge, index) => (
                    <span 
                        key={`badge-${badge.type}-${index}`}
                        className={badge.className}
                        style={badge.style}
                        title={badge.title}
                    >
                        {badge.text}
                    </span>
                ))}
                {config.metadata.map((meta, index) => (
                    <span key={`meta-${meta.type}-${index}`} className={meta.className}>
                        {meta.text}
                    </span>
                ))}
            </div>
        );
    };

    // Action items for templates
    const getCanvaTemplateActionItems = useCallback((template) => {
        return canvaTemplateUtils.generateCanvaTemplateActionItems(template, {
            savedCanvaDesigns,
            savingDesign,
            onSaveTemplate: handleSaveCanvaTemplate,
            onEditTemplate: handleEditTemplate,
            onDeleteTemplate: handleDeleteTemplate,
            onShareToGroup: handleShareToGroup,
            onOpenTemplateLinkModal: handleOpenTemplateLinkModal,
            onCopyToClipboard: copyToClipboard,
            onErrorMessage
        });
    }, [savedCanvaDesigns, savingDesign, handleSaveCanvaTemplate, handleEditTemplate, handleDeleteTemplate, handleShareToGroup, handleOpenTemplateLinkModal, copyToClipboard, onErrorMessage]);

    // Bulk delete handlers  
    const handleBulkDeleteTemplates = async (templateIds) => {
        try {
            const result = await canvaTemplateUtils.handleBulkDeleteTemplates(templateIds, onErrorMessage);
            templatesQuery.refetch();
            if (result.message) {
                if (result.failed > 0) {
                    onErrorMessage(result.message);
                } else {
                    onSuccessMessage(result.message);
                }
            }
            return result;
        } catch (error) {
            console.error('[ContentManagementTab] Error in bulk delete templates:', error);
            onErrorMessage(error.message);
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
            console.error('[ContentManagementTab] Error in bulk delete documents:', error);
            onErrorMessage(error.message);
            throw error;
        }
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
            console.error('[ContentManagementTab] Error in bulk delete texts:', error);
            onErrorMessage(error.message);
            throw error;
        }
    };

    const handleBulkDeleteQA = async (qaIds) => {
        try {
            const result = await documentAndTextUtils.bulkDeleteQA(qaIds);
            qaQuery.refetch();
            if (result.message) {
                if (result.hasErrors) {
                    onErrorMessage(result.message);
                } else {
                    onSuccessMessage(result.message);
                }
            }
            return result;
        } catch (error) {
            console.error('[ContentManagementTab] Error in bulk delete QA:', error);
            onErrorMessage(error.message);
            throw error;
        }
    };

    // Document types and constants from utilities
    const documentTypes = documentAndTextUtils.DOCUMENT_TYPES;
    const textDocumentTypes = documentAndTextUtils.TEXT_DOCUMENT_TYPES;

    const canvaTemplateTypes = canvaUtils.CANVA_TEMPLATE_TYPES;
    const canvaAssetTypes = canvaUtils.CANVA_ASSET_TYPES;

    // =====================================================================
    // CONTENT RENDERING METHODS
    // =====================================================================

    // Render Canva Overview content
    const renderCanvaOverviewContent = () => (
        <div
            role="tabpanel"
            id="canva-overview-panel"
            aria-labelledby="canva-overview-tab"
            tabIndex={-1}
        >
            <CanvaOverview
                canvaConnected={canvaConnected}
                canvaUser={canvaUser}
                canvaLoading={canvaLoading}
                isAuthenticated={isAuthenticated}
                onCanvaLogin={handleCanvaLogin}
                onSuccessMessage={onSuccessMessage}
                onErrorMessage={onErrorMessage}
                onNavigateToSubtab={(subsection) => handleCanvaSubsectionChange(subsection)}
            />
        </div>
    );

    // Render Canva Login Required message for unauthenticated users
    const renderCanvaLoginRequired = (featureName) => (
        <ProfileCard title={featureName}>
            <div className="login-required-card">
                <div className="login-required-header">
                    <div className="login-required-icon">🔒</div>
                    <h4>Anmeldung erforderlich</h4>
                </div>
                <p className="login-required-message">
                    Diese Canva-Funktionen stehen nur angemeldeten Nutzer*innen zur Verfügung. 
                    Bitte melde dich an, um deine Canva-Integration zu verwalten.
                </p>
                <div className="login-required-actions">
                    <button 
                        onClick={() => {
                            // Save current location for redirect after login
                            const currentPath = window.location.pathname + window.location.search;
                            sessionStorage.setItem('redirectAfterLogin', currentPath);
                            navigate('/login');
                        }}
                        className="btn-primary"
                    >
                        <span className="login-icon">👤</span> Anmelden
                    </button>
                    <button 
                        onClick={() => handleCanvaSubsectionChange('overview')}
                        className="btn-secondary"
                        style={{ marginLeft: 'var(--spacing-small)' }}
                    >
                        Zur Übersicht
                    </button>
                </div>
            </div>
        </ProfileCard>
    );

    // Render Canva Vorlagen content
    const renderCanvaVorlagenContent = () => {
        if (!isAuthenticated) {
            return (
                <div
                    role="tabpanel"
                    id="canva-vorlagen-panel"
                    aria-labelledby="canva-vorlagen-tab"
                    tabIndex={-1}
                >
                    {renderCanvaLoginRequired("Canva Vorlagen")}
                </div>
            );
        }

        return (
            <div
                role="tabpanel"
                id="canva-vorlagen-panel"
                aria-labelledby="canva-vorlagen-tab"
                tabIndex={-1}
            >
                <DocumentOverview
                documents={[...templates, ...canvaDesigns]}
                loading={templatesLoading || fetchingCanvaDesigns}
                onFetch={() => {
                    templatesQuery.refetch();
                    if (canvaConnected) {
                        fetchCanvaDesigns();
                    }
                }}
                onDelete={handleDeleteTemplate}
                onBulkDelete={handleBulkDeleteTemplates}
                onUpdateTitle={handleTemplateTitleUpdate}
                onEdit={handleEditTemplate}
                onShare={createShareAction('database')}
                actionItems={getCanvaTemplateActionItems}
                documentTypes={canvaTemplateTypes}
                metaRenderer={renderTemplateMetadata}
                emptyStateConfig={{
                    noDocuments: canvaConnected 
                        ? (canvaDesignsError 
                            ? `Fehler beim Laden der Canva Designs: ${canvaDesignsError}`
                            : 'Du hast noch keine Canva Vorlagen oder Designs.')
                        : 'Verbinde dein Canva-Konto, um Vorlagen zu verwalten.',
                    createMessage: canvaConnected 
                        ? 'Erstelle deine erste Canva Vorlage oder importiere eine aus der Galerie.'
                        : 'Mit Canva verbunden kannst du deine Designs direkt im Grünerator verwalten.'
                }}
                searchPlaceholder="Canva Vorlagen und Designs durchsuchen..."
                title={`Meine Canva Vorlagen ${canvaConnected ? `(${templates.length} lokal, ${canvaDesigns.length} von Canva)` : ''}`}
                onSuccessMessage={onSuccessMessage}
                onErrorMessage={onErrorMessage}
                headerActions={
                    <div style={{ display: 'flex', gap: 'var(--spacing-small)' }}>
                        {canvaConnected ? (
                            <>
                                <button
                                    type="button"
                                    className="btn-secondary size-s"
                                    onClick={async () => {
                                        // Refresh both local designs and React Query templates
                                        await Promise.all([
                                            fetchCanvaDesigns(),
                                            templatesQuery.refetch()
                                        ]);
                                    }}
                                    aria-label="Mit Canva synchronisieren"
                                    disabled={fetchingCanvaDesigns || canvaLoading}
                                    title="Aktuelle Designs von Canva laden"
                                >
                                    <HiRefresh className="icon" />
                                    Sync mit Canva
                                </button>
                                <button
                                    type="button"
                                    className="btn-primary size-s"
                                    onClick={handleOpenAddTemplateModal}
                                    tabIndex={tabIndex.addContentButton}
                                    aria-label="Neue Canva Vorlage hinzufügen"
                                    disabled={canvaLoading}
                                >
                                    <HiPlus className="icon" />
                                    Canva Vorlage hinzufügen
                                </button>
                            </>
                        ) : (
                            <CanvaButton
                                onClick={handleCanvaLogin}
                                loading={canvaLoading}
                                size="small"
                                tabIndex={tabIndex.addContentButton}
                                ariaLabel="Mit Canva verbinden"
                            >
                                Mit Canva verbinden
                            </CanvaButton>
                        )}
                    </div>
                }
                />
            </div>
        );
    };

    // Render Canva Assets content
    const renderCanvaAssetsContent = () => {
        if (!isAuthenticated) {
            return (
                <div
                    role="tabpanel"
                    id="canva-assets-panel"
                    aria-labelledby="canva-assets-tab"
                    tabIndex={-1}
                >
                    {renderCanvaLoginRequired("Assets")}
                </div>
            );
        }

        return (
            <div
                role="tabpanel"
                id="canva-assets-panel"
                aria-labelledby="canva-assets-tab"
                tabIndex={-1}
            >
                <CanvaAssetsPanel
                    canvaConnected={canvaConnected}
                    canvaLoading={canvaLoading}
                    isAuthenticated={isAuthenticated}
                    onCanvaLogin={handleCanvaLogin}
                    onSuccessMessage={onSuccessMessage}
                    onErrorMessage={onErrorMessage}
                    onNavigateToOverview={() => handleCanvaSubsectionChange('overview')}
                />
            </div>
        );
    };

    // Render Documents content
    const renderDocumentsContent = () => (
        <div
            role="tabpanel"
            id="documents-panel"
            aria-labelledby="documents-tab"
            tabIndex={-1}
        >
            <DocumentOverview
                documents={documents}
                loading={documentsLoading}
                onFetch={fetchDocuments}
                onDelete={handleDocumentDelete}
                onBulkDelete={handleBulkDeleteDocuments}
                onUpdateTitle={handleDocumentTitleUpdate}
                onEdit={handleDocumentEdit}
                onRefreshDocument={handleDocumentRefresh}
                onShare={createShareAction('documents')}
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
                        onClick={() => setShowUploadForm(true)}
                        tabIndex={tabIndex.addContentButton}
                        aria-label="Neuen Inhalt hinzufügen"
                    >
                        <HiPlus className="icon" />
                        Inhalt hinzufügen
                    </button>
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
        </div>
    );

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
                        console.error('[ContentManagementTab] Error refreshing texts:', error);
                        onErrorMessage('Fehler beim Aktualisieren der Texte: ' + error.message);
                    }
                }}
                onDelete={(textId) => deleteText(textId)}
                onBulkDelete={handleBulkDeleteTexts}
                onUpdateTitle={handleTextTitleUpdate}
                onEdit={handleEditText}
                onShare={createShareAction('user_documents')}
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

    // Render QA content
    const renderQAContent = () => (
        <div
            role="tabpanel"
            id="qa-panel"
            aria-labelledby="qa-tab"
            tabIndex={-1}
        >
            <ProfileCard 
                title={showQACreator ? (editingQA ? 'Q&A bearbeiten' : 'Neue Q&A erstellen') : 'Meine Q&A-Sammlungen'}
                headerActions={!showQACreator && qaCollections && qaCollections.length === 0 ? (
                    <button
                        type="button"
                        className="btn-primary size-s"
                        onClick={handleCreateQA}
                        disabled={qaLoading}
                        tabIndex={tabIndex.addContentButton}
                        aria-label="Neue Q&A-Sammlung erstellen"
                    >
                        <HiPlus className="icon" />
                        Q&A erstellen
                    </button>
                ) : null}
            >
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
                                        onClick={() => qaQuery.refetch()}
                                        className="qa-retry-button"
                                        disabled={qaLoading}
                                    >
                                        <HiRefresh className="icon" />
                                        Erneut versuchen
                                    </button>
                                </div>
                            ) : qaCollections && qaCollections.length === 0 ? (
                                <EmptyState
                                    icon={HiChatAlt2}
                                    iconSize={48}
                                    title="Keine Q&A-Sammlungen vorhanden"
                                    description="Erstelle intelligente Fragesysteme basierend auf deinen Dokumenten."
                                >
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
                                </EmptyState>
                            ) : (
                                <DocumentOverview
                                    items={qaCollections}
                                    loading={qaLoading}
                                    onFetch={() => qaQuery.refetch()}
                                    onDelete={handleDeleteQA}
                                    onBulkDelete={handleBulkDeleteQA}
                                    onEdit={handleEditQA}
                                    onView={handleViewQA}
                                    onShare={createShareAction('qa_collections')}
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
            </ProfileCard>
        </div>
    );

    // Render main content based on current tabs
    const renderMainContent = () => {
        if (currentTab === 'canva') {
            if (currentCanvaSubsection === 'overview') {
                return renderCanvaOverviewContent();
            } else if (currentCanvaSubsection === 'vorlagen') {
                return renderCanvaVorlagenContent();
            } else if (currentCanvaSubsection === 'assets') {
                return renderCanvaAssetsContent();
            }
        } else if (currentTab === 'dokumente') {
            return currentContentSubsection === 'texte' ? renderTextsContent() : renderDocumentsContent();
        }
        
        return <div>Content not found</div>;
    };

    return (
        <motion.div 
            className="profile-content profile-management-layout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            <div className="profile-navigation-panel">
                <TabNavigation
                    tabs={availableTabs}
                    currentTab={currentTab}
                    onTabClick={handleTabClick}
                    orientation="vertical"
                />
            </div>
            <div className="profile-content-panel profile-form-section">
                <div className="profile-content-card">
                    <div className="auth-form">
                        {renderCanvaSubsections()}
                        {renderContentSubsections()}
                        {renderMainContent()}
                    </div>
                </div>
            </div>

            {/* Share Modal */}
            <ShareToGroupModal
                isOpen={showShareModal}
                onClose={handleCloseShareModal}
                contentType={shareContent?.type}
                contentId={shareContent?.id}
                contentTitle={shareContent?.title}
                onSuccess={handleShareSuccess}
                onError={handleShareError}
            />

            {/* Add Template Modal */}
            <AddCanvaTemplateModal
                isOpen={showAddTemplateModal}
                onClose={handleCloseAddTemplateModal}
                onSuccess={handleAddTemplateSuccess}
                onError={handleAddTemplateError}
            />

            {/* Template Link Modal */}
            {showTemplateLinkModal && templateToLink && (
                <TemplateLinkModal
                    template={templateToLink}
                    onClose={() => {
                        setShowTemplateLinkModal(false);
                        setTemplateToLink(null);
                    }}
                    onSubmit={handleCreateTemplateLink}
                />
            )}
        </motion.div>
    );
};


export default ContentManagementTab;