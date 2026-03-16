import React, { useState, useCallback, useMemo, memo, lazy, Suspense } from 'react';
import { useNavigate, Link } from 'react-router-dom';

import { btn } from '../../utils/buttonStyles';
import { cn } from '../../utils/cn';

import { useCustomPromptsData, useSavedPromptsData, usePromptMutations } from './usePromptsData';

import type { CustomPrompt } from './types';

const CreatePromptForm = lazy(() => import('./CreatePromptForm'));

interface PromptsTabProps {
  isActive: boolean;
}

const LoadingSpinner = memo(() => (
  <div className="flex justify-center p-lg">
    <div className="loading-spinner" />
  </div>
));
LoadingSpinner.displayName = 'LoadingSpinner';

interface PromptCardProps {
  prompt: CustomPrompt;
  onUse: (slug: string) => void;
  onEdit: (prompt: CustomPrompt) => void;
  onDelete: (id: string) => void;
}

const PromptCard = memo<PromptCardProps>(({ prompt, onUse, onEdit, onDelete }) => {
  const handleUse = useCallback(() => onUse(prompt.slug), [onUse, prompt.slug]);
  const handleEdit = useCallback(() => onEdit(prompt), [onEdit, prompt]);
  const handleDelete = useCallback(() => onDelete(prompt.id), [onDelete, prompt.id]);
  const stopPropagation = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

  return (
    <button
      type="button"
      className={cn(
        'w-full flex items-center justify-between px-md py-sm bg-background-alt border border-grey-200 dark:border-grey-700 rounded-md cursor-pointer text-left transition-all duration-150',
        'hover:bg-hover-alt hover:border-secondary-600',
        'border-l-[3px] border-l-secondary-600',
        'max-md:flex-col max-md:items-stretch max-md:gap-2'
      )}
      onClick={handleUse}
    >
      <div className="flex-1 min-w-0 flex items-center gap-sm">
        <span className="font-medium text-foreground whitespace-nowrap overflow-hidden text-ellipsis">
          {prompt.name}
        </span>
        {prompt.is_public && (
          <span className="text-xs px-2 py-0.5 rounded-xl font-medium bg-secondary-100 text-secondary-600 shrink-0">
            Öffentlich
          </span>
        )}
      </div>
      <div className="flex gap-1 ml-sm max-md:ml-0 max-md:justify-end" onClick={stopPropagation}>
        <button
          type="button"
          className="size-8 flex items-center justify-center bg-transparent border-none rounded cursor-pointer transition-colors duration-150 hover:bg-background"
          onClick={handleEdit}
          title="Bearbeiten"
        >
          ✏️
        </button>
        <button
          type="button"
          className="size-8 flex items-center justify-center bg-transparent border-none rounded cursor-pointer transition-colors duration-150 hover:bg-[var(--background-red-light)]"
          onClick={handleDelete}
          title="Löschen"
        >
          🗑️
        </button>
      </div>
    </button>
  );
});
PromptCard.displayName = 'PromptCard';

interface SavedPromptCardProps {
  prompt: CustomPrompt;
  onUse: (slug: string) => void;
  onUnsave: (id: string) => void;
}

const SavedPromptCard = memo<SavedPromptCardProps>(({ prompt, onUse, onUnsave }) => {
  const handleUse = useCallback(() => onUse(prompt.slug), [onUse, prompt.slug]);
  const handleUnsave = useCallback(() => onUnsave(prompt.id), [onUnsave, prompt.id]);
  const stopPropagation = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

  return (
    <button
      type="button"
      className={cn(
        'w-full flex items-center justify-between px-md py-sm bg-background-alt border border-grey-200 dark:border-grey-700 rounded-md cursor-pointer text-left transition-all duration-150',
        'hover:bg-hover-alt hover:border-secondary-600',
        'border-l-[3px] border-l-primary-600',
        'max-md:flex-col max-md:items-stretch max-md:gap-2'
      )}
      onClick={handleUse}
    >
      <div className="flex-1 min-w-0 flex items-center gap-sm">
        <span className="font-medium text-foreground whitespace-nowrap overflow-hidden text-ellipsis">
          {prompt.name}
        </span>
        {prompt.owner_first_name && (
          <span className="text-xs px-2 py-0.5 rounded-xl font-medium bg-grey-100 text-grey-600 shrink-0">
            von {prompt.owner_first_name}
          </span>
        )}
      </div>
      <div className="flex gap-1 ml-sm max-md:ml-0 max-md:justify-end" onClick={stopPropagation}>
        <button
          type="button"
          className="size-8 flex items-center justify-center bg-transparent border-none rounded cursor-pointer transition-colors duration-150 hover:bg-[var(--background-red-light)]"
          onClick={handleUnsave}
          title="Nicht mehr speichern"
        >
          ✕
        </button>
      </div>
    </button>
  );
});
SavedPromptCard.displayName = 'SavedPromptCard';

const PromptsTab: React.FC<PromptsTabProps> = memo(({ isActive }) => {
  const navigate = useNavigate();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<CustomPrompt | null>(null);

  const { query: promptsQuery } = useCustomPromptsData({ isActive, enabled: isActive });
  const { query: savedQuery } = useSavedPromptsData({ isActive, enabled: isActive });
  const { deletePrompt, unsavePrompt } = usePromptMutations();

  const prompts = useMemo(() => promptsQuery.data || [], [promptsQuery.data]);
  const savedPrompts = useMemo(() => savedQuery.data || [], [savedQuery.data]);

  const handleUsePrompt = useCallback(
    (slug: string) => {
      navigate(`/agent/${slug}`);
    },
    [navigate]
  );

  const handleEditPrompt = useCallback((prompt: CustomPrompt) => {
    setEditingPrompt(prompt);
    setShowCreateForm(true);
  }, []);

  const handleDeletePrompt = useCallback(
    async (promptId: string) => {
      if (window.confirm('Agent wirklich löschen?')) {
        await deletePrompt(promptId);
      }
    },
    [deletePrompt]
  );

  const handleUnsavePrompt = useCallback(
    async (promptId: string) => {
      await unsavePrompt(promptId);
    },
    [unsavePrompt]
  );

  const handleFormComplete = useCallback(() => {
    setShowCreateForm(false);
    setEditingPrompt(null);
    promptsQuery.refetch();
  }, [promptsQuery]);

  const handleFormCancel = useCallback(() => {
    setShowCreateForm(false);
    setEditingPrompt(null);
  }, []);

  const openCreateForm = useCallback(() => setShowCreateForm(true), []);

  if (!isActive) return null;

  if (promptsQuery.isLoading) {
    return <LoadingSpinner />;
  }

  const showForm = showCreateForm || (prompts.length === 0 && savedPrompts.length === 0);

  if (showForm) {
    return (
      <div className="w-full">
        <div className="flex flex-col items-center gap-md">
          <Suspense fallback={<LoadingSpinner />}>
            <CreatePromptForm
              editingPrompt={editingPrompt}
              onComplete={handleFormComplete}
              onCancel={
                prompts.length > 0 || savedPrompts.length > 0 ? handleFormCancel : undefined
              }
            />
          </Suspense>
          <Link
            to="/datenbank/agents"
            className="w-full block text-center p-md mt-md text-secondary-600 no-underline font-medium border-t border-grey-200 dark:border-grey-700 hover:underline"
          >
            Öffentliche Agenten entdecken →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex flex-col items-center gap-md">
        <button type="button" className={btn.primary} onClick={openCreateForm}>
          + Neuen Agenten erstellen
        </button>

        {prompts.length > 0 && (
          <div className="w-full mt-sm">
            <h4 className="m-0 mb-sm text-sm font-semibold text-grey-500 uppercase tracking-wide">
              Meine Agenten
            </h4>
            <div className="flex flex-col gap-xs">
              {prompts.map((prompt) => (
                <PromptCard
                  key={prompt.id}
                  prompt={prompt}
                  onUse={handleUsePrompt}
                  onEdit={handleEditPrompt}
                  onDelete={handleDeletePrompt}
                />
              ))}
            </div>
          </div>
        )}

        {savedPrompts.length > 0 && (
          <div className="w-full mt-sm">
            <h4 className="m-0 mb-sm text-sm font-semibold text-grey-500 uppercase tracking-wide">
              Gespeicherte Agenten
            </h4>
            <div className="flex flex-col gap-xs">
              {savedPrompts.map((prompt) => (
                <SavedPromptCard
                  key={prompt.id}
                  prompt={prompt}
                  onUse={handleUsePrompt}
                  onUnsave={handleUnsavePrompt}
                />
              ))}
            </div>
          </div>
        )}

        <Link
          to="/datenbank/agents"
          className="w-full block text-center p-md mt-md text-secondary-600 no-underline font-medium border-t border-grey-200 dark:border-grey-700 hover:underline"
        >
          Öffentliche Agenten entdecken →
        </Link>
      </div>
    </div>
  );
});

PromptsTab.displayName = 'PromptsTab';

export default PromptsTab;
