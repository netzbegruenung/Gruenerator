/**
 * Die Quellenliste eines eigenen Notebooks für den Prompt des Chatmodus.
 *
 * Ohne sie kennt die Antwort nur die Auszüge, die die Suche gerade liefert,
 * und rät, was über den Bestand im Ganzen gefragt ist: im Eval vom 27.11.2026
 * „27 Seiten" statt 28 und eine Sortierung mit erfundenen Seitenzahlen
 * (`gruenerator-intern/evals/notebook-docq-2026-11-27.md`, d02/d03). Die Zeilen
 * tragen dieselben Angaben wie `notebook_quellen list` (`rowDetail`).
 *
 * Nur eigene Notebooks: System-Notebooks haben tausende Quellen. Ein Fehler
 * kostet nur die Liste, nie die Antwort.
 */
import { isUserNotebookId } from '../../../config/notebookCollectionMap.js';
import { createLogger } from '../../../utils/logger.js';
import { sourcesForPrompt } from '../agents/notebookSourceTools.js';

const log = createLogger('NotebookInventory');

/** So viele Quellen je Notebook stehen im Prompt; die Gesamtzahl steht immer dabei. */
export const INVENTORY_PROMPT_LIMIT = 30;

export interface InventoryItem {
  ref: string;
  title: string;
  /** Art, Dokumentdatum, Upload, Seiten, Wörter — leer, wenn nichts bekannt ist. */
  detail: string;
  pages: number | null;
}

export interface InventoryList {
  notebookId: string;
  total: number;
  items: readonly InventoryItem[];
}

type SourcesFn = (
  collectionId: string,
  userId: string,
  limit: number
) => Promise<{ total: number; items: InventoryItem[] } | null>;

export async function loadInventory(
  collectionIds: readonly string[],
  userId: string,
  sources: SourcesFn = sourcesForPrompt
): Promise<InventoryList[]> {
  const own = collectionIds.filter((id) => isUserNotebookId(id));
  const lists = await Promise.all(
    own.map(async (notebookId): Promise<InventoryList | null> => {
      try {
        const list = await sources(notebookId, userId, INVENTORY_PROMPT_LIMIT);
        return list && list.items.length > 0
          ? { notebookId, total: list.total, items: list.items }
          : null;
      } catch (err) {
        log.warn(`[NotebookInventory] source list for ${notebookId} failed`, err);
        return null;
      }
    })
  );
  return lists.filter((l): l is InventoryList => l !== null);
}

export function renderSourceInventory(lists: readonly InventoryList[]): string {
  if (lists.length === 0) return '';
  const blocks = lists.map((list) => {
    const head =
      list.total > list.items.length
        ? `${list.total} Quellen, hier die ersten ${list.items.length} nach Name`
        : `${list.total} Quellen, vollständig`;
    const rows = list.items
      .map((item) => `- ${item.title}${item.detail ? ` · ${item.detail}` : ''}`)
      .join('\n');
    return `Quellenliste des Notebooks (${head}):\n${rows}\n`;
  });
  return `${blocks.join('\n')}\nFragen nach Anzahl, Seitenzahl, Datum oder Reihenfolge der Quellen beantwortest du aus dieser Liste, nicht aus den Auszügen.`;
}
