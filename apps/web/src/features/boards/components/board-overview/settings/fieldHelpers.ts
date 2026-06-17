import { FIELD_IDS } from '../../../types';

import type { Field } from '../../../types';
import type { FieldType } from '@gruenerator/contracts';

// Field types offered when adding a custom field (no checklist — that's system-only).
export const ADDABLE_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Zahl' },
  { value: 'singleSelect', label: 'Auswahl' },
  { value: 'multiSelect', label: 'Mehrfachauswahl' },
  { value: 'date', label: 'Datum' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'url', label: 'Link' },
];

export const TYPE_LABEL: Partial<Record<FieldType, string>> = Object.fromEntries(
  ADDABLE_TYPES.map((t) => [t.value, t.label])
);

// Fields excluded from the manage-list + CSV export (internal/relational cells).
export const HIDDEN_FIELD_IDS = new Set<string>([
  FIELD_IDS.COMMENTS,
  FIELD_IDS.CHECKLIST,
  FIELD_IDS.LINKED_DOCS,
]);

export function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 24) || 'feld'
  );
}

export function rand(): string {
  return Math.random().toString(36).slice(2, 7);
}

export function isSystemField(field: Field): boolean {
  return field.typeOptions.isSystem === true;
}
