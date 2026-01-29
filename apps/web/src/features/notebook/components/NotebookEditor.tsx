import { AnimatePresence, motion } from 'motion/react';
import { useState, useEffect, useCallback, useRef, type ComponentType, type DragEvent } from 'react';
import { useForm } from 'react-hook-form';
import { HiCheckCircle, HiArrowLeft, HiUpload, HiX } from 'react-icons/hi';

import { useFormFields } from '../../../components/common/Form/hooks';
import { useDocumentsStore } from '../../../stores/documentsStore';

import '../styles/notebook-creator.css';
import '../../../assets/styles/features/notebook/notebook-chat.css';
import '../../../assets/styles/features/notebook/notebook-collections.css';
import '../../../assets/styles/components/ui/button.css';

interface NotebookCollection {
  id?: string;
  name: string;
  description?: string;
  documents?: { id: string; title?: string }[];
}

interface NotebookEditorFormData {
  name: string;
  description: string;
}

interface FormFieldComponents {
  Input: ComponentType<{
    name: string;
    control: unknown;
    label: string;
    placeholder?: string;
    rules?: unknown;
  }>;
  Textarea: ComponentType<{
    name: string;
    control: unknown;
    label: string;
    placeholder?: string;
    minRows?: number;
    maxRows?: number;
    helpText?: string;
    rules?: unknown;
  }>;
  [key: string]: unknown;
}

interface UploadedDocument {
  id: string;
  title: string;
  filename?: string;
  [key: string]: unknown;
}

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.md', '.odt', '.rtf'];

interface NotebookEditorProps {
  onSave: (data: unknown) => Promise<void>;
  editingCollection?: NotebookCollection | null;
  loading?: boolean;
  onCancel?: () => void;
}

const NotebookEditor = ({
  onSave,
  editingCollection = null,
  loading = false,
  onCancel,
}: NotebookEditorProps) => {
  const [step, setStep] = useState<1 | 2>(editingCollection ? 2 : 1);
  const [uploadedDocument, setUploadedDocument] = useState<UploadedDocument | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { Input, Textarea } = useFormFields() as unknown as FormFieldComponents;
  const { uploadFileOnly } = useDocumentsStore();

  const { control, handleSubmit, reset, setValue } = useForm<NotebookEditorFormData>({
    defaultValues: {
      name: '',
      description: '',
    },
  });

  useEffect(() => {
    if (editingCollection) {
      reset({
        name: editingCollection.name || '',
        description: editingCollection.description || '',
      });
      if (editingCollection.documents?.length) {
        const doc = editingCollection.documents[0];
        setUploadedDocument({ id: doc.id, title: doc.title || 'Dokument' });
        setStep(2);
      }
    } else {
      reset({ name: '', description: '' });
      setUploadedDocument(null);
      setStep(1);
    }
  }, [editingCollection, reset]);

  const handleFileUpload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setUploadError(null);

      try {
        const doc = await uploadFileOnly(file, file.name);
        setUploadedDocument(doc);
        setValue('name', doc.title.replace(/\.[^/.]+$/, ''), { shouldValidate: true });
        setStep(2);
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : 'Fehler beim Hochladen der Datei'
        );
      } finally {
        setIsUploading(false);
      }
    },
    [uploadFileOnly, setValue]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleRemoveDocument = useCallback(() => {
    setUploadedDocument(null);
    setStep(1);
    reset({ name: '', description: '' });
  }, [reset]);

  const onSubmit = async (data: NotebookEditorFormData): Promise<void> => {
    if (!uploadedDocument) return;

    const qaData = {
      ...data,
      selectionMode: 'documents',
      documents: [uploadedDocument.id],
      id: editingCollection?.id,
    };

    await onSave(qaData);
  };

  const handleCancel = (): void => {
    reset();
    setUploadedDocument(null);
    setStep(1);
    if (onCancel) onCancel();
  };

  return (
    <motion.div
      className="notebook-creator-container"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="notebook-creator-card">
        {/* Header: title — dots — close */}
        <div className="notebook-editor-header">
          <span className="notebook-editor-title">
            {editingCollection
              ? 'Notebook bearbeiten'
              : step === 1
                ? 'Dokument hochladen'
                : 'Notebook erstellen'}
          </span>

          {!editingCollection && (
            <div className="notebook-step-dots">
              <div className={`step-dot ${step === 1 ? 'active' : 'done'}`} />
              <div className={`step-dot ${step === 2 ? 'active' : ''}`} />
            </div>
          )}

          <button
            type="button"
            className="notebook-close-btn"
            onClick={handleCancel}
            disabled={isUploading || loading}
            aria-label="Schließen"
          >
            <HiX size={18} />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && !editingCollection ? (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="notebook-creator-content">
                <div className="form-section">
                  <div
                    className={`notebook-dropzone ${isDragOver ? 'drag-over' : ''} ${isUploading ? 'uploading' : ''}`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => !isUploading && fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED_EXTENSIONS.join(',')}
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                    />

                    {isUploading ? (
                      <div className="dropzone-uploading">
                        <div className="upload-spinner" />
                        <span>Wird hochgeladen…</span>
                      </div>
                    ) : (
                      <div className="dropzone-content">
                        <HiUpload size={28} className="dropzone-icon" />
                        <p className="dropzone-text">
                          Datei hier ablegen oder klicken
                        </p>
                        <p className="dropzone-hint">
                          PDF, DOCX, TXT, MD, ODT, RTF (max. 50 MB)
                        </p>
                      </div>
                    )}
                  </div>

                  {uploadError && (
                    <p className="notebook-upload-error">{uploadError}</p>
                  )}
                </div>
              </div>

            </motion.div>
          ) : (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <form onSubmit={handleSubmit(onSubmit)} className="notebook-creator-form">
                <div className="notebook-creator-content">
                  {/* Show uploaded file info */}
                  {uploadedDocument && !editingCollection && (
                    <div className="form-section">
                      <label className="form-label">Dokument</label>
                      <div className="uploaded-document-success">
                        <div className="uploaded-document-info">
                          <HiCheckCircle size={20} className="upload-success-icon" />
                          <span className="uploaded-document-title">
                            {uploadedDocument.filename || uploadedDocument.title}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={handleRemoveDocument}
                          disabled={loading}
                        >
                          Ändern
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Editing mode: show document info */}
                  {editingCollection && uploadedDocument && (
                    <div className="form-section">
                      <label className="form-label">Dokument</label>
                      <div className="uploaded-document-success">
                        <div className="uploaded-document-info">
                          <HiCheckCircle size={20} className="upload-success-icon" />
                          <span className="uploaded-document-title">{uploadedDocument.title}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="form-section">
                    <Input
                      name="name"
                      control={control}
                      label="Name des Notebooks"
                      placeholder="z.B. Klimapolitik-Dokumente"
                      rules={{
                        required: 'Name ist erforderlich',
                        maxLength: { value: 100, message: 'Name darf maximal 100 Zeichen haben' },
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
                        maxLength: {
                          value: 500,
                          message: 'Beschreibung darf maximal 500 Zeichen haben',
                        },
                      }}
                    />
                  </div>
                </div>

                <div className="form-actions button-container">
                  {!editingCollection && (
                    <div className="button-wrapper">
                      <button
                        type="button"
                        className="btn-secondary btn-back"
                        onClick={handleRemoveDocument}
                        disabled={loading}
                      >
                        <HiArrowLeft size={14} />
                        Zurück
                      </button>
                    </div>
                  )}
                  <div className="button-wrapper">
                    <button
                      type="submit"
                      className={`button submit-button ${loading ? 'submit-button--loading' : ''}`}
                      disabled={loading || !uploadedDocument}
                    >
                      {loading
                        ? 'Wird gespeichert...'
                        : editingCollection
                          ? 'Aktualisieren'
                          : 'Erstellen'}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default NotebookEditor;
