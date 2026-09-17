/** jsdom lane on purpose: the flag reads window.localStorage. */
import { afterEach, describe, expect, it } from 'vitest';

import { isStreamdownRendererEnabled } from './streamdownRenderer';

afterEach(() => localStorage.removeItem('gruenerator-chat-renderer'));

describe('isStreamdownRendererEnabled', () => {
  it('defaults to the Streamdown renderer', () => {
    expect(isStreamdownRendererEnabled()).toBe(true);
  });

  it('keeps the legacy renderer reachable per browser', () => {
    localStorage.setItem('gruenerator-chat-renderer', 'legacy');
    expect(isStreamdownRendererEnabled()).toBe(false);
  });
});
