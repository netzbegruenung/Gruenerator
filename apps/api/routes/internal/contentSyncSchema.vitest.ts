/**
 * `contentSyncResultSchema` lives in `@gruenerator/contracts`, which has no
 * test runner of its own (no vitest config, no `test` script) — apps/api
 * already imports the schema and has full vitest infra, so the
 * backward-compatibility guarantee for the new `qualityFlags` field (Q4) is
 * pinned here instead of inventing test tooling in the contracts package.
 */
import { contentSyncResultSchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

const BASE_RESULT = {
  success: true as const,
  sourceId: 'landesverbaende' as const,
  name: 'Landesverbaende',
  stored: 1,
  updated: 0,
  skipped: 2,
  errors: 0,
  fetchErrors: 0,
  durationMs: 1000,
};

describe('contentSyncResultSchema — qualityFlags', () => {
  it('parses a result that carries qualityFlags', () => {
    const result = contentSyncResultSchema.parse({
      ...BASE_RESULT,
      qualityFlags: { title_fallback: 3, body_fallback: 1 },
    });

    expect(result.qualityFlags).toEqual({ title_fallback: 3, body_fallback: 1 });
  });

  it('parses a result without qualityFlags (older backend, before this field)', () => {
    const result = contentSyncResultSchema.parse(BASE_RESULT);

    expect(result.qualityFlags).toBeUndefined();
  });
});
