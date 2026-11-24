/**
 * Board-Karten lesen, die Web-Board und Server gleich verstehen müssen:
 * welche Status-Spalte „Erledigt" ist und wem eine Karte zugewiesen ist.
 *
 * Reine Funktionen über strukturelle Typen, damit weder das Web an den
 * Server-Typen (`BoardService.FieldDef`) noch der Server an den Web-Typen hängt.
 * Das Web-Board (`features/boards/utils/taskDone.ts`) und das Tagesbriefing
 * (`apps/api/services/boards/myOpenCards.ts`) lesen beide von hier.
 */

/** Die Spalten-Id des Status-Felds (Web: `FIELD_IDS.STATUS`, Server: `FIELD_IDS.STATUS`). */
export const BOARD_STATUS_FIELD_ID = 'field-status';

export interface BoardStatusOption {
  id: string;
  name: string;
  isDone?: boolean | undefined;
}

interface BoardFieldLike {
  id: string;
  typeOptions?: unknown;
}

// Boards created before `isDone` existed: the default board, the templates and the
// chat-built boards (status-1/status-2 named "Erledigt").
const LEGACY_DONE_IDS = new Set(['status-done', 'status-erledigt']);
const LEGACY_DONE_NAMES = new Set(['erledigt', 'done', 'fertig', 'abgeschlossen']);

function isStatusOption(value: unknown): value is BoardStatusOption {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return typeof o['id'] === 'string' && typeof o['name'] === 'string';
}

/** Die Optionen des Status-Felds, oder `[]` ohne Status-Feld. */
export function boardStatusOptions(fields: readonly BoardFieldLike[]): BoardStatusOption[] {
  const field = fields.find((f) => f.id === BOARD_STATUS_FIELD_ID);
  const options = (field?.typeOptions as { options?: unknown } | undefined)?.options;
  return Array.isArray(options) ? options.filter(isStatusOption) : [];
}

/**
 * Die Id der Erledigt-Spalte: die ausdrücklich markierte (`isDone`), sonst eine
 * Alt-Spalte per Id oder Name — außer sie ist ausdrücklich als nicht erledigt
 * markiert (`isDone: false`).
 */
export function getBoardDoneStatusId(fields: readonly BoardFieldLike[]): string | null {
  const options = boardStatusOptions(fields);
  const explicit = options.find((o) => o.isDone === true);
  if (explicit) return explicit.id;
  const legacy = options.find(
    (o) =>
      o.isDone !== false &&
      (LEGACY_DONE_IDS.has(o.id) || LEGACY_DONE_NAMES.has(o.name.trim().toLowerCase()))
  );
  return legacy?.id ?? null;
}

/**
 * Die Personen-Ids aus der Zuständigkeitszelle. Liest jede Form, die die Zelle
 * je hatte (JSON-Array, einzelnes Objekt); ein nackter Anzeigename trägt keine
 * Id und zählt nicht. Agenten-Zuweisungen (`agentId`) sind keine Personen.
 */
export function boardAssigneeUserIds(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const a = item as Record<string, unknown>;
    const agentId = a['agentId'];
    if (typeof agentId === 'string' && agentId) return [];
    const id = a['id'];
    return typeof id === 'string' && id ? [id] : [];
  });
}

/**
 * Ein Eintrag der Zuständigkeitszelle in der Form, die das Web-Board schreibt
 * (`CardAssignee` in `apps/web/src/features/boards/types.ts`): Profil-Id, Name,
 * Avatar; bei Agenten zusätzlich `agentId`.
 */
export interface BoardAssignee {
  id: string;
  name: string;
  avatarRobotId: number;
  agentId?: string;
}

/**
 * Alle Einträge der Zuständigkeitszelle, auch die ohne Id. Ein nackter Name
 * (so schrieb der Chat bis 11/2026) wird zu `{ id: '' }`, damit ein Ändern ihn
 * nicht still verwirft.
 */
export function parseBoardAssignees(raw: unknown): BoardAssignee[] {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [{ id: '', name: raw.trim(), avatarRobotId: 1 }];
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items.flatMap((item): BoardAssignee[] => {
    if (!item || typeof item !== 'object') return [];
    const a = item as Record<string, unknown>;
    const name = typeof a['name'] === 'string' ? a['name'] : '';
    const id = typeof a['id'] === 'string' ? a['id'] : '';
    if (!name && !id) return [];
    const avatar = typeof a['avatarRobotId'] === 'number' ? a['avatarRobotId'] : 1;
    const agentId = typeof a['agentId'] === 'string' && a['agentId'] ? a['agentId'] : null;
    return [{ id, name, avatarRobotId: avatar, ...(agentId ? { agentId } : {}) }];
  });
}

/** Zellenwert wie im Web (`serializeAssignees`): JSON-Array, leer = `''`. */
export function serializeBoardAssignees(assignees: readonly BoardAssignee[]): string {
  return assignees.length ? JSON.stringify(assignees) : '';
}

export type BoardAssigneeChange =
  | { mode: 'add'; person: BoardAssignee }
  | { mode: 'replace'; person: BoardAssignee | null }
  | { mode: 'remove'; person: BoardAssignee };

/**
 * Die Zuständigen nach einer Änderung. `add` hängt an (eine Karte kann mehrere
 * Zuständige haben), `replace` ersetzt alle (`null` leert), `remove` nimmt die
 * Person heraus. Verglichen wird über die Id, bei Alt-Einträgen ohne Id über den Namen.
 */
export function applyBoardAssigneeChange(
  current: readonly BoardAssignee[],
  change: BoardAssigneeChange
): BoardAssignee[] {
  if (change.mode === 'replace') return change.person ? [change.person] : [];
  const target = change.person;
  const same = (a: BoardAssignee) =>
    target.id
      ? a.id === target.id
      : !a.id && a.name.trim().toLowerCase() === target.name.trim().toLowerCase();
  if (change.mode === 'remove') return current.filter((a) => !same(a));
  return current.some(same) ? [...current] : [...current, target];
}
