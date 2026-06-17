import { type NotebookEditorSavePayload } from '@gruenerator/contracts';
import { cn, Dialog, DialogContent, DialogTitle, SectionHeader } from '@gruenerator/ui';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '../../../stores/authStore';
import { getPublicAppOrigin } from '../../../utils/platform';
import { useNotebookCollections } from '../../auth/hooks/useProfileData';
import NotebookCreationProgress from '../../notebook/components/NotebookCreationProgress';
import NotebookEditor from '../../notebook/components/NotebookEditor';
import {
  getAustrianNotebooks,
  getNotebooksByCategory,
} from '../../notebook/config/notebooksConfig';

import NotebookCard, { type NotebookCardModel } from './NotebookCard';

import type { NotebookCollection } from '../../../types/notebook';

// Single horizontally-scrollable row at every breakpoint — the notebooks read as
// "one line" of cards (≈5 visible on desktop, the rest peeking/scrollable),
// mirroring the Zuletzt row rather than a wrapping grid.
const NOTEBOOK_ROW_CLASS = cn(
  // `overflow-x-auto` also clips vertically, so the cards' upward hover-lift +
  // shadow would be cut off — `pt-2` (matching `pb-2`) gives them room.
  'grid grid-flow-col gap-md overflow-x-auto pt-2 pb-2',
  'auto-cols-[68%] sm:auto-cols-[40%] md:auto-cols-[30%] lg:auto-cols-[19%]',
  '-mx-4 px-4 lg:mx-0 lg:px-0'
);

type CreationPhase =
  | { kind: 'closed' }
  | { kind: 'editing' }
  | {
      kind: 'processing';
      name: string;
      documents: Array<{ id: string; title: string }>;
      collectionId: string;
    };

const NotebooksSection: React.FC = memo(() => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<CreationPhase>({ kind: 'closed' });
  const locale = useAuthStore((state) => state.locale);
  const isAustrian = locale === 'de-AT';

  const { query, createQACollection, deleteQACollection, isCreating } = useNotebookCollections({
    isActive: true,
  });
  const qaCollections = query.data ?? [];

  const systemCards: NotebookCardModel[] = useMemo(
    () =>
      (isAustrian
        ? getAustrianNotebooks()
        : [
            ...getNotebooksByCategory('bundesebene'),
            ...getNotebooksByCategory('landesebene'),
            ...getNotebooksByCategory('weitere'),
          ]
      ).map((nb) => ({
        id: nb.id,
        title: nb.title.replace(/^Frag\s+/i, ''),
        meta: nb.meta,
        path: nb.path,
        icon: nb.icon,
        isUser: false,
      })),
    [isAustrian]
  );

  const userCards: NotebookCardModel[] = useMemo(
    () =>
      qaCollections.slice(0, 3).map((c: NotebookCollection) => ({
        id: c.id,
        title: c.name,
        meta: 'Eigenes Notebook',
        path: `/notebook/${c.id}`,
        isUser: true,
      })),
    [qaCollections]
  );

  const allCards = useMemo(() => [...userCards, ...systemCards], [userCards, systemCards]);

  const handleCreate = useCallback(() => setPhase({ kind: 'editing' }), []);
  const handleClose = useCallback(() => setPhase({ kind: 'closed' }), []);

  const handleShare = useCallback((id: string) => {
    void navigator.clipboard.writeText(`${getPublicAppOrigin()}/notebook/${id}`);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      if (window.confirm('Notebook wirklich löschen?')) {
        void deleteQACollection(id);
      }
    },
    [deleteQACollection]
  );

  const handleSave = useCallback(
    async (data: NotebookEditorSavePayload) => {
      const created = await createQACollection({
        name: data.name,
        description: data.description,
        documents: data.documents,
        wolkeFolders: data.wolkeFolders,
      });
      // Hand off to the progress view, which polls per-document status until terminal.
      // documentMeta carries the upload titles for the progress rows; the IDs from
      // data.documents are authoritative for the polling query. collectionId enables
      // auto-navigate to the edit page when all docs finish successfully.
      setPhase({
        kind: 'processing',
        name: data.name,
        documents: data.documentMeta,
        collectionId: String(created.id),
      });
    },
    [createQACollection]
  );

  const dialogOpen = phase.kind !== 'closed';

  return (
    <section className="mb-xl">
      <SectionHeader
        title="Notebooks"
        onTitleClick={() => navigate('/notebooks')}
        onCreate={handleCreate}
        createLabel="Eigenes Notebook erstellen"
      />
      <div className={NOTEBOOK_ROW_CLASS}>
        {allCards.map((card) => (
          <NotebookCard key={card.id} item={card} onShare={handleShare} onDelete={handleDelete} />
        ))}
      </div>
      <button
        type="button"
        onClick={() => navigate('/notebooks')}
        className="mt-sm text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 cursor-pointer bg-transparent border-none transition-colors"
      >
        Mehr anzeigen
      </button>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (open) return;
          // Block dismiss while the create request is in flight or documents are
          // still being processed in the background. Once everything is terminal
          // the user closes via the explicit "Schließen" button inside the progress view.
          if (phase.kind === 'editing' && !isCreating) handleClose();
        }}
      >
        <DialogContent
          className="sm:max-w-[700px] w-[calc(100%-1rem)] max-h-[90dvh] overflow-y-auto p-0 [&>[data-slot=dialog-close]]:hidden"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">
            {phase.kind === 'processing' ? 'Notebook wird erstellt' : 'Notebook erstellen'}
          </DialogTitle>
          {phase.kind === 'processing' ? (
            <NotebookCreationProgress
              notebookName={phase.name}
              documents={phase.documents}
              collectionId={phase.collectionId}
              onClose={handleClose}
            />
          ) : (
            <NotebookEditor
              onSave={handleSave}
              onCancel={handleClose}
              editingCollection={null}
              loading={isCreating}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
});

NotebooksSection.displayName = 'NotebooksSection';

export default NotebooksSection;
