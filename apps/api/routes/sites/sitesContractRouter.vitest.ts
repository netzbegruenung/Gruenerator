import {
  richTextDocFromPlainText,
  SITE_SOCIAL_LINKS_MAX,
  siteDraftFromSite,
  type Site,
} from '@gruenerator/contracts';
import { encodeSiteSeed } from '@gruenerator/contracts/site-ydoc';
import { type SQL } from 'drizzle-orm';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

const queryMock = vi.fn();
const executeMock = vi.fn();
type Access =
  | { role: 'admin' | 'editor' | 'viewer'; groupId: string | null; creatorId: string | null }
  | 'not_found'
  | 'forbidden';
const RANK = { viewer: 1, editor: 2, admin: 3 } as const;
/** What the role resolver answers for the site; a test sets it, `requireSiteRole` applies `min`. */
const access = vi.hoisted(() => ({
  current: null as Access | null,
}));
const requireSiteRoleMock = vi.hoisted(() =>
  vi.fn(async (_site: string, _user: string, min: 'admin' | 'editor' | 'viewer') => {
    const a = access.current;
    if (typeof a === 'string') return a;
    if (!a) return 'not_found' as const;
    return RANK[a.role] >= RANK[min] ? a : ('forbidden' as const);
  })
);
const getSiteRoleMock = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<string | null>>());
const resolvePublishLocaleMock = vi.hoisted(() =>
  vi.fn<(...a: unknown[]) => Promise<'de-DE' | 'de-AT'>>()
);
const entitledMock = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<boolean>>());
const hocuspocusInternal = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<unknown>>());
const hocuspocusInternalOrNull = vi.hoisted(() =>
  vi.fn<(...a: unknown[]) => Promise<unknown | null>>()
);
const closeCollabRooms = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<void>>());
const envMock = vi.hoisted(() => ({ SITES_HOST: 'grsites.de' as string | undefined, PORT: 3001 }));

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: queryMock }),
}));
vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({
    execute: executeMock,
    transaction: (fn: (tx: { execute: typeof executeMock }) => Promise<unknown>) =>
      fn({ execute: executeMock }),
  }),
}));
vi.mock('../../services/collab/hocuspocusInternal.js', () => ({
  hocuspocusInternal,
  hocuspocusInternalOrNull,
  closeCollabRooms,
}));
vi.mock('../../config/env.js', () => ({ env: envMock }));
vi.mock('../../services/sites/siteAccess.js', () => ({
  requireSiteRole: requireSiteRoleMock,
  getSiteRole: getSiteRoleMock,
}));
const members = vi.hoisted(() => ({
  listSiteMembers: vi.fn(),
  setSiteMemberRole: vi.fn(),
  removeSiteMember: vi.fn(),
}));
const shares = vi.hoisted(() => ({
  addGroupShare: vi.fn(),
  removeGroupShare: vi.fn(),
  GroupShareForbiddenError: class GroupShareForbiddenError extends Error {},
}));
vi.mock('../../services/sites/siteMembers.js', () => members);
vi.mock('../../services/groups/groupShareWriter.js', () => shares);
vi.mock('../../services/sites/publishLocale.js', () => ({
  resolvePublishLocale: resolvePublishLocaleMock,
}));
vi.mock('../../services/user/sitesEntitlement.js', () => ({
  isUserSitesEntitled: entitledMock,
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SITE_ID = '33333333-3333-4333-8333-333333333333';
const GROUP_ID = '44444444-4444-4444-8444-444444444444';

const { sitesContractRouter } = await import('./sitesContractRouter.js');

type Handler = (args: unknown) => Promise<{ status: number; body: Record<string, any> }>;
const router = sitesContractRouter as unknown as Record<string, Handler>;

const call = (name: string, args: Record<string, unknown>, locale?: string) =>
  router[name]({ req: { user: { id: USER_ID }, locale }, ...args });

const publish = (value: boolean, opts: { locale?: string } = {}) =>
  call('publishSite', { params: { id: SITE_ID }, body: { publish: value } }, opts.locale);
const update = (body: Record<string, unknown>) =>
  call('updateSite', { params: { id: SITE_ID }, body });
const create = (body: Record<string, unknown>) => call('createSite', { body });
const check = (subdomain: string) => call('checkSubdomain', { query: { subdomain } });

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: SITE_ID,
    user_id: USER_ID,
    subdomain: 'anna',
    is_published: false,
    site_title: 'Anna Beispiel',
    tagline: null,
    contact_email: 'anna@example.org',
    contact_phone: null,
    contact_website: null,
    social_links: {},
    theme: 'gruene',
    accent_color: '#46962b',
    profile_image: null,
    background_image: null,
    sections: {},
    created_at: new Date('2026-11-19T10:00:00Z'),
    updated_at: new Date('2026-11-19T10:00:00Z'),
    deleted_at: null,
    last_published: null,
    visit_count: 0,
    meta_description: null,
    meta_keywords: null,
    published_snapshot: null,
    legal: {
      name: 'Anna Beispiel',
      street: 'Hauptstraße 1',
      postal_code: '10115',
      city: 'Berlin',
      email: 'anna@example.org',
    },
    moderation: 'ok',
    ...overrides,
  };
}
// drizzle's raw `execute` returns timestamptz as strings, unlike `db.query`.
const rawRow = (overrides: Record<string, unknown> = {}) =>
  row({
    created_at: '2026-11-19 10:20:36.123+00',
    updated_at: '2026-11-19 10:20:36.123+00',
    ...overrides,
  });
const validRow = () => row();

const validCreate = () => ({ subdomain: 'anna-berlin', site_title: 'Anna' });
const pgUnique = (constraint: string) =>
  new DrizzleQueryError(
    'INSERT INTO user_sites',
    [],
    Object.assign(new Error('duplicate key'), { code: '23505', constraint })
  );

/** The Y.Doc Hocuspocus holds for the site, seeded from `row` with `patch` on top. */
function yjsState(patch: Record<string, unknown> = {}, source = row()) {
  const draft = { ...siteDraftFromSite(source as unknown as Site), ...patch };
  const update = encodeSiteSeed(draft, '2026-11-19T10:00:00Z');
  return { update: Buffer.from(update).toString('base64'), live: true };
}

const executedSql = (i = 0) =>
  new PgDialect().sqlToQuery(executeMock.mock.calls[i][0] as SQL).sql.replace(/\s+/g, ' ');

beforeEach(() => {
  queryMock.mockReset();
  executeMock.mockReset();
  hocuspocusInternal.mockReset();
  hocuspocusInternalOrNull.mockReset().mockResolvedValue(null);
  closeCollabRooms.mockReset().mockResolvedValue(undefined);
  access.current = { role: 'admin', groupId: null, creatorId: USER_ID };
  for (const fn of [
    members.listSiteMembers,
    members.setSiteMemberRole,
    members.removeSiteMember,
    shares.addGroupShare,
    shares.removeGroupShare,
  ]) {
    fn.mockReset();
  }
  requireSiteRoleMock.mockClear();
  getSiteRoleMock.mockReset().mockResolvedValue('admin');
  resolvePublishLocaleMock.mockReset().mockResolvedValue('de-DE');
  entitledMock.mockReset().mockResolvedValue(true);
  envMock.SITES_HOST = 'grsites.de';
});

describe('sitesContract', () => {
  it('publish answers 422 with the broken fields and writes nothing', async () => {
    queryMock.mockResolvedValueOnce([row({ legal: null })]);
    const res = await publish(true);
    expect(res.status).toBe(422);
    expect(res.body.issues.map((i: { path: string }) => i.path)).toContain('legal');
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('publish takes the locale from the site, never from the caller', async () => {
    access.current = { role: 'admin', groupId: 'g-1', creatorId: null };
    resolvePublishLocaleMock.mockResolvedValue('de-AT');
    queryMock.mockResolvedValueOnce([validRow()]).mockResolvedValueOnce([validRow()]);
    await publish(true, { locale: 'de-DE' });
    expect(resolvePublishLocaleMock).toHaveBeenCalledWith({ groupId: 'g-1', creatorId: null });
    const [sql, params] = queryMock.mock.calls[1];
    expect(sql).toMatch(/published_snapshot = \$9/);
    expect(JSON.parse(params[8])).toMatchObject({ version: 2, locale: 'de-AT' });
  });

  it('an editor cannot publish or unpublish, and nothing is written', async () => {
    access.current = { role: 'editor', groupId: null, creatorId: USER_ID };
    expect((await publish(true)).status).toBe(403);
    expect((await publish(false)).status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('an editor updates content, but subdomain or legal is refused whole', async () => {
    access.current = { role: 'editor', groupId: null, creatorId: USER_ID };
    queryMock.mockResolvedValue([row()]);
    expect((await update({ site_title: 'x' })).status).toBe(200);
    queryMock.mockClear();
    expect((await update({ site_title: 'x', subdomain: 'anna-neu' })).status).toBe(403);
    expect((await update({ site_title: 'x', legal: row().legal })).status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('a viewer reads and opens the draft but cannot update', async () => {
    access.current = { role: 'viewer', groupId: null, creatorId: USER_ID };
    queryMock.mockResolvedValue([row()]);
    hocuspocusInternal.mockResolvedValueOnce({ seeded: false });
    const byHandle = await call('getSiteByHandle', { params: { handle: SITE_ID } });
    expect(byHandle.status).toBe(200);
    expect(byHandle.body.role).toBe('viewer');
    expect((await call('prepareSiteDraft', { params: { id: SITE_ID }, body: {} })).status).toBe(
      200
    );
    queryMock.mockClear();
    expect((await update({ site_title: 'x' })).status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('answers 404 without any role, on every route that names a site', async () => {
    access.current = 'not_found';
    queryMock.mockResolvedValue([row()]);
    expect((await update({ site_title: 'x' })).status).toBe(404);
    expect((await publish(true)).status).toBe(404);
    expect((await call('prepareSiteDraft', { params: { id: SITE_ID }, body: {} })).status).toBe(
      404
    );
    expect((await call('getSiteByHandle', { params: { handle: SITE_ID } })).status).toBe(404);
    expect((await call('deleteSite', { params: { id: SITE_ID } })).status).toBe(404);
    expect(queryMock.mock.calls.filter(([sql]) => /^\s*(UPDATE|DELETE)/.test(sql))).toEqual([]);
  });

  it('unpublish clears the snapshot', async () => {
    queryMock.mockResolvedValueOnce([validRow()]);
    await publish(false);
    expect(queryMock.mock.calls[0][0]).toMatch(/is_published = false, published_snapshot = NULL/);
  });

  it('authorizes by role on the site id, not by user_id in the statement', async () => {
    queryMock.mockResolvedValue([row()]);
    await update({ site_title: 'x' });
    await publish(false);
    expect(requireSiteRoleMock.mock.calls.map((c) => [c[0], c[1], c[2]])).toEqual([
      [SITE_ID, USER_ID, 'editor'],
      [SITE_ID, USER_ID, 'admin'],
    ]);
    for (const [sql] of queryMock.mock.calls) expect(sql).not.toMatch(/user_id/);
  });

  it.each([
    ['ab', 'Die Adresse darf nur Kleinbuchstaben'],
    ['impressum', 'Diese Adresse ist reserviert'],
  ])('create rejects the address %s', async (handle, message) => {
    const res = await create({ subdomain: handle, site_title: 'x' });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain(message);
    expect(queryMock).not.toHaveBeenCalled();
  });

  /** Lock, then the live count, then the insert — all on the transaction. */
  const createAt = (live: number) =>
    executeMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ n: live }] });
  /** Project create: admin check, lock, count. */
  const createInGroupAt = (live: number, admin = true) =>
    executeMock
      .mockResolvedValueOnce({ rows: admin ? [{}] : [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ n: live }] });

  it('create adds a further site next to existing ones', async () => {
    createAt(3).mockResolvedValueOnce({ rows: [rawRow()] });
    const res = await create(validCreate());
    expect(res.status).toBe(200);
    expect(executedSql(0)).toContain('pg_advisory_xact_lock');
    expect(executeMock.mock.calls[0][0].queryChunks).toContainEqual(`user_sites:${USER_ID}`);
    expect(executedSql(1)).toMatch(
      /count\(\*\).*user_id = \$1 AND group_id IS NULL AND deleted_at IS NULL/
    );
    expect(executedSql(2)).toMatch(/^INSERT INTO user_sites/);
  });

  it('create makes the creator an admin member of a personal site, in the same transaction', async () => {
    createAt(0)
      .mockResolvedValueOnce({ rows: [rawRow()] })
      .mockResolvedValueOnce({ rows: [] });
    expect((await create(validCreate())).status).toBe(200);
    expect(executedSql(3)).toMatch(/^INSERT INTO site_members .* 'admin'/);
  });

  it('create in a project: a plain member is refused with 403 and nothing is inserted', async () => {
    createInGroupAt(0, false);
    const res = await create({ ...validCreate(), group_id: GROUP_ID });
    expect(res.status).toBe(403);
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it('create in a project: an admin without Sites unlock is refused with 403', async () => {
    entitledMock.mockResolvedValue(false);
    const res = await create({ ...validCreate(), group_id: GROUP_ID });
    expect(res.status).toBe(403);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('create in a project: stores group_id and the creator, adds no member row', async () => {
    createInGroupAt(3).mockResolvedValueOnce({ rows: [rawRow({ group_id: GROUP_ID })] });
    const res = await create({ ...validCreate(), group_id: GROUP_ID });
    expect(res.status).toBe(200);
    expect(executedSql(0)).toMatch(/gm\.role = 'admin' AND gm\.is_active = TRUE/);
    expect(executedSql(0)).toMatch(
      /g\.deleted_at IS NULL AND g\.is_system = FALSE AND g\.archived_at IS NULL/
    );
    expect(executeMock.mock.calls[1][0].queryChunks).toContainEqual(`user_sites_group:${GROUP_ID}`);
    expect(executedSql(2)).toMatch(/count\(\*\).*group_id = \$1 AND deleted_at IS NULL/);
    expect(executedSql(3)).toMatch(/^INSERT INTO user_sites \( user_id, group_id/);
    expect(executeMock).toHaveBeenCalledTimes(4);
  });

  it('the 26th project site answers 409 with the project wording', async () => {
    createInGroupAt(25);
    const res = await create({ ...validCreate(), group_id: GROUP_ID });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Dieses Projekt hat bereits 25 Websites.');
    expect(executeMock).toHaveBeenCalledTimes(3);
  });

  it('create answers 409 at the limit and inserts nothing', async () => {
    createAt(25);
    const res = await create(validCreate());
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Du hast bereits 25 Websites.');
    expect(executeMock).toHaveBeenCalledTimes(2);
  });

  it('create names the reason when the address is taken', async () => {
    createAt(0).mockRejectedValueOnce(pgUnique('user_sites_subdomain_unique'));
    expect((await create(validCreate())).body.error).toBe('Diese Adresse ist bereits vergeben');
  });

  it('update stores a colour variant', async () => {
    queryMock.mockResolvedValue([row()]);
    await update({ theme: 'hell' });
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/theme = \$\d/);
    expect(params).toContain('hell');
  });

  it('create starts a site on the dark variant', async () => {
    createAt(0)
      .mockResolvedValueOnce({ rows: [rawRow()] })
      .mockResolvedValueOnce({ rows: [] });
    await create(validCreate());
    const chunks = executeMock.mock.calls[2][0].queryChunks as unknown[];
    expect(
      chunks.some((c) => c === 'dunkel' || (c as { value?: unknown })?.value === 'dunkel')
    ).toBe(true);
  });

  it('checkSubdomain reports invalid and reserved without a query', async () => {
    expect((await check('a--b')).body).toEqual({ available: false, reason: 'invalid' });
    expect((await check('api')).body).toEqual({ available: false, reason: 'reserved' });
    expect(queryMock).not.toHaveBeenCalled();
  });
  it('publish reads the Y.Doc, not the row', async () => {
    hocuspocusInternalOrNull.mockResolvedValueOnce(yjsState({ site_title: 'Neu' }));
    queryMock
      .mockResolvedValueOnce([row({ site_title: 'Alt' })])
      .mockResolvedValueOnce([row({ site_title: 'Neu' })]);

    expect((await publish(true)).status).toBe(200);

    expect(hocuspocusInternalOrNull).toHaveBeenCalledWith(
      'GET',
      `/internal/doc/site-${SITE_ID}/yjs`
    );
    const [sql, params] = queryMock.mock.calls[1] as [string, unknown[]];
    expect(sql).toMatch(/site_title = \$1/);
    expect(params).toContain('Neu');
    expect(params).not.toContain('Alt');
    const snapshot = JSON.parse(params[8] as string) as { site_title: string };
    expect(snapshot.site_title).toBe('Neu');
  });

  it('publish keeps hidden blocks in the row and leaves them out of the snapshot (#5801)', async () => {
    const blocks = siteDraftFromSite(row() as unknown as Site).blocks.map((block) =>
      block.type === 'actions' || block.type === 'about' ? { ...block, hidden: true } : block
    );
    hocuspocusInternalOrNull.mockResolvedValueOnce(yjsState({ blocks }));
    queryMock.mockResolvedValueOnce([row()]).mockResolvedValueOnce([row()]);

    await publish(true);

    const params = queryMock.mock.calls[1][1] as unknown[];
    type Written = { blocks: { type: string; hidden?: boolean }[] };
    const sections = JSON.parse(params[7] as string) as Written;
    expect(sections.blocks.filter((b) => b.hidden).map((b) => b.type)).toEqual([
      'about',
      'actions',
      // The standard Instagram block starts hidden.
      'socialFeed',
    ]);
    const snapshot = JSON.parse(params[8] as string) as { sections: Written };
    const published = snapshot.sections.blocks.map((b) => b.type);
    expect(published).not.toContain('about');
    expect(published).not.toContain('actions');
    expect(published).not.toContain('socialFeed');
    expect(published).toContain('themes');
  });

  it('publish writes no keys a client added to the Y.Doc', async () => {
    const card = { id: 't1', title: 'Klima', imageUrl: '', content: richTextDocFromPlainText('A') };
    const blocks = siteDraftFromSite(row() as unknown as Site).blocks.map((block) =>
      block.type === 'themes' ? { ...block, id: 'th', items: [card] } : block
    );
    const seeded = yjsState({ blocks });
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(Buffer.from(seeded.update, 'base64')));
    doc.getMap('siteFields').set('evil', 'x');
    doc.getMap('siteFields').set('sections', { injected: true });
    const themes = doc.getMap('siteBlocks').get('th') as Y.Map<unknown>;
    themes.set('injected', 'x');
    ((themes.get('items') as Y.Map<unknown>).get('t1') as Y.Map<unknown>).set('onclick', 'x');
    hocuspocusInternalOrNull.mockResolvedValueOnce({
      update: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
    });
    queryMock.mockResolvedValueOnce([row()]).mockResolvedValueOnce([row()]);

    expect((await publish(true)).status).toBe(200);

    const params = queryMock.mock.calls[1][1] as unknown[];
    const written = JSON.stringify(params.slice(0, 8));
    expect(written).not.toMatch(/evil|injected|onclick/);
    const sections = JSON.parse(params[7] as string) as {
      blocks: { id: string; items?: unknown[] }[];
    };
    expect(Object.keys(sections)).toEqual(['blocks']);
    expect(sections.blocks.find((block) => block.id === 'th')).toEqual({
      id: 'th',
      type: 'themes',
      items: [card],
    });
  });

  it('publish answers 422 for social links the snapshot skips but the row would take', async () => {
    // Empty links never reach the snapshot, so only the row bounds see their keys.
    const links = Object.fromEntries(
      Array.from({ length: SITE_SOCIAL_LINKS_MAX + 1 }, (_, i) => [`k${i}`, ''])
    );
    hocuspocusInternalOrNull.mockResolvedValueOnce(yjsState({ social_links: links }));
    queryMock.mockResolvedValueOnce([row()]);

    const res = await publish(true);

    expect(res.status).toBe(422);
    expect(res.body.issues.map((i: { path: string }) => i.path)).toContain('social_links');
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('publish answers 503 when Hocuspocus fails and writes nothing', async () => {
    hocuspocusInternalOrNull.mockRejectedValueOnce(new Error('internal GET returned 500'));
    queryMock.mockResolvedValueOnce([row()]);

    const res = await publish(true);

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Der Entwurf konnte nicht gelesen werden');
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('publish answers 503 for a Y.Doc with state but no seed, and writes nothing', async () => {
    const stray = new Y.Doc();
    stray.getMap('siteFields').set('site_title', 'Leer');
    hocuspocusInternalOrNull.mockResolvedValueOnce({
      update: Buffer.from(Y.encodeStateAsUpdate(stray)).toString('base64'),
    });
    queryMock.mockResolvedValueOnce([row()]);

    expect((await publish(true)).status).toBe(503);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('publish falls back to the row when no Yjs state exists', async () => {
    queryMock
      .mockResolvedValueOnce([row({ site_title: 'Aus der Zeile', contact_phone: '+49 30 1' })])
      .mockResolvedValueOnce([row()]);

    expect((await publish(true)).status).toBe(200);

    const params = queryMock.mock.calls[1][1] as unknown[];
    expect(params[0]).toBe('Aus der Zeile');
    expect(params[5]).toBe('+49 30 1');
    expect(JSON.parse(params[8] as string)).toMatchObject({ site_title: 'Aus der Zeile' });
  });

  it('publish answers 422 with issues when legal is missing', async () => {
    hocuspocusInternalOrNull.mockResolvedValueOnce(yjsState());
    queryMock.mockResolvedValueOnce([row({ legal: null })]);

    const res = await publish(true);

    expect(res.status).toBe(422);
    expect(res.body.issues.map((i: { path: string }) => i.path)).toContain('legal');
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('prepareSiteDraft seeds the room before it answers', async () => {
    queryMock.mockResolvedValueOnce([row()]);
    hocuspocusInternal.mockResolvedValueOnce({ seeded: true });

    const res = await call('prepareSiteDraft', { params: { id: SITE_ID }, body: {} });

    expect(res).toEqual({ status: 200, body: { seeded: true } });
    expect(hocuspocusInternal.mock.calls[0][1]).toBe(`/internal/site/${SITE_ID}/seed`);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/id = \$1 AND deleted_at IS NULL/);
    expect(params).toEqual([SITE_ID]);
  });

  it("prepareSiteDraft 404 for someone else's site", async () => {
    access.current = 'not_found';

    const res = await call('prepareSiteDraft', { params: { id: SITE_ID }, body: {} });

    expect(res.status).toBe(404);
    expect(hocuspocusInternalOrNull).not.toHaveBeenCalled();
    expect(hocuspocusInternal).not.toHaveBeenCalled();
  });

  it('prepareSiteDraft answers 503 when the seed fails', async () => {
    queryMock.mockResolvedValueOnce([row()]);
    hocuspocusInternal.mockRejectedValueOnce(new Error('internal POST returned 413'));

    const res = await call('prepareSiteDraft', { params: { id: SITE_ID }, body: {} });

    expect(res).toEqual({
      status: 503,
      body: { error: 'Der Entwurf ist gerade nicht erreichbar' },
    });
  });

  it('subdomain change lands only before the first publish', async () => {
    executeMock.mockResolvedValueOnce({ rows: [rawRow({ subdomain: 'anna-neu' })] });

    const res = await update({ subdomain: 'Anna-Neu', site_title: 'x' });

    expect(res.status).toBe(200);
    expect(executedSql()).toMatch(/WHERE id = \$\d+ AND deleted_at IS NULL/);
    expect(executedSql()).toMatch(/AND last_published IS NULL/);
    const { params } = new PgDialect().sqlToQuery(executeMock.mock.calls[0][0] as SQL);
    expect(params).toEqual(expect.arrayContaining(['anna-neu', 'x', SITE_ID]));
  });

  it('subdomain change rejected after the first publish', async () => {
    executeMock.mockResolvedValueOnce({ rows: [] });
    queryMock.mockResolvedValueOnce([{ id: SITE_ID }]);

    const res = await update({ subdomain: 'anna-neu' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(
      'Die Adresse kann nach dem ersten Veröffentlichen nicht mehr geändert werden'
    );
  });

  it('subdomain change answers 404 for a site of another account', async () => {
    executeMock.mockResolvedValueOnce({ rows: [] });
    queryMock.mockResolvedValueOnce([]);

    expect((await update({ subdomain: 'anna-neu' })).status).toBe(404);
  });

  it('subdomain change rejected when taken', async () => {
    executeMock.mockRejectedValueOnce(pgUnique('user_sites_subdomain_unique'));

    const res = await update({ subdomain: 'anna-neu' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Diese Adresse ist bereits vergeben');
  });

  it('subdomain change rejects a reserved address without a query', async () => {
    const res = await update({ subdomain: 'impressum' });

    expect(res.status).toBe(400);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('getMySite returns public_origin', async () => {
    queryMock.mockResolvedValue([row()]);
    expect((await call('getMySite', {})).body.public_origin).toBe('https://grsites.de');

    envMock.SITES_HOST = undefined;
    expect((await call('getMySite', {})).body.public_origin).toBeNull();
  });

  it('listSites returns summaries with role and project, newest first, with the limit', async () => {
    getSiteRoleMock.mockResolvedValueOnce('admin').mockResolvedValueOnce('editor');
    queryMock.mockResolvedValueOnce([
      row(),
      row({ id: 'second', subdomain: 'anna-wien', group_id: GROUP_ID, group_name: 'Wien' }),
    ]);
    const res = await call('listSites', {});
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(25);
    expect(res.body.public_origin).toBe('https://grsites.de');
    expect(res.body.sites.map((s: { subdomain: string }) => s.subdomain)).toEqual([
      'anna',
      'anna-wien',
    ]);
    expect(res.body.sites.map((s: { role: string }) => s.role)).toEqual(['admin', 'editor']);
    expect(res.body.sites.map((s: { group: unknown }) => s.group)).toEqual([
      null,
      { id: GROUP_ID, name: 'Wien' },
    ]);
    expect(res.body.sites[0]).not.toHaveProperty('published_snapshot');
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/ORDER BY us\.updated_at DESC, us\.id/);
    expect(params).toEqual([USER_ID]);
  });

  it('listSites drops a candidate the resolver gives no role', async () => {
    getSiteRoleMock.mockResolvedValueOnce(null);
    queryMock.mockResolvedValueOnce([row()]);
    expect((await call('listSites', {})).body.sites).toEqual([]);
  });

  it('getSiteByHandle reads an own site by address or by id', async () => {
    queryMock.mockResolvedValueOnce([row()]);
    const byHandle = await call('getSiteByHandle', { params: { handle: 'Anna' } });
    expect(byHandle.status).toBe(200);
    expect(queryMock.mock.calls[0][0]).toMatch(/subdomain = \$1 AND deleted_at IS NULL/);
    expect(queryMock.mock.calls[0][1]).toEqual(['anna']);

    queryMock.mockResolvedValueOnce([row()]);
    await call('getSiteByHandle', { params: { handle: SITE_ID } });
    expect(queryMock.mock.calls[1][0]).toMatch(/id = \$1 AND deleted_at IS NULL/);
  });

  it('getSiteByHandle answers 404 for another account and for an invalid address', async () => {
    queryMock.mockResolvedValueOnce([]);
    expect((await call('getSiteByHandle', { params: { handle: 'bert' } })).status).toBe(404);

    queryMock.mockClear();
    expect((await call('getSiteByHandle', { params: { handle: 'a--b' } })).status).toBe(404);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('getMySite answers the most recently edited site', async () => {
    queryMock.mockResolvedValueOnce([row()]);
    await call('getMySite', {});
    expect(queryMock.mock.calls[0][0]).toMatch(
      /group_id IS NULL .* ORDER BY updated_at DESC, id LIMIT 1/s
    );
  });

  it('deleteSite closes the site room after the trash', async () => {
    queryMock.mockResolvedValue([]);
    expect((await call('deleteSite', { params: { id: SITE_ID } })).status).toBe(200);
    expect(queryMock.mock.calls[0][0]).toMatch(/^UPDATE user_sites SET deleted_at = now\(\)/);
    expect(closeCollabRooms).toHaveBeenCalledWith([`site-${SITE_ID}`]);

    access.current = 'not_found';
    closeCollabRooms.mockClear();
    expect((await call('deleteSite', { params: { id: SITE_ID } })).status).toBe(404);
    expect(closeCollabRooms).not.toHaveBeenCalled();
  });

  it('deleteSite is admin only: an editor gets 403 and the row stays', async () => {
    access.current = { role: 'editor', groupId: null, creatorId: USER_ID };
    queryMock.mockClear();
    expect((await call('deleteSite', { params: { id: SITE_ID } })).status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
    expect(closeCollabRooms).not.toHaveBeenCalled();
  });

  describe('members', () => {
    const OTHER = '55555555-5555-4555-8555-555555555555';
    const setRole = (role: string) =>
      call('setSiteMemberRole', { params: { id: SITE_ID, userId: OTHER }, body: { role } });
    const remove = (userId: string) =>
      call('removeSiteMember', { params: { id: SITE_ID, userId } });

    it('lists members for admins only', async () => {
      members.listSiteMembers.mockResolvedValue([{ userId: OTHER, role: 'editor' }]);
      const ok = await call('listSiteMembers', { params: { id: SITE_ID } });
      expect(ok.status).toBe(200);
      expect(ok.body.members).toHaveLength(1);
      access.current = { role: 'editor', groupId: null, creatorId: null };
      expect((await call('listSiteMembers', { params: { id: SITE_ID } })).status).toBe(403);
    });

    it('maps the service verdicts to 200, 409 and 422', async () => {
      members.setSiteMemberRole.mockResolvedValueOnce('ok');
      expect((await setRole('editor')).status).toBe(200);
      expect(members.setSiteMemberRole).toHaveBeenCalledWith({
        siteId: SITE_ID,
        actorId: USER_ID,
        targetId: OTHER,
        role: 'editor',
      });
      members.setSiteMemberRole.mockResolvedValueOnce('last_admin');
      const last = await setRole('viewer');
      expect([last.status, last.body.code]).toEqual([409, 'last_admin']);
      members.setSiteMemberRole.mockResolvedValueOnce('not_eligible');
      const not = await setRole('viewer');
      expect([not.status, not.body.code]).toEqual([422, 'not_eligible']);
    });

    it('a missing site is 404 before the service is asked', async () => {
      access.current = 'not_found';
      expect((await setRole('editor')).status).toBe(404);
      expect(members.setSiteMemberRole).not.toHaveBeenCalled();
    });

    it('removing somebody else needs admin; leaving needs any role', async () => {
      access.current = { role: 'viewer', groupId: null, creatorId: null };
      expect((await remove(OTHER)).status).toBe(403);
      expect(members.removeSiteMember).not.toHaveBeenCalled();

      members.removeSiteMember.mockResolvedValueOnce('ok');
      expect((await remove(USER_ID)).status).toBe(204);
      expect(members.removeSiteMember).toHaveBeenCalledWith({ siteId: SITE_ID, targetId: USER_ID });

      access.current = 'not_found';
      expect((await remove(USER_ID)).status).toBe(404);
    });

    it('delete answers 409 for the last admin and 404 for a stranger', async () => {
      members.removeSiteMember.mockResolvedValueOnce('last_admin');
      expect((await remove(OTHER)).status).toBe(409);
      members.removeSiteMember.mockResolvedValueOnce('not_found');
      expect((await remove(OTHER)).status).toBe(404);
    });
  });

  describe('project shares', () => {
    const put = (write = true) =>
      call('setSiteGroup', { params: { id: SITE_ID, groupId: GROUP_ID }, body: { write } });
    const del = () => call('removeSiteGroup', { params: { id: SITE_ID, groupId: GROUP_ID } });

    it('shares through the writer with write permission and the user_sites type', async () => {
      shares.addGroupShare.mockResolvedValue({ created: true });
      expect((await put(false)).status).toBe(200);
      expect(shares.addGroupShare).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          groupId: GROUP_ID,
          contentType: 'user_sites',
          contentId: SITE_ID,
          permissions: { read: true, write: false },
          onExisting: 'update-permissions',
        })
      );
    });

    it('403 when the admin may not share into that project', async () => {
      shares.addGroupShare.mockRejectedValue(new shares.GroupShareForbiddenError('no'));
      const res = await put();
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Projekt');
    });

    it('409 on a project site, for list, share and unshare', async () => {
      access.current = { role: 'admin', groupId: GROUP_ID, creatorId: null };
      expect((await put()).status).toBe(409);
      expect((await del()).status).toBe(409);
      expect((await call('listSiteGroups', { params: { id: SITE_ID } })).status).toBe(409);
      expect(shares.addGroupShare).not.toHaveBeenCalled();
      expect(shares.removeGroupShare).not.toHaveBeenCalled();
    });

    it('needs admin; unshare removes by type, site and project', async () => {
      access.current = { role: 'editor', groupId: null, creatorId: null };
      expect((await put()).status).toBe(403);
      expect((await del()).status).toBe(403);
      access.current = { role: 'admin', groupId: null, creatorId: null };
      shares.removeGroupShare.mockResolvedValueOnce(true);
      expect((await del()).status).toBe(204);
      expect(shares.removeGroupShare).toHaveBeenCalledWith({
        groupId: GROUP_ID,
        contentType: 'user_sites',
        contentId: SITE_ID,
      });
      shares.removeGroupShare.mockResolvedValueOnce(false);
      expect((await del()).status).toBe(404);
    });

    it('lists the projects with their write flag', async () => {
      queryMock.mockResolvedValueOnce([{ id: GROUP_ID, name: 'KV', write: true }]);
      const res = await call('listSiteGroups', { params: { id: SITE_ID } });
      expect(res.body.groups).toEqual([{ groupId: GROUP_ID, name: 'KV', write: true }]);
    });
  });
});
