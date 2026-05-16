import { Badge, Button, Input } from '@gruenerator/ui';
import { HiPlus, HiX } from 'react-icons/hi';

import type { NotebookEditorStateBundle } from './useNotebookEditorState';

interface LabelsFieldProps {
  state: NotebookEditorStateBundle;
}

export default function LabelsField({ state }: LabelsFieldProps) {
  const {
    labels,
    newLabel,
    setNewLabel,
    addingLabel,
    setAddingLabel,
    handleAddLabel,
    handleRemoveLabel,
    loading,
  } = state;

  return (
    <section className="flex flex-wrap items-center gap-xs">
      {labels.map((label) => (
        <Badge
          key={label}
          variant="secondary"
          className="gap-1 border-transparent bg-secondary-600 text-xs text-white"
        >
          {label}
          <button
            type="button"
            className="ml-0.5 inline-flex items-center hover:text-grey-200"
            onClick={() => handleRemoveLabel(label)}
            aria-label={`Label "${label}" entfernen`}
          >
            <HiX size={11} />
          </button>
        </Badge>
      ))}
      {addingLabel ? (
        <div className="flex items-center gap-xs">
          <Input
            type="text"
            value={newLabel}
            autoFocus
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddLabel();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setNewLabel('');
                setAddingLabel(false);
              }
            }}
            onBlur={() => {
              if (!newLabel.trim()) setAddingLabel(false);
            }}
            placeholder="Label…"
            maxLength={30}
            disabled={loading || labels.length >= 10}
            className="h-7 w-32 text-xs"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={handleAddLabel}
            disabled={loading || !newLabel.trim() || labels.length >= 10}
            aria-label="Label hinzufügen"
          >
            <HiPlus size={12} />
          </Button>
        </div>
      ) : (
        labels.length < 10 && (
          <button
            type="button"
            onClick={() => setAddingLabel(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-grey-300 px-2 py-[2px] text-xs text-grey-500 transition-colors hover:border-primary-500 hover:text-primary-600 dark:border-grey-600"
          >
            <HiPlus size={10} />
            {labels.length === 0 ? 'Label hinzufügen' : 'Weiteres Label'}
          </button>
        )
      )}
    </section>
  );
}
