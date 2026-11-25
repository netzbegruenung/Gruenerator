import { type SkillCategoryValue } from '@gruenerator/contracts';
import { SKILL_CATEGORY_LABELS, SKILL_CATEGORY_ORDER } from '@gruenerator/shared/agents';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { PiTag } from 'react-icons/pi';

const NONE = '';

interface RecipeCategoryChipProps {
  value: SkillCategoryValue | null;
  onChange: (value: SkillCategoryValue | null) => void;
}

/**
 * Kategorie als Eigenschafts-Chip in der Fußleiste: zeigt den Wert und öffnet
 * die Auswahl erst auf Klick — ein Feld, das fast nie jemand ändert, braucht
 * keinen eigenen Platz im Formular.
 */
export function RecipeCategoryChip({ value, onChange }: RecipeCategoryChipProps) {
  const label = value ? SKILL_CATEGORY_LABELS[value] : 'Keine Kategorie';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Kategorie: ${label}`}
        className="inline-flex max-w-64 items-center gap-xs rounded-sm border border-grey-200 px-sm py-xxs text-sm text-foreground hover:bg-hover-alt dark:border-grey-700"
      >
        <PiTag aria-hidden className="size-3.5 shrink-0 text-foreground-muted" />
        <span className="truncate">{label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top">
        <DropdownMenuRadioGroup
          value={value ?? NONE}
          onValueChange={(v) => onChange(v === NONE ? null : (v as SkillCategoryValue))}
        >
          <DropdownMenuRadioItem value={NONE}>Keine Kategorie</DropdownMenuRadioItem>
          {SKILL_CATEGORY_ORDER.map((c) => (
            <DropdownMenuRadioItem key={c} value={c}>
              {SKILL_CATEGORY_LABELS[c]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
