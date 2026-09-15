/**
 * Pins the two halves of the predicate that #3318 depends on: the status has
 * to be *read* from both error shapes, and `maxRetries` has to stay a knob so
 * a caller wanting fewer attempts doesn't have to hand-roll (and lose) the
 * status check — the shadowing bug described in trap 1 of the issue.
 */
import { describe, expect, it } from 'vitest';

import { ApiError } from '@gruenerator/shared/api';

import { shouldRetryQuery } from './queryRetry';

describe('shouldRetryQuery', () => {
  it.each([401, 403, 404])('never retries an expected %i', (status) => {
    expect(shouldRetryQuery(0, new ApiError(status, 'nope'))).toBe(false);
  });

  it('reads the status off the older `response.status` shape too', () => {
    expect(shouldRetryQuery(0, { response: { status: 403 } })).toBe(false);
  });

  it('retries a 5xx up to the default of two attempts', () => {
    const error = new ApiError(500, 'boom');
    expect(shouldRetryQuery(0, error)).toBe(true);
    expect(shouldRetryQuery(1, error)).toBe(true);
    expect(shouldRetryQuery(2, error)).toBe(false);
  });

  it('retries an error with no status at all (network failure)', () => {
    expect(shouldRetryQuery(0, new Error('Network Error'))).toBe(true);
  });

  it('honours a lower maxRetries while keeping the status check', () => {
    expect(shouldRetryQuery(0, new ApiError(500, 'boom'), 1)).toBe(true);
    expect(shouldRetryQuery(1, new ApiError(500, 'boom'), 1)).toBe(false);
    // The point of the knob: fewer attempts must not mean "retry a 403".
    expect(shouldRetryQuery(0, new ApiError(403, 'denied'), 1)).toBe(false);
  });
});
