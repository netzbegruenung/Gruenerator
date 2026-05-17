import {
  type LinkedDocRef,
  type NotebookEditorSavePayload,
  type WolkeFolderRef,
} from '@gruenerator/contracts';
import { useState, useEffect, useCallback, useMemo, useRef, type DragEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { useDocumentsStore } from '../../../../stores/documentsStore';

import { type ImportedLinkedDoc } from '../NotebookEditorDocsSection';
import { type ImportedWolkeDocument } from '../NotebookEditorWolkeSection';

import {
  MAX_DOCUMENTS,
  TOTAL_STEPS,
  hasFileDrag,
  type NotebookCollection,
  type NotebookEditorFormData,
  type UploadedDocument,
} from './shared';

interface UseNotebookEditorStateArgs {
  onSave: (data: NotebookEditorSavePayload) => Promise<void>;
  editingCollection: NotebookCollection | null;
  loading: boolean;
  onCancel?: () => void;
}

export function useNotebookEditorState({
  onSave,
  editingCollection,
  loading,
  onCancel,
}: UseNotebookEditorStateArgs) {
  const [step, setStep] = useState(0);
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
  // Files the user picked but hasn't committed yet — rendered as <FileCard>
  // previews. Lets the user review/remove before triggering uploads instead of
  // auto-uploading on file-input change (Gmail-attachment pattern).
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [labels, setLabels] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [indexingDocIds, setIndexingDocIds] = useState<Set<string>>(() => new Set());
  const [addingLabel, setAddingLabel] = useState(false);
  const [wolkeFolders, setWolkeFolders] = useState<WolkeFolderRef[]>([]);
  const [wolkePanelOpen, setWolkePanelOpen] = useState(false);
  const [linkedDocs, setLinkedDocs] = useState<LinkedDocRef[]>([]);
  const [docsPanelOpen, setDocsPanelOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { uploadFileOnly, pollDocumentStatus } = useDocumentsStore();

  const { control, handleSubmit, reset, setValue, getValues } = useForm<NotebookEditorFormData>({
    defaultValues: { name: '', description: '' },
  });

  const watchedName = useWatch({ control, name: 'name' }) ?? '';
  const watchedDesc = useWatch({ control, name: 'description' }) ?? '';

  useEffect(() => {
    if (editingCollection) {
      reset({
        name: editingCollection.name || '',
        description: editingCollection.description || '',
      });
      setLabels(editingCollection.labels || []);
      setWolkeFolders(editingCollection.wolke_folders ?? []);
      setLinkedDocs(editingCollection.linked_docs ?? []);
      if (editingCollection.documents?.length) {
        setUploadedDocuments(
          editingCollection.documents.map((doc) => ({
            id: doc.id,
            title: doc.title || 'Dokument',
            ...(doc.source_type === 'wolke' ? { source: 'wolke' as const } : {}),
          }))
        );
      }
      setStep(0);
    } else {
      reset({ name: '', description: '' });
      setLabels([]);
      setWolkeFolders([]);
      setLinkedDocs([]);
      setUploadedDocuments([]);
      setStagedFiles([]);
      setStep(0);
      setWolkePanelOpen(false);
      setDocsPanelOpen(false);
    }
  }, [editingCollection, reset]);

  useEffect(() => {
    if (linkedDocs.length > 0) setDocsPanelOpen(true);
  }, [linkedDocs.length]);

  useEffect(() => {
    if (wolkeFolders.length > 0) setWolkePanelOpen(true);
  }, [wolkeFolders.length]);

  // Stage files for upload (preview-then-commit pattern). Slot check accounts
  // for both already-uploaded docs and other files still in the staging tray.
  // Auto-suggests a notebook name from the first file when adding to an empty
  // create-flow (matches the previous immediate-upload behaviour).
  const handleStageFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      setUploadError(null);

      const remainingSlots = MAX_DOCUMENTS - uploadedDocuments.length - stagedFiles.length;
      const accepted = files.slice(0, Math.max(0, remainingSlots));
      const skipped = files.length - accepted.length;

      if (accepted.length > 0) {
        setStagedFiles((prev) => [...prev, ...accepted]);

        if (
          uploadedDocuments.length === 0 &&
          stagedFiles.length === 0 &&
          !editingCollection &&
          !getValues('name').trim()
        ) {
          const firstTitle = accepted[0].name.replace(/\.[^/.]+$/, '');
          const suggestedName =
            firstTitle.length > 60 ? `${firstTitle.slice(0, 60).trimEnd()}…` : firstTitle;
          setValue('name', suggestedName, { shouldValidate: true });
        }
      }
      if (skipped > 0) {
        setUploadError(
          `${skipped} Datei${skipped === 1 ? '' : 'en'} übersprungen — maximal ${MAX_DOCUMENTS} Dateien pro Notebook.`
        );
      }
    },
    [uploadedDocuments.length, stagedFiles.length, editingCollection, getValues, setValue]
  );

  const handleUnstageFile = useCallback((index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Commit staged files: run the actual uploads sequentially, mirror the prior
  // post-upload success path (pollDocumentStatus per doc, indexingDocIds set).
  const handleCommitStagedUpload = useCallback(async () => {
    if (stagedFiles.length === 0 || isUploading) return;
    setIsUploading(true);
    setUploadError(null);

    const filesToUpload = stagedFiles;
    const newDocs: UploadedDocument[] = [];

    try {
      for (const file of filesToUpload) {
        console.debug('[notebook-upload] uploading', {
          filename: file.name,
          size: file.size,
        });
        const doc = await uploadFileOnly(file, file.name);
        console.debug('[notebook-upload] uploaded', {
          docId: doc.id,
          title: doc.title,
          status: doc.status,
        });
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
        setStagedFiles([]);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Fehler beim Hochladen der Datei');
    } finally {
      setIsUploading(false);
    }
  }, [stagedFiles, isUploading, uploadFileOnly, pollDocumentStatus]);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) handleStageFiles(files);
      e.target.value = '';
    },
    [handleStageFiles]
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLElement>) => {
      if (!hasFileDrag(e)) return;
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length > 0) handleStageFiles(files);
    },
    [handleStageFiles]
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

  const handleRemoveDocument = useCallback((id: string) => {
    setUploadedDocuments((prev) => prev.filter((doc) => doc.id !== id));
  }, []);

  const handleDocsImported = useCallback(
    (docs: ImportedLinkedDoc[]) => {
      if (docs.length === 0) return;
      setUploadedDocuments((prev) => {
        const seen = new Set(prev.map((d) => d.id));
        const additions: UploadedDocument[] = docs
          .filter((d) => !seen.has(d.id))
          .map((d) => ({ id: d.id, title: d.title }));
        return [...prev, ...additions];
      });
      setIndexingDocIds((prev) => {
        const next = new Set(prev);
        docs.forEach((d) => next.add(d.id));
        return next;
      });
      docs.forEach((d) => {
        void pollDocumentStatus(d.id).finally(() => {
          setIndexingDocIds((prev) => {
            if (!prev.has(d.id)) return prev;
            const next = new Set(prev);
            next.delete(d.id);
            return next;
          });
        });
      });
    },
    [pollDocumentStatus]
  );

  const handleWolkeDocsImported = useCallback(
    (docs: ImportedWolkeDocument[]) => {
      if (docs.length === 0) return;
      setUploadedDocuments((prev) => {
        const seen = new Set(prev.map((d) => d.id));
        const additions: UploadedDocument[] = docs
          .filter((d) => !seen.has(d.id))
          .map((d) => ({ id: d.id, title: d.title, source: 'wolke' as const }));
        return [...prev, ...additions];
      });
      setIndexingDocIds((prev) => {
        const next = new Set(prev);
        docs.forEach((d) => next.add(d.id));
        return next;
      });
      docs.forEach((d) => {
        void pollDocumentStatus(d.id).finally(() => {
          setIndexingDocIds((prev) => {
            if (!prev.has(d.id)) return prev;
            const next = new Set(prev);
            next.delete(d.id);
            return next;
          });
        });
      });
    },
    [pollDocumentStatus]
  );

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

  const wolkeDocuments = useMemo(
    () => uploadedDocuments.filter((d) => d.source === 'wolke'),
    [uploadedDocuments]
  );
  const linkedDocDocumentIds = useMemo(
    () => new Set(linkedDocs.flatMap((d) => (d.documentId ? [d.documentId] : []))),
    [linkedDocs]
  );
  const manualDocuments = useMemo(
    () => uploadedDocuments.filter((d) => d.source !== 'wolke' && !linkedDocDocumentIds.has(d.id)),
    [uploadedDocuments, linkedDocDocumentIds]
  );

  const handleBack = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);
  const handleNext = useCallback(() => setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1)), []);

  // Block advancing while files are still staged — uncommitted picks would be lost.
  const canAdvanceFromSources = uploadedDocuments.length > 0 && stagedFiles.length === 0;
  const canAdvanceFromDetails = watchedName.trim().length > 0;

  const onSubmit = useCallback(
    async (data: NotebookEditorFormData): Promise<void> => {
      if (uploadedDocuments.length === 0) return;
      const payload: NotebookEditorSavePayload = {
        ...(editingCollection?.id ? { id: editingCollection.id } : {}),
        name: data.name,
        description: data.description,
        selectionMode: 'documents',
        documents: uploadedDocuments.map((doc) => doc.id),
        documentMeta: uploadedDocuments.map((doc) => ({ id: doc.id, title: doc.title })),
        labels,
        wolkeFolders,
        linkedDocs,
      };
      await onSave(payload);
    },
    [onSave, editingCollection, uploadedDocuments, labels, wolkeFolders, linkedDocs]
  );

  const handleCancel = useCallback(() => {
    reset();
    setUploadedDocuments([]);
    setStagedFiles([]);
    setLabels([]);
    setNewLabel('');
    setWolkeFolders([]);
    setLinkedDocs([]);
    setStep(0);
    if (onCancel) onCancel();
  }, [reset, onCancel]);

  const submitForm = useCallback(() => void handleSubmit(onSubmit)(), [handleSubmit, onSubmit]);

  return {
    step,
    uploadedDocuments,
    stagedFiles,
    isUploading,
    uploadError,
    isDragOver,
    labels,
    newLabel,
    indexingDocIds,
    addingLabel,
    wolkeFolders,
    wolkePanelOpen,
    linkedDocs,
    docsPanelOpen,
    fileInputRef,
    watchedName,
    watchedDesc,
    wolkeDocuments,
    manualDocuments,
    loading,
    canAdvanceFromSources,
    canAdvanceFromDetails,
    setNewLabel,
    setAddingLabel,
    setWolkeFolders,
    setWolkePanelOpen,
    setLinkedDocs,
    setDocsPanelOpen,
    setValue,
    handleSubmit,
    onSubmit,
    submitForm,
    handleFileSelect,
    handleDrop,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleRemoveDocument,
    handleUnstageFile,
    handleCommitStagedUpload,
    handleWolkeDocsImported,
    handleDocsImported,
    handleAddLabel,
    handleRemoveLabel,
    handleBack,
    handleNext,
    handleCancel,
  };
}

export type NotebookEditorStateBundle = ReturnType<typeof useNotebookEditorState>;
