import { type NotebookEditorSavePayload } from '@gruenerator/contracts';
import { Button, toast } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { HiArrowLeft } from 'react-icons/hi';
import { useNavigate, useParams } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useDocumentsStore } from '../../../stores/documentsStore';
import { useNotebookCollections } from '../../auth/hooks/useProfileData';

import NotebookEditor from './NotebookEditor';

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

  const isEditMissing = mode === 'edit' && !query.isLoading && !editingCollection;

  return (
    <ErrorBoundary>
      <PageContainer maxWidth="lg" noPadTop>
        <div className="mb-md">
          <Button
            variant="ghost"
            size="sm"
            onClick={goBack}
            className="-ml-2 gap-xs text-grey-500 hover:text-foreground"
          >
            <HiArrowLeft size={14} />
            Meine Notebooks
          </Button>
        </div>

        {mode === 'edit' && query.isLoading ? (
          <div className="rounded-2xl border border-grey-200 bg-background p-xl dark:border-grey-800">
            <div className="h-7 w-1/3 animate-pulse rounded bg-grey-100 dark:bg-grey-900" />
            <div className="mt-md h-4 w-2/3 animate-pulse rounded bg-grey-100 dark:bg-grey-900" />
            <div className="mt-xl grid grid-cols-1 gap-md sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-xl bg-grey-100 dark:bg-grey-900"
                />
              ))}
            </div>
          </div>
        ) : isEditMissing ? (
          <div className="flex flex-col items-center gap-md rounded-2xl border border-dashed border-grey-300 p-xl text-center dark:border-grey-700">
            <div className="text-base font-medium text-foreground-heading">
              Dieses Notebook existiert nicht oder wurde gelöscht.
            </div>
            <Button onClick={goBack}>Zurück zu Meine Notebooks</Button>
          </div>
        ) : (
          <div className="rounded-2xl border border-grey-200 bg-background dark:border-grey-800">
            {mode === 'edit' && editingCollection ? (
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
          </div>
        )}
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
