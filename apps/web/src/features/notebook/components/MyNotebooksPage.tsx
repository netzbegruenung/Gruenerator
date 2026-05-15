import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  toast,
} from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { memo, useCallback, useMemo, useState, type DragEvent } from 'react';
import {
  HiBookOpen,
  HiDotsHorizontal,
  HiExternalLink,
  HiPencil,
  HiPlus,
  HiShare,
  HiTrash,
  HiUpload,
} from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useDocumentsStore } from '../../../stores/documentsStore';
import { cn } from '../../../utils/cn';
import { useNotebookCollections } from '../../auth/hooks/useProfileData';

import type { NotebookCollection } from '../../../types/notebook';

type DialogPhase =
  | { kind: 'closed' }
  | { kind: 'rename'; collection: NotebookCollection }
  | { kind: 'delete'; collection: NotebookCollection };

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.md', '.odt', '.rtf'];
const MAX_DOCUMENTS_PER_NOTEBOOK = 100;

function hasFileDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes('Files');
}

const NotebookManagementCard = memo(function NotebookManagementCard({
  collection,
  isProcessing = false,
  onOpen,
  onRename,
  onEdit,
  onShare,
  onDelete,
  onAddFiles,
}: {
  collection: NotebookCollection;
  isProcessing?: boolean;
  onOpen: (c: NotebookCollection) => void;
  onRename: (c: NotebookCollection) => void;
  onEdit: (c: NotebookCollection) => void;
  onShare: (c: NotebookCollection) => void;
  onDelete: (c: NotebookCollection) => void;
  onAddFiles: (c: NotebookCollection, files: File[]) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const docCount = collection.document_count ?? collection.documents?.length ?? 0;
  const isFull = docCount >= MAX_DOCUMENTS_PER_NOTEBOOK;

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFileDrag(e)) return;
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = isFull ? 'none' : 'copy';
  };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDragOver(false);
  };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFileDrag(e)) return;
    e.preventDefault();
    setIsDragOver(false);
    if (isProcessing) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) onAddFiles(collection, files);
  };

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-sm rounded-md border border-grey-200 bg-background p-md transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md dark:border-grey-700',
        isDragOver && !isFull && 'border-primary-500 ring-2 ring-primary-500/30',
        isDragOver && isFull && 'border-red-400 ring-2 ring-red-400/20'
      )}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver ? (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-xs rounded-md text-sm font-medium backdrop-blur-[1px]',
            isFull
              ? 'bg-red-50/85 text-red-700 dark:bg-red-900/40 dark:text-red-200'
              : 'bg-primary-500/10 text-primary-700 dark:text-primary-200'
          )}
        >
          <HiUpload />
          {isFull
            ? `Notebook ist voll (${MAX_DOCUMENTS_PER_NOTEBOOK}/${MAX_DOCUMENTS_PER_NOTEBOOK})`
            : `Hier ablegen, um zu „${collection.name}" hinzuzufügen`}
        </div>
      ) : null}
      <div className={cn(isDragOver && 'pointer-events-none')}>
        <div className="flex items-start justify-between gap-sm">
          <button
            type="button"
            onClick={() => onOpen(collection)}
            className="flex flex-1 cursor-pointer items-start gap-sm bg-transparent text-left"
          >
            <HiBookOpen className="mt-1 shrink-0 text-lg text-secondary-600" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-foreground-heading">
                {collection.name}
              </div>
              {collection.description ? (
                <div className="line-clamp-4 text-xs text-grey-500 dark:text-grey-400">
                  {collection.description}
                </div>
              ) : null}
            </div>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Aktionen"
                className="-mr-2 shrink-0 opacity-70 group-hover:opacity-100"
              >
                <HiDotsHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onOpen(collection)}>
                <HiExternalLink className="mr-2" /> Öffnen
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onRename(collection)}>
                <HiPencil className="mr-2" /> Umbenennen
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onEdit(collection)}>
                <HiPencil className="mr-2" /> Bearbeiten
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onShare(collection)}>
                <HiShare className="mr-2" /> Link kopieren
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onDelete(collection)} variant="destructive">
                <HiTrash className="mr-2" /> Löschen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {(collection.is_public || isProcessing) && (
          <div className="flex items-center gap-xs">
            {collection.is_public ? (
              <Badge variant="outline" className="text-xs">
                Geteilt
              </Badge>
            ) : null}
            {isProcessing ? (
              <Badge variant="outline" className="gap-xs text-xs text-primary-600">
                <span className="size-3 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
                Wird verarbeitet…
              </Badge>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
});

function RenameDialog({
  collection,
  isUpdating,
  onCancel,
  onSubmit,
}: {
  collection: NotebookCollection;
  isUpdating: boolean;
  onCancel: () => void;
  onSubmit: (name: string, description: string) => void;
}) {
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description ?? '');
  const canSave = name.trim().length > 0 && !isUpdating;

  return (
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>Notebook umbenennen</DialogTitle>
        <DialogDescription>
          Ändere den Namen und die Beschreibung deines Notebooks.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-md py-sm">
        <div className="flex flex-col gap-xs">
          <label htmlFor="rename-name" className="text-sm font-medium">
            Name
          </label>
          <Input
            id="rename-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-xs">
          <label htmlFor="rename-description" className="text-sm font-medium">
            Beschreibung
          </label>
          <Input
            id="rename-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel} disabled={isUpdating}>
          Abbrechen
        </Button>
        <Button onClick={() => onSubmit(name.trim(), description.trim())} disabled={!canSave}>
          Speichern
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function MyNotebooksPageInner() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pollDocumentStatus = useDocumentsStore((s) => s.pollDocumentStatus);
  const uploadFileOnly = useDocumentsStore((s) => s.uploadFileOnly);
  const { query, updateQACollection, deleteQACollection, isUpdating } = useNotebookCollections({
    isActive: true,
  });
  const [phase, setPhase] = useState<DialogPhase>({ kind: 'closed' });
  const [processingCollectionIds, setProcessingCollectionIds] = useState<Set<string>>(
    () => new Set()
  );

  const collections = useMemo<NotebookCollection[]>(() => query.data ?? [], [query.data]);

  const handleOpen = useCallback(
    (c: NotebookCollection) => {
      void navigate(`/notebook/${c.id}`);
    },
    [navigate]
  );

  const handleShare = useCallback((c: NotebookCollection) => {
    void navigator.clipboard.writeText(`${window.location.origin}/notebook/${c.id}`);
  }, []);

  const closeDialog = useCallback(() => setPhase({ kind: 'closed' }), []);

  const handleRenameSubmit = useCallback(
    async (collection: NotebookCollection, name: string, description: string) => {
      if (!name) return;
      await updateQACollection(collection.id, {
        name,
        description: description || undefined,
        custom_prompt: collection.custom_prompt,
        selectionMode: collection.selection_mode,
        labels: collection.labels,
      });
      closeDialog();
    },
    [updateQACollection, closeDialog]
  );

  const handleDeleteConfirm = useCallback(
    async (collection: NotebookCollection) => {
      await deleteQACollection(collection.id);
      closeDialog();
    },
    [deleteQACollection, closeDialog]
  );

  const handleAddFilesToCard = useCallback(
    async (collection: NotebookCollection, rawFiles: File[]) => {
      const accepted = rawFiles.filter((f) =>
        ACCEPTED_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext))
      );
      const rejectedCount = rawFiles.length - accepted.length;
      if (rejectedCount > 0) {
        toast.error(
          `${rejectedCount} Datei${rejectedCount === 1 ? '' : 'en'} übersprungen — Format nicht unterstützt`
        );
      }
      if (accepted.length === 0) return;

      const existingIds = (collection.documents ?? []).map((d) => String(d.id));
      const remainingSlots = MAX_DOCUMENTS_PER_NOTEBOOK - existingIds.length;
      if (remainingSlots <= 0) {
        toast.error(
          `„${collection.name}" ist voll (${MAX_DOCUMENTS_PER_NOTEBOOK}/${MAX_DOCUMENTS_PER_NOTEBOOK} Dokumente)`
        );
        return;
      }
      const filesToUpload = accepted.slice(0, remainingSlots);
      const overCap = accepted.length - filesToUpload.length;

      setProcessingCollectionIds((prev) => new Set(prev).add(collection.id));

      try {
        const uploaded = await Promise.all(filesToUpload.map((f) => uploadFileOnly(f, f.name)));
        const newIds = uploaded.map((d) => String(d.id));

        await updateQACollection(collection.id, {
          name: collection.name,
          description: collection.description,
          documents: [...existingIds, ...newIds],
          labels: collection.labels,
          selectionMode: collection.selection_mode,
          custom_prompt: collection.custom_prompt,
        });
        void queryClient.invalidateQueries({ queryKey: ['notebookCollections'] });

        const successLabel = `${filesToUpload.length} Datei${filesToUpload.length === 1 ? '' : 'en'} zu „${collection.name}" hinzugefügt`;
        toast.success(
          overCap > 0
            ? `${successLabel} (${overCap} übersprungen — max ${MAX_DOCUMENTS_PER_NOTEBOOK})`
            : successLabel
        );

        await Promise.all(newIds.map((id) => pollDocumentStatus(id)));
        void queryClient.invalidateQueries({ queryKey: ['notebookCollections'] });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Fehler beim Hochladen');
      } finally {
        setProcessingCollectionIds((prev) => {
          if (!prev.has(collection.id)) return prev;
          const next = new Set(prev);
          next.delete(collection.id);
          return next;
        });
      }
    },
    [uploadFileOnly, updateQACollection, queryClient, pollDocumentStatus]
  );

  const isLoading = query.isLoading;
  const isEmpty = !isLoading && collections.length === 0;

  return (
    <ErrorBoundary>
      <PageContainer
        title="Meine Notebooks"
        subtitle="Verwalte deine eigenen Notebooks. Ziehe Dateien direkt auf eine Karte, um sie hinzuzufügen."
      >
        <div className="mb-lg flex justify-end">
          <Button onClick={() => void navigate('/notebooks/meine/neu')}>
            <HiPlus className="mr-1" /> Neues Notebook
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-4 gap-md max-lg:grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-md border border-grey-200 bg-grey-50 dark:border-grey-700 dark:bg-grey-900"
              />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center gap-md rounded-md border border-dashed border-grey-300 p-xl text-center dark:border-grey-700">
            <HiBookOpen className="text-3xl text-grey-400" />
            <div>
              <div className="text-base font-medium text-foreground-heading">
                Du hast noch keine eigenen Notebooks
              </div>
              <div className="mt-xs text-sm text-grey-500 dark:text-grey-400">
                Erstelle dein erstes Notebook, um Dokumente und Quellen zu bündeln.
              </div>
            </div>
            <Button onClick={() => void navigate('/notebooks/meine/neu')}>
              <HiPlus className="mr-1" /> Eigenes Notebook erstellen
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-md max-lg:grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1">
            {collections.map((c) => (
              <NotebookManagementCard
                key={c.id}
                collection={c}
                isProcessing={processingCollectionIds.has(c.id)}
                onOpen={handleOpen}
                onRename={(col) => setPhase({ kind: 'rename', collection: col })}
                onEdit={(col) => void navigate(`/notebooks/meine/${col.id}/bearbeiten`)}
                onShare={handleShare}
                onDelete={(col) => setPhase({ kind: 'delete', collection: col })}
                onAddFiles={handleAddFilesToCard}
              />
            ))}
          </div>
        )}

        {/* Rename dialog */}
        <Dialog
          open={phase.kind === 'rename'}
          onOpenChange={(open) => {
            if (!open) closeDialog();
          }}
        >
          {phase.kind === 'rename' ? (
            <RenameDialog
              collection={phase.collection}
              isUpdating={isUpdating}
              onCancel={closeDialog}
              onSubmit={(name, description) =>
                void handleRenameSubmit(phase.collection, name, description)
              }
            />
          ) : null}
        </Dialog>

        {/* Delete confirmation */}
        <AlertDialog
          open={phase.kind === 'delete'}
          onOpenChange={(open) => {
            if (!open) closeDialog();
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Notebook löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                {phase.kind === 'delete'
                  ? `„${phase.collection.name}" wird unwiderruflich gelöscht. Die enthaltenen Dokumente bleiben in deiner Bibliothek erhalten.`
                  : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  if (phase.kind === 'delete') void handleDeleteConfirm(phase.collection);
                }}
              >
                Löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageContainer>
    </ErrorBoundary>
  );
}

export const MyNotebooksPage = withAuthRequired(MyNotebooksPageInner, {
  title: 'Meine Notebooks',
});

export default MyNotebooksPage;
