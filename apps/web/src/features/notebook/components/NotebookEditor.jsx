import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import EnhancedSelect from '../../../components/common/EnhancedSelect';
import { WolkeSelector } from '../../../components/common';
import { HiDocumentText, HiOutlineCloud } from 'react-icons/hi';
import { motion } from "motion/react";
import { useFormFields } from '../../../components/common/Form/hooks';
import { useOptimizedAuth } from '../../../hooks/useAuth';

import '../styles/notebook-creator.css';
import '../../../assets/styles/features/notebook/notebook-chat.css';
import '../../../assets/styles/features/notebook/notebook-collections.css';
import '../../../assets/styles/components/ui/button.css';

const formatFileSize = (bytes) => {
  if (!bytes) return '';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
  return `${Math.round(bytes / Math.pow(1024, i) * 10) / 10} ${sizes[i]}`;
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  try {
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch {
    return '';
  }
};

const formatDocumentStatus = (status) => {
  switch (status) {
    case 'completed':
      return 'Bereit';
    case 'processing':
      return 'Wird verarbeitet';
    case 'failed':
      return 'Fehler';
    case 'pending':
      return 'Warteschlange';
    default:
      return status || 'Unbekannt';
  }
};

const getDocumentIcon = (filename) => {
  if (!filename) return 'document';
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
    case 'doc':
    case 'docx':
      return 'document';
    case 'txt':
      return 'text';
    default:
      return 'document';
  }
};

const NotebookEditor = ({
    onSave,
    availableDocuments = [],
    editingCollection = null,
    loading = false,
    onCancel,
    allowedModes = ['documents', 'wolke'],
    lockSelectionMode = null
}) => {
    const { user } = useOptimizedAuth();
    const [selectedDocuments, setSelectedDocuments] = useState([]);
    const [selectedWolkeLinks, setSelectedWolkeLinks] = useState([]);
    const [selectionMode, setSelectionMode] = useState('documents');
    const [autoSync, setAutoSync] = useState(false);
    const [removeMissing, setRemoveMissing] = useState(false);
    const { Input, Textarea } = useFormFields();

    const {
        control,
        handleSubmit,
        reset
    } = useForm({
        defaultValues: {
            name: '',
            description: '',
            custom_prompt: ''
        }
    });

    useEffect(() => {
        if (editingCollection) {
            reset({
                name: editingCollection.name || '',
                description: editingCollection.description || '',
                custom_prompt: editingCollection.custom_prompt || ''
            });
            setSelectedDocuments(editingCollection.documents || []);
            setSelectedWolkeLinks(editingCollection.wolke_share_links || []);
            if (lockSelectionMode) {
                setSelectionMode(lockSelectionMode);
            } else if ((editingCollection.wolke_share_links || []).length > 0) {
                setSelectionMode('wolke');
                setAutoSync(!!editingCollection.auto_sync);
                setRemoveMissing(!!editingCollection.remove_missing_on_sync);
            } else {
                setSelectionMode('documents');
                setAutoSync(false);
                setRemoveMissing(false);
            }
        } else {
            reset({
                name: '',
                description: '',
                custom_prompt: ''
            });
            setSelectedDocuments([]);
            setSelectedWolkeLinks([]);
            setSelectionMode('documents');
            setAutoSync(false);
            setRemoveMissing(false);
        }
    }, [editingCollection, reset]);

    useEffect(() => {
        if (!allowedModes.includes(selectionMode)) {
            if (lockSelectionMode && allowedModes.includes(lockSelectionMode)) {
                setSelectionMode(lockSelectionMode);
            } else if (allowedModes.length > 0) {
                setSelectionMode(allowedModes[0]);
            }
        }
    }, [allowedModes.join(','), lockSelectionMode, selectionMode]);

    const documentOptions = availableDocuments.map(doc => {
        const subtitle = [];
        if (doc.filename) subtitle.push(doc.filename);
        if (doc.file_size) subtitle.push(formatFileSize(doc.file_size));
        if (doc.created_at) subtitle.push(`Hochgeladen: ${formatDate(doc.created_at)}`);

        return {
            value: doc.id,
            label: doc.title,
            iconType: getDocumentIcon(doc.filename),
            subtitle: subtitle.join(' • '),
            tag: doc.status ? {
                label: formatDocumentStatus(doc.status),
                variant: 'custom'
            } : null,
            searchableContent: `${doc.title} ${doc.filename || ''} ${doc.ocr_text || ''}`.toLowerCase(),
            document: doc
        };
    });

    const handleDocumentSelectChange = (selectedOptions) => {
        const documents = selectedOptions ? selectedOptions.map(option => option.document) : [];
        setSelectedDocuments(documents);
    };

    const onSubmit = async (data) => {
        if (selectionMode === 'documents' && selectedDocuments.length === 0) {
            alert('Bitte wählen Sie mindestens ein Dokument aus.');
            return;
        }

        if (selectionMode === 'wolke' && selectedWolkeLinks.length === 0) {
            alert('Bitte wählen Sie mindestens einen Wolke-Ordner aus.');
            return;
        }

        const qaData = {
            ...data,
            selectionMode,
            documents: selectionMode === 'documents' ? selectedDocuments.map(doc => doc.id) : [],
            wolkeShareLinks: selectionMode === 'wolke' ? selectedWolkeLinks.map(link => link.id) : [],
            auto_sync: selectionMode === 'wolke' ? autoSync : false,
            remove_missing_on_sync: selectionMode === 'wolke' ? removeMissing : false,
            id: editingCollection?.id
        };

        await onSave(qaData);
    };

    const handleCancel = () => {
        reset();
        setSelectedDocuments([]);
        setSelectedWolkeLinks([]);
        setSelectionMode('documents');
        if (onCancel) onCancel();
    };

    const handleModeSwitch = (mode) => {
        if (!allowedModes.includes(mode)) return;
        if (lockSelectionMode && mode !== lockSelectionMode) return;
        setSelectionMode(mode);
        if (mode === 'documents') {
            setSelectedWolkeLinks([]);
        } else {
            setSelectedDocuments([]);
        }
    };

    const hasValidSelection = (
        (selectionMode === 'documents' && selectedDocuments.length > 0) ||
        (selectionMode === 'wolke' && selectedWolkeLinks.length > 0)
    );

    return (
        <motion.div
            className="notebook-creator-container"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            <div className="notebook-creator-card">
                <form onSubmit={handleSubmit(onSubmit)} className="notebook-creator-form">
                    <div className="notebook-creator-content">
                        <div className="form-section">
                            <Input
                                name="name"
                                control={control}
                                label="Name des Notebooks"
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
                                placeholder="Kurze Beschreibung des Notebooks..."
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
                            <div className="content-selection-header">
                                <label className="form-label">
                                    Inhalte auswählen *
                                </label>
                                {(allowedModes.length > 1 && !lockSelectionMode) && (
                                    <div className="selection-mode-toggle">
                                        {allowedModes.includes('documents') && (
                                            <button
                                                type="button"
                                                className={`mode-toggle-btn ${selectionMode === 'documents' ? 'active' : ''}`}
                                                onClick={() => handleModeSwitch('documents')}
                                                disabled={loading}
                                            >
                                                <HiDocumentText size={16} />
                                                Dokumente
                                            </button>
                                        )}
                                        {allowedModes.includes('wolke') && (
                                            <button
                                                type="button"
                                                className={`mode-toggle-btn ${selectionMode === 'wolke' ? 'active' : ''}`}
                                                onClick={() => handleModeSwitch('wolke')}
                                                disabled={loading}
                                            >
                                                <HiOutlineCloud size={16} />
                                                Wolke-Ordner
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {selectionMode === 'documents' && allowedModes.includes('documents') && (
                                <div className="documents-selection">
                                    {availableDocuments.length === 0 ? (
                                        <div className="no-documents-message">
                                            <p>Sie haben noch keine Dokumente hochgeladen.</p>
                                            <p>Gehen Sie zum Tab "Meine Dokumente", um Dokumente hinzuzufügen.</p>
                                        </div>
                                    ) : (
                                        <>
                                            <EnhancedSelect
                                                className="react-select"
                                                classNamePrefix="react-select"
                                                enableIcons={true}
                                                enableSubtitles={true}
                                                enableTags={true}
                                                isMulti
                                                isSearchable
                                                placeholder="Dokumente suchen und auswählen..."
                                                options={documentOptions}
                                                value={selectedDocuments.map(doc => {
                                                    const option = documentOptions.find(opt => opt.value === doc.id);
                                                    return option || {
                                                        value: doc.id,
                                                        label: doc.title,
                                                        document: doc
                                                    };
                                                })}
                                                onChange={handleDocumentSelectChange}
                                                filterOption={() => true}
                                                noOptionsMessage={() => 'Keine passenden Dokumente gefunden'}
                                                closeMenuOnSelect={false}
                                                hideSelectedOptions={false}
                                                menuPortalTarget={document.body}
                                                menuPosition="fixed"
                                                maxMenuHeight={400}
                                            />
                                            {selectedDocuments.length > 0 && (
                                                <div className="selected-content-summary">
                                                    {selectedDocuments.length} Dokument(e) ausgewählt
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {selectionMode === 'wolke' && allowedModes.includes('wolke') && (
                                <div className="wolke-selection">
                                    <WolkeSelector
                                        value={selectedWolkeLinks}
                                        onChange={setSelectedWolkeLinks}
                                        placeholder="Wolke-Ordner suchen und auswählen..."
                                        helpText="Alle Dokumente aus den ausgewählten Wolke-Ordnern werden automatisch in die Sammlung einbezogen."
                                        scope={user?.groups?.length > 0 ? 'personal' : 'personal'}
                                        isMulti={true}
                                    />
                                    {selectedWolkeLinks.length > 0 && (
                                        <div className="selected-content-summary">
                                            {selectedWolkeLinks.length} Wolke-Ordner ausgewählt
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="form-actions button-container">
                        <div className="button-wrapper">
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={handleCancel}
                                disabled={loading}
                            >
                                Abbrechen
                            </button>
                        </div>
                        <div className="button-wrapper">
                            <button
                                type="submit"
                                className={`button submit-button ${loading ? 'submit-button--loading' : ''}`}
                                disabled={loading || !hasValidSelection}
                            >
                                {loading ? 'Wird gespeichert...' : 'Aktualisieren'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </motion.div>
    );
};

export default NotebookEditor;
