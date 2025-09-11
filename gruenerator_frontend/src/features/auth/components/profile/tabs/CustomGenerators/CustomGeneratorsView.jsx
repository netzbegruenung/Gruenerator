import React, { useState, useCallback } from 'react';
import { motion } from "motion/react";
import { useNavigate } from 'react-router-dom';

// Common components
import DropdownButton from '../../../../../../components/common/DropdownButton';

// Section components (to be created)
import GeneratorsSection from './components/GeneratorsSection';
import NotebooksSection from './components/NotebooksSection';
import GeneratorDetail from './components/GeneratorDetail';
import NotebookDetail from './components/NotebookDetail';
import GeneratorCreator from './components/GeneratorCreator';
import NotebookCreator from './components/NotebookCreator';

// Hooks
import { useMessageHandling } from '../../../../../../hooks/useMessageHandling';
import { useBetaFeatures } from '../../../../../../hooks/useBetaFeatures';
import { useOptimizedAuth } from '../../../../../../hooks/useAuth';
import { 
    useCustomGeneratorsData,
    useCustomGeneratorsMutations,
    useAvailableDocuments, 
    useQACollections, 
    QUERY_KEYS 
} from '../../../../hooks/useProfileData';
import { useProfileStore } from '../../../../../../stores/profileStore';
import { useQueryClient } from '@tanstack/react-query';

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
    const isQAEnabled = canAccessBetaFeature('qa');
    
    // Message handling
    const { clearMessages } = useMessageHandling(onSuccessMessage, onErrorMessage);
    
    // State management
    const [selectedGeneratorId, setSelectedGeneratorId] = useState(initialGeneratorId);
    const [selectedQAId, setSelectedQAId] = useState(initialQAId);
    const [view, setView] = useState(initialTab);
    
    // View-only navigation; no separate tab controller

    // Data hooks (server state) + store (UI state). Use store as single source for UI.
    const generatorsData = useCustomGeneratorsData({ isActive });
    const generatorMutations = useCustomGeneratorsMutations();
    const generators = useProfileStore(state => state.customGenerators) || [];
    
    const qaQuery = useQACollections({ isActive: isActive && isQAEnabled });
    const qaCollections = useProfileStore(state => state.qaCollections) || [];
    
    const availableDocuments = useAvailableDocuments();

    // Remove debug logging

    // No auto-switching; stay on the selected initial view until user changes it
    
    // Navigation handlers
    const handleGeneratorSelect = useCallback((generatorId) => {
        setSelectedGeneratorId(generatorId);
        setSelectedQAId(null);
        setView('generator-detail');
        clearMessages();
    }, [clearMessages]);
    
    const handleNotebookSelect = useCallback((qaId) => {
        setSelectedQAId(qaId);
        setSelectedGeneratorId(null);
        setView('notebook-detail');
        clearMessages();
    }, [clearMessages]);
    
    const handleCreateGenerator = useCallback(() => {
        setView('create-generator');
        setSelectedGeneratorId(null);
        setSelectedQAId(null);
        clearMessages();
    }, [clearMessages]);
    
    const handleCreateNotebook = useCallback(() => {
        setView('create-notebook');
        setSelectedGeneratorId(null);
        setSelectedQAId(null);
        clearMessages();
    }, [clearMessages]);
    
    const handleBackToOverview = useCallback(() => {
        setView('overview');
        setSelectedGeneratorId(null);
        setSelectedQAId(null);
        clearMessages();
    }, [clearMessages]);
    
    const handleBackToGenerators = useCallback(() => {
        setView('generators');
        setSelectedGeneratorId(null);
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
        } catch (_) { /* noop */ }
        setView('generators');
    }, [queryClient, authUser?.id, onSuccessMessage]);
    
    const handleNotebookCreated = useCallback(() => {
        setView('notebooks');
        onSuccessMessage('Notebook erfolgreich erstellt.');
    }, [onSuccessMessage]);
    
    // QA navigation handler
    const handleViewQA = useCallback((qaId) => {
        navigate(`/qa/${qaId}`);
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
                                        Meine Custom Grüneratoren
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
                                        Custom Grüneratoren{isQAEnabled ? ' und Notebooks' : ''} nach deinen Vorstellungen.
                                    </p>
                                </section>
                                {(!generators || generators.length === 0) && (!isQAEnabled || !qaCollections || qaCollections.length === 0) && (
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
            
            case 'generators':
                return (
                    <GeneratorsSection
                        isActive={isActive}
                        onSuccessMessage={onSuccessMessage}
                        onErrorMessage={onErrorMessage}
                        onGeneratorSelect={handleGeneratorSelect}
                        generators={generators}
                        query={generatorsData.query}
                        deleteGenerator={generatorMutations.deleteGenerator}
                        isDeleting={generatorMutations.isDeleting}
                        deleteError={generatorMutations.deleteError}
                    />
                );
            
            case 'notebooks':
                if (!isQAEnabled) return <div>Feature nicht verfügbar</div>;
                return (
                    <NotebooksSection
                        isActive={isActive}
                        onSuccessMessage={onSuccessMessage}
                        onErrorMessage={onErrorMessage}
                        onNotebookSelect={handleNotebookSelect}
                        qaCollections={qaCollections}
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
                        onBack={handleBackToGenerators}
                        generators={generators}
                        availableDocuments={availableDocuments.data}
                        // Pass mutations to avoid running the data hook twice
                        updateGenerator={generatorMutations.updateGenerator}
                        deleteGenerator={generatorMutations.deleteGenerator}
                        isUpdating={generatorMutations.isUpdating}
                        isDeleting={generatorMutations.isDeleting}
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
                        qaCollections={qaCollections}
                        qaQuery={qaQuery}
                        availableDocuments={availableDocuments.data}
                    />
                );
            
            case 'create-generator':
                return (
                    <GeneratorCreator
                        onCompleted={handleGeneratorCreated}
                        onCancel={handleBackToGenerators}
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

                    {Array.isArray(qaCollections) && qaCollections.length > 0 && (
                        <>
                            {qaCollections.map((qa) => (
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

                    <div className="create-new-options">
                        <DropdownButton
                            onCreateNotebook={handleCreateNotebook}
                            onCreateCustomGenerator={handleCreateGenerator}
                            showNotebook={isQAEnabled}
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
