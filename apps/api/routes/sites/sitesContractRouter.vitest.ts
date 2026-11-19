import { DrizzleQueryError } from 'drizzle-orm/errors';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const executeMock = vi.fn();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: queryMock }),
}));
vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({ execute: executeMock }),
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
const validRow = () => row();

const validCreate = () => ({ subdomain: 'anna-berlin', site_title: 'Anna' });
const pgUnique = (constraint: string) =>
  new DrizzleQueryError(
    'INSERT INTO user_sites',
    [],
    Object.assign(new Error('duplicate key'), { code: '23505', constraint })
  );

beforeEach(() => {
  queryMock.mockReset();
  executeMock.mockReset();
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
    expect(sql).toMatch(/published_snapshot = \$1/);
    expect(JSON.parse(params[0])).toMatchObject({ version: 1, locale: 'de-AT' });
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

  it('create names the reason when the account already has a site', async () => {
    queryMock.mockResolvedValueOnce([]);
    executeMock.mockRejectedValueOnce(pgUnique('user_sites_one_live_per_user'));
    expect((await create(validCreate())).body.error).toBe('Du hast bereits eine Website erstellt');
  });

  it('create names the reason when the address is taken', async () => {
    queryMock.mockResolvedValueOnce([]);
    executeMock.mockRejectedValueOnce(pgUnique('user_sites_subdomain_unique'));
    expect((await create(validCreate())).body.error).toBe('Diese Adresse ist bereits vergeben');
  });

  it('checkSubdomain reports invalid and reserved without a query', async () => {
    expect((await check('a--b')).body).toEqual({ available: false, reason: 'invalid' });
    expect((await check('api')).body).toEqual({ available: false, reason: 'reserved' });
    expect(queryMock).not.toHaveBeenCalled();
  });
});
