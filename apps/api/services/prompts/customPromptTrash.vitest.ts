/**
 * Custom prompts im Papierkorb: the Qdrant point goes with the purge, after
 * its conditional DELETE, and only when the prompt was ever vectorized.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const effects: string[] = [];
let deleted: unknown[] = [];
const reportBackgroundError = vi.fn();
const deletePromptVector = vi.fn(async (id: string) => {
  effects.push(`qdrant ${id}`);
  return true;
});

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({
    query: vi.fn(async (sql: string) => {
      effects.push(sql.replace(/\s+/g, ' ').trim().split(' WHERE ')[0]);
      return deleted;
    }),
  }),
}));
vi.mock('./PromptVectorService.js', () => ({
  getPromptVectorService: () => ({ deletePromptVector }),
}));
vi.mock('../../utils/reportBackgroundError.js', () => ({ reportBackgroundError }));

const ID = '33333333-3333-4333-8333-333333333333';

const { purgeCustomPrompt } = await import('./customPromptTrash.js');

beforeEach(() => {
  effects.length = 0;
  deleted = [];
  reportBackgroundError.mockClear();
  deletePromptVector.mockClear();
});

describe('custom prompt purge', () => {
  it('deletes the trashed row conditionally, then its vector', async () => {
    deleted = [{ id: ID, embedding_id: 'e1' }];
    expect(await purgeCustomPrompt(ID, new Date())).toBe(true);
    expect(effects).toEqual(['DELETE FROM custom_prompts', `qdrant ${ID}`]);
  });

  it('skips Qdrant for a prompt that was never vectorized', async () => {
    deleted = [{ id: ID, embedding_id: null }];
    expect(await purgeCustomPrompt(ID, null)).toBe(true);
    expect(deletePromptVector).not.toHaveBeenCalled();
  });

  it('stops at 0 rows and reports a failed vector delete without rethrowing', async () => {
    expect(await purgeCustomPrompt(ID, null)).toBe(false);
    expect(deletePromptVector).not.toHaveBeenCalled();

    deleted = [{ id: ID, embedding_id: 'e1' }];
    deletePromptVector.mockResolvedValueOnce(false);
    expect(await purgeCustomPrompt(ID, null)).toBe(true);
    expect(reportBackgroundError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ job: 'trash-purge', kind: 'custom_prompt', store: 'qdrant' })
    );
  });
});
