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
  return typeof o.id === 'string' && typeof o.name === 'string';
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
    if (typeof a.agentId === 'string' && a.agentId) return [];
    return typeof a.id === 'string' && a.id ? [a.id] : [];
  });
}
