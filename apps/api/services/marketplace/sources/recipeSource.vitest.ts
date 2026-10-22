/**
 * Rezept-Quelle: Katalog-Rezepte nur auf Wunsch (`systemRecipes`), dann nach
 * Land, Landesverband, Admin-Sperre und Plattform gefiltert; öffentliche
 * Nutzer-Rezepte immer.
 */
import {
  SKILLS,
  getSystemAgent,
  lvIdForAgentIdentifier,
  type Skill,
} from '@gruenerator/shared/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SourceQuery } from './types.js';

const m = vi.hoisted(() => ({
  listPublicTextFormListings: vi.fn(),
  loadUserRoles: vi.fn(),
  getUserLandesverbandId: vi.fn(),
  getHiddenAgentIdentifiersCached: vi.fn(),
  getEffectiveHiddenSkillMentions: vi.fn(),
  listUserLibrary: vi.fn(),
  addToUserLibrary: vi.fn(),
  removeFromUserLibrary: vi.fn(),
}));

vi.mock('../../user/textFormRepository.js', () => ({
  listPublicTextFormListings: m.listPublicTextFormListings,
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
    items: Array<{ ref: string; saved: boolean }>
  ) => {
    const saved = await source.save.has(
      ctx,
      items.map((i) => i.ref)
    );
    for (const i of items) i.saved = saved.has(i.ref);
    return items;
  },
}));

const { buildMarketplaceContext } = await import('../context.js');
const { recipeSource } = await import('./recipeSource.js');

const FORM_ID = '00000000-0000-4000-8000-0000000000cc';

const query = (o: Partial<SourceQuery> = {}): SourceQuery => ({
  origin: null,
  q: null,
  sort: 'empfohlen',
  scope: 'shop',
  offset: 0,
  limit: 500,
  systemRecipes: true,
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

const ownerLv = (mention: string) =>
  lvIdForAgentIdentifier(skills.find((s) => s.mention === mention)!.identifier);

const refs = async (c = ctx(), q = query()) =>
  (await recipeSource.list(c, q)).items.map((i) => i.ref);

const skills = SKILLS as readonly Skill[];

beforeEach(() => {
  vi.clearAllMocks();
  m.listPublicTextFormListings.mockResolvedValue([
    {
      form: {
        id: FORM_ID,
        mention: 'mein-stil',
        title: 'Mein Stil',
        description: 'Kurz und klar',
        iconKey: null,
        ownerName: 'Kim',
      },
      userId: 'viewer',
      audience: 'de-DE',
      createdAt: new Date('2026-10-01T00:00:00Z'),
    },
  ]);
  m.loadUserRoles.mockResolvedValue([]);
  m.getUserLandesverbandId.mockResolvedValue(null);
  m.getHiddenAgentIdentifiersCached.mockResolvedValue([]);
  m.getEffectiveHiddenSkillMentions.mockResolvedValue(new Set());
  m.listUserLibrary.mockResolvedValue([]);
  m.addToUserLibrary.mockResolvedValue(true);
});

describe('recipeSource.list', () => {
  it('leaves catalogue recipes out unless asked for', async () => {
    expect(await refs(ctx(), query({ systemRecipes: false }))).toEqual([FORM_ID]);
  });

  it('lists catalogue recipes as official, public rows as öffentlich', async () => {
    const page = await recipeSource.list(ctx(), query());
    expect(page.items[0]).toMatchObject({
      origin: 'offiziell',
      reportKind: null,
      recipe: { rowId: null, system: true },
    });
    expect(page.items.at(-1)).toMatchObject({
      ref: FORM_ID,
      origin: 'oeffentlich',
      reportKind: 'user_text_form',
      isOwn: true,
      authorName: 'Kim',
      recipe: { mention: 'mein-stil', rowId: FORM_ID, system: false },
    });
    expect(m.listPublicTextFormListings).toHaveBeenCalledWith('de-DE', 'viewer');
  });

  it('keeps each country’s catalogue recipes to itself', async () => {
    const at = await refs(ctx({ locale: 'de-AT' }));
    const de = await refs(ctx());
    for (const s of skills.filter((s) => s.audience === 'de-DE')) {
      expect(at).not.toContain(s.mention);
    }
    for (const s of skills.filter((s) => s.audience === 'de-AT')) {
      expect(de).not.toContain(s.mention);
    }
    expect(m.listPublicTextFormListings).toHaveBeenCalledWith('de-AT', 'viewer');
  });

  it('binds Landesverband recipes to the role', async () => {
    expect(await refs(ctx(), query({ origin: 'landesverband' }))).toEqual([]);
    m.loadUserRoles.mockResolvedValue([
      { ebene: 'land', rolle: 'Mitarbeiter*in Landesgeschäftsstelle', bundesland: 'Hessen' },
    ]);
    const lv = await recipeSource.list(ctx(), query({ origin: 'landesverband' }));
    expect(lv.items.length).toBeGreaterThan(0);
    expect(
      lv.items.every((i) => {
        const owner = skills.find((s) => s.mention === i.ref)!.identifier;
        return lvIdForAgentIdentifier(owner) === 'hessen';
      })
    ).toBe(true);
  });

  it('lists the recipes of one requested Landesverband, and none for a hidden one', async () => {
    const berlin = await refs(ctx({ lvId: 'berlin' }), query({ origin: 'landesverband' }));
    expect(berlin.length).toBeGreaterThan(0);
    expect(berlin.every((ref) => ownerLv(ref) === 'berlin')).toBe(true);
    expect(await refs(ctx({ lvId: 'hamburg' }), query({ origin: 'landesverband' }))).toEqual([]);
    expect(
      await refs(ctx({ locale: 'de-AT', lvId: 'berlin' }), query({ origin: 'landesverband' }))
    ).toEqual([]);
  });

  it('drops a recipe an admin hid', async () => {
    const [first] = await refs();
    m.getEffectiveHiddenSkillMentions.mockResolvedValue(new Set([first.toLowerCase()]));
    expect(await refs()).not.toContain(first);
  });

  it('drops recipes of webOnly agents on mobile', async () => {
    const mobile = await refs(ctx({ platform: 'mobile' }));
    for (const ref of mobile) {
      const skill = skills.find((s) => s.mention === ref);
      if (skill) expect(getSystemAgent(skill.identifier)?.webOnly).not.toBe(true);
    }
  });
});

describe('recipeSource visibility and save', () => {
  it('knows catalogue mentions even when the list leaves them out', async () => {
    const [first] = await refs();
    expect(await recipeSource.isVisible(ctx(), first)).toBe(true);
    expect(await recipeSource.isVisible(ctx(), FORM_ID)).toBe(true);
    expect(await recipeSource.isVisible(ctx(), 'gibt-es-nicht')).toBe(false);
  });

  it('only the list leaves out what a project already shares (#4699)', async () => {
    await recipeSource.list(ctx(), query());
    expect(m.listPublicTextFormListings).toHaveBeenLastCalledWith('de-DE', 'viewer');
    await recipeSource.isVisible(ctx(), FORM_ID);
    expect(m.listPublicTextFormListings).toHaveBeenLastCalledWith('de-DE', null);
  });

  it('saves under the same ref „Meine Grüneratoren" resolves', async () => {
    await recipeSource.save.add(ctx(), FORM_ID);
    expect(m.addToUserLibrary).toHaveBeenCalledWith('viewer', 'recipe', FORM_ID);
    m.listUserLibrary.mockResolvedValue([{ kind: 'recipe', ref: FORM_ID, createdAt: '' }]);
    expect(await refs(ctx(), query({ scope: 'saved' }))).toEqual([FORM_ID]);
  });
});
