import { Badge, Button } from '@gruenerator/ui';
import { AnimatePresence, motion } from 'motion/react';
import { useState, useEffect, useCallback, useRef, type DragEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  HiCheckCircle,
  HiArrowLeft,
  HiUpload,
  HiX,
  HiPlus,
  HiPencil,
} from 'react-icons/hi';

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

interface UploadedDocument {
  id: string;
  title: string;
  filename?: string;
  [key: string]: unknown;
}

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.md', '.odt', '.rtf'];
const MAX_DOCUMENTS = 20;

function getFileTypeBadge(filename: string): { label: string; tagClass: string } {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'pdf':
      return {
        label: 'PDF',
        tagClass: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
      };
    case 'docx':
      return {
        label: 'DOCX',
        tagClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
      };
    case 'doc':
      return {
        label: 'DOC',
        tagClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
      };
    case 'odt':
      return {
        label: 'ODT',
        tagClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
      };
    case 'rtf':
      return {
        label: 'RTF',
        tagClass: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
      };
    case 'md':
      return {
        label: 'MD',
        tagClass: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      };
    case 'txt':
      return {
        label: 'TXT',
        tagClass: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      };
    default:
      return {
        label: ext.slice(0, 4).toUpperCase() || 'FILE',
        tagClass: 'bg-grey-200 text-grey-700 dark:bg-grey-800 dark:text-grey-300',
      };
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
  const [editing, setEditing] = useState<null | 'name' | 'desc' | 'labels'>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { uploadFileOnly, pollDocumentStatus } = useDocumentsStore();

  const { control, handleSubmit, reset, setValue } = useForm<NotebookEditorFormData>({
    defaultValues: {
      name: '',
      description: '',
    },
  });

  const watchedName = useWatch({ control, name: 'name' }) ?? '';
  const watchedDesc = useWatch({ control, name: 'description' }) ?? '';

  const commitName = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (trimmed) {
        setValue('name', trimmed.slice(0, 100), { shouldValidate: true, shouldDirty: true });
      }
      setEditing(null);
    },
    [setValue]
  );

  const commitDesc = useCallback(
    (value: string) => {
      setValue('description', value.slice(0, 500), { shouldDirty: true });
      setEditing(null);
    },
    [setValue]
  );

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
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-md">
                {/* Compact header: name / description / labels — click to edit */}
                <section className="rounded-xl bg-background-alt/50 px-sm py-sm">
                  {editing === 'name' ? (
                    <input
                      type="text"
                      defaultValue={watchedName}
                      autoFocus
                      maxLength={100}
                      placeholder="Name des Notebooks"
                      onBlur={(e) => commitName(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitName(e.currentTarget.value);
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditing(null);
                        }
                      }}
                      className="w-full bg-transparent text-lg font-semibold text-foreground outline-none placeholder:text-grey-400"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditing('name')}
                      className="group flex w-full items-center gap-xs rounded-md px-1 py-[2px] text-left transition-colors hover:bg-background"
                      aria-label="Name bearbeiten"
                    >
                      <span
                        className={cn(
                          'truncate text-lg font-semibold leading-tight',
                          watchedName ? 'text-foreground' : 'italic text-grey-400'
                        )}
                      >
                        {watchedName || 'Notebook benennen…'}
                      </span>
                      <HiPencil
                        size={12}
                        className="ml-auto shrink-0 text-grey-400 opacity-0 transition-opacity group-hover:opacity-60"
                      />
                    </button>
                  )}

                  {editing === 'desc' ? (
                    <textarea
                      defaultValue={watchedDesc}
                      autoFocus
                      rows={3}
                      maxLength={500}
                      placeholder="Kurze Beschreibung…"
                      onBlur={(e) => commitDesc(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          commitDesc(e.currentTarget.value);
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditing(null);
                        }
                      }}
                      className="mt-xs w-full resize-none rounded-md border border-grey-200 bg-background px-sm py-xs text-sm text-foreground outline-none placeholder:text-grey-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-grey-700"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditing('desc')}
                      className="group mt-[2px] flex w-full items-center gap-xs rounded-md px-1 py-[2px] text-left transition-colors hover:bg-background"
                      aria-label="Beschreibung bearbeiten"
                    >
                      <span
                        className={cn(
                          'line-clamp-1 text-sm',
                          watchedDesc ? 'text-grey-600 dark:text-grey-300' : 'italic text-grey-400'
                        )}
                      >
                        {watchedDesc || 'Beschreibung hinzufügen…'}
                      </span>
                      <HiPencil
                        size={11}
                        className="ml-auto shrink-0 text-grey-400 opacity-0 transition-opacity group-hover:opacity-60"
                      />
                    </button>
                  )}

                  <div className="mt-sm flex flex-wrap items-center gap-xs">
                    {labels.map((label) => (
                      <Badge
                        key={label}
                        variant="secondary"
                        className="gap-1 border-transparent bg-secondary-600 text-xs text-white"
                      >
                        {label}
                        <button
                          type="button"
                          className="ml-0.5 inline-flex items-center hover:text-grey-200"
                          onClick={() => handleRemoveLabel(label)}
                          aria-label={`Label "${label}" entfernen`}
                        >
                          <HiX size={11} />
                        </button>
                      </Badge>
                    ))}
                    {editing === 'labels' ? (
                      <div className="flex items-center gap-xs">
                        <input
                          type="text"
                          value={newLabel}
                          autoFocus
                          onChange={(e) => setNewLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddLabel();
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              setNewLabel('');
                              setEditing(null);
                            }
                          }}
                          onBlur={() => {
                            if (!newLabel.trim()) setEditing(null);
                          }}
                          placeholder="Label…"
                          maxLength={30}
                          disabled={loading || labels.length >= 10}
                          className="w-32 rounded-md border border-grey-300 bg-background px-sm py-[2px] text-xs text-foreground placeholder:text-grey-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-grey-600"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={handleAddLabel}
                          disabled={loading || !newLabel.trim() || labels.length >= 10}
                          aria-label="Label hinzufügen"
                        >
                          <HiPlus size={12} />
                        </Button>
                      </div>
                    ) : (
                      labels.length < 10 && (
                        <button
                          type="button"
                          onClick={() => setEditing('labels')}
                          className="inline-flex items-center gap-1 rounded-full border border-dashed border-grey-300 px-2 py-[2px] text-xs text-grey-500 transition-colors hover:border-primary-500 hover:text-primary-600 dark:border-grey-600"
                        >
                          <HiPlus size={10} />
                          {labels.length === 0 ? 'Label hinzufügen' : 'Weiteres Label'}
                        </button>
                      )
                    )}
                  </div>
                </section>

                {/* Documents: cards + dropzone */}
                {uploadedDocuments.length > 0 && (
                  <div className="space-y-xs">
                    <div className="flex items-baseline justify-between px-1">
                      <label className="text-xs font-medium uppercase tracking-wide text-grey-500">
                        Dokumente
                      </label>
                      <span className="text-xs text-grey-500">
                        {uploadedDocuments.length}/{MAX_DOCUMENTS}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-sm md:grid-cols-2 xl:grid-cols-3">
                      {uploadedDocuments.map((doc) => {
                        const isIndexing = indexingDocIds.has(doc.id);
                        const fileType = getFileTypeBadge(doc.filename || doc.title);
                        return (
                          <div
                            key={doc.id}
                            className={cn(
                              'group relative flex items-center gap-sm rounded-xl border border-grey-200 bg-background p-sm min-w-0 transition-all duration-200 dark:border-grey-800',
                              isIndexing
                                ? 'opacity-90'
                                : 'hover:border-grey-300 hover:shadow-sm dark:hover:border-grey-700'
                            )}
                          >
                            <span
                              className={cn(
                                'shrink-0 rounded-md px-1.5 py-[3px] text-[10px] font-semibold uppercase tracking-wide',
                                fileType.tagClass,
                                isIndexing && 'opacity-60'
                              )}
                              aria-hidden
                            >
                              {fileType.label}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div
                                className="truncate text-sm font-medium text-foreground"
                                title={doc.filename || doc.title}
                              >
                                {doc.filename || doc.title}
                              </div>
                              <div className="mt-[2px] flex items-center gap-xs text-xs text-grey-500">
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
                          'flex min-h-[52px] cursor-pointer items-center justify-center gap-sm rounded-lg border-2 border-dashed bg-background-alt px-sm transition-colors duration-200',
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
                  <Button
                    type="submit"
                    disabled={loading || uploadedDocuments.length === 0 || !watchedName.trim()}
                  >
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
