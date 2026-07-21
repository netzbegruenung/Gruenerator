import { type CellValue } from '@gruenerator/contracts';

/**
 * Well-known board field ids + serialized-cell parsers, ported verbatim from the
 * web feature (apps/web/src/features/boards/types.ts). Assignee/checklist cells
 * are JSON-encoded strings with legacy shapes — every read must go through these
 * parsers, never JSON.parse inline. Read-only: no serialize helpers needed.
 */
export const FIELD_IDS = {
  TITLE: 'field-title',
  STATUS: 'field-status',
  DESCRIPTION: 'field-description',
  DUE_DATE: 'field-due-date',
  LABELS: 'field-labels',
  ASSIGNEE: 'field-assignee',
  LINKED_DOCS: 'field-linked-docs',
  COMMENTS: 'field-comments',
  CHECKLIST: 'field-checklist',
  RECURRENCE: 'field-recurrence',
} as const;

export interface CardAssignee {
  id: string;
  name: string;
  avatarRobotId: number;
  agentId?: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface ChecklistGroup {
  id: string;
  title: string;
  items: ChecklistItem[];
}

/** Lenient assignee-cell parser: handles empty / bare-name / legacy object / array. */
export function parseAssignees(raw: CellValue | undefined): CardAssignee[] {
  if (raw == null || raw === '') return [];
  if (typeof raw !== 'string') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [{ id: '', name: raw, avatarRobotId: 1 }];
  }
  if (Array.isArray(parsed)) {
    return parsed.filter((a): a is CardAssignee => !!a && typeof a === 'object' && 'name' in a);
  }
  if (parsed && typeof parsed === 'object' && 'name' in parsed) {
    return [parsed as CardAssignee];
  }
  return [];
}

/** Parse the checklist cell (JSON string) into groups; tolerant of malformed data. */
export function parseChecklists(raw: CellValue | undefined): ChecklistGroup[] {
  if (raw == null || raw === '' || typeof raw !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (g): g is ChecklistGroup => !!g && typeof g === 'object' && 'items' in g && 'id' in g
    );
  } catch {
    return [];
  }
}

/** Flatten checklist progress to { done, total } across all groups on a card. */
export function checklistProgress(groups: ChecklistGroup[]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const g of groups) {
    for (const it of g.items) {
      total++;
      if (it.done) done++;
    }
  }
  return { done, total };
}
