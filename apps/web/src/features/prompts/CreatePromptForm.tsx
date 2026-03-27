import { Button } from '@gruenerator/ui';
import React, { useState, useCallback, memo, useEffect } from 'react';

import { TextAreaInput } from '../../components/common/Form/Input';
import RequiredFieldToggle from '../../components/common/RequiredFieldToggle';

import { usePromptMutations } from './usePromptsData';

import type { CustomPrompt } from './types';

interface CreatePromptFormProps {
  editingPrompt?: CustomPrompt | null;
  onComplete: () => void;
  onCancel?: () => void;
}

const CreatePromptForm: React.FC<CreatePromptFormProps> = memo(
  ({ editingPrompt, onComplete, onCancel }) => {
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

    const handleSubmit = useCallback(
      async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!prompt.trim()) {
          setError('Bitte gib eine Anweisung ein.');
          return;
        }

        try {
          if (isEditing && editingPrompt) {
            await updatePrompt({
              id: editingPrompt.id,
              prompt: prompt.trim(),
              is_public: isPublic,
            });
          } else {
            await createPrompt({
              prompt: prompt.trim(),
              is_public: isPublic,
            });
          }
          onComplete();
        } catch (err) {
          setError((err as Error).message || 'Ein Fehler ist aufgetreten.');
        }
      },
      [prompt, isPublic, isEditing, editingPrompt, createPrompt, updatePrompt, onComplete]
    );

    return (
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-sm w-full max-w-[600px] mx-auto [&_.form-field-wrapper]:mb-0"
      >
        {error && (
          <div className="px-md py-sm bg-[var(--background-red-light)] text-[var(--error-red)] rounded-md text-sm">
            {error}
          </div>
        )}

        <TextAreaInput
          id="prompt-textarea"
          value={prompt}
          onChange={handlePromptChange}
          placeholder="Schreibe deine Anweisung hier... Der Titel wird automatisch generiert."
          rows={6}
        />

        <div className="flex items-center justify-between gap-md max-md:flex-col max-md:items-stretch">
          <RequiredFieldToggle checked={isPublic} onChange={setIsPublic} label="Öffentlich" />

          <div className="flex gap-sm max-md:w-full [&_button]:max-md:flex-1">
            {onCancel && (
              <Button
                type="button"
                variant="brand-outline"
                size="brand"
                onClick={onCancel}
                disabled={isLoading}
              >
                Abbrechen
              </Button>
            )}
            <Button
              variant="brand"
              size="brand"
              type="submit"
              disabled={isLoading || !prompt.trim()}
            >
              {isLoading ? 'Speichert...' : 'Speichern'}
            </Button>
          </div>
        </div>
      </form>
    );
  }
);

CreatePromptForm.displayName = 'CreatePromptForm';

export default CreatePromptForm;
