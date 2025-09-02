import React, { useState, useRef, useEffect, memo, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from "motion/react";
import { HiPlus, HiExclamationCircle, HiRefresh, HiShare, HiExternalLink, HiDownload, HiOutlineEye, HiOutlineTrash, HiX, HiCheck, HiClipboard, HiUpload, HiPhotograph, HiPencil, HiChatAlt2 } from 'react-icons/hi';

// Common components
import DocumentOverview from '../../../../components/common/DocumentOverview';
import DocumentUpload from '../../../../components/common/DocumentUpload';
import ShareToGroupModal from '../../../../components/common/ShareToGroupModal';
// import AddCanvaTemplateModal from '../../../../components/common/AddCanvaTemplateModal';
// import TemplateLinkModal from '../../../../components/common/TemplateLinkModal';
import ProfileCard from '../../../../components/common/ProfileCard';
import EmptyState from '../../../../components/common/EmptyState';
import TabNavigation from '../../../../components/common/TabNavigation';

// Document management components
import WolkeFolderBrowser from '../../../documents/components/WolkeFolderBrowser';
import WolkeSyncManager from '../../../documents/components/WolkeSyncManager';

// Canva components - OVERVIEW, TEMPLATES AND ASSETS
import CanvaOverview from '../../../templates/canva/components/CanvaOverview';
import CanvaButton from '../../../templates/canva/components/CanvaButton';
import CanvaAssetsPanel from '../../../templates/canva/components/CanvaAssetsPanel';

// Wolke components
import WolkeShareLinkManager from '../../../wolke/components/WolkeShareLinkManager';

// Feature-specific components

// Stores and hooks
import { useDocumentsStore } from '../../../../stores/documentsStore';
// CANVA INTEGRATION - RE-ENABLED
import { useCanvaStore, useCanvaConnection, useCanvaDesigns, useCanvaMessages, useSavingDesignState } from '../../../../stores/canvaStore';
import { useOptimizedAuth } from '../../../../hooks/useAuth';
import { useUserTexts, useUserTemplates } from '../../hooks/useProfileData';
import { useTabIndex } from '../../../../hooks/useTabIndex';
import { useTabNavigation } from '../../../../hooks/useTabNavigation';
import { useMessageHandling } from '../../../../hooks/useMessageHandling';

// Document management hooks
import { useDocumentMode } from '../../../documents/hooks/useDocumentMode';

// Utils
import { handleError } from '../../../../components/utils/errorHandling';
import { announceToScreenReader } from '../../../../utils/focusManagement';
// CANVA MINIMAL FOR DEBUGGING
import * as canvaUtils from '../../../../components/utils/canvaUtils';
/* import * as canvaTemplateUtils from '../../../../components/utils/canvaTemplateUtils'; // STILL DISABLED */
import * as documentAndTextUtils from '../../../../components/utils/documentAndTextUtils';
import * as nextcloudUtils from '../../../../components/utils/nextcloudUtils';

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
    
    // Available tabs - combine Dokumente & Texte into one tab (CANVA MINIMAL FOR DEBUGGING)
    const availableTabs = [
        { key: 'dokumente', label: 'Dokumente & Texte' },
        { key: 'canva', label: 'Canva' }, // RE-ENABLED FOR TESTING
        { key: 'wolke', label: 'Wolke' }
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
    
    // Sync tab state with URL changes - prevent circular dependency
    useEffect(() => {
        const nextTab = initialTab === 'texte' ? 'dokumente' : initialTab;
        // Use functional update to get current state without dependency
        setCurrentTab(prevTab => {
            if (prevTab !== nextTab) {
                return nextTab;
            }
            return prevTab;
        });
    }, [initialTab]); // Remove currentTab from dependencies to break the loop
    
    // Tab index configuration
    const tabIndex = useTabIndex('PROFILE_CONTENT_MANAGEMENT');
    
    // Auth state
    const { user, isAuthenticated } = useOptimizedAuth();

    // Document mode management
    const { 
        currentMode, 
        isWolkeMode, 
        isManualMode, 
        changeMode, 
        loading: modeLoading 
    } = useDocumentMode();

    // Check if Wolke is configured by checking if there are any sync statuses
    const [hasWolkeFolders, setHasWolkeFolders] = useState(false);

    // =====================================================================
    // CANVA SUBSECTION HANDLING - MINIMAL FOR DEBUGGING
    // =====================================================================
    
    // Simple internal state for Canva subsections - OVERVIEW ONLY
    const [currentCanvaSubsection, setCurrentCanvaSubsection] = useState('overview'); // Fixed to overview only
    
    // Handle Canva subsection changes - OVERVIEW, TEMPLATES AND ASSETS
    const handleCanvaSubsectionChange = useCallback((subsection) => {
        // Allow overview, vorlagen and assets
        if (subsection === 'overview' || subsection === 'vorlagen' || subsection === 'assets') {
            setCurrentCanvaSubsection(subsection);
        }
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

    // Simple check for Wolke configuration without full hook complexity
    useEffect(() => {
        if (isActive && currentTab === 'dokumente' && currentContentSubsection === 'dokumente') {
            // Use a simple API call to check if there are configured folders
            // This is a lightweight check compared to the full useWolkeSync hook
            fetch('/api/documents/wolke/sync-status', {
                method: 'GET',
                credentials: 'include'
            })
            .then(response => response.json())
            .then(data => {
                if (data.success && Array.isArray(data.syncStatuses)) {
                    setHasWolkeFolders(data.syncStatuses.length > 0);
                } else {
                    setHasWolkeFolders(false);
                }
            })
            .catch(() => {
                setHasWolkeFolders(false);
            });

            // Also load share links for document mode display
            if (isAuthenticated) {
                fetchWolkeShareLinks();
            }
        }
    }, [isActive, currentTab, currentContentSubsection, isAuthenticated]);

    // =====================================================================
    // CANVA STORE INTEGRATION - MINIMAL FOR DEBUGGING
    // =====================================================================
    
    // Canva store hooks (memoized selectors for performance) - MINIMAL ONLY
    const { connected: canvaConnected, user: canvaUser, loading: canvaLoading } = useCanvaConnection();
    const { designs: canvaDesigns, loading: fetchingCanvaDesigns, error: canvaDesignsError } = useCanvaDesigns();
    
    // Import store getState method for direct calls (no subscription)
    const getCanvaState = useCanvaStore.getState;
    
    // Modal state (keep as local state since it's UI-only) - RE-ENABLED
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareContent, setShareContent] = useState(null);
    const [showAddTemplateModal, setShowAddTemplateModal] = useState(false);
    // Keep template link modal disabled for now
    // const [showTemplateLinkModal, setShowTemplateLinkModal] = useState(false);
    // const [templateToLink, setTemplateToLink] = useState(null);
    
    // Store-based helpers (using stable selectors) - RE-ENABLED
    const { savedDesigns: savedCanvaDesigns, savingDesign } = useSavingDesignState();

    // =====================================================================
    // WOLKE-RELATED STATE AND FUNCTIONALITY
    // =====================================================================
    
    // Wolke share links state
    const [wolkeShareLinks, setWolkeShareLinks] = useState([]);
    const [wolkeLoading, setWolkeLoading] = useState(false);
    const [wolkeError, setWolkeError] = useState(null);
    
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
    
    // Document-related state
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
        searchDocuments: searchDocumentsApi,
        isSearching: isDocumentsSearching,
        searchResults: documentSearchResults,
        clearSearchResults,
    } = useDocumentsStore();

    // Use centralized hooks - Q&A moved to CustomGeneratorsTab
    const { 
        query: textsQuery,
        updateTextTitle,
        deleteText,
        isUpdatingTitle: isUpdatingTextTitle,
        isDeleting: isDeletingText
    } = useUserTexts({ isActive });
    const { data: texts = [], isLoading: textsLoading, error: textsError } = textsQuery;


    // =====================================================================
    // CANVA FUNCTIONALITY - DISABLED FOR DEBUGGING
    // =====================================================================

    // =====================================================================
    // CANVA FUNCTIONALITY - RE-ENABLED
    // =====================================================================

    // Create stable refs for functions to prevent useEffect loops
    const checkCanvaConnectionStatusRef = useRef();
    const fetchCanvaDesignsRef = useRef();

    // Canva store-based handlers (using refs for stability in effects)
    checkCanvaConnectionStatusRef.current = async () => {
        if (!isAuthenticated) return;
        
        try {
            return await getCanvaState().checkConnectionStatus();
        } catch (error) {
            console.error('[ContentManagementTab] Error checking Canva connection:', error);
            onErrorMessage?.(error.message);
        }
    };

    fetchCanvaDesignsRef.current = async () => {
        if (!canvaConnected || !isAuthenticated) return;
        
        try {
            await getCanvaState().fetchDesigns();
        } catch (error) {
            console.error('[ContentManagementTab] Error fetching Canva designs:', error);
            if (error.message.includes('abgelaufen')) {
                onErrorMessage?.('Canva-Verbindung abgelaufen. Bitte verbinde dich erneut.');
            } else {
                onErrorMessage?.(error.message);
            }
        }
    };

    // Handle Canva login - CRITICAL FOR BUTTON FUNCTIONALITY
    const handleCanvaLogin = useCallback(async () => {
        if (canvaLoading) return;
        
        try {
            clearMessages();
            await getCanvaState().initiateLogin();
        } catch (error) {
            console.error('[ContentManagementTab] Error during Canva login:', error);
            onErrorMessage('Fehler beim Verbinden mit Canva. Bitte versuche es erneut.');
        }
    }, [canvaLoading, clearMessages]);

    const handleSaveCanvaTemplate = useCallback(async (canvaDesign) => {
        try {
            await getCanvaState().saveTemplate(canvaDesign);
            
            // Refresh templates query after successful save
            templatesQuery.refetch();
            
            // Success message is handled by store internally
            
        } catch (error) {
            console.error('[ContentManagementTab] Error saving Canva template:', error);
            onErrorMessage(error.message);
        }
    }, [onErrorMessage, templatesQuery]);

    // =====================================================================
    // WOLKE FUNCTIONALITY
    // =====================================================================

    // Wolke share links handlers
    const fetchWolkeShareLinks = useCallback(async (isRefresh = false) => {
        if (!isAuthenticated) return;
        
        try {
            // Only show loading spinner on initial load, not on refresh to prevent flashing
            if (!isRefresh) {
                setWolkeLoading(true);
            }
            setWolkeError(null);
            
            const shareLinks = await nextcloudUtils.getNextcloudShareLinks();
            console.log('[ContentManagementTab] Setting share links to state:', shareLinks);
            setWolkeShareLinks(Array.isArray(shareLinks) ? shareLinks : []);
        } catch (error) {
            console.error('[ContentManagementTab] Error fetching Wolke share links:', error);
            // Set empty array so the tab continues to function
            setWolkeShareLinks([]);
            setWolkeError('Wolke-Funktionen sind zurzeit nicht verfügbar.');
            // Only show error in console, don't disrupt the UI
            console.warn('[ContentManagementTab] Fehler beim Laden der Wolke-Verbindungen:', error.message);
        } finally {
            if (!isRefresh) {
                setWolkeLoading(false);
            }
        }
    }, [isAuthenticated]);

    const handleAddWolkeShareLink = async (shareLink, label = '') => {
        try {
            const result = await nextcloudUtils.saveNextcloudShareLink(shareLink, label);
            await fetchWolkeShareLinks(); // Refresh the list
            return result;
        } catch (error) {
            console.error('[ContentManagementTab] Error adding Wolke share link:', error);
            // Show user-friendly error message
            const errorMessage = error.message || 'Fehler beim Hinzufügen der Wolke-Verbindung';
            throw new Error(errorMessage);
        }
    };

    const handleDeleteWolkeShareLink = async (shareLinkId) => {
        try {
            await nextcloudUtils.deleteNextcloudShareLink(shareLinkId);
            await fetchWolkeShareLinks(); // Refresh the list
        } catch (error) {
            console.error('[ContentManagementTab] Error deleting Wolke share link:', error);
            // Show user-friendly error message
            const errorMessage = error.message || 'Fehler beim Löschen der Wolke-Verbindung';
            throw new Error(errorMessage);
        }
    };

    const handleTestWolkeConnection = async (shareLink) => {
        try {
            const result = await nextcloudUtils.testNextcloudConnection(shareLink);
            return result;
        } catch (error) {
            console.error('[ContentManagementTab] Error testing Wolke connection:', error);
            // Show user-friendly error message
            const errorMessage = error.message || 'Fehler beim Testen der Wolke-Verbindung';
            throw new Error(errorMessage);
        }
    };

    const handleTestWolkeUpload = async (shareLinkId, content, filename = 'test-gruenerator.txt') => {
        try {
            const result = await nextcloudUtils.uploadToNextcloudShare(shareLinkId, content, filename);
            return result;
        } catch (error) {
            console.error('[ContentManagementTab] Error uploading test file to Wolke:', error);
            // Show user-friendly error message
            const errorMessage = error.message || 'Fehler beim Upload der Test-Datei zu Wolke';
            throw new Error(errorMessage);
        }
    };

    // =====================================================================
    // DOCUMENTS FUNCTIONALITY
    // =====================================================================

    // Q&A functionality moved to CustomGeneratorsTab

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
        // Handle Canva-specific sharing logic - RE-ENABLED
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
                    console.error('[ContentManagementTab] Error creating shareable template:', error);
                    // Fall through to standard sharing logic
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
    }, [templatesQuery, onErrorMessage, canvaDesigns]);

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

    const createShareAction = useCallback((contentType) => 
        documentAndTextUtils.createShareAction(contentType, handleShareToGroup), [handleShareToGroup]);

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
        if (wolkeError) {
            console.error('[ContentManagementTab] Fehler beim Laden der Wolke-Verbindungen:', wolkeError);
            onErrorMessage('Fehler beim Laden der Wolke-Verbindungen: ' + wolkeError);
        }
    }, [textsError, documentsError, templatesError, wolkeError, onErrorMessage]);

    // Removed problematic message handling effect - messages are now handled directly in action callbacks

    // Consolidated Canva initialization and data loading - RE-ENABLED
    useEffect(() => {
        if (!isActive || !isAuthenticated) return;

        // Initialize store if not already initialized
        const storeState = getCanvaState();
        if (!storeState.initialized) {
            storeState.initialize();
            return;
        }

        // Handle tab-specific actions
        if (currentTab === 'canva') {
            // Check connection when on canva tab
            if (!canvaConnected && !canvaLoading) {
                checkCanvaConnectionStatusRef.current();
            }
            
            // Fetch designs when on templates subsection and connected
            if (currentCanvaSubsection === 'vorlagen' && canvaConnected && !fetchingCanvaDesigns) {
                fetchCanvaDesignsRef.current();
            }
        }
    }, [isActive, isAuthenticated, currentTab, currentCanvaSubsection, canvaConnected, canvaLoading, fetchingCanvaDesigns]);

    // Fetch documents when documents tab becomes active - use ref to prevent loops
    const fetchDocumentsRef = useRef();
    fetchDocumentsRef.current = fetchDocuments;
    
    useEffect(() => {
        if (isActive && currentTab === 'dokumente') {
            fetchDocumentsRef.current();
        }
    }, [isActive, currentTab]); // Stable dependencies only

    // Remote search uses DocumentOverview's built-in controls.


    // Reset to overview when user disconnects from Canva while on restricted subsections - RE-ENABLED
    useEffect(() => {
        if (currentTab === 'canva' && !canvaConnected) {
            if (currentCanvaSubsection === 'vorlagen' || currentCanvaSubsection === 'assets') {
                // Switch back to overview subsection
                handleCanvaSubsectionChange('overview');
                announceToScreenReader('Zurück zur Übersicht - Canva-Verbindung erforderlich für diese Funktion');
            }
        }
    }, [canvaConnected, currentTab, currentCanvaSubsection, handleCanvaSubsectionChange]);

    // Fetch Wolke share links when Wolke tab becomes active - use ref to prevent loops
    const fetchWolkeShareLinksRef = useRef();
    fetchWolkeShareLinksRef.current = fetchWolkeShareLinks;
    
    useEffect(() => {
        if (isActive && currentTab === 'wolke' && isAuthenticated) {
            fetchWolkeShareLinksRef.current();
        }
    }, [isActive, currentTab, isAuthenticated]);

    // Initial load of share links when component becomes active (for all tabs that might need it)
    useEffect(() => {
        if (isActive && isAuthenticated && wolkeShareLinks.length === 0 && !wolkeLoading) {
            fetchWolkeShareLinksRef.current();
        }
    }, [isActive, isAuthenticated, wolkeShareLinks.length, wolkeLoading]);

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

        const logoConfig = canvaUtils.getCanvaLogoConfig('medium', 'subtab');

        return (
            <div
                className="groups-horizontal-navigation"
                role="tablist"
                aria-label="Canva Navigation"
                style={{ 
                    marginTop: 'var(--spacing-medium)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-medium)'
                }}
            >
                <div className="canva-subtab-logo" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <img
                        src={logoConfig.src}
                        alt={logoConfig.alt}
                        className={logoConfig.className}
                        style={{
                            height: logoConfig.height,
                            width: logoConfig.width,
                            minHeight: logoConfig.minHeight
                        }}
                    />
                    <div className="powered-by-canva" style={{ 
                        fontSize: '0.75rem', 
                        color: 'var(--font-color-muted, #666)', 
                        marginTop: '2px',
                        textAlign: 'center'
                    }}>
                        {logoConfig.poweredByMessage}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0' }}>
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
        /* CANVA DISABLED
        try {
            // const validation = canvaTemplateUtils.validateTemplateDeletability({ id: templateId });
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
        */ // END CANVA DISABLED
    };

    const handleTemplateTitleUpdate = async (templateId, newTitle) => {
        try {
            // const validation = canvaTemplateUtils.validateTemplateEditability({ id: templateId });
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
    // const handleOpenTemplateLinkModal = useCallback((template) => {
    //     setTemplateToLink(template);
    //     setShowTemplateLinkModal(true);
    // }, []);

    // const handleCreateTemplateLink = useCallback(async (canvaUrl) => {
    //     if (!templateToLink) return;

    //     try {
            
    //         const enhancedTemplate = canvaTemplateUtils.enhanceTemplateWithUserUrl(templateToLink, canvaUrl);

    //         setCanvaDesigns(prevDesigns => 
    //             prevDesigns.map(design => 
    //                 design.id === templateToLink.id ? enhancedTemplate : design
    //             )
    //         );

    //         if (templateToLink.canva_id) {
    //             // Mark as saved in the canva store (direct mutation is safe here)
    //             savedCanvaDesigns.add(templateToLink.canva_id);
    //         }
            
    //         showSuccess(`Template Link für "${templateToLink.title}" wurde erfolgreich hinzugefügt.`);
    //         setShowTemplateLinkModal(false);
    //         setTemplateToLink(null);
    //     } catch (error) {
    //         console.error('[ContentManagementTab] Error adding template link:', error);
    //         onErrorMessage('Fehler beim Hinzufügen des Template Links: ' + error.message);
    //     }
    // }, [templateToLink, savedCanvaDesigns, onSuccessMessage, onErrorMessage]);

    // Add template modal handlers - RE-ENABLED
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
        // return canvaTemplateUtils.getAvailableLinks(template);
        return [];
    }, []);

    const copyToClipboard = useCallback(async (url, linkType, onClose) => {
        await canvaUtils.copyToClipboard(url, linkType, onSuccessMessage, onErrorMessage, onClose);
    }, [onSuccessMessage, onErrorMessage]);

    // Custom meta renderer for templates - RE-ENABLED
    const renderTemplateMetadata = (template) => {
        const config = canvaUtils.getTemplateMetadataConfig(template, savedCanvaDesigns);
        
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-small)', flexWrap: 'wrap' }}>
                {config.badges.map((badge, index) => (
                    <span key={index} className={badge.className} style={badge.style} title={badge.title}>
                        {badge.text}
                    </span>
                ))}
                {config.metadata.map((meta, index) => (
                    <span key={index} className={meta.className}>
                        {meta.text}
                    </span>
                ))}
            </div>
        );
    };

    // Handler for creating alt text from template
    const handleCreateAltText = useCallback((template) => {
        try {
            // Create unique session ID for cross-tab communication
            const sessionId = `canva-alttext-${Date.now()}`;
            
            // Store template data in sessionStorage
            sessionStorage.setItem(sessionId, JSON.stringify({
                source: 'canvaTemplate',
                template: template,
                timestamp: Date.now()
            }));
            
            // Open alt text generator in new tab with session reference
            const url = new URL(window.location.origin + '/alttext');
            url.searchParams.append('canvaTemplate', sessionId);
            window.open(url.toString(), '_blank');
            
            console.log('[ContentManagementTab] Alt-Text creation initiated for template:', template.title);
        } catch (error) {
            console.error('[ContentManagementTab] Error creating alt text session:', error);
            onErrorMessage('Fehler beim Öffnen des Alt-Text Generators');
        }
    }, [onErrorMessage]);

    // Action items for templates (re-enabled with basic functionality)
    const getCanvaTemplateActionItems = useCallback((template) => {
        const actions = [];
        
        // Basic actions for all templates
        if (template.canva_url || template.external_url) {
            actions.push({
                icon: 'HiExternalLink',
                label: 'In Canva bearbeiten',
                onClick: () => handleEditTemplate(template)
            });
        }
        
        // Save Canva design as local template
        if (template.source === 'canva' && !template.saved_as_template) {
            actions.push({
                icon: 'HiDownload',
                label: 'Als Vorlage speichern',
                onClick: () => handleSaveCanvaTemplate(template)
            });
        }
        
        // Create alt text action
        if (template.preview_image_url || template.thumbnail_url) {
            actions.push({
                icon: 'HiChatAlt2',
                label: 'Alt-Text erstellen',
                onClick: () => handleCreateAltText(template)
            });
        }
        
        return actions;
    }, [handleSaveCanvaTemplate, handleEditTemplate, handleCreateAltText]);

    // Bulk delete handlers  
    const handleBulkDeleteTemplates = async (templateIds) => {
        try {
            // const result = await canvaTemplateUtils.handleBulkDeleteTemplates(templateIds, onErrorMessage);
            const result = { success: true };
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
        // END CANVA DISABLED TEMPLATE FUNCTIONS
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

    // Bulk delete Q&A moved to CustomGeneratorsTab

    // Document types and constants from utilities
    const documentTypes = documentAndTextUtils.DOCUMENT_TYPES;
    const textDocumentTypes = documentAndTextUtils.TEXT_DOCUMENT_TYPES;

    // CANVA CONSTANTS - RE-ENABLED
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
                isAuthenticated={isAuthenticated}
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
                documents={[...templates, ...canvaDesigns]} // Include both templates and Canva designs
                loading={templatesLoading || fetchingCanvaDesigns} // Include both loading states
                onFetch={() => {
                    templatesQuery.refetch();
                    // Re-enable Canva designs refresh
                    if (canvaConnected) {
                        getCanvaState().fetchDesigns(true); // Force refresh
                    }
                }}
                onDelete={handleDeleteTemplate}
                onBulkDelete={handleBulkDeleteTemplates}
                onUpdateTitle={handleTemplateTitleUpdate}
                onEdit={handleEditTemplate}
                onShare={createShareAction('database')}
                actionItems={getCanvaTemplateActionItems} // Re-enable Canva template action items
                documentTypes={[]} // Keep template types simple for now
                metaRenderer={renderTemplateMetadata}
                emptyStateConfig={{
                    noDocuments: canvaConnected ? 'Du hast noch keine Vorlagen. Verwende den "Sync mit Canva" Button um deine Canva-Designs zu laden.' : 'Du hast noch keine Vorlagen.',
                    createMessage: canvaConnected ? 'Synchronisiere deine Canva-Designs oder erstelle neue Vorlagen.' : 'Verbinde dich mit Canva um deine Designs zu synchronisieren.'
                }}
                searchPlaceholder={canvaConnected ? "Alle Vorlagen und Canva-Designs durchsuchen..." : "Vorlagen durchsuchen..."}
                title={`Meine Vorlagen (${templates.length + canvaDesigns.length})`} // Include both counts
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
                                        // Refresh both Canva designs and React Query templates
                                        await Promise.all([
                                            getCanvaState().refreshDesigns(),
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
                                {isAuthenticated && (
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
                                )}
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
                    isAuthenticated={isAuthenticated}
                    onSuccessMessage={onSuccessMessage}
                    onErrorMessage={onErrorMessage}
                    onNavigateToOverview={() => handleCanvaSubsectionChange('overview')}
                />
            </div>
        );
    };

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
                    <div className="spinner"></div>
                    <p>Modus wird geladen...</p>
                </div>
            ) : (
                <div className="unified-documents-container">
                    {/* Wolke Sync Management - show if user has share links */}
                    {wolkeShareLinks && wolkeShareLinks.length > 0 && (
                        <div className="wolke-sync-section" style={{ marginBottom: 'var(--spacing-large)' }}>
                            <WolkeSyncManager 
                                wolkeShareLinks={wolkeShareLinks}
                                onRefreshShareLinks={() => {
                                    // Refresh both share links and check if we now have Wolke folders
                                    fetchWolkeShareLinks(true);
                                    // Also refresh the hasWolkeFolders check
                                    fetch('/api/documents/wolke/sync-status', {
                                        method: 'GET',
                                        credentials: 'include'
                                    })
                                    .then(response => response.json())
                                    .then(data => {
                                        if (data.success && Array.isArray(data.syncStatuses)) {
                                            setHasWolkeFolders(data.syncStatuses.length > 0);
                                        }
                                    })
                                    .catch(error => {
                                        console.error('Error checking Wolke folders:', error);
                                    });
                                }} 
                                onSyncComplete={() => {
                                    // Refresh documents after sync completes
                                    fetchDocuments();
                                }}
                            />
                        </div>
                    )}

                    <div className="unified-documents-section">
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
                                createMessage: 'Lade dein erstes Dokument hoch oder synchronisiere Ordner von der Wolke, um loszulegen. Alle Dokumente werden als durchsuchbare Vektoren gespeichert.'
                            }}
                            searchPlaceholder="Alle Dokumente durchsuchen..."
                            title="Meine Dokumente"
                            subtitle="Manuelle Uploads und Wolke-Synchronisation"
                            onSuccessMessage={onSuccessMessage}
                            onErrorMessage={onErrorMessage}
                            enableGrouping={true}
                            remoteSearchEnabled={true}
                            onRemoteSearch={(q, mode) => searchDocumentsApi(q, { limit: 10, mode })}
                            isRemoteSearching={isDocumentsSearching}
                            remoteResults={documentSearchResults}
                            onClearRemoteSearch={clearSearchResults}
                            headerActions={
                                <div style={{ display: 'flex', gap: 'var(--spacing-small)' }}>
                                    <button
                                        type="button"
                                        className="btn-secondary size-s"
                                        onClick={fetchDocuments}
                                        disabled={documentsLoading}
                                        aria-label="Alle Dokumente aktualisieren"
                                    >
                                        <HiRefresh className="icon" />
                                        Aktualisieren
                                    </button>
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
                    </div>
                </div>
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

    // Render QA content moved to CustomGeneratorsTab

    // Render Wolke content
    const renderWolkeContent = () => (
        <div
            role="tabpanel"
            id="wolke-panel"
            aria-labelledby="wolke-tab"
            tabIndex={-1}
        >
            <WolkeShareLinkManager
                shareLinks={wolkeShareLinks}
                loading={wolkeLoading}
                onAddShareLink={handleAddWolkeShareLink}
                onDeleteShareLink={handleDeleteWolkeShareLink}
                onTestConnection={handleTestWolkeConnection}
                onTestUpload={handleTestWolkeUpload}
                onRefresh={() => fetchWolkeShareLinks(true)}
                onSuccessMessage={onSuccessMessage}
                onErrorMessage={onErrorMessage}
            />
        </div>
    );

    // Render main content based on current tabs
    const renderMainContent = () => {
        // CANVA - OVERVIEW, TEMPLATES AND ASSETS
        if (currentTab === 'canva') {
            if (currentCanvaSubsection === 'overview') {
                return renderCanvaOverviewContent();
            }
            if (currentCanvaSubsection === 'vorlagen') {
                return renderCanvaVorlagenContent();
            }
            if (currentCanvaSubsection === 'assets') {
                return renderCanvaAssetsContent();
            }
        }
        if (currentTab === 'wolke') {
            return renderWolkeContent();
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

            {/* Canva modals - RE-ENABLED */}
            {showShareModal && (
                <ShareToGroupModal
                    isOpen={showShareModal}
                    onClose={handleCloseShareModal}
                    contentType={shareContent?.type}
                    contentId={shareContent?.id}
                    contentTitle={shareContent?.title}
                    onSuccess={handleShareSuccess}
                    onError={handleShareError}
                />
            )}
            
            {/* Add Template Modal - commented out for now as component needs to be created */}
            {/* showAddTemplateModal && (
                <AddCanvaTemplateModal
                    isOpen={showAddTemplateModal}
                    onClose={handleCloseAddTemplateModal}
                    onSuccess={handleAddTemplateSuccess}
                    onError={handleAddTemplateError}
                />
            ) */}
        </motion.div>
    );
};


export default ContentManagementTab;
