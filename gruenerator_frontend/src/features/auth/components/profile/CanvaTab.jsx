import React, { useState, useRef, useEffect, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from "motion/react";
import { HiPlus, HiExclamationCircle, HiRefresh, HiShare, HiExternalLink, HiDownload, HiOutlineEye, HiOutlineTrash, HiX, HiCheck, HiClipboard, HiUpload, HiPhotograph, HiPencil } from 'react-icons/hi';
import DocumentOverview from '../../../../components/common/DocumentOverview';
import ShareToGroupModal from '../../../../components/common/ShareToGroupModal';
import AddCanvaTemplateModal from '../../../../components/common/AddCanvaTemplateModal';
import { handleError } from '../../../../components/utils/errorHandling';
import { useOptimizedAuth } from '../../../../hooks/useAuth';
import { useUserTemplates } from '../../hooks/useProfileData';
import { useTabIndex } from '../../../../hooks/useTabIndex';
import * as canvaUtils from '../../../../components/utils/canvaUtils';

const CanvaTab = ({ isActive, onSuccessMessage, onErrorMessage }) => {
    const navigate = useNavigate();
    
    // Tab index configuration
    const tabIndex = useTabIndex('PROFILE_CANVA');
    
    // Subtab state for Canva sections
    const [currentView, setCurrentView] = useState('vorlagen'); // 'vorlagen' or 'assets'
    
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
    
    
    // Auth state
    const { user, isAuthenticated } = useOptimizedAuth();
    
    // Templates hook
    const { 
        query: templatesQuery,
        updateTemplateTitle,
        deleteTemplate,
        isUpdatingTitle: isUpdatingTemplateTitle,
        isDeleting: isDeletingTemplate
    } = useUserTemplates({ isActive });
    
    const { data: templates = [], isLoading: templatesLoading, error: templatesError } = templatesQuery;

    // Canva connection handlers
    const checkCanvaConnectionStatus = useCallback(async () => {
        if (!isAuthenticated) return;
        
        try {
            setCanvaLoading(true);
            const result = await canvaUtils.checkCanvaConnectionStatus(isAuthenticated);
            setCanvaConnected(result.connected);
            setCanvaUser(result.canva_user);
        } catch (error) {
            console.error('[CanvaTab] Error checking Canva connection:', error);
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

    const handleOpenTemplateLinkModal = useCallback((template) => {
        setTemplateToLink(template);
        setShowTemplateLinkModal(true);
    }, []);

    // Helper function to get available links for copying
    const getAvailableLinks = useCallback((template) => {
        return canvaUtils.getAvailableLinks(template);
    }, []);

    // Copy to clipboard functionality
    const copyToClipboard = useCallback(async (url, linkType, onClose) => {
        await canvaUtils.copyToClipboard(url, linkType, onSuccessMessage, onErrorMessage, onClose);
    }, [onSuccessMessage, onErrorMessage]);

    const handleCreateTemplateLink = useCallback(async (canvaUrl) => {
        if (!templateToLink) return;

        try {
            console.log(`[CanvaTab] Adding user URL to server template: ${templateToLink.title}`);
            
            const enhancedTemplate = canvaUtils.enhanceTemplateWithUserUrl(templateToLink, canvaUrl);

            setCanvaDesigns(prevDesigns => 
                prevDesigns.map(design => 
                    design.id === templateToLink.id ? enhancedTemplate : design
                )
            );

            if (templateToLink.canva_id) {
                setSavedCanvaDesigns(prev => new Set(prev).add(templateToLink.canva_id));
            }
            
            onSuccessMessage(`Template Link für "${templateToLink.title}" wurde erfolgreich hinzugefügt.`);
            setShowTemplateLinkModal(false);
            setTemplateToLink(null);
            console.log('[CanvaTab] Template enhanced with user URL:', enhancedTemplate);
        } catch (error) {
            console.error('[CanvaTab] Error adding template link:', error);
            onErrorMessage('Fehler beim Hinzufügen des Template Links: ' + error.message);
        }
    }, [templateToLink, setSavedCanvaDesigns, onSuccessMessage, onErrorMessage]);


    // Handle template errors
    useEffect(() => {
        if (templatesError) {
            console.error('[CanvaTab] Fehler beim Laden der Templates:', templatesError);
            handleError(templatesError, onErrorMessage);
        }
    }, [templatesError, onErrorMessage]);

    // Check Canva connection status when tab becomes active
    useEffect(() => {
        if (isActive && isAuthenticated) {
            checkCanvaConnectionStatus();
        }
    }, [isActive, isAuthenticated, checkCanvaConnectionStatus]);

    // Fetch Canva designs when connected
    useEffect(() => {
        if (isActive && canvaConnected && isAuthenticated && currentView === 'vorlagen') {
            fetchCanvaDesigns();
        }
    }, [isActive, canvaConnected, isAuthenticated, currentView, fetchCanvaDesigns]);

    // Template action handlers
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
            if (templateId.startsWith('canva_')) {
                onErrorMessage('Canva Designs können nur in Canva selbst gelöscht werden.');
                return;
            }
            
            await deleteTemplate(templateId);
            onSuccessMessage('Canva Vorlage wurde erfolgreich gelöscht.');
        } catch (error) {
            console.error('[CanvaTab] Error deleting Canva template:', error);
            onErrorMessage('Fehler beim Löschen der Canva Vorlage: ' + error.message);
            throw error;
        }
    };

    const handleTemplateTitleUpdate = async (templateId, newTitle) => {
        try {
            if (templateId.startsWith('canva_')) {
                onErrorMessage('Canva Design Titel können nur in Canva selbst bearbeitet werden.');
                return;
            }
            
            await updateTemplateTitle(templateId, newTitle);
        } catch (error) {
            console.error('[CanvaTab] Error updating Canva template title:', error);
            onErrorMessage('Fehler beim Aktualisieren des Canva Vorlagentitels: ' + error.message);
            throw error;
        }
    };

    // Share functionality handlers
    const handleShareToGroup = useCallback(async (contentType, contentId, contentTitle) => {
        if (contentType === 'user_content' && contentId.startsWith('canva_')) {
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
        templatesQuery.refetch();
        handleCloseAddTemplateModal();
    };

    const handleAddTemplateError = (error) => {
        onErrorMessage(error || 'Fehler beim Hinzufügen der Canva Vorlage.');
    };

    // Bulk delete handler for templates
    const handleBulkDeleteTemplates = async (templateIds) => {
        try {
            const result = await canvaUtils.handleBulkDeleteTemplates(templateIds, onErrorMessage);
            templatesQuery.refetch();
            return result;
        } catch (error) {
            console.error('[CanvaTab] Error in bulk delete templates:', error);
            throw error;
        }
    };

    // Custom meta renderer to add source badges
    const renderTemplateMetadata = (template) => {
        const config = canvaUtils.getTemplateMetadataConfig(template, savedCanvaDesigns);
        
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

    // Custom action items for templates based on source
    const getCanvaTemplateActionItems = useCallback((template) => {
        const isCanvaDesign = template.source === 'canva';
        const isAlreadySaved = savedCanvaDesigns.has(template.canva_id);
        const hasUserLink = template.has_user_link === true;
        const isSaving = savingDesign === template.id;

        if (isCanvaDesign) {
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

            if (!isAlreadySaved && !hasUserLink) {
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
                actions.push({
                    icon: HiShare,
                    label: 'Mit Gruppe teilen',
                    onClick: () => handleShareToGroup('user_content', template.id, template.title),
                    show: true
                });
            }

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

    // Template types for display from utils
    const canvaTemplateTypes = canvaUtils.CANVA_TEMPLATE_TYPES;
    const canvaAssetTypes = canvaUtils.CANVA_ASSET_TYPES;

    // Subtab navigation handler
    const handleSubtabClick = useCallback((view) => {
        setCurrentView(view);
        // Clear any existing data when switching tabs
        if (view === 'vorlagen') {
            setCanvaDesigns([]);
            setCanvaDesignsError(null);
        }
    }, []);

    return (
        <motion.div 
            className="profile-content profile-management-layout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            <div className="profile-navigation-panel">
                <nav 
                    className="profile-vertical-navigation"
                    role="tablist"
                    aria-label="Canva Navigation"
                    aria-orientation="vertical"
                >
                    <button
                        className={`profile-vertical-tab ${currentView === 'vorlagen' ? 'active' : ''}`}
                        onClick={() => handleSubtabClick('vorlagen')}
                        role="tab"
                        aria-selected={currentView === 'vorlagen'}
                        aria-controls="vorlagen-panel"
                        id="vorlagen-tab"
                    >
                        Canva Vorlagen
                    </button>
                    <button
                        className={`profile-vertical-tab ${currentView === 'assets' ? 'active' : ''}`}
                        onClick={() => handleSubtabClick('assets')}
                        role="tab"
                        aria-selected={currentView === 'assets'}
                        aria-controls="assets-panel"
                        id="assets-tab"
                    >
                        Assets
                    </button>
                </nav>
            </div>
            <div className="profile-content-panel profile-form-section">
                <div className="profile-content-card">
                    <div className="auth-form">
                        {currentView === 'vorlagen' && (
                            <div
                                role="tabpanel"
                                id="vorlagen-panel"
                                aria-labelledby="vorlagen-tab"
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
                        
                        {currentView === 'assets' && (
                            <div
                                role="tabpanel"
                                id="assets-panel"
                                aria-labelledby="assets-tab"
                                tabIndex={-1}
                            >
                                <CanvaAssetsPanel
                                    canvaConnected={canvaConnected}
                                    canvaLoading={canvaLoading}
                                    onCanvaLogin={handleCanvaLogin}
                                    onSuccessMessage={onSuccessMessage}
                                    onErrorMessage={onErrorMessage}
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

// Simplified Asset Packages Panel Component  
const CanvaAssetsPanel = ({ 
    canvaConnected, 
    canvaLoading, 
    onCanvaLogin, 
    onSuccessMessage, 
    onErrorMessage
}) => {
    const [importingPackage, setImportingPackage] = useState(null);
    const [importProgress, setImportProgress] = useState('');
    const [importedPackages, setImportedPackages] = useState(canvaUtils.getImportedPackages());

    // Handle package import
    const handleImportPackage = useCallback(async (packageId) => {
        if (importingPackage) return; // Prevent multiple imports

        setImportingPackage(packageId);
        setImportProgress('Starte Import...');

        try {
            const result = await canvaUtils.importAssetPackage(
                packageId,
                (progressMsg) => setImportProgress(progressMsg),
                (result) => {
                    canvaUtils.markPackageAsImported(packageId);
                    setImportedPackages(canvaUtils.getImportedPackages());
                    onSuccessMessage(`Asset Package "${result.packageName}" wurde erfolgreich importiert! ${result.importedAssets} Assets hinzugefügt.`);
                },
                onErrorMessage
            );
        } catch (error) {
            console.error('[CanvaAssetsPanel] Import failed:', error);
        } finally {
            setImportingPackage(null);
            setImportProgress('');
        }
    }, [importingPackage, onSuccessMessage, onErrorMessage]);

    if (!canvaConnected) {
        return (
            <div className="profile-card">
                <div className="profile-card-header">
                    <h3>Asset-Pakete</h3>
                </div>
                <div className="profile-card-content">
                    <div className="empty-state">
                        <HiPhotograph size={48} style={{ color: 'var(--font-color-muted)' }} />
                        <p>Verbinde dein Canva-Konto, um Asset-Pakete zu verwenden.</p>
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={onCanvaLogin}
                            disabled={canvaLoading}
                        >
                            <HiExternalLink className="icon" />
                            {canvaLoading ? 'Verbinde...' : 'Mit Canva verbinden'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="profile-card">
            <div className="profile-card-header">
                <h3>Asset-Pakete</h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--font-color-muted)', marginTop: 'var(--spacing-small)' }}>
                    Wähle vorgefertigte Asset-Sammlungen aus, um sie zu deinem Canva-Konto hinzuzufügen.
                </p>
            </div>
            <div className="profile-card-content">
                {importingPackage && (
                    <div className="import-progress" style={{ 
                        marginBottom: 'var(--spacing-large)', 
                        padding: 'var(--spacing-medium)', 
                        backgroundColor: 'var(--background-color-secondary)', 
                        borderRadius: 'var(--border-radius)' 
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-small)' }}>
                            <div className="spinner" style={{ width: '20px', height: '20px' }}></div>
                            <span>Importiere Asset-Paket...</span>
                        </div>
                        {importProgress && (
                            <div style={{ marginTop: 'var(--spacing-small)', fontSize: '0.9rem', color: 'var(--font-color-muted)' }}>
                                {importProgress}
                            </div>
                        )}
                    </div>
                )}

                <div className="asset-packages-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: 'var(--spacing-large)'
                }}>
                    {canvaUtils.ASSET_PACKAGES.map(pkg => (
                        <AssetPackageCard
                            key={pkg.id}
                            package={pkg}
                            isImported={importedPackages.includes(pkg.id)}
                            isImporting={importingPackage === pkg.id}
                            onImport={() => handleImportPackage(pkg.id)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

// Asset Package Card Component
const AssetPackageCard = ({ package: pkg, isImported, isImporting, onImport }) => {
    return (
        <div className="asset-package-card" style={{
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--border-radius)',
            overflow: 'hidden',
            backgroundColor: 'var(--background-color)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease'
        }}>
            <div className="package-thumbnail" style={{
                height: '160px',
                backgroundImage: `url(${pkg.thumbnail})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                position: 'relative'
            }}>
                {isImported && (
                    <div style={{
                        position: 'absolute',
                        top: 'var(--spacing-small)',
                        right: 'var(--spacing-small)',
                        backgroundColor: 'var(--success-color, #10b981)',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        textTransform: 'uppercase'
                    }}>
                        <HiCheck style={{ marginRight: '2px' }} />
                        Importiert
                    </div>
                )}
            </div>
            
            <div style={{ padding: 'var(--spacing-medium)' }}>
                <h4 style={{ margin: '0 0 var(--spacing-small) 0', fontSize: '1.1rem' }}>
                    {pkg.name}
                </h4>
                <p style={{ 
                    margin: '0 0 var(--spacing-medium) 0', 
                    fontSize: '0.9rem', 
                    color: 'var(--font-color-muted)',
                    lineHeight: '1.4'
                }}>
                    {pkg.description}
                </p>
                
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: 'var(--spacing-medium)'
                }}>
                    <span style={{
                        padding: '4px 8px',
                        backgroundColor: 'var(--klee)',
                        color: 'var(--background-color)',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        textTransform: 'uppercase'
                    }}>
                        {pkg.assets.length} Assets
                    </span>
                </div>

                <button
                    type="button"
                    className={isImported ? "btn-secondary" : "btn-primary"}
                    style={{ width: '100%' }}
                    onClick={onImport}
                    disabled={isImporting || isImported}
                >
                    {isImporting ? (
                        <>
                            <div className="spinner" style={{ marginRight: '8px', width: '16px', height: '16px' }}></div>
                            Importiere...
                        </>
                    ) : isImported ? (
                        <>
                            <HiCheck className="icon" />
                            Bereits importiert
                        </>
                    ) : (
                        <>
                            <HiDownload className="icon" />
                            Paket importieren
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};


// Simple Template Link Modal Component
const TemplateLinkModal = ({ template, onClose, onSubmit }) => {
    const [canvaUrl, setCanvaUrl] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [validationError, setValidationError] = useState('');

    const validateCanvaUrl = (url) => {
        return canvaUtils.validateCanvaUrl(url);
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

export default CanvaTab;