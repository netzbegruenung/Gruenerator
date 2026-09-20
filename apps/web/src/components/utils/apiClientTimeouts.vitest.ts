/**
 * The request-timeout policy of the web axios client.
 *
 * Before this, every request — a 2 KB `GET /auth/notebook-collections` just as
 * much as a 500 MB upload — inherited `timeout: 900000`. A socket that stalls
 * without erroring (laptop sleep, dropped Wi-Fi) therefore sat pending for 15
 * minutes before failing, which is what GlitchTip issue 613 recorded, and with
 * TanStack Query's two retries behind it a single read could stay wedged for
 * ~45 minutes.
 *
 * The rules under test are shape-based on purpose: an endpoint list would have
 * to be maintained, and the ~30 upload/download call sites in `apps/web` would
 * each have to remember to join it. FormData bodies and blob responses are
 * already visible on the config, so a new bulk route is covered on the day it
 * is written.
 */
import { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it } from 'vitest';

import apiClient, { SERVER_TASK_TIMEOUT_MS } from './apiClient';

const DEFAULT_TIMEOUT_MS = 60_000;
const BULK_TRANSFER_TIMEOUT_MS = 900_000;

/**
 * nginx caps `location /api/` at `proxy_read_timeout 300s` (see `nginx.conf`),
 * so no plain request/response through `/api/` can outlive it.
 */
const NGINX_API_READ_TIMEOUT_MS = 300_000;

let seen: AxiosRequestConfig[] = [];

beforeEach(() => {
  seen = [];
  // Capture the fully merged, post-interceptor config instead of hitting the
  // network — the widening happens in a request interceptor, so only a real
  // dispatch through the instance exercises it.
  apiClient.defaults.adapter = (config) => {
    seen.push(config);
    return Promise.resolve({
      data: {},
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    } as AxiosResponse);
  };
});

describe('apiClient request timeouts', () => {
  it('gives a plain JSON read the short default, not the bulk-transfer budget', async () => {
    await apiClient.get('/auth/notebook-collections');

    expect(seen[0]?.timeout).toBe(DEFAULT_TIMEOUT_MS);
  });

  it('widens for a FormData upload, which is bounded by payload size', async () => {
    await apiClient.post('/media/upload', new FormData());

    expect(seen[0]?.timeout).toBe(BULK_TRANSFER_TIMEOUT_MS);
  });

  it('widens for a blob download, which streams past nginx per-read timeouts', async () => {
    await apiClient.get('/share/abc/download', { responseType: 'blob' });

    expect(seen[0]?.timeout).toBe(BULK_TRANSFER_TIMEOUT_MS);
  });

  it("keeps the caller's explicit timeout on a bulk transfer — an opinion wins", async () => {
    await apiClient.post('/media/upload', new FormData(), { timeout: 5_000 });

    expect(seen[0]?.timeout).toBe(5_000);
  });

  it('leaves a non-bulk request alone even when the caller opted for longer', async () => {
    await apiClient.post('/voice/protokoll', { a: 1 }, { timeout: SERVER_TASK_TIMEOUT_MS });

    expect(seen[0]?.timeout).toBe(SERVER_TASK_TIMEOUT_MS);
  });

  it('puts the server-task budget just above nginx, so the backend 504 wins the race', () => {
    // If this ever drops below the nginx cut, a slow model call would abort
    // client-side with no status instead of surfacing the server's own error.
    expect(SERVER_TASK_TIMEOUT_MS).toBeGreaterThan(NGINX_API_READ_TIMEOUT_MS);
    expect(DEFAULT_TIMEOUT_MS).toBeLessThan(SERVER_TASK_TIMEOUT_MS);
  });
});
