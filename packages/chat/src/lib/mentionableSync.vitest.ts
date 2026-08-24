/**
 * The sync layer's endpoints, guarded as a class rather than one by one.
 *
 * Every path here is spelled for web's chat ApiClient, which has no base URL —
 * so every path must carry `/api`. Mobile's axios client owns `/api` in its
 * `baseURL` and strips the prefix back off (`useMentionablesSync`). Three paths
 * shipped without the prefix (`/auth/custom_prompts`, `/auth/saved_prompts`,
 * `/auth/notebook-collections`); they hit the SPA shell on web, and the
 * mentions they feed were silently empty. This test is the reason that cannot
 * recur unnoticed.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  syncBoards,
  syncCustomAgents,
  syncDocs,
  syncMcpServers,
  syncSheets,
  syncTextforms,
  syncUserNotebooks,
  type MentionableFetch,
} from './mentionableSync';

/** Records every requested path and answers with an empty payload of any shape. */
function recordingFetch(paths: string[]): MentionableFetch {
  return <T>(path: string): Promise<T> => {
    paths.push(path);
    return Promise.resolve({
      prompts: [],
      forms: [],
      collections: [],
      servers: [],
    } as unknown as T);
  };
}

const SYNCS: [string, (get: MentionableFetch) => Promise<unknown>][] = [
  ['syncCustomAgents', syncCustomAgents],
  ['syncTextforms', syncTextforms],
  ['syncBoards', syncBoards],
  ['syncDocs', syncDocs],
  ['syncSheets', syncSheets],
  ['syncUserNotebooks', syncUserNotebooks],
  ['syncMcpServers', syncMcpServers],
];

describe('mentionableSync endpoints', () => {
  it.each(SYNCS)('%s requests only /api-prefixed paths', async (_name, sync) => {
    const paths: string[] = [];
    await sync(recordingFetch(paths));
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path).toMatch(/^\/api\//);
    }
  });

  it('addresses the endpoints the API actually mounts', async () => {
    const paths: string[] = [];
    const get = recordingFetch(paths);
    await syncUserNotebooks(get);
    await syncCustomAgents(get);
    expect(paths).toEqual([
      '/api/auth/notebook-collections',
      '/api/auth/custom_prompts',
      '/api/auth/saved_prompts',
    ]);
  });
});

describe('syncUserNotebooks failure handling', () => {
  it('resolves to an empty list on 401 — anonymous users stay quiet', async () => {
    const get = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('Unauthorized'), { name: 'UnauthorizedError', status: 401 })
      ) as unknown as MentionableFetch;
    await expect(syncUserNotebooks(get)).resolves.toEqual([]);
  });

  it('rethrows anything else, so a wrong path cannot pass for an empty account', async () => {
    const get = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('Not Found'), { name: 'ApiError', status: 404 })
      ) as unknown as MentionableFetch;
    await expect(syncUserNotebooks(get)).rejects.toThrow('Not Found');
  });
});
