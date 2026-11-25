import { describe, expect, it, vi } from 'vitest';

import { type Mentionable } from './mentionables';
import { onMentionRequest, requestMention } from './mentionRequest';

const recipe = (mention: string) =>
  ({ mention, category: 'skill', type: 'agent', identifier: mention }) as Mentionable;

describe('mentionRequest', () => {
  it('delivers straight to a mounted composer', () => {
    const listener = vi.fn();
    const off = onMentionRequest(listener);
    requestMention(recipe('presse'));
    off();
    expect(listener).toHaveBeenCalledWith(recipe('presse'));
  });

  it('holds a request until the next composer subscribes (deep link before mount)', () => {
    requestMention(recipe('presse'));
    const listener = vi.fn();
    const off = onMentionRequest(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(recipe('presse'));
    off();

    // Consumed once: a composer mounting later gets nothing.
    const later = vi.fn();
    onMentionRequest(later)();
    expect(later).not.toHaveBeenCalled();
  });

  it('keeps only the latest held request', () => {
    requestMention(recipe('a'));
    requestMention(recipe('b'));
    const listener = vi.fn();
    onMentionRequest(listener)();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(recipe('b'));
  });
});
