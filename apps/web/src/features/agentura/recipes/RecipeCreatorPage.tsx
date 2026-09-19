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
 * saves. "Aus Beispielen anlernen" and "Lieber manuell anlegen?" skip the
 * draft and open the same editor with an empty form instead. Mirrors
 * `agents/AgentCreatorPage.tsx`.
 */
function RecipeCreatorPage() {
  const draftMut = useDraftRecipe();
  const [description, setDescription] = useState('');
  const [initialState, setInitialState] = useState<Partial<RecipeFormState> | null>(null);
  const [initialSection, setInitialSection] = useState<'grund' | 'beispiele'>('grund');
  const [phase, setPhase] = useState<'start' | 'build'>('start');
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle('Neues Rezept');

  const handleGenerate = useCallback(async () => {
    if (description.trim().length === 0) return;
    setError(null);
    try {
      const spec = await draftMut.mutateAsync({ description: description.trim() });
      setInitialState(draftToRecipeForm(spec));
      setInitialSection('grund');
      setPhase('build');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Entwurf fehlgeschlagen.');
    }
  }, [description, draftMut]);

  const handleLearnFromExamples = useCallback(() => {
    setInitialState(null);
    setInitialSection('beispiele');
    setPhase('build');
  }, []);

  const handleManual = useCallback(() => {
    setInitialState(null);
    setInitialSection('grund');
    setPhase('build');
  }, []);

  const handleBack = useCallback(() => {
    setPhase('start');
  }, []);

  if (phase === 'build') {
    return (
      <RecipeEditor
        mode="create"
        initialState={{ ...EMPTY_RECIPE_FORM, ...initialState }}
        initialSection={initialSection}
        onCancel={handleBack}
      />
    );
  }

  return (
    <RecipeStartScreen
      description={description}
      onDescriptionChange={setDescription}
      onGenerate={() => void handleGenerate()}
      isLoading={draftMut.isPending}
      error={error}
      onLearnFromExamples={handleLearnFromExamples}
      onManual={handleManual}
    />
  );
}

export default withAuthRequired(RecipeCreatorPage, { title: 'Neues Rezept' });
