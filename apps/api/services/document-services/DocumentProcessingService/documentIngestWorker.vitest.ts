/**
 * Der Worker ist die Reparatur zweier Zustände, aus denen es vorher keinen
 * Rückweg gab: ein Upload, der nie an ein Notizbuch gehängt wurde (blieb ewig
 * 'uploaded'), und eine Verarbeitung, deren Prozess mitten im Lauf starb (blieb
 * ewig 'processing'). Beides hängt am Claim — deshalb prüfen diese Tests die
 * Auswahlbedingung selbst, nicht nur, dass irgendetwas verarbeitet wird.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const pgQuery = vi.fn();
const processUploadedDocument = vi.fn();
const reportBackgroundError = vi.fn();

vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: (...args: unknown[]) => pgQuery(...args) }),
}));
vi.mock('./fileProcessing.js', () => ({
  processUploadedDocument: (...args: unknown[]) => processUploadedDocument(...args),
}));
vi.mock('../DocumentSearchService/index.js', () => ({
  getQdrantDocumentService: () => ({}),
}));
vi.mock('../PostgresDocumentService/index.js', () => ({
  getPostgresDocumentService: () => ({}),
}));
vi.mock('../../../utils/reportBackgroundError.js', () => ({
  reportBackgroundError: (...args: unknown[]) => reportBackgroundError(...args),
}));

const { drainIngestQueue } = await import('./documentIngestWorker.js');

/** Trennt die Aufräum-Query von den Claim-Queries. */
const claimCalls = () =>
  pgQuery.mock.calls.filter(([sql]) => String(sql).includes('FOR UPDATE SKIP LOCKED'));
const giveUpCall = () =>
  pgQuery.mock.calls.find(([sql]) => String(sql).includes("SET status = 'failed'"));

/**
 * Antwortet auf die Aufräum-Query mit [] und liefert die übergebenen Dokumente
 * nacheinander auf die Claim-Query aus, danach [] (Queue leer).
 */
function queueContains(...docs: Array<{ id: string; user_id: string }>) {
  const pending = [...docs];
  pgQuery.mockImplementation((sql: string) => {
    if (String(sql).includes('FOR UPDATE SKIP LOCKED')) {
      const next = pending.shift();
      return Promise.resolve(next ? [next] : []);
    }
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  pgQuery.mockReset();
  processUploadedDocument.mockReset();
  reportBackgroundError.mockReset();
  processUploadedDocument.mockResolvedValue({ id: 'x', vectorCount: 3 });
});

describe('Claim-Auswahl', () => {
  it('nimmt frische Uploads und verwaiste processing-Zeilen im selben Zugriff', async () => {
    queueContains();
    await drainIngestQueue();

    const [sql] = claimCalls()[0];
    // Beide Zweige müssen in EINER Bedingung stehen: sonst bliebe je nach
    // Reihenfolge einer der beiden Zustände dauerhaft liegen.
    expect(sql).toContain("status = 'uploaded'");
    expect(sql).toContain("status = 'processing'");
    // Die Altersgrenze für den zweiten Zweig — die NULL-sichere Form prüft der
    // Test weiter unten.
    expect(sql).toMatch(/< NOW\(\) - \(\$1::text \|\| ' milliseconds'\)::interval/);
  });

  it('claimt unter FOR UPDATE SKIP LOCKED, damit mehrere Prozesse parallel laufen dürfen', async () => {
    queueContains();
    await drainIngestQueue();

    expect(claimCalls()[0][0]).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('zählt den Versuch beim Claim hoch und begrenzt ihn', async () => {
    queueContains();
    await drainIngestQueue();

    const [sql, params] = claimCalls()[0];
    expect(sql).toContain('processing_attempts');
    expect(sql).toContain('< $2');
    expect(params[1]).toBe(3);
  });

  it('schließt Zeilen ohne processing_started_at nicht aus', async () => {
    queueContains();
    await drainIngestQueue();

    // `processing_started_at` kam erst mit diesem Merkmal — jede Zeile, die
    // vorher schon in 'processing' feststeckte, hat dort NULL. Ein direkter
    // Vergleich (`processing_started_at < …`) ergibt in SQL NULL und damit
    // nicht-wahr: genau der Altbestand, den der Worker einsammeln soll, wäre
    // dauerhaft unsichtbar. GREATEST übergeht NULL und fällt auf updated_at
    // zurück.
    const [sql] = claimCalls()[0];
    expect(sql).toContain('GREATEST(processing_started_at, updated_at)');
    expect(sql).not.toMatch(/\bprocessing_started_at\s*</);
  });
});

describe('Abarbeitung', () => {
  it('verarbeitet die Warteschlange, bis sie leer ist', async () => {
    queueContains({ id: 'a', user_id: 'u1' }, { id: 'b', user_id: 'u2' });

    const processed = await drainIngestQueue();

    expect(processed).toBe(2);
    expect(processUploadedDocument).toHaveBeenCalledTimes(2);
    // Jedes Dokument mit SEINER Nutzer-ID — sonst greift die Ownership-Prüfung
    // im Pipeline-Schritt auf die falsche Person zu.
    expect(processUploadedDocument.mock.calls[0]).toEqual(expect.arrayContaining(['a', 'u1']));
    expect(processUploadedDocument.mock.calls[1]).toEqual(expect.arrayContaining(['b', 'u2']));
  });

  it('macht nach einem gescheiterten Dokument weiter', async () => {
    queueContains({ id: 'a', user_id: 'u1' }, { id: 'b', user_id: 'u1' });
    processUploadedDocument.mockRejectedValueOnce(new Error('OCR kaputt'));

    const processed = await drainIngestQueue();

    expect(processed).toBe(2);
    expect(reportBackgroundError).toHaveBeenCalledTimes(1);
  });

  it('läuft bei leerer Warteschlange ohne Verarbeitung durch', async () => {
    queueContains();

    expect(await drainIngestQueue()).toBe(0);
    expect(processUploadedDocument).not.toHaveBeenCalled();
  });
});

describe('Aufgeben nach zu vielen Versuchen', () => {
  it('kippt erschöpfte Dokumente auf failed mit lesbarem Grund', async () => {
    queueContains();
    await drainIngestQueue();

    const call = giveUpCall();
    expect(call).toBeDefined();
    expect(call![0]).toContain('processing_error');
    expect(call![0]).toContain('processing_attempts >= $1');
    // Ohne diesen Pfad würde ein Dokument, das die Pipeline jedes Mal
    // abstürzen lässt, für immer neu geclaimt werden.
    expect(call![1][0]).toBe(3);
  });
});
