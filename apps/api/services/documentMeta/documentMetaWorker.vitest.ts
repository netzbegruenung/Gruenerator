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

const { DOC_META_VERSION, defaultDeps, drainDocMetaQueue } =
  await import('./documentMetaWorker.js');
const { hasAiConsent } = await import('../../middleware/requireAiConsent.js');

type Row = Record<string, unknown>;

const NOW = new Date('2026-09-23T12:00:00Z');

function makeDeps(opts: {
  claims: Row[];
  backfill?: boolean;
  consent?: boolean;
  chunks?: string[];
  llm?: unknown;
  /** Grenze aus der Migration; `null` = Migration nicht gelaufen. */
  boundary?: string | null;
  points?: number;
}) {
  const pending = [...opts.claims];
  const query = vi.fn((sql: string, _params?: unknown[]) => {
    if (sql.includes('FOR UPDATE SKIP LOCKED')) {
      const next = pending.shift();
      return Promise.resolve(next ? [next] : []);
    }
    if (sql.includes('FROM profiles')) return Promise.resolve([{ locale: 'de-DE' }]);
    if (sql.includes('document_meta_boundary')) {
      const b = opts.boundary === undefined ? '2026-09-24T00:00:00Z' : opts.boundary;
      return Promise.resolve([{ since: b }]);
    }
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
    setPayload: vi.fn((_t: unknown, _p: unknown) => Promise.resolve()),
    countPoints: vi.fn(() => Promise.resolve(opts.points ?? 3)),
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
  previous_gremium: null,
  vector_count: 3,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Claim', () => {
  it('nimmt neue Dokumente ab der Migrationsgrenze, bestehende nur mit Backfill-Schalter', async () => {
    const deps = makeDeps({ claims: [], boundary: '2026-09-24T00:00:00Z' });
    await drainDocMetaQueue(deps);
    const [sql, params] = claimSql(deps);
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain("status = 'completed'");
    // Neu = nach der Grenze UND ohne doc_meta. Kein Spalten-Default entscheidet das.
    expect(sql).not.toContain('doc_meta_auto');
    expect(sql).toMatch(
      /\$5::timestamptz IS NOT NULL\s+AND created_at >= \$5::timestamptz\s+AND NOT \(COALESCE\(metadata, '\{\}'::jsonb\) \? 'doc_meta'\)/
    );
    expect(sql).toMatch(
      /\$2::boolean AND COALESCE\(\(metadata->'doc_meta'->>'version'\)::int, 0\) <> \$1/
    );
    expect(params?.[0]).toBe(DOC_META_VERSION);
    expect(params?.[1]).toBe(false);
    expect(params?.[4]).toBe('2026-09-24T00:00:00Z');
  });

  it('claimt nichts, solange die Grenze fehlt (Migration nicht gelaufen) und kein Backfill an ist', async () => {
    const deps = makeDeps({ claims: [doc()], boundary: null });
    expect(await drainDocMetaQueue(deps)).toBe(0);
    expect(deps.db.query.mock.calls.some(([sql]) => sql.includes('FOR UPDATE'))).toBe(false);
  });

  it('claimt nichts, wenn die Grenztabelle gar nicht existiert', async () => {
    const deps = makeDeps({ claims: [doc()] });
    deps.db.query.mockImplementation((sql: string) =>
      sql.includes('document_meta_boundary')
        ? Promise.reject(new Error('relation "document_meta_boundary" does not exist'))
        : Promise.resolve([])
    );
    expect(await drainDocMetaQueue(deps)).toBe(0);
    expect(deps.db.query.mock.calls.some(([sql]) => sql.includes('FOR UPDATE'))).toBe(false);
  });

  it('mit Backfill-Schalter läuft der Bestand auch ohne Grenze, aber nie über den Neu-Zweig', async () => {
    const deps = makeDeps({ claims: [], backfill: true, boundary: null });
    await drainDocMetaQueue(deps);
    const [, params] = claimSql(deps);
    expect(params?.[1]).toBe(true);
    expect(params?.[4]).toBeNull();
  });

  it('nimmt nur gesetzte Zeilen: seit Minuten unverändert', async () => {
    const deps = makeDeps({ claims: [] });
    await drainDocMetaQueue(deps);
    const [sql, params] = claimSql(deps);
    expect(sql).toMatch(/GREATEST\(created_at, updated_at\) < NOW\(\) - \(\$6::text/);
    expect(Number(params?.[5])).toBeGreaterThanOrEqual(120_000);
  });

  it('zählt Versuche nur für die aktuelle Version — ein Versionswechsel setzt sie zurück', async () => {
    const deps = makeDeps({ claims: [] });
    await drainDocMetaQueue(deps);
    const [sql] = claimSql(deps);
    const attemptsOfThisVersion =
      "CASE WHEN (metadata->'doc_meta_claim'->>'version')::int = $1 THEN (metadata->'doc_meta_claim'->>'attempts')::int END";
    // Gezählt wird in der Auswahl UND beim Hochzählen nur ein Claim derselben Version.
    expect(sql).toContain(`COALESCE(${attemptsOfThisVersion}, 0) < $3`);
    expect(sql).toContain(
      `COALESCE(${attemptsOfThisVersion.replaceAll('metadata', 'd.metadata')}, 0) + 1`
    );
    expect(sql).toMatch(/'version', \$1::int/);
  });

  it('markiert den Claim mit Zeit und Versuchszähler, damit ein toter Lauf zurückkommt', async () => {
    const deps = makeDeps({ claims: [] });
    await drainDocMetaQueue(deps);
    const [sql] = claimSql(deps);
    expect(sql).toContain("'doc_meta_claim'");
    expect(sql).toContain("'attempts'");
  });

  it('hält sich an eine übergebene Obergrenze pro Lauf', async () => {
    const deps = makeDeps({ claims: [doc(), doc({ id: 'doc-2' }), doc({ id: 'doc-3' })] });
    expect(await drainDocMetaQueue(deps, { maxDocs: 2 })).toBe(2);
  });
});

describe('Bereitschaft der Vektoren', () => {
  it('schreibt nichts, solange Qdrant weniger Punkte hat als vector_count', async () => {
    const deps = makeDeps({ claims: [doc({ vector_count: 5 })], points: 2 });
    await drainDocMetaQueue(deps);
    expect(deps.countPoints).toHaveBeenCalledWith('doc-1', 'user-1');
    expect(storeCall(deps)).toBeUndefined();
    expect(deps.setPayload).not.toHaveBeenCalled();
  });

  it('schreibt nichts ohne einen einzigen Punkt, auch bei vector_count 0', async () => {
    const deps = makeDeps({ claims: [doc({ vector_count: 0 })], points: 0 });
    await drainDocMetaQueue(deps);
    expect(storeCall(deps)).toBeUndefined();
  });

  it('speichert kein leeres doc_meta, wenn der Text nicht ladbar war', async () => {
    const deps = makeDeps({ claims: [doc({ head: null, content_preview: null })] });
    await drainDocMetaQueue(deps);
    expect(storeCall(deps)).toBeUndefined();
  });
});

describe('Einwilligung', () => {
  it('verlangt im Standard-Deps eine echte Einwilligung, auch ohne ENFORCE_AI_CONSENT', async () => {
    const deps = defaultDeps();
    vi.mocked(hasAiConsent).mockResolvedValueOnce(false);
    expect(await deps.hasAiConsent('user-1')).toBe(false);
    expect(hasAiConsent).toHaveBeenCalledWith('user-1', {
      failClosed: true,
      ignoreEnforceFlag: true,
    });
  });

  it('wertet einen Fehler beim Lesen der Einwilligung als Nein', async () => {
    const deps = makeDeps({ claims: [doc({ head: 'Stand: 08.01.2024' })] });
    deps.hasAiConsent.mockRejectedValueOnce(new Error('db weg'));
    await drainDocMetaQueue(deps);
    expect(deps.aiObject).not.toHaveBeenCalled();
    const record = JSON.parse(String(storeCall(deps)![1]?.[1])) as Record<string, unknown>;
    expect(record.date).toBe('2024-01-08');
  });
});

describe('Spiegel nach published_at', () => {
  it('spiegelt nur taggenaue Daten', async () => {
    const deps = makeDeps({
      claims: [doc({ head: 'Beschluss des Parteirats vom März 2024', filename: 'x.pdf' })],
      consent: false,
    });
    await drainDocMetaQueue(deps);
    const [, params] = storeCall(deps)!;
    const record = JSON.parse(String(params?.[1])) as Record<string, unknown>;
    expect(record).toMatchObject({ date: '2024-03-01', precision: 'month', publishedAt: null });
    expect(params?.[2]).toBeNull();
    expect(deps.setPayload).toHaveBeenCalledWith(
      { documentId: 'doc-1', userId: 'user-1' },
      { gremium: 'Parteirat' }
    );
  });

  it('räumt einen eigenen früheren Spiegel ab, wenn die neue Version kein Datum findet', async () => {
    const deps = makeDeps({
      claims: [
        doc({
          head: 'Ohne Kopfdaten.',
          filename: 'x.pdf',
          existing_published_at: '2024-03-12',
          previous_mirror: '2024-03-12',
        }),
      ],
      backfill: true,
      consent: false,
    });
    await drainDocMetaQueue(deps);
    const [sql, params] = storeCall(deps)!;
    expect(params?.[2]).toBeNull();
    expect(params?.[3]).toBe(true);
    expect(sql).toContain("- 'published_at'");
    expect(deps.setPayload).toHaveBeenCalledWith(
      { documentId: 'doc-1', userId: 'user-1' },
      { published_at: null }
    );
  });

  it('räumt ein früher gesetztes Gremium in Qdrant ab, wenn die neue Version keines findet', async () => {
    const deps = makeDeps({
      claims: [
        doc({ head: 'Stand: 08.01.2024', filename: 'x.pdf', previous_gremium: 'Parteirat' }),
      ],
      backfill: true,
      consent: false,
    });
    await drainDocMetaQueue(deps);
    expect(deps.setPayload).toHaveBeenCalledWith(
      { documentId: 'doc-1', userId: 'user-1' },
      { published_at: '2024-01-08', gremium: null }
    );
  });

  it('lässt ein fremdes published_at stehen, auch wenn nichts gefunden wird', async () => {
    const deps = makeDeps({
      claims: [
        doc({
          head: 'Ohne Kopfdaten.',
          filename: 'x.pdf',
          existing_published_at: '2020-01-01',
          previous_mirror: null,
        }),
      ],
      consent: false,
    });
    await drainDocMetaQueue(deps);
    expect(storeCall(deps)![1]?.[3]).toBe(false);
    expect(deps.setPayload).not.toHaveBeenCalled();
  });
});

describe('Verarbeitung', () => {
  it('schreibt doc_meta per jsonb-Merge, spiegelt published_at und setzt die Qdrant-Nutzlast', async () => {
    const deps = makeDeps({ claims: [doc()] });
    const processed = await drainDocMetaQueue(deps);
    expect(processed).toBe(1);

    const [sql, params] = storeCall(deps)!;
    expect(sql).toMatch(/END - 'doc_meta_claim'\)/);
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
