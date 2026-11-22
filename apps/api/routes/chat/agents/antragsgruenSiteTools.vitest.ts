/**
 * `antragsgruen_seite_anlegen` gegen Fakes: es prüft und zeigt eine Karte,
 * angelegt wird erst nach der Bestätigung.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/pendingActionStore.js', () => ({
  pendingActionStore: { store: async () => {} },
}));

import { FormStepError } from '../../../services/webForms/formClient.js';
import { type OwnSiteReading } from '../../../services/antragsgruen/hosting/sites.js';

import {
  makeAntragsgruenAgendaTool,
  makeAntragsgruenMotionTool,
  makeAntragsgruenReadTool,
  pickSite,
  makeAntragsgruenSiteTool,
  type SiteToolDeps,
} from './antragsgruenSiteTools.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import type { SSEWriter } from '../services/sseHelpers.js';

type ToolResult = Record<string, unknown>;

function makeCtx(deps: Partial<SiteToolDeps> = {}) {
  const sseEvents: Array<[string, unknown]> = [];
  const sse = {
    send: (event: string, payload: unknown) => sseEvents.push([event, payload]),
    rendersConfirmAction: () => true,
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

describe('antragsgruen_antrag_stellen', () => {
  const SITE = {
    id: '00000000-0000-4000-8000-000000000001',
    kind: 'created' as const,
    created_at: new Date('2026-11-16'),
    subdomain: 'kv-koeln-kmv27',
    title: 'KMV Köln 2027',
    url: 'https://kv-koeln-kmv27.antragsgruen.de/kv-koeln-kmv27',
  };
  const OTHER = {
    id: '00000000-0000-4000-8000-000000000002',
    kind: 'created' as const,
    created_at: new Date('2026-11-16'),
    subdomain: 'kv-koeln-klausur27',
    title: 'Klausur 2027',
    url: 'https://kv-koeln-klausur27.antragsgruen.de/kv-koeln-klausur27',
  };
  const MOTION = {
    titel: 'Mehr Radwege',
    antragstext: 'Die KMV möge beschließen: 50 km neue Radwege.',
  };

  function motionCtx(sites: (typeof SITE)[]) {
    const sseEvents: Array<[string, unknown]> = [];
    const sse = {
      send: (e: string, p: unknown) => sseEvents.push([e, p]),
      rendersConfirmAction: () => true,
    } as unknown as SSEWriter;
    const state = { agentConfig: { userId: 'user-1' }, messages: [] } as unknown as ChatGraphState;
    const tool = makeAntragsgruenMotionTool(
      {
        state,
        sse,
        threadId: 'thread-1',
        sourceRegistry: { note: () => {} } as unknown as SourceRegistry,
      },
      { sitesOf: async () => sites }
    );
    const run = async (args: Record<string, unknown>): Promise<ToolResult> =>
      (await (tool.execute as (a: unknown, o: unknown) => Promise<ToolResult>)(args, {})) ?? {};
    return { run, sseEvents };
  }

  it('uses the only site and shows a card', async () => {
    const { run, sseEvents } = motionCtx([SITE]);
    expect((await run(MOTION)).ok).toBe(true);
    const [event, payload] = sseEvents[0] as [
      string,
      { type: string; payload: { subdomain: string } },
    ];
    expect(event).toBe('confirm_action');
    expect(payload.type).toBe('create_antragsgruen_motion');
  });

  it('refuses without an own site — foreign Antragsgrün sites are out of reach', async () => {
    const { run, sseEvents } = motionCtx([]);
    expect((await run(MOTION)).error).toMatch(/keine Antragsgrün-Seite/);
    expect(sseEvents).toHaveLength(0);
  });

  it('asks which site when there are several', async () => {
    const { run } = motionCtx([SITE, OTHER]);
    expect((await run(MOTION)).error).toMatch(/mehrere Seiten.*kv-koeln-kmv27.*kv-koeln-klausur27/);
  });

  it('rejects a site the person does not own', async () => {
    const { run } = motionCtx([SITE]);
    expect((await run({ ...MOTION, seite: 'ldk26-02' })).error).toMatch(/keine Seite der Person/);
  });
});

describe('antragsgruen_tagesordnung', () => {
  const SITE = {
    id: '00000000-0000-4000-8000-000000000001',
    kind: 'created' as const,
    created_at: new Date('2026-11-16'),
    subdomain: 'kv-koeln-kmv27',
    title: 'KMV Köln 2027',
    url: 'https://kv-koeln-kmv27.antragsgruen.de/kv-koeln-kmv27',
  };

  function agendaCtx(read = vi.fn(async () => [{ id: 1, code: '1.', title: 'Begrüßung' }])) {
    const sseEvents: Array<[string, unknown]> = [];
    const sse = {
      send: (e: string, p: unknown) => sseEvents.push([e, p]),
      rendersConfirmAction: () => true,
    } as unknown as SSEWriter;
    const state = { agentConfig: { userId: 'user-1' }, messages: [] } as unknown as ChatGraphState;
    const tool = makeAntragsgruenAgendaTool(
      {
        state,
        sse,
        threadId: 'thread-1',
        sourceRegistry: { note: () => {} } as unknown as SourceRegistry,
      },
      { sitesOf: async () => [SITE], readAgenda: read }
    );
    const run = async (args: Record<string, unknown>): Promise<ToolResult> =>
      (await (tool.execute as (a: unknown, o: unknown) => Promise<ToolResult>)(args, {})) ?? {};
    return { run, sseEvents, read };
  }

  it('reads the agenda when no items are given, without a card', async () => {
    const { run, sseEvents, read } = agendaCtx();
    const out = await run({});
    expect(read).toHaveBeenCalledWith('user-1', 'kv-koeln-kmv27');
    expect(out.punkte).toEqual([{ code: '1.', titel: 'Begrüßung' }]);
    expect(sseEvents).toHaveLength(0);
  });

  it('shows a replace card when items are given', async () => {
    const { run, sseEvents, read } = agendaCtx();
    const out = await run({
      punkte: [
        { code: '1.', titel: 'Begrüßung' },
        { titel: 'Anträge', antraege: true },
      ],
    });
    expect(out.ok).toBe(true);
    expect(read).not.toHaveBeenCalled();
    const [, payload] = sseEvents[0] as [string, { type: string; details?: { value: string }[] }];
    expect(payload.type).toBe('set_antragsgruen_agenda');
    // Ohne Codes nummeriert der Grünerator selbst.
    expect(JSON.stringify(payload)).toContain('1. Begrüßung');
  });
});

describe('pickSite', () => {
  const site = (subdomain: string) => ({
    id: subdomain,
    kind: 'connected' as const,
    created_at: new Date(0),
    subdomain,
    title: subdomain.toUpperCase(),
    url: `https://${subdomain}.antragsgruen.de/${subdomain}`,
  });

  it('points to the settings when there is no site', () => {
    expect(pickSite([], undefined)).toEqual({ error: expect.stringMatching(/Einstellungen/) });
  });

  it('takes the only site, or the named one, and asks when several fit', () => {
    expect(pickSite([site('a')], undefined)).toEqual({ site: site('a') });
    expect(pickSite([site('a'), site('b')], ' B ')).toEqual({ site: site('b') });
    expect(pickSite([site('a'), site('b')], undefined)).toEqual({
      error: expect.stringMatching(/mehrere Seiten/),
    });
    expect(pickSite([site('a')], 'c')).toEqual({ error: expect.stringMatching(/keine Seite/) });
  });
});

describe('antragsgruen_seite_lesen', () => {
  const SITE = {
    id: '00000000-0000-4000-8000-000000000003',
    kind: 'connected' as const,
    created_at: new Date('2026-11-18'),
    subdomain: 'kv-anna',
    title: 'KMV Anna 2027',
    url: 'https://kv-anna.antragsgruen.de/kv-anna',
  };
  const REF = {
    id: 4,
    prefix: 'A1',
    title: 'Busse',
    status: 'Eingereicht (ungeprüft)',
    url: 'https://kv-anna.antragsgruen.de/kv-anna/Busse-44156',
  };

  function readCtx(read: (u: string, s: string, a: string | null) => Promise<OwnSiteReading>) {
    const notes: string[] = [];
    const state = { agentConfig: { userId: 'user-1' }, messages: [] } as unknown as ChatGraphState;
    const tool = makeAntragsgruenReadTool(
      {
        state,
        sse: { send: () => {}, rendersConfirmAction: () => true } as unknown as SSEWriter,
        threadId: 'thread-1',
        sourceRegistry: {
          note: (n: { content?: string }) => notes.push(String(n.content ?? '')),
        } as unknown as SourceRegistry,
      },
      { sitesOf: async () => [SITE], read: vi.fn(read) }
    );
    const run = async (args: Record<string, unknown>): Promise<ToolResult> =>
      (await (tool.execute as (a: unknown, o: unknown) => Promise<ToolResult>)(args, {})) ?? {};
    return { run, notes };
  }

  it('lists the motions without an antrag', async () => {
    const { run } = readCtx(async (_u, _s, antrag) => {
      expect(antrag).toBeNull();
      return { kind: 'list', motions: [REF] };
    });
    expect((await run({})).antraege).toEqual([
      { nummer: 'A1', titel: 'Busse', status: 'Eingereicht (ungeprüft)' },
    ]);
  });

  it('returns the text with line marks and the amendment form', async () => {
    const { run } = readCtx(async () => ({
      kind: 'motion',
      motion: {
        ...REF,
        sections: [{ title: 'Antragstext', text: '[Z. 1] Mehr Busse.' }],
        lineNumbers: true,
        amendmentFormUrl: `${REF.url}/amendment/create`,
      },
    }));
    const out = await run({ antrag: 'A1' });
    expect(out.text).toBe('## Antragstext\n\n[Z. 1] Mehr Busse.');
    expect(out.zeilennummern).toBe(true);
    expect(out.hinweis).toBeUndefined();
    expect(out.aenderungsantrag_formular).toBe(`${REF.url}/amendment/create`);
  });

  it('says when the page shows no line numbers', async () => {
    const { run } = readCtx(async () => ({
      kind: 'motion',
      motion: { ...REF, sections: [], lineNumbers: false, amendmentFormUrl: 'x' },
    }));
    expect((await run({ antrag: 'A1' })).hinweis).toMatch(/keine Zeilennummern/);
  });

  it('names what exists when the antrag is not found', async () => {
    const { run } = readCtx(async () => ({ kind: 'not-found', motions: [REF] }));
    expect((await run({ antrag: 'Radwege' })).error).toMatch(/Vorhanden: A1 Busse/);
  });

  it('refuses once the person is no admin', async () => {
    const { run } = readCtx(async () => {
      throw new FormStepError('x', 'not-admin');
    });
    expect((await run({})).error).toMatch(
      /nicht mehr Admin; der Grünerator handelt dort nicht mehr/
    );
  });
});
