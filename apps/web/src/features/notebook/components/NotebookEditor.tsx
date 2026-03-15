import { Badge, Button } from '@gruenerator/ui';
import { AnimatePresence, motion } from 'motion/react';
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ComponentType,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { useForm } from 'react-hook-form';
import { HiCheckCircle, HiArrowLeft, HiUpload, HiX, HiPlus } from 'react-icons/hi';

import { useFormFields } from '../../../components/common/Form/hooks';
import { useDocumentsStore } from '../../../stores/documentsStore';
import { cn } from '../../../utils/cn';

interface NotebookCollection {
  id?: string;
  name: string;
  description?: string;
  documents?: { id: string; title?: string }[];
  labels?: string[];
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
  const [labels, setLabels] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState('');
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
      setLabels(editingCollection.labels || []);
      if (editingCollection.documents?.length) {
        const doc = editingCollection.documents[0];
        setUploadedDocument({ id: doc.id, title: doc.title || 'Dokument' });
        setStep(2);
      }
    } else {
      reset({ name: '', description: '' });
      setLabels([]);
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
        setUploadedDocument({ id: doc.id, title: doc.title || file.name });
        setValue('name', doc.title.replace(/\.[^/.]+$/, ''), { shouldValidate: true });
        setStep(2);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Fehler beim Hochladen der Datei');
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
    setLabels([]);
  }, [reset]);

  const handleAddLabel = useCallback(() => {
    const trimmed = newLabel.trim();
    if (!trimmed || labels.includes(trimmed) || labels.length >= 10) {
      setNewLabel('');
      return;
    }
    setLabels((prev) => [...prev, trimmed]);
    setNewLabel('');
  }, [newLabel, labels]);

  const handleRemoveLabel = useCallback((labelToRemove: string) => {
    setLabels((prev) => prev.filter((l) => l !== labelToRemove));
  }, []);

  const handleLabelKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddLabel();
      }
    },
    [handleAddLabel]
  );

  const onSubmit = async (data: NotebookEditorFormData): Promise<void> => {
    if (!uploadedDocument) return;

    const qaData = {
      ...data,
      selectionMode: 'documents',
      documents: [uploadedDocument.id],
      id: editingCollection?.id,
      labels,
    };

    await onSave(qaData);
  };

  const handleCancel = (): void => {
    reset();
    setUploadedDocument(null);
    setLabels([]);
    setNewLabel('');
    setStep(1);
    if (onCancel) onCancel();
  };

  return (
    <motion.div
      className="p-lg"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div>
        {/* Header: title - dots - close */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-sm pb-md">
          <span className="text-base font-semibold text-foreground whitespace-nowrap">
            {editingCollection
              ? 'Notebook bearbeiten'
              : step === 1
                ? 'Dokument hochladen'
                : 'Notebook erstellen'}
          </span>

          {!editingCollection && (
            <div className="flex items-center justify-center gap-2">
              <div
                className={cn(
                  'size-2 rounded-full transition-all duration-250',
                  step === 1 ? 'bg-primary-500 scale-125' : 'bg-primary-500 opacity-45'
                )}
              />
              <div
                className={cn(
                  'size-2 rounded-full transition-all duration-250',
                  step === 2 ? 'bg-primary-500 scale-125' : 'bg-grey-300'
                )}
              />
            </div>
          )}

          <Button
            variant="ghost"
            size="icon-sm"
            className="justify-self-end rounded-full"
            onClick={handleCancel}
            disabled={isUploading || loading}
            aria-label="Schließen"
          >
            <HiX size={18} />
          </Button>
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
              <div className="space-y-sm">
                <div>
                  <div
                    className={cn(
                      'flex items-center justify-center min-h-[160px] border-2 border-dashed rounded-lg bg-background-alt cursor-pointer transition-colors duration-200',
                      isDragOver
                        ? 'border-primary-500 bg-green-50 dark:bg-secondary-900'
                        : 'border-grey-300 dark:border-grey-600 hover:border-primary-500 hover:bg-background',
                      isUploading && 'cursor-default opacity-85'
                    )}
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
                      <div className="flex flex-col items-center gap-sm text-grey-500 text-sm">
                        <div className="size-6 animate-spin rounded-full border-3 border-grey-200 border-t-primary-500" />
                        <span>Wird hochgeladen…</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-xs p-lg text-center">
                        <HiUpload size={28} className="text-grey-400" />
                        <p className="m-0 text-[0.9rem] font-medium text-foreground">
                          Datei hier ablegen oder klicken
                        </p>
                        <p className="m-0 text-xs text-grey-500">
                          PDF, DOCX, TXT, MD, ODT, RTF (max. 50 MB)
                        </p>
                      </div>
                    )}
                  </div>

                  {uploadError && <p className="mt-sm text-sm text-red-600">{uploadError}</p>}
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
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-sm">
                <div className="space-y-sm">
                  {uploadedDocument && !editingCollection && (
                    <div>
                      <label className="text-sm font-medium text-foreground">Dokument</label>
                      <div className="mt-xs flex items-center justify-between p-md bg-background-alt border border-green-300 rounded-lg">
                        <div className="flex items-center gap-sm min-w-0">
                          <HiCheckCircle size={20} className="text-green-600 shrink-0" />
                          <span className="font-medium text-foreground truncate">
                            {uploadedDocument.filename || uploadedDocument.title}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleRemoveDocument}
                          disabled={loading}
                        >
                          Ändern
                        </Button>
                      </div>
                    </div>
                  )}

                  {editingCollection && uploadedDocument && (
                    <div>
                      <label className="text-sm font-medium text-foreground">Dokument</label>
                      <div className="mt-xs flex items-center justify-between p-md bg-background-alt border border-green-300 rounded-lg">
                        <div className="flex items-center gap-sm min-w-0">
                          <HiCheckCircle size={20} className="text-green-600 shrink-0" />
                          <span className="font-medium text-foreground truncate">
                            {uploadedDocument.title}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
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

                  <div>
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

                  <div>
                    <label className="text-sm font-medium text-foreground">Labels (optional)</label>
                    <div className="mt-xs flex items-center gap-xs">
                      <input
                        type="text"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        onKeyDown={handleLabelKeyDown}
                        placeholder="Label hinzufügen…"
                        maxLength={30}
                        disabled={loading || labels.length >= 10}
                        className="flex-1 rounded-md border border-grey-300 dark:border-grey-600 bg-background px-sm py-xs text-sm text-foreground placeholder:text-grey-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddLabel}
                        disabled={loading || !newLabel.trim() || labels.length >= 10}
                      >
                        <HiPlus size={14} />
                      </Button>
                    </div>
                    {labels.length > 0 && (
                      <div className="mt-xs flex flex-wrap gap-xs">
                        {labels.map((label) => (
                          <Badge
                            key={label}
                            variant="secondary"
                            className="bg-secondary-600 text-white border-transparent gap-1"
                          >
                            {label}
                            <button
                              type="button"
                              className="ml-0.5 inline-flex items-center hover:text-grey-200"
                              onClick={() => handleRemoveLabel(label)}
                              aria-label={`Label "${label}" entfernen`}
                            >
                              <HiX size={12} />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-md pt-lg border-t border-grey-200 dark:border-grey-700">
                  {!editingCollection && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRemoveDocument}
                      disabled={loading}
                    >
                      <HiArrowLeft size={14} />
                      Zurück
                    </Button>
                  )}
                  <Button type="submit" disabled={loading || !uploadedDocument}>
                    {loading
                      ? 'Wird gespeichert...'
                      : editingCollection
                        ? 'Aktualisieren'
                        : 'Erstellen'}
                  </Button>
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
