/**
 * `buildSourceResult` is the pure mapping at the core of wrap-sync-result.ts's
 * `main()` (stdin/argv parsing stays imperative and untested here). Q4 adds
 * `qualityFlags`, threaded through exactly like `skipReasons`.
 */
import { describe, expect, it } from 'vitest';

import { buildSourceResult } from './wrap-sync-result.js';

describe('buildSourceResult — qualityFlags', () => {
  it('passes qualityFlags through on a successful result', () => {
    const result = buildSourceResult('landesverbaende', 200, {
      success: true,
      stored: 3,
      updated: 1,
      skipped: 2,
      errors: 0,
      qualityFlags: { title_fallback: 2, body_fallback: 1 },
    });

    expect(result.qualityFlags).toEqual({ title_fallback: 2, body_fallback: 1 });
  });

  it('omits qualityFlags when the response has none (mirrors skipReasons)', () => {
    const result = buildSourceResult('landesverbaende', 200, {
      success: true,
      stored: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
    });

    expect(result.qualityFlags).toBeUndefined();
  });

  it('omits qualityFlags on a failed result', () => {
    const result = buildSourceResult('landesverbaende', 500, { error: 'boom' });

    expect(result.qualityFlags).toBeUndefined();
  });
});
