import React, { useState, useCallback, memo, useEffect } from 'react';
import { usePromptMutations } from './usePromptsData';
import type { CustomPrompt } from './types';
import { TextAreaInput } from '../../components/common/Form/Input';
import RequiredFieldToggle from '../../components/common/RequiredFieldToggle';
import '../../assets/styles/components/form/form-inputs.css';
import '../../assets/styles/components/ui/button.css';
import './prompts.css';

interface CreatePromptFormProps {
  editingPrompt?: CustomPrompt | null;
  onComplete: () => void;
  onCancel?: () => void;
}

const CreatePromptForm: React.FC<CreatePromptFormProps> = memo(({
  editingPrompt,
  onComplete,
  onCancel
}) => {
  const [prompt, setPrompt] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { createPrompt, updatePrompt, isCreating, isUpdating } = usePromptMutations();
  const isEditing = !!editingPrompt;
  const isLoading = isCreating || isUpdating;

  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
  }, []);

  useEffect(() => {
    if (editingPrompt) {
      setPrompt(editingPrompt.prompt || '');
      setIsPublic(editingPrompt.is_public || false);
    }
  }, [editingPrompt]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!prompt.trim()) {
      setError('Bitte gib einen Prompt ein.');
      return;
    }

    try {
      if (isEditing && editingPrompt) {
        await updatePrompt({
          id: editingPrompt.id,
          prompt: prompt.trim(),
          is_public: isPublic
        });
      } else {
        await createPrompt({
          prompt: prompt.trim(),
          is_public: isPublic
        });
      }
      onComplete();
    } catch (err) {
      setError((err as Error).message || 'Ein Fehler ist aufgetreten.');
    }
  }, [prompt, isPublic, isEditing, editingPrompt, createPrompt, updatePrompt, onComplete]);

  return (
    <form onSubmit={handleSubmit} className="prompt-form-simple">
      {error && <div className="prompt-form-error">{error}</div>}

      <TextAreaInput
        id="prompt-textarea"
        value={prompt}
        onChange={handlePromptChange}
        placeholder="Schreibe deinen Prompt hier... Der Titel wird automatisch generiert."
        rows={6}
      />

      <div className="prompt-form-footer">
        <RequiredFieldToggle
          checked={isPublic}
          onChange={setIsPublic}
          label="Öffentlich"
        />

        <div className="prompt-form-actions">
          {onCancel && (
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={isLoading}>
              Abbrechen
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={isLoading || !prompt.trim()}>
            {isLoading ? 'Speichert...' : 'Speichern'}
          </button>
        </div>
      </div>
    </form>
  );
});

CreatePromptForm.displayName = 'CreatePromptForm';

export default CreatePromptForm;
