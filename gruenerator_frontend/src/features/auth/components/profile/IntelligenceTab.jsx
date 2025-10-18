import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useForm, FormProvider, useFieldArray } from 'react-hook-form';
import { HiOutlineTrash, HiPlus, HiRefresh, HiInformationCircle, HiTrash, HiChip } from 'react-icons/hi';
import { motion } from "motion/react";

// Common components
import Spinner from '../../../../components/common/Spinner';
import ProfileCard from '../../../../components/common/ProfileCard';
import EmptyState from '../../../../components/common/EmptyState';
import TabNavigation from '../../../../components/common/TabNavigation';
import HelpTooltip from '../../../../components/common/HelpTooltip';
import FeatureToggle from '../../../../components/common/FeatureToggle';

// Hooks
import { useAutosave } from '../../../../hooks/useAutosave';
import { useFormFields } from '../../../../components/common/Form/hooks';
import { useTabNavigation } from '../../../../hooks/useTabNavigation';
import { useMessageHandling } from '../../../../hooks/useMessageHandling';
import { useAnweisungenWissen } from '../../hooks/useProfileData';
import { useOptimizedAuth } from '../../../../hooks/useAuth';
import { useAuthStore } from '../../../../stores/authStore';
import { useBetaFeatures } from '../../../../hooks/useBetaFeatures';
import { useTabIndex } from '../../../../hooks/useTabIndex';
import { useVerticalTabNavigation, useModalFocus } from '../../../../hooks/useKeyboardNavigation';


// Constants
import { 
    MAX_CONTENT_LENGTH, 
    AUTH_BASE_URL, 
    INTELLIGENCE_TABS, 
    ERROR_MESSAGES, 
    SUCCESS_MESSAGES,
    VALIDATION_RULES 
} from '../../../../constants/profileConstants';

// Utils
import { announceToScreenReader, createInlineEditorFocus } from '../../../../utils/focusManagement';

const IntelligenceTab = ({ isActive, onSuccessMessage, onErrorMessage }) => {
    const memoryFormRef = useRef(null);
    const memoryInputRef = useRef(null);
    
    // Tab index configuration
    const tabIndex = useTabIndex('PROFILE_INTELLIGENCE');

    // Beta features
    const { getBetaFeatureState } = useBetaFeatures();
    const isMemoryEnabled = getBetaFeatureState('memory');

    // Available tabs based on features
    const availableTabs = [
        ...INTELLIGENCE_TABS.filter(tab => tab.key !== 'wissen'), // Temporarily hide wissen tab
        ...(isMemoryEnabled ? [{ key: 'mem0ry', label: 'Memory' }] : [])
    ];

    // Tab navigation
    const { currentTab: currentView, handleTabClick, setCurrentTab } = useTabNavigation(
        'anweisungen', 
        availableTabs,
        () => clearMessages() // Clear messages when tab changes
    );

    // Message handling
    const { clearMessages, showSuccess, showError } = useMessageHandling(onSuccessMessage, onErrorMessage);

    // Check if user is on mem0ry tab but memory feature is not enabled - redirect to anweisungen
    useEffect(() => {
        if (currentView === 'mem0ry' && !isMemoryEnabled) {
            setCurrentTab('anweisungen');
        }
    }, [currentView, isMemoryEnabled, setCurrentTab]);

    // Auth and memory state
    const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
    const { memoryEnabled, setMemoryEnabled } = useAuthStore();

    // Ref to track initialization
    const isInitialized = useRef(false);
    
    // React Query hook for data fetching and mutations
    const { query, saveChanges, deleteKnowledgeEntry, isSaving, isDeleting, deletingKnowledgeId, MAX_KNOWLEDGE_ENTRIES } = useAnweisungenWissen({ isActive });
    const { data, isError: isErrorQuery, error: errorQuery } = query;

    // Memory state
    const [memories, setMemories] = useState([]);
    const [loadingMemories, setLoadingMemories] = useState(false);
    const [memoryError, setMemoryError] = useState(null);
    const [addingMemory, setAddingMemory] = useState(false);
    const [newMemoryText, setNewMemoryText] = useState('');
    const [newMemoryTopic, setNewMemoryTopic] = useState('');
    const [showAddMemoryForm, setShowAddMemoryForm] = useState(false);

    // React Hook Form setup
    const formMethods = useForm({
        defaultValues: {
            customAntragPrompt: '',
            customSocialPrompt: '',
            customUniversalPrompt: '',
            customGruenejugendPrompt: '',
            customRedePrompt: '',
            customBuergeranfragenPrompt: '',
            knowledge: [],
        },
        mode: 'onChange'
    });

    const { control, getValues, reset, watch } = formMethods;
    const { fields, append, remove } = useFieldArray({ 
        control, 
        name: "knowledge",
        keyName: "key"
    });
    const { Input, Textarea } = useFormFields();

    // Track autosave enabled state - this needs to be dynamic
    const [autosaveEnabled, setAutosaveEnabled] = useState(false);

    // Auto-save using shared hook (moved before initialization to prevent "cannot access before initialization" error)
    const { resetTracking } = useAutosave({
        saveFunction: useCallback(async (changedFields) => {
            // Convert changed fields to the format expected by saveChanges
            const currentValues = getValues();
            const formData = {
                customAntragPrompt: changedFields.customAntragPrompt !== undefined ? changedFields.customAntragPrompt : currentValues.customAntragPrompt || '',
                customSocialPrompt: changedFields.customSocialPrompt !== undefined ? changedFields.customSocialPrompt : currentValues.customSocialPrompt || '',
                customUniversalPrompt: changedFields.customUniversalPrompt !== undefined ? changedFields.customUniversalPrompt : currentValues.customUniversalPrompt || '',
                customGruenejugendPrompt: changedFields.customGruenejugendPrompt !== undefined ? changedFields.customGruenejugendPrompt : currentValues.customGruenejugendPrompt || '',
                customRedePrompt: changedFields.customRedePrompt !== undefined ? changedFields.customRedePrompt : currentValues.customRedePrompt || '',
                customBuergeranfragenPrompt: changedFields.customBuergeranfragenPrompt !== undefined ? changedFields.customBuergeranfragenPrompt : currentValues.customBuergeranfragenPrompt || '',
                knowledge: changedFields.knowledge !== undefined ? changedFields.knowledge : currentValues.knowledge || []
            };

            try {
                const result = await saveChanges(formData);
                showSuccess('Änderungen wurden automatisch gespeichert');
                return result;
            } catch (error) {
                console.error('[IntelligenceTab] Save failed:', error);
                showError('Fehler beim automatischen Speichern: ' + error.message);
                throw error;
            }
        }, [saveChanges, getValues, showSuccess, showError]),
        formRef: { getValues, watch },
        enabled: autosaveEnabled,  // Use the state variable instead of computed value
        debounceMs: 2000,
        getFieldsToTrack: () => [
            'customAntragPrompt',
            'customSocialPrompt',
            'customUniversalPrompt',
            'customGruenejugendPrompt',
            'customRedePrompt',
            'customBuergeranfragenPrompt',
            'knowledge'
        ],
        onError: (error) => {
            showError('Fehler beim automatischen Speichern');
        }
    });

    // Initialize form when data loads (only once)
    useEffect(() => {
        if (!data || isInitialized.current) return;

        const formData = {
            customAntragPrompt: data.antragPrompt || '',
            customSocialPrompt: data.socialPrompt || '',
            customUniversalPrompt: data.universalPrompt || '',
            customGruenejugendPrompt: data.gruenejugendPrompt || '',
            customRedePrompt: data.redePrompt || '',
            customBuergeranfragenPrompt: data.buergeranfragenPrompt || '',
            knowledge: data.knowledge || []
        };

        reset(formData);
        isInitialized.current = true;

        // Enable autosave and reset tracking after initial form setup
        setTimeout(() => {
            setAutosaveEnabled(true);
            resetTracking();
        }, 100);
    }, [data, reset, resetTracking]);

    // Fetch memories when tab becomes active and user is authenticated
    useEffect(() => {
        if (isActive && currentView === 'mem0ry' && isAuthenticated && user?.id && !authLoading && memoryEnabled && isMemoryEnabled) {
            fetchMemories();
        }
    }, [isActive, currentView, isAuthenticated, user?.id, authLoading, memoryEnabled, isMemoryEnabled]);

    // Effect to clear messages when view changes or component becomes inactive
    useEffect(() => {
        clearMessages();
    }, [currentView, isActive, clearMessages]);

    const fetchMemories = async () => {
        if (!user?.id) {
            showError(ERROR_MESSAGES.AUTH_REQUIRED);
            return;
        }

        if (!memoryEnabled) {
            return;
        }

        setLoadingMemories(true);
        setMemoryError(null);
        
        try {
            const response = await fetch(`${AUTH_BASE_URL}/mem0/user/${user.id}`, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            // Ensure memories is always an array
            const memoriesArray = Array.isArray(data.memories) ? data.memories : [];
            setMemories(memoriesArray);
        } catch (err) {
            const errorMessage = err.message || ERROR_MESSAGES.UNKNOWN_ERROR;
            setMemoryError(errorMessage);
            showError(`${ERROR_MESSAGES.MEMORY_LOAD_ERROR}: ${errorMessage}`);
        } finally {
            setLoadingMemories(false);
        }
    };

    const refreshMemories = () => {
        fetchMemories();
    };

    const addMemory = async () => {
        if (!newMemoryText.trim()) {
            showError('Bitte gib einen Text ein');
            return;
        }

        setAddingMemory(true);
        try {
            const response = await fetch(`${AUTH_BASE_URL}/mem0/add-text`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: newMemoryText.trim(),
                    topic: newMemoryTopic.trim() || 'general'
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.success) {
                showSuccess(SUCCESS_MESSAGES.MEMORY_ADDED);
                setNewMemoryText('');
                setNewMemoryTopic('');
                setShowAddMemoryForm(false);
                fetchMemories();
            } else {
                showError(ERROR_MESSAGES.MEMORY_ADD_ERROR);
            }
        } catch (err) {
            const errorMessage = err.message || ERROR_MESSAGES.UNKNOWN_ERROR;
            showError(`${ERROR_MESSAGES.MEMORY_ADD_ERROR}: ${errorMessage}`);
        } finally {
            setAddingMemory(false);
        }
    };

    const deleteMemory = async (memoryId) => {
        try {
            const response = await fetch(`${AUTH_BASE_URL}/mem0/${memoryId}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.success) {
                showSuccess(SUCCESS_MESSAGES.MEMORY_DELETED);
                setMemories(prev => prev.filter(m => m.id !== memoryId));
            } else {
                showError(ERROR_MESSAGES.MEMORY_DELETE_ERROR);
            }
        } catch (err) {
            showError(`${ERROR_MESSAGES.MEMORY_DELETE_ERROR}: ${err.message}`);
        }
    };

    const deleteAllMemories = async () => {
        const memoriesCount = Array.isArray(memories) ? memories.length : 0;
        if (!window.confirm(`Wirklich alle ${memoriesCount} Memories löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden und alle deine gespeicherten persönlichen Informationen gehen verloren.`)) {
            return;
        }

        try {
            // Ensure memories is an array before mapping
            const memoriesArray = Array.isArray(memories) ? memories : [];
            const deletePromises = memoriesArray.map(memory => 
                fetch(`${AUTH_BASE_URL}/mem0/${memory.id}`, {
                    method: 'DELETE',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                })
            );

            await Promise.all(deletePromises);
            
            showSuccess('Alle Memories erfolgreich gelöscht');
            setMemories([]);
        } catch (err) {
            showError(`Fehler beim Löschen aller Memories: ${err.message}`);
        }
    };

    const handleDeleteKnowledge = async (entry, index) => {
        if (!entry.id || (typeof entry.id === 'string' && entry.id.startsWith('new-'))) {
            // Remove local entry immediately
            remove(index);
        } else {
            if (window.confirm("Möchtest du diesen Wissenseintrag wirklich löschen?")) {
                try {
                    await deleteKnowledgeEntry(entry.id);
                    // Optimistic update already handled in mutation
                    // Additional cleanup: remove from form array if still present
                    const currentFields = getValues('knowledge') || [];
                    const updatedFields = currentFields.filter(f => f.id !== entry.id);
                    reset({ 
                        ...getValues(), 
                        knowledge: updatedFields 
                    });
                    showSuccess('Wissenseintrag erfolgreich gelöscht');
                } catch (error) {
                    console.error('Error deleting knowledge entry:', error);
                    showError(`Fehler beim Löschen: ${error.message}`);
                }
            }
        }
    };

    const handleAddKnowledge = useCallback(() => {
        try {
            if (fields.length < MAX_KNOWLEDGE_ENTRIES) {
                const newEntry = { id: `new-${Date.now()}`, title: '', content: '' };
                append(newEntry);
                // Reset autosave tracking after adding new entry
                setTimeout(() => resetTracking(), 100);
            }
        } catch (error) {
            console.error('Error adding knowledge entry:', error);
            showError('Fehler beim Hinzufügen des Wissenseintrags');
        }
    }, [MAX_KNOWLEDGE_ENTRIES, append, resetTracking, showError]);

    const handleMemoryToggle = async () => {
        const newState = !memoryEnabled;
        
        try {
            await setMemoryEnabled(newState);
        } catch (error) {
            showError(`Fehler beim Speichern der Memory-Einstellungen: ${error.message}`);
        }
    };
    
    // Vertical tab navigation setup (for keyboard navigation)
    const verticalNavRef = useRef(null);
    const {
        registerItemRef,
        tabIndex: getTabIndex,
        ariaSelected
    } = useVerticalTabNavigation({
        items: availableTabs.map(t => t.key),
        activeItem: currentView,
        onItemSelect: handleTabClick,
        horizontal: false,
        containerRef: verticalNavRef
    });
    
    // Modal focus management for memory form
    useModalFocus({
        isOpen: showAddMemoryForm,
        modalRef: memoryFormRef,
        initialFocusRef: memoryInputRef
    });
    
    // Inline editor for text areas
    const { props: inlineEditorProps } = createInlineEditorFocus({
        onEnter: (event) => {
            // Let form handle saving
            event.preventDefault();
        },
        onEscape: (event) => {
            // Reset to last saved value
            if (lastSavedData.current && lastSavedData.current[event.target.name]) {
                event.target.value = lastSavedData.current[event.target.name];
            }
            event.target.blur();
        }
    });

    if (isErrorQuery) {
        return (
            <div className="auth-error-message error-message-container error-large-margin">
                Fehler beim Laden der Daten: {errorQuery.message}
            </div>
        );
    }


    return (
        <FormProvider {...formMethods}>
            <motion.div 
                className="profile-content profile-management-layout"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
            >
                <div className="profile-navigation-panel">
                    <div ref={verticalNavRef}>
                        <TabNavigation
                            tabs={availableTabs}
                            currentTab={currentView}
                            onTabClick={handleTabClick}
                            orientation="vertical"
                            getTabProps={(tabKey) => ({
                                ref: (ref) => registerItemRef(tabKey, ref),
                                tabIndex: getTabIndex(tabKey),
                                'aria-selected': ariaSelected(tabKey)
                            })}
                        />
                    </div>
                </div>
                <div className="profile-content-panel profile-form-section">
                    <div className="profile-content-card">
                        <div className="auth-form">
                            {currentView === 'anweisungen' && (
                                <div 
                                    role="tabpanel"
                                    id="anweisungen-panel"
                                    aria-labelledby="anweisungen-tab"
                                    tabIndex={-1}
                                    className="profile-cards-grid"
                                >
                                    <ProfileCard title="Anweisungen für Anträge">
                                        <Textarea
                                            name="customAntragPrompt"
                                            label="Persönliche Anweisungen:"
                                            placeholder="Gib hier deine Anweisungen für die Erstellung von Anträgen ein..."
                                            helpText="z.B. bevorzugter Stil, spezielle Formulierungen, politische Schwerpunkte"
                                            minRows={2}
                                            maxRows={8}
                                            control={control}
                                        />
                                    </ProfileCard>
                                    <ProfileCard title="Anweisungen für Presse & Social Media">
                                        <Textarea
                                            name="customSocialPrompt"
                                            label="Persönliche Anweisungen:"
                                            placeholder="Gib hier deine Anweisungen für die Erstellung von Presse- und Social Media-Inhalten ein..."
                                            helpText="z.B. Tonalität, Hashtag-Präferenzen, Zielgruppen-Ansprache"
                                            minRows={2}
                                            maxRows={8}
                                            control={control}
                                        />
                                    </ProfileCard>
                                    <ProfileCard title="Anweisungen für Universelle Texte">
                                        <Textarea
                                            name="customUniversalPrompt"
                                            label="Persönliche Anweisungen:"
                                            placeholder="Gib hier deine Anweisungen für die Erstellung von universellen Texten ein..."
                                            helpText="z.B. allgemeine Schreibweise, politische Grundhaltung, Formulierungspräferenzen"
                                            minRows={2}
                                            maxRows={8}
                                            control={control}
                                        />
                                    </ProfileCard>
                                    <ProfileCard title="Anweisungen für Reden">
                                        <Textarea
                                            name="customRedePrompt"
                                            label="Persönliche Anweisungen:"
                                            placeholder="Gib hier deine Anweisungen für die Erstellung von Reden ein..."
                                            helpText="z.B. bevorzugter Redestil, rhetorische Mittel, Ansprache der Zielgruppe"
                                            minRows={2}
                                            maxRows={8}
                                            control={control}
                                        />
                                    </ProfileCard>
                                    <ProfileCard title="Anweisungen für Bürger*innenanfragen">
                                        <Textarea
                                            name="customBuergeranfragenPrompt"
                                            label="Persönliche Anweisungen:"
                                            placeholder="Gib hier deine Anweisungen für die Beantwortung von Bürger*innenanfragen ein..."
                                            helpText="z.B. bevorzugte Tonalität, Detailgrad, Ansprechpartner-Informationen"
                                            minRows={2}
                                            maxRows={8}
                                            control={control}
                                        />
                                    </ProfileCard>
                                    <ProfileCard title="Anweisungen für Grüne Jugend">
                                        <Textarea
                                            name="customGruenejugendPrompt"
                                            label="Persönliche Anweisungen:"
                                            placeholder="Gib hier deine Anweisungen für die Erstellung von Grüne Jugend-Inhalten ein..."
                                            helpText="z.B. jugendgerechte Sprache, spezielle Themen, Aktivismus-Fokus"
                                            minRows={2}
                                            maxRows={8}
                                            control={control}
                                        />
                                    </ProfileCard>
                                </div>
                            )}

                            {/* Temporarily commented out - Wissen tab
                            {currentView === 'wissen' && (
                                <div
                                    role="tabpanel"
                                    id="wissen-panel"
                                    aria-labelledby="wissen-tab"
                                    tabIndex={-1}
                                >
                                <ProfileCard
                                    title="Persönliches Wissen"
                                    headerActions={
                                        <button
                                            type="button"
                                            className="btn-primary size-s"
                                            onClick={handleAddKnowledge}
                                            disabled={isSaving || (Array.isArray(fields) && fields.length >= MAX_KNOWLEDGE_ENTRIES)}
                                            tabIndex={tabIndex.addKnowledgeButton}
                                            aria-label="Neues Wissen hinzufügen"
                                        >
                                            <HiPlus className="icon" /> Wissen hinzufügen
                                        </button>
                                    }
                                >
                                        {(!Array.isArray(fields) || fields.length === 0) && (
                                            <EmptyState
                                                title="Du hast noch keine Wissensbausteine hinterlegt."
                                                description="Klicke auf 'Wissen hinzufügen', um wiederkehrende Informationen zu speichern."
                                            />
                                        )}

                                        {Array.isArray(fields) && fields.map((field, index) => (
                                            <div key={field.key} className={`knowledge-entry ${index > 0 ? 'knowledge-entry-bordered' : ''}`}>
                                                <div className="form-field-wrapper anweisungen-field">
                                                    <div className="anweisungen-header">
                                                        <label htmlFor={`knowledge.${index}.title`}>Wissen #{index + 1}: Titel</label>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteKnowledge(field, index)}
                                                            className="knowledge-delete-button icon-button danger"
                                                            disabled={isDeleting && deletingKnowledgeId === field.id}
                                                            aria-label={`Wissenseintrag ${index + 1} löschen`}
                                                            tabIndex={tabIndex.removeKnowledgeButton + index}
                                                        >
                                                            {(isDeleting && deletingKnowledgeId === field.id) ? <Spinner size="xsmall" /> : <HiOutlineTrash />}
                                                        </button>
                                                    </div>
                                                    <Input
                                                        name={`knowledge.${index}.title`}
                                                        type="text"
                                                        placeholder="Kurzer, prägnanter Titel (z.B. 'OV Musterstadt Vorstand')"
                                                        rules={VALIDATION_RULES.KNOWLEDGE_TITLE}
                                                        disabled={isDeleting}
                                                        control={control}
                                                    />
                                                </div>
                                                <div className="form-field-wrapper anweisungen-field">
                                                    <Textarea
                                                        name={`knowledge.${index}.content`}
                                                        label="Inhalt:"
                                                        placeholder="Füge hier den Wissensinhalt ein..."
                                                        minRows={2}
                                                        maxRows={8}
                                                        maxLength={MAX_CONTENT_LENGTH}
                                                        showCharacterCount={true}
                                                        disabled={isDeleting}
                                                        control={control}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                </ProfileCard>
                                </div>
                            )}
                            */}

                            {currentView === 'mem0ry' && isMemoryEnabled && (
                                <div 
                                    role="tabpanel"
                                    id="mem0ry-panel"
                                    aria-labelledby="mem0ry-tab"
                                    tabIndex={-1}
                                    className="profile-cards-grid"
                                >
                                    <ProfileCard 
                                        title="Memory-Einstellungen"
                                        headerActions={
                                            <HelpTooltip>
                                                <p>
                                                    Hier kannst du persönliche Informationen speichern, die das KI-System über dich wissen soll.
                                                </p>
                                                <p>
                                                    <strong>Tipp:</strong> Füge Informationen über deine Vorlieben, deinen Arbeitsbereich oder andere wichtige Details hinzu.
                                                </p>
                                            </HelpTooltip>
                                        }
                                    >
                                            <p className="group-description">
                                                Aktiviere die Memory-Personalisierung, um dass das KI-System deine gespeicherten Informationen beim Generieren von Inhalten berücksichtigt.
                                            </p>
                                            
                                            <FeatureToggle
                                                isActive={memoryEnabled}
                                                onToggle={handleMemoryToggle}
                                                label="Memory-Personalisierung"
                                                icon={HiChip}
                                                description={memoryEnabled 
                                                    ? 'Das System nutzt deine gespeicherten Memories für personalisierte Inhalte.'
                                                    : 'Das System verwendet keine Memories. Inhalte werden ohne Personalisierung generiert.'
                                                }
                                                tabIndex={tabIndex.memoryToggle}
                                            />
                                    </ProfileCard>

                                    {memoryEnabled && (
                                        <ProfileCard
                                            title={`Mem0ries (${Array.isArray(memories) ? memories.length : 0})`}
                                            headerActions={
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xsmall)' }}>
                                                    <button
                                                        type="button"
                                                        className="icon-button style-as-link"
                                                        onClick={() => setShowAddMemoryForm(true)}
                                                        disabled={showAddMemoryForm || loadingMemories}
                                                        title="Memory hinzufügen"
                                                        tabIndex={tabIndex.addMemoryButton}
                                                        aria-label="Neue Memory hinzufügen"
                                                    >
                                                        <HiPlus />
                                                    </button>
                                                    <button 
                                                        onClick={refreshMemories} 
                                                        className="icon-button style-as-link"
                                                        disabled={loadingMemories}
                                                        title="Memories aktualisieren"
                                                    >
                                                        <HiRefresh />
                                                    </button>
                                                </div>
                                            }
                                        >
                                                {showAddMemoryForm && (
                                                    <div 
                                                        ref={memoryFormRef}
                                                        className="new-memory-form knowledge-entry knowledge-entry-bordered" 
                                                        style={{ marginBottom: 'var(--spacing-medium)'}}
                                                        role="dialog"
                                                        aria-label="Neue Memory hinzufügen"
                                                    >
                                                        <div className="form-field-wrapper">
                                                            <label className="form-label">
                                                                Memory Text *
                                                            </label>
                                                            <textarea
                                                                ref={memoryInputRef}
                                                                className="form-textarea"
                                                                value={newMemoryText}
                                                                onChange={(e) => setNewMemoryText(e.target.value)}
                                                                placeholder="Gib hier Informationen über dich ein, die das System sich merken soll..."
                                                                rows={4}
                                                                disabled={addingMemory}
                                                                tabIndex={tabIndex.memoryInput}
                                                                aria-label="Memory Text"
                                                                {...inlineEditorProps}
                                                            />
                                                        </div>
                                                        <div className="form-field-wrapper">
                                                            <label className="form-label">
                                                                Thema (optional)
                                                            </label>
                                                            <input
                                                                type="text"
                                                                className="form-input"
                                                                value={newMemoryTopic}
                                                                onChange={(e) => setNewMemoryTopic(e.target.value)}
                                                                placeholder="z.B. Persönliche Vorlieben, Arbeitsbereich, etc."
                                                                disabled={addingMemory}
                                                                tabIndex={tabIndex.memoryTagInput}
                                                                aria-label="Memory Thema"
                                                            />
                                                        </div>
                                                        <div className="profile-actions" style={{justifyContent: 'flex-start', gap: '10px'}}>
                                                            <button 
                                                                onClick={addMemory}
                                                                className="btn-primary"
                                                                disabled={addingMemory || !newMemoryText.trim()}
                                                                tabIndex={tabIndex.saveMemoryButton}
                                                                aria-label="Memory speichern"
                                                            >
                                                                {addingMemory ? 'Wird hinzugefügt...' : 'Speichern'}
                                                            </button>
                                                            <button 
                                                                onClick={() => setShowAddMemoryForm(false)}
                                                                className="btn-secondary"
                                                                disabled={addingMemory}
                                                                tabIndex={tabIndex.cancelMemoryButton}
                                                                aria-label="Memory hinzufügen abbrechen"
                                                            >
                                                                Abbrechen
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                {memoryError && (
                                                    <div className="auth-error-message">
                                                        <HiInformationCircle />
                                                        Fehler: {memoryError}
                                                    </div>
                                                )}

                                                {(!Array.isArray(memories) || memories.length === 0) && !showAddMemoryForm ? (
                                                    <EmptyState
                                                        icon={HiInformationCircle}
                                                        title="Keine Memories gefunden"
                                                        description="Du hast noch keine Memories gespeichert."
                                                    />
                                                ) : (
                                                    <>
                                                        <div className="memories-list memories-grid">
                                                            {Array.isArray(memories) && memories.map((memory, index) => (
                                                                <div key={memory.id || index} className="knowledge-entry knowledge-entry-bordered">
                                                                    <div className="form-field-wrapper">
                                                                        <div className="memory-content">
                                                                            <div className="memory-header">
                                                                                <p className="memory-text">
                                                                                    {memory.memory || memory.text || JSON.stringify(memory)}
                                                                                </p>
                                                                                <button
                                                                                    onClick={() => deleteMemory(memory.id)}
                                                                                    className="delete-memory-button"
                                                                                    title="Memory löschen"
                                                                                    tabIndex={tabIndex.deleteMemoryButton + index}
                                                                                    aria-label={`Memory "${memory.memory || memory.text}" löschen`}
                                                                                >
                                                                                    <HiTrash />
                                                                                </button>
                                                                            </div>
                                                                            {memory.metadata && (
                                                                                <div className="memory-metadata">
                                                                                    {memory.metadata.topic && (
                                                                                        <span className="metadata-badge">
                                                                                            {memory.metadata.topic}
                                                                                        </span>
                                                                                    )}
                                                                                    {memory.created_at && (
                                                                                        <span className="memory-timestamp">Erstellt: {new Date(memory.created_at).toLocaleString('de-DE')}</span>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        
                                                        {Array.isArray(memories) && memories.length > 0 && (
                                                            <div className="delete-all-container">
                                                                <button 
                                                                    onClick={deleteAllMemories} 
                                                                    className="delete-all-link"
                                                                    tabIndex={tabIndex.deleteAllMemoryButton}
                                                                    aria-label="Alle Memories löschen"
                                                                >
                                                                    Alle Memories löschen
                                                                </button>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                        </ProfileCard>
                                    )}
                                </div>
                            )}

                            <div className="form-help-text">
                                Änderungen werden automatisch gespeichert
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </FormProvider>
    );
};

export default IntelligenceTab; 