/**
 * Qdrant hits are hydrated against the Papierkorb by asking which rows are
 * TRASHED, not which are live: embedded chat attachments share the `documents`
 * collection without a `documents` row, and must stay visible.
 */
import { describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

const { withoutTrashedDocuments } = await import('./trashedDocuments.js');

const LIVE = '11111111-1111-4111-8111-111111111111';
const TRASHED = '22222222-2222-4222-8222-222222222222';
const ATTACHMENT = '33333333-3333-4333-8333-333333333333';

describe('withoutTrashedDocuments', () => {
  it('drops only ids whose row is trashed, keeping rowless ids and the order', async () => {
    query.mockResolvedValueOnce([{ id: TRASHED }]);

    expect(await withoutTrashedDocuments([ATTACHMENT, TRASHED, LIVE])).toEqual([ATTACHMENT, LIVE]);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('deleted_at IS NOT NULL');
    expect(params).toEqual([[ATTACHMENT, TRASHED, LIVE]]);
  });

  it('never sends a non-uuid id to the uuid column', async () => {
    query.mockClear();

    expect(await withoutTrashedDocuments(['grundsatz-2024', 'local-1'])).toEqual([
      'grundsatz-2024',
      'local-1',
    ]);
    expect(query).not.toHaveBeenCalled();
  });
});
