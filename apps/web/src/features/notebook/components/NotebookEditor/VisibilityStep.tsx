import { Button, Label, Switch } from '@gruenerator/ui';

import { cn } from '../../../../utils/cn';

import type { NotebookEditorStateBundle } from './useNotebookEditorState';

interface VisibilityStepProps {
  state: NotebookEditorStateBundle;
}

export default function VisibilityStep({ state }: VisibilityStepProps) {
  const {
    isPublic,
    setIsPublic,
    publicOwnership,
    setPublicOwnership,
    canAdvanceFromVisibility,
    handleBack,
    handleNext,
    loading,
  } = state;

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex items-start justify-between gap-md rounded-lg border border-grey-200 p-md dark:border-grey-700">
        <div className="space-y-xs">
          <Label htmlFor="notebook-public-toggle" className="text-base">
            Notebook öffentlich machen
          </Label>
          <p className="text-sm text-grey-500 dark:text-grey-400">
            Dein Notebook erscheint unter „Von der Basis" auf der Notebooks-Seite.
          </p>
        </div>
        <Switch
          id="notebook-public-toggle"
          checked={isPublic}
          onCheckedChange={(checked) => {
            setIsPublic(checked);
            if (!checked) setPublicOwnership(null);
          }}
          disabled={loading}
        />
      </div>

      {isPublic && (
        <div className="space-y-sm">
          <p className="text-sm text-foreground-heading">Bitte bestätige:</p>
          <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setPublicOwnership('owner')}
              className={cn(
                'flex flex-col gap-xs rounded-lg border p-md text-left transition-colors',
                publicOwnership === 'owner'
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20'
                  : 'border-grey-200 hover:border-primary-300 dark:border-grey-700 dark:hover:border-primary-600'
              )}
            >
              <span className="text-sm font-medium text-foreground">Ich besitze die Daten</span>
              <span className="text-xs text-grey-500">
                … oder habe die Rechte zur Veröffentlichung
              </span>
            </button>
            <button
              type="button"
              onClick={() => setPublicOwnership('public_data')}
              className={cn(
                'flex flex-col gap-xs rounded-lg border p-md text-left transition-colors',
                publicOwnership === 'public_data'
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20'
                  : 'border-grey-200 hover:border-primary-300 dark:border-grey-700 dark:hover:border-primary-600'
              )}
            >
              <span className="text-sm font-medium text-foreground">
                Daten sind öffentlich verfügbar
              </span>
              <span className="text-xs text-grey-500">
                z.B. offizielle Dokumente, Pressemitteilungen
              </span>
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-sm">
        <Button type="button" variant="ghost" onClick={handleBack}>
          ← Zurück
        </Button>
        <Button type="button" onClick={handleNext} disabled={!canAdvanceFromVisibility}>
          Weiter →
        </Button>
      </div>
    </div>
  );
}
