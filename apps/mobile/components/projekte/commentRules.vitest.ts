import { groupMentionsFromDraft } from '@gruenerator/shared/utils';
import { describe, expect, it } from 'vitest';

import { canDeleteComment, canSendComment, replyDraft, replyTarget } from './commentRules';

const UID = '123e4567-e89b-12d3-a456-426614174000';

describe('canDeleteComment', () => {
  it('lets admins delete anything', () => {
    expect(canDeleteComment({ userId: 'x' }, 'me', true)).toBe(true);
  });
  it('lets authors delete their own', () => {
    expect(canDeleteComment({ userId: 'me' }, 'me', false)).toBe(true);
  });
  it('refuses others and anonymous', () => {
    expect(canDeleteComment({ userId: 'x' }, 'me', false)).toBe(false);
    expect(canDeleteComment({ userId: null }, 'me', null)).toBe(false);
    expect(canDeleteComment({ userId: null }, null, false)).toBe(false);
  });
});

describe('replyTarget', () => {
  it('threads replies to the top-level comment', () => {
    const t = replyTarget({ id: 'r', parentId: 'p', userId: 'u', authorName: 'Anna Beispiel' });
    expect(t.threadId).toBe('p');
    expect(t.label).toBe('Anna');
    expect(replyTarget({ id: 'c', parentId: null, userId: null, authorName: 'B' }).threadId).toBe(
      'c'
    );
  });
});

describe('replyDraft', () => {
  it('builds a member token when the id is known', () => {
    const t = replyTarget({ id: 'c', parentId: null, userId: UID, authorName: 'Anna Beispiel' });
    const d = replyDraft(t);
    expect(d.text).toBe('@Anna ');
    expect(groupMentionsFromDraft(`${d.text}danke`, d.mentions)).toBe(`@[Anna](user:${UID}) danke`);
  });
  it('falls back to a plain first-name mention without an id', () => {
    const t = replyTarget({ id: 'c', parentId: null, userId: null, authorName: 'Anna Beispiel' });
    expect(replyDraft(t)).toEqual({ text: '@Anna ', mentions: [] });
  });
  it('drops the mention when the person deleted it from the draft', () => {
    expect(groupMentionsFromDraft('danke', [{ label: 'Anna', userId: UID }])).toBe('danke');
  });
});

describe('canSendComment', () => {
  it('needs text and no request in flight', () => {
    expect(canSendComment('  ', false)).toBe(false);
    expect(canSendComment('hi', true)).toBe(false);
    expect(canSendComment('hi', false)).toBe(true);
  });
});
