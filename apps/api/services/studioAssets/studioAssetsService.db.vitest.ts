/**
 * Studio-Shop gegen ein echtes PostgreSQL: welche Sticker/Hintergründe welche
 * Liste zeigt, was `create` ablehnt, und wann ein Element öffentlich werden darf.
 *
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests") und legt sich
 * wie `trashSchema.db.vitest.ts` eine eigene Datenbank an.
 */
import { randomUUID } from 'node:crypto';

import { type StudioAssetCreateBody, type StudioAssetListQuery } from '@gruenerator/contracts';
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

async function one<T extends pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T> {
  return (await pool.query<T>(text, params)).rows[0]!;
}

vi.mock('../../database/services/PostgresService/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));

const {
  createStudioAsset,
  isStudioAssetVisible,
  listStudioAssets,
  removeStudioAsset,
  updateStudioAsset,
} = await import('./studioAssetsService.js');
const { purgeStudioAsset } = await import('./studioAssetTrash.js');

const me = randomUUID();
const other = randomUUID();

async function insertMedia(
  owner: string,
  o: { source?: string; mime?: string; width?: number; height?: number } = {}
): Promise<string> {
  const token = randomUUID().replace(/-/g, '');
  await pool.query(
    `INSERT INTO shared_media (user_id, share_token, media_type, mime_type, upload_source,
                               is_library_item, image_metadata)
     VALUES ($1, $2, 'image', $3, $4, FALSE, $5)`,
    [
      owner,
      token,
      o.mime ?? 'image/png',
      o.source ?? 'studio-asset',
      JSON.stringify({ width: o.width ?? 512, height: o.height ?? 512 }),
    ]
  );
  return token;
}

async function insertAsset(
  owner: string,
  o: {
    title?: string;
    kind?: string;
    visibility?: string;
    moderation?: string;
    audience?: string;
    deleted?: boolean;
    tags?: string[];
  } = {}
): Promise<string> {
  const token = await insertMedia(owner);
  const rows = await pool.query<{ id: string }>(
    `INSERT INTO studio_assets (user_id, kind, title, tags, media_id, src, width, height, source,
                                visibility, audience, moderation, deleted_at)
     SELECT $1, $2, $3, $4, id, '/api/share/' || share_token || '/download', 512, 512, 'upload',
            $5, $6, $7, CASE WHEN $8 THEN now() END
     FROM shared_media WHERE share_token = $9
     RETURNING id`,
    [
      owner,
      o.kind ?? 'sticker',
      o.title ?? 'Sonnenblume',
      JSON.stringify(o.tags ?? []),
      o.visibility ?? 'public',
      o.audience ?? 'all',
      o.moderation ?? 'ok',
      o.deleted ?? false,
      token,
    ]
  );
  return rows.rows[0].id;
}

const query = (o: Partial<StudioAssetListQuery> = {}): StudioAssetListQuery => ({
  kind: 'sticker',
  scope: 'shop',
  sort: 'new',
  offset: 0,
  limit: 48,
  ...o,
});

const createBody = (
  shareToken: string,
  o: Partial<StudioAssetCreateBody> = {}
): StudioAssetCreateBody => ({
  shareToken,
  kind: 'sticker',
  title: 'Mein Sticker',
  tags: ['klima'],
  visibility: 'private',
  audience: 'all',
  source: 'upload',
  rightsConfirmed: false,
  ...o,
});

describe.skipIf(!url)('Studio-Shop (studioAssetsService)', () => {
  const dbName = `studio_assets_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    for (const id of [me, other]) {
      await pool.query('INSERT INTO profiles (id, display_name) VALUES ($1, $2)', [
        id,
        id === me ? 'Ich' : 'Andere Person',
      ]);
    }
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM entity_likes');
    await pool.query('DELETE FROM entity_favorites');
    await pool.query('DELETE FROM studio_assets');
  });

  it('shop shows only public, unmoderated, live items for the viewer’s country', async () => {
    const shown = await insertAsset(other, { title: 'Für alle' });
    const shownDe = await insertAsset(other, { title: 'Für DE', audience: 'de-DE' });
    await insertAsset(other, { title: 'Für AT', audience: 'de-AT' });
    await insertAsset(other, { title: 'Privat', visibility: 'private' });
    await insertAsset(other, { title: 'Versteckt', moderation: 'hidden' });
    await insertAsset(other, { title: 'Entfernt', moderation: 'removed' });
    await insertAsset(other, { title: 'Papierkorb', deleted: true });
    await insertAsset(other, { title: 'Hintergrund', kind: 'background' });

    const res = await listStudioAssets(me, 'de-DE', query());
    expect(res.items.map((i) => i.id).sort()).toEqual([shown, shownDe].sort());
    expect(res.items[0]).toMatchObject({ isOwn: false, authorName: 'Andere Person' });
  });

  it('mine shows the owner’s hidden and removed items too, but not the trashed ones', async () => {
    const ids = [
      await insertAsset(me, { visibility: 'private' }),
      await insertAsset(me, { moderation: 'hidden' }),
      await insertAsset(me, { moderation: 'removed' }),
    ];
    await insertAsset(me, { deleted: true });
    await insertAsset(other);

    const res = await listStudioAssets(me, 'de-DE', query({ scope: 'mine' }));
    expect(res.items.map((i) => i.id).sort()).toEqual(ids.sort());
    expect(res.items.every((i) => i.isOwn)).toBe(true);
  });

  it('saved shows bookmarked items that are still visible', async () => {
    const visible = await insertAsset(other);
    const nowPrivate = await insertAsset(other, { visibility: 'private' });
    for (const id of [visible, nowPrivate]) {
      await pool.query(
        `INSERT INTO entity_favorites (user_id, entity_type, entity_id) VALUES ($1, 'studio_asset', $2)`,
        [me, id]
      );
    }
    const res = await listStudioAssets(me, 'de-AT', query({ scope: 'saved' }));
    expect(res.items.map((i) => i.id)).toEqual([visible]);
    expect(res.items[0]?.favorited).toBe(true);
  });

  it('searches title and tags literally, sorts by likes and pages with hasMore', async () => {
    const a = await insertAsset(other, { title: '100% Klima' });
    const b = await insertAsset(other, { title: 'Wald', tags: ['klimaschutz'] });
    await insertAsset(other, { title: '100 Prozent' });
    await pool.query(
      `INSERT INTO entity_likes (user_id, entity_type, entity_id) VALUES ($1, 'studio_asset', $2)`,
      [me, b]
    );

    const jsonSyntax = await listStudioAssets(me, 'de-DE', query({ q: '"' }));
    expect(jsonSyntax.items).toEqual([]);

    const percent = await listStudioAssets(me, 'de-DE', query({ q: '100%' }));
    expect(percent.items.map((i) => i.id)).toEqual([a]);

    const popular = await listStudioAssets(me, 'de-DE', query({ q: 'klima', sort: 'popular' }));
    expect(popular.items.map((i) => i.id)).toEqual([b, a]);
    expect(popular.items[0]).toMatchObject({ likesCount: 1, liked: true });

    const page = await listStudioAssets(me, 'de-DE', query({ limit: 2 }));
    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(true);
  });

  it('create builds src from the share token and keeps width/height', async () => {
    const token = await insertMedia(me, { width: 800, height: 400 });
    const res = await createStudioAsset(
      me,
      createBody(token, { visibility: 'public', rightsConfirmed: true })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toMatchObject({
      src: `/api/share/${token}/download`,
      width: 800,
      height: 400,
      visibility: 'public',
      isOwn: true,
    });
    const row = await one<{ was_public: boolean }>(
      'SELECT was_public FROM studio_assets WHERE id = $1',
      [res.value.id]
    );
    expect(row.was_public).toBe(true);

    expect(await createStudioAsset(me, createBody(token))).toMatchObject({ status: 409 });
  });

  it.each([
    ['foreign media', async () => insertMedia(other), 404],
    ['a library upload', async () => insertMedia(me, { source: 'upload' }), 404],
    ['a JPEG', async () => insertMedia(me, { mime: 'image/jpeg' }), 404],
    ['an oversized sticker', async () => insertMedia(me, { width: 1100, height: 300 }), 400],
    ['a tiny image', async () => insertMedia(me, { width: 63, height: 300 }), 400],
  ])('create rejects %s', async (_label, media, status) => {
    const res = await createStudioAsset(me, createBody(await media()));
    expect(res).toMatchObject({ ok: false, status });
    const count = await one<{ n: number }>('SELECT count(*)::int AS n FROM studio_assets');
    expect(count.n).toBe(0);
  });

  it('create allows a 2160 px Hintergrund', async () => {
    const token = await insertMedia(me, { width: 2160, height: 1350 });
    expect(await createStudioAsset(me, createBody(token, { kind: 'background' }))).toMatchObject({
      ok: true,
    });
  });

  it('create refuses public without confirmed rights', async () => {
    const res = await createStudioAsset(
      me,
      createBody(await insertMedia(me), { visibility: 'public' })
    );
    expect(res).toMatchObject({ ok: false, status: 400 });
  });

  it('create stops at the quota', async () => {
    await pool.query(
      `INSERT INTO shared_media (user_id, share_token, media_type, mime_type, upload_source)
       SELECT $1, 'quota' || n, 'image', 'image/png', 'studio-asset' FROM generate_series(1, 300) n`,
      [me]
    );
    await pool.query(
      `INSERT INTO studio_assets (user_id, kind, title, media_id, src, width, height, source)
       SELECT $1, 'sticker', 'x', id, 'x', 64, 64, 'upload' FROM shared_media
       WHERE share_token LIKE 'quota%'`,
      [me]
    );
    const res = await createStudioAsset(me, createBody(await insertMedia(me)));
    expect(res).toMatchObject({
      ok: false,
      status: 409,
      message: expect.stringContaining('Limit'),
    });
  });

  it('a double submit on one image creates exactly one asset', async () => {
    const token = await insertMedia(me);
    const results = await Promise.all([
      createStudioAsset(me, createBody(token)),
      createStudioAsset(me, createBody(token)),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({
      status: 409,
      message: 'Dieses Bild wird schon verwendet.',
    });
    const count = await one<{ n: number }>('SELECT count(*)::int AS n FROM studio_assets');
    expect(count.n).toBe(1);
  });

  it('the database refuses a second asset on the same image, trashed or not', async () => {
    const id = await insertAsset(me, { deleted: true });
    await expect(
      pool.query(
        `INSERT INTO studio_assets (user_id, kind, title, media_id, src, width, height, source)
         SELECT user_id, kind, title, media_id, src, width, height, source
         FROM studio_assets WHERE id = $1`,
        [id]
      )
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('update to public needs rights and marks the asset as once public', async () => {
    const id = await insertAsset(me, { visibility: 'private' });
    expect(await updateStudioAsset(me, id, { visibility: 'public' })).toMatchObject({
      status: 400,
    });
    const res = await updateStudioAsset(me, id, {
      visibility: 'public',
      rightsConfirmed: true,
      title: 'Neu',
      tags: ['a', 'a', 'b'],
    });
    expect(res).toMatchObject({ ok: true, value: { title: 'Neu', tags: ['a', 'b'] } });
    const row = await one<{ was_public: boolean }>(
      'SELECT was_public FROM studio_assets WHERE id = $1',
      [id]
    );
    expect(row.was_public).toBe(true);
  });

  it('a removed item cannot go public again; a foreign one is not found', async () => {
    const removed = await insertAsset(me, { visibility: 'private', moderation: 'removed' });
    expect(
      await updateStudioAsset(me, removed, { visibility: 'public', rightsConfirmed: true })
    ).toMatchObject({ status: 403 });
    expect(await updateStudioAsset(me, await insertAsset(other), { title: 'x' })).toMatchObject({
      status: 404,
    });
  });

  it('remove trashes only the owner’s asset', async () => {
    const mine = await insertAsset(me);
    expect(await removeStudioAsset(other, mine)).toBe(false);
    expect(await removeStudioAsset(me, mine)).toBe(true);
    const row = await one<{ deleted_at: Date | null }>(
      'SELECT deleted_at FROM studio_assets WHERE id = $1',
      [mine]
    );
    expect(row.deleted_at).not.toBeNull();
  });

  it('purge drops the file of a removed once-public asset and keeps an ok one', async () => {
    const removed = await insertAsset(me, { moderation: 'removed', deleted: true });
    const ok = await insertAsset(me, { deleted: true });
    await pool.query('UPDATE studio_assets SET was_public = TRUE WHERE id = ANY($1::uuid[])', [
      [removed, ok],
    ]);
    const tokenOf = async (id: string) =>
      (
        await one<{ share_token: string }>(
          `SELECT m.share_token FROM shared_media m
           JOIN studio_assets a ON a.media_id = m.id WHERE a.id = $1`,
          [id]
        )
      ).share_token;
    const removedToken = await tokenOf(removed);
    const okToken = await tokenOf(ok);

    expect(await purgeStudioAsset(removed, null)).toBe(true);
    expect(await purgeStudioAsset(ok, null)).toBe(true);
    const left = await pool.query<{ share_token: string }>(
      'SELECT share_token FROM shared_media WHERE share_token = ANY($1)',
      [[removedToken, okToken]]
    );
    expect(left.rows.map((r) => r.share_token)).toEqual([okToken]);
  });

  it('only public+ok or own assets can be liked/saved', async () => {
    expect(await isStudioAssetVisible(me, await insertAsset(other))).toBe(true);
    expect(
      await isStudioAssetVisible(me, await insertAsset(other, { visibility: 'private' }))
    ).toBe(false);
    expect(await isStudioAssetVisible(me, await insertAsset(other, { moderation: 'hidden' }))).toBe(
      false
    );
    expect(await isStudioAssetVisible(me, await insertAsset(me, { visibility: 'private' }))).toBe(
      true
    );
    expect(await isStudioAssetVisible(me, 'not-a-uuid')).toBe(false);
  });
});
