/**
 * Gespeicherte Texte im Papierkorb: trash sets `deleted_at` only, the
 * `user_texts` vectors go with the purge — after its conditional DELETE.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const effects: string[] = [];
let deleted: unknown[] = [];
let qdrantUp = true;
const reportBackgroundError = vi.fn();
const deleteDocument = vi.fn(async (id: string, collection: string) => {
  effects.push(`qdrant ${collection} ${id}`);
  return { success: true };
});

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({
    query: vi.fn(async (sql: string) => {
      effects.push(sql.replace(/\s+/g, ' ').trim().split(' WHERE ')[0]);
      return sql.startsWith('DELETE') ? deleted : [{ id: ID }];
    }),
  }),
}));
vi.mock('../../database/services/QdrantService.js', () => ({
  getQdrantInstance: () => ({ isAvailable: async () => qdrantUp, deleteDocument }),
}));
vi.mock('../../utils/reportBackgroundError.js', () => ({ reportBackgroundError }));

const USER = '11111111-1111-4111-8111-111111111111';
const ID = '33333333-3333-4333-8333-333333333333';

const { purgeSavedText, trashSavedTexts } = await import('./savedTextTrash.js');

beforeEach(() => {
  effects.length = 0;
  deleted = [];
  qdrantUp = true;
  reportBackgroundError.mockClear();
  deleteDocument.mockClear();
});

describe('gespeicherter Text im Papierkorb', () => {
  it('trash only sets deleted_at — the vectors stay', async () => {
    expect(await trashSavedTexts(USER, [ID])).toEqual([ID]);
    expect(effects).toEqual(['UPDATE user_documents SET deleted_at = now()']);
    expect(deleteDocument).not.toHaveBeenCalled();
  });

  it('purge: conditional DELETE, then the user_texts vectors', async () => {
    deleted = [{ id: ID }];
    expect(await purgeSavedText(ID, null)).toBe(true);
    expect(effects).toEqual(['DELETE FROM user_documents', `qdrant user_texts ${ID}`]);
  });

  it('touches no vector when the row was restored meanwhile (0 rows)', async () => {
    expect(await purgeSavedText(ID, null)).toBe(false);
    expect(deleteDocument).not.toHaveBeenCalled();
  });

  it('reports a failed vector delete and never rethrows once the row is gone', async () => {
    deleted = [{ id: ID }];
    deleteDocument.mockResolvedValueOnce({ success: false });
    expect(await purgeSavedText(ID, null)).toBe(true);
    expect(reportBackgroundError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ job: 'trash-purge', kind: 'user_document', store: 'qdrant' })
    );
  });
});
