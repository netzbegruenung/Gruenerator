import { type GroupShareComment } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { replyMention, threadComments } from './comments.js';

const c = (id: string, parentId: string | null = null): GroupShareComment => ({
  id,
  shareId: 's1',
  parentId,
  userId: 'u1',
  authorName: 'Anna Beispiel',
  body: id,
  createdAt: '2026-09-28T10:00:00.000Z',
  reactions: [],
});

describe('threadComments', () => {
  it('nests replies under their top-level comment, both in order', () => {
    const threads = threadComments([c('a'), c('b'), c('a1', 'a'), c('b1', 'b'), c('a2', 'a')]);
    expect(threads.map((t) => [t.comment.id, t.replies.map((r) => r.id)])).toEqual([
      ['a', ['a1', 'a2']],
      ['b', ['b1']],
    ]);
  });

  it('lifts a reply whose parent is missing to the top', () => {
    const threads = threadComments([c('a'), c('orphan', 'gone')]);
    expect(threads.map((t) => t.comment.id)).toEqual(['a', 'orphan']);
  });
});

describe('replyMention', () => {
  it('mentions the first name', () => {
    expect(replyMention('Anna Beispiel')).toBe('@Anna ');
  });
});
