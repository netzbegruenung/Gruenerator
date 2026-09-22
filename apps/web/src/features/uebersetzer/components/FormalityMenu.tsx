import { type TranslationFormality } from '@gruenerator/contracts';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { PiSlidersHorizontal } from 'react-icons/pi';

const OPTIONS: ReadonlyArray<{ value: TranslationFormality; label: string }> = [
  { value: 'default', label: 'Standard' },
  { value: 'more', label: 'Förmlich (Sie)' },
  { value: 'less', label: 'Vertraut (du)' },
];

interface FormalityMenuProps {
  value: TranslationFormality;
  onChange: (value: TranslationFormality) => void;
}

/**
 * Anrede (DeepL formality), tucked into a menu beside the target language —
 * it only applies to a handful of languages and would otherwise take a whole
 * row above the panes. Rendered only when the target supports it.
 */
export function FormalityMenu({ value, onChange }: FormalityMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 rounded-full"
          aria-label="Anrede"
          title="Anrede"
        >
          <PiSlidersHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Anrede</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as TranslationFormality)}
        >
          {OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
