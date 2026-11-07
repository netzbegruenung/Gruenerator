import { describe, it, expect } from 'vitest';

import { createAnswerEmitter } from './loopSse.js';

import type { SSEWriter } from '../sseHelpers.js';

function setup() {
  const sent: Array<[string, unknown]> = [];
  const sse = { send: (event: string, data: unknown) => sent.push([event, data]) };
  const emitter = createAnswerEmitter(sse as unknown as SSEWriter);
  return { emitter, sent };
}

describe('createAnswerEmitter', () => {
  it('opens the response once, before the first answer delta', () => {
    const { emitter, sent } = setup();
    emitter.pushAnswer('Hallo ');
    emitter.pushAnswer('Welt.');

    expect(sent.map(([e]) => e)).toEqual(['response_start', 'text_delta', 'text_delta']);
    expect(emitter.text).toBe('Hallo Welt.');
  });

  it('replaceAndStream discards the streamed text and sends the replacement as one delta', () => {
    const { emitter, sent } = setup();
    emitter.pushAnswer('  ');
    emitter.replaceAndStream('Erledigt.');

    expect(emitter.text).toBe('Erledigt.');
    expect(sent.filter(([e]) => e === 'response_start')).toHaveLength(1);
    expect(sent.at(-1)).toEqual(['text_delta', { text: 'Erledigt.' }]);
  });
});
