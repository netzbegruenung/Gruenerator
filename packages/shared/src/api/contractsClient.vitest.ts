import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it } from 'vitest';

import { setGlobalApiClient } from './client.js';
import { getContractsClient, resetContractsClient } from './contractsClient.js';

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
 * bridge must reject it as the network error it is.
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
    setGlobalApiClient(fakeAxios(0));

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
