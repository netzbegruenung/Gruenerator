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
} from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { memo, useCallback, useMemo, useState } from 'react';
import {
  HiBookOpen,
  HiDotsHorizontal,
  HiExternalLink,
  HiPencil,
  HiPlus,
  HiShare,
  HiTrash,
} from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useDocumentsStore } from '../../../stores/documentsStore';
import { useNotebookCollections } from '../../auth/hooks/useProfileData';

import NotebookEditor from './NotebookEditor';

import type { NotebookCollection } from '../../../types/notebook';

type DialogPhase =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; collection: NotebookCollection }
  | { kind: 'rename'; collection: NotebookCollection }
  | { kind: 'delete'; collection: NotebookCollection };

function formatDocCount(c: NotebookCollection): string {
  const n = c.document_count ?? c.documents?.length ?? 0;
  if (n === 0) return 'Keine Dokumente';
  if (n === 1) return '1 Dokument';
  return `${n} Dokumente`;
}

const NotebookManagementCard = memo(function NotebookManagementCard({
  collection,
  onOpen,
  onRename,
  onEdit,
  onShare,
  onDelete,
}: {
  collection: NotebookCollection;
  onOpen: (c: NotebookCollection) => void;
  onRename: (c: NotebookCollection) => void;
  onEdit: (c: NotebookCollection) => void;
  onShare: (c: NotebookCollection) => void;
  onDelete: (c: NotebookCollection) => void;
}) {
  return (
    <div className="group relative flex flex-col gap-sm rounded-md border border-grey-200 bg-background p-md transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md dark:border-grey-700">
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
              <div className="line-clamp-2 text-xs text-grey-500 dark:text-grey-400">
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

      <div className="flex items-center gap-xs">
        <Badge variant="secondary" className="text-xs">
          {formatDocCount(collection)}
        </Badge>
        {collection.is_public ? (
          <Badge variant="outline" className="text-xs">
            Geteilt
          </Badge>
        ) : null}
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
  const {
    query,
    createQACollection,
    updateQACollection,
    deleteQACollection,
    isCreating,
    isUpdating,
  } = useNotebookCollections({ isActive: true });
  const [phase, setPhase] = useState<DialogPhase>({ kind: 'closed' });

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

  const handleEditSave = useCallback(
    async (collection: NotebookCollection, data: unknown) => {
      const d = data as {
        name: string;
        description?: string;
        documents?: (string | number)[];
        labels?: string[];
      };
      const originalIds = new Set((collection.documents ?? []).map((doc) => String(doc.id)));
      const addedIds = (d.documents ?? [])
        .map((id) => String(id))
        .filter((id) => !originalIds.has(id));

      await updateQACollection(collection.id, {
        name: d.name,
        description: d.description,
        documents: d.documents,
        labels: d.labels,
        selectionMode: collection.selection_mode,
        custom_prompt: collection.custom_prompt,
      });
      closeDialog();

      if (addedIds.length > 0) {
        void Promise.all(addedIds.map((id) => pollDocumentStatus(id))).finally(() => {
          void queryClient.invalidateQueries({ queryKey: ['notebookCollections'] });
        });
      }
    },
    [updateQACollection, closeDialog, pollDocumentStatus, queryClient]
  );

  const handleCreateSave = useCallback(
    async (data: unknown) => {
      const d = data as {
        name: string;
        description?: string;
        documents?: (string | number)[];
        labels?: string[];
      };
      await createQACollection({
        name: d.name,
        description: d.description,
        documents: d.documents,
        labels: d.labels,
      });
      closeDialog();
    },
    [createQACollection, closeDialog]
  );

  const handleDeleteConfirm = useCallback(
    async (collection: NotebookCollection) => {
      await deleteQACollection(collection.id);
      closeDialog();
    },
    [deleteQACollection, closeDialog]
  );

  const isLoading = query.isLoading;
  const isEmpty = !isLoading && collections.length === 0;

  return (
    <ErrorBoundary>
      <PageContainer
        title="Meine Notebooks"
        subtitle="Verwalte deine eigenen Notebooks: öffnen, umbenennen, bearbeiten oder löschen."
      >
        <div className="mb-lg flex justify-end">
          <Button onClick={() => setPhase({ kind: 'create' })}>
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
          <Button onClick={() => setPhase({ kind: 'create' })}>
            <HiPlus className="mr-1" /> Eigenes Notebook erstellen
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-md max-lg:grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1">
          {collections.map((c) => (
            <NotebookManagementCard
              key={c.id}
              collection={c}
              onOpen={handleOpen}
              onRename={(col) => setPhase({ kind: 'rename', collection: col })}
              onEdit={(col) => setPhase({ kind: 'edit', collection: col })}
              onShare={handleShare}
              onDelete={(col) => setPhase({ kind: 'delete', collection: col })}
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

      {/* Full editor dialog (create or edit) */}
      <Dialog
        open={phase.kind === 'create' || phase.kind === 'edit'}
        onOpenChange={(open) => {
          if (!open && !isCreating && !isUpdating) closeDialog();
        }}
      >
        <DialogContent
          className="sm:max-w-[700px] w-[calc(100%-1rem)] max-h-[90dvh] overflow-y-auto p-0 [&>[data-slot=dialog-close]]:hidden"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">
            {phase.kind === 'edit' ? 'Notebook bearbeiten' : 'Notebook erstellen'}
          </DialogTitle>
          {phase.kind === 'edit' ? (
            <NotebookEditor
              editingCollection={phase.collection}
              loading={isUpdating}
              onCancel={closeDialog}
              onSave={(data) => handleEditSave(phase.collection, data)}
            />
          ) : phase.kind === 'create' ? (
            <NotebookEditor
              editingCollection={null}
              loading={isCreating}
              onCancel={closeDialog}
              onSave={handleCreateSave}
            />
          ) : null}
        </DialogContent>
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
