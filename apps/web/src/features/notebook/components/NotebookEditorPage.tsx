import { type NotebookEditorSavePayload } from '@gruenerator/contracts';
import { DocsProvider } from '@gruenerator/docs';
import { buildNotebookSlug, extractSlugSuffix } from '@gruenerator/shared/utils';
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  toast,
} from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { HiArrowLeft, HiRefresh, HiShare } from 'react-icons/hi';
import { useNavigate, useParams } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useAuthStore } from '../../../stores/authStore';
import { useDocumentsStore } from '../../../stores/documentsStore';
import { cn } from '../../../utils/cn';
import { useNotebookCollections } from '../../auth/hooks/useProfileData';
import { webAppDocsAdapter } from '../../docs/docsAdapter';

import NotebookEditor from './NotebookEditor';
import { NotebookFullSyncModal } from './NotebookFullSyncModal';
import NotebookPendingFilesPanel from './NotebookPendingFilesPanel';
import { NotebookShareModal } from './NotebookShareModal';

import type { NotebookCollection } from '../../../types/notebook';

interface NotebookEditorPageProps {
  mode: 'create' | 'edit';
}

function NotebookEditorPageInner({ mode }: NotebookEditorPageProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = useParams<{ id: string }>();
  const pollDocumentStatus = useDocumentsStore((s) => s.pollDocumentStatus);
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const { query, createQACollection, updateQACollection, isCreating, isUpdating } =
    useNotebookCollections({ isActive: true });
  const [editingField, setEditingField] = useState<'name' | 'desc' | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [fullSyncOpen, setFullSyncOpen] = useState(false);

  const collections = useMemo<NotebookCollection[]>(() => query.data ?? [], [query.data]);
  const editingCollection = useMemo<NotebookCollection | null>(() => {
    if (mode !== 'edit' || !params.id) return null;
    const byId = collections.find((c) => c.id === params.id);
    if (byId) return byId;
    const suffix = extractSlugSuffix(params.id);
    if (suffix) {
      return collections.find((c) => c.slug_suffix === suffix) ?? null;
    }
    return null;
  }, [collections, mode, params.id]);

  const shareUrl = useMemo(() => {
    if (!editingCollection) return '';
    const slug = editingCollection.slug_suffix
      ? buildNotebookSlug(editingCollection.name, editingCollection.slug_suffix)
      : editingCollection.id;
    return `${window.location.origin}/notebooks/${slug}`;
  }, [editingCollection]);

  const goBack = useCallback(() => {
    void navigate('/notebooks');
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
        wolkeFolders: data.wolkeFolders,
        linkedDocs: data.linkedDocs,
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
      const created = await createQACollection({
        name: data.name,
        description: data.description,
        documents: data.documents,
        labels: data.labels,
        wolkeFolders: data.wolkeFolders,
        linkedDocs: data.linkedDocs,
      });
      toast.success(`Notebook „${data.name}" erstellt`);
      const slug = created.slug_suffix
        ? buildNotebookSlug(created.name, created.slug_suffix)
        : created.id;
      void navigate(`/notebooks/${slug}/bearbeiten`);
    },
    [createQACollection, navigate]
  );

  const commitHeroName = useCallback(
    async (raw: string) => {
      setEditingField(null);
      if (!editingCollection) return;
      const trimmed = raw.trim().slice(0, 100);
      if (!trimmed || trimmed === editingCollection.name) return;
      await updateQACollection(editingCollection.id, {
        name: trimmed,
        description: editingCollection.description ?? undefined,
        custom_prompt: editingCollection.custom_prompt,
        selectionMode: editingCollection.selection_mode,
        labels: editingCollection.labels,
      });
    },
    [editingCollection, updateQACollection]
  );

  const commitHeroDesc = useCallback(
    async (raw: string) => {
      setEditingField(null);
      if (!editingCollection) return;
      const trimmed = raw.trim().slice(0, 500);
      if (trimmed === (editingCollection.description ?? '')) return;
      await updateQACollection(editingCollection.id, {
        name: editingCollection.name,
        description: trimmed || undefined,
        custom_prompt: editingCollection.custom_prompt,
        selectionMode: editingCollection.selection_mode,
        labels: editingCollection.labels,
      });
    },
    [editingCollection, updateQACollection]
  );

  const isEditMissing = mode === 'edit' && !query.isLoading && !editingCollection;

  return (
    <ErrorBoundary>
      <DocsProvider adapter={webAppDocsAdapter}>
        <PageContainer maxWidth="lg" noPadTop>
          <div className="mb-md flex items-center justify-between gap-md">
            <Button
              variant="ghost"
              size="sm"
              onClick={goBack}
              className="-ml-2 gap-xs text-grey-500 hover:text-foreground"
            >
              <HiArrowLeft size={14} />
              Meine Notebooks
            </Button>
            {mode === 'edit' &&
            editingCollection &&
            currentUserId &&
            editingCollection.user_id === currentUserId ? (
              <div className="flex items-center gap-xs">
                {((editingCollection.wolke_folders?.length ?? 0) > 0 ||
                  (editingCollection.linked_docs?.length ?? 0) > 0) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFullSyncOpen(true)}
                    className="gap-xs"
                  >
                    <HiRefresh size={14} />
                    Alle Quellen aktualisieren
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShareOpen(true)}
                  className="gap-xs"
                >
                  <HiShare size={14} />
                  Teilen
                </Button>
              </div>
            ) : null}
          </div>
          {mode === 'edit' && editingCollection ? (
            <NotebookShareModal
              notebookId={editingCollection.id}
              shareUrl={shareUrl}
              open={shareOpen}
              onOpenChange={setShareOpen}
            />
          ) : null}
          {mode === 'edit' && editingCollection && fullSyncOpen ? (
            <NotebookFullSyncModal
              collection={editingCollection}
              open={fullSyncOpen}
              onOpenChange={setFullSyncOpen}
            />
          ) : null}

          {mode === 'edit' && editingCollection ? (
            <div className="mb-xl text-center">
              {editingField === 'name' ? (
                <input
                  autoFocus
                  defaultValue={editingCollection.name}
                  maxLength={100}
                  onBlur={(e) => void commitHeroName(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void commitHeroName(e.currentTarget.value);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingField(null);
                    }
                  }}
                  className="mb-xs w-full bg-transparent text-center text-4xl font-semibold text-foreground-heading outline-none max-md:text-2xl"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingField('name')}
                  disabled={isUpdating}
                  className="mb-xs block w-full rounded-md px-2 py-1 text-center transition-colors hover:bg-background-alt/50"
                  aria-label="Name bearbeiten"
                >
                  <h1 className="text-4xl font-semibold text-foreground-heading max-md:text-2xl">
                    {editingCollection.name}
                  </h1>
                </button>
              )}

              {editingField === 'desc' ? (
                <textarea
                  autoFocus
                  rows={2}
                  defaultValue={editingCollection.description ?? ''}
                  maxLength={500}
                  placeholder="Beschreibung hinzufügen…"
                  onBlur={(e) => void commitHeroDesc(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void commitHeroDesc(e.currentTarget.value);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingField(null);
                    }
                  }}
                  className="w-full resize-none bg-transparent text-center text-lg text-grey-500 outline-none placeholder:text-grey-400 dark:text-grey-400"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingField('desc')}
                  disabled={isUpdating}
                  className="block w-full rounded-md px-2 py-1 text-center transition-colors hover:bg-background-alt/50"
                  aria-label="Beschreibung bearbeiten"
                >
                  <p
                    className={cn(
                      'text-lg',
                      editingCollection.description
                        ? 'text-grey-500 dark:text-grey-400'
                        : 'italic text-grey-400'
                    )}
                  >
                    {editingCollection.description || 'Beschreibung hinzufügen…'}
                  </p>
                </button>
              )}
            </div>
          ) : null}

          {mode === 'edit' &&
          editingCollection &&
          currentUserId &&
          editingCollection.user_id === currentUserId ? (
            <div className="mb-xl">
              <NotebookPendingFilesPanel
                collectionId={editingCollection.id}
                wolkeFolders={editingCollection.wolke_folders ?? []}
                autoSync={editingCollection.auto_sync ?? false}
              />
            </div>
          ) : null}

          {mode === 'edit' && query.isLoading ? (
            <div className="grid grid-cols-1 gap-md sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-xl bg-grey-100 dark:bg-grey-900"
                />
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
        </PageContainer>
      </DocsProvider>
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
