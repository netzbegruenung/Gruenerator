import React, { useState, useCallback, useMemo, memo, lazy, Suspense } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCustomPromptsData, usePromptMutations } from './usePromptsData';
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
        {prompt.is_public && (
          <span className="prompt-card-badge">Öffentlich</span>
        )}
      </div>
      <div className="prompt-card-actions" onClick={stopPropagation}>
        <button type="button" className="prompt-card-action" onClick={handleEdit} title="Bearbeiten">
          ✏️
        </button>
        <button type="button" className="prompt-card-action prompt-card-action--danger" onClick={handleDelete} title="Löschen">
          🗑️
        </button>
      </div>
    </button>
  );
});
PromptCard.displayName = 'PromptCard';

const PromptsTab: React.FC<PromptsTabProps> = memo(({ isActive }) => {
  const navigate = useNavigate();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<CustomPrompt | null>(null);

  const { query: promptsQuery } = useCustomPromptsData({ isActive, enabled: isActive });
  const { deletePrompt } = usePromptMutations();

  const prompts = useMemo(() => promptsQuery.data || [], [promptsQuery.data]);

  const handleUsePrompt = useCallback((slug: string) => {
    navigate(`/prompt/${slug}`);
  }, [navigate]);

  const handleEditPrompt = useCallback((prompt: CustomPrompt) => {
    setEditingPrompt(prompt);
    setShowCreateForm(true);
  }, []);

  const handleDeletePrompt = useCallback(async (promptId: string) => {
    if (window.confirm('Prompt wirklich löschen?')) {
      await deletePrompt(promptId);
    }
  }, [deletePrompt]);

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

  const showForm = showCreateForm || prompts.length === 0;

  if (showForm) {
    return (
      <div className="prompts-tab">
        <div className="prompts-content">
          <Suspense fallback={<LoadingSpinner />}>
            <CreatePromptForm
              editingPrompt={editingPrompt}
              onComplete={handleFormComplete}
              onCancel={prompts.length > 0 ? handleFormCancel : undefined}
            />
          </Suspense>
          <Link to="/datenbank/prompts" className="prompts-gallery-link">
            Öffentliche Prompts entdecken →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="prompts-tab">
      <div className="prompts-content">
        <button
          type="button"
          className="btn-primary"
          onClick={openCreateForm}
        >
          + Neuen Prompt erstellen
        </button>

        <div className="prompts-section">
          <h4>Meine Prompts</h4>
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

        <Link to="/datenbank/prompts" className="prompts-gallery-link">
          Öffentliche Prompts entdecken →
        </Link>
      </div>
    </div>
  );
});

PromptsTab.displayName = 'PromptsTab';

export default PromptsTab;
