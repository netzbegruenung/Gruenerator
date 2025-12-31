import React, { useState, useCallback, useEffect } from 'react';
import { motion } from "motion/react";
import { useNavigate } from 'react-router-dom';

// Common components
import DropdownButton from '../../../../../../components/common/DropdownButton';

// Section components
import NotebooksSection from './components/NotebooksSection';
import GeneratorDetail from './components/GeneratorDetail';
import NotebookDetail from './components/NotebookDetail';
import GeneratorCreator from './components/GeneratorCreator';
import NotebookCreator from './components/NotebookCreator';
import SiteCreator from './components/Site/components/SiteCreator';
import SiteEditor from './components/Site/components/SiteEditor';
import SitePreview from './components/Site/components/SitePreview';

// Hooks
import { useMessageHandling } from '../../../../../../hooks/useMessageHandling';
import { useBetaFeatures } from '../../../../../../hooks/useBetaFeatures';
import { useOptimizedAuth } from '../../../../../../hooks/useAuth';
import {
    useCustomGeneratorsData,
    useCustomGeneratorsMutations,
    useAvailableDocuments,
    useNotebookCollections,
    useSavedGenerators,
    QUERY_KEYS
} from '../../../../hooks/useProfileData';
import { useProfileStore } from '../../../../../../stores/profileStore';
import { useQueryClient } from '@tanstack/react-query';
import apiClient from '../../../../../../components/utils/apiClient';

// Styles for generator/notebook list buttons
import '../../../../../generators/styles/custom-generators-tab.css';

const CustomGeneratorsView = ({ 
    isActive, 
    onSuccessMessage, 
    onErrorMessage,
    initialTab = 'overview',
    initialGeneratorId = null,
    initialQAId = null,
    onTabChange
}) => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    
    // Auth and beta features
    const { user: authUser } = useOptimizedAuth();
    const { canAccessBetaFeature } = useBetaFeatures();
    const isQAEnabled = canAccessBetaFeature('notebook');
    const isSitesEnabled = canAccessBetaFeature('sites');
    
    // Message handling
    const { clearMessages } = useMessageHandling(onSuccessMessage, onErrorMessage);
    
    // State management
    const [selectedGeneratorId, setSelectedGeneratorId] = useState(initialGeneratorId);
    const [selectedSavedGeneratorId, setSelectedSavedGeneratorId] = useState(null);
    const [selectedQAId, setSelectedQAId] = useState(initialQAId);
    const [view, setView] = useState(initialTab);
    const [site, setSite] = useState(null);
    const [siteLoading, setSiteLoading] = useState(false);
    
    // View-only navigation; no separate tab controller

    // Data hooks (server state) + store (UI state). Use store as single source for UI.
    const generatorsData = useCustomGeneratorsData({ isActive });
    const generatorMutations = useCustomGeneratorsMutations();
    const generators = useProfileStore(state => state.customGenerators) || [];

    // Saved generators (from other users)
    const savedGeneratorsHook = useSavedGenerators({ isActive });
    const savedGenerators = useProfileStore(state => state.savedGenerators) || [];

    const qaQuery = useNotebookCollections({ isActive: isActive && isQAEnabled });
    const notebookCollections = useProfileStore(state => state.notebookCollections) || [];

    const availableDocuments = useAvailableDocuments();

    // Fetch site data
    const fetchSite = useCallback(async () => {
        try {
            setSiteLoading(true);
            const response = await apiClient.get('/sites/my-site');
            if (response.data.site) {
                setSite(response.data.site);
            } else {
                setSite(null);
            }
        } catch (err) {
            console.error('[CustomGenerators] Error fetching site:', err);
            setSite(null);
        } finally {
            setSiteLoading(false);
        }
    }, []);

    // Fetch site on mount if active and sites are enabled
    useEffect(() => {
        if (isActive && isSitesEnabled) {
            fetchSite();
        }
    }, [isActive, isSitesEnabled, fetchSite]);
    
    // Navigation handlers
    const handleGeneratorSelect = useCallback((generatorId) => {
        setSelectedGeneratorId(generatorId);
        setSelectedSavedGeneratorId(null);
        setSelectedQAId(null);
        setView('generator-detail');
        clearMessages();
    }, [clearMessages]);

    const handleSavedGeneratorSelect = useCallback((generatorId) => {
        setSelectedSavedGeneratorId(generatorId);
        setSelectedGeneratorId(null);
        setSelectedQAId(null);
        setView('saved-generator-detail');
        clearMessages();
    }, [clearMessages]);
    
    const handleNotebookSelect = useCallback((qaId) => {
        setSelectedQAId(qaId);
        setSelectedGeneratorId(null);
        setSelectedSavedGeneratorId(null);
        setView('notebook-detail');
        clearMessages();
    }, [clearMessages]);

    const handleCreateGenerator = useCallback(() => {
        setView('create-generator');
        setSelectedGeneratorId(null);
        setSelectedSavedGeneratorId(null);
        setSelectedQAId(null);
        clearMessages();
    }, [clearMessages]);

    const handleCreateNotebook = useCallback(() => {
        setView('create-notebook');
        setSelectedGeneratorId(null);
        setSelectedSavedGeneratorId(null);
        setSelectedQAId(null);
        clearMessages();
    }, [clearMessages]);

    const handleSiteView = useCallback(() => {
        setView('site-view');
        setSelectedGeneratorId(null);
        setSelectedSavedGeneratorId(null);
        setSelectedQAId(null);
        clearMessages();
    }, [clearMessages]);

    const handleCreateSite = useCallback(() => {
        setView('create-site');
        setSelectedGeneratorId(null);
        setSelectedSavedGeneratorId(null);
        setSelectedQAId(null);
        clearMessages();
    }, [clearMessages]);

    const handleEditSite = useCallback(() => {
        setView('edit-site');
        setSelectedGeneratorId(null);
        setSelectedSavedGeneratorId(null);
        setSelectedQAId(null);
        clearMessages();
    }, [clearMessages]);

    const handleBackToOverview = useCallback(() => {
        setView('overview');
        setSelectedGeneratorId(null);
        setSelectedSavedGeneratorId(null);
        setSelectedQAId(null);
        clearMessages();
    }, [clearMessages]);

    const handleBackToOverviewFromGenerator = useCallback(() => {
        setView('overview');
        setSelectedGeneratorId(null);
        setSelectedSavedGeneratorId(null);
        clearMessages();
    }, [clearMessages]);

    const handleBackToNotebooks = useCallback(() => {
        setView('notebooks');
        setSelectedQAId(null);
        clearMessages();
    }, [clearMessages]);
    
    // Success handlers
    const handleGeneratorCreated = useCallback(async ({ name, slug }) => {
        try {
            await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.customGenerators(authUser?.id) });
            onSuccessMessage(`Custom Grünerator "${name}" erstellt.`);
            // Find the newly created generator by slug and navigate to its detail view
            const updatedGenerators = queryClient.getQueryData(QUERY_KEYS.customGenerators(authUser?.id));
            const newGenerator = updatedGenerators?.find(g => g.slug === slug);
            if (newGenerator) {
                setSelectedGeneratorId(newGenerator.id);
                setView('generator-detail');
            } else {
                setView('overview');
            }
        } catch (_) {
            setView('overview');
        }
    }, [queryClient, authUser?.id, onSuccessMessage]);
    
    const handleNotebookCreated = useCallback(({ id, name }) => {
        if (id) {
            setSelectedQAId(id);
            setView('notebook-detail');
        } else {
            setView('notebooks');
        }
    }, []);

    const handleSiteCreated = useCallback(async (siteData) => {
        try {
            const response = await apiClient.post('/sites/create', siteData);
            setSite(response.data.site);
            setView('site-view');
            onSuccessMessage('Site erfolgreich erstellt!');
        } catch (err) {
            onErrorMessage(err.response?.data?.error || 'Fehler beim Erstellen der Site');
            throw err;
        }
    }, [onSuccessMessage, onErrorMessage]);

    const handleSiteUpdated = useCallback(async (siteData) => {
        try {
            const response = await apiClient.put(`/sites/${site.id}`, siteData);
            setSite(response.data.site);
            setView('site-view');
            onSuccessMessage('Site erfolgreich aktualisiert!');
        } catch (err) {
            onErrorMessage(err.response?.data?.error || 'Fehler beim Aktualisieren der Site');
            throw err;
        }
    }, [site, onSuccessMessage, onErrorMessage]);

    const handlePublish = useCallback(async () => {
        try {
            const response = await apiClient.post(`/sites/${site.id}/publish`, {
                publish: !site.is_published
            });
            setSite(response.data.site);
            onSuccessMessage(response.data.site.is_published ? 'Site veröffentlicht!' : 'Site unveröffentlicht');
        } catch (err) {
            onErrorMessage('Fehler beim Veröffentlichen der Site');
        }
    }, [site, onSuccessMessage, onErrorMessage]);
    
    // QA navigation handler
    const handleViewQA = useCallback((qaId) => {
        navigate(`/notebook/${qaId}`);
    }, [navigate]);
    
    // Render content based on current view
    const renderMainContent = () => {
        switch (view) {
            case 'overview':
                return (
                    <div className="profile-content-card">
                        <div className="profile-info-panel">
                            <div className="profile-header-section">
                                <div className="group-title-area">
                                    <h2 className="profile-user-name large-profile-title">
                                        Meine Grüneratoren (Open Beta)
                                    </h2>
                                </div>
                            </div>
                            <div className="group-overview-content">
                                <section className="group-overview-section">
                                    <p>
                                        Hier findest du alle von dir erstellten benutzerdefinierten Grüneratoren
                                        {isQAEnabled ? ' und Notebooks' : ''}. Du kannst neue Grüneratoren erstellen,
                                        bestehende ansehen und sie direkt nutzen.
                                        {isQAEnabled ? ' Zusätzlich kannst du intelligente Notebook-Systeme basierend auf deinen Dokumenten erstellen.' : ''}
                                    </p>
                                    <p>
                                        Wähle oben einen Tab, um deine Inhalte zu verwalten, oder erstelle neue
                                        Custom Grüneratoren{isQAEnabled ? ' oder Notebooks' : ''} nach deinen Vorstellungen.
                                    </p>
                                </section>
                                {(!generators || generators.length === 0) && (!isQAEnabled || !notebookCollections || notebookCollections.length === 0) && (
                                    <section className="group-overview-section">
                                        <p>
                                            Du hast noch keine eigenen Grüneratoren{isQAEnabled ? ' oder Notebooks' : ''} erstellt.
                                            Nutze die Tabs oben, um deine ersten Inhalte zu erstellen!
                                        </p>
                                    </section>
                                )}
                            </div>
                        </div>
                    </div>
                );
            
            case 'notebooks':
                if (!isQAEnabled) return <div>Feature nicht verfügbar</div>;
                return (
                    <NotebooksSection
                        isActive={isActive}
                        onSuccessMessage={onSuccessMessage}
                        onErrorMessage={onErrorMessage}
                        onNotebookSelect={handleNotebookSelect}
                        notebookCollections={notebookCollections}
                        qaQuery={qaQuery}
                    />
                );
            
            case 'generator-detail':
                return (
                    <GeneratorDetail
                        isActive={isActive}
                        onSuccessMessage={onSuccessMessage}
                        onErrorMessage={onErrorMessage}
                        generatorId={selectedGeneratorId}
                        onBack={handleBackToOverviewFromGenerator}
                        generators={generators}
                        availableDocuments={availableDocuments.data}
                        updateGenerator={generatorMutations.updateGenerator}
                        deleteGenerator={generatorMutations.deleteGenerator}
                        isUpdating={generatorMutations.isUpdating}
                        isDeleting={generatorMutations.isDeleting}
                    />
                );

            case 'saved-generator-detail':
                return (
                    <GeneratorDetail
                        isActive={isActive}
                        onSuccessMessage={onSuccessMessage}
                        onErrorMessage={onErrorMessage}
                        generatorId={selectedSavedGeneratorId}
                        onBack={handleBackToOverviewFromGenerator}
                        generators={savedGenerators}
                        availableDocuments={[]}
                        isSavedGenerator={true}
                        unsaveGenerator={savedGeneratorsHook.unsaveGenerator}
                        isUnsaving={savedGeneratorsHook.isUnsaving}
                    />
                );

            case 'notebook-detail':
                if (!isQAEnabled) return <div>Feature nicht verfügbar</div>;
                return (
                    <NotebookDetail
                        isActive={isActive}
                        onSuccessMessage={onSuccessMessage}
                        onErrorMessage={onErrorMessage}
                        qaId={selectedQAId}
                        onBack={handleBackToNotebooks}
                        onViewQA={handleViewQA}
                        notebookCollections={notebookCollections}
                        qaQuery={qaQuery}
                        availableDocuments={availableDocuments.data}
                    />
                );
            
            case 'create-generator':
                return (
                    <GeneratorCreator
                        onCompleted={handleGeneratorCreated}
                        onCancel={handleBackToOverview}
                        onSuccessMessage={onSuccessMessage}
                        onErrorMessage={onErrorMessage}
                    />
                );
            
            case 'create-notebook':
                if (!isQAEnabled) return <div>Feature nicht verfügbar</div>;
                return (
                    <NotebookCreator
                        onCompleted={handleNotebookCreated}
                        onCancel={handleBackToNotebooks}
                        onSuccessMessage={onSuccessMessage}
                        onErrorMessage={onErrorMessage}
                        availableDocuments={availableDocuments.data}
                    />
                );

            case 'site-view':
                return (
                    <div className="profile-content-card">
                        <div className="profile-info-panel">
                            <SitePreview
                                site={site}
                                onEdit={handleEditSite}
                                onPublish={handlePublish}
                            />
                        </div>
                    </div>
                );

            case 'create-site':
                return (
                    <div className="profile-content-card">
                        <div className="profile-info-panel">
                            <div className="profile-header-section">
                                <div className="group-title-area">
                                    <h2 className="profile-user-name large-profile-title">
                                        Neue Site erstellen
                                    </h2>
                                </div>
                            </div>
                            <SiteCreator
                                onSubmit={handleSiteCreated}
                                onCancel={handleSiteView}
                            />
                        </div>
                    </div>
                );

            case 'edit-site':
                return (
                    <div className="profile-content-card">
                        <div className="profile-info-panel">
                            <div className="profile-header-section">
                                <div className="group-title-area">
                                    <h2 className="profile-user-name large-profile-title">
                                        Site bearbeiten
                                    </h2>
                                </div>
                            </div>
                            <SiteEditor
                                site={site}
                                onSubmit={handleSiteUpdated}
                                onCancel={handleSiteView}
                            />
                        </div>
                    </div>
                );

            default:
                return <div>Content nicht gefunden</div>;
        }
    };
    
    return (
        <motion.div 
            className="profile-content profile-management-layout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            <div className="profile-navigation-panel">
                <h2 className="profile-section-header">Meine Grüneratoren</h2>
                <nav className="profile-vertical-navigation" role="tablist" aria-label="Custom Generators Navigation" aria-orientation="vertical">
                    <button
                        className={`profile-vertical-tab ${view === 'overview' ? 'active' : ''}`}
                        onClick={() => { setView('overview'); setSelectedGeneratorId(null); setSelectedQAId(null); clearMessages(); }}
                        role="tab"
                        aria-selected={view === 'overview'}
                        aria-controls={`overview-panel`}
                        id={`overview-tab`}
                    >
                        Übersicht
                    </button>

                    {Array.isArray(generators) && generators.length > 0 && (
                        <>
                            {generators.map((generator) => (
                                <button
                                    key={generator.id}
                                    className={`profile-vertical-tab generator-tab ${selectedGeneratorId === generator.id && (view === 'generator-detail') ? 'active' : ''}`}
                                    onClick={() => handleGeneratorSelect(generator.id)}
                                    role="tab"
                                    aria-selected={selectedGeneratorId === generator.id && (view === 'generator-detail')}
                                    aria-controls={`generator-${generator.id}-panel`}
                                    id={`generator-${generator.id}-tab`}
                                    aria-label={`Custom Grünerator ${generator.title || generator.name}`}
                                >
                                    <span>{generator.title || generator.name}</span>
                                </button>
                            ))}
                        </>
                    )}

                    {Array.isArray(savedGenerators) && savedGenerators.length > 0 && (
                        <>
                            {savedGenerators.map((generator) => {
                                const ownerName = generator.owner_first_name
                                    ? `${generator.owner_first_name} ${generator.owner_last_name || ''}`.trim()
                                    : generator.owner_email || 'Unbekannt';
                                return (
                                    <button
                                        key={`saved-${generator.id}`}
                                        className={`profile-vertical-tab saved-generator-tab ${selectedSavedGeneratorId === generator.id && (view === 'saved-generator-detail') ? 'active' : ''}`}
                                        onClick={() => handleSavedGeneratorSelect(generator.id)}
                                        role="tab"
                                        aria-selected={selectedSavedGeneratorId === generator.id && (view === 'saved-generator-detail')}
                                        aria-controls={`saved-generator-${generator.id}-panel`}
                                        id={`saved-generator-${generator.id}-tab`}
                                        aria-label={`Gespeicherter Grünerator ${generator.title || generator.name} von ${ownerName}`}
                                        title={`Von ${ownerName}`}
                                    >
                                        <span>{generator.title || generator.name}</span>
                                        <small className="saved-generator-owner">von {ownerName}</small>
                                    </button>
                                );
                            })}
                        </>
                    )}

                    {Array.isArray(notebookCollections) && notebookCollections.length > 0 && (
                        <>
                            {notebookCollections.map((qa) => (
                                <button
                                    key={qa.id}
                                    className={`profile-vertical-tab qa-tab ${selectedQAId === qa.id && (view === 'notebook-detail') ? 'active' : ''}`}
                                    onClick={() => handleNotebookSelect(qa.id)}
                                    role="tab"
                                    aria-selected={selectedQAId === qa.id && (view === 'notebook-detail')}
                                    aria-controls={`qa-${qa.id}-panel`}
                                    id={`qa-${qa.id}-tab`}
                                    aria-label={`Notebook ${qa.name}`}
                                >
                                    <span>{qa.name}</span>
                                </button>
                            ))}
                        </>
                    )}

                    {isSitesEnabled && site && (
                        <button
                            className={`profile-vertical-tab site-tab ${view === 'site-view' || view === 'edit-site' ? 'active' : ''}`}
                            onClick={handleSiteView}
                            role="tab"
                            aria-selected={view === 'site-view' || view === 'edit-site'}
                            aria-controls="site-panel"
                            id="site-tab"
                            aria-label={`Site ${site.site_title || site.subdomain}`}
                        >
                            <span>{site.site_title || site.subdomain}</span>
                        </button>
                    )}

                    <div className="create-new-options">
                        <DropdownButton
                            onCreateNotebook={handleCreateNotebook}
                            onCreateCustomGenerator={handleCreateGenerator}
                            onCreateSite={site ? null : handleCreateSite}
                            showNotebook={isQAEnabled}
                            showSite={isSitesEnabled && !site}
                            variant="navigation"
                        />
                    </div>
                </nav>
            </div>
            <div className="profile-content-panel profile-form-section">
                {renderMainContent()}
            </div>
        </motion.div>
    );
};

export default CustomGeneratorsView;
