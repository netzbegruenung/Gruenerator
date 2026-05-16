import { type NotebookEditorSavePayload } from '@gruenerator/contracts';
import { Badge, Button, Input, Label, Separator, Switch } from '@gruenerator/ui';
import { AnimatePresence, motion } from 'motion/react';
import { useState, useEffect, useCallback, useRef, type DragEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { HiArrowLeft, HiUpload, HiX, HiPlus, HiPencil } from 'react-icons/hi';

import { useDocumentsStore } from '../../../stores/documentsStore';
import { cn } from '../../../utils/cn';

type PublicOwnership = 'owner' | 'public_data';

interface NotebookCollection {
  id?: string;
  name: string;
  description?: string;
  documents?: { id: string; title?: string }[];
  labels?: string[];
  is_public?: boolean;
  public_ownership?: PublicOwnership | null;
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
const MAX_DOCUMENTS = 100;

function getFileTypeStyle(filename: string): { label: string; cornerClass: string } {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'pdf':
      return { label: 'PDF', cornerClass: 'bg-red-400 dark:bg-red-700' };
    case 'docx':
      return { label: 'DOCX', cornerClass: 'bg-blue-400 dark:bg-blue-700' };
    case 'doc':
      return { label: 'DOC', cornerClass: 'bg-blue-400 dark:bg-blue-700' };
    case 'odt':
      return { label: 'ODT', cornerClass: 'bg-emerald-400 dark:bg-emerald-700' };
    case 'rtf':
      return { label: 'RTF', cornerClass: 'bg-orange-400 dark:bg-orange-700' };
    case 'md':
      return { label: 'MD', cornerClass: 'bg-slate-400 dark:bg-slate-600' };
    case 'txt':
      return { label: 'TXT', cornerClass: 'bg-slate-400 dark:bg-slate-600' };
    default:
      return {
        label: ext.slice(0, 4).toUpperCase() || 'FILE',
        cornerClass: 'bg-grey-400 dark:bg-grey-600',
      };
  }
}

function hasFileDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes('Files');
}

interface NotebookEditorProps {
  onSave: (data: NotebookEditorSavePayload) => Promise<void>;
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
  const [isPublic, setIsPublic] = useState(false);
  const [publicOwnership, setPublicOwnership] = useState<PublicOwnership | null>(null);
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
      setIsPublic(editingCollection.is_public === true);
      setPublicOwnership(editingCollection.public_ownership ?? null);
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
      setIsPublic(false);
      setPublicOwnership(null);
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
    (e: DragEvent<HTMLElement>) => {
      if (!hasFileDrag(e)) return;
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length > 0) void handleFilesUpload(files);
    },
    [handleFilesUpload]
  );

  const handleDragEnter = useCallback((e: DragEvent<HTMLElement>) => {
    if (!hasFileDrag(e)) return;
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLElement>) => {
    if (!hasFileDrag(e)) return;
    e.preventDefault();
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLElement>) => {
    if (!hasFileDrag(e)) return;
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
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
    if (isPublic && !publicOwnership) return;

    const payload: NotebookEditorSavePayload = {
      ...(editingCollection?.id ? { id: editingCollection.id } : {}),
      name: data.name,
      description: data.description,
      selectionMode: 'documents',
      documents: uploadedDocuments.map((doc) => doc.id),
      documentMeta: uploadedDocuments.map((doc) => ({ id: doc.id, title: doc.title })),
      labels,
      isPublic,
      publicOwnership: isPublic ? publicOwnership : null,
    };

    await onSave(payload);
  };

  const handleCancel = (): void => {
    reset();
    setUploadedDocuments([]);
    setLabels([]);
    setNewLabel('');
    setIsPublic(false);
    setPublicOwnership(null);
    setStep(1);
    if (onCancel) onCancel();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <div>
        {!editingCollection && (
          <div className="flex items-center justify-center gap-2 pb-md">
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
                    onDragEnter={handleDragEnter}
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
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-lg">
                {!editingCollection && (
                  <section className="space-y-xs">
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
                        className="w-full bg-transparent text-2xl font-semibold text-foreground outline-none placeholder:text-grey-400"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditing('name')}
                        className="group flex w-full items-center gap-xs rounded-md px-1 py-[2px] text-left transition-colors hover:bg-background-alt/50"
                        aria-label="Name bearbeiten"
                      >
                        <span
                          className={cn(
                            'truncate text-2xl font-semibold leading-tight',
                            watchedName ? 'text-foreground-heading' : 'italic text-grey-400'
                          )}
                        >
                          {watchedName || 'Notebook benennen…'}
                        </span>
                        <HiPencil
                          size={14}
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
                        className="w-full resize-none rounded-md border border-grey-200 bg-background px-sm py-xs text-sm text-foreground outline-none placeholder:text-grey-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-grey-700"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditing('desc')}
                        className="group flex w-full items-center gap-xs rounded-md px-1 py-[2px] text-left transition-colors hover:bg-background-alt/50"
                        aria-label="Beschreibung bearbeiten"
                      >
                        <span
                          className={cn(
                            'line-clamp-2 text-base leading-relaxed',
                            watchedDesc
                              ? 'text-grey-600 dark:text-grey-300'
                              : 'italic text-grey-400'
                          )}
                        >
                          {watchedDesc || 'Beschreibung hinzufügen…'}
                        </span>
                        <HiPencil
                          size={12}
                          className="ml-auto shrink-0 text-grey-400 opacity-0 transition-opacity group-hover:opacity-60"
                        />
                      </button>
                    )}
                  </section>
                )}

                <section className="flex flex-wrap items-center gap-xs">
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
                      <Input
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
                        className="h-7 w-32 text-xs"
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
                </section>

                <section
                  className="relative space-y-md"
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="flex items-center justify-between gap-md">
                    <h2 className="text-xl font-semibold text-foreground-heading">Dokumente</h2>
                    <div className="flex items-center gap-sm">
                      <span className="text-sm text-grey-500">
                        {uploadedDocuments.length}/{MAX_DOCUMENTS}
                      </span>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={
                          loading || isUploading || uploadedDocuments.length >= MAX_DOCUMENTS
                        }
                        aria-label="Dokumente hinzufügen"
                      >
                        <HiPlus size={16} />
                      </Button>
                    </div>
                  </div>

                  {uploadedDocuments.length === 0 ? (
                    <p className="py-lg text-center text-sm text-grey-500">
                      Noch keine Dokumente. Ziehe Dateien hierher oder klicke auf +.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-md sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                      {uploadedDocuments.map((doc) => {
                        const isIndexing = indexingDocIds.has(doc.id);
                        const fileType = getFileTypeStyle(doc.filename || doc.title);
                        return (
                          <div
                            key={doc.id}
                            className={cn(
                              'group relative flex min-h-[112px] min-w-0 flex-col gap-xs overflow-hidden rounded-xl border border-grey-200 bg-background p-md transition-all duration-200 dark:border-grey-800',
                              isIndexing ? 'opacity-90' : 'hover:shadow-sm'
                            )}
                            aria-label={`${fileType.label}: ${doc.filename || doc.title}`}
                          >
                            <div
                              className={cn(
                                'pointer-events-none absolute right-0 top-0 h-[3px] w-12 rounded-bl-md',
                                fileType.cornerClass
                              )}
                              aria-hidden
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              className={cn(
                                'absolute right-1 top-1 transition-opacity',
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
                            <div
                              className="line-clamp-3 break-words pr-6 text-sm font-medium leading-snug text-foreground"
                              title={doc.filename || doc.title}
                            >
                              {doc.filename || doc.title}
                            </div>
                            {isIndexing ? (
                              <div className="mt-auto flex items-center gap-xs text-xs text-grey-500">
                                <div className="size-3 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
                                <span>Wird verarbeitet…</span>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
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
                  {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

                  {isDragOver && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-sm rounded-xl border-2 border-dashed border-primary-500 bg-primary-500/10 backdrop-blur-[2px]">
                      <HiUpload className="text-primary-700 dark:text-primary-300" />
                      <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
                        Dateien hier ablegen
                      </span>
                    </div>
                  )}
                </section>

                <Separator />

                <section className="space-y-md">
                  <div className="flex items-center justify-between gap-md">
                    <div className="space-y-xs">
                      <Label htmlFor="notebook-public-toggle" className="text-base">
                        Notebook öffentlich machen
                      </Label>
                      <p className="text-sm text-grey-500 dark:text-grey-400">
                        Dein Notebook wird unter „Von der Basis" auf der Notebooks-Seite sichtbar.
                      </p>
                    </div>
                    <Switch
                      id="notebook-public-toggle"
                      checked={isPublic}
                      onCheckedChange={(checked) => {
                        setIsPublic(checked);
                        if (!checked) setPublicOwnership(null);
                      }}
                      disabled={loading}
                    />
                  </div>

                  {isPublic && (
                    <fieldset className="space-y-xs rounded-md border border-grey-200 p-md dark:border-grey-700">
                      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-grey-500">
                        Bitte bestätige
                      </legend>
                      <label className="flex cursor-pointer items-start gap-sm rounded-md px-1 py-xs transition-colors hover:bg-background-alt/50">
                        <input
                          type="radio"
                          name="public-ownership"
                          value="owner"
                          checked={publicOwnership === 'owner'}
                          onChange={() => setPublicOwnership('owner')}
                          disabled={loading}
                          className="mt-0.5 accent-primary-500"
                        />
                        <span className="text-sm text-foreground">
                          Ich besitze die Daten oder habe die Rechte zur Veröffentlichung
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-sm rounded-md px-1 py-xs transition-colors hover:bg-background-alt/50">
                        <input
                          type="radio"
                          name="public-ownership"
                          value="public_data"
                          checked={publicOwnership === 'public_data'}
                          onChange={() => setPublicOwnership('public_data')}
                          disabled={loading}
                          className="mt-0.5 accent-primary-500"
                        />
                        <span className="text-sm text-foreground">
                          Die Daten sind öffentlich verfügbar (z.B. offizielle Dokumente,
                          Pressemitteilungen)
                        </span>
                      </label>
                    </fieldset>
                  )}
                </section>

                <Separator />
                <div className="flex flex-wrap justify-end gap-sm">
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
                    disabled={
                      loading ||
                      uploadedDocuments.length === 0 ||
                      !watchedName.trim() ||
                      (isPublic && !publicOwnership)
                    }
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
