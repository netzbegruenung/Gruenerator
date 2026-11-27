import { describe, expect, it, vi } from 'vitest';

import { computeTurnFacts, type TurnFactsDeps } from './notebookTurnFacts.js';

const NB = '5a438806-4e76-43c4-bf1e-1751708d123b';

const source = (sourceId: string, title: string, text: string) => ({
  sourceId,
  title,
  text,
  chunkMap: [],
});

function deps(overrides: Partial<TurnFactsDeps> = {}): TurnFactsDeps {
  return {
    loadTexts: vi.fn(async () => ({
      sources: [
        source('a', 'WP-05.pdf', 'Die Polizei hilft. Polizei, Polizei und Polizeiarbeit.'),
        source('b', 'WP-01.pdf', 'Hier steht nichts davon.'),
      ],
      exhaustive: true,
      incompleteReason: null,
    })),
    resolveSource: vi.fn(async () => ({
      ok: true as const,
      ownerUserId: 'owner',
      collectionName: 'Eval',
      title: 'Satzung.pdf',
    })),
    readText: vi.fn(
      async () => '## Seite 1\n\nPräambel\n\n## Seite 2\n\n§5 Jugend\n\n## Seite 3\n\n§6 Organe'
    ),
    ...overrides,
  };
}

const base = { collectionIds: [NB], userId: 'u', documentIds: null };
const needs = (over: object) => ({
  count: false,
  page: null,
  other: false,
  confidence: 1,
  ...over,
});

describe('computeTurnFacts', () => {
  it('counts each term across all sources', async () => {
    const r = await computeTurnFacts(
      { ...base, needs: needs({ count: true }), terms: ['Polizei'] },
      deps()
    );
    expect(r.counted).toBe(true);
    expect(r.block).toContain('Wörtliche Zählung (vollständig über alle 2 Quellen)');
    expect(r.block).toContain('„Polizei": 3 Treffer in 1 Quelle');
    expect(r.block).toContain('- WP-05.pdf: 3×');
  });

  it('marks an incomplete scan', async () => {
    const d = deps({
      loadTexts: vi.fn(async () => ({
        sources: [source('a', 'WP-05.pdf', 'Polizei')],
        exhaustive: false,
        incompleteReason: 'Notebook zu groß',
      })),
    });
    const r = await computeTurnFacts(
      { ...base, needs: needs({ count: true }), terms: ['Polizei'] },
      d
    );
    expect(r.block).toContain('nicht alle Quellen gelesen — keine Gesamtzahl nennen');
  });

  it('says when nothing was counted', async () => {
    const r = await computeTurnFacts({ ...base, needs: needs({ count: true }), terms: [] }, deps());
    expect(r.block).toContain('Es wurde nicht gezählt: kein Suchbegriff erkannt.');
    expect(r.counted).toBe(false);
  });

  it('keeps counts inside the selected documents', async () => {
    const r = await computeTurnFacts(
      { ...base, documentIds: ['b'], needs: needs({ count: true }), terms: ['Polizei'] },
      deps()
    );
    expect(r.block).toContain('vollständig über alle 1 Quellen');
    expect(r.block).toContain('„Polizei": in keiner Quelle');
  });

  it('reads the chosen page', async () => {
    const r = await computeTurnFacts(
      { ...base, needs: needs({ page: { sourceId: 's', page: 2 } }), terms: [] },
      deps()
    );
    expect(r.pageRead).toBe(true);
    expect(r.block).toContain('Text von Seite 2 aus „Satzung.pdf" (wörtlich):');
    expect(r.block).toContain('§5 Jugend');
    expect(r.block).not.toContain('§6 Organe');
  });

  it('says when the page is not marked', async () => {
    const r = await computeTurnFacts(
      { ...base, needs: needs({ page: { sourceId: 's', page: 9 } }), terms: [] },
      deps()
    );
    expect(r.pageRead).toBe(false);
    expect(r.block).toContain(
      'Seite 9 von „Satzung.pdf" ist im gespeicherten Text nicht zu finden.'
    );
  });

  it('costs only the facts on failure', async () => {
    const d = deps({
      loadTexts: vi.fn(async () => {
        throw new Error('qdrant down');
      }),
    });
    const r = await computeTurnFacts(
      { ...base, needs: needs({ count: true }), terms: ['Polizei'] },
      d
    );
    expect(r).toEqual({ block: '', counted: false, pageRead: false });
  });

  it('does nothing for system notebooks', async () => {
    const d = deps();
    const r = await computeTurnFacts(
      { ...base, collectionIds: ['berlin-system'], needs: needs({ count: true }), terms: ['x'] },
      d
    );
    expect(d.loadTexts).not.toHaveBeenCalled();
    expect(r.block).toBe('');
  });
});
