import { Badge, Button, Input } from '@gruenerator/ui';
import { useState } from 'react';
import { HiPlus, HiX } from 'react-icons/hi';

const MAX_LABELS = 10;

interface LabelsFieldProps {
  labels: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

export default function LabelsField({ labels, onChange, disabled = false }: LabelsFieldProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    const trimmed = draft.trim();
    setDraft('');
    if (!trimmed || labels.includes(trimmed) || labels.length >= MAX_LABELS) return;
    onChange([...labels, trimmed]);
  };

  return (
    <div className="flex flex-wrap items-center gap-xs">
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
            onClick={() => onChange(labels.filter((l) => l !== label))}
            disabled={disabled}
            aria-label={`Label "${label}" entfernen`}
          >
            <HiX size={11} />
          </button>
        </Badge>
      ))}
      {adding ? (
        <div className="flex items-center gap-xs">
          <Input
            type="text"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setDraft('');
                setAdding(false);
              }
            }}
            onBlur={() => {
              if (!draft.trim()) setAdding(false);
            }}
            placeholder="Label…"
            aria-label="Neues Label"
            maxLength={30}
            disabled={disabled}
            className="h-7 w-32 text-xs"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={commit}
            disabled={disabled || !draft.trim()}
            aria-label="Label hinzufügen"
          >
            <HiPlus size={12} />
          </Button>
        </div>
      ) : (
        labels.length < MAX_LABELS && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setAdding(true)}
            disabled={disabled}
            className="text-grey-500"
          >
            + Label
          </Button>
        )
      )}
    </div>
  );
}
