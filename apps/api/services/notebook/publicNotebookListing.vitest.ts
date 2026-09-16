/**
 * Die Audience-Regel der „Von der Basis"-Listung — der einzige Grund, warum
 * diese Auswahl geteilt und nicht kopiert wird.
 */
import { describe, expect, it, vi } from 'vitest';

import { listPublicNotebooksForViewer } from './publicNotebookListing.js';

import type { NotebookCollection } from '../../database/services/NotebookQdrantHelper.js';

function collection(over: Partial<NotebookCollection>): NotebookCollection {
  return {
    id: 'n1',
    user_id: 'user-1',
    name: 'Notebook',
    description: null,
    is_public: true,
    audience: 'de-DE',
    ...over,
  } as NotebookCollection;
}

function deps(rows: NotebookCollection[]) {
  return { helper: { getPublicNotebookCollections: vi.fn(async () => rows) } };
}

describe('listPublicNotebooksForViewer', () => {
  it('hides a German notebook from an Austrian viewer and vice versa', async () => {
    const rows = [
      collection({ id: 'de', audience: 'de-DE' }),
      collection({ id: 'at', audience: 'de-AT' }),
    ];

    expect((await listPublicNotebooksForViewer('de-AT', deps(rows))).map((c) => c.id)).toEqual([
      'at',
    ]);
    expect((await listPublicNotebooksForViewer('de-DE', deps(rows))).map((c) => c.id)).toEqual([
      'de',
    ]);
  });

  it('matches the audience exactly — an unset one is not a wildcard', async () => {
    // `audience` ist beim Schreiben gesetzt und wird beim Boot nachgetragen;
    // eine Zeile ohne Wert bleibt bewusst ungelistet, statt überall zu
    // erscheinen. Die Listung ist Entdeckung, und im Zweifel zeigt sie weniger.
    const rows = [collection({ id: 'ohne', audience: undefined as unknown as 'de-DE' })];
    expect(await listPublicNotebooksForViewer('de-DE', deps(rows))).toEqual([]);
  });
});
