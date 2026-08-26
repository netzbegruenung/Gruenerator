import {
  type LinkedDocRef,
  type NotebookEditorSavePayload,
  type WolkeFolderRef,
  type WordpressSiteRef,
} from '@gruenerator/contracts';
import { toast } from '@gruenerator/ui';
import { useState, useEffect, useCallback, useMemo, useRef, type DragEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { useDocumentsStore } from '../../../../stores/documentsStore';
import { type ImportedLinkedDoc } from '../NotebookEditorDocsSection';
import { type ImportedWolkeDocument } from '../NotebookEditorWolkeSection';
import { type ImportedWordpressDocument } from '../NotebookEditorWordpressSection';

import {
  MAX_DOCUMENTS,
  TOTAL_STEPS,
  describeRejectedFiles,
  hasFileDrag,
  partitionUploadableFiles,
  type DocumentWithSource,
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
  // Documents whose background processing failed, keyed by id with the reason.
  // Without this the spinner just disappeared and the row looked indexed.
  const [failedDocs, setFailedDocs] = useState<Map<string, string>>(() => new Map());
  const [addingLabel, setAddingLabel] = useState(false);
  const [wolkeFolders, setWolkeFolders] = useState<WolkeFolderRef[]>([]);
  const [wolkePanelOpen, setWolkePanelOpen] = useState(false);
  const [linkedDocs, setLinkedDocs] = useState<LinkedDocRef[]>([]);
  const [docsPanelOpen, setDocsPanelOpen] = useState(false);
  const [wordpressSites, setWordpressSites] = useState<WordpressSiteRef[]>([]);
  const [wordpressPanelOpen, setWordpressPanelOpen] = useState(false);
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs local form/panel state from the editingCollection prop when it changes
      setLabels(editingCollection.labels || []);
      setWolkeFolders(editingCollection.wolke_folders ?? []);
      setLinkedDocs(editingCollection.linked_docs ?? []);
      setWordpressSites(editingCollection.wordpress_sites ?? []);
      if (editingCollection.documents?.length) {
        setUploadedDocuments(
          editingCollection.documents.map((doc) => ({
            id: doc.id,
            title: doc.title || 'Dokument',
            ...(doc.source_type === 'wolke'
              ? { source: 'wolke' as const }
              : doc.source_type === 'wordpress'
                ? { source: 'wordpress' as const }
                : {}),
          }))
        );
        // Rehydrate failures from the stored status: the marker has to survive
        // closing the editor, otherwise a document that failed yesterday looks
        // perfectly fine today and still answers nothing.
        setFailedDocs(
          new Map(
            editingCollection.documents
              .filter((doc) => doc.status === 'failed')
              .map((doc) => [
                doc.id,
                doc.processing_error || 'Das Dokument konnte nicht gelesen werden.',
              ])
          )
        );
      }
      setStep(0);
    } else {
      reset({ name: '', description: '' });
      setLabels([]);
      setWolkeFolders([]);
      setLinkedDocs([]);
      setWordpressSites([]);
      setUploadedDocuments([]);
      setStagedFiles([]);
      setFailedDocs(new Map());
      setStep(0);
      setWolkePanelOpen(false);
      setDocsPanelOpen(false);
      setWordpressPanelOpen(false);
    }
  }, [editingCollection, reset]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-way latch: open the panel once its list becomes non-empty
    if (linkedDocs.length > 0) setDocsPanelOpen(true);
  }, [linkedDocs.length]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-way latch: open the panel once its list becomes non-empty
    if (wolkeFolders.length > 0) setWolkePanelOpen(true);
  }, [wolkeFolders.length]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-way latch: open the panel once its list becomes non-empty
    if (wordpressSites.length > 0) setWordpressPanelOpen(true);
  }, [wordpressSites.length]);

  /**
   * Follow a batch of documents through background indexing: spinner while it
   * runs, a named failure afterwards if the pipeline couldn't read the file.
   * Every source (upload, Wolke, Docs, WordPress) funnels through here so a
   * failure looks the same wherever the document came from.
   */
  const watchIndexing = useCallback(
    (docIds: string[]) => {
      if (docIds.length === 0) return;
      setIndexingDocIds((prev) => {
        const next = new Set(prev);
        docIds.forEach((id) => next.add(id));
        return next;
      });
      setFailedDocs((prev) => {
        if (!docIds.some((id) => prev.has(id))) return prev;
        const next = new Map(prev);
        docIds.forEach((id) => next.delete(id));
        return next;
      });

      docIds.forEach((id) => {
        void pollDocumentStatus(id)
          .then((result) => {
            // A give-up is not a success. Letting the spinner simply vanish is
            // what made an unread file look indexed, so say what is known:
            // still running, outcome unknown.
            if (result.timedOut) {
              setFailedDocs((prev) => {
                const next = new Map(prev);
                next.set(
                  id,
                  'Die Verarbeitung dauert ungewöhnlich lange. Das Dokument ist noch nicht durchsuchbar.'
                );
                return next;
              });
              return;
            }
            if (result.status !== 'failed') return;
            setFailedDocs((prev) => {
              const next = new Map(prev);
              next.set(id, result.error ?? 'Das Dokument konnte nicht gelesen werden.');
              return next;
            });
          })
          .catch(() => {
            // Poll itself broke (network/auth) — that's not a document defect,
            // so leave the row unmarked rather than blaming the file.
          })
          .finally(() => {
            setIndexingDocIds((prev) => {
              if (!prev.has(id)) return prev;
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          });
      });
    },
    [pollDocumentStatus]
  );

  // Stage files for upload (preview-then-commit pattern). Slot check accounts
  // for both already-uploaded docs and other files still in the staging tray.
  // Auto-suggests a notebook name from the first file when adding to an empty
  // create-flow (matches the previous immediate-upload behaviour).
  const handleStageFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      setUploadError(null);

      // Format check first: telling someone their PDF didn't fit is useful,
      // telling them their .zip didn't fit is misleading.
      const { accepted: readable, rejected } = partitionUploadableFiles(files);

      const remainingSlots = MAX_DOCUMENTS - uploadedDocuments.length - stagedFiles.length;
      const accepted = readable.slice(0, Math.max(0, remainingSlots));
      const skipped = readable.length - accepted.length;

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
      const messages: string[] = [];
      if (rejected.length > 0) messages.push(describeRejectedFiles(rejected));
      if (skipped > 0) {
        messages.push(
          `${skipped} Datei${skipped === 1 ? '' : 'en'} übersprungen — ein Notebook fasst insgesamt ${MAX_DOCUMENTS} Dokumente über alle Quellen hinweg.`
        );
      }
      if (messages.length > 0) setUploadError(messages.join(' '));
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
        watchIndexing(newDocs.map((d) => d.id));
        setStagedFiles([]);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Fehler beim Hochladen der Datei');
    } finally {
      setIsUploading(false);
    }
  }, [stagedFiles, isUploading, uploadFileOnly, watchIndexing]);

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

  const forgetFailed = useCallback((ids: string[]) => {
    setFailedDocs((prev) => {
      if (!ids.some((id) => prev.has(id))) return prev;
      const next = new Map(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  const handleRemoveDocument = useCallback(
    (id: string) => {
      setUploadedDocuments((prev) => prev.filter((doc) => doc.id !== id));
      forgetFailed([id]);
    },
    [forgetFailed]
  );

  const handleRemoveDocuments = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const drop = new Set(ids);
      setUploadedDocuments((prev) => prev.filter((doc) => !drop.has(doc.id)));
      forgetFailed(ids);
    },
    [forgetFailed]
  );

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
      watchIndexing(docs.map((d) => d.id));
    },
    [watchIndexing]
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
      watchIndexing(docs.map((d) => d.id));
    },
    [watchIndexing]
  );

  const handleWordpressDocsImported = useCallback(
    (docs: ImportedWordpressDocument[]) => {
      if (docs.length === 0) return;
      setUploadedDocuments((prev) => {
        const seen = new Set(prev.map((d) => d.id));
        const additions: UploadedDocument[] = docs
          .filter((d) => !seen.has(d.id))
          .map((d) => ({ id: d.id, title: d.title, source: 'wordpress' as const }));
        return [...prev, ...additions];
      });
      watchIndexing(docs.map((d) => d.id));
    },
    [watchIndexing]
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
  const wordpressDocuments = useMemo(
    () => uploadedDocuments.filter((d) => d.source === 'wordpress'),
    [uploadedDocuments]
  );
  const linkedDocDocumentIds = useMemo(
    () => new Set(linkedDocs.flatMap((d) => (d.documentId ? [d.documentId] : []))),
    [linkedDocs]
  );
  const manualDocuments = useMemo(
    () =>
      uploadedDocuments.filter(
        (d) => d.source !== 'wolke' && d.source !== 'wordpress' && !linkedDocDocumentIds.has(d.id)
      ),
    [uploadedDocuments, linkedDocDocumentIds]
  );

  /**
   * One list for every document, with its provenance resolved. The unified
   * document panel filters this instead of rendering a grid per source —
   * "where did it come from" is a facet, not a separate place to look.
   */
  const documentsWithSource = useMemo<DocumentWithSource[]>(
    () =>
      uploadedDocuments.map((doc) => ({
        doc,
        source:
          doc.source === 'wolke'
            ? 'wolke'
            : doc.source === 'wordpress'
              ? 'wordpress'
              : linkedDocDocumentIds.has(doc.id)
                ? 'docs'
                : 'upload',
      })),
    [uploadedDocuments, linkedDocDocumentIds]
  );

  /**
   * The document cap is a single pool shared by every source — uploads, Wolke,
   * verlinkte Docs and WordPress all draw from it, and staged-but-not-yet-
   * uploaded files already count. `uploadedDocuments` is the notebook's whole
   * document list (the per-source lists above are just views of it), so this is
   * the one place any source may ask how much room is left.
   */
  const documentCount = uploadedDocuments.length + stagedFiles.length;
  const remainingSlots = Math.max(0, MAX_DOCUMENTS - documentCount);

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
        wordpressSites,
      };
      await onSave(payload);
    },
    [onSave, editingCollection, uploadedDocuments, labels, wolkeFolders, linkedDocs, wordpressSites]
  );

  const handleCancel = useCallback(() => {
    reset();
    setUploadedDocuments([]);
    setStagedFiles([]);
    setFailedDocs(new Map());
    setLabels([]);
    setNewLabel('');
    setWolkeFolders([]);
    setLinkedDocs([]);
    setWordpressSites([]);
    setStep(0);
    if (onCancel) onCancel();
  }, [reset, onCancel]);

  /**
   * `void handleSubmit(onSubmit)()` used to drop a rejected save on the floor as
   * an unhandled rejection: the button simply became clickable again and the
   * user was left guessing whether the notebook had been saved. Awaiting it and
   * surfacing the error is the whole difference between a failed save and a
   * silent one.
   */
  const submitForm = useCallback(async () => {
    try {
      await handleSubmit(onSubmit)();
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? `Speichern fehlgeschlagen: ${err.message}`
          : 'Speichern fehlgeschlagen. Bitte versuche es erneut.'
      );
    }
  }, [handleSubmit, onSubmit]);

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
    failedDocs,
    addingLabel,
    wolkeFolders,
    wolkePanelOpen,
    linkedDocs,
    docsPanelOpen,
    wordpressSites,
    wordpressPanelOpen,
    fileInputRef,
    watchedName,
    watchedDesc,
    wolkeDocuments,
    wordpressDocuments,
    manualDocuments,
    documentsWithSource,
    documentCount,
    remainingSlots,
    loading,
    canAdvanceFromSources,
    canAdvanceFromDetails,
    setNewLabel,
    setAddingLabel,
    setWolkeFolders,
    setWolkePanelOpen,
    setLinkedDocs,
    setDocsPanelOpen,
    setWordpressSites,
    setWordpressPanelOpen,
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
    handleRemoveDocuments,
    handleUnstageFile,
    handleCommitStagedUpload,
    handleWolkeDocsImported,
    handleWordpressDocsImported,
    handleDocsImported,
    handleAddLabel,
    handleRemoveLabel,
    handleBack,
    handleNext,
    handleCancel,
  };
}

export type NotebookEditorStateBundle = ReturnType<typeof useNotebookEditorState>;
