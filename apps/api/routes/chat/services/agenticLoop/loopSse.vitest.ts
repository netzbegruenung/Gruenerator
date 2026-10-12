import { describe, it, expect } from 'vitest';

import { createAnswerEmitter } from './loopSse.js';

import type { SSEWriter } from '../sseHelpers.js';

function setup() {
  const sent: Array<[string, unknown]> = [];
  const sse = { send: (event: string, data: unknown) => sent.push([event, data]) };
  const emitter = createAnswerEmitter(sse as unknown as SSEWriter);
  const narration = () => sent.filter(([e]) => e === 'gather_narration').map(([, d]) => d);
  return { emitter, narration };
}

describe('createAnswerEmitter — split-gather narration (#4460)', () => {
  it('sends held sentences live once the planner starts a tool call', () => {
    const { emitter, narration } = setup();
    emitter.handleNarration('Ich plane drei Schritte.');
    emitter.handleNarration('Ich suche im Wahlprogramm.');
    expect(narration()).toEqual([]);

    emitter.releaseNarration();

    expect(narration()).toEqual([{ text: 'Ich suche im Wahlprogramm.' }]);
    expect(emitter.takeNarration()).toBe('Ich suche im Wahlprogramm.');
  });

  it('never sends the prose of the final, tool-less step', () => {
    const { emitter, narration } = setup();
    emitter.handleNarration('Ich plane.');
    emitter.handleNarration('Ich suche.');
    emitter.releaseNarration();
    emitter.takeNarration();

    emitter.handleNarration('Die Pressemitteilung lautet:');
    emitter.handleNarration('„Das Deutschlandticket bleibt.“');

    expect(narration()).toEqual([{ text: 'Ich suche.' }]);
  });

  it('a tool that starts before the call part arrived still gets its narration', () => {
    const { emitter, narration } = setup();
    emitter.handleNarration('Ich plane.');
    emitter.handleNarration('Ich suche.');

    expect(emitter.takeNarration()).toBe('Ich suche.');
    expect(narration()).toEqual([{ text: 'Ich suche.' }]);

    emitter.releaseNarration();
    expect(narration()).toHaveLength(1);
  });
});
