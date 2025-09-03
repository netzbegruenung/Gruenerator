import React, { lazy, Suspense, useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
const Select = lazy(() => import('react-select'));
import { HiDocumentText, HiPlus, HiX } from 'react-icons/hi';
import { motion } from "motion/react";
import { useFormFields } from '../../../components/common/Form/hooks';

const QACreator = ({ 
    onSave, 
    availableDocuments = [], 
    editingCollection = null,
    loading = false,
    onCancel
}) => {
    const [selectedDocuments, setSelectedDocuments] = useState([]);
    const { Input, Textarea } = useFormFields();
    
    const {
        control,
        handleSubmit,
        reset,
        formState: { errors }
    } = useForm({
        defaultValues: {
            name: '',
            description: '',
            custom_prompt: ''
        }
    });

    // Initialize form when editing
    useEffect(() => {
        if (editingCollection) {
            reset({
                name: editingCollection.name || '',
                description: editingCollection.description || '',
                custom_prompt: editingCollection.custom_prompt || ''
            });
            setSelectedDocuments(editingCollection.documents || []);
        } else {
            reset({
                name: '',
                description: '',
                custom_prompt: ''
            });
            setSelectedDocuments([]);
        }
    }, [editingCollection, reset]);

    // Transform documents to React Select options
    const documentOptions = availableDocuments.map(doc => ({
        value: doc.id,
        label: doc.title,
        document: doc
    }));

    // Custom option rendering to show document details
    const formatOptionLabel = ({ document, label }, { context }) => {
        // Show detailed info in dropdown menu
        if (context === 'menu' && document) {
            return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <HiDocumentText style={{ color: 'var(--primary)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ 
                            fontWeight: '500', 
                            color: 'var(--font-color)',
                            marginBottom: '2px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {label}
                        </div>
                        <div style={{ 
                            fontSize: '0.85rem', 
                            color: 'var(--text-muted-color)',
                            display: 'flex',
                            gap: '8px'
                        }}>
                            <span>{document.page_count} Seiten</span>
                            <span>•</span>
                            <span>{new Date(document.created_at).toLocaleDateString('de-DE')}</span>
                        </div>
                    </div>
                </div>
            );
        }
        // Show simple label for selected values
        return <span>{label}</span>;
    };

    // Handle React Select change
    const handleDocumentSelectChange = (selectedOptions) => {
        const documents = selectedOptions ? selectedOptions.map(option => option.document) : [];
        setSelectedDocuments(documents);
    };

    const onSubmit = async (data) => {
        if (selectedDocuments.length === 0) {
            alert('Bitte wählen Sie mindestens ein Dokument aus.');
            return;
        }

        const qaData = {
            ...data,
            documents: selectedDocuments.map(doc => doc.id),
            id: editingCollection?.id
        };

        await onSave(qaData);
    };

    const handleCancel = () => {
        reset();
        setSelectedDocuments([]);
        if (onCancel) onCancel();
    };

    return (
        <motion.div
            className="qa-creator-container"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            <div className="qa-creator-card">
                <div className="qa-creator-header">
                    <h3>{editingCollection ? 'Q&A bearbeiten' : 'Neue Q&A erstellen'}</h3>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="qa-creator-form">
                    <div className="qa-creator-content">
                        <div className="form-section">
                            <Input
                                name="name"
                                control={control}
                                label="Name der Q&A-Sammlung"
                                placeholder="z.B. Klimapolitik-Dokumente"
                                rules={{ 
                                    required: 'Name ist erforderlich',
                                    maxLength: { value: 100, message: 'Name darf maximal 100 Zeichen haben' }
                                }}
                            />
                        </div>

                        <div className="form-section">
                            <Textarea
                                name="description"
                                control={control}
                                label="Beschreibung (optional)"
                                placeholder="Kurze Beschreibung der Q&A-Sammlung..."
                                minRows={2}
                                maxRows={4}
                                rules={{
                                    maxLength: { value: 500, message: 'Beschreibung darf maximal 500 Zeichen haben' }
                                }}
                            />
                        </div>

                        <div className="form-section">
                            <Textarea
                                name="custom_prompt"
                                control={control}
                                label="Anweisungen für die KI (optional)"
                                placeholder="z.B. 'Beantworte Fragen basierend auf den Klimapolitik-Dokumenten. Gib präzise Antworten mit Quellenangaben.'"
                                minRows={3}
                                maxRows={6}
                                helpText="Diese Anweisungen helfen der KI, passende Antworten zu geben"
                                rules={{
                                    maxLength: { value: 1000, message: 'Anweisungen dürfen maximal 1000 Zeichen haben' }
                                }}
                            />
                        </div>

                        <div className="form-section">
                            <label className="form-label">
                                Dokumente auswählen *
                            </label>
                            {availableDocuments.length === 0 ? (
                                <div className="no-documents-message">
                                    <p>Sie haben noch keine Dokumente hochgeladen.</p>
                                    <p>Gehen Sie zum Tab "Meine Dokumente", um Dokumente hinzuzufügen.</p>
                                </div>
                            ) : (
                                <div className="document-selection-react-select">
                                    <Suspense fallback={<div>Loading...</div>}><Select
                                        className="react-select"
                                        classNamePrefix="react-select"
                                        isMulti
                                        isSearchable
                                        placeholder="Dokumente suchen und auswählen..."
                                        options={documentOptions}
                                        value={selectedDocuments.map(doc => ({
                                            value: doc.id,
                                            label: doc.title,
                                            document: doc
                                        }))}
                                        onChange={handleDocumentSelectChange}
                                        formatOptionLabel={formatOptionLabel}
                                        noOptionsMessage={() => 'Keine passenden Dokumente gefunden'}
                                        closeMenuOnSelect={false}
                                        hideSelectedOptions={false}
                                        menuPortalTarget={document.body}
                                        menuPosition="fixed"
                                        maxMenuHeight={400}
                                        styles={{
                                            menuPortal: (base) => ({
                                                ...base,
                                                zIndex: 9999
                                            })
                                        }}
                                    /></Suspense>
                                    {selectedDocuments.length > 0 && (
                                        <div className="selected-documents-summary" style={{ 
                                            marginTop: 'var(--spacing-small)', 
                                            color: 'var(--text-muted-color)', 
                                            fontSize: '0.9rem' 
                                        }}>
                                            {selectedDocuments.length} Dokument(e) ausgewählt
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="form-actions">
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={handleCancel}
                            disabled={loading}
                        >
                            Abbrechen
                        </button>
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={loading || selectedDocuments.length === 0}
                        >
                            {loading ? 'Wird gespeichert...' : (editingCollection ? 'Aktualisieren' : 'Erstellen')}
                        </button>
                    </div>
                </form>
            </div>
        </motion.div>
    );
};

export default QACreator;