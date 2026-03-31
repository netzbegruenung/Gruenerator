import { Dialog, DialogContent, DialogTitle, SectionHeader } from '@gruenerator/ui';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import ToolGrid from '../../../components/common/ToolGrid';
import { useAuthStore } from '../../../stores/authStore';
import { useNotebookCollections } from '../../auth/hooks/useProfileData';
import NotebookEditor from '../../notebook/components/NotebookEditor';
import {
  getAustrianNotebooks,
  getNotebooksByCategory,
  SYSTEM_NOTEBOOKS,
} from '../../notebook/config/notebooksConfig';

import type { ToolEntry } from '../../../components/common/ToolGrid';
import type { NotebookCollection } from '../../../types/notebook';

const INITIAL_COUNT = 5;

const NotebooksSection: React.FC = memo(() => {
  const navigate = useNavigate();
  const [showEditor, setShowEditor] = useState(false);
  const locale = useAuthStore((state) => state.locale);
  const isAustrian = locale === 'de-AT';

  const { query, createQACollection, deleteQACollection } = useNotebookCollections({
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
        .slice(0, INITIAL_COUNT)
        .map((nb) => ({
          id: nb.id,
          title: nb.title.replace(/^Frag\s+/i, ''),
          description: nb.description,
          path: nb.path,
          icon: nb.icon,
        })),
    [isAustrian]
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

  const handleCreate = useCallback(() => setShowEditor(true), []);
  const handleCancel = useCallback(() => setShowEditor(false), []);

  const handleShare = useCallback((id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/notebook/${id}`);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      if (window.confirm('Notebook wirklich löschen?')) {
        deleteQACollection(id);
      }
    },
    [deleteQACollection]
  );

  const handleSave = useCallback(
    async (data: unknown) => {
      const saveData = data as {
        name: string;
        description?: string;
        documents?: (string | number)[];
      };
      await createQACollection({
        name: saveData.name,
        description: saveData.description,
        documents: saveData.documents,
      });
      setShowEditor(false);
    },
    [createQACollection]
  );

  return (
    <section className="mb-xl">
      <SectionHeader
        title="Notebooks"
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
          onClick={() => navigate('/recherche')}
          className="mt-sm text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 cursor-pointer bg-transparent border-none transition-colors"
        >
          Alle Notebooks anzeigen
        </button>
      )}

      <Dialog open={showEditor} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogTitle className="sr-only">Notebook erstellen</DialogTitle>
          <NotebookEditor
            onSave={handleSave}
            onCancel={handleCancel}
            editingCollection={null}
            loading={false}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
});

NotebooksSection.displayName = 'NotebooksSection';

export default NotebooksSection;
