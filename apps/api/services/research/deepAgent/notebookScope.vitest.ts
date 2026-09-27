import { describe, expect, it } from 'vitest';

/**
 * The scope is the whole access story of this feature: what it does not put in
 * is what the agent cannot reach. So the cases worth having are the ones about
 * absence — no corpora, no personal documents, nothing at all.
 */

import { buildNotebookScope } from './notebookScope.js';

describe('buildNotebookScope', () => {
  it('bietet deutsche Korpora an, aber nicht die österreichischen', () => {
    const scope = buildNotebookScope({}, 'de-DE', 'user-1');

    const ids = scope?.corpora.map((c) => c.id) ?? [];
    expect(ids).toContain('gruenerator-notebook');
    expect(ids).not.toContain('oesterreich-notebook');
  });

  it('bietet österreichischen Nutzerinnen das Österreich-Notebook an', () => {
    const scope = buildNotebookScope({}, 'de-AT', 'user-1');

    expect(scope?.corpora.map((c) => c.id)).toContain('oesterreich-notebook');
  });

  it('gibt jedem Korpus seine Sammlungsschlüssel mit', () => {
    const scope = buildNotebookScope({}, 'de-DE', 'user-1');

    const berlin = scope?.corpora.find((c) => c.id === 'berlin-notebook');
    expect(berlin?.collections).toEqual(['berlin']);
    expect(berlin?.title).toBe('Berlin');
  });

  it('vereinigt Erwähnung und dauerhafte Auswahl, ohne zu doppeln', () => {
    const scope = buildNotebookScope(
      {
        notebookCollectionIds: ['hamburg'],
        defaultNotebookCollectionIds: ['hamburg', 'sachsen'],
        notebookDocumentIds: ['d1'],
        defaultNotebookDocumentIds: ['d1', 'd2'],
      },
      'de-DE',
      'user-1'
    );

    expect(scope?.mentionedCollections).toEqual(['hamburg', 'sachsen']);
    expect(scope?.documentIds).toEqual(['d1', 'd2']);
  });

  it('reicht die userId für die Dokumentsuche durch', () => {
    expect(buildNotebookScope({}, 'de-DE', 'user-42')?.userId).toBe('user-42');
  });
});
