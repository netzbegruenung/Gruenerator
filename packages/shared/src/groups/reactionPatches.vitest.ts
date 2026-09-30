import { type GroupShareComment, type ReactionSummary } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { patchCommentReactions, patchShareReactions } from './reactionPatches.js';

const thumbs: ReactionSummary = { emoji: '👍', count: 1, reacted: true };
const addThumbs = (r: ReactionSummary[]) => [...r, thumbs];

const comment = (id: string, parentId: string | null = null): GroupShareComment => ({
  id,
  shareId: 's1',
  parentId,
  userId: 'u1',
  authorName: 'Anna Beispiel',
  body: id,
  createdAt: '2026-09-28T10:00:00.000Z',
  reactions: [],
});

describe('patchShareReactions', () => {
  const meta = (shareId: string, extra: Record<string, unknown> = {}) => ({
    shareId,
    note: null,
    pinnedAt: null,
    pinnedByName: null,
    commentCount: 0,
    ...extra,
  });

  it('patches only the row whose share matches, across buckets', () => {
    const other = { id: 'd2', share: meta('s2', { reactions: [] }) };
    const content = {
      collaborative_documents: [{ id: 'd1', share: meta('s1', { reactions: [] }) }, other],
      group_posts: [{ id: 'p1', share: meta('s3', { reactions: [] }) }],
      texts: [],
    };
    const next = patchShareReactions(content, 's1', addThumbs);
    expect(next.collaborative_documents![0]).toEqual({
      id: 'd1',
      share: meta('s1', { reactions: [thumbs] }),
    });
    expect(next.collaborative_documents![1]).toBe(other);
    expect(next.group_posts).toEqual(content.group_posts);
    expect(next.texts).toEqual([]);
    // Immutable: the cached envelope stays untouched.
    expect(content.collaborative_documents[0]!.share).toEqual(meta('s1', { reactions: [] }));
  });

  it('treats missing reactions as empty and leaves rows without share alone', () => {
    const bare = { id: 'n1' };
    const next = patchShareReactions(
      { notebooks: [bare, { id: 'n2', share: meta('s1') }], system_notebooks: [null] },
      's1',
      addThumbs
    );
    expect(next.notebooks![0]).toBe(bare);
    expect(next.notebooks![1]).toEqual({ id: 'n2', share: meta('s1', { reactions: [thumbs] }) });
    expect(next.system_notebooks).toEqual([null]);
  });
});

describe('patchCommentReactions', () => {
  it('patches the matching comment or reply only', () => {
    const top = comment('c1');
    const list = [top, comment('c2', 'c1')];
    const next = patchCommentReactions(list, 'c2', addThumbs);
    expect(next[0]).toBe(top);
    expect(next[1]!.reactions).toEqual([thumbs]);
    expect(list[1]!.reactions).toEqual([]);
  });
});
