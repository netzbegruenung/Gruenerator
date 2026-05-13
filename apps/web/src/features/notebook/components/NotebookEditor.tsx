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
const MAX_DOCUMENTS = 20;

function getFileTypeBadge(filename: string): { label: string; bgClass: string } {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'pdf':
      return { label: 'PDF', bgClass: 'bg-red-500' };
    case 'docx':
      return { label: 'DOCX', bgClass: 'bg-blue-500' };
    case 'doc':
      return { label: 'DOC', bgClass: 'bg-blue-500' };
    case 'odt':
      return { label: 'ODT', bgClass: 'bg-emerald-500' };
    case 'rtf':
      return { label: 'RTF', bgClass: 'bg-orange-500' };
    case 'md':
      return { label: 'MD', bgClass: 'bg-slate-500' };
    case 'txt':
      return { label: 'TXT', bgClass: 'bg-slate-500' };
    default:
      return { label: ext.slice(0, 4).toUpperCase() || 'FILE', bgClass: 'bg-grey-500' };
  }
}

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
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [labels, setLabels] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [indexingDocIds, setIndexingDocIds] = useState<Set<string>>(() => new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { Input, Textarea } = useFormFields() as unknown as FormFieldComponents;
  const { uploadFileOnly, pollDocumentStatus } = useDocumentsStore();

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
        setUploadedDocuments(
          editingCollection.documents.map((doc) => ({
            id: doc.id,
            title: doc.title || 'Dokument',
          }))
        );
        setStep(2);
      }
    } else {
      reset({ name: '', description: '' });
      setLabels([]);
      setUploadedDocuments([]);
      setStep(1);
    }
  }, [editingCollection, reset]);

  const handleFilesUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setIsUploading(true);
      setUploadError(null);

      const remainingSlots = MAX_DOCUMENTS - uploadedDocuments.length;
      const filesToUpload = files.slice(0, remainingSlots);
      const skipped = files.length - filesToUpload.length;

      const wasEmpty = uploadedDocuments.length === 0;
      const newDocs: UploadedDocument[] = [];

      try {
        for (const file of filesToUpload) {
          const doc = await uploadFileOnly(file, file.name);
          newDocs.push({ id: doc.id, title: doc.title || file.name });
        }
        if (newDocs.length > 0) {
          setUploadedDocuments((prev) => [...prev, ...newDocs]);
          setIndexingDocIds((prev) => {
            const next = new Set(prev);
            newDocs.forEach((d) => next.add(d.id));
            return next;
          });
          newDocs.forEach((d) => {
            void pollDocumentStatus(d.id).finally(() => {
              setIndexingDocIds((prev) => {
                if (!prev.has(d.id)) return prev;
                const next = new Set(prev);
                next.delete(d.id);
                return next;
              });
            });
          });
          if (wasEmpty) {
            const firstTitle = newDocs[0].title.replace(/\.[^/.]+$/, '');
            const suggestedName =
              firstTitle.length > 60 ? `${firstTitle.slice(0, 60).trimEnd()}…` : firstTitle;
            setValue('name', suggestedName, { shouldValidate: true });
            setStep(2);
          }
        }
        if (skipped > 0) {
          setUploadError(
            `${skipped} Datei${skipped === 1 ? '' : 'en'} übersprungen — maximal ${MAX_DOCUMENTS} Dateien pro Notebook.`
          );
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Fehler beim Hochladen der Datei');
      } finally {
        setIsUploading(false);
      }
    },
    [uploadFileOnly, pollDocumentStatus, setValue, uploadedDocuments.length]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) void handleFilesUpload(files);
      e.target.value = '';
    },
    [handleFilesUpload]
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length > 0) void handleFilesUpload(files);
    },
    [handleFilesUpload]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleRemoveDocument = useCallback(
    (id: string) => {
      setUploadedDocuments((prev) => {
        const next = prev.filter((doc) => doc.id !== id);
        if (next.length === 0 && !editingCollection) {
          setStep(1);
          reset({ name: '', description: '' });
          setLabels([]);
        }
        return next;
      });
    },
    [reset, editingCollection]
  );

  const handleClearDocuments = useCallback(() => {
    setUploadedDocuments([]);
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
    if (uploadedDocuments.length === 0) return;

    const qaData = {
      ...data,
      selectionMode: 'documents',
      documents: uploadedDocuments.map((doc) => doc.id),
      documentMeta: uploadedDocuments.map((doc) => ({ id: doc.id, title: doc.title })),
      id: editingCollection?.id,
      labels,
    };

    await onSave(qaData);
  };

  const handleCancel = (): void => {
    reset();
    setUploadedDocuments([]);
    setLabels([]);
    setNewLabel('');
    setStep(1);
    if (onCancel) onCancel();
  };

  return (
    <motion.div
      className="p-md sm:p-lg"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div>
        {/* Header: title - dots - close */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-sm pb-md">
          <span className="text-base font-semibold text-foreground truncate">
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
                      multiple
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
                      <div className="flex flex-col items-center gap-xs p-md sm:p-lg text-center">
                        <HiUpload size={28} className="text-grey-400" />
                        <p className="m-0 text-[0.9rem] font-medium text-foreground">
                          Dateien hier ablegen oder klicken
                        </p>
                        <p className="m-0 text-xs text-grey-500 break-words">
                          PDF, DOCX, TXT, MD, ODT, RTF — bis zu {MAX_DOCUMENTS} Dateien (max. 50 MB
                          pro Datei)
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
                  {uploadedDocuments.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-foreground">
                        Dokumente ({uploadedDocuments.length}/{MAX_DOCUMENTS})
                      </label>
                      <div className="mt-xs grid grid-cols-2 gap-xs max-sm:grid-cols-1">
                        {uploadedDocuments.map((doc) => {
                          const isIndexing = indexingDocIds.has(doc.id);
                          const fileType = getFileTypeBadge(doc.filename || doc.title);
                          return (
                            <div
                              key={doc.id}
                              className={cn(
                                'group relative flex items-center gap-sm rounded-md bg-background-alt p-sm min-w-0 transition-all duration-200',
                                isIndexing
                                  ? 'opacity-90'
                                  : 'hover:bg-grey-100 hover:shadow-sm dark:hover:bg-grey-800/60'
                              )}
                            >
                              <div
                                className={cn(
                                  'flex h-[26px] w-[34px] shrink-0 items-center justify-center rounded-sm text-[10px] font-bold uppercase tracking-wide text-white',
                                  fileType.bgClass,
                                  isIndexing && 'opacity-60'
                                )}
                                aria-hidden
                              >
                                {fileType.label}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div
                                  className="truncate text-sm font-medium text-foreground"
                                  title={doc.filename || doc.title}
                                >
                                  {doc.filename || doc.title}
                                </div>
                                <div className="mt-[1px] flex items-center gap-xs text-xs text-grey-500">
                                  {isIndexing ? (
                                    <>
                                      <div className="size-3 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
                                      <span>Wird verarbeitet…</span>
                                    </>
                                  ) : (
                                    <>
                                      <HiCheckCircle size={12} className="text-green-600" />
                                      <span>Bereit</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                className={cn(
                                  'shrink-0 transition-opacity',
                                  isIndexing
                                    ? 'opacity-60'
                                    : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                                )}
                                onClick={() => handleRemoveDocument(doc.id)}
                                disabled={loading}
                                aria-label={`${doc.title} entfernen`}
                              >
                                <HiX size={12} />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                      {uploadedDocuments.length < MAX_DOCUMENTS && (
                        <div
                          className={cn(
                            'mt-xs flex min-h-[56px] cursor-pointer items-center justify-center gap-sm rounded-lg border-2 border-dashed bg-background-alt px-sm transition-colors duration-200',
                            isDragOver
                              ? 'border-primary-500 bg-green-50 dark:bg-secondary-900'
                              : 'border-grey-300 hover:border-primary-500 hover:bg-background dark:border-grey-600',
                            (isUploading || loading) && 'cursor-default opacity-60'
                          )}
                          onDrop={handleDrop}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onClick={() => {
                            if (isUploading || loading) return;
                            fileInputRef.current?.click();
                          }}
                        >
                          {isUploading ? (
                            <>
                              <div className="size-4 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
                              <span className="text-sm text-grey-500">Wird hochgeladen…</span>
                            </>
                          ) : (
                            <>
                              <HiUpload className="text-grey-400" />
                              <span className="text-sm font-medium text-foreground">
                                Weitere Dateien ablegen oder klicken
                              </span>
                              <span className="text-xs text-grey-500">
                                ({MAX_DOCUMENTS - uploadedDocuments.length} verbleibend)
                              </span>
                            </>
                          )}
                        </div>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept={ACCEPTED_EXTENSIONS.join(',')}
                        onChange={handleFileSelect}
                        style={{ display: 'none' }}
                      />
                      {uploadError && <p className="mt-xs text-sm text-red-600">{uploadError}</p>}
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

                <div className="flex flex-wrap justify-end gap-sm pt-md border-t border-grey-200 dark:border-grey-700">
                  {!editingCollection && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClearDocuments}
                      disabled={loading}
                    >
                      <HiArrowLeft size={14} />
                      Zurück
                    </Button>
                  )}
                  <Button type="submit" disabled={loading || uploadedDocuments.length === 0}>
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
