/**
 * Wissen im Papierkorb: löschen setzt nur `deleted_at` — die Qdrant-Punkte
 * bleiben bis zum Purge, und die Vektorsuche gleicht ihre Treffer deshalb
 * gegen Postgres ab, sonst fände sie den getrashten Eintrag weiter.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const effects: string[] = [];
let rows: unknown[] = [];
const qdrantDelete = vi.fn(async () => {
  effects.push('qdrant delete');
});
const qdrantQuery = vi.fn(async () => ({
  points: [
    { score: 0.9, payload: { knowledge_id: LIVE, title: 'Lebt', content: 'a' } },
    { score: 0.8, payload: { knowledge_id: TRASHED, title: 'Getrasht', content: 'b' } },
  ],
}));

const postgres = {
  ensureInitialized: async () => {},
  query: vi.fn(async (sql: string) => {
    effects.push(sql.replace(/\s+/g, ' ').trim().split(' WHERE ')[0]);
    return rows;
  }),
};
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => postgres,
}));
vi.mock('../../database/services/QdrantService.js', () => ({
  getQdrantInstance: () => ({
    init: async () => {},
    isAvailableSync: () => true,
    collections: { user_knowledge: 'user_knowledge' },
    client: { delete: qdrantDelete, query: qdrantQuery },
  }),
}));
vi.mock('../mistral/index.js', () => ({
  mistralEmbeddingService: { init: async () => {}, generateEmbedding: async () => [0.1] },
}));
vi.mock('../document-services/index.js', () => ({ smartChunkDocument: vi.fn() }));
vi.mock('../../utils/reportBackgroundError.js', () => ({ reportBackgroundError: vi.fn() }));

const USER = '11111111-1111-4111-8111-111111111111';
const LIVE = '33333333-3333-4333-8333-333333333333';
const TRASHED = '44444444-4444-4444-8444-444444444444';

const { KnowledgeService } = await import('./KnowledgeService.js');

beforeEach(() => {
  effects.length = 0;
  rows = [];
  qdrantDelete.mockClear();
});

describe('Wissen im Papierkorb', () => {
  it('löschen setzt nur deleted_at — kein DELETE, die Punkte bleiben', async () => {
    rows = [{ id: LIVE }];
    await expect(new KnowledgeService().deleteUserKnowledge(USER, LIVE)).resolves.toEqual({
      success: true,
    });
    expect(effects).toEqual(['UPDATE user_knowledge SET deleted_at = now()']);
    expect(qdrantDelete).not.toHaveBeenCalled();
  });

  it('ein fremder oder schon getrashter Eintrag bleibt ein Fehler', async () => {
    rows = [];
    await expect(new KnowledgeService().deleteUserKnowledge(USER, LIVE)).rejects.toThrow(
      /not found/
    );
  });

  it('purge: bedingtes DELETE, danach die Qdrant-Punkte', async () => {
    rows = [{ id: LIVE, embedding_id: 'knowledge_x' }];
    await expect(new KnowledgeService().purgeUserKnowledge(LIVE, null)).resolves.toBe(true);
    expect(effects).toEqual(['DELETE FROM user_knowledge', 'qdrant delete']);

    effects.length = 0;
    rows = [];
    await expect(new KnowledgeService().purgeUserKnowledge(LIVE, null)).resolves.toBe(false);
    expect(effects).toEqual(['DELETE FROM user_knowledge']);
  });

  it('die Vektorsuche verwirft Treffer eines getrashten Eintrags', async () => {
    rows = [{ id: LIVE }];
    const out = await new KnowledgeService().searchUserKnowledge(USER, 'Klima');
    expect(out.search_type).toBe('vector');
    expect(out.results.map((r) => r.knowledge_id)).toEqual([LIVE]);
  });

  it('speichern auf eine getrashte oder fremde ID ändert nichts und bettet nicht neu ein', async () => {
    rows = [];
    await expect(
      new KnowledgeService().saveUserKnowledge(USER, { id: LIVE, title: 'T', content: 'C' })
    ).rejects.toThrow(/not found/);
    expect(effects).toEqual([
      'UPDATE user_knowledge SET title = $1, content = $2, knowledge_type = $3, tags = $4, embedding_hash = $5, updated_at = CURRENT_TIMESTAMP',
    ]);
    expect(postgres.query.mock.calls[0]?.[0]).toContain('AND deleted_at IS NULL');
  });
});
