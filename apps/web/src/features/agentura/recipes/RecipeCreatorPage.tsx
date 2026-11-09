import { MAX_DRAFT_BRIEF_CHARS } from '@gruenerator/contracts';
import {
  useDraftRecipe,
  draftToRecipeForm,
  EMPTY_RECIPE_FORM,
  readFromAnswer,
  recipeFormFromAnswer,
  recipeDraftBrief,
  type RecipeFormState,
} from '@gruenerator/shared/grueneratoren';
import { ConfirmDialogProvider } from '@gruenerator/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import RecipeEditor from './RecipeEditor';
import RecipeStartScreen from './RecipeStartScreen';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';

/**
 * Guided recipe creator entry (`/agentura/rezept/neu`). A one-shot brief is
 * drafted by the AI, then handed to the same single-page {@link RecipeEditor}
 * the create/edit route uses — pre-filled, never persisted until the user
 * saves. "Lieber manuell anlegen?" skips the draft and opens the same editor
 * with an empty form instead. Mirrors `agents/AgentCreatorPage.tsx`.
 *
 * „Als Rezept speichern“ unter einer Chat-Antwort kommt mit
 * `location.state.fromAnswer`: dann entfällt die Beschreibung, der Entwurf
 * entsteht aus festem Auftrag, und die Antwort steht als erstes Beispiel im
 * Editor. Misslingt der Entwurf, öffnet der Editor trotzdem mit dem Beispiel —
 * die Antwort darf nicht verloren gehen.
 */
function RecipeCreatorPage() {
  const draftMut = useDraftRecipe();
  const [description, setDescription] = useState('');
  const [initialState, setInitialState] = useState<Partial<RecipeFormState> | null>(null);
  const [phase, setPhase] = useState<'start' | 'build'>('start');
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle('Neues Rezept');

  const fromAnswer = readFromAnswer(useLocation().state);
  const answerStarted = useRef(false);
  useEffect(() => {
    if (!fromAnswer || answerStarted.current) return;
    answerStarted.current = true;
    void draftMut
      .mutateAsync({ description: recipeDraftBrief(fromAnswer.text) })
      .then((spec) => recipeFormFromAnswer(fromAnswer.text, spec))
      .catch(() => recipeFormFromAnswer(fromAnswer.text, null))
      .then((form) => {
        setInitialState(form);
        setPhase('build');
      });
  }, [fromAnswer, draftMut]);

  const handleGenerate = useCallback(async () => {
    const brief = description.trim();
    if (brief.length === 0) return;
    if (brief.length > MAX_DRAFT_BRIEF_CHARS) {
      setError(
        `Die Beschreibung ist zu lang (${brief.length.toLocaleString('de-DE')} von max. ${MAX_DRAFT_BRIEF_CHARS.toLocaleString('de-DE')} Zeichen).`
      );
      return;
    }
    setError(null);
    try {
      const spec = await draftMut.mutateAsync({ description: brief });
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

  if (fromAnswer && initialState === null) {
    return (
      <p role="status" className="p-lg text-center text-sm text-foreground-muted">
        Aus der Antwort wird ein Rezeptentwurf gemacht …
      </p>
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
