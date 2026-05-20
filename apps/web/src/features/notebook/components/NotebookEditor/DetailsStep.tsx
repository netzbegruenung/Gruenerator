import { Button, Input, Label } from '@gruenerator/ui';

import LabelsField from './LabelsField';
import type { NotebookEditorStateBundle } from './useNotebookEditorState';

interface DetailsStepProps {
  state: NotebookEditorStateBundle;
}

export default function DetailsStep({ state }: DetailsStepProps) {
  const { watchedName, watchedDesc, setValue, canAdvanceFromDetails, handleBack, handleNext } =
    state;

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-xs">
        <Label htmlFor="notebook-name">Name</Label>
        <Input
          id="notebook-name"
          maxLength={100}
          value={watchedName}
          onChange={(e) =>
            setValue('name', e.target.value, { shouldValidate: true, shouldDirty: true })
          }
          placeholder="Mein Notebook"
        />
      </div>
      <div className="flex flex-col gap-xs">
        <Label htmlFor="notebook-desc">
          Beschreibung <span className="text-grey-400">(optional)</span>
        </Label>
        <textarea
          id="notebook-desc"
          maxLength={500}
          rows={3}
          value={watchedDesc}
          onChange={(e) => setValue('description', e.target.value, { shouldDirty: true })}
          placeholder="Worum geht's in diesem Notebook?"
          className="w-full resize-none rounded-md border border-grey-200 bg-background px-sm py-xs text-sm text-foreground outline-none placeholder:text-grey-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-grey-700"
        />
      </div>
      <div className="flex flex-col gap-xs">
        <Label>
          Labels <span className="text-grey-400">(max. 10, optional)</span>
        </Label>
        <LabelsField state={state} />
      </div>
      <div className="flex justify-end gap-sm">
        <Button type="button" variant="ghost" onClick={handleBack}>
          ← Zurück
        </Button>
        <Button type="button" onClick={handleNext} disabled={!canAdvanceFromDetails}>
          Weiter →
        </Button>
      </div>
    </div>
  );
}
