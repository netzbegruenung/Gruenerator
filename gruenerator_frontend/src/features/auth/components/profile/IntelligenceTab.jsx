import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useForm, FormProvider, useFieldArray } from 'react-hook-form';
import { HiOutlineTrash, HiPlus, HiRefresh, HiInformationCircle, HiTrash, HiChip } from 'react-icons/hi';
import debounce from 'lodash.debounce';
import { motion } from "motion/react";
import Spinner from '../../../../components/common/Spinner';
import { useFormFields } from '../../../../components/common/Form/hooks';
import { useAnweisungenWissen } from '../../utils/profileUtils';
import { useAnweisungenWissenUiStore } from '../../../../stores/auth/anweisungenWissenUiStore';
import HelpTooltip from '../../../../components/common/HelpTooltip';
import FeatureToggle from '../../../../components/common/FeatureToggle';
import { useOptimizedAuth } from '../../../../hooks/useAuth';
import { useAuthStore } from '../../../../stores/authStore';

const MAX_CONTENT_LENGTH = 1000;
const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL || '';

const IntelligenceTab = ({ isActive, onSuccessMessage, onErrorMessage }) => {
    const [currentView, setCurrentView] = useState('anweisungen');

    // Check if user is on mem0ry tab but not in development - redirect to anweisungen
    useEffect(() => {
        const isDevelopment = import.meta.env.VITE_APP_ENV === 'development';
        if (currentView === 'mem0ry' && !isDevelopment) {
            setCurrentView('anweisungen');
        }
    }, [currentView]);

    // Auth and memory state
    const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
    const { memoryEnabled, setMemoryEnabled } = useAuthStore();

    // Refs to track initialization and prevent loops
    const isInitialized = useRef(false);
    const lastSavedData = useRef(null);
    
    // Zustand store for UI state
    const {
        isSaving, isDeleting, deletingKnowledgeId,
        clearMessages
    } = useAnweisungenWissenUiStore();
    
    // React Query hook for data fetching and mutations
    const { query, saveChanges, deleteKnowledgeEntry, MAX_KNOWLEDGE_ENTRIES } = useAnweisungenWissen({ isActive });
    const { data, isLoading: isLoadingQuery, isError: isErrorQuery, error: errorQuery } = query;

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
            knowledge: [],
        },
        mode: 'onChange'
    });

    const { control, getValues, reset } = formMethods;
    const { fields, append, remove } = useFieldArray({ 
        control, 
        name: "knowledge",
        keyName: "key"
    });
    const { Input, Textarea } = useFormFields();

    // Initialize form when data loads
    useEffect(() => {
        if (!data) return;
        
        if (!isInitialized.current) {
            reset({
                customAntragPrompt: data.antragPrompt || '',
                customSocialPrompt: data.socialPrompt || '',
                customUniversalPrompt: data.universalPrompt || '',
                customGruenejugendPrompt: data.gruenejugendPrompt || '',
                knowledge: data.knowledge || []
            });
            
            isInitialized.current = true;
        }
    }, [data, reset]);

    // Auto-save with debouncing
    const debouncedSave = useCallback(
        debounce(async (formData) => {
            try {
                await saveChanges(formData);
            } catch (error) {
                // Error is handled by saveChanges function
            }
        }, 1000),
        [saveChanges]
    );
    
    // Auto-save trigger using form subscription
    useEffect(() => {
        if (!data || !isInitialized.current) return;
        
        const interval = setInterval(() => {
            const currentValues = getValues();
            const formData = {
                customAntragPrompt: currentValues.customAntragPrompt || '',
                customSocialPrompt: currentValues.customSocialPrompt || '',
                customUniversalPrompt: currentValues.customUniversalPrompt || '',
                customGruenejugendPrompt: currentValues.customGruenejugendPrompt || '',
                knowledge: currentValues.knowledge || []
            };
            
            const dataToCompare = JSON.stringify(formData);
            if (lastSavedData.current !== dataToCompare) {
                lastSavedData.current = dataToCompare;
                debouncedSave(formData);
            }
        }, 500);
        
        return () => clearInterval(interval);
    }, [data, getValues, debouncedSave]);

    // Fetch memories when tab becomes active and user is authenticated
    useEffect(() => {
        if (isActive && currentView === 'mem0ry' && isAuthenticated && user?.id && !authLoading && memoryEnabled) {
            fetchMemories();
        }
    }, [isActive, currentView, isAuthenticated, user?.id, authLoading, memoryEnabled]);

    // Effect to clear messages when view changes or component becomes inactive
    useEffect(() => {
        clearMessages();
    }, [currentView, isActive, clearMessages]);

    const fetchMemories = async () => {
        if (!user?.id) {
            onErrorMessage('Benutzer nicht authentifiziert');
            return;
        }

        if (!memoryEnabled) {
            console.log('[IntelligenceTab] Memory disabled, skipping fetch');
            return;
        }

        setLoadingMemories(true);
        setMemoryError(null);
        
        try {
            console.log('[IntelligenceTab] Fetching memories for user:', user.id);
            const response = await fetch(`${AUTH_BASE_URL}/api/mem0/user/${user.id}`, {
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
            console.log('[IntelligenceTab] API Response:', data);
            setMemories(data.memories || []);
            
            if (!data.memories || data.memories.length === 0) {
                console.log('[IntelligenceTab] No memories found for user');
            }
        } catch (err) {
            console.error('[IntelligenceTab] Error fetching memories:', err);
            const errorMessage = err.message || 'Unbekannter Fehler';
            setMemoryError(errorMessage);
            onErrorMessage('Fehler beim Laden der Memories: ' + errorMessage);
        } finally {
            setLoadingMemories(false);
        }
    };

    const refreshMemories = () => {
        fetchMemories();
    };

    const addMemory = async () => {
        if (!newMemoryText.trim()) {
            onErrorMessage('Bitte gib einen Text ein');
            return;
        }

        setAddingMemory(true);
        try {
            const response = await fetch(`${AUTH_BASE_URL}/api/mem0/add-text`, {
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
                onSuccessMessage('Memory erfolgreich hinzugefügt');
                setNewMemoryText('');
                setNewMemoryTopic('');
                setShowAddMemoryForm(false);
                fetchMemories();
            } else {
                onErrorMessage('Fehler beim Hinzufügen der Memory');
            }
        } catch (err) {
            console.error('[IntelligenceTab] Error adding memory:', err);
            const errorMessage = err.message || 'Unbekannter Fehler';
            onErrorMessage('Fehler beim Hinzufügen der Memory: ' + errorMessage);
        } finally {
            setAddingMemory(false);
        }
    };

    const deleteMemory = async (memoryId) => {
        try {
            const response = await fetch(`${AUTH_BASE_URL}/api/mem0/${memoryId}`, {
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
                onSuccessMessage('Memory erfolgreich gelöscht');
                setMemories(prev => prev.filter(m => m.id !== memoryId));
            } else {
                onErrorMessage('Fehler beim Löschen der Memory');
            }
        } catch (err) {
            console.error('[IntelligenceTab] Error deleting memory:', err);
            onErrorMessage('Fehler beim Löschen der Memory: ' + err.message);
        }
    };

    const deleteAllMemories = async () => {
        if (!window.confirm(`Wirklich alle ${memories.length} Memories löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden und alle deine gespeicherten persönlichen Informationen gehen verloren.`)) {
            return;
        }

        try {
            const deletePromises = memories.map(memory => 
                fetch(`${AUTH_BASE_URL}/api/mem0/${memory.id}`, {
                    method: 'DELETE',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                })
            );

            await Promise.all(deletePromises);
            
            onSuccessMessage('Alle Memories erfolgreich gelöscht');
            setMemories([]);
        } catch (err) {
            console.error('[IntelligenceTab] Error deleting all memories:', err);
            onErrorMessage('Fehler beim Löschen aller Memories: ' + err.message);
        }
    };

    const handleDeleteKnowledge = (entry, index) => {
        if (!entry.id || (typeof entry.id === 'string' && entry.id.startsWith('new-'))) {
            remove(index);
        } else {
            if (window.confirm("Möchtest du diesen Wissenseintrag wirklich löschen?")) {
                deleteKnowledgeEntry(entry.id, {
                    onSuccess: () => {
                        // The query invalidation will trigger a data refetch and form reset
                    },
                });
            }
        }
    };

    const handleAddKnowledge = () => {
        if (fields.length < MAX_KNOWLEDGE_ENTRIES) {
            append({ id: `new-${Date.now()}`, title: '', content: '' });
        }
    };

    const handleMemoryToggle = async () => {
        const newState = !memoryEnabled;
        
        try {
            await setMemoryEnabled(newState);
        } catch (error) {
            console.error('[IntelligenceTab] Failed to update memory settings:', error);
            onErrorMessage('Fehler beim Speichern der Memory-Einstellungen: ' + error.message);
        }
    };
    
    const handleTabClick = (view) => {
        setCurrentView(view);
    };

    if (isLoadingQuery) {
        return <div className="profile-content-centered"><Spinner /></div>;
    }
    
    if (isErrorQuery) {
        return (
            <div className="auth-error-message error-message-container error-large-margin">
                Fehler beim Laden der Daten: {errorQuery.message}
            </div>
        );
    }

    const renderNavigationPanel = () => {
        const isDevelopment = import.meta.env.VITE_APP_ENV === 'development';
        
        return (
            <div className="profile-vertical-navigation">
                <button
                    className={`profile-vertical-tab ${currentView === 'anweisungen' ? 'active' : ''}`}
                    onClick={() => handleTabClick('anweisungen')}
                >
                    Anweisungen
                </button>
                <button
                    className={`profile-vertical-tab ${currentView === 'wissen' ? 'active' : ''}`}
                    onClick={() => handleTabClick('wissen')}
                >
                    Wissen
                </button>
                {isDevelopment && (
                    <button
                        className={`profile-vertical-tab ${currentView === 'mem0ry' ? 'active' : ''}`}
                        onClick={() => handleTabClick('mem0ry')}
                    >
                        Mem0ry
                    </button>
                )}
            </div>
        );
    };

    return (
        <FormProvider {...formMethods}>
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
                            {currentView === 'anweisungen' && (
                                <div className="profile-cards-grid">
                                    <div className="profile-card">
                                        <div className="profile-card-header">
                                            <h3>Anweisungen für Anträge</h3>
                                        </div>
                                        <div className="profile-card-content">
                                            <Textarea
                                                name="customAntragPrompt"
                                                label="Persönliche Anweisungen:"
                                                placeholder="Gib hier deine Anweisungen für die Erstellung von Anträgen ein..."
                                                helpText="z.B. bevorzugter Stil, spezielle Formulierungen, politische Schwerpunkte"
                                                minRows={2}
                                                maxRows={8}
                                                disabled={isSaving}
                                                control={control}
                                            />
                                        </div>
                                    </div>
                                    <div className="profile-card">
                                        <div className="profile-card-header">
                                            <h3>Anweisungen für Presse & Social Media</h3>
                                        </div>
                                        <div className="profile-card-content">
                                            <Textarea
                                                name="customSocialPrompt"
                                                label="Persönliche Anweisungen:"
                                                placeholder="Gib hier deine Anweisungen für die Erstellung von Presse- und Social Media-Inhalten ein..."
                                                helpText="z.B. Tonalität, Hashtag-Präferenzen, Zielgruppen-Ansprache"
                                                minRows={2}
                                                maxRows={8}
                                                disabled={isSaving}
                                                control={control}
                                            />
                                        </div>
                                    </div>
                                    <div className="profile-card">
                                        <div className="profile-card-header">
                                            <h3>Anweisungen für Universelle Texte</h3>
                                        </div>
                                        <div className="profile-card-content">
                                            <Textarea
                                                name="customUniversalPrompt"
                                                label="Persönliche Anweisungen:"
                                                placeholder="Gib hier deine Anweisungen für die Erstellung von universellen Texten ein..."
                                                helpText="z.B. allgemeine Schreibweise, politische Grundhaltung, Formulierungspräferenzen"
                                                minRows={2}
                                                maxRows={8}
                                                disabled={isSaving}
                                                control={control}
                                            />
                                        </div>
                                    </div>
                                    <div className="profile-card">
                                        <div className="profile-card-header">
                                            <h3>Anweisungen für Grüne Jugend</h3>
                                        </div>
                                        <div className="profile-card-content">
                                            <Textarea
                                                name="customGruenejugendPrompt"
                                                label="Persönliche Anweisungen:"
                                                placeholder="Gib hier deine Anweisungen für die Erstellung von Grüne Jugend-Inhalten ein..."
                                                helpText="z.B. jugendgerechte Sprache, spezielle Themen, Aktivismus-Fokus"
                                                minRows={2}
                                                maxRows={8}
                                                disabled={isSaving}
                                                control={control}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {currentView === 'wissen' && (
                                <div className="profile-card">
                                    <div className="profile-card-header">
                                        <h3>Persönliches Wissen</h3>
                                        <button
                                            type="button"
                                            className="btn-primary size-s"
                                            onClick={handleAddKnowledge}
                                            disabled={isSaving || isDeleting || fields.length >= MAX_KNOWLEDGE_ENTRIES}
                                        >
                                            <HiPlus className="icon" /> Wissen hinzufügen
                                        </button>
                                    </div>
                                    <div className="profile-card-content">
                                        {fields.length === 0 && (
                                            <div className="knowledge-empty-state centered">
                                                <p>Du hast noch keine Wissensbausteine hinterlegt.</p>
                                                <p>
                                                    Klicke auf "Wissen hinzufügen", um wiederkehrende Informationen zu speichern.
                                                </p>
                                            </div>
                                        )}

                                        {fields.map((field, index) => (
                                            <div key={field.key} className={`knowledge-entry ${index > 0 ? 'knowledge-entry-bordered' : ''}`}>
                                                <div className="form-field-wrapper anweisungen-field">
                                                    <div className="anweisungen-header">
                                                        <label htmlFor={`knowledge.${index}.title`}>Wissen #{index + 1}: Titel</label>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteKnowledge(field, index)}
                                                            className="knowledge-delete-button icon-button danger"
                                                            disabled={isSaving || (isDeleting && deletingKnowledgeId === field.id)}
                                                            aria-label={`Wissenseintrag ${index + 1} löschen`}
                                                        >
                                                            {(isDeleting && deletingKnowledgeId === field.id) ? <Spinner size="xsmall" /> : <HiOutlineTrash />}
                                                        </button>
                                                    </div>
                                                    <Input
                                                        name={`knowledge.${index}.title`}
                                                        type="text"
                                                        placeholder="Kurzer, prägnanter Titel (z.B. 'OV Musterstadt Vorstand')"
                                                        rules={{ maxLength: { value: 100, message: 'Titel darf maximal 100 Zeichen haben' } }}
                                                        disabled={isSaving || isDeleting}
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
                                                        disabled={isSaving || isDeleting}
                                                        control={control}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {currentView === 'mem0ry' && import.meta.env.VITE_APP_ENV === 'development' && (
                                <div className="profile-cards-grid">
                                    <div className="profile-card">
                                        <div className="profile-card-header">
                                            <h3>Memory-Einstellungen</h3>
                                            <HelpTooltip>
                                                <p>
                                                    Hier kannst du persönliche Informationen speichern, die das KI-System über dich wissen soll.
                                                </p>
                                                <p>
                                                    <strong>Tipp:</strong> Füge Informationen über deine Vorlieben, deinen Arbeitsbereich oder andere wichtige Details hinzu.
                                                </p>
                                            </HelpTooltip>
                                        </div>
                                        <div className="profile-card-content">
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
                                            />
                                        </div>
                                    </div>

                                    {memoryEnabled && (
                                        <div className="profile-card">
                                            <div className="profile-card-header">
                                                <h3>
                                                    Mem0ries ({memories.length})
                                                </h3>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xsmall)' }}>
                                                    <button
                                                        type="button"
                                                        className="icon-button style-as-link"
                                                        onClick={() => setShowAddMemoryForm(true)}
                                                        disabled={showAddMemoryForm || loadingMemories}
                                                        title="Memory hinzufügen"
                                                    >
                                                        <HiPlus />
                                                    </button>
                                                    <div>
                                                        <button 
                                                            onClick={refreshMemories} 
                                                            className="icon-button style-as-link"
                                                            disabled={loadingMemories}
                                                            title="Memories aktualisieren"
                                                        >
                                                            <HiRefresh />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="profile-card-content">
                                                {showAddMemoryForm && (
                                                    <div className="new-memory-form knowledge-entry knowledge-entry-bordered" style={{ marginBottom: 'var(--spacing-medium)'}}>
                                                        <div className="form-field-wrapper">
                                                            <label className="form-label">
                                                                Memory Text *
                                                            </label>
                                                            <textarea
                                                                className="form-textarea"
                                                                value={newMemoryText}
                                                                onChange={(e) => setNewMemoryText(e.target.value)}
                                                                placeholder="Gib hier Informationen über dich ein, die das System sich merken soll..."
                                                                rows={4}
                                                                disabled={addingMemory}
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
                                                            />
                                                        </div>
                                                        <div className="profile-actions" style={{justifyContent: 'flex-start', gap: '10px'}}>
                                                            <button 
                                                                onClick={addMemory}
                                                                className="btn-primary"
                                                                disabled={addingMemory || !newMemoryText.trim()}
                                                            >
                                                                {addingMemory ? 'Wird hinzugefügt...' : 'Speichern'}
                                                            </button>
                                                            <button 
                                                                onClick={() => setShowAddMemoryForm(false)}
                                                                className="btn-secondary"
                                                                disabled={addingMemory}
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

                                                {memories.length === 0 && !showAddMemoryForm ? (
                                                    <div className="knowledge-empty-state">
                                                        <HiInformationCircle size={48} className="empty-state-icon" />
                                                        <p>Keine Memories gefunden</p>
                                                        <p className="empty-state-description">
                                                            Du hast noch keine Memories gespeichert.
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="memories-list memories-grid">
                                                            {memories.map((memory, index) => (
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
                                                        
                                                        {memories.length > 0 && (
                                                            <div className="delete-all-container">
                                                                <button 
                                                                    onClick={deleteAllMemories} 
                                                                    className="delete-all-link"
                                                                >
                                                                    Alle Memories löschen
                                                                </button>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="form-help-text">
                                {isSaving ? 'Wird gespeichert...' : 'Änderungen werden automatisch gespeichert'}
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </FormProvider>
    );
};

export default IntelligenceTab; 