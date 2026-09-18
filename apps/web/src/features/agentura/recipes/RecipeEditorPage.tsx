import { useUserLandesverbaende } from '@gruenerator/chat';
import { Button, ConfirmDialogProvider } from '@gruenerator/ui';
import { type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useOwnRecipes } from './api';
import RecipeEditor from './RecipeEditor';
import { EMPTY_RECIPE_FORM, hydrateRecipeForm, type RecipeFormState } from './recipeFormState';
import { classifyRecipeMention } from './recipeKind';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
import PageContainer from '@/components/common/PageContainer';
import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';

/**
 * Create/edit route (`/agentura/rezept/:mention/bearbeiten`): classifies the
 * mention (preset / Landesverbands-Rezept / custom) and hands the shared
 * single-page {@link RecipeEditor} the right starting state — an existing own
 * row in edit mode, otherwise a fresh one seeded from the classification. The
 * same editor backs both, so create and edit look and behave identically.
 *
 * Wrapped in `ConfirmDialogProvider` so the editor's delete confirmation
 * (`useConfirm()`) renders the styled AlertDialog instead of falling back to
 * `window.confirm` — no provider is mounted further up this route's tree.
 */
function RecipeEditorPage() {
  const { mention: rawMention } = useParams<{ mention: string }>();
  const mention = decodeURIComponent(rawMention ?? '');
  const { lvIds } = useUserLandesverbaende();
  const classification = classifyRecipeMention(mention, lvIds);

  const { data: ownRecipes, isLoading, isError, refetch } = useOwnRecipes(true);
  const ownForm = ownRecipes?.find((r) => r.mention === mention && !r.sharedFromGroup);

  useDocumentTitle(`${ownForm?.title ?? classification.label} bearbeiten`);

  let content: ReactNode;
  if (isLoading) {
    content = (
      <PageContainer maxWidth="md">
        <p className="text-foreground-muted">Lädt…</p>
      </PageContainer>
    );
  } else if (isError) {
    // A failed load must never fall through to "kein eigenes Rezept" — that
    // would open the create form and a save could overwrite an existing
    // override the page just failed to see.
    content = (
      <PageContainer maxWidth="md">
        <p className="mb-md text-foreground">Deine Rezepte konnten nicht geladen werden.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Erneut versuchen
        </Button>
      </PageContainer>
    );
  } else if (ownForm) {
    content = (
      <RecipeEditor key={ownForm.id} mode="edit" initialState={hydrateRecipeForm(ownForm)} />
    );
  } else if (!classification.entitled) {
    content = (
      <PageContainer maxWidth="md">
        <p className="mb-md text-foreground">
          Dieses Rezept ist deinem Landesverband nicht zugeteilt.
        </p>
        <Link
          to="/agentura"
          className="text-sm text-primary-600 hover:underline dark:text-primary-300"
        >
          Zurück zur Agentura
        </Link>
      </PageContainer>
    );
  } else {
    const initialState: RecipeFormState =
      classification.kind === 'custom'
        ? EMPTY_RECIPE_FORM
        : {
            ...EMPTY_RECIPE_FORM,
            kind: classification.kind,
            fixedMention: classification.mention,
            mention: classification.mention,
            textType: classification.textType,
            title: classification.label,
          };
    content = <RecipeEditor mode="create" initialState={initialState} />;
  }

  return <ConfirmDialogProvider>{content}</ConfirmDialogProvider>;
}

export default withAuthRequired(RecipeEditorPage, { title: 'Rezept bearbeiten' });
