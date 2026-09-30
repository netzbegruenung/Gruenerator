import { type BoardComment, type BoardCommentReply } from '@gruenerator/contracts';
import { applyReaction } from '@gruenerator/shared/reactions';
import { describe, expect, it } from 'vitest';

import { patchBoardCommentReactions, withReactionSummaries } from './boardCommentReactions';

function reply(id: string, overrides: Partial<BoardCommentReply> = {}): BoardCommentReply {
  return {
    id,
    board_id: 'b1',
    card_id: 'k1',
    parent_id: null,
    user_id: 'u1',
    content: null,
    blocks: [{ type: 'text', text: 'Hallo' }],
    mentioned_user_ids: [],
    is_edited: false,
    edited_at: null,
    created_at: '2026-09-30T10:00:00Z',
    updated_at: '2026-09-30T10:00:00Z',
    author_name: 'Aileen',
    author_avatar_robot_id: 1,
    reactions: [],
    reactionSummaries: [],
    ...overrides,
  };
}

function comment(id: string, replies: BoardCommentReply[] = []): BoardComment {
  return { ...reply(id), replies };
}

const on = (emoji: string) => (r: Parameters<typeof applyReaction>[0]) =>
  applyReaction(r, emoji, true);

describe('patchBoardCommentReactions', () => {
  it('patches a top-level comment and keeps the others by reference', () => {
    const other = comment('c2');
    const data = [comment('c1'), other];
    const next = patchBoardCommentReactions(data, 'c1', on('👍'));
    expect(next[0]!.reactionSummaries).toEqual([{ emoji: '👍', count: 1, reacted: true }]);
    expect(next[1]).toBe(other);
    expect(data[0]!.reactionSummaries).toEqual([]);
  });

  it('patches a reply inside its parent and leaves the legacy rows alone', () => {
    const legacy = [
      {
        id: 'r1',
        comment_id: 'x1',
        user_id: 'u2',
        emoji: '💡',
        created_at: '2026-09-30T10:00:00Z',
      },
    ];
    const target = reply('x1', {
      parent_id: 'c1',
      reactions: legacy,
      reactionSummaries: [{ emoji: '🎉', count: 1, reacted: false }],
    });
    const data = [comment('c1', [reply('x0', { parent_id: 'c1' }), target])];
    const next = patchBoardCommentReactions(data, 'x1', on('🎉'));
    const patched = next[0]!.replies[1]!;
    expect(patched.reactionSummaries).toEqual([{ emoji: '🎉', count: 2, reacted: true }]);
    expect(patched.reactions).toBe(legacy);
    expect(next[0]!.replies[0]).toBe(data[0]!.replies[0]);
    expect(next[0]!.reactionSummaries).toEqual([]);
  });
});

describe('withReactionSummaries', () => {
  it('fills missing summaries on comments and replies', () => {
    const raw = [
      { ...comment('c1', [{ ...reply('x1') }]), reactionSummaries: undefined },
    ] as unknown as BoardComment[];
    delete (raw[0]!.replies[0] as Partial<BoardCommentReply>).reactionSummaries;
    const next = withReactionSummaries(raw);
    expect(next[0]!.reactionSummaries).toEqual([]);
    expect(next[0]!.replies[0]!.reactionSummaries).toEqual([]);
  });
});
