/**
 * Agent-Quelle: offizieller Katalog über `selectOfficialCatalog` (Land,
 * Landesverband, Admin-Sperre, Plattform) plus öffentliche Nutzer-Agents. Ob
 * eine moderierte Zeile aus der öffentlichen Liste fällt, prüft
 * `marketplaceService.db.vitest.ts` gegen die echte Abfrage.
 */
import {
  getVisibleSystemAgentsForLocale,
  isLandesverbandIdentifier,
  lvIdForAgentIdentifier,
} from '@gruenerator/shared/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SourceQuery } from './types.js';

const m = vi.hoisted(() => ({
  listPublicUserAgentListings: vi.fn(),
  listUserAgents: vi.fn(),
  loadUserRoles: vi.fn(),
  getUserLandesverbandId: vi.fn(),
  getHiddenAgentIdentifiersCached: vi.fn(),
  getEffectiveHiddenSkillMentions: vi.fn(),
  listUserLibrary: vi.fn(),
  addToUserLibrary: vi.fn(),
  removeFromUserLibrary: vi.fn(),
  likes: new Map<string, number>(),
}));

vi.mock('../../userAgents/userAgentsRepository.js', () => ({
  listPublicUserAgentListings: m.listPublicUserAgentListings,
  listUserAgents: m.listUserAgents,
}));
vi.mock('../../roles/userRoles.js', () => ({ loadUserRoles: m.loadUserRoles }));
vi.mock('../../landesverband/LandesverbandDerivationService.js', () => ({
  getUserLandesverbandId: m.getUserLandesverbandId,
}));
vi.mock('../../agents/AdminHiddenAgentsService.js', () => ({
  getHiddenAgentIdentifiersCached: m.getHiddenAgentIdentifiersCached,
}));
vi.mock('../../skills/AdminHiddenSkillsService.js', () => ({
  getEffectiveHiddenSkillMentions: m.getEffectiveHiddenSkillMentions,
}));
vi.mock('../../user/userLibraryService.js', () => ({
  listUserLibrary: m.listUserLibrary,
  addToUserLibrary: m.addToUserLibrary,
  removeFromUserLibrary: m.removeFromUserLibrary,
}));
vi.mock('../enrich.js', () => ({
  enrichItems: async (
    ctx: unknown,
    source: { save: { has: (c: unknown, r: string[]) => Promise<Set<string>> } },
    items: Array<{ ref: string; likesCount: number; saved: boolean }>
  ) => {
    const saved = await source.save.has(
      ctx,
      items.map((i) => i.ref)
    );
    for (const i of items) {
      i.likesCount = m.likes.get(i.ref) ?? 0;
      i.saved = saved.has(i.ref);
    }
    return items;
  },
}));

const { buildMarketplaceContext } = await import('../context.js');
const { agentSource } = await import('./agentSource.js');

const USER_AGENT_ID = '00000000-0000-4000-8000-0000000000aa';
const OWN_AGENT_ID = '00000000-0000-4000-8000-0000000000bb';

const listing = (id: string, userId: string, identifier: string, createdAt: string) => ({
  agent: {
    id,
    identifier,
    title: `Agent ${identifier}`,
    description: 'Hilft bei Anträgen',
    author: 'Kim',
    locale: 'de-DE',
    iconKey: 'PiSparkle',
  },
  userId,
  createdAt: new Date(createdAt),
});

const query = (o: Partial<SourceQuery> = {}): SourceQuery => ({
  origin: null,
  q: null,
  sort: 'empfohlen',
  scope: 'shop',
  offset: 0,
  limit: 500,
  systemRecipes: false,
  ...o,
});

const ctx = (o: { locale?: string; platform?: 'web' | 'mobile'; lvId?: string } = {}) =>
  buildMarketplaceContext({
    userId: 'viewer',
    locale: o.locale ?? 'de-DE',
    platform: o.platform ?? 'web',
    instanceId: 'production',
    ...(o.lvId !== undefined ? { lvId: o.lvId } : {}),
  });

const HESSEN_ROLE = {
  ebene: 'land',
  rolle: 'Mitarbeiter*in Landesgeschäftsstelle',
  bundesland: 'Hessen',
};

beforeEach(() => {
  vi.clearAllMocks();
  m.likes.clear();
  m.listPublicUserAgentListings.mockResolvedValue([
    listing(USER_AGENT_ID, 'someone', 'antragshelfer', '2026-10-01T00:00:00Z'),
  ]);
  m.listUserAgents.mockResolvedValue([]);
  m.loadUserRoles.mockResolvedValue([]);
  m.getUserLandesverbandId.mockResolvedValue(null);
  m.getHiddenAgentIdentifiersCached.mockResolvedValue([]);
  m.getEffectiveHiddenSkillMentions.mockResolvedValue(new Set());
  m.listUserLibrary.mockResolvedValue([]);
  m.addToUserLibrary.mockResolvedValue(true);
});

const refs = async (c = ctx(), q = query()) =>
  (await agentSource.list(c, q)).items.map((i) => i.ref);

describe('agentSource.list', () => {
  it('lists official agents first, then the public user agents of the viewer’s country', async () => {
    const page = await agentSource.list(ctx(), query());
    const official = getVisibleSystemAgentsForLocale('de-DE', 'production').filter(
      (a) => !isLandesverbandIdentifier(a.identifier)
    );
    expect(page.items.slice(0, official.length).map((i) => i.ref)).toEqual(
      official.map((a) => a.identifier)
    );
    expect(page.items.at(-1)).toMatchObject({
      ref: USER_AGENT_ID,
      origin: 'oeffentlich',
      reportKind: 'user_agent',
      isOwn: false,
      authorName: 'Kim',
      audience: 'de-DE',
      agent: { identifier: 'antragshelfer', slug: USER_AGENT_ID, isUserAgent: true },
    });
    expect(page.items[0]).toMatchObject({ origin: 'offiziell', reportKind: null });
    expect(m.listPublicUserAgentListings).toHaveBeenCalledWith('viewer', 'de-DE', 'viewer');
  });

  it('serves an Austrian viewer only Austrian and shared official agents', async () => {
    const page = await agentSource.list(ctx({ locale: 'de-AT' }), query());
    expect(m.listPublicUserAgentListings).toHaveBeenCalledWith('viewer', 'de-AT', 'viewer');
    const official = page.items.filter((i) => i.origin !== 'oeffentlich');
    expect(official.length).toBeGreaterThan(0);
    expect(official.every((i) => i.audience === 'all' || i.audience === 'de-AT')).toBe(true);
    const deOnly = getVisibleSystemAgentsForLocale('de-DE', 'production').filter(
      (a) => a.audience === 'de-DE'
    );
    for (const a of deOnly) expect(official.map((i) => i.ref)).not.toContain(a.identifier);
  });

  it('shows no Landesverband without the role, and only the own one with it', async () => {
    const without = await agentSource.list(ctx(), query({ origin: 'landesverband' }));
    expect(without.items).toEqual([]);

    m.loadUserRoles.mockResolvedValue([HESSEN_ROLE]);
    const withRole = await agentSource.list(ctx(), query({ origin: 'landesverband' }));
    expect(withRole.items.length).toBeGreaterThan(0);
    expect(withRole.items.every((i) => lvIdForAgentIdentifier(i.ref) === 'hessen')).toBe(true);
  });

  it('lists one requested Landesverband, with or without its role', async () => {
    const berlin = await agentSource.list(
      ctx({ lvId: 'berlin' }),
      query({ origin: 'landesverband' })
    );
    expect(berlin.items.length).toBeGreaterThan(0);
    expect(berlin.items.every((i) => lvIdForAgentIdentifier(i.ref) === 'berlin')).toBe(true);

    // The role of another Landesverband does not widen the page.
    m.loadUserRoles.mockResolvedValue([HESSEN_ROLE]);
    const stillBerlin = await agentSource.list(
      ctx({ lvId: 'berlin' }),
      query({ origin: 'landesverband' })
    );
    expect(stillBerlin.items.map((i) => i.ref)).toEqual(berlin.items.map((i) => i.ref));
  });

  it('lists nothing for an unknown, switched-off or foreign-country Landesverband', async () => {
    m.loadUserRoles.mockResolvedValue([HESSEN_ROLE]);
    const lvRefs = (c: ReturnType<typeof ctx>) => refs(c, query({ origin: 'landesverband' }));
    expect(await lvRefs(ctx({ lvId: 'atlantis' }))).toEqual([]);
    // Hamburg switched its notebook off (`enabled: false`).
    expect(await lvRefs(ctx({ lvId: 'hamburg' }))).toEqual([]);
    expect(await lvRefs(ctx({ lvId: 'oesterreich' }))).toEqual([]);
    expect(await lvRefs(ctx({ locale: 'de-AT', lvId: 'berlin' }))).toEqual([]);
    expect((await lvRefs(ctx({ locale: 'de-AT', lvId: 'oesterreich' }))).length).toBeGreaterThan(0);
  });

  it('drops an agent an admin hid', async () => {
    const [first] = await refs();
    m.getHiddenAgentIdentifiersCached.mockResolvedValue([first]);
    expect(await refs()).not.toContain(first);
  });

  it('drops webOnly agents on mobile', async () => {
    const page = await agentSource.list(ctx({ platform: 'mobile' }), query());
    const webOnly = getVisibleSystemAgentsForLocale('de-DE', 'production')
      .filter((a) => a.webOnly === true)
      .map((a) => a.identifier);
    for (const id of webOnly) expect(page.items.map((i) => i.ref)).not.toContain(id);
  });

  it('filters by origin and search text, and pages', async () => {
    expect(await refs(ctx(), query({ origin: 'oeffentlich' }))).toEqual([USER_AGENT_ID]);
    expect(await refs(ctx(), query({ q: 'ANTRAGS' }))).toEqual([USER_AGENT_ID]);
    const all = await refs();
    const page = await agentSource.list(ctx(), query({ offset: 1, limit: 2 }));
    expect(page.items.map((i) => i.ref)).toEqual(all.slice(1, 3));
    expect(page.hasMore).toBe(true);
  });

  it('beliebt ranks by likes, neu by age', async () => {
    m.listPublicUserAgentListings.mockResolvedValue([
      listing(USER_AGENT_ID, 'someone', 'alt', '2026-01-01T00:00:00Z'),
      listing(OWN_AGENT_ID, 'viewer', 'neu', '2026-10-01T00:00:00Z'),
    ]);
    m.likes.set(USER_AGENT_ID, 5);
    expect((await refs(ctx(), query({ sort: 'beliebt' })))[0]).toBe(USER_AGENT_ID);
    expect((await refs(ctx(), query({ sort: 'neu' })))[0]).toBe(OWN_AGENT_ID);
  });

  it('saved scope lists what „Meine Grüneratoren" holds, own agents by identifier', async () => {
    m.listPublicUserAgentListings.mockResolvedValue([
      listing(OWN_AGENT_ID, 'viewer', 'mein-agent', '2026-10-01T00:00:00Z'),
    ]);
    m.listUserAgents.mockResolvedValue([{ id: OWN_AGENT_ID, identifier: 'mein-agent' }]);
    const [first] = await refs();
    m.listUserLibrary.mockResolvedValue([
      { kind: 'agent', ref: first, createdAt: '' },
      { kind: 'agent', ref: 'mein-agent', createdAt: '' },
    ]);
    const page = await agentSource.list(ctx(), query({ scope: 'saved' }));
    expect(page.items.map((i) => i.ref)).toEqual([first, OWN_AGENT_ID]);
    expect(page.items.find((i) => i.ref === OWN_AGENT_ID)?.isOwn).toBe(true);
  });
});

describe('agentSource visibility and save', () => {
  it('knows official and public refs, nothing else', async () => {
    const [first] = await refs();
    expect(await agentSource.isVisible(ctx(), first)).toBe(true);
    expect(await agentSource.isVisible(ctx(), USER_AGENT_ID)).toBe(true);
    expect(await agentSource.isVisible(ctx(), 'gibt-es-nicht')).toBe(false);
  });

  it('gets one visible item with its likes, and null for anything else', async () => {
    m.likes.set(USER_AGENT_ID, 3);
    const item = await agentSource.get(ctx(), USER_AGENT_ID);
    expect(item).toMatchObject({ kind: 'agent', ref: USER_AGENT_ID, likesCount: 3 });
    expect(m.listPublicUserAgentListings).toHaveBeenLastCalledWith('viewer', 'de-DE', null);
    expect(await agentSource.get(ctx(), 'gibt-es-nicht')).toBeNull();
  });

  it('resolves a Landesverband agent without its role, but not a switched-off one', async () => {
    const berlinAgent = 'gruenerator-buergeranfragen-berlin';
    expect(await refs(ctx(), query({ origin: 'landesverband' }))).toEqual([]);
    expect(await agentSource.isVisible(ctx(), berlinAgent)).toBe(true);
    expect(await agentSource.get(ctx(), berlinAgent)).toMatchObject({ origin: 'landesverband' });
    expect(await agentSource.isVisible(ctx(), 'gruenerator-buergeranfragen-hamburg')).toBe(false);
    expect(await agentSource.isVisible(ctx({ locale: 'de-AT' }), berlinAgent)).toBe(false);
  });

  it('only the list leaves out what a project already shares (#4699)', async () => {
    await agentSource.list(ctx(), query());
    expect(m.listPublicUserAgentListings).toHaveBeenLastCalledWith('viewer', 'de-DE', 'viewer');
    await agentSource.isVisible(ctx(), USER_AGENT_ID);
    expect(m.listPublicUserAgentListings).toHaveBeenLastCalledWith('viewer', 'de-DE', null);
  });

  it('stores an own agent under its identifier, a foreign one under its uuid', async () => {
    m.listUserAgents.mockResolvedValue([{ id: OWN_AGENT_ID, identifier: 'mein-agent' }]);
    await agentSource.save.add(ctx(), OWN_AGENT_ID);
    await agentSource.save.add(ctx(), USER_AGENT_ID);
    expect(m.addToUserLibrary).toHaveBeenNthCalledWith(1, 'viewer', 'agent', 'mein-agent');
    expect(m.addToUserLibrary).toHaveBeenNthCalledWith(2, 'viewer', 'agent', USER_AGENT_ID);
  });

  it('reports a full library', async () => {
    m.addToUserLibrary.mockResolvedValue(false);
    expect(await agentSource.save.add(ctx(), USER_AGENT_ID)).toBe('full');
  });
});
