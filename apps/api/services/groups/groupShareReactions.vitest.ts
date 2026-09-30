import { describe, expect, it, vi } from 'vitest';

import { deleteReactionsForShares, shareReactionsDeleteSql } from './groupShareReactions.js';

describe('shareReactionsDeleteSql', () => {
  it('selects the shares like the caller and takes their comments along', () => {
    const { sql, params } = shareReactionsDeleteSql({
      contentTypes: ['chat_threads'],
      contentId: 't1',
      groupId: 'g1',
    });
    expect(sql).toContain(
      'FROM group_content_shares WHERE content_type = ANY($1::text[]) AND content_id = $2 AND group_id = $3::uuid'
    );
    expect(sql).toContain("entity_type = 'group_share'");
    expect(sql).toContain("entity_type = 'group_comment'");
    expect(sql).toContain('WHERE c.share_id IN (SELECT id FROM doomed)');
    expect(params).toEqual([['chat_threads'], 't1', 'g1']);
  });

  it('scopes by sharer when given', () => {
    const { sql, params } = shareReactionsDeleteSql({
      contentTypes: ['nextcloud_share_link'],
      contentId: 'l1',
      sharedBy: 'u1',
    });
    expect(sql).toContain('AND shared_by_user_id = $3::uuid)');
    expect(params).toEqual([['nextcloud_share_link'], 'l1', 'u1']);
  });

  it('selects every share of a group', () => {
    const { sql, params } = shareReactionsDeleteSql({ groupId: 'g1' });
    expect(sql).toContain('FROM group_content_shares WHERE group_id = $1::uuid)');
    expect(params).toEqual(['g1']);
  });

  it('runs on the given executor', async () => {
    const exec = vi.fn(async () => undefined);
    await deleteReactionsForShares({ groupId: 'g1' }, exec);
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM entity_reactions'), [
      'g1',
    ]);
  });
});
