import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApiClient, setGlobalApiClient } from './client.js';
import {
  getContractsClient,
  resetContractsClient,
  SERVER_TASK_TIMEOUT_MS,
} from './contractsClient.js';

import type { AxiosInstance } from 'axios';

/**
 * GlitchTip #576: "Grüneratoren konnten nicht geladen werden." reported from a
 * page that was reloading itself after a stale-deploy chunk failure. The reload
 * aborted the in-flight `/api/user-agents` XHR, which ended with status 0 — and
 * axios `settle()` *resolves* a response whose status is falsy without ever
 * consulting `validateStatus`. The bridge handed `{ status: 0 }` to the query,
 * which treats every non-200 as a generic failure and threw a plain Error with
 * no status and no code, so the global handler could not recognise it as a
 * network drop and reported it.
 *
 * Status 0 is not an HTTP status and appears in no contract's response map; the
 * shared client's success interceptor rejects it as the network error it is,
 * before the bridge ever sees it.
 */
function fakeAxios(status: number, data: unknown = ''): AxiosInstance {
  return {
    request: () => Promise.resolve({ status, data, headers: {} }),
  } as unknown as AxiosInstance;
}

describe('contracts bridge and aborted requests', () => {
  beforeEach(() => {
    resetContractsClient();
  });

  it('rejects a status-0 response as an axios network error', async () => {
    const client = createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' });
    client.defaults.adapter = (config) =>
      Promise.resolve({ status: 0, statusText: '', data: '', headers: {}, config });
    setGlobalApiClient(client);

    const error = await getContractsClient()
      .userAgents.list()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AxiosError);
    expect((error as AxiosError).code).toBe(AxiosError.ERR_NETWORK);
  });

  it('still hands real error statuses to the caller unchanged', async () => {
    setGlobalApiClient(fakeAxios(500, { error: 'boom' }));

    const res = await getContractsClient().userAgents.list();

    expect(res.status).toBe(500);
  });
});

// 06.10.2026: an infographic draft (two model calls plus a FLUX 3 image) ran past
// the 60s default and the browser aborted it while the server finished the work.
describe('contracts bridge and long server tasks', () => {
  beforeEach(() => {
    resetContractsClient();
  });

  function recordingAxios(seen: { timeout?: number }[]): AxiosInstance {
    return {
      request: (config: { timeout?: number }) => {
        seen.push(config);
        return Promise.resolve({ status: 502, data: { error: 'x' }, headers: {} });
      },
    } as unknown as AxiosInstance;
  }

  it('gives a route marked serverTask the server-task timeout', async () => {
    const seen: { timeout?: number }[] = [];
    setGlobalApiClient(recordingAxios(seen));

    await getContractsClient().sharepicCreator.draft({ body: { prompt: 'Infografik zu Mieten' } });

    expect(seen[0]?.timeout).toBe(SERVER_TASK_TIMEOUT_MS);
  });

  it('leaves every other route on the instance default', async () => {
    const seen: { timeout?: number }[] = [];
    setGlobalApiClient(recordingAxios(seen));

    await getContractsClient().userAgents.list();

    expect(seen[0]?.timeout).toBeUndefined();
  });
});
