import { sharesReadContract } from '@gruenerator/contracts';
import { initClient } from '@ts-rest/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { getRecentShares } from '../share/api/shareApi.js';

import { setGlobalApiClient } from './client.js';

import type { AxiosInstance } from 'axios';

/**
 * The mobile Studio tab died with `undefined is not a function` because
 * `/api/share/recent` shipped `createdAt: {}` — the API's `toCamelCase` rebuilt
 * every `Date` as an empty object — and nothing between the HTTP response and
 * `Array.sort` had an opinion about the shape. `{}` has no `localeCompare`.
 *
 * These tests pin the two halves of the fix that make such a response fail with
 * a name, at the boundary:
 *   1. the response schema describes the row instead of `z.array(z.unknown())`
 *   2. the shares client actually runs it (`validateResponse: true`)
 *
 * The last test is the control: it rebuilds the same call with validation off
 * and shows the bad payload sailing through. Without both halves of the change,
 * the first test would pass just as quietly.
 */

const validRow = {
  id: 'row-1',
  shareToken: 'tok-1',
  mediaType: 'image',
  title: 'Ein Bild',
  thumbnailPath: null,
  fileSize: '1024',
  duration: null,
  imageType: 'pure-create',
  imageMetadata: {},
  status: 'ready',
  downloadCount: 0,
  createdAt: '2026-08-13T10:00:00.000Z',
  contentOrigin: 'ki',
};

function bodyWith(rows: unknown[]) {
  return { success: true, shares: rows, count: rows.length, limit: 20 };
}

/** Minimal stand-in for the shared axios instance the ts-rest fetcher bridges to. */
function fakeAxios(body: unknown): AxiosInstance {
  return {
    request: () => Promise.resolve({ status: 200, data: body, headers: {} }),
  } as unknown as AxiosInstance;
}

describe('recent shares are validated at the client boundary', () => {
  beforeEach(() => {
    setGlobalApiClient(fakeAxios(bodyWith([validRow])));
  });

  it('accepts the shape the endpoint actually returns', async () => {
    const result = await getRecentShares(20);

    expect(result.shares).toHaveLength(1);
    expect(result.shares[0]?.createdAt).toBe('2026-08-13T10:00:00.000Z');
  });

  // The regression itself.
  it('rejects a mangled timestamp instead of passing it to the render', async () => {
    setGlobalApiClient(fakeAxios(bodyWith([{ ...validRow, createdAt: {} }])));

    await expect(getRecentShares(20)).rejects.toThrow(ZodError);
  });

  it('names the offending field, which the crash never did', async () => {
    setGlobalApiClient(fakeAxios(bodyWith([{ ...validRow, createdAt: {} }])));

    const error = await getRecentShares(20).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ZodError);
    expect((error as ZodError).issues[0]?.path).toEqual(['shares', 0, 'createdAt']);
  });

  it('rejects a row missing a required column', async () => {
    const { shareToken: _dropped, ...withoutToken } = validRow;
    setGlobalApiClient(fakeAxios(bodyWith([withoutToken])));

    await expect(getRecentShares(20)).rejects.toThrow(ZodError);
  });

  /**
   * Control. Same contract, same payload, validation off — exactly the client
   * this repo had before. It resolves, and `createdAt` arrives as `{}`: proof
   * that the tests above are held up by the change and not by something that
   * was already there.
   */
  it('would have let the crash through with validation off', async () => {
    const unvalidated = initClient(sharesReadContract, {
      baseUrl: '',
      api: () =>
        Promise.resolve({
          status: 200,
          body: bodyWith([{ ...validRow, createdAt: {} }]),
          headers: new Headers(),
        }),
    });

    const res = await unvalidated.recentShares({ query: { limit: '20' } });

    expect(res.status).toBe(200);
    expect((res.body as { shares: { createdAt: unknown }[] }).shares[0]?.createdAt).toEqual({});
  });
});
