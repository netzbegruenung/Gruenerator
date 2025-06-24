import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
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

    const handleDocumentToggle = (document) => {
        setSelectedDocuments(prev => {
            const isSelected = prev.some(doc => doc.id === document.id);
            if (isSelected) {
                return prev.filter(doc => doc.id !== document.id);
            } else {
                return [...prev, document];
            }
        });
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
                            <div className="document-selection">
                                {availableDocuments.length === 0 ? (
                                    <div className="no-documents-message">
                                        <p>Sie haben noch keine Dokumente hochgeladen.</p>
                                        <p>Gehen Sie zum Tab "Meine Dokumente", um Dokumente hinzuzufügen.</p>
                                    </div>
                                ) : (
                                    <div className="document-list">
                                        {availableDocuments.map((document) => {
                                            const isSelected = selectedDocuments.some(doc => doc.id === document.id);
                                            return (
                                                <div
                                                    key={document.id}
                                                    className={`document-item ${isSelected ? 'selected' : ''}`}
                                                    onClick={() => handleDocumentToggle(document)}
                                                >
                                                    <div className="document-info">
                                                        <HiDocumentText className="document-icon" />
                                                        <div className="document-details">
                                                            <span className="document-title">{document.title}</span>
                                                            <span className="document-meta">
                                                                {document.page_count} Seiten • {new Date(document.created_at).toLocaleDateString('de-DE')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className={`document-checkbox ${isSelected ? 'checked' : ''}`}>
                                                        {isSelected && <HiPlus style={{transform: 'rotate(45deg)'}} />}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                {selectedDocuments.length > 0 && (
                                    <div className="selected-documents-summary">
                                        {selectedDocuments.length} Dokument(e) ausgewählt
                                    </div>
                                )}
                            </div>
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