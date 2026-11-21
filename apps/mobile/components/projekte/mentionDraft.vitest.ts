import { groupMentionsFromDraft } from '@gruenerator/shared/utils';
import { describe, expect, it } from 'vitest';

import {
  buildMentionOptions,
  detectMentionTrigger,
  insertMention,
  mentionSuggestions,
  pruneMentionPicks,
} from './mentionDraft';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const members = [
  { user_id: 'me', role: 'admin', display_name: 'Ich Selbst' },
  { user_id: A, role: 'member', display_name: 'Anna Beispiel' },
  { user_id: B, role: 'member', display_name: null, first_name: 'Ben' },
  { user_id: 'x', role: 'member', display_name: null, first_name: null },
];

describe('buildMentionOptions', () => {
  it('excludes self and nameless members', () => {
    const o = buildMentionOptions(members, 'me', false, true);
    expect(o.candidates).toEqual([
      { userId: A, label: 'Anna Beispiel' },
      { userId: B, label: 'Ben' },
    ]);
    expect(o.memberCount).toBe(4);
  });
  it('offers @alle in the system project only to those who may write there', () => {
    expect(buildMentionOptions(members, 'me', true, false).allowAll).toBe(false);
    expect(buildMentionOptions(members, 'me', true, true).allowAll).toBe(true);
    expect(buildMentionOptions(members, 'me', false, false).allowAll).toBe(true);
    expect(buildMentionOptions(members, 'me', true, true).memberCount).toBeNull();
  });
});

describe('detectMentionTrigger', () => {
  it('finds an @word before the caret', () => {
    expect(detectMentionTrigger('Hallo @An', 9)).toEqual({ start: 6, query: 'An' });
    expect(detectMentionTrigger('@', 1)).toEqual({ start: 0, query: '' });
  });
  it('ignores mail-like text, finished words and a caret before the @', () => {
    expect(detectMentionTrigger('a@b', 3)).toBeNull();
    expect(detectMentionTrigger('@Anna und', 9)).toBeNull();
    expect(detectMentionTrigger('Hallo @An', 4)).toBeNull();
  });
});

describe('mentionSuggestions', () => {
  const options = buildMentionOptions(members, 'me', false, true);
  it('filters people by substring and puts @alle first when it matches', () => {
    expect(mentionSuggestions(options, { start: 0, query: '' }).map((s) => s.kind)).toEqual([
      'all',
      'user',
      'user',
    ]);
    expect(mentionSuggestions(options, { start: 0, query: 'ben' })).toEqual([
      { kind: 'user', userId: B, label: 'Ben' },
    ]);
    expect(mentionSuggestions(options, { start: 0, query: 'al' })[0]).toEqual({ kind: 'all' });
  });
  it('returns nothing without a trigger', () => {
    expect(mentionSuggestions(options, null)).toEqual([]);
  });
});

describe('insertMention / serialize', () => {
  it('inserts the label, records the pick and round-trips to a token', () => {
    const trigger = detectMentionTrigger('Hi @Ann', 7)!;
    const r = insertMention(
      'Hi @Ann',
      trigger,
      { kind: 'user', userId: A, label: 'Anna Beispiel' },
      []
    );
    expect(r.text).toBe('Hi @Anna Beispiel ');
    expect(r.caret).toBe(r.text.length);
    expect(groupMentionsFromDraft(`${r.text}danke`, r.picks)).toBe(
      `Hi @[Anna Beispiel](user:${A}) danke`
    );
  });
  it('writes @alle as plain text without a pick', () => {
    const r = insertMention('@a', { start: 0, query: 'a' }, { kind: 'all' }, []);
    expect(r).toEqual({ text: '@alle ', caret: 6, picks: [] });
  });
  it('keeps text after the caret', () => {
    const r = insertMention(
      '@B mehr',
      { start: 0, query: 'B' },
      { kind: 'user', userId: B, label: 'Ben' },
      []
    );
    expect(r.text).toBe('@Ben  mehr');
  });
});

describe('pruneMentionPicks', () => {
  it('drops people whose @label is gone', () => {
    const picks = [{ userId: A, label: 'Anna' }];
    expect(pruneMentionPicks('danke', picks)).toEqual([]);
    expect(pruneMentionPicks('@Anna danke', picks)).toBe(picks);
  });
});
