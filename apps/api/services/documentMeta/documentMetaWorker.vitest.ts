/**
 * Der Worker entscheidet zwei Dinge, die nicht verrutschen dürfen: WELCHE
 * Dokumente er anfasst (neue immer, bestehende nur mit ausdrücklichem
 * Backfill-Schalter) und OB ein Modell gefragt wird (nur mit Einwilligung).
 * Beides hängt an Claim-SQL und Deps — deshalb prüfen die Tests genau die.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: vi.fn() }),
}));
vi.mock('../../database/services/QdrantService/QdrantService.js', () => ({
  getQdrantInstance: () => ({}),
}));
vi.mock('../document-services/DocumentSearchService/index.js', () => ({
  getQdrantDocumentService: () => ({}),
}));
vi.mock('../../middleware/requireAiConsent.js', () => ({ hasAiConsent: vi.fn() }));
vi.mock('../ai/generate.js', () => ({ aiObject: vi.fn() }));

const { DOC_META_VERSION, drainDocMetaQueue } = await import('./documentMetaWorker.js');

type Row = Record<string, unknown>;

const NOW = new Date('2026-09-23T12:00:00Z');

function makeDeps(opts: {
  claims: Row[];
  backfill?: boolean;
  consent?: boolean;
  chunks?: string[];
  llm?: unknown;
}) {
  const pending = [...opts.claims];
  const query = vi.fn((sql: string, _params?: unknown[]) => {
    if (sql.includes('FOR UPDATE SKIP LOCKED')) {
      const next = pending.shift();
      return Promise.resolve(next ? [next] : []);
    }
    if (sql.includes('FROM profiles')) return Promise.resolve([{ locale: 'de-DE' }]);
    return Promise.resolve([]);
  });
  const deps = {
    db: { query },
    getChunks: vi.fn(() =>
      Promise.resolve(
        opts.chunks
          ? { success: true, chunks: opts.chunks.map((text, index) => ({ index, text })) }
          : { success: false, chunks: [] }
      )
    ),
    setPayload: vi.fn(() => Promise.resolve()),
    hasAiConsent: vi.fn(() => Promise.resolve(opts.consent ?? true)),
    aiObject: vi.fn(() =>
      Promise.resolve(opts.llm ? { ok: true, data: opts.llm } : { ok: false, error: 'aus' })
    ),
    backfill: opts.backfill ?? false,
    now: () => NOW,
  };
  return deps;
}

const claimSql = (deps: ReturnType<typeof makeDeps>) =>
  deps.db.query.mock.calls.find(([sql]) => sql.includes('FOR UPDATE SKIP LOCKED'))!;
const storeCall = (deps: ReturnType<typeof makeDeps>) =>
  deps.db.query.mock.calls.find(([sql]) => sql.includes("jsonb_build_object('doc_meta'"));

const doc = (over: Row = {}): Row => ({
  id: 'doc-1',
  user_id: 'user-1',
  title: 'Klimaschutz jetzt',
  filename: 'klima_08.01.2025.pdf',
  head: 'Klimaschutz jetzt\nBeschluss des Parteirats vom 12.03.2024\nWir fordern …',
  content_preview: null,
  existing_published_at: null,
  previous_mirror: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Claim', () => {
  it('nimmt neue Dokumente immer, bestehende nur mit Backfill-Schalter', async () => {
    const deps = makeDeps({ claims: [] });
    await drainDocMetaQueue(deps);
    const [sql, params] = claimSql(deps);
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain("status = 'completed'");
    expect(sql).toContain('doc_meta_auto');
    // Neue: kein doc_meta. Alle anderen (auch Versionswechsel) nur mit $2.
    expect(sql).toMatch(
      /doc_meta_auto AND NOT \(COALESCE\(metadata, '\{\}'::jsonb\) \? 'doc_meta'\)/
    );
    expect(sql).toMatch(
      /\$2::boolean AND COALESCE\(\(metadata->'doc_meta'->>'version'\)::int, 0\) <> \$1/
    );
    expect(params?.[0]).toBe(DOC_META_VERSION);
    expect(params?.[1]).toBe(false);
  });

  it('reicht den Backfill-Schalter in den Claim durch', async () => {
    const deps = makeDeps({ claims: [], backfill: true });
    await drainDocMetaQueue(deps);
    expect(claimSql(deps)[1]?.[1]).toBe(true);
  });

  it('markiert den Claim mit Zeit und Versuchszähler, damit ein toter Lauf zurückkommt', async () => {
    const deps = makeDeps({ claims: [] });
    await drainDocMetaQueue(deps);
    const [sql] = claimSql(deps);
    expect(sql).toContain("'doc_meta_claim'");
    expect(sql).toContain("'attempts'");
  });
});

describe('Verarbeitung', () => {
  it('schreibt doc_meta per jsonb-Merge, spiegelt published_at und setzt die Qdrant-Nutzlast', async () => {
    const deps = makeDeps({ claims: [doc()] });
    const processed = await drainDocMetaQueue(deps);
    expect(processed).toBe(1);

    const [sql, params] = storeCall(deps)!;
    expect(sql).toContain("COALESCE(metadata, '{}'::jsonb) - 'doc_meta_claim'");
    expect(sql).toContain('||');
    expect(params?.[0]).toBe('doc-1');
    const record = JSON.parse(String(params?.[1])) as Record<string, unknown>;
    expect(record).toMatchObject({
      version: DOC_META_VERSION,
      date: '2024-03-12',
      dateKind: 'beschluss',
      gremium: 'Parteirat',
      publishedAt: '2024-03-12',
      extractedAt: NOW.toISOString(),
    });
    expect(params?.[2]).toBe('2024-03-12');

    expect(deps.setPayload).toHaveBeenCalledWith(
      { documentId: 'doc-1', userId: 'user-1' },
      { published_at: '2024-03-12', gremium: 'Parteirat' }
    );
    // Heuristik reichte — kein Modell.
    expect(deps.aiObject).not.toHaveBeenCalled();
  });

  it('spiegelt ein Datum nur aus dem Dateinamen nicht als published_at', async () => {
    const deps = makeDeps({ claims: [doc({ head: 'Ohne Kopfdaten.' })], consent: false });
    await drainDocMetaQueue(deps);
    const [, params] = storeCall(deps)!;
    const record = JSON.parse(String(params?.[1])) as Record<string, unknown>;
    expect(record.dateKind).toBe('filename');
    expect(record.publishedAt).toBeNull();
    expect(params?.[2]).toBeNull();
    expect(deps.setPayload).not.toHaveBeenCalled();
  });

  it('überschreibt kein fremdes published_at in Qdrant', async () => {
    const deps = makeDeps({ claims: [doc({ existing_published_at: '2020-05-05' })] });
    await drainDocMetaQueue(deps);
    expect(deps.setPayload).toHaveBeenCalledWith(
      { documentId: 'doc-1', userId: 'user-1' },
      { gremium: 'Parteirat' }
    );
  });

  it('fragt ohne Einwilligung der Eigentümer*in kein Modell', async () => {
    const deps = makeDeps({ claims: [doc({ head: 'Stand: 08.01.2024' })], consent: false });
    await drainDocMetaQueue(deps);
    expect(deps.hasAiConsent).toHaveBeenCalledWith('user-1');
    expect(deps.aiObject).not.toHaveBeenCalled();
    const record = JSON.parse(String(storeCall(deps)![1]?.[1])) as Record<string, unknown>;
    expect(record.date).toBe('2024-01-08');
    expect(record.source).toBe('heuristic');
  });

  it('fragt mit Einwilligung das Modell, wenn die Heuristik nicht reicht', async () => {
    const deps = makeDeps({ claims: [doc({ head: 'Stand: 08.01.2024' })], consent: true });
    await drainDocMetaQueue(deps);
    expect(deps.aiObject).toHaveBeenCalledTimes(1);
  });

  it('liest ohne Originaltext die ersten Chunks, sonst die Vorschau', async () => {
    const withChunks = makeDeps({
      claims: [doc({ head: null })],
      chunks: ['Positionspapier', 'Stand: 08. Januar 2024'],
      consent: false,
    });
    await drainDocMetaQueue(withChunks);
    expect(withChunks.getChunks).toHaveBeenCalledWith('user-1', 'doc-1');
    const a = JSON.parse(String(storeCall(withChunks)![1]?.[1])) as Record<string, unknown>;
    expect(a).toMatchObject({ date: '2024-01-08', textOrigin: 'chunks' });

    const withPreview = makeDeps({
      claims: [doc({ head: '', content_preview: 'Datum: 14.02.2025' })],
      consent: false,
    });
    await drainDocMetaQueue(withPreview);
    const b = JSON.parse(String(storeCall(withPreview)![1]?.[1])) as Record<string, unknown>;
    expect(b).toMatchObject({ date: '2025-02-14', textOrigin: 'preview' });
  });

  it('schreibt auch ohne Fund ein doc_meta, damit das Dokument nicht erneut geclaimt wird', async () => {
    const deps = makeDeps({
      claims: [doc({ head: 'Nichts.', filename: 'notiz.txt' })],
      consent: false,
    });
    await drainDocMetaQueue(deps);
    const record = JSON.parse(String(storeCall(deps)![1]?.[1])) as Record<string, unknown>;
    expect(record).toMatchObject({ version: DOC_META_VERSION, date: null, dates: [] });
  });

  it('lässt einen Fehler den Claim stehen und macht mit dem nächsten Dokument weiter', async () => {
    const deps = makeDeps({ claims: [doc(), doc({ id: 'doc-2' })] });
    deps.setPayload.mockRejectedValueOnce(new Error('qdrant weg')).mockResolvedValue(undefined);
    const processed = await drainDocMetaQueue(deps);
    expect(processed).toBe(2);
    // Qdrant zuerst: scheitert es, bleibt doc_meta ungeschrieben und der Claim
    // kommt nach Ablauf zurück, statt die Nutzlast für immer zu verlieren.
    const stores = deps.db.query.mock.calls.filter(([sql]) =>
      sql.includes("jsonb_build_object('doc_meta'")
    );
    expect(stores.map(([, p]) => p?.[0])).toEqual(['doc-2']);
  });
});
