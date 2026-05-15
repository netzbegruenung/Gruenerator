import { type NotebookEditorSavePayload } from '@gruenerator/contracts';
import {
  Button,
  Dialog,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  toast,
} from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { HiArrowLeft, HiPencil } from 'react-icons/hi';
import { useNavigate, useParams } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useDocumentsStore } from '../../../stores/documentsStore';
import { useNotebookCollections } from '../../auth/hooks/useProfileData';

import NotebookEditor from './NotebookEditor';
import { RenameNotebookDialog } from './RenameNotebookDialog';

import type { NotebookCollection } from '../../../types/notebook';

interface NotebookEditorPageProps {
  mode: 'create' | 'edit';
}

function NotebookEditorPageInner({ mode }: NotebookEditorPageProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = useParams<{ id: string }>();
  const pollDocumentStatus = useDocumentsStore((s) => s.pollDocumentStatus);
  const { query, createQACollection, updateQACollection, isCreating, isUpdating } =
    useNotebookCollections({ isActive: true });
  const [renameOpen, setRenameOpen] = useState(false);

  const collections = useMemo<NotebookCollection[]>(() => query.data ?? [], [query.data]);
  const editingCollection = useMemo<NotebookCollection | null>(() => {
    if (mode !== 'edit' || !params.id) return null;
    return collections.find((c) => c.id === params.id) ?? null;
  }, [collections, mode, params.id]);

  const goBack = useCallback(() => {
    void navigate('/notebooks/meine');
  }, [navigate]);

  const handleEditSave = useCallback(
    async (collection: NotebookCollection, data: NotebookEditorSavePayload) => {
      const originalIds = new Set((collection.documents ?? []).map((doc) => String(doc.id)));
      const addedIds = data.documents.filter((id) => !originalIds.has(id));

      await updateQACollection(collection.id, {
        name: data.name,
        description: data.description,
        documents: data.documents,
        labels: data.labels,
        selectionMode: collection.selection_mode,
        custom_prompt: collection.custom_prompt,
      });

      toast.success(`Notebook „${data.name}" gespeichert`);
      goBack();

      if (addedIds.length > 0) {
        void Promise.all(addedIds.map((id) => pollDocumentStatus(id))).finally(() => {
          void queryClient.invalidateQueries({ queryKey: ['notebookCollections'] });
        });
      }
    },
    [updateQACollection, goBack, pollDocumentStatus, queryClient]
  );

  const handleCreateSave = useCallback(
    async (data: NotebookEditorSavePayload) => {
      await createQACollection({
        name: data.name,
        description: data.description,
        documents: data.documents,
        labels: data.labels,
      });
      toast.success(`Notebook „${data.name}" erstellt`);
      goBack();
    },
    [createQACollection, goBack]
  );

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
      setRenameOpen(false);
    },
    [updateQACollection]
  );

  const isEditMissing = mode === 'edit' && !query.isLoading && !editingCollection;

  const pageTitle = mode === 'edit' ? (editingCollection?.name ?? 'Notebook') : 'Neues Notebook';
  const pageSubtitle =
    mode === 'edit' && editingCollection?.description ? editingCollection.description : undefined;

  return (
    <ErrorBoundary>
      <PageContainer maxWidth="lg" noPadTop>
        <div className="mb-md flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={goBack}
            className="-ml-2 gap-xs text-grey-500 hover:text-foreground"
          >
            <HiArrowLeft size={14} />
            Meine Notebooks
          </Button>
          {mode === 'edit' && editingCollection ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRenameOpen(true)}
              className="gap-xs text-grey-500 hover:text-foreground"
            >
              <HiPencil size={14} />
              Umbenennen
            </Button>
          ) : null}
        </div>

        {mode === 'edit' && editingCollection ? (
          <div className="mb-xl text-center">
            <h1 className="mb-xs text-4xl font-semibold text-foreground-heading max-md:text-2xl">
              {pageTitle}
            </h1>
            {pageSubtitle ? (
              <p className="text-lg text-grey-500 dark:text-grey-400">{pageSubtitle}</p>
            ) : null}
          </div>
        ) : null}

        {mode === 'edit' && query.isLoading ? (
          <div className="grid grid-cols-1 gap-md sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-grey-100 dark:bg-grey-900" />
            ))}
          </div>
        ) : isEditMissing ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Notebook nicht gefunden</EmptyTitle>
              <EmptyDescription>
                Dieses Notebook existiert nicht oder wurde gelöscht.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={goBack}>Zurück zu Meine Notebooks</Button>
            </EmptyContent>
          </Empty>
        ) : mode === 'edit' && editingCollection ? (
          <NotebookEditor
            editingCollection={editingCollection}
            loading={isUpdating}
            onCancel={goBack}
            onSave={(data) => handleEditSave(editingCollection, data)}
          />
        ) : (
          <NotebookEditor
            editingCollection={null}
            loading={isCreating}
            onCancel={goBack}
            onSave={handleCreateSave}
          />
        )}

        <Dialog
          open={renameOpen}
          onOpenChange={(open) => {
            if (!isUpdating) setRenameOpen(open);
          }}
        >
          {renameOpen && editingCollection ? (
            <RenameNotebookDialog
              collection={editingCollection}
              isUpdating={isUpdating}
              onCancel={() => setRenameOpen(false)}
              onSubmit={(name, description) =>
                void handleRenameSubmit(editingCollection, name, description)
              }
            />
          ) : null}
        </Dialog>
      </PageContainer>
    </ErrorBoundary>
  );
}

function NotebookCreatePageInner() {
  return <NotebookEditorPageInner mode="create" />;
}

function NotebookEditPageInner() {
  return <NotebookEditorPageInner mode="edit" />;
}

export const NotebookCreatePage = withAuthRequired(NotebookCreatePageInner, {
  title: 'Notebook erstellen',
});

export const NotebookEditPage = withAuthRequired(NotebookEditPageInner, {
  title: 'Notebook bearbeiten',
});

export default NotebookEditPage;
