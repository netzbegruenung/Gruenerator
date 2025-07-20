import React, { useState, useRef, useEffect, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from "motion/react";
import { HiDocumentText, HiPlus, HiExclamationCircle, HiRefresh, HiChatAlt2, HiCollection, HiShare, HiExternalLink, HiDownload, HiOutlineEye, HiOutlineTrash, HiX, HiCheck, HiClipboard, HiChevronRight } from 'react-icons/hi';
import DocumentUpload from '../../../../components/common/DocumentUpload';
import DocumentOverview from '../../../../components/common/DocumentOverview';
import ShareToGroupModal from '../../../../components/common/ShareToGroupModal';
import AddCanvaTemplateModal from '../../../../components/common/AddCanvaTemplateModal';
import QACreator from '../../../qa/components/QACreator';
import { useDocumentsStore } from '../../../../stores/documentsStore';
import { handleError } from '../../../../components/utils/errorHandling';
import { useOptimizedAuth } from '../../../../hooks/useAuth';
import { useQACollections, useUserTexts, useUserTemplates } from '../../hooks/useProfileData';
import { useTabIndex } from '../../../../hooks/useTabIndex';
import { useVerticalTabNavigation, useModalFocus } from '../../../../hooks/useKeyboardNavigation';
import { announceToScreenReader } from '../../../../utils/focusManagement';
import { useBetaFeatures } from '../../../../hooks/useBetaFeatures';
import apiClient from '../../../../components/utils/apiClient';
import { templateService } from '../../../../components/utils/templateService';

// Memoized DocumentUpload wrapper to prevent re-renders
const MemoizedDocumentUpload = memo(({ onUploadComplete, onDeleteComplete, showDocumentsList = true, showTitle = true, forceShowUploadForm = false, showAsModal = false }) => {
    // MemoizedDocumentUpload rendering
    
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
    const verticalNavRef = useRef(null);
    
    // Tab index configuration
    const tabIndex = useTabIndex('PROFILE_DOCUMENTS');
    
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
    
    // MeineTexte functionality
    const { user, isAuthenticated } = useOptimizedAuth();
    
    // Beta features
    const { getBetaFeatureState } = useBetaFeatures();
    const isQAEnabled = getBetaFeatureState('qa');
    
    const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
    
    // Debug log for showUploadForm state changes
    React.useEffect(() => {
        // showUploadForm state changed
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

    const { 
        query: templatesQuery,
        updateTemplateTitle,
        deleteTemplate,
        isUpdatingTitle: isUpdatingTemplateTitle,
        isDeleting: isDeletingTemplate
    } = useUserTemplates({ isActive });
    
    const { data: qaCollections = [], isLoading: qaLoading, error: qaError } = qaQuery;
    const { data: texts = [], isLoading: textsLoading, error: textsError } = textsQuery;
    const { data: templates = [], isLoading: templatesLoading, error: templatesError } = templatesQuery;

    // Canva connection handlers (defined early to avoid initialization issues)
    const checkCanvaConnectionStatus = useCallback(async () => {
        if (!isAuthenticated) return;
        
        try {
            setCanvaLoading(true);
            const response = await apiClient.get('/canva/auth/status');
            
            if (response.data.success) {
                setCanvaConnected(response.data.connected);
                setCanvaUser(response.data.canva_user);
            } else {
                setCanvaConnected(false);
                setCanvaUser(null);
            }
        } catch (error) {
            console.error('[DocumentsTab] Error checking Canva connection:', error);
            setCanvaConnected(false);
            setCanvaUser(null);
            // Don't show error message for connection check failures
        } finally {
            setCanvaLoading(false);
        }
    }, [isAuthenticated]);

    const handleCanvaLogin = async () => {
        if (canvaLoading) return;
        
        try {
            setCanvaLoading(true);
            onErrorMessage('');
            
            // Get authorization URL from backend
            const response = await apiClient.get('/canva/auth/authorize');
            
            if (response.data.success && response.data.authUrl) {
                // Redirect to Canva OAuth flow
                window.location.href = response.data.authUrl;
            } else {
                throw new Error(response.data.error || 'Failed to get authorization URL');
            }
        } catch (error) {
            console.error('[DocumentsTab] Error initiating Canva login:', error);
            onErrorMessage('Fehler beim Verbinden mit Canva: ' + (error.message || 'Bitte versuche es später erneut.'));
            setCanvaLoading(false);
        }
    };

    const fetchCanvaDesigns = useCallback(async (retryCount = 0) => {
        if (!canvaConnected || !isAuthenticated) return;
        
        const maxRetries = 2;
        
        try {
            setFetchingCanvaDesigns(true);
            setCanvaDesignsError(null);
            
            console.log(`[DocumentsTab] Fetching Canva designs... (attempt ${retryCount + 1})`);
            const response = await apiClient.get('/canva/designs', {
                params: {
                    limit: 20, // Fetch up to 20 designs
                    sort_by: 'modified_descending' // Show most recently modified first
                }
            });
            
            if (response.data.success) {
                const designs = response.data.designs || [];
                console.log(`[DocumentsTab] Fetched ${designs.length} Canva designs`);
                
                // Transform Canva designs to match our template structure
                const transformedDesigns = designs.map(design => ({
                    id: `canva_${design.id}`, // Prefix to distinguish from local templates
                    title: design.title || 'Untitled Design',
                    type: 'canva_design',
                    canva_id: design.id,
                    canva_url: design.urls?.edit_url,
                    external_url: design.urls?.view_url,
                    thumbnail_url: design.thumbnail?.url, // This should show thumbnails automatically
                    preview_image_url: design.thumbnail?.url, // Alternative property name for compatibility
                    created_at: design.created_at ? new Date(design.created_at * 1000).toISOString() : null,
                    updated_at: design.updated_at ? new Date(design.updated_at * 1000).toISOString() : null,
                    source: 'canva',
                    page_count: design.page_count,
                    owner: design.owner
                }));
                
                setCanvaDesigns(transformedDesigns);
            } else {
                throw new Error(response.data.error || 'Failed to fetch Canva designs');
            }
        } catch (error) {
            console.error(`[DocumentsTab] Error fetching Canva designs (attempt ${retryCount + 1}):`, error);
            
            // Retry for certain types of errors
            const shouldRetry = retryCount < maxRetries && (
                error.response?.status >= 500 || // Server errors
                error.code === 'NETWORK_ERROR' || // Network issues
                error.name === 'TimeoutError'
            );
            
            if (shouldRetry) {
                console.log(`[DocumentsTab] Retrying Canva designs fetch in ${(retryCount + 1) * 1000}ms...`);
                setTimeout(() => {
                    fetchCanvaDesigns(retryCount + 1);
                }, (retryCount + 1) * 1000); // Exponential backoff: 1s, 2s, 3s
                return;
            }
            
            // Provide user-friendly error messages
            let errorMessage = 'Fehler beim Laden der Canva Designs';
            if (error.response?.status === 401) {
                errorMessage = 'Canva-Verbindung abgelaufen. Bitte verbinde dich erneut.';
                setCanvaConnected(false); // Reset connection status
            } else if (error.response?.status === 403) {
                errorMessage = 'Keine Berechtigung zum Zugriff auf Canva Designs.';
            } else if (error.response?.status >= 500) {
                errorMessage = 'Canva Server-Fehler. Bitte versuche es später erneut.';
            } else if (error.code === 'NETWORK_ERROR' || !navigator.onLine) {
                errorMessage = 'Netzwerkfehler. Bitte überprüfe deine Internetverbindung.';
            }
            
            setCanvaDesignsError(errorMessage);
            setCanvaDesigns([]);
            setFetchingCanvaDesigns(false);
            onErrorMessage && onErrorMessage(errorMessage);
        } finally {
            // Set loading to false on successful completion
            if (!retryCount) {
                setFetchingCanvaDesigns(false);
            }
        }
    }, [canvaConnected, isAuthenticated]);

    const handleSaveCanvaTemplate = useCallback(async (canvaDesign) => {
        if (!canvaDesign.canva_url) {
            onErrorMessage('Keine Canva URL verfügbar zum Speichern.');
            return;
        }

        try {
            setSavingDesign(canvaDesign.id);
            console.log(`[DocumentsTab] Saving Canva design: ${canvaDesign.title}`);
            
            const result = await templateService.createUserTemplateFromUrl(
                canvaDesign.canva_url, 
                true // enhanced metadata for better template quality
            );
            
            if (result.success) {
                // Mark this design as saved
                setSavedCanvaDesigns(prev => new Set(prev).add(canvaDesign.canva_id));
                
                // Refresh local templates to show the new one
                templatesQuery.refetch();
                
                onSuccessMessage(`"${canvaDesign.title}" wurde als lokale Vorlage gespeichert und kann jetzt geteilt werden.`);
                console.log('[DocumentsTab] Canva design saved successfully:', result.data);
            } else {
                throw new Error(result.message || 'Failed to save Canva template');
            }
        } catch (error) {
            console.error('[DocumentsTab] Error saving Canva template:', error);
            
            let errorMessage = 'Fehler beim Speichern der Canva Vorlage';
            if (error.message.includes('already exists') || error.message.includes('duplicate')) {
                errorMessage = 'Diese Canva Vorlage wurde bereits gespeichert.';
                // Still mark as saved since it exists
                setSavedCanvaDesigns(prev => new Set(prev).add(canvaDesign.canva_id));
            } else if (error.message.includes('invalid URL') || error.message.includes('not accessible')) {
                errorMessage = 'Canva Design ist nicht öffentlich zugänglich oder URL ist ungültig.';
            }
            
            onErrorMessage(errorMessage);
        } finally {
            setSavingDesign(null);
        }
    }, [onSuccessMessage, onErrorMessage, templatesQuery]);

    const handleOpenTemplateLinkModal = useCallback((template) => {
        setTemplateToLink(template);
        setShowTemplateLinkModal(true);
    }, []);

    // Helper function to get available links for copying
    const getAvailableLinks = useCallback((template) => {
        const links = [];
        
        // For enhanced templates with user links
        if (template.user_canva_url) {
            links.push({ 
                url: template.user_canva_url, 
                label: 'Meine Canva URL',
                description: 'Ihre persönliche Canva Design URL'
            });
        }
        
        // Original server URL (for enhanced templates)
        if (template.server_canva_url) {
            links.push({ 
                url: template.server_canva_url, 
                label: 'Server Canva URL',
                description: 'Original Server Design URL'
            });
        }
        
        // Primary Canva URL (edit URL)
        if (template.canva_url && !template.user_canva_url) {
            links.push({ 
                url: template.canva_url, 
                label: 'Canva Edit URL',
                description: 'Canva Design bearbeiten'
            });
        }
        
        // View URL from Canva API
        if (template.external_url && template.external_url !== template.canva_url) {
            links.push({ 
                url: template.external_url, 
                label: 'Canva Ansicht URL',
                description: 'Canva Design ansehen'
            });
        }
        
        return links;
    }, []);

    // Copy to clipboard functionality
    const copyToClipboard = useCallback(async (url, linkType, onClose) => {
        try {
            await navigator.clipboard.writeText(url);
            onSuccessMessage(`${linkType} wurde in die Zwischenablage kopiert.`);
            onClose?.(); // Close menu after copying
        } catch (error) {
            console.error('[DocumentsTab] Error copying to clipboard:', error);
            // Fallback for older browsers
            try {
                const textArea = document.createElement('textarea');
                textArea.value = url;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                onSuccessMessage(`${linkType} wurde in die Zwischenablage kopiert.`);
                onClose?.();
            } catch (fallbackError) {
                onErrorMessage('Fehler beim Kopieren in die Zwischenablage.');
            }
        }
    }, [onSuccessMessage, onErrorMessage]);

    const handleCreateTemplateLink = useCallback(async (canvaUrl) => {
        if (!templateToLink) return;

        try {
            console.log(`[DocumentsTab] Adding user URL to server template: ${templateToLink.title}`);
            
            // Instead of creating a new template, enhance the existing server template object
            const enhancedTemplate = {
                ...templateToLink,
                user_canva_url: canvaUrl,
                has_user_link: true,
                linked_at: new Date().toISOString(),
                // Keep original server URL separate
                server_canva_url: templateToLink.canva_url,
                // Override canva_url with user's URL for primary actions
                canva_url: canvaUrl
            };

            // Update the canvaDesigns state with enhanced template
            setCanvaDesigns(prevDesigns => 
                prevDesigns.map(design => 
                    design.id === templateToLink.id ? enhancedTemplate : design
                )
            );

            // Mark as saved for UI consistency  
            if (templateToLink.canva_id) {
                setSavedCanvaDesigns(prev => new Set(prev).add(templateToLink.canva_id));
            }
            
            onSuccessMessage(`Template Link für "${templateToLink.title}" wurde erfolgreich hinzugefügt.`);
            setShowTemplateLinkModal(false);
            setTemplateToLink(null);
            console.log('[DocumentsTab] Template enhanced with user URL:', enhancedTemplate);
        } catch (error) {
            console.error('[DocumentsTab] Error adding template link:', error);
            onErrorMessage('Fehler beim Hinzufügen des Template Links: ' + error.message);
        }
    }, [templateToLink, setSavedCanvaDesigns, onSuccessMessage, onErrorMessage]);

    // Handle errors
    useEffect(() => {
        if (qaError) {
            console.error('[DocumentsTab] Fehler beim Laden der Q&A-Sammlungen:', qaError);
            handleError(qaError, onErrorMessage);
        }
        if (textsError) {
            console.error('[DocumentsTab] Fehler beim Laden der Texte:', textsError);
            handleError(textsError, onErrorMessage);
        }
        if (templatesError) {
            console.error('[DocumentsTab] Fehler beim Laden der Templates:', templatesError);
            handleError(templatesError, onErrorMessage);
        }
        if (documentsError) {
            console.error('[DocumentsTab] Fehler beim Laden der Dokumente:', documentsError);
            onErrorMessage('Fehler beim Laden der Dokumente: ' + documentsError);
        }
    }, [qaError, textsError, templatesError, documentsError, onErrorMessage]);

    // Handle tab navigation
    const handleTabClick = useCallback((view) => {
        setCurrentView(view);
        onErrorMessage('');
        // Announce to screen readers
        const viewNames = {
            'documents': 'Meine Dokumente',
            'texts': 'Meine Texte',
            'qa': 'Meine Q&As',
            'templates': 'Canva Vorlagen'
        };
        announceToScreenReader(`${viewNames[view]} Tab ausgewählt`);
    }, [onErrorMessage]);
    
    // Available navigation tabs
    const availableViews = ['documents', 'texts', ...(isQAEnabled ? ['qa'] : []), 'templates'];
    
    // Ensure current view is valid when Q&A feature state changes
    useEffect(() => {
        if (currentView === 'qa' && !isQAEnabled) {
            setCurrentView('documents');
        }
    }, [isQAEnabled, currentView]);
    
    // Vertical tab navigation setup
    const {
        registerItemRef,
        tabIndex: getTabIndex,
        ariaSelected
    } = useVerticalTabNavigation({
        items: availableViews,
        activeItem: currentView,
        onItemSelect: handleTabClick,
        horizontal: false,
        containerRef: verticalNavRef
    });

    // Fetch documents when tab becomes active
    useEffect(() => {
        if (isActive && currentView === 'documents') {
            // Fetching documents due to tab/view change
            fetchDocuments();
        }
    }, [isActive, currentView, fetchDocuments]);

    // Monitor documents changes
    useEffect(() => {
        // Documents changed
    }, [documents, documentsLoading]);

    // Check Canva connection status when templates tab becomes active
    useEffect(() => {
        if (isActive && currentView === 'templates' && isAuthenticated) {
            checkCanvaConnectionStatus();
        }
    }, [isActive, currentView, isAuthenticated, checkCanvaConnectionStatus]);

    // Fetch Canva designs when connected and viewing templates
    useEffect(() => {
        if (isActive && currentView === 'templates' && canvaConnected && isAuthenticated) {
            fetchCanvaDesigns();
        }
    }, [isActive, currentView, canvaConnected, isAuthenticated, fetchCanvaDesigns]);

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
            <div 
                ref={verticalNavRef}
                className="profile-vertical-navigation"
                role="tablist"
                aria-label="Dokumente Navigation"
                aria-orientation="vertical"
            >
                <button
                    ref={(ref) => registerItemRef('documents', ref)}
                    className={`profile-vertical-tab ${currentView === 'documents' ? 'active' : ''}`}
                    onClick={() => handleTabClick('documents')}
                    tabIndex={getTabIndex('documents')}
                    role="tab"
                    aria-selected={ariaSelected('documents')}
                    aria-controls="documents-panel"
                    id="documents-tab"
                >
                    Meine Dokumente
                </button>
                <button
                    ref={(ref) => registerItemRef('texts', ref)}
                    className={`profile-vertical-tab ${currentView === 'texts' ? 'active' : ''}`}
                    onClick={() => handleTabClick('texts')}
                    tabIndex={getTabIndex('texts')}
                    role="tab"
                    aria-selected={ariaSelected('texts')}
                    aria-controls="texts-panel"
                    id="texts-tab"
                >
                    Meine Texte
                </button>
                {isQAEnabled && (
                    <button
                        ref={(ref) => registerItemRef('qa', ref)}
                        className={`profile-vertical-tab ${currentView === 'qa' ? 'active' : ''}`}
                        onClick={() => handleTabClick('qa')}
                        tabIndex={getTabIndex('qa')}
                        role="tab"
                        aria-selected={ariaSelected('qa')}
                        aria-controls="qa-panel"
                        id="qa-tab"
                    >
                        Meine Q&As
                    </button>
                )}
                <button
                    ref={(ref) => registerItemRef('templates', ref)}
                    className={`profile-vertical-tab ${currentView === 'templates' ? 'active' : ''}`}
                    onClick={() => handleTabClick('templates')}
                    tabIndex={getTabIndex('templates')}
                    role="tab"
                    aria-selected={ariaSelected('templates')}
                    aria-controls="templates-panel"
                    id="templates-tab"
                >
                    Canva Vorlagen
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
        // Upload completed or cancelled, hiding form
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
    
    // Text document types for MeineTexte tab
    const textDocumentTypes = {
        'text': 'Allgemeiner Text',
        'antrag': 'Antrag',
        'social': 'Social Media',
        'universal': 'Universeller Text',
        'press': 'Pressemitteilung',
        'gruene_jugend': 'Gruene Jugend'
    };
    
    // Canva template types for Templates tab
    const canvaTemplateTypes = {
        'canva': 'Canva Vorlage',
        'social_media': 'Social Media',
        'presentation': 'Präsentation',
        'flyer': 'Flyer',
        'poster': 'Poster',
        'newsletter': 'Newsletter',
        'instagram_post': 'Instagram Post',
        'facebook_post': 'Facebook Post',
        'story': 'Story'
    };


    // Custom meta renderer to add source badges
    const renderTemplateMetadata = (template) => {
        const isCanvaDesign = template.source === 'canva';
        const isAlreadySaved = savedCanvaDesigns.has(template.canva_id);
        const hasUserLink = template.has_user_link === true;
        
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-small)', flexWrap: 'wrap' }}>
                {/* Source badge */}
                <span 
                    className={`template-source-badge ${isCanvaDesign ? 'canva-badge' : 'local-badge'}`}
                    style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        textTransform: 'uppercase',
                        ...(isCanvaDesign ? {
                            backgroundColor: '#8b5dff',
                            color: 'white'
                        } : {
                            backgroundColor: 'var(--klee)',
                            color: 'var(--background-color)'
                        })
                    }}
                >
                    {isCanvaDesign ? 'Canva' : 'Lokal'}
                </span>

                {/* Saved indicator for Canva designs */}
                {isCanvaDesign && isAlreadySaved && (
                    <span 
                        className="template-saved-badge"
                        style={{
                            padding: '2px 6px',
                            borderRadius: '10px',
                            fontSize: '0.7rem',
                            fontWeight: '500',
                            backgroundColor: 'var(--success-color, #10b981)',
                            color: 'white',
                            textTransform: 'uppercase'
                        }}
                        title="Als lokale Vorlage gespeichert"
                    >
                        Gespeichert
                    </span>
                )}

                {/* Linked indicator for server templates */}
                {isCanvaDesign && hasUserLink && !isAlreadySaved && (
                    <span 
                        className="template-linked-badge"
                        style={{
                            padding: '2px 6px',
                            borderRadius: '10px',
                            fontSize: '0.7rem',
                            fontWeight: '500',
                            backgroundColor: 'var(--himmel, #0ea5e9)',
                            color: 'white',
                            textTransform: 'uppercase'
                        }}
                        title="Mit eigener Canva URL verknüpft"
                    >
                        Verknüpft
                    </span>
                )}

                {/* Document type */}
                {template.type && (
                    <span className="document-type">
                        {canvaTemplateTypes[template.type] || template.type}
                    </span>
                )}

                {/* Page count for Canva designs */}
                {template.page_count && (
                    <span className="document-meta">
                        {template.page_count} {template.page_count === 1 ? 'Seite' : 'Seiten'}
                    </span>
                )}

                {/* Last modified */}
                {template.updated_at && (
                    <span className="document-meta">
                        Bearbeitet: {new Date(template.updated_at).toLocaleDateString('de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                        })}
                    </span>
                )}
            </div>
        );
    };
    
    // Text and template handlers (using new hooks)
    const openInEditor = (documentId) => {
        window.open(`/editor/collab/${documentId}`, '_blank');
    };

    const openTemplateInCanva = (template) => {
        if (template.canva_url || template.external_url) {
            window.open(template.canva_url || template.external_url, '_blank');
        } else {
            onErrorMessage('Keine Canva-URL für diese Vorlage verfügbar.');
        }
    };

    const handleEditTemplate = (template) => {
        // Handle both local templates and Canva designs
        if (template.source === 'canva' && template.canva_url) {
            // Open Canva design directly
            window.open(template.canva_url, '_blank');
        } else {
            // Handle local templates
            openTemplateInCanva(template);
        }
    };
    
    const handleDeleteTemplate = async (templateId) => {
        try {
            // Only allow deleting local templates, not live Canva designs
            if (templateId.startsWith('canva_')) {
                onErrorMessage('Canva Designs können nur in Canva selbst gelöscht werden.');
                return;
            }
            
            await deleteTemplate(templateId);
            onSuccessMessage('Canva Vorlage wurde erfolgreich gelöscht.');
        } catch (error) {
            console.error('[DocumentsTab] Error deleting Canva template:', error);
            onErrorMessage('Fehler beim Löschen der Canva Vorlage: ' + error.message);
            throw error;
        }
    };

    const handleTemplateTitleUpdate = async (templateId, newTitle) => {
        try {
            // Only allow updating local templates, not live Canva designs
            if (templateId.startsWith('canva_')) {
                onErrorMessage('Canva Design Titel können nur in Canva selbst bearbeitet werden.');
                return;
            }
            
            await updateTemplateTitle(templateId, newTitle);
        } catch (error) {
            console.error('[DocumentsTab] Error updating Canva template title:', error);
            onErrorMessage('Fehler beim Aktualisieren des Canva Vorlagentitels: ' + error.message);
            throw error;
        }
    };

    const handleTextTitleUpdate = async (textId, newTitle) => {
        try {
            await updateTextTitle(textId, newTitle);
            onSuccessMessage('Texttitel erfolgreich aktualisiert.');
        } catch (error) {
            console.error('[DocumentsTab] Error updating text title:', error);
            onErrorMessage('Fehler beim Aktualisieren des Texttitels: ' + error.message);
            throw error;
        }
    };

    const handleEditText = (text) => {
        openInEditor(text.id);
    };

    // Share functionality handlers
    const handleShareToGroup = useCallback(async (contentType, contentId, contentTitle) => {
        // For enhanced Canva templates, create local template first
        if (contentType === 'user_content' && contentId.startsWith('canva_')) {
            const template = canvaDesigns.find(t => t.id === contentId);
            if (template && template.has_user_link) {
                try {
                    console.log('[DocumentsTab] Creating local template for sharing:', template.title);
                    
                    const templateData = {
                        title: template.title,
                        description: template.description || `Verknüpft mit Canva Design: ${template.title}`,
                        template_type: 'canva',
                        canva_url: template.user_canva_url, // Use user's URL
                        preview_image_url: template.preview_image_url || template.thumbnail_url,
                        categories: template.categories || ['canva'],
                        tags: [...(template.tags || []), 'enhanced-canva-template'],
                        content_data: {
                            server_template_id: template.id,
                            server_template_source: 'canva',
                            linked_via_url: true,
                            enhanced_template: true
                        },
                        metadata: {
                            template_type: 'canva',
                            source: 'enhanced_canva',
                            server_template_id: template.id,
                            linked_at: template.linked_at
                        }
                    };

                    const result = await templateService.createUserTemplate(templateData);
                    
                    if (result.success) {
                        // Update the share content with the new local template ID
                        setShareContent({
                            type: contentType,
                            id: result.data.id,
                            title: contentTitle
                        });
                        setShowShareModal(true);
                        
                        // Refresh templates to show the new local template
                        templatesQuery.refetch();
                        console.log('[DocumentsTab] Local template created for sharing:', result.data);
                        return;
                    } else {
                        throw new Error(result.message || 'Failed to create local template for sharing');
                    }
                } catch (error) {
                    console.error('[DocumentsTab] Error creating local template for sharing:', error);
                    onErrorMessage('Fehler beim Erstellen der Vorlage für das Teilen: ' + error.message);
                    return;
                }
            }
        }
        
        // Standard sharing logic for existing database content
        setShareContent({
            type: contentType,
            id: contentId,
            title: contentTitle
        });
        setShowShareModal(true);
    }, [canvaDesigns, templateService, templatesQuery, onErrorMessage]);

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

    // Create share action for different content types
    const createShareAction = (contentType) => (document) => {
        handleShareToGroup(contentType, document.id, document.title || document.name);
    };

    // Add template modal handlers
    const handleOpenAddTemplateModal = () => {
        setShowAddTemplateModal(true);
    };

    const handleCloseAddTemplateModal = () => {
        setShowAddTemplateModal(false);
    };

    const handleAddTemplateSuccess = (template, message) => {
        onSuccessMessage(message || 'Canva Vorlage wurde erfolgreich hinzugefügt.');
        
        // Refresh the templates list if we're currently viewing templates
        if (currentView === 'templates') {
            fetchTemplates();
        }
        
        handleCloseAddTemplateModal();
    };

    const handleAddTemplateError = (error) => {
        onErrorMessage(error || 'Fehler beim Hinzufügen der Canva Vorlage.');
    };

    // Bulk delete handlers for each tab type
    const handleBulkDeleteDocuments = async (documentIds) => {
        try {
            const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
            const response = await fetch(`${AUTH_BASE_URL}/documents/bulk`, {
                method: 'DELETE',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ids: documentIds })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Bulk delete failed');
            }

            const result = await response.json();
            console.log('[DocumentsTab] Bulk delete documents result:', result);
            
            // Refresh documents list
            fetchDocuments();
            
            return result;
        } catch (error) {
            console.error('[DocumentsTab] Error in bulk delete documents:', error);
            throw error;
        }
    };

    const handleBulkDeleteTexts = async (textIds) => {
        try {
            const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
            const response = await fetch(`${AUTH_BASE_URL}/user-texts/bulk`, {
                method: 'DELETE',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ids: textIds })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Bulk delete failed');
            }

            const result = await response.json();
            console.log('[DocumentsTab] Bulk delete texts result:', result);
            
            // Refresh texts list
            textsQuery.refetch();
            
            return result;
        } catch (error) {
            console.error('[DocumentsTab] Error in bulk delete texts:', error);
            throw error;
        }
    };

    const handleBulkDeleteQA = async (qaIds) => {
        try {
            const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
            const response = await fetch(`${AUTH_BASE_URL}/qa-collections/bulk`, {
                method: 'DELETE',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ids: qaIds })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Bulk delete failed');
            }

            const result = await response.json();
            console.log('[DocumentsTab] Bulk delete QA result:', result);
            
            // Refresh QA list
            qaQuery.refetch();
            
            return result;
        } catch (error) {
            console.error('[DocumentsTab] Error in bulk delete QA:', error);
            throw error;
        }
    };

    const handleBulkDeleteTemplates = async (templateIds) => {
        try {
            // Filter out Canva designs from bulk delete
            const localTemplateIds = templateIds.filter(id => !id.startsWith('canva_'));
            const canvaDesignCount = templateIds.length - localTemplateIds.length;
            
            if (canvaDesignCount > 0) {
                onErrorMessage(`${canvaDesignCount} Canva Design(s) können nur in Canva selbst gelöscht werden.`);
            }
            
            if (localTemplateIds.length === 0) {
                return { deleted: 0, message: 'Keine lokalen Vorlagen zum Löschen ausgewählt.' };
            }
            
            const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
            const response = await fetch(`${AUTH_BASE_URL}/auth/user-templates/bulk`, {
                method: 'DELETE',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ids: localTemplateIds })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Bulk delete failed');
            }

            const result = await response.json();
            console.log('[DocumentsTab] Bulk delete templates result:', result);
            
            // Refresh templates list
            templatesQuery.refetch();
            
            return result;
        } catch (error) {
            console.error('[DocumentsTab] Error in bulk delete templates:', error);
            throw error;
        }
    };

    // Custom action items for templates based on source (defined after all handlers)
    const getCanvaTemplateActionItems = useCallback((template) => {
        const isCanvaDesign = template.source === 'canva';
        const isAlreadySaved = savedCanvaDesigns.has(template.canva_id);
        const hasUserLink = template.has_user_link === true;
        const isSaving = savingDesign === template.id;

        if (isCanvaDesign) {
            // For live Canva designs
            const actions = [
                {
                    icon: HiOutlineEye,
                    label: 'In Canva öffnen',
                    onClick: () => {
                        if (template.canva_url) {
                            window.open(template.canva_url, '_blank');
                        } else {
                            onErrorMessage('Keine Canva URL verfügbar.');
                        }
                    },
                    primary: true
                }
            ];

            // Show different options based on linking status
            if (!isAlreadySaved && !hasUserLink) {
                // Neither saved automatically nor linked with user URL
                actions.push({
                    icon: HiDownload,
                    label: 'Als Vorlage speichern',
                    onClick: () => handleSaveCanvaTemplate(template),
                    loading: isSaving,
                    show: true
                });
                
                actions.push({
                    icon: HiExternalLink,
                    label: 'Template Link hinzufügen',
                    onClick: () => handleOpenTemplateLinkModal(template),
                    show: true
                });
            } else if (isAlreadySaved || hasUserLink) {
                // Either saved automatically or enhanced with user URL - both enable sharing
                actions.push({
                    icon: HiShare,
                    label: 'Mit Gruppe teilen',
                    onClick: () => handleShareToGroup('user_content', template.id, template.title),
                    show: true
                });
            }

            // Add copy links submenu for all templates with available links
            const availableLinks = getAvailableLinks(template);
            if (availableLinks.length > 0) {
                actions.push({
                    separator: true
                });
                actions.push({
                    icon: HiClipboard,
                    label: 'Links kopieren',
                    submenu: true,
                    submenuItems: availableLinks.map(link => ({
                        ...link,
                        onClick: (onClose) => copyToClipboard(link.url, link.label, onClose)
                    })),
                    show: true
                });
            }

            return actions;
        } else {
            // For local templates - full functionality
            const localActions = [
                {
                    icon: HiOutlineEye,
                    label: template.canva_url ? 'In Canva öffnen' : 'Anzeigen',
                    onClick: () => handleEditTemplate(template),
                    primary: true
                },
                {
                    icon: HiShare,
                    label: 'Mit Gruppe teilen',
                    onClick: () => handleShareToGroup('user_content', template.id, template.title),
                    show: true
                }
            ];

            // Add copy links submenu for local templates with available links
            const availableLinks = getAvailableLinks(template);
            if (availableLinks.length > 0) {
                localActions.push({
                    icon: HiClipboard,
                    label: 'Links kopieren',
                    submenu: true,
                    submenuItems: availableLinks.map(link => ({
                        ...link,
                        onClick: (onClose) => copyToClipboard(link.url, link.label, onClose)
                    })),
                    show: true
                });
            }

            localActions.push(
                {
                    separator: true
                },
                {
                    icon: HiOutlineTrash,
                    label: 'Löschen',
                    onClick: () => handleDeleteTemplate(template.id),
                    show: true,
                    danger: true
                }
            );

            return localActions;
        }
    }, [savedCanvaDesigns, savingDesign, handleSaveCanvaTemplate, handleEditTemplate, handleShareToGroup, handleDeleteTemplate, handleOpenTemplateLinkModal, getAvailableLinks, copyToClipboard, onErrorMessage]);

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
                            <div
                                role="tabpanel"
                                id="documents-panel"
                                aria-labelledby="documents-tab"
                                tabIndex={-1}
                            >
                                {/* Rendering documents view */}
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
                                            onClick={() => {
                                                setShowUploadForm(true);
                                            }}
                                            tabIndex={tabIndex.addContentButton}
                                            aria-label="Neuen Inhalt hinzufügen"
                                        >
                                            <HiPlus className="icon" />
                                            Inhalt hinzufügen
                                        </button>
                                    }
                                />
                                
                                {/* Upload form modal/overlay */}
                                {/* About to check showUploadForm condition */}
                                {showUploadForm && (
                                    <>
                                        {/* Inside showUploadForm condition */}
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
                            </div>
                        )}

                        {currentView === 'texts' && (
                            <div
                                role="tabpanel"
                                id="texts-panel"
                                aria-labelledby="texts-tab"
                                tabIndex={-1}
                            >
                            <DocumentOverview
                                documents={texts}
                                loading={textsLoading}
                                onFetch={() => textsQuery.refetch()}
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
                        )}

                        {currentView === 'qa' && isQAEnabled && (
                            <div
                                role="tabpanel"
                                id="qa-panel"
                                aria-labelledby="qa-tab"
                                tabIndex={-1}
                            >
                            <div className="profile-card">
                                <div className="profile-card-header">
                                    <h3>{showQACreator ? (editingQA ? 'Q&A bearbeiten' : 'Neue Q&A erstellen') : 'Meine Q&A-Sammlungen'}</h3>
                                    {!showQACreator && qaCollections && qaCollections.length === 0 && (
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
                                </div>
                            </div>
                            </div>
                        )}

                        {currentView === 'templates' && (
                            <div
                                role="tabpanel"
                                id="templates-panel"
                                aria-labelledby="templates-tab"
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
                                onShare={createShareAction('user_content')}
                                actionItems={getCanvaTemplateActionItems}
                                documentTypes={{
                                    ...canvaTemplateTypes,
                                    'canva_design': 'Canva Design'
                                }}
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
                                            // Show buttons when connected
                                            <>
                                                <button
                                                    type="button"
                                                    className="btn-secondary size-s"
                                                    onClick={fetchCanvaDesigns}
                                                    aria-label="Mit Canva synchronisieren"
                                                    disabled={fetchingCanvaDesigns || canvaLoading}
                                                    title="Aktuelle Designs von Canva laden"
                                                >
                                                    <HiRefresh className="icon" />
                                                    {fetchingCanvaDesigns ? 'Synchronisiere...' : 'Sync mit Canva'}
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
                                            // Show login button when not connected
                                            <button
                                                type="button"
                                                className="btn-primary size-s"
                                                onClick={handleCanvaLogin}
                                                tabIndex={tabIndex.addContentButton}
                                                aria-label="Mit Canva verbinden"
                                                disabled={canvaLoading}
                                            >
                                                <HiExternalLink className="icon" />
                                                {canvaLoading ? 'Verbinde...' : 'Mit Canva verbinden'}
                                            </button>
                                        )}
                                    </div>
                                }
                            />
                            </div>
                        )}
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

// Simple Template Link Modal Component
const TemplateLinkModal = ({ template, onClose, onSubmit }) => {
    const [canvaUrl, setCanvaUrl] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [validationError, setValidationError] = useState('');

    const validateCanvaUrl = (url) => {
        if (!url.trim()) {
            return 'Bitte geben Sie eine Canva URL ein.';
        }
        
        try {
            const urlObj = new URL(url);
            if (!urlObj.hostname.includes('canva.com')) {
                return 'URL muss von canva.com stammen.';
            }
            if (!urlObj.pathname.includes('/design/')) {
                return 'Bitte verwenden Sie eine gültige Canva Design-URL.';
            }
            return '';
        } catch (error) {
            return 'Ungültiges URL-Format.';
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        const error = validateCanvaUrl(canvaUrl);
        if (error) {
            setValidationError(error);
            return;
        }

        setIsSubmitting(true);
        setValidationError('');
        
        try {
            await onSubmit(canvaUrl.trim());
        } catch (error) {
            setValidationError('Fehler beim Erstellen des Template Links.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUrlChange = (e) => {
        setCanvaUrl(e.target.value);
        setValidationError('');
    };

    return (
        <div className="citation-modal-overlay" onClick={onClose}>
            <div className="citation-modal" onClick={(e) => e.stopPropagation()}>
                <div className="citation-modal-header">
                    <div className="share-modal-title">
                        <HiExternalLink className="share-modal-icon" />
                        <h4>Template Link hinzufügen</h4>
                    </div>
                    <button 
                        className="citation-modal-close" 
                        onClick={onClose}
                        disabled={isSubmitting}
                    >
                        <HiX />
                    </button>
                </div>

                <div className="citation-modal-content">
                    <div className="template-link-info">
                        <p><strong>Server Template:</strong> {template.title}</p>
                        <p>Geben Sie Ihre eigene Canva URL ein, um diese mit dem Template zu verknüpfen:</p>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label htmlFor="canva-url">Canva URL:</label>
                            <input
                                id="canva-url"
                                type="url"
                                className={`form-input ${validationError ? 'error' : ''}`}
                                value={canvaUrl}
                                onChange={handleUrlChange}
                                placeholder="https://www.canva.com/design/..."
                                disabled={isSubmitting}
                                autoFocus
                            />
                            {validationError && (
                                <div className="form-error">
                                    <HiExclamationCircle />
                                    {validationError}
                                </div>
                            )}
                        </div>

                        <div className="template-link-actions">
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={onClose}
                                disabled={isSubmitting}
                            >
                                Abbrechen
                            </button>
                            <button
                                type="submit"
                                className="btn-primary"
                                disabled={!canvaUrl.trim() || isSubmitting}
                            >
                                {isSubmitting ? (
                                    <>
                                        <div className="spinner"></div>
                                        Wird erstellt...
                                    </>
                                ) : (
                                    <>
                                        <HiCheck />
                                        Template Link erstellen
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default DocumentsTab;