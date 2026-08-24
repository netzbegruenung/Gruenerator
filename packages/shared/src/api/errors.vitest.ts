import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { describe, it, expect } from 'vitest';

import { createApiClient } from './client';
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

/**
 * `isUnauthorizedError` was written for the raw-fetch stacks, which throw the
 * `UnauthorizedError` above. Mobile's mentionable sync now runs it against a
 * real `AxiosError` instead, and that only matches because axios copies the
 * response status onto the error (`this.status = response.status` in the
 * AxiosError constructor, reached via `settle()`). That is an axios internal,
 * not a documented contract — so pin it here rather than assume it survives the
 * next bump. A version that stops setting `.status` turns every mobile 401 into
 * a thrown query instead of a quiet empty list.
 */
describe('isUnauthorizedError against a real AxiosError', () => {
  /**
   * Answers every request the way a real adapter does on an HTTP error: reject
   * with `new AxiosError(..., response)`, which is what `settle()` constructs.
   * The client's own response interceptor runs on top, so this covers the whole
   * path a mobile 401 actually takes.
   */
  function clientFailingWith(status: number) {
    const client = createApiClient({ baseURL: 'http://localhost/api', authMode: 'bearer' });
    client.defaults.adapter = (config: InternalAxiosRequestConfig) =>
      Promise.reject(
        new AxiosError(
          `Request failed with status code ${status}`,
          status >= 400 && status < 500 ? AxiosError.ERR_BAD_REQUEST : AxiosError.ERR_BAD_RESPONSE,
          config,
          {},
          { status, statusText: '', data: null, headers: {}, config }
        )
      );
    return client;
  }

  async function failureFrom(status: number): Promise<unknown> {
    return clientFailingWith(status)
      .get('/auth/notebook-collections')
      .then(
        () => null,
        (err: unknown) => err
      );
  }

  it('recognises a 401 carried by an AxiosError', async () => {
    const caught = await failureFrom(401);

    expect((caught as { name?: string }).name).toBe('AxiosError');
    expect((caught as { status?: number }).status).toBe(401);
    expect(isUnauthorizedError(caught)).toBe(true);
  });

  it('does not claim a 404 — a wrong path must stay visible', async () => {
    const caught = await failureFrom(404);

    expect((caught as { status?: number }).status).toBe(404);
    expect(isUnauthorizedError(caught)).toBe(false);
  });
});
