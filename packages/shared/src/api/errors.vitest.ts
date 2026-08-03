import { describe, it, expect } from 'vitest';

import { ApiError, isApiErrorWithStatus, isUnauthorizedError, UnauthorizedError } from './errors';

/**
 * Callers branch on the status to tell "this is gone" (404 — drop the local
 * reference) from "the server hiccuped" (5xx — keep it and retry). Collapsing
 * both into a generic Error made an outage look like deleted data.
 */

describe('ApiError', () => {
  it('keeps the status alongside the message', () => {
    const err = new ApiError(503, 'Service Unavailable');

    expect(err.status).toBe(503);
    expect(err.message).toBe('Service Unavailable');
    expect(err.name).toBe('ApiError');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('isApiErrorWithStatus', () => {
  it('matches the requested status', () => {
    expect(isApiErrorWithStatus(new ApiError(404, 'Not found'), 404)).toBe(true);
  });

  it('does not match a different status — a 500 is not a deleted thread', () => {
    expect(isApiErrorWithStatus(new ApiError(500, 'Boom'), 404)).toBe(false);
  });

  it('matches across module realms via duck typing', () => {
    // The shared package ships under dual src/dist conditions, so `instanceof`
    // can miss the other realm's class (see UnauthorizedError's note).
    expect(isApiErrorWithStatus({ name: 'ApiError', status: 404 }, 404)).toBe(true);
  });

  it('is safe on non-errors', () => {
    expect(isApiErrorWithStatus(null, 404)).toBe(false);
    expect(isApiErrorWithStatus(undefined, 404)).toBe(false);
    expect(isApiErrorWithStatus('Not found', 404)).toBe(false);
    expect(isApiErrorWithStatus(new Error('Not found'), 404)).toBe(false);
  });
});

describe('isUnauthorizedError alongside ApiError', () => {
  it('still recognises the dedicated 401 class', () => {
    expect(isUnauthorizedError(new UnauthorizedError())).toBe(true);
  });

  it('treats an ApiError(401) as unauthorized too', () => {
    expect(isUnauthorizedError(new ApiError(401, 'Unauthorized'))).toBe(true);
  });

  it('does not claim an unrelated failure', () => {
    expect(isUnauthorizedError(new ApiError(500, 'Boom'))).toBe(false);
  });
});
