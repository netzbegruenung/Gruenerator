import { describe, it, expect } from 'vitest';

import { buildToolUsageBlock } from './agenticRespondService.js';

describe('buildToolUsageBlock', () => {
  const block = buildToolUsageBlock(6);

  it('states the step budget', () => {
    expect(block).toContain('maximal 6 Schritte');
  });

  it('forbids answering factual follow-ups from unverified history (long-thread tool loss)', () => {
    // Regression: "Und die FDP?" after a bundestag turn answered from history
    // with zero tool calls. The prompt must require a fresh tool call.
    expect(block).toMatch(/KEINE belegte Quelle/i);
    expect(block).toMatch(/ERNEUTEN Tool-Aufruf/i);
    expect(block).toContain('Und die FDP?');
  });

  it('no longer blanket-permits skipping tools for "einfache Folgefrage"', () => {
    expect(block).not.toContain('einfache Folgefrage');
  });
});
