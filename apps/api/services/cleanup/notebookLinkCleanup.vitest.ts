/**
 * Der Sweep löscht Notizbuch-Zugehörigkeiten. Der teure Fehler wäre nicht, zu
 * wenig aufzuräumen, sondern zu viel: hält er einen Postgres-Ausfall für „diese
 * Dokumente gibt es nicht mehr", leert er jedes Notizbuch der Installation.
 * Diese Tests prüfen deshalb vor allem, wann er die Finger stillhält.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const pgQuery = vi.fn();
const listDocumentLinksPage = vi.fn();
const removeDocumentsFromAllCollections = vi.fn();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: (...args: unknown[]) => pgQuery(...args) }),
}));
vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: class {
    listDocumentLinksPage = (...args: unknown[]) => listDocumentLinksPage(...args);
    removeDocumentsFromAllCollections = (...args: unknown[]) =>
      removeDocumentsFromAllCollections(...args);
  },
}));

const { sweepOrphanedNotebookLinks } = await import('./notebookLinkCleanupService.js');

/** Eine Seite Verknüpfungen, danach ist die Collection zu Ende. */
function onePageOfLinks(documentIds: string[]) {
  listDocumentLinksPage
    .mockResolvedValueOnce({ documentIds, last: 'p-last' })
    .mockResolvedValue({ documentIds: [], last: null });
}

/** Postgres kennt genau diese Dokumente noch. */
function postgresKnows(ids: string[]) {
  pgQuery.mockResolvedValue(ids.map((id) => ({ id })));
}

beforeEach(() => {
  pgQuery.mockReset();
  listDocumentLinksPage.mockReset();
  removeDocumentsFromAllCollections.mockReset();
  removeDocumentsFromAllCollections.mockResolvedValue(undefined);
});

describe('Verwaiste Verknüpfungen', () => {
  it('löst genau die Verknüpfungen, deren Dokument Postgres nicht mehr kennt', async () => {
    onePageOfLinks(['lebt', 'tot']);
    postgresKnows(['lebt']);

    const removed = await sweepOrphanedNotebookLinks();

    expect(removeDocumentsFromAllCollections).toHaveBeenCalledWith(['tot']);
    expect(removed).toBe(1);
  });

  it('fasst ein Dokument, das in mehreren Notizbüchern hängt, als eines an', async () => {
    onePageOfLinks(['tot', 'tot', 'tot']);
    postgresKnows([]);

    const removed = await sweepOrphanedNotebookLinks();

    expect(removeDocumentsFromAllCollections).toHaveBeenCalledWith(['tot']);
    expect(removed).toBe(1);
  });

  it('rührt nichts an, wenn jedes Dokument noch existiert', async () => {
    onePageOfLinks(['a', 'b']);
    postgresKnows(['a', 'b']);

    await sweepOrphanedNotebookLinks();

    expect(removeDocumentsFromAllCollections).not.toHaveBeenCalled();
  });
});

describe('Zurückhaltung im Fehlerfall', () => {
  it('überspringt eine Seite, deren Postgres-Abgleich scheitert, statt sie für verwaist zu halten', async () => {
    onePageOfLinks(['a', 'b']);
    pgQuery.mockRejectedValue(new Error('connection refused'));

    const removed = await sweepOrphanedNotebookLinks();

    expect(removeDocumentsFromAllCollections).not.toHaveBeenCalled();
    expect(removed).toBe(0);
  });

  it('läuft nach einer gescheiterten Seite weiter, statt aufzugeben', async () => {
    listDocumentLinksPage
      .mockResolvedValueOnce({ documentIds: ['a'], last: 'p1' })
      .mockResolvedValueOnce({ documentIds: ['tot'], last: 'p2' })
      .mockResolvedValue({ documentIds: [], last: null });
    pgQuery.mockRejectedValueOnce(new Error('connection refused')).mockResolvedValue([]);

    const removed = await sweepOrphanedNotebookLinks();

    expect(removeDocumentsFromAllCollections).toHaveBeenCalledWith(['tot']);
    expect(removed).toBe(1);
  });
});

describe('Blättern', () => {
  it('reicht die letzte Punkt-ID als Startpunkt der nächsten Seite weiter', async () => {
    listDocumentLinksPage
      .mockResolvedValueOnce({ documentIds: ['a'], last: 'p1' })
      .mockResolvedValueOnce({ documentIds: ['b'], last: 'p2' })
      .mockResolvedValue({ documentIds: [], last: null });
    postgresKnows(['a', 'b']);

    await sweepOrphanedNotebookLinks();

    expect(listDocumentLinksPage.mock.calls[0]?.[1]).toBeNull();
    expect(listDocumentLinksPage.mock.calls[1]?.[1]).toBe('p1');
    expect(listDocumentLinksPage.mock.calls[2]?.[1]).toBe('p2');
  });
});
