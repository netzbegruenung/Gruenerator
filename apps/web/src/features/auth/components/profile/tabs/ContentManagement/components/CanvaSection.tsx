import { useState, useRef, useEffect, useCallback, memo, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiExternalLink, HiDownload, HiChatAlt2, HiRefresh } from 'react-icons/hi';

// Canva components - OVERVIEW, TEMPLATES AND ASSETS
import CanvaOverview from '../../../../../../templates/canva/components/CanvaOverview';
import CanvaButton from '../../../../../../templates/canva/components/CanvaButton';
import CanvaAssetsPanel from '../../../../../../templates/canva/components/CanvaAssetsPanel';

// Common components
import DocumentOverview from '../../../../../../../components/common/DocumentOverview';
import ProfileCard from '../../../../../../../components/common/ProfileCard';
import TabNavigation from '../../../../../../../components/common/TabNavigation';

// Stores and hooks
import { useCanvaStore, useCanvaConnection, useCanvaDesigns, useSavingDesignState } from '../../../../../../../stores/canvaStore';
import { useOptimizedAuth } from '../../../../../../../hooks/useAuth';
import { useLocation } from 'react-router-dom';
import { useUserTemplates } from '../../../../../hooks/useProfileData';
import { useTabIndex } from '../../../../../../../hooks/useTabIndex';
import { useTabNavigation } from '../../../../../../../hooks/useTabNavigation';
import { useBetaFeatures } from '../../../../../../../hooks/useBetaFeatures';

// Utils
import * as canvaUtils from '../../../../../../../components/utils/canvaUtils';
import { getCurrentPath, buildLoginUrl } from '../../../../../../../utils/authRedirect';
import * as documentAndTextUtils from '../../../../../../../components/utils/documentAndTextUtils';
import { announceToScreenReader } from '../../../../../../../utils/focusManagement';

interface CanvaSectionProps {
    isActive: boolean;
    onSuccessMessage: (message: string) => void;
    onErrorMessage: (message: string) => void;
    initialSubsection?: string;
    onSubsectionChange?: (subsection: string) => void;
    onShareToGroup?: (contentType: string, content: unknown) => void;
}

interface CanvaTemplate {
    id: string;
    title?: string;
    canva_url?: string;
    external_url?: string;
    content_data?: { originalUrl?: string };
    source?: string;
    saved_as_template?: boolean;
    preview_image_url?: string;
    thumbnail_url?: string;
}

interface BulkDeleteResult {
    success: boolean;
    message?: string;
    failed?: number;
}

interface CanvaDesignInput {
    id: string;
    canva_id: string;
    title?: string;
    canva_url?: string;
    external_url?: string;
    content_data?: { originalUrl?: string };
    source?: string;
    saved_as_template?: boolean;
    preview_image_url?: string;
    thumbnail_url?: string;
    type?: string;
    updated_at?: string;
    created_at?: string;
    owner?: { display_name?: string };
    [key: string]: unknown;
}

interface CanvaLogoConfig {
    src: string;
    alt: string;
    className: string;
    height: string;
    width: string;
    minHeight: string;
    poweredByMessage: string;
    showPoweredBy?: boolean;
    usage?: string;
    brandMessage?: string;
    minimumPadding?: string;
    maintainAspectRatio?: boolean;
    allowColorChange?: boolean;
}

interface CanvaUser {
    [key: string]: unknown;
}

interface CanvaConnectionResult {
    connected: boolean;
    canva_user: CanvaUser | null;
}

interface ActionItem {
    separator?: boolean;
    show?: boolean;
    label?: string;
    icon?: React.ComponentType<{ className?: string }>;
    onClick?: () => void;
    danger?: boolean;
    loading?: boolean;
    submenu?: boolean;
    submenuItems?: Array<{
        label: string;
        description?: string;
        onClick?: (onClose?: () => void) => void;
    }>;
}

interface TemplateMetadataBadge {
    type: string;
    text: string;
    className: string;
    style?: React.CSSProperties;
    title?: string;
}

interface TemplateMetadataItem {
    type: string;
    text: string;
    className: string;
}

interface TemplateMetadataConfig {
    isCanvaDesign: boolean;
    isAlreadySaved: boolean;
    hasUserLink: boolean;
    badges: TemplateMetadataBadge[];
    metadata: TemplateMetadataItem[];
}

// Static constants moved outside component
const AVAILABLE_SUBSECTIONS = [
    { key: 'overview', label: 'Übersicht' },
    { key: 'vorlagen', label: 'Vorlagen' },
    { key: 'assets', label: 'Assets' }
] as const;

const EMPTY_STATE_CONNECTED = {
    noDocuments: 'Du hast noch keine Vorlagen. Verwende den "Sync mit Canva" Button um deine Canva-Designs zu laden.',
    createMessage: 'Synchronisiere deine Canva-Designs oder erstelle neue Vorlagen.'
} as const;

const EMPTY_STATE_DISCONNECTED = {
    noDocuments: 'Du hast noch keine Vorlagen.',
    createMessage: 'Verbinde dich mit Canva um deine Designs zu synchronisieren.'
} as const;

const CanvaSection = memo(({
    isActive,
    onSuccessMessage,
    onErrorMessage,
    initialSubsection = 'overview',
    onSubsectionChange,
    onShareToGroup
}: CanvaSectionProps) => {
    const navigate = useNavigate();
    const location = useLocation();

    // Beta features check
    const { canAccessBetaFeature } = useBetaFeatures();

    // Tab index configuration
    const tabIndex = useTabIndex('PROFILE_INTEGRATIONEN_CANVA');

    // Auth state
    const { user, isAuthenticated } = useOptimizedAuth();

    // =====================================================================
    // CANVA SUBSECTION HANDLING
    // =====================================================================

    // Memoized subsection change handler
    const handleSubsectionChange = useCallback((subsectionKey: string) => {
        onSubsectionChange?.(subsectionKey);
    }, [onSubsectionChange]);

    // Simple tab navigation for subsections
    const { currentTab: currentSubsection, handleTabClick: handleSubsectionClick } = useTabNavigation(
        initialSubsection,
        AVAILABLE_SUBSECTIONS as unknown as Array<{ key: string; label: string }>,
        handleSubsectionChange
    );

    // =====================================================================
    // CANVA STORE INTEGRATION
    // =====================================================================

    // Canva store hooks (memoized selectors for performance)
    const { connected: canvaConnected, user: canvaUser, loading: canvaLoading } = useCanvaConnection();
    const { designs: canvaDesigns, loading: fetchingCanvaDesigns, error: canvaDesignsError } = useCanvaDesigns();

    // Import store getState method for direct calls (no subscription)
    const getCanvaState = useCanvaStore.getState;

    // Store-based helpers (using stable selectors)
    const { savedDesigns: savedCanvaDesigns, savingDesign } = useSavingDesignState();

    // Templates hook
    const {
        query: templatesQuery,
        updateTemplateTitle,
        deleteTemplate,
        isUpdatingTitle: isUpdatingTemplateTitle,
        isDeleting: isDeletingTemplate
    } = useUserTemplates({ enabled: isActive });

    const { data: templates = [], isLoading: templatesLoading, error: templatesError } = templatesQuery;
    const typedTemplates = templates as CanvaTemplate[];

    // =====================================================================
    // CANVA FUNCTIONALITY
    // =====================================================================

    const checkCanvaConnectionStatusRef = useRef<(() => Promise<CanvaConnectionResult | undefined>) | undefined>(undefined);
    const fetchCanvaDesignsRef = useRef<(() => Promise<void>) | undefined>(undefined);

    // Canva store-based handlers (using refs for stability in effects)
    checkCanvaConnectionStatusRef.current = async () => {
        if (!isAuthenticated) return;

        try {
            return await getCanvaState().checkConnectionStatus();
        } catch (error) {
            console.error('[CanvaSection] Error checking Canva connection:', error);
            onErrorMessage?.(error instanceof Error ? error.message : 'Unbekannter Fehler');
        }
    };

    fetchCanvaDesignsRef.current = async () => {
        if (!canvaConnected || !isAuthenticated) return;

        try {
            await getCanvaState().fetchDesigns();
        } catch (error) {
            console.error('[CanvaSection] Error fetching Canva designs:', error);
            const errorMessage = error instanceof Error ? error.message : '';
            if (errorMessage.includes('abgelaufen')) {
                onErrorMessage?.('Canva-Verbindung abgelaufen. Bitte verbinde dich erneut.');
            } else {
                onErrorMessage?.(errorMessage || 'Unbekannter Fehler');
            }
        }
    };

    // Handle Canva login
    const handleCanvaLogin = useCallback(async () => {
        if (canvaLoading) return;

        try {
            await getCanvaState().initiateLogin();
        } catch (error) {
            console.error('[CanvaSection] Error during Canva login:', error);
            onErrorMessage('Fehler beim Verbinden mit Canva. Bitte versuche es erneut.');
        }
    }, [canvaLoading]);

    const handleSaveCanvaTemplate = useCallback(async (canvaDesign: CanvaTemplate & { canva_id?: string }) => {
        try {
            await getCanvaState().saveTemplate(canvaDesign as CanvaDesignInput);

            // Refresh templates query after successful save
            templatesQuery.refetch();

        } catch (error) {
            console.error('[CanvaSection] Error saving Canva template:', error);
            onErrorMessage(error instanceof Error ? error.message : 'Unbekannter Fehler');
        }
    }, [onErrorMessage, templatesQuery]);

    // Template handlers - prefer original URL for opening
    const handleEditTemplate = (template: CanvaTemplate) => {
        const url = template.content_data?.originalUrl || template.canva_url || template.external_url;
        if (url) {
            window.open(url, '_blank');
        } else {
            onErrorMessage('Keine Canva-URL für diese Vorlage verfügbar.');
        }
    };

    const handleDeleteTemplate = async (templateId: string): Promise<void> => {
        try {
            await deleteTemplate(templateId);
            onSuccessMessage('Canva Vorlage wurde erfolgreich gelöscht.');
        } catch (error) {
            console.error('[CanvaSection] Error deleting Canva template:', error);
            onErrorMessage('Fehler beim Löschen der Canva Vorlage: ' + (error instanceof Error ? error.message : 'Unbekannter Fehler'));
            throw error;
        }
    };

    const handleTemplateTitleUpdate = async (templateId: string, newTitle: string): Promise<void> => {
        try {
            if (updateTemplateTitle) {
                await updateTemplateTitle(templateId, newTitle);
            }
        } catch (error) {
            console.error('[CanvaSection] Error updating Canva template title:', error);
            onErrorMessage('Fehler beim Aktualisieren des Canva Vorlagentitels: ' + (error instanceof Error ? error.message : 'Unbekannter Fehler'));
            throw error;
        }
    };

    // Handler for creating alt text from template
    const handleCreateAltText = useCallback((template: CanvaTemplate) => {
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

            console.log('[CanvaSection] Alt-Text creation initiated for template:', template.title);
        } catch (error) {
            console.error('[CanvaSection] Error creating alt text session:', error);
            onErrorMessage('Fehler beim Öffnen des Alt-Text Generators');
        }
    }, [onErrorMessage]);

    const getCanvaTemplateActionItems = useCallback((template: CanvaTemplate): ActionItem[] => {
        const actions: ActionItem[] = [];

        if (template.canva_url || template.external_url) {
            actions.push({
                icon: HiExternalLink,
                label: 'In Canva bearbeiten',
                onClick: () => handleEditTemplate(template)
            });
        }

        if (template.source === 'canva' && !template.saved_as_template) {
            actions.push({
                icon: HiDownload,
                label: 'Als Vorlage speichern',
                onClick: () => handleSaveCanvaTemplate(template)
            });
        }

        if (template.preview_image_url || template.thumbnail_url) {
            actions.push({
                icon: HiChatAlt2,
                label: 'Alt-Text erstellen',
                onClick: () => handleCreateAltText(template)
            });
        }

        return actions;
    }, [handleSaveCanvaTemplate, handleEditTemplate, handleCreateAltText]);

    // Bulk delete handlers
    const handleBulkDeleteTemplates = async (templateIds: string[]): Promise<BulkDeleteResult> => {
        try {
            const result: BulkDeleteResult = { success: true };
            templatesQuery.refetch();
            if (result.message) {
                if (result.failed && result.failed > 0) {
                    onErrorMessage(result.message);
                } else {
                    onSuccessMessage(result.message);
                }
            }
            return result;
        } catch (error) {
            console.error('[CanvaSection] Error in bulk delete templates:', error);
            onErrorMessage(error instanceof Error ? error.message : 'Unbekannter Fehler');
            throw error;
        }
    };

    // Custom meta renderer for templates
    const renderTemplateMetadata = (template: CanvaTemplate) => {
        const config = canvaUtils.getTemplateMetadataConfig(template, savedCanvaDesigns) as TemplateMetadataConfig;

        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-small)', flexWrap: 'wrap' }}>
                {config.badges.map((badge: TemplateMetadataBadge, index: number) => (
                    <span key={index} className={badge.className} style={badge.style} title={badge.title}>
                        {badge.text}
                    </span>
                ))}
                {config.metadata.map((meta: TemplateMetadataItem, index: number) => (
                    <span key={index} className={meta.className}>
                        {meta.text}
                    </span>
                ))}
            </div>
        );
    };

    const createShareAction = useCallback((contentType: string) => {
        if (!onShareToGroup) {
            return () => {};
        }
        return documentAndTextUtils.createShareAction(contentType, onShareToGroup);
    }, [onShareToGroup]);

    // CANVA CONSTANTS
    const canvaTemplateTypes = canvaUtils.CANVA_TEMPLATE_TYPES;

    // =====================================================================
    // EFFECTS
    // =====================================================================

    // Handle errors
    useEffect(() => {
        if (templatesError) {
            console.error('[CanvaSection] Fehler beim Laden der Templates:', templatesError);
            onErrorMessage('Fehler beim Laden der Templates: ' + templatesError);
        }
    }, [templatesError, onErrorMessage]);

    // Consolidated Canva initialization and data loading
    useEffect(() => {
        if (!isActive || !isAuthenticated) return;

        // Initialize store if not already initialized
        const storeState = getCanvaState();
        if (!storeState.initialized) {
            storeState.initialize();
            return;
        }

        // Check connection when on canva section
        if (!canvaConnected && !canvaLoading) {
            checkCanvaConnectionStatusRef.current?.();
        }

        // Fetch designs when on templates subsection and connected
        if (currentSubsection === 'vorlagen' && canvaConnected && !fetchingCanvaDesigns) {
            fetchCanvaDesignsRef.current?.();
        }
    }, [isActive, isAuthenticated, currentSubsection, canvaConnected, canvaLoading, fetchingCanvaDesigns]);

    // Reset to overview when user disconnects from Canva while on restricted subsections
    useEffect(() => {
        if (!canvaConnected) {
            if (currentSubsection === 'vorlagen' || currentSubsection === 'assets') {
                // Switch back to overview subsection
                handleSubsectionClick('overview');
                announceToScreenReader('Zurück zur Übersicht - Canva-Verbindung erforderlich für diese Funktion');
            }
        }
    }, [canvaConnected, currentSubsection, handleSubsectionClick]);

    // =====================================================================
    // RENDER METHODS
    // =====================================================================

    // Render Canva subsections navigation
    const renderCanvaSubsections = () => {
        const canvaSubsectionTabs = [
            { key: 'overview', label: 'Übersicht' },
            ...(canvaConnected ? [
                { key: 'vorlagen', label: 'Vorlagen' },
                { key: 'assets', label: 'Assets' }
            ] : [])
        ];

        const logoConfig = canvaUtils.getCanvaLogoConfig('medium', 'subtab') as CanvaLogoConfig;

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
                        className={`groups-vertical-tab ${currentSubsection === 'overview' ? 'active' : ''}`}
                        onClick={() => handleSubsectionClick('overview')}
                        role="tab"
                        aria-selected={currentSubsection === 'overview'}
                        aria-controls="canva-overview-panel"
                        id="canva-overview-tab"
                    >
                        Übersicht
                    </button>
                    {canvaConnected && (
                        <>
                            <button
                                className={`groups-vertical-tab ${currentSubsection === 'vorlagen' ? 'active' : ''}`}
                                onClick={() => handleSubsectionClick('vorlagen')}
                                role="tab"
                                aria-selected={currentSubsection === 'vorlagen'}
                                aria-controls="canva-vorlagen-panel"
                                id="canva-vorlagen-tab"
                            >
                                Vorlagen
                            </button>
                            <button
                                className={`groups-vertical-tab ${currentSubsection === 'assets' ? 'active' : ''}`}
                                onClick={() => handleSubsectionClick('assets')}
                                role="tab"
                                aria-selected={currentSubsection === 'assets'}
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
                onNavigateToSubtab={(subsection) => handleSubsectionClick(subsection)}
            />
        </div>
    );

    // Render Canva Login Required message for unauthenticated users
    const renderCanvaLoginRequired = (featureName: string) => (
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
                            const currentPath = getCurrentPath(location);
                            const loginUrl = buildLoginUrl(currentPath);
                            navigate(loginUrl);
                        }}
                        className="btn-primary"
                    >
                        <span className="login-icon">👤</span> Anmelden
                    </button>
                    <button
                        onClick={() => handleSubsectionClick('overview')}
                        className="btn-secondary"
                        style={{ marginLeft: 'var(--spacing-small)' }}
                    >
                        Zur Übersicht
                    </button>
                </div>
            </div>
        </ProfileCard>
    );

    // Memoized values for vorlagen section
    const emptyStateConfig = useMemo(() =>
        canvaConnected ? EMPTY_STATE_CONNECTED : EMPTY_STATE_DISCONNECTED,
    [canvaConnected]);

    const combinedVorlagenItems = useMemo(() =>
        [...typedTemplates, ...canvaDesigns].map(item => ({ ...item, id: item.id || '' })),
    [typedTemplates, canvaDesigns]);

    const vorlagenTitle = useMemo(() =>
        `Meine Vorlagen (${typedTemplates.length + canvaDesigns.length})`,
    [typedTemplates.length, canvaDesigns.length]);

    const searchPlaceholder = useMemo(() =>
        canvaConnected ? "Alle Vorlagen und Canva-Designs durchsuchen..." : "Vorlagen durchsuchen...",
    [canvaConnected]);

    // Memoized handlers for DocumentOverview to prevent inline function recreation
    const handleVorlagenFetch = useCallback(() => {
        templatesQuery.refetch();
        if (canvaConnected) {
            getCanvaState().fetchDesigns(true);
        }
    }, [templatesQuery, canvaConnected, getCanvaState]);

    const handleVorlagenDelete = useCallback(async (id: string) => {
        await handleDeleteTemplate(id);
    }, [handleDeleteTemplate]);

    const handleVorlagenBulkDelete = useCallback(async (ids: string[]) => {
        await handleBulkDeleteTemplates(ids);
    }, [handleBulkDeleteTemplates]);

    const handleVorlagenEdit = useCallback((item: unknown) => {
        handleEditTemplate(item as unknown as CanvaTemplate);
    }, [handleEditTemplate]);

    const handleVorlagenShare = useCallback((item: unknown) => {
        createShareAction('database')(item);
    }, [createShareAction]);

    const handleVorlagenActionItems = useCallback((item: unknown) => {
        return getCanvaTemplateActionItems(item as unknown as CanvaTemplate);
    }, [getCanvaTemplateActionItems]);

    const handleVorlagenMetaRender = useCallback((item: unknown) => {
        return renderTemplateMetadata(item as unknown as CanvaTemplate);
    }, [renderTemplateMetadata]);

    const handleSyncWithCanva = useCallback(async () => {
        await Promise.all([
            getCanvaState().refreshDesigns(),
            templatesQuery.refetch()
        ]);
    }, [getCanvaState, templatesQuery]);

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
                    items={combinedVorlagenItems}
                    loading={templatesLoading || fetchingCanvaDesigns}
                    onFetch={handleVorlagenFetch}
                    onDelete={handleVorlagenDelete}
                    onBulkDelete={handleVorlagenBulkDelete}
                    onUpdateTitle={handleTemplateTitleUpdate}
                    onEdit={handleVorlagenEdit}
                    onShare={handleVorlagenShare}
                    actionItems={handleVorlagenActionItems}
                    documentTypes={{}}
                    metaRenderer={handleVorlagenMetaRender}
                    emptyStateConfig={emptyStateConfig}
                    searchPlaceholder={searchPlaceholder}
                    title={vorlagenTitle}
                    onSuccessMessage={onSuccessMessage}
                    onErrorMessage={onErrorMessage}
                    headerActions={
                        <div style={{ display: 'flex', gap: 'var(--spacing-small)' }}>
                            {canvaConnected ? (
                                <button
                                    type="button"
                                    className="btn-secondary size-s"
                                    onClick={handleSyncWithCanva}
                                    aria-label="Mit Canva synchronisieren"
                                    disabled={fetchingCanvaDesigns || canvaLoading}
                                    title="Aktuelle Designs von Canva laden"
                                >
                                    <HiRefresh className="icon" />
                                    Sync mit Canva
                                </button>
                            ) : (
                                <CanvaButton
                                    onClick={handleCanvaLogin}
                                    loading={canvaLoading}
                                    size="small"
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
                    onNavigateToOverview={() => handleSubsectionClick('overview')}
                />
            </div>
        );
    };

    // Render main content based on current subsection
    const renderMainContent = () => {
        if (currentSubsection === 'overview') {
            return renderCanvaOverviewContent();
        }
        if (currentSubsection === 'vorlagen') {
            return renderCanvaVorlagenContent();
        }
        if (currentSubsection === 'assets') {
            return renderCanvaAssetsContent();
        }

        return <div>Content not found</div>;
    };

    return (
        <div className="canva-integration-section">
            {renderCanvaSubsections()}
            {renderMainContent()}
        </div>
    );
});

CanvaSection.displayName = 'CanvaSection';

export default CanvaSection;
