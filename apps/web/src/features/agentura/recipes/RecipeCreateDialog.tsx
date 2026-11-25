import { EMPTY_RECIPE_FORM } from '@gruenerator/shared/grueneratoren';
import {
  Button,
  ConfirmDialogProvider,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  toast,
} from '@gruenerator/ui';

import { RecipeCategoryChip } from './RecipeCategoryChip';
import { RecipeForm } from './RecipeForm';
import { useRecipeEditor } from './useRecipeEditor';

interface RecipeCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Das Projekt, in das das neue Rezept gleich geteilt wird. */
  projectId: string;
}

/**
 * Ein Rezept direkt im Projekt anlegen, ohne die Seite zu verlassen: dieselben
 * Felder wie auf der Rezept-Seite, „Im Projekt speichern" legt es an und teilt
 * es hierher. Das Rezept gehört trotzdem der Person.
 */
export function RecipeCreateDialog({ open, onOpenChange, projectId }: RecipeCreateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[min(88dvh,900px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[640px]"
      >
        {/* Neu gemountet bei jedem Öffnen: ein abgebrochener Entwurf soll beim
            nächsten Mal nicht wieder dastehen. */}
        {open && (
          <ConfirmDialogProvider>
            <RecipeCreateDialogBody projectId={projectId} onClose={() => onOpenChange(false)} />
          </ConfirmDialogProvider>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RecipeCreateDialogBody({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const editor = useRecipeEditor({ mode: 'create', initialState: EMPTY_RECIPE_FORM, projectId });

  const handleSave = async () => {
    const result = await editor.save();
    if (!result) return;
    if (result.sharedToProject) toast.success(`„${result.saved.title}“ ist jetzt im Projekt.`);
    onClose();
  };

  return (
    <>
      <DialogHeader className="px-lg pt-lg pb-xs text-left">
        <DialogTitle>Neues Rezept</DialogTitle>
        <DialogDescription>Alle im Projekt können es nutzen.</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-lg pt-sm pb-lg">
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
            Im Projekt speichern
          </Button>
        </div>
      </div>
    </>
  );
}
