import { type TranslationFormality } from '@gruenerator/contracts';
import { ToggleGroup, ToggleGroupItem } from '@gruenerator/ui';
import { useId } from 'react';

const OPTIONS: ReadonlyArray<{ value: TranslationFormality; label: string }> = [
  { value: 'default', label: 'Standard' },
  { value: 'more', label: 'Förmlich (Sie)' },
  { value: 'less', label: 'Vertraut (du)' },
];

interface FormalityToggleProps {
  value: TranslationFormality;
  onChange: (value: TranslationFormality) => void;
}

/** Only rendered when the target language supports DeepL's formality switch. */
export function FormalityToggle({ value, onChange }: FormalityToggleProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-xs">
      <span id={id} className="text-sm font-medium text-foreground">
        Anrede
      </span>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        aria-labelledby={id}
        value={value}
        onValueChange={(next) => {
          if (next) onChange(next as TranslationFormality);
        }}
      >
        {OPTIONS.map((o) => (
          <ToggleGroupItem key={o.value} value={o.value}>
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
