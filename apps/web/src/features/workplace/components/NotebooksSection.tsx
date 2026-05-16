import { type NotebookEditorSavePayload } from '@gruenerator/contracts';
import { Dialog, DialogContent, DialogTitle, SectionHeader } from '@gruenerator/ui';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import ToolGrid from '../../../components/common/ToolGrid';
import { useAuthStore } from '../../../stores/authStore';
import { useNotebookCollections } from '../../auth/hooks/useProfileData';
import NotebookCreationProgress from '../../notebook/components/NotebookCreationProgress';
import NotebookEditor from '../../notebook/components/NotebookEditor';
import {
  getAustrianNotebooks,
  getNotebooksByCategory,
  SYSTEM_NOTEBOOKS,
} from '../../notebook/config/notebooksConfig';

import type { ToolEntry } from '../../../components/common/ToolGrid';
import type { NotebookCollection } from '../../../types/notebook';

const INITIAL_COUNT = 5;

type CreationPhase =
  | { kind: 'closed' }
  | { kind: 'editing' }
  | { kind: 'processing'; name: string; documents: Array<{ id: string; title: string }> };

const NotebooksSection: React.FC = memo(() => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<CreationPhase>({ kind: 'closed' });
  const [showAll, setShowAll] = useState(false);
  const locale = useAuthStore((state) => state.locale);
  const isAustrian = locale === 'de-AT';

  const { query, createQACollection, deleteQACollection, isCreating } = useNotebookCollections({
    isActive: true,
  });
  const qaCollections = query.data ?? [];

  const systemTools: ToolEntry[] = useMemo(
    () =>
      (isAustrian
        ? getAustrianNotebooks()
        : [
            ...getNotebooksByCategory('bundesebene'),
            ...getNotebooksByCategory('landesebene'),
            ...getNotebooksByCategory('weitere'),
          ]
      )
        .slice(0, showAll ? undefined : INITIAL_COUNT)
        .map((nb) => ({
          id: nb.id,
          title: nb.title.replace(/^Frag\s+/i, ''),
          description: nb.description,
          path: nb.path,
          icon: nb.icon,
        })),
    [isAustrian, showAll]
  );

  const userTools: ToolEntry[] = useMemo(
    () =>
      qaCollections.slice(0, 3).map((c: NotebookCollection) => ({
        id: c.id,
        title: c.name,
        description: c.description || 'Eigenes Notebook',
        path: `/notebook/${c.id}`,
      })),
    [qaCollections]
  );

  const allTools = useMemo(() => [...userTools, ...systemTools], [userTools, systemTools]);

  const handleCreate = useCallback(() => setPhase({ kind: 'editing' }), []);
  const handleClose = useCallback(() => setPhase({ kind: 'closed' }), []);

  const handleShare = useCallback((id: string) => {
    void navigator.clipboard.writeText(`${window.location.origin}/notebook/${id}`);
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
      await createQACollection({
        name: data.name,
        description: data.description,
        documents: data.documents,
        wolkeFolders: data.wolkeFolders,
      });
      // Hand off to the progress view, which polls per-document status until terminal.
      // documentMeta carries the upload titles for the progress rows; the IDs from
      // data.documents are authoritative for the polling query.
      setPhase({ kind: 'processing', name: data.name, documents: data.documentMeta });
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
      <ToolGrid
        tools={allTools}
        columns={5}
        compact
        showFavourites
        onShare={handleShare}
        onDelete={handleDelete}
      />
      {SYSTEM_NOTEBOOKS.length > INITIAL_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-sm text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 cursor-pointer bg-transparent border-none transition-colors"
        >
          {showAll ? 'Weniger anzeigen' : 'Weitere Notebooks'}
        </button>
      )}

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
