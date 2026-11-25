import { useDeleteRecipe, type RecipeFormState } from '@gruenerator/shared/grueneratoren';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useConfirm,
} from '@gruenerator/ui';
import { useState } from 'react';
import { PiDotsThreeBold } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import { useTrashUndoToast } from '../../trash/trashUndoToast';

import { RecipeCategoryChip } from './RecipeCategoryChip';
import { RecipeForm } from './RecipeForm';
import { RecipeSharingPanel } from './RecipeSharingPanel';
import { useRecipeEditor } from './useRecipeEditor';

interface RecipeEditorProps {
  mode: 'create' | 'edit';
  /** EMPTY_RECIPE_FORM (or a classification-seeded variant) for create, hydrateRecipeForm(form) for edit. */
  initialState: RecipeFormState;
  onCancel?: () => void;
  /** Aus einem Projekt angelegt: nach dem ersten Speichern gleich dorthin teilen und zurück. */
  projectId?: string | null;
}

/**
 * Die Seite zum Anlegen und Bearbeiten eines Rezepts: eine Spalte mit den
 * Feldern aus {@link RecipeForm}, darunter eine Leiste, die am unteren Rand
 * klebt — Kategorie links, Aktionen rechts, wie im Projekt-Dialog
 * (`RecipeCreateDialog`). Seltenes und Gefährliches (Im Chat verwenden,
 * Teilen, Löschen) liegt beim Bearbeiten hinter „⋯".
 */
function RecipeEditor({ mode, initialState, onCancel, projectId = null }: RecipeEditorProps) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const deleteMut = useDeleteRecipe();
  const showTrashUndo = useTrashUndoToast();
  const editor = useRecipeEditor({ mode, initialState, projectId });
  const { form, mention, recipeId } = editor;
  const [shareOpen, setShareOpen] = useState(false);

  const handleSave = async () => {
    const result = await editor.save();
    if (!result || mode === 'edit') return;
    if (result.sharedToProject && projectId) {
      void navigate(`/projekte/${encodeURIComponent(projectId)}`);
    } else {
      void navigate(`/agentura/rezept/${encodeURIComponent(result.saved.mention)}`);
    }
  };

  const handleDelete = async () => {
    const name = form.title || mention;
    const ok = await confirm({
      title: `„${name}“ löschen?`,
      description: `„${name}“ wird in den Papierkorb verschoben und kann 30 Tage lang wiederhergestellt werden.`,
      confirmLabel: 'Löschen',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await deleteMut.mutateAsync(mention);
      // DELETE takes the mention; the trash addresses the row id.
      if (recipeId) showTrashUndo({ kind: 'user_text_form', id: recipeId, title: name });
      void navigate('/projekte');
    } catch (err) {
      editor.setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
    }
  };

  const openInChat = () =>
    navigate(
      `/chat?rezept=${encodeURIComponent(mention)}${recipeId ? `&rezeptId=${encodeURIComponent(recipeId)}` : ''}`
    );

  // Teilen gibt es nur für ein eigenes, schon gespeichertes Rezept.
  const canShare = mode === 'edit' && form.kind === 'custom';

  return (
    // Formular und Leiste stehen als ein Block mittig. Wird der Inhalt höher
    // als der Bildschirm, scrollt er, und die Leiste klebt am unteren Rand.
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="flex min-h-full flex-col px-md py-2xl">
        <div className="mx-auto my-auto w-full max-w-[640px]">
          <h1 className="sr-only">{mode === 'create' ? 'Neues Rezept' : 'Rezept bearbeiten'}</h1>
          {editor.error && (
            <p role="alert" className="mb-md text-sm text-destructive">
              {editor.error}
            </p>
          )}
          <RecipeForm editor={editor} />

          <footer className="sticky bottom-0 z-10 mt-lg flex flex-wrap items-center gap-sm border-t border-grey-200 bg-background py-sm pb-[max(var(--spacing-sm),env(safe-area-inset-bottom))] dark:border-grey-700">
            <RecipeCategoryChip value={form.category} onChange={(v) => editor.set('category', v)} />
            <div className="ml-auto flex items-center gap-xs">
              {editor.justSaved && (
                <span role="status" className="text-sm text-foreground-muted">
                  Gespeichert ✓
                </span>
              )}
              {mode === 'edit' && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Weitere Aktionen">
                      <PiDotsThreeBold aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="top">
                    <DropdownMenuItem onSelect={() => void openInChat()}>
                      Im Chat verwenden
                    </DropdownMenuItem>
                    {canShare && (
                      <DropdownMenuItem onSelect={() => setShareOpen(true)}>
                        Teilen …
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={deleteMut.isPending}
                      onSelect={() => void handleDelete()}
                    >
                      Löschen
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => (onCancel ? onCancel() : navigate('/grueneratoren'))}
                disabled={editor.isSaving}
              >
                Abbrechen
              </Button>
              <Button
                variant="brand"
                size="brand-sm"
                onClick={() => void handleSave()}
                disabled={editor.isSaving}
              >
                Speichern
              </Button>
            </div>
          </footer>
        </div>
      </div>

      {canShare && (
        <Dialog open={shareOpen} onOpenChange={setShareOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{`„${form.title || mention}“ teilen`}</DialogTitle>
            </DialogHeader>
            <RecipeSharingPanel mention={mention} enabled={shareOpen} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default RecipeEditor;
