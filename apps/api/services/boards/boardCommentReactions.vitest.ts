/**
 * Board comment reactions: the ids are collected per selector including
 * replies (they cascade via parent_id), the delete is one statement.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: vi.fn() }),
}));

const { collectDoomedBoardCommentIds, deleteBoardCommentReactions } =
  await import('./boardCommentReactions.js');

type Query = Parameters<typeof collectDoomedBoardCommentIds>[1];

function recorder(rows: unknown[] = []) {
  const calls: Array<[string, unknown[]]> = [];
  const query = (async (sql: string, params?: unknown[]) => {
    calls.push([sql.replace(/\s+/g, ' ').trim(), params ?? []]);
    return rows;
  }) as NonNullable<Query>;
  return { calls, query };
}

describe('collectDoomedBoardCommentIds', () => {
  it.each([
    [{ commentId: 'c1' }, 'id', 'c1'],
    [{ boardId: 'b1' }, 'board_id', 'b1'],
    [{ authorId: 'u1' }, 'user_id', 'u1'],
  ] as const)('%o selects by %s including replies', async (selector, column, value) => {
    const { calls, query } = recorder([{ id: 'c1' }, { id: 'r1' }]);

    expect(await collectDoomedBoardCommentIds(selector, query)).toEqual(['c1', 'r1']);
    expect(calls).toHaveLength(1);
    const [sql, params] = calls[0];
    expect(sql).toContain(`WHERE ${column} = $1::uuid`);
    expect(sql).toContain(
      `OR parent_id IN (SELECT id FROM board_comments WHERE ${column} = $1::uuid)`
    );
    expect(params).toEqual([value]);
  });
});

describe('deleteBoardCommentReactions', () => {
  it('no ids → no query', async () => {
    const { calls, query } = recorder();
    await deleteBoardCommentReactions([], query);
    expect(calls).toHaveLength(0);
  });

  it('deletes only board_comment reactions of the given ids', async () => {
    const { calls, query } = recorder();
    await deleteBoardCommentReactions(['c1', 'r1'], query);
    expect(calls).toEqual([
      [
        "DELETE FROM entity_reactions WHERE entity_type = 'board_comment' AND entity_id = ANY($1::text[])",
        [['c1', 'r1']],
      ],
    ]);
  });
});
