import { describe, expect, it } from 'vitest';

import {
  ApiError,
  ErrorMessages,
  getErrorMessage,
  getUserFriendlyMessage,
  isApiError,
  tryCatch,
} from './errors';

describe('ApiError flags', () => {
  it('treats a missing status code as a network error', () => {
    // The whole point of the `!options?.statusCode` clause: a request that never
    // reached the server has no status, and must not be mistaken for a 4xx.
    expect(new ApiError('offline').isNetworkError).toBe(true);
  });

  it('does not treat a real HTTP status as a network error', () => {
    expect(new ApiError('nope', { statusCode: 500 }).isNetworkError).toBe(false);
  });

  it('flags an explicit NETWORK_ERROR code even when a status is present', () => {
    expect(new ApiError('flaky', { statusCode: 502, code: 'NETWORK_ERROR' }).isNetworkError).toBe(
      true
    );
  });

  it.each([401, 403])('flags %i as an auth error', (statusCode) => {
    expect(new ApiError('denied', { statusCode }).isAuthError).toBe(true);
  });

  it.each([400, 404, 500])('does not flag %i as an auth error', (statusCode) => {
    expect(new ApiError('other', { statusCode }).isAuthError).toBe(false);
  });

  it('keeps an Error cause and drops a non-Error one', () => {
    const cause = new Error('root');
    expect(new ApiError('wrapped', { cause }).cause).toBe(cause);
    expect(new ApiError('wrapped', { cause: 'just a string' }).cause).toBeUndefined();
  });

  it('is recognised by its own type guard', () => {
    expect(isApiError(new ApiError('x'))).toBe(true);
    expect(isApiError(new Error('x'))).toBe(false);
  });
});

describe('getErrorMessage', () => {
  it('falls back to a label when an Error carries an empty message', () => {
    expect(getErrorMessage(new ApiError(''))).toBe('API-Fehler');
    expect(getErrorMessage(new Error(''))).toBe('Fehler');
  });

  it('passes a plain string through', () => {
    expect(getErrorMessage('kaputt')).toBe('kaputt');
  });

  it('reads message before error on a bare object', () => {
    expect(getErrorMessage({ message: 'from message', error: 'from error' })).toBe('from message');
    expect(getErrorMessage({ error: 'from error' })).toBe('from error');
  });

  it('handles null, undefined and shapes it does not understand', () => {
    expect(getErrorMessage(null)).toBe('Ein unbekannter Fehler ist aufgetreten');
    expect(getErrorMessage(undefined)).toBe('Ein unbekannter Fehler ist aufgetreten');
    expect(getErrorMessage(42)).toBe('Ein unbekannter Fehler ist aufgetreten');
    expect(getErrorMessage({ nope: true })).toBe('Ein unbekannter Fehler ist aufgetreten');
  });
});

describe('getUserFriendlyMessage', () => {
  it('prefers the network message over the auth one when both could apply', () => {
    // A 401 with no status is impossible, but a NETWORK_ERROR-coded 401 is not —
    // and the network branch is checked first on purpose.
    const error = new ApiError('raw', { statusCode: 401, code: 'NETWORK_ERROR' });
    expect(getUserFriendlyMessage(error)).toBe(ErrorMessages.NETWORK);
  });

  it('maps auth and server statuses to their German copy', () => {
    expect(getUserFriendlyMessage(new ApiError('raw', { statusCode: 403 }))).toBe(
      ErrorMessages.AUTH_EXPIRED
    );
    expect(getUserFriendlyMessage(new ApiError('raw', { statusCode: 503 }))).toBe(
      ErrorMessages.SERVER
    );
  });

  it('keeps the raw message for a plain 4xx', () => {
    expect(getUserFriendlyMessage(new ApiError('Titel fehlt', { statusCode: 400 }))).toBe(
      'Titel fehlt'
    );
  });

  it('sniffs network wording out of a generic Error', () => {
    expect(getUserFriendlyMessage(new Error('Network request failed'))).toBe(ErrorMessages.NETWORK);
    expect(getUserFriendlyMessage(new Error('fetch aborted'))).toBe(ErrorMessages.NETWORK);
  });

  it('falls back to UNKNOWN for a non-Error', () => {
    expect(getUserFriendlyMessage({ weird: true })).toBe(ErrorMessages.UNKNOWN);
  });
});

describe('tryCatch', () => {
  it('returns the value on success', async () => {
    expect(await tryCatch(async () => 'ok')).toEqual(['ok', null]);
  });

  it('returns the original Error instance on failure', async () => {
    const boom = new Error('boom');
    const [value, error] = await tryCatch(async () => {
      throw boom;
    });
    expect(value).toBeNull();
    expect(error).toBe(boom);
  });

  it('wraps a non-Error throw into an Error', async () => {
    const [, error] = await tryCatch(async () => {
      throw 'just a string';
    });
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe('just a string');
  });
});
