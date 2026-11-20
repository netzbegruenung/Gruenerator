import { initClient } from '@ts-rest/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setGlobalApiClient } from './client.js';
import { getContractsClient, resetContractsClient } from './contractsClient.js';

import type { AxiosInstance } from 'axios';

vi.mock('@ts-rest/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@ts-rest/core')>();
  return { ...original, initClient: vi.fn(original.initClient) };
});

const initClientMock = vi.mocked(initClient);

function fakeAxios(data: unknown = []): AxiosInstance {
  return {
    request: () => Promise.resolve({ status: 200, data, headers: {} }),
  } as unknown as AxiosInstance;
}

describe('lazy contracts client', () => {
  beforeEach(() => {
    resetContractsClient();
    initClientMock.mockClear();
    setGlobalApiClient(fakeAxios());
  });

  it('builds no ts-rest client until a route is called', () => {
    const client = getContractsClient();
    void client.threads;
    void client.threads.list;

    expect(initClientMock).not.toHaveBeenCalled();
  });

  it('initialises a namespace on its first route call, once', async () => {
    const client = getContractsClient();

    const first = await client.threads.list({ query: {} });
    expect(first.status).toBe(200);
    expect(initClientMock).toHaveBeenCalledTimes(1);

    await client.threads.list({ query: {} });
    await Promise.all([client.threads.list({ query: {} }), client.threads.list({ query: {} })]);
    expect(initClientMock).toHaveBeenCalledTimes(1);

    await client.userAgents.list();
    expect(initClientMock).toHaveBeenCalledTimes(2);
  });

  it('shares one load between concurrent first calls', async () => {
    const client = getContractsClient();

    await Promise.all([client.userAgents.list(), client.userAgents.list()]);

    expect(initClientMock).toHaveBeenCalledTimes(1);
  });

  it('hands the same proxy out for the same property, so it is stable as a dependency', () => {
    const client = getContractsClient();

    expect(getContractsClient()).toBe(client);
    expect(client.threads.list).toBe(client.threads.list);
  });

  it('is not a thenable and has no symbol keys, so awaiting it does not hang', async () => {
    const client = getContractsClient();

    expect((client.threads as unknown as { then?: unknown }).then).toBeUndefined();
    expect(await Promise.resolve(client.threads)).toBe(client.threads);
    expect((client.threads as unknown as Record<symbol, unknown>)[Symbol.iterator]).toBeUndefined();
  });

  it('rejects, rather than throws synchronously, for a name that is no route', async () => {
    const client = getContractsClient();
    const missing = (client.threads as unknown as Record<string, () => Promise<unknown>>)['nope']!;

    await expect(missing()).rejects.toThrow(/threads\.nope is not a route/);
  });

  it('turns response validation on only for the validated namespaces', async () => {
    const client = getContractsClient();

    await client.threads.list({ query: {} });
    await client.sharesRead.recentShares({ query: {} }).catch(() => null);

    const validate = (index: number) =>
      (initClientMock.mock.calls[index]?.[1] as { validateResponse?: boolean } | undefined)
        ?.validateResponse;
    expect(validate(0)).toBeUndefined();
    expect(validate(1)).toBe(true);
  });

  it('starts over after resetContractsClient()', async () => {
    await getContractsClient().threads.list({ query: {} });
    resetContractsClient();
    await getContractsClient().threads.list({ query: {} });

    expect(initClientMock).toHaveBeenCalledTimes(2);
  });

  it('forgets a failed load so the next call can retry', async () => {
    initClientMock.mockImplementationOnce(() => {
      throw new Error('chunk failed');
    });
    const client = getContractsClient();

    await expect(client.threads.list({ query: {} })).rejects.toThrow('chunk failed');
    const retry = await client.threads.list({ query: {} });

    expect(retry.status).toBe(200);
  });
});
