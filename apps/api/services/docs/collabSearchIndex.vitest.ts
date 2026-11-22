import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  embed: vi.fn(),
  deleteVectors: vi.fn(),
  storeVectors: vi.fn(),
  html: vi.fn(),
  read: vi.fn(),
  redisSet: vi.fn(),
}));

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: mocks.query, queryOne: mocks.queryOne }),
}));
vi.mock('../document-services/DocumentProcessingService/chunkingPipeline.js', () => ({
  chunkAndEmbedText: mocks.embed,
}));
vi.mock('../document-services/DocumentSearchService/index.js', () => ({
  getQdrantDocumentService: () => ({
    deleteDocumentVectors: mocks.deleteVectors,
    storeDocumentVectors: mocks.storeVectors,
  }),
}));
vi.mock('./docContentService.js', () => ({ getDocumentHtml: mocks.html }));
vi.mock('../../routes/chat/services/artifactReader.js', () => ({
  readArtifactContent: mocks.read,
  subtypeToReadKind: (s: string) => (s === 'sheets' ? 'sheet' : 'doc'),
}));
vi.mock('../../utils/redis/client.js', () => ({
  ensureConnected: vi.fn(async () => undefined),
  redisClient: { set: mocks.redisSet, del: vi.fn(async () => 1) },
}));
vi.mock('../../utils/reportBackgroundError.js', () => ({ reportBackgroundError: vi.fn() }));

const { indexCollabDocument, findDueCollabDocuments, runCollabIndexPass, QUIET_PERIOD_MINUTES } =
  await import('./collabSearchIndex.js');

const STARTED = new Date('2026-11-22T10:00:00Z');
const DOC = {
  id: 'doc-1',
  title: 'Klimaplan',
  subtype: 'docs',
  created_by: 'owner-1',
  started_at: STARTED,
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.query.mockResolvedValue([]);
  mocks.html.mockResolvedValue({ html: '<h1>Klima</h1><p>Das Dach wird begrünt.</p>' });
  mocks.embed.mockResolvedValue({ chunks: [{ text: 'a' }, { text: 'b' }], embeddings: [[1], [2]] });
  mocks.redisSet.mockResolvedValue('OK');
});

describe('indexCollabDocument', () => {
  it('embeds a changed document once and marks its points as collab', async () => {
    mocks.queryOne.mockResolvedValueOnce(DOC).mockResolvedValueOnce(null);
    expect(await indexCollabDocument('doc-1')).toBe('indexed');

    expect(mocks.embed).toHaveBeenCalledTimes(1);
    expect(mocks.embed.mock.calls[0][0]).toContain('# Klima');
    expect(mocks.deleteVectors).toHaveBeenCalledWith('doc-1', null);
    const [owner, docId, chunks, , meta] = mocks.storeVectors.mock.calls[0];
    expect([owner, docId, chunks]).toEqual(['owner-1', 'doc-1', [{ text: 'a' }, { text: 'b' }]]);
    expect(meta).toMatchObject({
      sourceType: 'collab',
      title: 'Klimaplan',
      additionalPayload: { collab_subtype: 'docs', source_url: '/docs/doc-1' },
    });
    const upsert = mocks.query.mock.calls.find(([sql]) =>
      /INSERT INTO collab_search_index/.test(sql)
    );
    expect(upsert?.[1]).toEqual(['doc-1', expect.any(String), 2, STARTED]);
  });

  it('skips the embedding when title and text hash are unchanged', async () => {
    mocks.queryOne.mockResolvedValueOnce(DOC).mockResolvedValueOnce(null);
    await indexCollabDocument('doc-1');
    const hash = mocks.query.mock.calls.find(([sql]) =>
      /INSERT INTO collab_search_index/.test(sql)
    )![1][1];

    Object.values(mocks).forEach((m) => m.mockClear());
    mocks.query.mockResolvedValue([]);
    mocks.html.mockResolvedValue({ html: '<h1>Klima</h1><p>Das Dach wird begrünt.</p>' });
    mocks.queryOne.mockResolvedValueOnce(DOC).mockResolvedValueOnce({ content_hash: hash });

    expect(await indexCollabDocument('doc-1')).toBe('unchanged');
    expect(mocks.embed).not.toHaveBeenCalled();
    expect(mocks.storeVectors).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls[0][0]).toMatch(/UPDATE collab_search_index SET checked_at/);
  });

  it('never indexes a trashed document and drops what it had', async () => {
    mocks.queryOne.mockResolvedValueOnce(null);
    expect(await indexCollabDocument('doc-1')).toBe('removed');
    const [sql] = mocks.queryOne.mock.calls[0] as [string];
    expect(sql).toMatch(/deleted_at IS NULL AND is_deleted = false/);
    expect(mocks.embed).not.toHaveBeenCalled();
    expect(mocks.deleteVectors).toHaveBeenCalledWith('doc-1', null);
    expect(mocks.query.mock.calls[0][0]).toMatch(/DELETE FROM collab_search_index/);
  });

  it('skips a video and a document without an owner', async () => {
    mocks.queryOne.mockResolvedValueOnce({ ...DOC, subtype: 'video' });
    expect(await indexCollabDocument('doc-1')).toBe('skipped');
    mocks.queryOne.mockResolvedValueOnce({ ...DOC, created_by: null });
    expect(await indexCollabDocument('doc-1')).toBe('skipped');
    expect(mocks.embed).not.toHaveBeenCalled();
  });

  it('removes the index of a document that became empty', async () => {
    mocks.queryOne.mockResolvedValueOnce(DOC);
    mocks.html.mockResolvedValue({ html: '<p></p>' });
    expect(await indexCollabDocument('doc-1')).toBe('removed');
    expect(mocks.embed).not.toHaveBeenCalled();
  });
});

describe('quiet period and dedup', () => {
  it('selects a document once, only after the quiet period and only if edited since the last check', async () => {
    mocks.query.mockResolvedValue([{ id: 'doc-1' }]);
    expect(await findDueCollabDocuments(QUIET_PERIOD_MINUTES, 10)).toEqual(['doc-1']);
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/cd\.updated_at < now\(\) - \(\$2::int \* interval '1 minute'\)/);
    expect(sql).toMatch(/ci\.document_id IS NULL OR ci\.checked_at < cd\.updated_at/);
    expect(sql).toMatch(/cd\.deleted_at IS NULL AND cd\.is_deleted = false/);
    expect(sql).toMatch(/group_content_shares[^]*g\.deleted_at IS NULL/);
    expect(params[1]).toBe(2);
    expect(params[0]).not.toContain('video');
  });

  it('processes a document due twice in one pass only once, and skips one another worker holds', async () => {
    mocks.query.mockImplementation(async (sql: string) =>
      /JOIN collaborative_documents cd ON cd\.id = ci\.document_id/.test(sql)
        ? [{ id: 'doc-1' }]
        : /FROM collaborative_documents cd/.test(sql)
          ? [{ id: 'doc-1' }, { id: 'doc-2' }]
          : []
    );
    mocks.queryOne.mockResolvedValue(null); // trashed/gone -> 'removed', cheap
    mocks.redisSet.mockImplementation(async (key: string) => (key.endsWith('doc-2') ? null : 'OK'));

    const out = await runCollabIndexPass();
    expect(out.processed).toBe(2);
    expect(mocks.queryOne).toHaveBeenCalledTimes(1); // doc-1 once; doc-2 claimed elsewhere
    expect(out.results.removed).toBe(1);
  });
});
