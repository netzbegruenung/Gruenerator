/**
 * Der Sweep löscht Notizbuch-Zugehörigkeiten. Der teure Fehler wäre nicht, zu
 * wenig aufzuräumen, sondern zu viel: hält er einen Postgres-Ausfall für „diese
 * Dokumente gibt es nicht mehr", leert er jedes Notizbuch der Installation.
 * Diese Tests prüfen deshalb vor allem, wann er die Finger stillhält. Sie
 * geben `apply` ausdrücklich mit: ohne das Flag löscht der Sweep gar nichts,
 * er berichtet nur — das prüft der letzte Block.
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

    const { removed } = await sweepOrphanedNotebookLinks(true);

    expect(removeDocumentsFromAllCollections).toHaveBeenCalledWith(['tot']);
    expect(removed).toBe(1);
  });

  it('fasst ein Dokument, das in mehreren Notizbüchern hängt, als eines an', async () => {
    onePageOfLinks(['tot', 'tot', 'tot']);
    postgresKnows([]);

    const { removed } = await sweepOrphanedNotebookLinks(true);

    expect(removeDocumentsFromAllCollections).toHaveBeenCalledWith(['tot']);
    expect(removed).toBe(1);
  });

  it('rührt nichts an, wenn jedes Dokument noch existiert', async () => {
    onePageOfLinks(['a', 'b']);
    postgresKnows(['a', 'b']);

    await sweepOrphanedNotebookLinks(true);

    expect(removeDocumentsFromAllCollections).not.toHaveBeenCalled();
  });
});

describe('Zurückhaltung im Fehlerfall', () => {
  it('überspringt eine Seite, deren Postgres-Abgleich scheitert, statt sie für verwaist zu halten', async () => {
    onePageOfLinks(['a', 'b']);
    pgQuery.mockRejectedValue(new Error('connection refused'));

    const { removed } = await sweepOrphanedNotebookLinks(true);

    expect(removeDocumentsFromAllCollections).not.toHaveBeenCalled();
    expect(removed).toBe(0);
  });

  it('läuft nach einer gescheiterten Seite weiter, statt aufzugeben', async () => {
    listDocumentLinksPage
      .mockResolvedValueOnce({ documentIds: ['a'], last: 'p1' })
      .mockResolvedValueOnce({ documentIds: ['tot'], last: 'p2' })
      .mockResolvedValue({ documentIds: [], last: null });
    pgQuery.mockRejectedValueOnce(new Error('connection refused')).mockResolvedValue([]);

    const { removed } = await sweepOrphanedNotebookLinks(true);

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

    await sweepOrphanedNotebookLinks(true);

    expect(listDocumentLinksPage.mock.calls[0]?.[1]).toBeNull();
    expect(listDocumentLinksPage.mock.calls[1]?.[1]).toBe('p1');
    expect(listDocumentLinksPage.mock.calls[2]?.[1]).toBe('p2');
  });
});

describe('Wenn die Antwort nicht zur Qdrant passt', () => {
  /** Der Vorfall vom 27.08.2026, auf Testgröße gebracht. */
  it('bricht ab, statt eine Seite zu leeren, die Postgres fast gar nicht kennt', async () => {
    const ids = Array.from({ length: 500 }, (_, i) => `doc-${i}`);
    onePageOfLinks(ids);
    postgresKnows(ids.slice(0, 3));

    const { removed } = await sweepOrphanedNotebookLinks(true);

    expect(removeDocumentsFromAllCollections).not.toHaveBeenCalled();
    expect(removed).toBe(0);
  });

  it('prüft das Verhältnis erst ab genügend Stichproben', async () => {
    onePageOfLinks(['tot-1', 'tot-2']);
    postgresKnows([]);

    const { removed } = await sweepOrphanedNotebookLinks(true);

    expect(removeDocumentsFromAllCollections).toHaveBeenCalledWith(['tot-1', 'tot-2']);
    expect(removed).toBe(2);
  });

  it('räumt weiter auf, solange die Mehrheit der Dokumente noch da ist', async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `doc-${i}`);
    onePageOfLinks(ids);
    postgresKnows(ids.slice(0, 95));

    const { removed } = await sweepOrphanedNotebookLinks(true);

    expect(removed).toBe(5);
  });
});

describe('Obergrenze pro Lauf', () => {
  it('entfernt nichts mehr, sobald ein Lauf mehr als die Obergrenze löschen wollte', async () => {
    const ids = Array.from({ length: 300 }, (_, i) => `doc-${i}`);
    onePageOfLinks(ids);
    postgresKnows(ids.slice(0, 180));

    const { removed } = await sweepOrphanedNotebookLinks(true);

    expect(removeDocumentsFromAllCollections).not.toHaveBeenCalled();
    expect(removed).toBe(0);
  });
});

describe('Probelauf ist der Standard', () => {
  it('löscht ohne apply nichts, zählt die Verwaisten aber vollständig', async () => {
    onePageOfLinks(['lebt', 'tot-1', 'tot-2']);
    postgresKnows(['lebt']);

    const report = await sweepOrphanedNotebookLinks(false);

    expect(removeDocumentsFromAllCollections).not.toHaveBeenCalled();
    expect(report.removed).toBe(0);
    expect(report.orphans).toBe(2);
    expect(report.scanned).toBe(3);
    expect(report.known).toBe(1);
  });

  it('zählt im Probelauf weiter, auch wenn ein Wächter angeschlagen hat', async () => {
    const ids = Array.from({ length: 500 }, (_, i) => `doc-${i}`);
    listDocumentLinksPage
      .mockResolvedValueOnce({ documentIds: ids, last: 'p-1' })
      .mockResolvedValueOnce({ documentIds: ['spaeter'], last: 'p-2' })
      .mockResolvedValue({ documentIds: [], last: null });
    pgQuery.mockResolvedValue([]);

    const report = await sweepOrphanedNotebookLinks(false);

    expect(report.blocked).toMatch(/kennt nur 0 von 500/);
    expect(report.scanned).toBe(501);
    expect(removeDocumentsFromAllCollections).not.toHaveBeenCalled();
  });
});

describe('Die Obergrenze zählt über Seiten hinweg', () => {
  /**
   * Zwei Seiten mit je 60 Verwaisten: einzeln unter der Grenze, zusammen darüber.
   * 140 von 200 bekannt sind 70 % — gesund genug, dass der Ratio-Wächter nicht
   * dazwischenfunkt und wirklich die Obergrenze geprüft wird.
   */
  function twoPagesOfSixtyOrphans() {
    const page = (p: string) => Array.from({ length: 200 }, (_, i) => `${p}-${i}`);
    listDocumentLinksPage
      .mockResolvedValueOnce({ documentIds: page('a'), last: 'p-1' })
      .mockResolvedValueOnce({ documentIds: page('b'), last: 'p-2' })
      .mockResolvedValue({ documentIds: [], last: null });
    pgQuery.mockImplementation((_sql: unknown, params: unknown) => {
      const ids = (params as string[][])[0];
      return Promise.resolve(ids.slice(0, 140).map((id) => ({ id })));
    });
  }

  it('meldet die Grenze auch im Probelauf, obwohl dort nie entfernt wird', async () => {
    twoPagesOfSixtyOrphans();

    const report = await sweepOrphanedNotebookLinks(false);

    expect(report.removed).toBe(0);
    expect(report.orphans).toBe(120);
    expect(report.blocked).toMatch(/mehr als 100/);
  });

  it('sagt damit dasselbe voraus, was ein scharfer Lauf tut', async () => {
    twoPagesOfSixtyOrphans();

    const scharf = await sweepOrphanedNotebookLinks(true);

    expect(scharf.blocked).toMatch(/mehr als 100/);
    expect(scharf.removed).toBe(60);
  });
});
