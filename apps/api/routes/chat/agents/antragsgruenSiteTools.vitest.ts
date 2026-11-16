/**
 * `antragsgruen_seite_anlegen` gegen Fakes: es prüft und zeigt eine Karte,
 * angelegt wird erst nach der Bestätigung.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/pendingActionStore.js', () => ({
  pendingActionStore: { store: async () => {} },
}));

import { makeAntragsgruenSiteTool, type SiteToolDeps } from './antragsgruenSiteTools.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import type { SSEWriter } from '../services/sseHelpers.js';

type ToolResult = Record<string, unknown>;

function makeCtx(deps: Partial<SiteToolDeps> = {}) {
  const sseEvents: Array<[string, unknown]> = [];
  const sse = {
    send: (event: string, payload: unknown) => sseEvents.push([event, payload]),
  } as unknown as SSEWriter;
  const state = {
    agentConfig: { userId: 'user-1' },
    messages: [],
  } as unknown as ChatGraphState;
  const sourceRegistry = { note: () => {} } as unknown as SourceRegistry;
  const full: SiteToolDeps = {
    host: 'antragsgruen.de',
    isAvailable: vi.fn(async () => true),
    sitesOrderedBy: vi.fn(async () => 0),
    hasInviteeEmail: vi.fn(async () => true),
    ...deps,
  };
  const tool = makeAntragsgruenSiteTool({ state, sse, threadId: 'thread-1', sourceRegistry }, full);
  const run = async (args: Record<string, unknown>): Promise<ToolResult> =>
    (await (tool.execute as (a: unknown, o: unknown) => Promise<ToolResult>)(args, {})) ?? {};
  return { run, sseEvents, deps: full };
}

const ARGS = { title: 'KMV Köln 2027', organization: 'GRÜNE KV Köln', subdomain: 'KV-Koeln-27' };

describe('antragsgruen_seite_anlegen', () => {
  it('emits a confirm card with the normalised address and asks nothing of Antragsgrün beyond the check', async () => {
    const { run, sseEvents, deps } = makeCtx();
    const out = await run(ARGS);
    expect(out.ok).toBe(true);
    expect(deps.isAvailable).toHaveBeenCalledWith('kv-koeln-27');
    const [event, payload] = sseEvents[0] as [string, { type: string; payload?: unknown }];
    expect(event).toBe('confirm_action');
    expect(payload.type).toBe('create_antragsgruen_site');
  });

  it('rejects an address Antragsgrün would not take, before asking it', async () => {
    const { run, sseEvents, deps } = makeCtx();
    const out = await run({ ...ARGS, subdomain: 'kv köln' });
    expect(out.error).toMatch(/geht nicht als Adresse/);
    expect(deps.isAvailable).not.toHaveBeenCalled();
    expect(sseEvents).toHaveLength(0);
  });

  it('reports a taken address instead of showing a card', async () => {
    const { run, sseEvents } = makeCtx({ isAvailable: vi.fn(async () => false) });
    expect((await run(ARGS)).error).toMatch(/schon vergeben/);
    expect(sseEvents).toHaveLength(0);
  });

  it('stops at the per-person limit', async () => {
    const { run, sseEvents } = makeCtx({ sitesOrderedBy: vi.fn(async () => 3) });
    expect((await run(ARGS)).error).toMatch(/schon 3/);
    expect(sseEvents).toHaveLength(0);
  });

  it('needs an email address on the account to invite to', async () => {
    const { run } = makeCtx({ hasInviteeEmail: vi.fn(async () => false) });
    expect((await run(ARGS)).error).toMatch(/keine gültige E-Mail-Adresse/);
  });

  it('says so when antragsgruen.de cannot be reached', async () => {
    const { run } = makeCtx({
      isAvailable: vi.fn(async () => {
        throw new Error('timeout');
      }),
    });
    expect((await run(ARGS)).error).toMatch(/nicht erreichbar/);
  });
});
