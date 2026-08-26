import { describe, expect, it } from 'vitest';

import { type Mentionable } from './mentionables';
import { pillsAfterThreadChange } from './pillLifecycle';

const tally: Mentionable = {
  type: 'tool',
  category: 'function',
  trigger: '@',
  identifier: 'mcp:fb75887f-bf1c-4369',
  title: 'Tally',
  description: '',
  avatar: '🔌',
  backgroundColor: '#4F46E5',
  mention: 'tally',
};

describe('pillsAfterThreadChange', () => {
  it('keeps a pending pill when the id flips to the draft', () => {
    // The boot/`/start` sequence: the rehydrated thread id is nulled a moment
    // after the page opens — right while the person is picking the connector.
    expect(pillsAfterThreadChange([tally], null)).toEqual([tally]);
  });

  it('clears when switching into an actual thread', () => {
    expect(pillsAfterThreadChange([tally], 'thread-abc')).toEqual([]);
  });

  it('never follows the user into a thread they switched to', () => {
    // The leak #2857 guarded against, from the other direction: pills left on a
    // draft must not ride along into a pre-existing thread opened from the
    // sidebar. That transition ends at a real id, so it clears.
    let pills = [tally];
    pills = pillsAfterThreadChange(pills, null); // user leaves a thread for the draft
    pills = pillsAfterThreadChange(pills, 'thread-fremd'); // …then opens another thread
    expect(pills).toEqual([]);
  });

  it('survives the whole /start sequence a picked connector goes through', () => {
    // rehydrated id → draft (null) → the user picks → mint on send.
    let pills = pillsAfterThreadChange([], null); // boot nulls the persisted id
    pills = [...pills, tally]; // the user picks @tally
    pills = pillsAfterThreadChange(pills, null); // switchToNewThread settles
    expect(pills).toEqual([tally]);
  });
});
