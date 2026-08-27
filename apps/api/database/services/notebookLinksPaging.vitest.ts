/**
 * Qdrant behandelt den Scroll-Offset inklusiv: die Zeile, die als `after`
 * hereinkommt, liefert es noch einmal mit. Genau diese eine Wiederholung muss
 * weg — und nur sie.
 *
 * Am 27.08.2026 hat ein Sweep, der beim Blättern loescht, die Offset-Zeile
 * vorher entfernt. Qdrant setzte dann bei der naechsten ID an, und der Schnitt
 * nach Position traf eine echte, ungeprüfte Zeile. Beobachtet: 584 Verknüpfungen,
 * Seite eins loeschte 500, Seite zwei meldete 83 von 84, eine überlebte.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const scrollDocuments = vi.fn();

vi.mock('./QdrantService/index.js', () => ({
  getQdrantInstance: () => ({
    init: async () => undefined,
    client: {},
    collections: { notebook_collection_documents: 'ncd' },
  }),
}));
vi.mock('./QdrantService/operations/index.js', () => ({
  QdrantOperations: class {
    scrollDocuments = (...args: unknown[]) => scrollDocuments(...args);
  },
}));

const { NotebookQdrantHelper } = await import('./NotebookQdrantHelper.js');

/** Qdrant-Antwort: Punkte mit fortlaufender ID. */
const rows = (ids: number[]) => ids.map((id) => ({ id, payload: { document_id: `doc-${id}` } }));

beforeEach(() => scrollDocuments.mockReset());

describe('Seitengrenze beim Blättern über die Verknüpfungen', () => {
  it('gibt die erste Seite vollständig zurück', async () => {
    scrollDocuments.mockResolvedValue(rows([1, 2, 3]));

    const page = await new NotebookQdrantHelper().listDocumentLinksPage(3);

    expect(page.documentIds).toEqual(['doc-1', 'doc-2', 'doc-3']);
    expect(page.last).toBe(3);
  });

  it('wirft die wiederholte Offset-Zeile weg, wenn Qdrant sie mitliefert', async () => {
    scrollDocuments.mockResolvedValue(rows([3, 4, 5]));

    const page = await new NotebookQdrantHelper().listDocumentLinksPage(2, 3);

    expect(page.documentIds).toEqual(['doc-4', 'doc-5']);
    expect(page.last).toBe(5);
  });

  it('behält alle Zeilen, wenn die Offset-Zeile inzwischen gelöscht wurde', async () => {
    // Der Fall aus der Produktion: Zeile 3 war die letzte der Vorseite und ist
    // beim Löschen mit ihr verschwunden, Qdrant beginnt deshalb bei 4.
    scrollDocuments.mockResolvedValue(rows([4, 5, 6]));

    const page = await new NotebookQdrantHelper().listDocumentLinksPage(2, 3);

    expect(page.documentIds).toEqual(['doc-4', 'doc-5', 'doc-6']);
    expect(page.last).toBe(6);
  });

  it('meldet eine leere Folgeseite als Ende, nicht als eine Zeile', async () => {
    scrollDocuments.mockResolvedValue(rows([9]));

    const page = await new NotebookQdrantHelper().listDocumentLinksPage(5, 9);

    expect(page.documentIds).toEqual([]);
    expect(page.last).toBeNull();
  });
});
