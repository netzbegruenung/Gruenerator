/**
 * Die `chat-notebook`-Fälle tragen ZWEI Angaben derselben Sache: `notebookIds`
 * (was der Arm auflöst und durchsucht) und `collection` (worunter die
 * Metrik-Tabelle den Fall verbucht). Laufen sie auseinander, meldet der Lauf
 * keinen Fehler — er meldet einen `miss`, und der sieht aus wie ein
 * Retrieval-Befund statt wie ein Tippfehler.
 *
 * Deshalb steht die Prüfung hier und nicht im Runner: sie kostet Millisekunden
 * statt eines Laufs gegen den lebenden Index.
 */
import { describe, expect, it } from 'vitest';

import { COLLECTION_MAP } from '../../config/collectionMap.js';
import { NOTEBOOK_COLLECTION_MAP } from '../../config/notebookCollectionMap.js';

import { RETRIEVAL_CASES } from './cases.js';

const chatCases = RETRIEVAL_CASES.filter((c) => c.kind === 'chat-notebook');

describe('chat-notebook Fälle', () => {
  it('gibt es überhaupt — zehn Stück', () => {
    expect(chatCases).toHaveLength(10);
  });

  it('trägt jeder Fall genau eine `chatNotebook`-Beschreibung mit Notebook-IDs', () => {
    for (const c of chatCases) {
      expect(c.chatNotebook, c.id).toBeDefined();
      expect(c.chatNotebook!.notebookIds.length, c.id).toBeGreaterThan(0);
    }
  });

  it('löst jede Notebook-ID auf eine bekannte Sammlung auf', () => {
    for (const c of chatCases) {
      for (const id of c.chatNotebook!.notebookIds) {
        const keys = NOTEBOOK_COLLECTION_MAP[id];
        expect(keys, `${c.id}: unbekanntes Notebook "${id}"`).toBeDefined();
        for (const key of keys) {
          expect(COLLECTION_MAP[key], `${c.id}: unbekannte Sammlung "${key}"`).toBeDefined();
        }
      }
    }
  });

  it('verbucht Ein-Notebook-Fälle unter der System-ID, die sie wirklich durchsuchen', () => {
    // Mehr-Notebook-Fälle heissen `multi` (wie in den `notebook`-Fällen auch),
    // weil eine Metrik-Zeile nicht zwei Sammlungen gleichzeitig sein kann.
    for (const c of chatCases) {
      const keys = c.chatNotebook!.notebookIds.flatMap((id) => NOTEBOOK_COLLECTION_MAP[id] ?? []);
      const systemIds = [...new Set(keys.map((k) => COLLECTION_MAP[k].systemId))];
      expect(c.collection, c.id).toBe(systemIds.length === 1 ? systemIds[0] : 'multi');
    }
  });

  it('gibt jedem Verlaufs-Fall echten Verlauf, der mit einem Nutzer-Turn beginnt', () => {
    const withHistory = chatCases.filter((c) => c.chatNotebook!.history != null);
    expect(withHistory).toHaveLength(2);
    for (const c of withHistory) {
      const history = c.chatNotebook!.history!;
      expect(history.length, c.id).toBeGreaterThanOrEqual(2);
      expect(history[0].role, c.id).toBe('user');
    }
  });
});
