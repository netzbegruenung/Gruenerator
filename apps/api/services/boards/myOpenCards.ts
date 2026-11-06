/**
 * Die offenen Board-Karten, die einer Person zugewiesen sind — die „Aufgaben"
 * des Tagesbriefings.
 *
 * Offen heißt: nicht in der Erledigt-Spalte des Boards (`getBoardDoneStatusId`,
 * dieselbe Regel wie das Web-Board). Zugewiesen heißt: die Profil-Id steht in
 * der Zuständigkeitszelle — ein nackter Anzeigename ohne Id zählt nicht, weil
 * Namen nicht eindeutig sind.
 *
 * Das Chat-Werkzeug `boards_tasks.my_tasks` liest bewusst breiter (alles mit
 * Datum oder Zuweisung) und bleibt davon unberührt.
 */
import { boardAssigneeUserIds, getBoardDoneStatusId } from '@gruenerator/shared/utils';

import { createLogger } from '../../utils/logger.js';

import { FIELD_IDS, listUserBoards, loadBoardState, type BoardState } from './BoardService.js';

const log = createLogger('myOpenCards');

/** Höchstens so viele zuletzt bearbeitete Boards werden geöffnet (Yjs-Decode je Board). */
export const MY_OPEN_CARDS_MAX_BOARDS = 12;

export interface MyOpenCard {
  boardId: string;
  boardTitle: string;
  cardId: string;
  title: string;
  /** `YYYY-MM-DD` oder null. */
  dueDate: string | null;
}

/** `YYYY-MM-DD` aus einer Fälligkeitszelle, sonst null. */
function dueDay(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw.trim());
  return match ? match[1] : null;
}

/** Die offenen, dieser Person zugewiesenen Karten eines geladenen Boards. */
export function openCardsAssignedTo(board: BoardState, userId: string): MyOpenCard[] {
  if (board.boardType === 'whiteboard') return [];
  const doneId = getBoardDoneStatusId(board.fields);
  const cards: MyOpenCard[] = [];
  for (const row of board.rows) {
    const status = row.cells[FIELD_IDS.STATUS];
    if (doneId !== null && status === doneId) continue;
    if (!boardAssigneeUserIds(row.cells[FIELD_IDS.ASSIGNEE]).includes(userId)) continue;
    const title = row.cells[FIELD_IDS.TITLE];
    if (typeof title !== 'string' || !title.trim()) continue;
    cards.push({
      boardId: board.id,
      boardTitle: board.title,
      cardId: row.id,
      title: title.trim(),
      dueDate: dueDay(row.cells[FIELD_IDS.DUE_DATE]),
    });
  }
  return cards;
}

/** Fällige zuerst (frühestes Datum vorn), Karten ohne Datum ans Ende. */
export function sortByDue(cards: MyOpenCard[]): MyOpenCard[] {
  return [...cards].sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
}

/**
 * Alle offenen, zugewiesenen Karten über die zuletzt bearbeiteten Boards der
 * Person. Ein Board, das nicht lädt, fehlt — es bricht nicht das Ganze.
 */
export async function listMyOpenCards(userId: string): Promise<MyOpenCard[]> {
  const boards = await listUserBoards(userId, MY_OPEN_CARDS_MAX_BOARDS);
  const loaded = await Promise.all(
    boards.map((b) =>
      loadBoardState(b.id, userId).catch((error: unknown) => {
        log.warn(`Board ${b.id} not loadable for open cards: ${(error as Error).message}`);
        return null;
      })
    )
  );
  const cards = loaded.flatMap((board) => (board ? openCardsAssignedTo(board, userId) : []));
  return sortByDue(cards);
}
