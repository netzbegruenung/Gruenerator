import { groupMentionSegments } from '@gruenerator/shared/utils';
import { describe, expect, it } from 'vitest';

import { keyedMentionSegments } from './keyedMentionSegments';

describe('keyedMentionSegments', () => {
  it('keys each segment by its character offset in the text', () => {
    const keys = keyedMentionSegments('Hi @alle und @Anna!').map((s) => s.key);
    expect(keys[0]).toBe('m-0');
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('matches the offsets GroupMentionText used before', () => {
    const text = 'a @alle b';
    let offset = 0;
    const expected = groupMentionSegments(text).map((s) => {
      const key = `m-${offset}`;
      offset += s.kind === 'text' ? s.text.length : s.raw.length;
      return key;
    });
    expect(keyedMentionSegments(text).map((s) => s.key)).toEqual(expected);
  });
});
