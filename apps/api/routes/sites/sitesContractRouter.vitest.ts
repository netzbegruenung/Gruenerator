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
const trashOwnedRowMock = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<string>>());
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
vi.mock('../../services/trash/ownedRowTrash.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/trash/ownedRowTrash.js')>()),
  trashOwnedRow: trashOwnedRowMock,
}));
vi.mock('../auth/groups/groupsContract/shared.js', () => ({
  getUserLocale: (req: { locale?: string }) => req.locale ?? 'de-DE',
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SITE_ID = '33333333-3333-4333-8333-333333333333';

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
  trashOwnedRowMock.mockReset();
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

  it('publish stores the snapshot with the locale of the account', async () => {
    queryMock.mockResolvedValueOnce([validRow()]).mockResolvedValueOnce([validRow()]);
    await publish(true, { locale: 'de-AT' });
    const [sql, params] = queryMock.mock.calls[1];
    expect(sql).toMatch(/published_snapshot = \$9/);
    expect(JSON.parse(params[8])).toMatchObject({ version: 1, locale: 'de-AT' });
  });

  it('unpublish clears the snapshot', async () => {
    queryMock.mockResolvedValueOnce([validRow()]);
    await publish(false);
    expect(queryMock.mock.calls[0][0]).toMatch(/is_published = false, published_snapshot = NULL/);
  });

  it('every statement on user_sites is scoped to the session user', async () => {
    queryMock.mockResolvedValue([]);
    await update({ site_title: 'x' });
    await publish(false);
    for (const [sql, params] of queryMock.mock.calls) {
      expect(sql).toMatch(/user_id = \$\d/);
      expect(params).toContain(USER_ID);
    }
  });

  it('answers 404 for a site of another account', async () => {
    queryMock.mockResolvedValueOnce([]);
    expect((await update({ site_title: 'x' })).status).toBe(404);
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

  it('create adds a further site next to existing ones', async () => {
    createAt(3).mockResolvedValueOnce({ rows: [rawRow()] });
    const res = await create(validCreate());
    expect(res.status).toBe(200);
    expect(executedSql(0)).toContain('pg_advisory_xact_lock');
    expect(executeMock.mock.calls[0][0].queryChunks).toContainEqual(`user_sites:${USER_ID}`);
    expect(executedSql(1)).toMatch(/count\(\*\).*user_id = \$1 AND deleted_at IS NULL/);
    expect(executedSql(2)).toMatch(/^INSERT INTO user_sites/);
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
    createAt(0).mockResolvedValueOnce({ rows: [rawRow()] });
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

  it('publish keeps hidden sections from the draft (#5801)', async () => {
    hocuspocusInternalOrNull.mockResolvedValueOnce(yjsState({ hidden: ['actions', 'socialFeed'] }));
    queryMock.mockResolvedValueOnce([row()]).mockResolvedValueOnce([row()]);

    await publish(true);

    const params = queryMock.mock.calls[1][1] as unknown[];
    const sections = JSON.parse(params[7] as string) as { hidden: string[] };
    expect(sections.hidden).toEqual(['actions', 'socialFeed']);
    const snapshot = JSON.parse(params[8] as string) as { hidden_sections: string[] };
    expect(snapshot.hidden_sections).toEqual(expect.arrayContaining(['actions', 'socialFeed']));
  });

  it('publish writes no keys a client added to the Y.Doc', async () => {
    const seeded = yjsState({
      themes: [{ id: 't1', title: 'Klima', imageUrl: '', content: richTextDocFromPlainText('A') }],
    });
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(Buffer.from(seeded.update, 'base64')));
    doc.getMap('siteFields').set('evil', 'x');
    doc.getMap('siteFields').set('sections', { injected: true });
    (doc.getMap('siteThemes').get('t1') as Y.Map<unknown>).set('onclick', 'x');
    hocuspocusInternalOrNull.mockResolvedValueOnce({
      update: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
    });
    queryMock.mockResolvedValueOnce([row()]).mockResolvedValueOnce([row()]);

    expect((await publish(true)).status).toBe(200);

    const params = queryMock.mock.calls[1][1] as unknown[];
    const written = JSON.stringify(params.slice(0, 8));
    expect(written).not.toMatch(/evil|injected|onclick/);
    const sections = JSON.parse(params[7] as string) as Record<string, unknown>;
    expect(Object.keys(sections).sort()).toEqual(
      ['about', 'actions', 'contact', 'heroImage', 'hidden', 'socialFeed', 'themes'].sort()
    );
    expect((sections.themes as Record<string, unknown>[])[0]).toEqual({
      title: 'Klima',
      imageUrl: '',
      content: richTextDocFromPlainText('A'),
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
    expect(sql).toMatch(/id = \$1 AND user_id = \$2 AND deleted_at IS NULL/);
    expect(params).toEqual([SITE_ID, USER_ID]);
  });

  it("prepareSiteDraft 404 for someone else's site", async () => {
    queryMock.mockResolvedValueOnce([]);

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
    expect(executedSql()).toMatch(/WHERE id = \$\d+ AND user_id = \$\d+ AND deleted_at IS NULL/);
    expect(executedSql()).toMatch(/AND last_published IS NULL/);
    const { params } = new PgDialect().sqlToQuery(executeMock.mock.calls[0][0] as SQL);
    expect(params).toEqual(expect.arrayContaining(['anna-neu', 'x', SITE_ID, USER_ID]));
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

  it('listSites returns summaries, newest first, with the limit', async () => {
    queryMock.mockResolvedValueOnce([row(), row({ id: 'second', subdomain: 'anna-wien' })]);
    const res = await call('listSites', {});
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(25);
    expect(res.body.public_origin).toBe('https://grsites.de');
    expect(res.body.sites.map((s: { subdomain: string }) => s.subdomain)).toEqual([
      'anna',
      'anna-wien',
    ]);
    expect(res.body.sites[0]).not.toHaveProperty('published_snapshot');
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/user_id = \$1 AND deleted_at IS NULL/);
    expect(sql).toMatch(/ORDER BY updated_at DESC/);
    expect(params).toEqual([USER_ID]);
  });

  it('getSiteByHandle reads an own site by address or by id', async () => {
    queryMock.mockResolvedValueOnce([row()]);
    const byHandle = await call('getSiteByHandle', { params: { handle: 'Anna' } });
    expect(byHandle.status).toBe(200);
    expect(queryMock.mock.calls[0][0]).toMatch(/subdomain = \$1 AND user_id = \$2/);
    expect(queryMock.mock.calls[0][1]).toEqual(['anna', USER_ID]);

    queryMock.mockResolvedValueOnce([row()]);
    await call('getSiteByHandle', { params: { handle: SITE_ID } });
    expect(queryMock.mock.calls[1][0]).toMatch(/id = \$1 AND user_id = \$2/);
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
    expect(queryMock.mock.calls[0][0]).toMatch(/ORDER BY updated_at DESC, id LIMIT 1/);
  });

  it('deleteSite closes the site room after the trash', async () => {
    trashOwnedRowMock.mockResolvedValueOnce('ok');
    expect((await call('deleteSite', { params: { id: SITE_ID } })).status).toBe(200);
    expect(closeCollabRooms).toHaveBeenCalledWith([`site-${SITE_ID}`]);

    trashOwnedRowMock.mockResolvedValueOnce('not_found');
    closeCollabRooms.mockClear();
    expect((await call('deleteSite', { params: { id: SITE_ID } })).status).toBe(404);
    expect(closeCollabRooms).not.toHaveBeenCalled();
  });
});
