import { type AssignableMember, type BoardOperation } from '@gruenerator/contracts';

import {
  FIELD_IDS,
  parseChecklists,
  serializeAssignees,
  type BoardView,
  type CardAssignee,
  type CellValue,
  type ChecklistGroup,
  type Field,
  type FieldType,
  type Row,
  type SelectOption,
  type ViewLayout,
} from './types';
import { COLUMN_COLORS, LABEL_COLORS, createDefaultRow } from './utils/boardDefaults';

/**
 * Live-board mutation surface the executor needs. Structurally matches the
 * subset of `useBoardState`'s return value we use, so the hook result can be
 * passed directly.
 */
export interface BoardMutations {
  fields: Field[];
  rows: Row[];
  views: BoardView[];
  addRow: (row: Row) => void;
  updateRow: (rowId: string, updates: Partial<Row>) => void;
  updateRowCell: (rowId: string, fieldId: string, value: CellValue) => void;
  deleteRow: (rowId: string) => void;
  duplicateRow: (rowId: string, createdBy: string) => string | null;
  addField: (field: Field) => void;
  updateField: (fieldId: string, updates: Partial<Field>) => void;
  addView: (view: BoardView) => void;
}

export interface BoardExecutorCtx {
  boardState: BoardMutations;
  currentUserId: string;
  assignableMembers: AssignableMember[];
  /** Adds a plain-text comment to a card (REST). */
  addComment: (taskId: string, text: string) => Promise<void>;
  /** Confirms a batch of deletions. Resolves true to proceed. */
  confirmDelete: (titles: string[]) => Promise<boolean>;
}

export interface ApplyResult {
  applied: number;
  skipped: string[];
}

function rand(): string {
  return Math.random().toString(36).slice(2, 7);
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 24) || 'x'
  );
}

const VIEW_NAMES: Record<ViewLayout, string> = {
  kanban: 'Kanban',
  table: 'Tabelle',
  list: 'Liste',
  calendar: 'Kalender',
  gantt: 'Gantt',
};

/**
 * Apply a batch of AI-planned board operations to the live Yjs board. Status,
 * assignee and label values arrive as human names and are resolved here against
 * the live board (auto-creating missing status columns / labels). Destructive
 * deletes are batched into a single confirm. Never throws on a single bad op —
 * unresolved items are reported in `skipped`.
 */
export async function applyBoardOperations(
  ops: BoardOperation[],
  ctx: BoardExecutorCtx
): Promise<ApplyResult> {
  const { boardState } = ctx;
  const skipped: string[] = [];
  let applied = 0;

  // Local working copies of select-option sets, seeded from the live board and
  // mutated as we go — so multiple ops in one batch that create/reference the
  // same column or label stay consistent (the React snapshot won't update
  // synchronously between ops within this run).
  const statusField = boardState.fields.find((f) => f.id === FIELD_IDS.STATUS);
  let statusOptions: SelectOption[] = [
    ...((statusField?.typeOptions.options as SelectOption[] | undefined) ?? []),
  ];

  const labelsField = boardState.fields.find((f) => f.id === FIELD_IDS.LABELS);
  let labelOptions: SelectOption[] = [
    ...((labelsField?.typeOptions.options as SelectOption[] | undefined) ?? []),
  ];

  const rowExists = (taskId: string): boolean => boardState.rows.some((r) => r.id === taskId);

  function resolveStatusId(nameOrId: string | null | undefined): string | null {
    if (!nameOrId) return null;
    if (statusOptions.some((o) => o.id === nameOrId)) return nameOrId;
    const lc = nameOrId.trim().toLowerCase();
    const byName = statusOptions.find((o) => o.name.trim().toLowerCase() === lc);
    if (byName) return byName.id;
    if (!statusField) return null;
    const id = `status-${slug(nameOrId)}-${rand()}`;
    const color =
      COLUMN_COLORS[(statusOptions.length % (COLUMN_COLORS.length - 1)) + 1] ?? '#8da4bf';
    statusOptions = [...statusOptions, { id, name: nameOrId.trim(), color }];
    boardState.updateField(FIELD_IDS.STATUS, {
      typeOptions: { ...statusField.typeOptions, options: statusOptions },
    });
    return id;
  }

  function resolveLabelIds(names: string[]): string[] {
    if (!labelsField) return [];
    const ids: string[] = [];
    let created = false;
    for (const name of names) {
      const lc = name.trim().toLowerCase();
      const existing = labelOptions.find(
        (o) => o.id === name || o.name.trim().toLowerCase() === lc
      );
      if (existing) {
        ids.push(existing.id);
        continue;
      }
      const id = `label-${slug(name)}-${rand()}`;
      const color = LABEL_COLORS[labelOptions.length % LABEL_COLORS.length] ?? '#7c9885';
      labelOptions = [...labelOptions, { id, name: name.trim(), color }];
      created = true;
      ids.push(id);
    }
    if (created) {
      boardState.updateField(FIELD_IDS.LABELS, {
        typeOptions: { ...labelsField.typeOptions, options: labelOptions },
      });
    }
    return ids;
  }

  function resolveOneAssignee(name: string): CardAssignee {
    const lc = name.trim().toLowerCase();
    const member = ctx.assignableMembers.find((m) => {
      const display = (m.display_name || m.first_name || '').trim().toLowerCase();
      return m.user_id === name || display === lc;
    });
    if (member) {
      return {
        id: member.user_id,
        name: member.display_name || member.first_name || name,
        avatarRobotId: member.avatar_robot_id,
      };
    }
    // Unresolved — store the raw name so it's at least visible, and report it.
    skipped.push(`Mitglied „${name}" nicht gefunden — als Text gespeichert`);
    return { id: '', name: name.trim(), avatarRobotId: 1 };
  }

  /** Single assignee → cell string (backward-compat; stores a one-element array). */
  function resolveAssigneeCell(name: string | null | undefined): string {
    if (!name) return '';
    return serializeAssignees([resolveOneAssignee(name)]);
  }

  /** Multiple assignees (names or ids) → cell string, de-duplicated by id+name. */
  function resolveAssigneesCell(names: string[]): string {
    const seen = new Set<string>();
    const out: CardAssignee[] = [];
    for (const n of names) {
      if (!n) continue;
      const a = resolveOneAssignee(n);
      const key = `${a.id}|${a.name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(a);
    }
    return serializeAssignees(out);
  }

  const fieldTypeFor = (t: FieldType): FieldType => t;

  // Collect deletions to confirm once at the end.
  const deletes: { taskId: string; title: string }[] = [];

  for (const op of ops) {
    try {
      switch (op.type) {
        case 'create_task': {
          const statusId = resolveStatusId(op.status) ?? statusOptions[0]?.id ?? 'status-todo';
          const row = createDefaultRow(statusId, ctx.currentUserId);
          row.cells[FIELD_IDS.TITLE] = op.title;
          if (op.description != null) row.cells[FIELD_IDS.DESCRIPTION] = op.description;
          if (op.dueDate != null) row.cells[FIELD_IDS.DUE_DATE] = op.dueDate;
          if (op.assignees && op.assignees.length > 0) {
            row.cells[FIELD_IDS.ASSIGNEE] = resolveAssigneesCell(op.assignees);
          } else if (op.assignee != null) {
            row.cells[FIELD_IDS.ASSIGNEE] = resolveAssigneeCell(op.assignee);
          }
          if (op.labels && op.labels.length > 0) {
            row.cells[FIELD_IDS.LABELS] = resolveLabelIds(op.labels);
          }
          boardState.addRow(row);
          applied++;
          break;
        }
        case 'update_task': {
          if (!rowExists(op.taskId)) {
            skipped.push(`Aufgabe ${op.taskId} nicht gefunden`);
            break;
          }
          if (op.title != null) boardState.updateRowCell(op.taskId, FIELD_IDS.TITLE, op.title);
          if (op.description != null)
            boardState.updateRowCell(op.taskId, FIELD_IDS.DESCRIPTION, op.description);
          if (op.dueDate !== undefined)
            boardState.updateRowCell(op.taskId, FIELD_IDS.DUE_DATE, op.dueDate ?? null);
          applied++;
          break;
        }
        case 'move_task': {
          if (!rowExists(op.taskId)) {
            skipped.push(`Aufgabe ${op.taskId} nicht gefunden`);
            break;
          }
          const statusId = resolveStatusId(op.status);
          if (!statusId) {
            skipped.push(`Spalte „${op.status}" konnte nicht aufgelöst werden`);
            break;
          }
          boardState.updateRowCell(op.taskId, FIELD_IDS.STATUS, statusId);
          applied++;
          break;
        }
        case 'set_assignee': {
          if (!rowExists(op.taskId)) {
            skipped.push(`Aufgabe ${op.taskId} nicht gefunden`);
            break;
          }
          boardState.updateRowCell(op.taskId, FIELD_IDS.ASSIGNEE, resolveAssigneeCell(op.assignee));
          applied++;
          break;
        }
        case 'set_assignees': {
          if (!rowExists(op.taskId)) {
            skipped.push(`Aufgabe ${op.taskId} nicht gefunden`);
            break;
          }
          boardState.updateRowCell(
            op.taskId,
            FIELD_IDS.ASSIGNEE,
            resolveAssigneesCell(op.assignees)
          );
          applied++;
          break;
        }
        case 'archive_task': {
          if (!rowExists(op.taskId)) {
            skipped.push(`Aufgabe ${op.taskId} nicht gefunden`);
            break;
          }
          boardState.updateRow(op.taskId, { archivedAt: new Date().toISOString() });
          applied++;
          break;
        }
        case 'restore_task': {
          if (!rowExists(op.taskId)) {
            skipped.push(`Aufgabe ${op.taskId} nicht gefunden`);
            break;
          }
          boardState.updateRow(op.taskId, { archivedAt: undefined });
          applied++;
          break;
        }
        case 'duplicate_task': {
          if (!rowExists(op.taskId)) {
            skipped.push(`Aufgabe ${op.taskId} nicht gefunden`);
            break;
          }
          const id = boardState.duplicateRow(op.taskId, ctx.currentUserId);
          if (id) applied++;
          else skipped.push(`Aufgabe ${op.taskId} konnte nicht dupliziert werden`);
          break;
        }
        case 'add_checklist_item': {
          if (!rowExists(op.taskId)) {
            skipped.push(`Aufgabe ${op.taskId} nicht gefunden`);
            break;
          }
          const row = boardState.rows.find((r) => r.id === op.taskId);
          const groups: ChecklistGroup[] = parseChecklists(row?.cells[FIELD_IDS.CHECKLIST]);
          const title = op.checklistTitle?.trim() || 'Checkliste';
          let group = groups.find((g) => g.title.trim().toLowerCase() === title.toLowerCase());
          if (!group) {
            group = { id: `cl-${slug(title)}-${rand()}`, title, items: [] };
            groups.push(group);
          }
          group.items.push({ id: `cli-${rand()}-${rand()}`, text: op.text, done: false });
          boardState.updateRowCell(op.taskId, FIELD_IDS.CHECKLIST, JSON.stringify(groups));
          applied++;
          break;
        }
        case 'set_labels': {
          if (!rowExists(op.taskId)) {
            skipped.push(`Aufgabe ${op.taskId} nicht gefunden`);
            break;
          }
          boardState.updateRowCell(op.taskId, FIELD_IDS.LABELS, resolveLabelIds(op.labels));
          applied++;
          break;
        }
        case 'set_due_date': {
          if (!rowExists(op.taskId)) {
            skipped.push(`Aufgabe ${op.taskId} nicht gefunden`);
            break;
          }
          boardState.updateRowCell(op.taskId, FIELD_IDS.DUE_DATE, op.dueDate ?? null);
          applied++;
          break;
        }
        case 'add_comment': {
          if (!rowExists(op.taskId)) {
            skipped.push(`Aufgabe ${op.taskId} nicht gefunden`);
            break;
          }
          await ctx.addComment(op.taskId, op.text);
          applied++;
          break;
        }
        case 'add_column': {
          // resolveStatusId creates the option when the name doesn't exist.
          const id = resolveStatusId(op.name);
          if (id) applied++;
          else skipped.push(`Spalte „${op.name}" konnte nicht angelegt werden`);
          break;
        }
        case 'rename_column': {
          if (!statusField) {
            skipped.push('Kein Status-Feld vorhanden');
            break;
          }
          const idx = statusOptions.findIndex(
            (o) =>
              o.id === op.columnId ||
              o.name.trim().toLowerCase() === op.columnId.trim().toLowerCase()
          );
          if (idx === -1) {
            skipped.push(`Spalte „${op.columnId}" nicht gefunden`);
            break;
          }
          statusOptions = statusOptions.map((o, i) => (i === idx ? { ...o, name: op.name } : o));
          boardState.updateField(FIELD_IDS.STATUS, {
            typeOptions: { ...statusField.typeOptions, options: statusOptions },
          });
          applied++;
          break;
        }
        case 'add_field': {
          const isSelect = op.fieldType === 'singleSelect' || op.fieldType === 'multiSelect';
          const options: SelectOption[] = isSelect
            ? (op.options ?? []).map((name, i) => ({
                id: `opt-${slug(name)}-${rand()}`,
                name,
                color: LABEL_COLORS[i % LABEL_COLORS.length] ?? '#7c9885',
              }))
            : [];
          const maxOrder = boardState.fields.reduce((m, f) => Math.max(m, f.order), 0);
          boardState.addField({
            id: `field-${slug(op.name)}-${rand()}`,
            name: op.name,
            type: fieldTypeFor(op.fieldType),
            typeOptions: isSelect ? { options } : {},
            order: maxOrder + 1,
          });
          applied++;
          break;
        }
        case 'add_view': {
          const id = `view-${op.layout}-${Date.now()}-${rand()}`;
          boardState.addView({
            id,
            name: op.name || VIEW_NAMES[op.layout],
            layout: op.layout,
            ...(op.layout === 'kanban' || op.layout === 'list'
              ? { groupByFieldId: FIELD_IDS.STATUS }
              : {}),
            ...(op.layout === 'calendar' || op.layout === 'gantt'
              ? { dateFieldId: FIELD_IDS.DUE_DATE }
              : {}),
            filters: [],
            sorts: [],
            fieldSettings: boardState.fields.map((f) => ({ fieldId: f.id, visible: true })),
          });
          applied++;
          break;
        }
        case 'delete_task': {
          if (!rowExists(op.taskId)) {
            skipped.push(`Aufgabe ${op.taskId} nicht gefunden`);
            break;
          }
          const title =
            (boardState.rows.find((r) => r.id === op.taskId)?.cells[FIELD_IDS.TITLE] as string) ||
            op.taskId;
          deletes.push({ taskId: op.taskId, title });
          break;
        }
      }
    } catch (err) {
      skipped.push(
        `Operation ${op.type} fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Destructive deletes: one confirm for the whole batch.
  if (deletes.length > 0) {
    const ok = await ctx.confirmDelete(deletes.map((d) => d.title));
    if (ok) {
      for (const d of deletes) {
        boardState.deleteRow(d.taskId);
        applied++;
      }
    } else {
      skipped.push(`${deletes.length} Löschung(en) abgebrochen`);
    }
  }

  return { applied, skipped };
}
