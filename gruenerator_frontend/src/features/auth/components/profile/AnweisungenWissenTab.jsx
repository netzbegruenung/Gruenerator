import React, { useEffect, useState } from 'react';
import { useForm, FormProvider, useFieldArray } from 'react-hook-form';
import { HiOutlineTrash, HiPlus } from 'react-icons/hi';
import Spinner from '../../../../components/common/Spinner';
import { useFormFields } from '../../../../components/common/Form/hooks';
import { useAnweisungenWissen } from '../../utils/profileUtils';
import { useAnweisungenWissenUiStore } from '../../../../stores/auth/anweisungenWissenUiStore';
import { motion } from "motion/react";

const MAX_CONTENT_LENGTH = 1000;

const AnweisungenWissenTab = ({ isActive }) => {
    const [currentView, setCurrentView] = useState('anweisungen');

    // Zustand store for UI state
    const {
        isSaving, isDeleting, error, successMessage, hasUnsavedChanges, deletingKnowledgeId,
        setHasUnsavedChanges, setError, setSuccess, clearMessages
    } = useAnweisungenWissenUiStore();
    
    // React Query hook for data fetching and mutations
    const { query, saveChanges, deleteKnowledgeEntry, MAX_KNOWLEDGE_ENTRIES } = useAnweisungenWissen({ isActive });
    const { data, isLoading: isLoadingQuery, isError: isErrorQuery, error: errorQuery } = query;

    // React Hook Form setup
    const formMethods = useForm({
        defaultValues: {
            customAntragPrompt: '',
            customSocialPrompt: '',
            knowledge: [],
        },
        mode: 'onChange'
    });

    const { control, handleSubmit, reset, formState: { isDirty } } = formMethods;
    const { fields, append, remove } = useFieldArray({ 
        control, 
        name: "knowledge",
        keyName: "key"
    });
    const { Input, Textarea } = useFormFields();

    // Effect to reset form with data from server
    useEffect(() => {
        if (data) {
            reset({
                customAntragPrompt: data.antragPrompt || '',
                customSocialPrompt: data.socialPrompt || '',
                knowledge: data.knowledge || []
            });
        }
    }, [data, reset]);

    // Effect to sync form dirty state with zustand store
    useEffect(() => {
        setHasUnsavedChanges(isDirty);
    }, [isDirty, setHasUnsavedChanges]);

    // Effect to clear messages when view changes or component becomes inactive
    useEffect(() => {
        clearMessages();
    }, [currentView, isActive, clearMessages]);

    const onSubmit = (formData) => {
        saveChanges(formData);
    };

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
        <div className="groups-vertical-navigation">
            <button
                className={`groups-vertical-tab ${currentView === 'anweisungen' ? 'active' : ''}`}
                onClick={() => handleTabClick('anweisungen')}
            >
                Anweisungen
            </button>
            <button
                className={`groups-vertical-tab ${currentView === 'wissen' ? 'active' : ''}`}
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
            <div className="auth-error-message error-message-container" style={{ margin: 'var(--spacing-large)' }}>
                Fehler beim Laden der Daten: {errorQuery.message}
            </div>
        );
    }

    return (
        <FormProvider {...formMethods}>
            <form onSubmit={handleSubmit(onSubmit)}>
                <motion.div 
                    className="profile-content groups-management-layout"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                >
                    <div className="groups-navigation-panel">
                        {renderNavigationPanel()}
                    </div>
                    <div className="groups-content-panel profile-form-section">
                        <div className="group-content-card">
                            <div className="auth-form">
                                <div className="anweisungen-info" style={{ marginBottom: 'var(--spacing-large)', paddingBottom: 'var(--spacing-medium)', borderBottom: '1px solid var(--border-subtle)' }}>
                                    <p>
                                      Hier kannst du eigene Anweisungen und Wissensbausteine für den Grünerator hinterlegen.
                                    </p>
                                    <p>
                                    <strong>Tipp:</strong> Formuliere klare Anweisungen zum Stil oder persönliche Präferenzen.
                                    Nutze Wissen für wiederkehrende Infos (z.B. über dich, deinen Verband).
                                    </p>
                                </div>

                                {currentView === 'anweisungen' && (
                                    <div className="form-group">
                                        <div className="form-group-title">Benutzerdefinierte Anweisungen</div>
                                        
                                        <Textarea
                                            name="customAntragPrompt"
                                            label="Anweisungen für Anträge:"
                                            placeholder="Gib hier deine Anweisungen für die Erstellung von Anträgen ein..."
                                            helpText="Diese Anweisungen werden bei der Erstellung von Anträgen berücksichtigt."
                                            minRows={4}
                                            disabled={isSaving}
                                            control={control}
                                        />

                                        <Textarea
                                            name="customSocialPrompt"
                                            label="Anweisungen für Social Media & Presse:"
                                            placeholder="Gib hier deine Anweisungen für die Erstellung von Social Media Inhalten ein..."
                                            helpText="Diese Anweisungen werden bei der Erstellung von Social Media & Presse-Inhalten berücksichtigt."
                                            minRows={4}
                                            disabled={isSaving}
                                            control={control}
                                        />
                                    </div>
                                )}

                                {currentView === 'wissen' && (
                                    <div className="form-group knowledge-management-section">
                                        <div className="form-group-title-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-medium)' }}>
                                            <div className="form-group-title">Persönliches Wissen</div>
                                            <button
                                                type="button"
                                                className="add-knowledge-button"
                                                onClick={handleAddKnowledge}
                                                disabled={isSaving || isDeleting || fields.length >= MAX_KNOWLEDGE_ENTRIES}
                                            >
                                                <HiPlus /> Wissen hinzufügen
                                            </button>
                                        </div>

                                        {fields.length === 0 && (
                                            <div className="knowledge-empty-state" style={{ textAlign: 'center', padding: 'var(--spacing-large)', backgroundColor: 'var(--background-color-alt)', borderRadius: 'var(--border-radius-medium)', marginTop: 'var(--spacing-medium)' }}>
                                                <p>Du hast noch keine Wissensbausteine hinterlegt.</p>
                                                <p style={{ marginTop: 'var(--spacing-small)', color: 'var(--font-color-subtle)' }}>
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
                                
                                <div className="profile-actions profile-actions-container" style={{ marginTop: 'var(--spacing-large)' }}>
                                    <button
                                        type="submit"
                                        className="profile-action-button profile-primary-button"
                                        disabled={!hasUnsavedChanges || isSaving || isDeleting}
                                        aria-live="polite"
                                    >
                                        {isSaving ? <Spinner size="small" /> : 'Änderungen speichern'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </form>
        </FormProvider>
    );
};

export default AnweisungenWissenTab; 