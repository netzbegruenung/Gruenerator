import React, { useState, useCallback, useMemo, memo, lazy, Suspense } from 'react';
import { useNavigate, Link } from 'react-router-dom';

import { useCustomPromptsData, useSavedPromptsData, usePromptMutations } from './usePromptsData';

import type { CustomPrompt } from './types';
import '../../assets/styles/components/ui/button.css';
import './prompts.css';

const CreatePromptForm = lazy(() => import('./CreatePromptForm'));

interface PromptsTabProps {
  isActive: boolean;
}

const LoadingSpinner = memo(() => (
  <div className="prompts-loading">
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
    <button type="button" className="prompt-card prompt-card--owner" onClick={handleUse}>
      <div className="prompt-card-content">
        <span className="prompt-card-name">{prompt.name}</span>
        {prompt.is_public && <span className="prompt-card-badge">Öffentlich</span>}
      </div>
      <div className="prompt-card-actions" onClick={stopPropagation}>
        <button
          type="button"
          className="prompt-card-action"
          onClick={handleEdit}
          title="Bearbeiten"
        >
          ✏️
        </button>
        <button
          type="button"
          className="prompt-card-action prompt-card-action--danger"
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
    <button type="button" className="prompt-card prompt-card--saved" onClick={handleUse}>
      <div className="prompt-card-content">
        <span className="prompt-card-name">{prompt.name}</span>
        {prompt.owner_first_name && (
          <span className="prompt-card-badge prompt-card-badge--owner">
            von {prompt.owner_first_name}
          </span>
        )}
      </div>
      <div className="prompt-card-actions" onClick={stopPropagation}>
        <button
          type="button"
          className="prompt-card-action prompt-card-action--danger"
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
      <div className="prompts-tab">
        <div className="prompts-content">
          <Suspense fallback={<LoadingSpinner />}>
            <CreatePromptForm
              editingPrompt={editingPrompt}
              onComplete={handleFormComplete}
              onCancel={prompts.length > 0 || savedPrompts.length > 0 ? handleFormCancel : undefined}
            />
          </Suspense>
          <Link to="/datenbank/agents" className="prompts-gallery-link">
            Öffentliche Agenten entdecken →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="prompts-tab">
      <div className="prompts-content">
        <button type="button" className="btn-primary" onClick={openCreateForm}>
          + Neuen Agenten erstellen
        </button>

        {prompts.length > 0 && (
          <div className="prompts-section">
            <h4>Meine Agenten</h4>
            <div className="prompts-list">
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
          <div className="prompts-section">
            <h4>Gespeicherte Agenten</h4>
            <div className="prompts-list">
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

        <Link to="/datenbank/agents" className="prompts-gallery-link">
          Öffentliche Agenten entdecken →
        </Link>
      </div>
    </div>
  );
});

PromptsTab.displayName = 'PromptsTab';

export default PromptsTab;
