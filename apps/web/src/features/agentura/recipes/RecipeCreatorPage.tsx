import {
  useDraftRecipe,
  EMPTY_RECIPE_FORM,
  readFromAnswer,
  recipeFormFromAnswer,
  recipeDraftBrief,
  type RecipeFormState,
} from '@gruenerator/shared/grueneratoren';
import { ConfirmDialogProvider } from '@gruenerator/ui';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import RecipeEditor from './RecipeEditor';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';

/**
 * `/agentura/rezept/neu`: öffnet den {@link RecipeEditor} leer.
 *
 * „Als Rezept speichern“ unter einer Chat-Antwort kommt mit
 * `location.state.fromAnswer`: dann entsteht vorher ein KI-Entwurf aus der
 * Antwort, und die Antwort steht als erstes Beispiel im Editor. Misslingt der
 * Entwurf, öffnet der Editor trotzdem mit dem Beispiel — die Antwort darf nicht
 * verloren gehen.
 */
function RecipeCreatorPage() {
  const navigate = useNavigate();
  const draftMut = useDraftRecipe();
  useDocumentTitle('Neues Rezept');
  // Von der Projektseite: nach dem Speichern gleich dorthin teilen.
  const projectId = useSearchParams()[0].get('projekt');

  const fromAnswer = readFromAnswer(useLocation().state);
  const [initialState, setInitialState] = useState<Partial<RecipeFormState> | null>(
    fromAnswer ? null : {}
  );
  const answerStarted = useRef(false);
  useEffect(() => {
    if (!fromAnswer || answerStarted.current) return;
    answerStarted.current = true;
    void draftMut
      .mutateAsync({ description: recipeDraftBrief(fromAnswer.text) })
      .then((spec) => recipeFormFromAnswer(fromAnswer.text, spec))
      .catch(() => recipeFormFromAnswer(fromAnswer.text, null))
      .then(setInitialState);
  }, [fromAnswer, draftMut]);

  if (initialState === null) {
    return (
      <p role="status" className="p-lg text-center text-sm text-foreground-muted">
        Aus der Antwort wird ein Rezeptentwurf gemacht …
      </p>
    );
  }

  // Der Editor fragt nach, bevor eine Analyse oder „Mit KI erstellen" etwas
  // ersetzt. Ohne Provider fiele die Frage auf `window.confirm`.
  return (
    <ConfirmDialogProvider>
      <RecipeEditor
        mode="create"
        initialState={{ ...EMPTY_RECIPE_FORM, ...initialState }}
        onCancel={
          projectId ? () => void navigate(`/projekte/${encodeURIComponent(projectId)}`) : undefined
        }
        projectId={projectId}
      />
    </ConfirmDialogProvider>
  );
}

export default withAuthRequired(RecipeCreatorPage, { title: 'Neues Rezept' });
