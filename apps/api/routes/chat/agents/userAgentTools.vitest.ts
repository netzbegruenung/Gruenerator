/**
 * `user_agents` gegen ein erfundenes Repository — kein Postgres, kein Qdrant,
 * kein Modellaufruf. Alles kommt über `ctx.deps` herein, wie bei
 * `recurringTaskTools.vitest.ts`.
 */
import { describe, expect, it, vi } from 'vitest';

import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import {
  AGENT_CREATION_CLOSED,
  makeUserAgentsTool,
  type UserAgentToolDeps,
} from './userAgentTools.js';

// `emitToolConfirmAction` legt die Karte in Redis ab; ohne erreichbares Redis
// antwortet der Client nie. Gemockt wird nur der Speicher, die Karte samt
// `CONFIRM_ACTION_CONFIG`-Eintrag bleibt echt — und der Speicher-Spy zeigt,
// welcher Body an `executeAction` ginge.
const stored = vi.hoisted(() => vi.fn<(action: unknown) => Promise<void>>(async () => {}));
vi.mock('../services/pendingActionStore.js', () => ({
  pendingActionStore: { store: (action: unknown) => stored(action) },
}));

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { NotebookCollection } from '../../../database/services/NotebookQdrantHelper.js';
import type { UserGroupRow } from '../../../services/groups/groupQueries.js';
import type {
  MentionableUserAgentRow,
  UserAgentRecord,
  UserAgentSharing,
} from '../../../services/userAgents/userAgentsRepository.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import type { SSEWriter } from '../services/sseHelpers.js';
import type { Agent } from '@gruenerator/shared/agents';

type ToolResult = Record<string, unknown>;

const LONG_ROLE = `Du bist die Pressestelle des Kreisverbands. ${'Du schreibst klar, freundlich und faktenbasiert. '.repeat(30)}`;

function agent(over: Partial<UserAgentRecord> = {}): UserAgentRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    identifier: 'presse-kv-ab12cd',
    title: 'Presse KV',
    description: 'Schreibt Pressemitteilungen für den Kreisverband.',
    systemRole: LONG_ROLE,
    avatar: '✨',
    backgroundColor: '#316049',
    tags: [],
    model: 'mistral-medium-2604',
    provider: 'mistral',
    params: { max_tokens: 3000, temperature: 0.5 },
    openingMessage: 'Hallo!',
    openingQuestions: [],
    locale: 'de-DE',
    author: 'Eigener Grünerator-Agent',
    enabledTools: ['search', 'web'],
    skillMentions: ['presse'],
    defaultNotebookIds: ['nb-1'],
    ...over,
  };
}

function mentionable(over: Partial<MentionableUserAgentRow> = {}): MentionableUserAgentRow {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    identifier: 'presse-kv-ab12cd',
    title: 'Presse KV',
    description: 'Schreibt Pressemitteilungen für den Kreisverband.',
    avatar: '✨',
    backgroundColor: '#316049',
    sharedFromGroup: null,
    ...over,
  };
}

function notebook(over: Partial<NotebookCollection> = {}): NotebookCollection {
  return { id: 'nb-1', user_id: 'user-1', name: 'Kommunalpolitik' } as NotebookCollection;
}

const member = (over: Partial<UserGroupRow> = {}): UserGroupRow => ({
  id: 'g1',
  name: 'Klima-AG',
  slug_suffix: null,
  role: 'member',
  member_count: 3,
  ...over,
});

interface CtxOptions {
  userId?: string | null;
  threadId?: string | null;
  /** Was `getUserAgent` liefert — `null` = fremder oder fehlender Agent. */
  own?: UserAgentRecord | null;
  mentionable?: MentionableUserAgentRow[];
  sharing?: UserAgentSharing | null;
  notebooks?: NotebookCollection[];
  recipes?: string[];
  groups?: UserGroupRow[];
  registry?: SourceRegistry;
  userText?: string;
  userLocale?: 'de-DE' | 'de-AT';
}

function makeCtx(opts: CtxOptions = {}) {
  const notes: Array<[string, string]> = [];
  const registered: unknown[] = [];
  const sseEvents: Array<[string, unknown]> = [];
  const sourceRegistry =
    opts.registry ??
    ({
      note: (title: string, content: string) => notes.push([title, content]),
      register: (results: unknown) => {
        registered.push(results);
        return '[1] Auszug';
      },
    } as unknown as SourceRegistry);
  const sse = {
    send: (event: string, payload: unknown) => sseEvents.push([event, payload]),
    rendersConfirmAction: () => true,
  } as unknown as SSEWriter;
  const state = {
    agentConfig: { userId: opts.userId === undefined ? 'user-1' : opts.userId },
    messages: opts.userText ? [{ role: 'user', content: opts.userText }] : [],
    userLocale: opts.userLocale ?? 'de-DE',
    userRoles: [],
  } as unknown as ChatGraphState;

  const own = opts.own === undefined ? agent() : opts.own;
  const deps: UserAgentToolDeps = {
    getUserAgent: vi.fn(async () => own ?? undefined),
    updateUserAgent: vi.fn(async (_u, _id, patch) =>
      own ? agent({ ...own, ...(patch as Partial<Agent>) }) : undefined
    ),
    deleteUserAgent: vi.fn(async () => own != null),
    listMentionableUserAgents: vi.fn(async () => opts.mentionable ?? []),
    getAgentSharing: vi.fn(async () =>
      opts.sharing === undefined
        ? {
            id: 'uuid-1',
            share_mode: 'private' as const,
            audience: 'de-DE' as const,
            is_public: false,
            public_ownership: null,
            moderation: 'ok' as const,
          }
        : (opts.sharing ?? undefined)
    ),
    getNotebookCollectionsByIds: vi.fn(async (ids: string[]) =>
      (opts.notebooks ?? [notebook()]).filter((n) => ids.includes(n.id))
    ),
    recipeCatalog: vi.fn(async () =>
      (opts.recipes ?? ['presse', 'newsletter', 'instagram']).map((mention) => ({
        key: mention,
        mention,
        title: mention,
        description: '',
        source: 'system' as const,
        origin: 'system' as const,
        id: null,
        ownerName: null,
      }))
    ),
    findGroups: vi.fn(async () => opts.groups ?? [member()]),
  };
  const tool = makeUserAgentsTool({
    state,
    sse,
    threadId: opts.threadId === undefined ? 'thread-1' : opts.threadId,
    sourceRegistry,
    deps,
  });
  const run = async (args: Record<string, unknown>): Promise<ToolResult> =>
    (await (tool.execute as (a: unknown, o: unknown) => Promise<ToolResult>)(
      { limit: 15, confirm: false, ...args },
      {}
    )) ?? {};
  return { run, notes, registered, sseEvents, deps };
}

const CREATE_ARGS = {
  action: 'create',
  brief: 'Ein Agent, der jede Woche den Newsletter des Ortsverbands schreibt.',
};

describe('user_agents: list', () => {
  it('refuses without a session', async () => {
    const { run } = makeCtx({ userId: null });
    expect(await run({ action: 'list' })).toMatchObject({
      error: expect.stringMatching(/Sitzung/),
    });
  });

  it('maps own and shared agents to rows with the identifier as ref', async () => {
    const { run, registered } = makeCtx({
      mentionable: [
        mentionable(),
        mentionable({
          identifier: 'wahlkampf-xy',
          title: 'Wahlkampf-Helfer',
          sharedFromGroup: 'Klima-AG',
        }),
      ],
    });
    const out = (await run({ action: 'list' })) as {
      resultCount: number;
      results: Array<{ title: string; url: string; type: string; ref?: string; snippet?: string }>;
    };
    expect(out.resultCount).toBe(2);
    expect(out.results[0]).toMatchObject({
      title: 'Presse KV',
      url: '/agents/presse-kv-ab12cd',
      type: 'Grünerator-Agent',
      ref: 'presse-kv-ab12cd',
    });
    expect(out.results[1].snippet).toContain('geteilt aus Projekt „Klima-AG"');
    expect(registered).toHaveLength(1);
  });

  it('grounds the empty case as a note pointing to recipes', async () => {
    const { run, notes, registered } = makeCtx();
    expect(await run({ action: 'list' })).toMatchObject({ resultCount: 0 });
    expect(notes[0][1]).toContain('Rezepte');
    expect(registered).toHaveLength(0);
  });
});

describe('user_agents: get', () => {
  it('needs an identifier', async () => {
    const { run } = makeCtx();
    expect(await run({ action: 'get' })).toMatchObject({
      error: expect.stringMatching(/identifier/),
    });
  });

  it('returns the own agent with a shortened role, labels, notebooks and visibility', async () => {
    const { run, registered } = makeCtx();
    const out = (await run({ action: 'get', identifier: 'presse-kv-ab12cd' })) as {
      agent: Record<string, unknown>;
    };
    expect(out.agent).toMatchObject({
      identifier: 'presse-kv-ab12cd',
      title: 'Presse KV',
      roleTruncated: true,
      toolLabels: 'Grünerator-Wissen, Websuche & Recherche',
      skillMentions: ['presse'],
      notebooks: [{ id: 'nb-1', name: 'Kommunalpolitik' }],
      shareModeLabel: 'Privat',
      readOnly: false,
      url: '/agents/presse-kv-ab12cd',
    });
    expect((out.agent.role as string).length).toBeLessThanOrEqual(600);
    const block = (registered[0] as Array<{ content: string }>)[0].content;
    expect(block).toContain('Rolle (gekürzt): Du bist die Pressestelle');
    expect(block).toContain('Notebooks: Kommunalpolitik');
  });

  it('shows a shared agent read-only and WITHOUT its role', async () => {
    const { run, registered } = makeCtx({
      own: null,
      mentionable: [
        mentionable({
          identifier: 'wahlkampf-xy',
          title: 'Wahlkampf',
          sharedFromGroup: 'Klima-AG',
        }),
      ],
    });
    const out = (await run({ action: 'get', identifier: 'wahlkampf-xy' })) as {
      agent: Record<string, unknown>;
    };
    expect(out.agent).toMatchObject({ readOnly: true, sharedFromGroup: 'Klima-AG' });
    expect(out.agent).not.toHaveProperty('role');
    const block = (registered[0] as Array<{ content: string }>)[0].content;
    expect(block).not.toContain('Rolle:');
    expect(block).toContain('nur benutzbar');
  });

  it("links a shared agent by its id, since its identifier may be someone else's too", async () => {
    const shared = mentionable({
      id: '44444444-4444-4444-8444-444444444444',
      identifier: 'wahlkampf-xy',
      title: 'Wahlkampf',
      sharedFromGroup: 'Klima-AG',
    });
    const { run } = makeCtx({ own: null, mentionable: [shared] });

    const listed = (await run({ action: 'list' })) as {
      results: Array<{ url: string; ref?: string }>;
    };
    expect(listed.results[0]).toMatchObject({ url: `/agents/${shared.id}`, ref: shared.id });

    const out = (await run({ action: 'get', identifier: shared.id })) as {
      agent: Record<string, unknown>;
    };
    expect(out.agent).toMatchObject({
      identifier: shared.id,
      readOnly: true,
      url: `/agents/${shared.id}`,
    });
  });

  it('errors on an agent the person neither owns nor was given', async () => {
    const { run } = makeCtx({ own: null });
    expect(await run({ action: 'get', identifier: 'fremd' })).toMatchObject({
      error: expect.stringMatching(/nicht gefunden/),
    });
  });
});

describe('user_agents: parteiinterne Grenze — System-Grüneratoren bleiben unsichtbar', () => {
  it.each(['get', 'update', 'share_to_group', 'delete'])(
    '%s refuses the gruenerator- namespace before touching any repository',
    async (action) => {
      const { run, deps } = makeCtx();
      const out = await run({
        action,
        identifier: 'gruenerator-oeffentlichkeitsarbeit',
        title: 'x',
        groupName: 'Klima-AG',
        confirm: true,
      });
      expect(out).toMatchObject({ error: expect.stringMatching(/System-Grünerator/) });
      expect(out).not.toHaveProperty('agent');
      expect(deps.getUserAgent).not.toHaveBeenCalled();
      expect(deps.listMentionableUserAgents).not.toHaveBeenCalled();
      expect(deps.updateUserAgent).not.toHaveBeenCalled();
      expect(deps.deleteUserAgent).not.toHaveBeenCalled();
    }
  );

  it('has no path to the registry: the deps carry only user-scoped repository functions', () => {
    const { deps } = makeCtx();
    expect(Object.keys(deps).sort()).toEqual([
      'deleteUserAgent',
      'findGroups',
      'getAgentSharing',
      'getNotebookCollectionsByIds',
      'getUserAgent',
      'listMentionableUserAgents',
      'recipeCatalog',
      'updateUserAgent',
    ]);
  });
});

// Agents laufen aus (11/2026): weder create noch duplicate legen noch etwas
// an — keine Karte, kein Entwurf, nur der Grund samt Verweis auf Rezepte.
describe('user_agents: neue Agents sind geschlossen', () => {
  it('create nennt den Grund und zeigt keine Karte', async () => {
    stored.mockClear();
    const { run, sseEvents } = makeCtx();
    expect(await run(CREATE_ARGS)).toEqual({ error: AGENT_CREATION_CLOSED });
    expect(sseEvents).toEqual([]);
    expect(stored).not.toHaveBeenCalled();
  });

  it('duplicate kopiert auch einen eigenen Agent nicht mehr', async () => {
    stored.mockClear();
    const { run, sseEvents } = makeCtx();
    expect(await run({ action: 'duplicate', identifier: 'presse-kv-ab12cd' })).toEqual({
      error: AGENT_CREATION_CLOSED,
    });
    expect(sseEvents).toEqual([]);
    expect(stored).not.toHaveBeenCalled();
  });

  it('verweist auf Rezepte', () => {
    expect(AGENT_CREATION_CLOSED).toMatch(/Rezept/);
  });
});

describe('user_agents: update (direct, owner-scoped)', () => {
  it('needs at least one field', async () => {
    const { run } = makeCtx();
    expect(await run({ action: 'update', identifier: 'presse-kv-ab12cd' })).toMatchObject({
      error: expect.stringMatching(/mindestens/),
    });
  });

  it('passes the validated patch through and reports the changes', async () => {
    const { run, deps, notes } = makeCtx();
    const out = await run({
      action: 'update',
      identifier: 'presse-kv-ab12cd',
      title: 'Presse KV Nord',
      systemRole: 'Du bist die Pressestelle Nord.',
      enabledTools: ['search'],
      defaultNotebookIds: [],
    });
    expect(out).toMatchObject({ ok: true, url: '/agents/presse-kv-ab12cd' });
    expect(deps.updateUserAgent).toHaveBeenCalledWith('user-1', 'presse-kv-ab12cd', {
      title: 'Presse KV Nord',
      systemRole: 'Du bist die Pressestelle Nord.',
      enabledTools: ['search'],
      defaultNotebookIds: [],
    });
    expect(notes[0][1]).toContain('heißt jetzt „Presse KV Nord"');
    expect(notes[0][1]).toContain('Werkzeuge Grünerator-Wissen');
  });

  it('validates tools, recipes and notebooks', async () => {
    const { run, deps } = makeCtx();
    expect(
      await run({ action: 'update', identifier: 'presse-kv-ab12cd', enabledTools: ['nope'] })
    ).toMatchObject({ error: expect.stringMatching(/Unbekannte Werkzeuge/) });
    expect(
      await run({ action: 'update', identifier: 'presse-kv-ab12cd', skillMentions: ['nope'] })
    ).toMatchObject({ error: expect.stringMatching(/Unbekannte Rezepte/) });
    expect(
      await run({ action: 'update', identifier: 'presse-kv-ab12cd', defaultNotebookIds: ['x'] })
    ).toMatchObject({ error: expect.stringMatching(/Notebook nicht gefunden/) });
    expect(deps.updateUserAgent).not.toHaveBeenCalled();
  });

  it('a shared agent is read-only: update on it is "nicht gefunden", nothing is written', async () => {
    const { run, deps } = makeCtx({
      own: null,
      mentionable: [mentionable({ identifier: 'wahlkampf-xy', sharedFromGroup: 'Klima-AG' })],
    });
    expect(
      await run({ action: 'update', identifier: 'wahlkampf-xy', title: 'Meins jetzt' })
    ).toMatchObject({ error: expect.stringMatching(/gehört dir nicht/) });
    expect(deps.updateUserAgent).not.toHaveBeenCalled();
  });

  it('refuses when the message rules out changes', async () => {
    const { run, deps } = makeCtx({ userText: 'Keine Aktion, nur erklären.' });
    expect(
      await run({ action: 'update', identifier: 'presse-kv-ab12cd', title: 'x' })
    ).toMatchObject({ error: expect.stringMatching(/schließt/) });
    expect(deps.updateUserAgent).not.toHaveBeenCalled();
  });
});

describe('user_agents: share_to_group (card)', () => {
  it('needs a groupName', async () => {
    const { run } = makeCtx();
    expect(await run({ action: 'share_to_group', identifier: 'presse-kv-ab12cd' })).toMatchObject({
      error: expect.stringMatching(/groupName/),
    });
  });

  it('ignores public groups the person is not a member of', async () => {
    const { run, sseEvents } = makeCtx({ groups: [member({ role: '' })] });
    expect(
      await run({ action: 'share_to_group', identifier: 'presse-kv-ab12cd', groupName: 'Klima' })
    ).toMatchObject({ error: expect.stringMatching(/dem du angehörst/) });
    expect(sseEvents).toHaveLength(0);
  });

  it('emits the card keyed by the agent UUID, not the identifier', async () => {
    stored.mockClear();
    const { run, sseEvents } = makeCtx();
    const out = await run({
      action: 'share_to_group',
      identifier: 'presse-kv-ab12cd',
      groupName: 'Klima',
    });
    expect(out).toMatchObject({ ok: true, needsConfirmation: true });
    const [, payload] = sseEvents[0] as [string, { type: string; metadata: unknown[] }];
    expect(payload.type).toBe('share_user_agent');
    expect(payload.metadata).toEqual([
      { key: 'Grünerator-Agent', value: 'Presse KV' },
      { key: 'Projekt', value: 'Klima-AG' },
      { key: 'Berechtigung', value: 'Benutzen, nicht bearbeiten' },
    ]);
    const pending = stored.mock.calls[0][0] as { payload: Record<string, unknown> };
    expect(pending.payload).toEqual({
      identifier: 'presse-kv-ab12cd',
      agentTitle: 'Presse KV',
      agentId: 'uuid-1',
      groupId: 'g1',
      groupName: 'Klima-AG',
    });
  });

  it('cannot share an agent that was shared TO the person', async () => {
    const { run, sseEvents } = makeCtx({ own: null });
    expect(
      await run({ action: 'share_to_group', identifier: 'wahlkampf-xy', groupName: 'Klima' })
    ).toMatchObject({ error: expect.stringMatching(/gehört dir nicht/) });
    expect(sseEvents).toHaveLength(0);
  });
});

describe('user_agents: delete (two-step)', () => {
  it('asks first', async () => {
    const { run, deps } = makeCtx();
    expect(await run({ action: 'delete', identifier: 'presse-kv-ab12cd' })).toMatchObject({
      needsConfirmation: true,
      note: expect.stringMatching(/confirm=true/),
    });
    expect(deps.deleteUserAgent).not.toHaveBeenCalled();
  });

  it('deletes with confirm=true', async () => {
    const { run, deps } = makeCtx();
    expect(
      await run({ action: 'delete', identifier: 'presse-kv-ab12cd', confirm: true })
    ).toMatchObject({ ok: true, note: expect.stringMatching(/gelöscht/) });
    expect(deps.deleteUserAgent).toHaveBeenCalledWith('user-1', 'presse-kv-ab12cd');
  });

  it('owner-miss is an error, not a silent no-op', async () => {
    const { run, deps } = makeCtx({ own: null });
    expect(await run({ action: 'delete', identifier: 'fremd', confirm: true })).toMatchObject({
      error: expect.stringMatching(/nicht gefunden/),
    });
    expect(deps.deleteUserAgent).not.toHaveBeenCalled();
  });
});

/**
 * Gegen die ECHTE Registry: wo `renderAll()` den Text hinschreibt und was
 * der Schreiber im split-Modus davon sieht — er liest nur diesen Block.
 */
describe('was der Schreiber im split-Modus wirklich sieht', () => {
  it('puts the agent list into the citable sources', async () => {
    const registry = createSourceRegistry();
    const { run } = makeCtx({ registry, mentionable: [mentionable()] });
    await run({ action: 'list' });
    expect(registry.size).toBe(1);
    const block = registry.renderAll();
    expect(block).toContain('Presse KV');
    expect(block).toContain('Grünerator-Agent');
    expect(block).not.toContain('VORGÄNGE IN DIESEM TURN');
  });

  it('puts the agent details into the sources, with the shortened role', async () => {
    const registry = createSourceRegistry();
    const { run } = makeCtx({ registry });
    await run({ action: 'get', identifier: 'presse-kv-ab12cd' });
    expect(registry.freshSize).toBe(1);
    const block = registry.renderAll();
    expect(block).toContain('Rolle (gekürzt): Du bist die Pressestelle');
    expect(block).toContain('Werkzeuge: Grünerator-Wissen, Websuche & Recherche');
  });

  it('reports the card request as a VORGANG, so the writer does not claim the share happened', async () => {
    const registry = createSourceRegistry();
    const { run } = makeCtx({ registry });
    await run({ action: 'share_to_group', identifier: 'presse-kv-ab12cd', groupName: 'Klima' });
    expect(registry.freshSize).toBe(0);
    const block = registry.renderAll();
    expect(block).toContain('VORGÄNGE IN DIESEM TURN');
    expect(block).toContain('Bestätigung zum Teilen');
  });
});
