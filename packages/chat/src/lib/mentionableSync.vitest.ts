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
  syncUserAgents,
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
      agents: [],
    } as unknown as T);
  };
}

const SYNCS: [string, (get: MentionableFetch) => Promise<unknown>][] = [
  ['syncCustomAgents', syncCustomAgents],
  ['syncTextforms', syncTextforms],
  ['syncUserAgents', syncUserAgents],
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

/**
 * Which endpoint an entry came from is the only origin `custom_prompts` have:
 * `/saved_prompts` lists prompts saved from someone ELSE's public prompt, so
 * they must not end up under "eigene" in the picker (#2876). Group shares do
 * not exist for this table at all (#2909).
 */
describe('syncCustomAgents origin', () => {
  const fetchWith =
    (own: unknown[], saved: unknown[]): MentionableFetch =>
    <T>(path: string): Promise<T> =>
      Promise.resolve({
        prompts: path === '/api/auth/saved_prompts' ? saved : own,
      } as unknown as T);

  it('marks saved prompts with their owner and leaves own ones unmarked', async () => {
    const merged = await syncCustomAgents(
      fetchWith(
        [{ id: 'own-1', name: 'Eigene Rede', slug: 'eigene-rede', description: null }],
        [
          {
            id: 'saved-1',
            name: 'Fremde Rede',
            slug: 'fremde-rede',
            description: null,
            owner_first_name: 'Alex',
            owner_last_name: 'Grün',
          },
        ]
      )
    );

    expect(merged).toEqual([
      { id: 'own-1', name: 'Eigene Rede', slug: 'eigene-rede' },
      { id: 'saved-1', name: 'Fremde Rede', slug: 'fremde-rede', savedFromOwner: 'Alex Grün' },
    ]);
  });

  it('still marks a saved prompt whose profile join found no name', async () => {
    const merged = await syncCustomAgents(
      fetchWith([], [{ id: 'saved-1', name: 'Fremde Rede', slug: 'fremde-rede' }])
    );
    expect(merged).toEqual([
      { id: 'saved-1', name: 'Fremde Rede', slug: 'fremde-rede', savedFromOwner: null },
    ]);
  });

  it('keeps a prompt the user owns AND saved on the own side', async () => {
    const row = { id: 'both-1', name: 'Eigene Rede', slug: 'eigene-rede' };
    const merged = await syncCustomAgents(
      fetchWith([row], [{ ...row, owner_first_name: 'Alex', owner_last_name: 'Grün' }])
    );
    expect(merged).toEqual([row]);
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

/**
 * Ein Preset reitet auf der Mention seines Systemrezepts und braucht deshalb
 * keinen eigenen Eintrag — ausser es hat keines. `antrag` steht in
 * `textFormTypeSchema`, aber in keiner `SKILLS`-Zeile; ohne eigene Erwähnung war
 * der angelernte Antrags-Stil im Chat gar nicht auswählbar (#2937).
 */
describe('syncTextforms — welche Formen zu Erwähnungen werden', () => {
  const fetchForms =
    (forms: unknown[]): MentionableFetch =>
    <T>(): Promise<T> =>
      Promise.resolve({ forms } as unknown as T);

  it('lässt Presets mit mitgeliefertem Rezept weg und nimmt eigene Formen auf', async () => {
    const list = await syncTextforms(
      fetchForms([
        { kind: 'preset', mention: 'presse', title: 'Presse', sharedFromGroup: null },
        { kind: 'preset', mention: 'instagram', title: 'Instagram', sharedFromGroup: null },
        { kind: 'recipe', mention: 'presse-bayern-partei', title: 'Bayern', sharedFromGroup: null },
        { kind: 'custom', mention: 'omveinladungen', title: 'OMV', sharedFromGroup: null },
      ])
    );
    expect(list.map((f) => f.mention)).toEqual(['omveinladungen']);
  });

  it('nimmt ein Preset ohne mitgeliefertes Rezept auf', async () => {
    const list = await syncTextforms(
      fetchForms([{ kind: 'preset', mention: 'antrag', title: 'Anträge', sharedFromGroup: null }])
    );
    expect(list).toEqual([{ mention: 'antrag', title: 'Anträge', sharedFromGroup: null }]);
  });
});

/**
 * Grünerator-Agenten sind die einzige Quelle des Rezept-Menüs, die eine
 * GRUPPENherkunft tragen kann: `custom_prompts` kennen nur öffentlich und
 * gespeichert (#2909). Fällt `sharedFromGroup` hier weg, steht der Grünerator
 * einer Kollegin unter „eigene" — genau der Fehler aus #2876.
 */
describe('syncUserAgents origin', () => {
  const fetchAgents =
    (agents: unknown[]): MentionableFetch =>
    <T>(): Promise<T> =>
      Promise.resolve({ agents } as unknown as T);

  const base = {
    title: 'Klima-Grünerator',
    description: 'Antworten zur Klimapolitik',
    avatar: '🌱',
    backgroundColor: '#316049',
  };

  it('trägt die Gruppe geteilter Agenten und lässt eigene ohne Herkunft', async () => {
    const list = await syncUserAgents(
      fetchAgents([
        { ...base, identifier: 'mein-agent', sharedFromGroup: null },
        { ...base, identifier: 'kv-agent', iconKey: 'PiLeaf', sharedFromGroup: 'KV Köln' },
      ])
    );

    expect(list).toEqual([
      { ...base, identifier: 'mein-agent', sharedFromGroup: null },
      { ...base, identifier: 'kv-agent', iconKey: 'PiLeaf', sharedFromGroup: 'KV Köln' },
    ]);
  });

  it('fragt den Endpunkt, den die API auch mountet', async () => {
    const paths: string[] = [];
    await syncUserAgents(recordingFetch(paths));
    expect(paths).toEqual(['/api/user-agents/mentionable']);
  });
});

describe('syncUserAgents failure handling', () => {
  it('resolves to an empty list on 401 — anonymous users stay quiet', async () => {
    const get = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('Unauthorized'), { name: 'UnauthorizedError', status: 401 })
      ) as unknown as MentionableFetch;
    await expect(syncUserAgents(get)).resolves.toEqual([]);
  });

  it('rethrows anything else, so a wrong path cannot pass for an empty account', async () => {
    const get = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('Not Found'), { name: 'ApiError', status: 404 })
      ) as unknown as MentionableFetch;
    await expect(syncUserAgents(get)).rejects.toThrow('Not Found');
  });
});
