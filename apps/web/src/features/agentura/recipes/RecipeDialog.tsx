import { groupContentKey } from '@gruenerator/shared/groups';
import {
  EMPTY_RECIPE_FORM,
  hydrateRecipeForm,
  useOwnRecipes,
  type RecipeFormState,
} from '@gruenerator/shared/grueneratoren';
import {
  Button,
  ConfirmDialogProvider,
  Dialog,
  DialogContent,
  DialogTitle,
  toast,
} from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { RecipeCategoryChip } from './RecipeCategoryChip';
import { RecipeForm } from './RecipeForm';
import { useRecipeEditor } from './useRecipeEditor';

interface RecipeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Das Projekt, in dem der Dialog geöffnet wird. */
  projectId: string;
  /**
   * Ohne: ein neues Rezept, das gleich ins Projekt geteilt wird. Mit: das
   * eigene Rezept dieser Erwähnung bearbeiten — nur die Besitzerin darf das,
   * Projekt-Admins nicht (das geteilte Rezept ist ein Verweis, keine Kopie).
   */
  mention?: string | null;
}

/**
 * Ein Rezept im Projekt anlegen oder bearbeiten, ohne die Seite zu verlassen:
 * dieselben Felder wie auf der Rezept-Seite (`RecipeForm`), Kategorie und
 * Aktionen in der Fußleiste.
 */
export function RecipeDialog({ open, onOpenChange, projectId, mention = null }: RecipeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        // Radix fokussiert sonst das erste Bedienelement, die Symbol-Auswahl.
        // Getippt wird zuerst der Name — darauf setzt der Körper den Fokus.
        onOpenAutoFocus={(e) => e.preventDefault()}
        aria-describedby={undefined}
        className="flex max-h-[min(88dvh,900px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[640px]"
      >
        {/* Kein sichtbarer Kopf: der Name des Rezepts ist die Überschrift. Der
            Titel bleibt für Screenreader, sonst hätte der Dialog keinen Namen. */}
        <DialogTitle className="sr-only">
          {mention ? 'Rezept bearbeiten' : 'Neues Rezept'}
        </DialogTitle>
        {/* Neu gemountet bei jedem Öffnen: ein abgebrochener Entwurf soll beim
            nächsten Mal nicht wieder dastehen. */}
        {open && (
          <ConfirmDialogProvider>
            {mention ? (
              <EditBody
                mention={mention}
                projectId={projectId}
                onClose={() => onOpenChange(false)}
              />
            ) : (
              <DialogBody
                mode="create"
                initialState={EMPTY_RECIPE_FORM}
                projectId={projectId}
                onClose={() => onOpenChange(false)}
              />
            )}
          </ConfirmDialogProvider>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Lädt das eigene Rezept zur Erwähnung, bevor das Formular entsteht. */
function EditBody({
  mention,
  projectId,
  onClose,
}: {
  mention: string;
  projectId: string;
  onClose: () => void;
}) {
  const { data: ownRecipes, isLoading, isError } = useOwnRecipes(true);
  // Wie `RecipeEditorPage`: ohne Groß-/Kleinschreibung, und nie die geteilte
  // Kopie eines anderen — die gehört nicht der Person.
  const own = ownRecipes?.find(
    (r) => r.mention.toLowerCase() === mention.toLowerCase() && !r.sharedFromGroup
  );

  if (isLoading) {
    return (
      <p role="status" className="m-0 p-lg text-sm text-foreground-muted">
        Lädt …
      </p>
    );
  }
  if (isError || !own) {
    return (
      <div className="flex flex-col gap-md p-lg">
        <p role="alert" className="m-0 text-sm text-destructive">
          {isError
            ? 'Deine Rezepte konnten nicht geladen werden.'
            : 'Dieses Rezept gehört dir nicht und lässt sich hier nicht bearbeiten.'}
        </p>
        <Button variant="ghost" size="sm" className="self-end" onClick={onClose}>
          Schließen
        </Button>
      </div>
    );
  }
  return (
    <DialogBody
      mode="edit"
      initialState={hydrateRecipeForm(own)}
      projectId={projectId}
      onClose={onClose}
    />
  );
}

function DialogBody({
  mode,
  initialState,
  projectId,
  onClose,
}: {
  mode: 'create' | 'edit';
  initialState: RecipeFormState;
  projectId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const editor = useRecipeEditor({
    mode,
    initialState,
    // Nur ein neues Rezept wird beim Speichern ins Projekt geteilt; ein
    // bearbeitetes steht schon drin.
    projectId: mode === 'create' ? projectId : null,
  });
  const titleId = editor.fieldIds.title;
  useEffect(() => {
    document.getElementById(titleId)?.focus();
  }, [titleId]);

  const handleSave = async () => {
    const result = await editor.save();
    if (!result) return;
    if (mode === 'edit') {
      // Titel und Beschreibung stehen auch in der Projektliste.
      void queryClient.invalidateQueries({ queryKey: groupContentKey(projectId) });
      toast.success(`„${result.saved.title}“ gespeichert.`);
    } else if (result.sharedToProject) {
      toast.success(`„${result.saved.title}“ ist jetzt im Projekt.`);
    }
    onClose();
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-lg pt-lg pb-lg">
        {editor.error && (
          <p role="alert" className="mb-md text-sm text-destructive">
            {editor.error}
          </p>
        )}
        <RecipeForm editor={editor} />
      </div>
      <div className="flex flex-wrap items-center gap-sm border-t border-grey-200 px-lg py-sm dark:border-grey-700">
        <RecipeCategoryChip
          value={editor.form.category}
          onChange={(v) => editor.set('category', v)}
        />
        <div className="ml-auto flex items-center gap-xs">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={editor.isSaving}>
            Abbrechen
          </Button>
          <Button
            variant="brand"
            size="brand-sm"
            onClick={() => void handleSave()}
            disabled={editor.isSaving}
          >
            {mode === 'edit' ? 'Speichern' : 'Im Projekt speichern'}
          </Button>
        </div>
      </div>
    </>
  );
}
