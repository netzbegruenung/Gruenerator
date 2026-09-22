import { ConfirmDialogProvider } from '@gruenerator/ui';
import { useCallback, useState } from 'react';

import { useDraftRecipe } from './api';
import RecipeEditor from './RecipeEditor';
import { draftToRecipeForm, EMPTY_RECIPE_FORM, type RecipeFormState } from './recipeFormState';
import RecipeStartScreen from './RecipeStartScreen';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';

/**
 * Guided recipe creator entry (`/agentura/rezept/neu`). A one-shot brief is
 * drafted by the AI, then handed to the same single-page {@link RecipeEditor}
 * the create/edit route uses — pre-filled, never persisted until the user
 * saves. "Lieber manuell anlegen?" skips the draft and opens the same editor
 * with an empty form instead. Mirrors `agents/AgentCreatorPage.tsx`.
 */
function RecipeCreatorPage() {
  const draftMut = useDraftRecipe();
  const [description, setDescription] = useState('');
  const [initialState, setInitialState] = useState<Partial<RecipeFormState> | null>(null);
  const [phase, setPhase] = useState<'start' | 'build'>('start');
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle('Neues Rezept');

  const handleGenerate = useCallback(async () => {
    if (description.trim().length === 0) return;
    setError(null);
    try {
      const spec = await draftMut.mutateAsync({ description: description.trim() });
      setInitialState(draftToRecipeForm(spec));
      setPhase('build');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Entwurf fehlgeschlagen.');
    }
  }, [description, draftMut]);

  const handleManual = useCallback(() => {
    setInitialState(null);
    setPhase('build');
  }, []);

  const handleBack = useCallback(() => {
    setPhase('start');
  }, []);

  if (phase === 'build') {
    // Wie `RecipeEditorPage`: der Editor fragt nach, bevor eine Analyse eine
    // vorhandene Anleitung ersetzt — und hier ist die Anleitung oft der gerade
    // erzeugte Entwurf. Ohne Provider fiele die Frage auf `window.confirm`.
    return (
      <ConfirmDialogProvider>
        <RecipeEditor
          mode="create"
          initialState={{ ...EMPTY_RECIPE_FORM, ...initialState }}
          onCancel={handleBack}
        />
      </ConfirmDialogProvider>
    );
  }

  return (
    <RecipeStartScreen
      description={description}
      onDescriptionChange={setDescription}
      onGenerate={() => void handleGenerate()}
      isLoading={draftMut.isPending}
      error={error}
      onManual={handleManual}
    />
  );
}

export default withAuthRequired(RecipeCreatorPage, { title: 'Neues Rezept' });
