/**
 * Der Marktplatz gegen ein echtes PostgreSQL: was jede Art im Laden zeigt
 * (nur öffentlich, unmoderiert, nicht im Papierkorb, eigenes Land), wie
 * Seiten und Abschnitte geschnitten werden, und dass Like und Speichern in den
 * richtigen Tabellen landen.
 *
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests") und legt sich
 * wie `studioAssetsService.db.vitest.ts` eine eigene Datenbank an.
 */
import { randomUUID } from 'node:crypto';

import { marketplaceListQuerySchema, type MarketplaceListQueryInput } from '@gruenerator/contracts';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { runMigrations } from '../../database/services/PostgresService/migrations.js';

const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
let pool: pg.Pool;

const adapter = {
  get pool() {
    return pool;
  },
  ensureInitialized: async () => {},
  query: async (text: string, params?: unknown[]): Promise<unknown[]> =>
    (await pool.query<Record<string, unknown>>(text, params)).rows,
};

vi.mock('../../database/services/PostgresService/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));
// The official catalogue's inputs; the catalogue itself is covered by the source tests.
vi.mock('../roles/userRoles.js', () => ({ loadUserRoles: async () => [] }));
vi.mock('../landesverband/LandesverbandDerivationService.js', () => ({
  getUserLandesverbandId: async () => null,
}));
vi.mock('../agents/AdminHiddenAgentsService.js', () => ({
  getHiddenAgentIdentifiersCached: async () => [],
}));
vi.mock('../skills/AdminHiddenSkillsService.js', () => ({
  getEffectiveHiddenSkillMentions: async () => new Set<string>(),
}));

const { buildMarketplaceContext } = await import('./context.js');
const { listMarketplace, setLike, setSaved } = await import('./marketplaceService.js');

const me = randomUUID();
const other = randomUUID();

type Row = {
  audience?: 'de-DE' | 'de-AT' | 'all';
  moderation?: string;
  deleted?: boolean;
  isPublic?: boolean;
  owner?: string;
  title?: string;
  createdAt?: string;
};

const trashed = (o: Row) => (o.deleted ? 'now()' : 'NULL');

async function insertAgent(o: Row = {}): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO user_agents (user_id, identifier, title, description, system_role, avatar,
                              background_color, model, provider, params, opening_message,
                              author, share_mode, is_public, locale, moderation, deleted_at)
     VALUES ($1, $2, $3, 'Schreibt', 'Rolle', '', '#fff', 'm', 'mistral', '{}'::jsonb,
             'Hallo', 'Anna', 'authenticated', $4, $5, $6, ${trashed(o)})
     RETURNING id`,
    [
      o.owner ?? other,
      `bot-${randomUUID().slice(0, 8)}`,
      o.title ?? 'Pressebot',
      o.isPublic ?? true,
      o.audience ?? 'de-DE',
      o.moderation ?? 'ok',
    ]
  );
  return res.rows[0]!.id;
}

async function insertRecipe(o: Row = {}): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO user_text_forms (user_id, kind, mention, title, style_block, share_mode,
                                  is_public, public_ownership, audience, moderation, deleted_at)
     VALUES ($1, 'custom', $2, $3, 'Stil', 'authenticated', $4, 'owner', $5, $6, ${trashed(o)})
     RETURNING id`,
    [
      o.owner ?? other,
      `pm-${randomUUID().slice(0, 8)}`,
      o.title ?? 'Pressemitteilung',
      o.isPublic ?? true,
      o.audience ?? 'de-DE',
      o.moderation ?? 'ok',
    ]
  );
  return res.rows[0]!.id;
}

async function insertTemplate(o: Row = {}): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO user_templates (user_id, title, template_type, is_private, status, audience,
                                 moderation, created_at, deleted_at)
     VALUES ($1, $2, 'gruenerator', $3, 'published', $4, $5, $6, ${trashed(o)})
     RETURNING id`,
    [
      o.owner ?? other,
      o.title ?? 'Plakat',
      !(o.isPublic ?? true),
      o.audience ?? 'de-DE',
      o.moderation ?? 'ok',
      o.createdAt ?? new Date().toISOString(),
    ]
  );
  return res.rows[0]!.id;
}

async function insertAsset(o: Row & { kind?: 'sticker' | 'background' } = {}): Promise<string> {
  const token = randomUUID().replace(/-/g, '');
  await pool.query(
    `INSERT INTO shared_media (user_id, share_token, media_type, mime_type, upload_source,
                               is_library_item, image_metadata)
     VALUES ($1, $2, 'image', 'image/png', 'studio-asset', FALSE, '{"width":512,"height":512}')`,
    [o.owner ?? other, token]
  );
  const res = await pool.query<{ id: string }>(
    `INSERT INTO studio_assets (user_id, kind, title, tags, media_id, src, width, height, source,
                                visibility, audience, moderation, deleted_at)
     SELECT $1, $2, $3, '[]'::jsonb, id, '/api/share/' || share_token || '/download', 512, 512,
            'upload', $4, $5, $6, ${trashed(o)}
     FROM shared_media WHERE share_token = $7
     RETURNING id`,
    [
      o.owner ?? other,
      o.kind ?? 'sticker',
      o.title ?? 'Sonnenblume',
      (o.isPublic ?? true) ? 'public' : 'private',
      o.audience ?? 'all',
      o.moderation ?? 'ok',
      token,
    ]
  );
  return res.rows[0]!.id;
}

/** A project with `members` (active) and `former` (left, `is_active = false`). */
async function insertGroup(
  o: { members?: string[]; former?: string[]; deleted?: boolean } = {}
): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO groups (name, deleted_at) VALUES ('Ortsverband', ${trashed(o)}) RETURNING id`
  );
  const id = res.rows[0]!.id;
  for (const [userId, active] of [
    ...(o.members ?? []).map((u) => [u, true] as const),
    ...(o.former ?? []).map((u) => [u, false] as const),
  ]) {
    await pool.query(
      'INSERT INTO group_memberships (group_id, user_id, is_active) VALUES ($1, $2, $3)',
      [id, userId, active]
    );
  }
  return id;
}

async function shareInto(groupId: string, contentType: string, contentId: string): Promise<void> {
  await pool.query(
    `INSERT INTO group_content_shares (group_id, shared_by_user_id, content_type, content_id)
     VALUES ($1, $2, $3, $4)`,
    [groupId, other, contentType, contentId]
  );
}

const ctx = (locale: 'de-DE' | 'de-AT' = 'de-DE') =>
  buildMarketplaceContext({ userId: me, locale, platform: 'web', instanceId: 'production' });

const list = (q: MarketplaceListQueryInput, locale: 'de-DE' | 'de-AT' = 'de-DE') =>
  listMarketplace(ctx(locale), marketplaceListQuerySchema.parse(q));

/** The user-content refs of one kind, in list order. */
async function publicRefs(
  kinds: string,
  locale: 'de-DE' | 'de-AT' = 'de-DE',
  extra: MarketplaceListQueryInput = {}
): Promise<string[]> {
  const res = await list({ kinds, origin: 'oeffentlich', limit: 60, ...extra }, locale);
  return res.sections[0]!.items.map((i) => i.ref);
}

describe.skipIf(!url)('Marktplatz (marketplaceService)', () => {
  const dbName = `marketplace_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    for (const [id, name] of [
      [me, 'Ich'],
      [other, 'Andere Person'],
    ]) {
      await pool.query('INSERT INTO profiles (id, display_name) VALUES ($1, $2)', [id, name]);
    }
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  beforeEach(async () => {
    for (const table of [
      'groups',
      'entity_likes',
      'entity_favorites',
      'user_library_items',
      'user_agents',
      'user_text_forms',
      'user_templates',
      'studio_assets',
    ]) {
      await pool.query(`DELETE FROM ${table}`);
    }
  });

  describe.each([
    ['agent', insertAgent],
    ['recipe', insertRecipe],
    ['template', insertTemplate],
    ['sticker', insertAsset],
  ] as const)('%s', (kind, insert) => {
    it('shows only public, unmoderated, live content for the viewer’s country', async () => {
      const de = await insert({ audience: 'de-DE' });
      const at = await insert({ audience: 'de-AT' });
      await insert({ moderation: 'hidden' });
      await insert({ moderation: 'removed' });
      await insert({ deleted: true });
      await insert({ isPublic: false });

      expect(await publicRefs(kind, 'de-DE')).toEqual([de]);
      expect(await publicRefs(kind, 'de-AT')).toEqual([at]);
    });

    it('likes and saves only what the viewer can see', async () => {
      const shown = await insert({});
      const hidden = await insert({ moderation: 'hidden' });
      const austrian = await insert({ audience: 'de-AT' });

      expect(await setLike(ctx(), kind, shown, true)).toEqual({
        ok: true,
        value: { liked: true, likesCount: 1 },
      });
      expect(await setSaved(ctx(), kind, shown, true)).toEqual({
        ok: true,
        value: { saved: true },
      });
      for (const ref of [hidden, austrian]) {
        expect(await setLike(ctx(), kind, ref, true)).toEqual({ ok: false, status: 404 });
        expect(await setSaved(ctx(), kind, ref, true)).toEqual({ ok: false, status: 404 });
      }

      const [item] = (await list({ kinds: kind, origin: 'oeffentlich' })).sections[0]!.items;
      expect(item).toMatchObject({ ref: shown, liked: true, likesCount: 1, saved: true });

      expect(await publicRefs(kind, 'de-DE', { scope: 'saved' })).toEqual([shown]);

      expect(await setLike(ctx(), kind, shown, false)).toEqual({
        ok: true,
        value: { liked: false, likesCount: 0 },
      });
      expect(await setSaved(ctx(), kind, shown, false)).toEqual({
        ok: true,
        value: { saved: false },
      });
      expect(await publicRefs(kind, 'de-DE', { scope: 'saved' })).toEqual([]);
    });
  });

  it.each([
    ['agent', insertAgent, 'user_agents'],
    ['recipe', insertRecipe, 'user_text_forms'],
  ] as const)(
    '%s: „Öffentlich“ leaves out what a project already shares with the viewer (#4699)',
    async (kind, insert, contentType) => {
      const project = await insertGroup({ members: [me, other] });
      const shared = await insert({});
      await shareInto(project, contentType, shared);
      const ownShared = await insert({ owner: me });
      await shareInto(project, contentType, ownShared);
      const plain = await insert({});
      const left = await insert({});
      await shareInto(await insertGroup({ members: [other], former: [me] }), contentType, left);
      const inTrashedProject = await insert({});
      await shareInto(
        await insertGroup({ members: [me, other], deleted: true }),
        contentType,
        inTrashedProject
      );

      expect((await publicRefs(kind)).sort()).toEqual(
        [ownShared, plain, left, inTrashedProject].sort()
      );
      // Like and save resolve against the unfiltered list.
      expect(await setLike(ctx(), kind, shared, true)).toMatchObject({ ok: true });
      expect(await setSaved(ctx(), kind, shared, true)).toEqual({
        ok: true,
        value: { saved: true },
      });
    }
  );

  it('a Studio item does not show up under the other kind', async () => {
    const sticker = await insertAsset({ kind: 'sticker' });
    const background = await insertAsset({ kind: 'background' });
    expect(await publicRefs('sticker')).toEqual([sticker]);
    expect(await publicRefs('background')).toEqual([background]);
  });

  it('marks own content, names the author and the report kind', async () => {
    const own = await insertTemplate({ owner: me });
    const [item] = (await list({ kinds: 'template' })).sections[0]!.items;
    expect(item).toMatchObject({
      ref: own,
      isOwn: true,
      authorName: 'Ich',
      reportKind: 'user_template',
      origin: 'oeffentlich',
    });
  });

  it('a single kind pages by offset, several kinds give a first page each', async () => {
    const ids = [
      await insertTemplate({ title: 'A', createdAt: '2026-01-01T00:00:00Z' }),
      await insertTemplate({ title: 'B', createdAt: '2026-02-01T00:00:00Z' }),
      await insertTemplate({ title: 'C', createdAt: '2026-03-01T00:00:00Z' }),
    ];
    const newest = [...ids].reverse();

    const first = await list({ kinds: 'template', sort: 'neu', limit: 2 });
    expect(first.sections[0]).toMatchObject({ kind: 'template', hasMore: true });
    expect(first.sections[0]!.items.map((i) => i.ref)).toEqual(newest.slice(0, 2));

    const second = await list({ kinds: 'template', sort: 'neu', limit: 2, offset: 2 });
    expect(second.sections[0]!.items.map((i) => i.ref)).toEqual(newest.slice(2));
    expect(second.sections[0]!.hasMore).toBe(false);

    // Several kinds: `offset` is ignored, `sectionLimit` cuts each section.
    const sections = await list({
      kinds: 'template,sticker',
      sort: 'neu',
      sectionLimit: 1,
      offset: 2,
    });
    expect(sections.sections.map((s) => [s.kind, s.items.length, s.hasMore])).toEqual([
      ['template', 1, true],
      ['sticker', 0, false],
    ]);
    expect(sections.sections[0]!.items[0]!.ref).toBe(newest[0]);
  });

  it('beliebt puts the most liked first', async () => {
    const quiet = await insertTemplate({ createdAt: '2026-03-01T00:00:00Z' });
    const liked = await insertTemplate({ createdAt: '2026-01-01T00:00:00Z' });
    await setLike(ctx(), 'template', liked, true);
    expect(await publicRefs('template', 'de-DE', { sort: 'beliebt' })).toEqual([liked, quiet]);
    expect(await publicRefs('template', 'de-DE', { sort: 'neu' })).toEqual([quiet, liked]);
  });

  it('the Alle tab leaves catalogue recipes out, the Rezepte tab and a search bring them in', async () => {
    const official = (r: Awaited<ReturnType<typeof list>>) =>
      r.sections.find((s) => s.kind === 'recipe')!.items.filter((i) => i.origin === 'offiziell');
    expect(official(await list({ kinds: 'agent,recipe' }))).toEqual([]);
    expect(official(await list({ kinds: 'recipe' })).length).toBeGreaterThan(0);
    expect(official(await list({ kinds: 'agent,recipe', q: 'presse' })).length).toBeGreaterThan(0);
  });

  it('saves Agents and Rezepte to „Meine Grüneratoren“, the rest to „Gemerkt“', async () => {
    const own = await insertAgent({ owner: me });
    const foreign = await insertAgent({});
    const recipe = await insertRecipe({});
    const template = await insertTemplate({});
    for (const [kind, ref] of [
      ['agent', own],
      ['agent', foreign],
      ['recipe', recipe],
      ['template', template],
    ] as const) {
      expect(await setSaved(ctx(), kind, ref, true)).toEqual({ ok: true, value: { saved: true } });
    }
    const library = await pool.query<{ item_kind: string; item_ref: string }>(
      'SELECT item_kind, item_ref FROM user_library_items WHERE user_id = $1 ORDER BY item_ref',
      [me]
    );
    const ownIdentifier = (
      await pool.query<{ identifier: string }>('SELECT identifier FROM user_agents WHERE id = $1', [
        own,
      ])
    ).rows[0]!.identifier;
    expect(library.rows).toEqual(
      expect.arrayContaining([
        { item_kind: 'agent', item_ref: ownIdentifier },
        { item_kind: 'agent', item_ref: foreign },
        { item_kind: 'recipe', item_ref: recipe },
      ])
    );
    const favorites = await pool.query('SELECT entity_type, entity_id FROM entity_favorites');
    expect(favorites.rows).toEqual([{ entity_type: 'template', entity_id: template }]);
    expect(await publicRefs('agent', 'de-DE', { scope: 'saved' })).toEqual(
      expect.arrayContaining([own, foreign])
    );
  });

  it('answers 409 once „Meine Grüneratoren“ is full', async () => {
    const recipe = await insertRecipe({});
    await pool.query(
      `INSERT INTO user_library_items (user_id, item_kind, item_ref)
       SELECT $1, 'recipe', 'r-' || g FROM generate_series(1, 500) g`,
      [me]
    );
    expect(await setSaved(ctx(), 'recipe', recipe, true)).toEqual({ ok: false, status: 409 });
  });
});
