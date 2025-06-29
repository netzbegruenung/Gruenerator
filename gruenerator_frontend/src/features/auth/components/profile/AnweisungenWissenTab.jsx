import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useForm, FormProvider, useFieldArray } from 'react-hook-form';
import { HiOutlineTrash, HiPlus } from 'react-icons/hi';
import debounce from 'lodash.debounce';
import Spinner from '../../../../components/common/Spinner';
import { useFormFields } from '../../../../components/common/Form/hooks';
import { useAnweisungenWissen } from '../../utils/profileUtils';
import { useInstructionsUiStore } from '../../../../stores/auth/instructionsUiStore';
import HelpTooltip from '../../../../components/common/HelpTooltip';
import { motion } from "motion/react";

const MAX_CONTENT_LENGTH = 1000;

const AnweisungenWissenTab = ({ isActive }) => {
    const [currentView, setCurrentView] = useState('antraege');

    // Refs to track initialization and prevent loops (ProfileInfoTab pattern)
    const isInitialized = useRef(false);
    const lastSavedData = useRef(null);
    
    // Zustand store for UI state
    const {
        isSaving, isDeleting, deletingKnowledgeId,
        clearMessages
    } = useInstructionsUiStore();
    
    // React Query hook for data fetching and mutations
    const { query, saveChanges, deleteKnowledgeEntry, MAX_KNOWLEDGE_ENTRIES } = useAnweisungenWissen({ isActive });
    const { data, isLoading: isLoadingQuery, isError: isErrorQuery, error: errorQuery } = query;

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

    // Initialize form when data loads (ProfileInfoTab pattern)
    useEffect(() => {
        if (!data) return;
        
        // Only initialize once (ProfileInfoTab pattern)
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

    // Auto-save with debouncing (ProfileInfoTab pattern)
    const debouncedSave = useCallback(
        debounce(async (formData) => {
            try {
                await saveChanges(formData);
                // Success is handled by the saveChanges function
            } catch (error) {
                // Error is handled by saveChanges function
            }
        }, 1000),
        [saveChanges]
    );
    
    // Auto-save trigger using form subscription (adapted ProfileInfoTab pattern)
    useEffect(() => {
        if (!data || !isInitialized.current) return; // Don't auto-save until initial load
        
        // Use a timer to check for form changes periodically
        const interval = setInterval(() => {
            const currentValues = getValues();
            const formData = {
                customAntragPrompt: currentValues.customAntragPrompt || '',
                customSocialPrompt: currentValues.customSocialPrompt || '',
                customUniversalPrompt: currentValues.customUniversalPrompt || '',
                customGruenejugendPrompt: currentValues.customGruenejugendPrompt || '',
                knowledge: currentValues.knowledge || []
            };
            
            // Deep comparison with last saved data to prevent unnecessary saves (ProfileInfoTab pattern)
            const dataToCompare = JSON.stringify(formData);
            if (lastSavedData.current !== dataToCompare) {
                lastSavedData.current = dataToCompare;
                debouncedSave(formData);
            }
        }, 500); // Check every 500ms for changes
        
        return () => clearInterval(interval);
    }, [data, getValues, debouncedSave]);

    // Effect to clear messages when view changes or component becomes inactive
    useEffect(() => {
        clearMessages();
    }, [currentView, isActive, clearMessages]);

    const handleDeleteKnowledge = (entry, index) => {
        if (!entry.id || (typeof entry.id === 'string' && entry.id.startsWith('new-'))) {
            remove(index); // Remove from form state if it's a new, unsaved entry
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
    
    const handleTabClick = (view) => {
        setCurrentView(view);
    };

    const renderNavigationPanel = () => (
        <div className="profile-vertical-navigation">
            <button
                className={`profile-vertical-tab ${currentView === 'antraege' ? 'active' : ''}`}
                onClick={() => handleTabClick('antraege')}
            >
                Anträge
            </button>
            <button
                className={`profile-vertical-tab ${currentView === 'presse' ? 'active' : ''}`}
                onClick={() => handleTabClick('presse')}
            >
                Presse/Social
            </button>
            <button
                className={`profile-vertical-tab ${currentView === 'universal' ? 'active' : ''}`}
                onClick={() => handleTabClick('universal')}
            >
                Universal
            </button>
            <button
                className={`profile-vertical-tab ${currentView === 'gruenejugend' ? 'active' : ''}`}
                onClick={() => handleTabClick('gruenejugend')}
            >
                Grüne Jugend
            </button>
            <button
                className={`profile-vertical-tab ${currentView === 'wissen' ? 'active' : ''}`}
                onClick={() => handleTabClick('wissen')}
            >
                Wissen
            </button>
        </div>
    );

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

    return (
        <FormProvider {...formMethods}>
            <div>
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

                                {currentView === 'antraege' && (
                                    <div className="form-group">
                                        <div className="header-with-help">
                                            <div className="form-group-title">Anweisungen für Anträge</div>
                                            <HelpTooltip>
                                                <p>Diese Anweisungen werden bei der Erstellung von Anträgen berücksichtigt.</p>
                                                <p><strong>Tipp:</strong> Formuliere spezifische Vorgaben für Stil und Aufbau deiner Anträge.</p>
                                            </HelpTooltip>
                                        </div>
                                        
                                        <Textarea
                                            name="customAntragPrompt"
                                            label="Persönliche Anweisungen:"
                                            placeholder="Gib hier deine Anweisungen für die Erstellung von Anträgen ein..."
                                            helpText="z.B. bevorzugter Stil, spezielle Formulierungen, politische Schwerpunkte"
                                            minRows={4}
                                            disabled={isSaving}
                                            control={control}
                                        />
                                    </div>
                                )}

                                {currentView === 'presse' && (
                                    <div className="form-group">
                                        <div className="header-with-help">
                                            <div className="form-group-title">Anweisungen für Presse & Social Media</div>
                                            <HelpTooltip>
                                                <p>Diese Anweisungen werden bei der Erstellung von Presse- und Social Media-Inhalten berücksichtigt.</p>
                                                <p><strong>Tipp:</strong> Definiere Tonalität, Hashtag-Präferenzen und Zielgruppen-Ansprache.</p>
                                            </HelpTooltip>
                                        </div>
                                        
                                        <Textarea
                                            name="customSocialPrompt"
                                            label="Persönliche Anweisungen:"
                                            placeholder="Gib hier deine Anweisungen für die Erstellung von Presse- und Social Media-Inhalten ein..."
                                            helpText="z.B. Tonalität, Hashtag-Präferenzen, Zielgruppen-Ansprache"
                                            minRows={4}
                                            disabled={isSaving}
                                            control={control}
                                        />
                                    </div>
                                )}

                                {currentView === 'universal' && (
                                    <div className="form-group">
                                        <div className="header-with-help">
                                            <div className="form-group-title">Anweisungen für Universelle Texte</div>
                                            <HelpTooltip>
                                                <p>Diese Anweisungen werden bei der Erstellung von universellen Texten berücksichtigt.</p>
                                                <p><strong>Tipp:</strong> Definiere allgemeine Schreibweise und politische Grundhaltung.</p>
                                            </HelpTooltip>
                                        </div>
                                        
                                        <Textarea
                                            name="customUniversalPrompt"
                                            label="Persönliche Anweisungen:"
                                            placeholder="Gib hier deine Anweisungen für die Erstellung von universellen Texten ein..."
                                            helpText="z.B. allgemeine Schreibweise, politische Grundhaltung, Formulierungspräferenzen"
                                            minRows={4}
                                            disabled={isSaving}
                                            control={control}
                                        />
                                    </div>
                                )}

                                {currentView === 'gruenejugend' && (
                                    <div className="form-group">
                                        <div className="header-with-help">
                                            <div className="form-group-title">Anweisungen für Grüne Jugend</div>
                                            <HelpTooltip>
                                                <p>Diese Anweisungen werden bei der Erstellung von Grüne Jugend-Inhalten berücksichtigt.</p>
                                                <p><strong>Tipp:</strong> Verwende jugendgerechte Sprache und fokussiere auf Aktivismus-Themen.</p>
                                            </HelpTooltip>
                                        </div>
                                        
                                        <Textarea
                                            name="customGruenejugendPrompt"
                                            label="Persönliche Anweisungen:"
                                            placeholder="Gib hier deine Anweisungen für die Erstellung von Grüne Jugend-Inhalten ein..."
                                            helpText="z.B. jugendgerechte Sprache, spezielle Themen, Aktivismus-Fokus"
                                            minRows={4}
                                            disabled={isSaving}
                                            control={control}
                                        />
                                    </div>
                                )}

                                {currentView === 'wissen' && (
                                    <div className="form-group knowledge-management-section">
                                        <div className="form-group-title-container flex-between">
                                            <div className="form-group-title">Persönliches Wissen</div>
                                            <button
                                                type="button"
                                                className="btn-primary size-s"
                                                onClick={handleAddKnowledge}
                                                disabled={isSaving || isDeleting || fields.length >= MAX_KNOWLEDGE_ENTRIES}
                                            >
                                                <HiPlus className="icon" /> Wissen hinzufügen
                                            </button>
                                        </div>

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
                                                        minRows={3}
                                                        maxLength={MAX_CONTENT_LENGTH}
                                                        showCharacterCount={true}
                                                        disabled={isSaving || isDeleting}
                                                        control={control}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                
                                <div className="form-help-text">
                                    {isSaving ? 'Wird gespeichert...' : 'Änderungen werden automatisch gespeichert'}
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </FormProvider>
    );
};

export default AnweisungenWissenTab; 