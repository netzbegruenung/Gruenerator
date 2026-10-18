/**
 * Kommentare und Beitrags-Reaktionen gegen ein echtes PostgreSQL: offizielle
 * Agents sind kommentierbar, fremde private Beiträge nicht, die Migration
 * übernimmt alte Agent- und Vorlagen-Kommentare mit ihren ids und Reaktionen,
 * Sticker tragen Reaktionen, und Purge/Kontolöschung räumen ab.
 *
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` und legt sich wie
 * `contentReportsService.db.vitest.ts` eine eigene Datenbank an.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  queryOne: async (text: string, params?: unknown[]): Promise<unknown> =>
    (await pool.query<Record<string, unknown>>(text, params)).rows[0] ?? null,
  exec: async (text: string, params?: unknown[]) => {
    const res = await pool.query(text, params);
    return { changes: res.rowCount ?? 0 };
  },
};

vi.mock('../../database/services/PostgresService/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));
vi.mock('../../middleware/authMiddleware.js', () => ({ default: { requireAuth: vi.fn() } }));

const { createEntityComment, deleteEntityComment, listEntityComments } =
  await import('./entityCommentsService.js');
const { deleteCommentsForEntity, deleteCommentsOnItemsOfDeletedUser } =
  await import('./entityCommentsCleanup.js');
const { addItemReaction, addReaction } =
  await import('../entityReactions/EntityReactionsService.js');
const { reactionTargets } = await import('../entityReactions/reactionTargets.js');

const MIGRATION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../database/postgres/migrations/zz_20261020_entity_comments.sql'
);
const OFFICIAL_AGENT = 'gruenerator-universal';

const owner = randomUUID();
const viewer = randomUUID();
const stranger = randomUUID();

async function insertAgent(shareMode: 'private' | 'authenticated'): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO user_agents (user_id, identifier, title, description, system_role, avatar,
                              background_color, model, provider, params, opening_message,
                              author, share_mode, is_public, locale)
     VALUES ($1, $2, 'Pressebot', 'Schreibt', 'Rolle', '', '#fff', 'm', 'mistral', '{}'::jsonb,
             'Hallo', 'Anna', $3, $4, 'de-DE')
     RETURNING id`,
    [owner, `bot-${randomUUID().slice(0, 8)}`, shareMode, shareMode === 'authenticated']
  );
  return res.rows[0]!.id;
}

async function insertAsset(visibility: 'public' | 'private'): Promise<string> {
  const token = randomUUID().replace(/-/g, '');
  await pool.query(
    `INSERT INTO shared_media (user_id, share_token, media_type, mime_type, upload_source,
                               is_library_item, image_metadata)
     VALUES ($1, $2, 'image', 'image/png', 'studio-asset', FALSE, '{"width":512,"height":512}')`,
    [owner, token]
  );
  const res = await pool.query<{ id: string }>(
    `INSERT INTO studio_assets (user_id, kind, title, media_id, src, width, height, source,
                                visibility)
     SELECT $1, 'sticker', 'Sonnenblume', id, '/api/share/' || share_token || '/download',
            512, 512, 'upload', $2
     FROM shared_media WHERE share_token = $3
     RETURNING id`,
    [owner, visibility, token]
  );
  return res.rows[0]!.id;
}

async function comment(
  entityType: 'agent' | 'studio_asset',
  entityId: string,
  userId: string,
  body: string,
  parentId: string | null = null
): Promise<string> {
  const out = await createEntityComment({ entityType, entityId, userId, body, parentId });
  if (out.status !== 201) throw new Error(`comment failed: ${JSON.stringify(out)}`);
  return out.data.id;
}

describe.skipIf(!url)('Kommentare an Marktplatz-Beiträgen (entityCommentsService)', () => {
  const dbName = `entity_comments_${randomUUID().replace(/-/g, '')}`;
  const adminPool = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await adminPool.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    for (const [id, name] of [
      [owner, 'Anna'],
      [viewer, 'Ben'],
      [stranger, 'Cleo'],
    ] as const) {
      await pool.query('INSERT INTO profiles (id, display_name) VALUES ($1, $2)', [id, name]);
    }
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await adminPool.end();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM entity_reactions');
    await pool.query('DELETE FROM entity_comments');
    await pool.query('DELETE FROM agent_comments');
    await pool.query('DELETE FROM template_comments');
    await pool.query('DELETE FROM user_agents');
    await pool.query('DELETE FROM studio_assets');
  });

  it('an official agent is commentable; replies hang one level deep', async () => {
    const top = await comment('agent', OFFICIAL_AGENT, viewer, '  Super Agent  ');
    const reply = await comment('agent', OFFICIAL_AGENT, stranger, 'Finde ich auch', top);
    const replyToReply = await comment('agent', OFFICIAL_AGENT, viewer, 'Danke', reply);

    const out = await listEntityComments('agent', OFFICIAL_AGENT, stranger);
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    expect(out.data.comments.map((c) => [c.id, c.parentId, c.body, c.authorName])).toEqual([
      [top, null, 'Super Agent', 'Ben'],
      [reply, top, 'Finde ich auch', 'Cleo'],
      [replyToReply, top, 'Danke', 'Ben'],
    ]);
    expect(out.data.comments[0]).toMatchObject({ entityType: 'agent', entityId: OFFICIAL_AGENT });

    // An unknown identifier is no item.
    expect((await listEntityComments('agent', 'gibt-es-nicht', viewer)).status).toBe(403);
  });

  it('a foreign private agent answers 403 for list, comment and delete', async () => {
    const agent = await insertAgent('private');
    const own = await comment('agent', agent, owner, 'Notiz für mich');

    expect(await listEntityComments('agent', agent, stranger)).toMatchObject({ status: 403 });
    expect(
      await createEntityComment({
        entityType: 'agent',
        entityId: agent,
        userId: stranger,
        body: 'Hallo',
        parentId: null,
      })
    ).toMatchObject({ status: 403 });
    expect(
      await deleteEntityComment({
        entityType: 'agent',
        entityId: agent,
        commentId: own,
        userId: stranger,
      })
    ).toMatchObject({ status: 403 });
    expect((await listEntityComments('agent', agent, owner)).status).toBe(200);
  });

  it('delete: the author and the item owner may, anyone else may not', async () => {
    const agent = await insertAgent('authenticated');
    const a = await comment('agent', agent, viewer, 'eins');
    const b = await comment('agent', agent, viewer, 'zwei');
    const del = (commentId: string, userId: string) =>
      deleteEntityComment({ entityType: 'agent', entityId: agent, commentId, userId });

    expect(await del(a, stranger)).toMatchObject({ status: 403 });
    expect(await del(a, viewer)).toEqual({ status: 200, data: null });
    expect(await del(b, owner)).toEqual({ status: 200, data: null });
    expect(await del(b, owner)).toMatchObject({ status: 404 });
  });

  it('a hidden comment stays visible to its author only', async () => {
    const agent = await insertAgent('authenticated');
    const id = await comment('agent', agent, viewer, 'gemeldet');
    await pool.query(`UPDATE entity_comments SET moderation = 'hidden' WHERE id = $1`, [id]);

    const ids = async (userId: string) => {
      const out = await listEntityComments('agent', agent, userId);
      return out.status === 200 ? out.data.comments.map((c) => c.id) : null;
    };
    expect(await ids(viewer)).toEqual([id]);
    expect(await ids(stranger)).toEqual([]);
    expect(await reactionTargets.entity_comment(stranger, id, null)).toEqual({
      access: 'not_found',
    });
  });

  it('item reactions on a sticker ride along with its comments', async () => {
    const sticker = await insertAsset('public');
    const c = await comment('studio_asset', sticker, viewer, 'Schön');
    expect(await reactionTargets.marketplace_item(stranger, sticker, 'studio_asset')).toEqual({
      access: 'ok',
    });
    await addItemReaction(stranger, 'studio_asset', sticker, '🎉');
    await addItemReaction(stranger, 'studio_asset', sticker, '🎉');
    await addItemReaction(viewer, 'studio_asset', sticker, '🎉');
    await addReaction(stranger, 'entity_comment', c, '👍');

    const out = await listEntityComments('studio_asset', sticker, viewer);
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    expect(out.data.reactions).toEqual([{ emoji: '🎉', count: 2, reacted: true }]);
    expect(out.data.comments[0]!.reactions).toEqual([{ emoji: '👍', count: 1, reacted: false }]);

    const privateSticker = await insertAsset('private');
    expect(
      await reactionTargets.marketplace_item(stranger, privateSticker, 'studio_asset')
    ).toEqual({ access: 'not_found' });
    expect(await reactionTargets.marketplace_item(stranger, sticker, null)).toEqual({
      access: 'not_found',
    });
  });

  it('the migration copies old comments with their ids and moves the reactions', async () => {
    const agent = await insertAgent('authenticated');
    const parent = randomUUID();
    const reply = randomUUID();
    const tmplComment = randomUUID();
    await pool.query(
      `INSERT INTO agent_comments (id, agent_id, user_id, body, parent_id, created_at)
       VALUES ($1, $3, $4, 'oben', NULL, now() - interval '2 minutes'),
              ($2, $3, $5, 'Antwort', $1, now() - interval '1 minute')`,
      [parent, reply, agent, viewer, stranger]
    );
    await pool.query(
      `INSERT INTO template_comments (id, template_id, user_id, body) VALUES ($1, 'kat-1', $2, 'Vorlage')`,
      [tmplComment, viewer]
    );
    for (const [column, emoji, id] of [
      ['agent_comment_id', '👍', parent],
      ['template_comment_id', '🎉', tmplComment],
      ['agent_id', '🚀', agent],
    ] as const) {
      await pool.query(
        `INSERT INTO entity_reactions (user_id, emoji, ${column}) VALUES ($1, $2, $3)`,
        [stranger, emoji, id]
      );
    }

    // Same file the runner applied; it must be safe to run again.
    await pool.query(fs.readFileSync(MIGRATION, 'utf8'));

    const rows = await pool.query(
      `SELECT id, entity_type, entity_id, user_id, body, parent_id FROM entity_comments ORDER BY body COLLATE "C"`
    );
    expect(rows.rows).toEqual([
      {
        id: reply,
        entity_type: 'agent',
        entity_id: agent,
        user_id: stranger,
        body: 'Antwort',
        parent_id: parent,
      },
      {
        id: tmplComment,
        entity_type: 'template',
        entity_id: 'kat-1',
        user_id: viewer,
        body: 'Vorlage',
        parent_id: null,
      },
      {
        id: parent,
        entity_type: 'agent',
        entity_id: agent,
        user_id: viewer,
        body: 'oben',
        parent_id: null,
      },
    ]);

    const reactions = await pool.query(
      `SELECT emoji, entity_comment_id, item_type, item_id, agent_id, agent_comment_id,
              template_comment_id
         FROM entity_reactions ORDER BY emoji`
    );
    const legacy = { agent_id: null, agent_comment_id: null, template_comment_id: null };
    expect(reactions.rows).toEqual(
      expect.arrayContaining([
        { emoji: '👍', entity_comment_id: parent, item_type: null, item_id: null, ...legacy },
        { emoji: '🎉', entity_comment_id: tmplComment, item_type: null, item_id: null, ...legacy },
        { emoji: '🚀', entity_comment_id: null, item_type: 'agent', item_id: agent, ...legacy },
      ])
    );

    const out = await listEntityComments('agent', agent, stranger);
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    expect(out.data.reactions).toEqual([{ emoji: '🚀', count: 1, reacted: true }]);
    expect(out.data.comments.map((c) => [c.id, c.parentId, c.reactions])).toEqual([
      [parent, null, [{ emoji: '👍', count: 1, reacted: true }]],
      [reply, parent, []],
    ]);
  });

  it('purge and account deletion remove comments and item reactions on the items', async () => {
    const agent = await insertAgent('authenticated');
    const sticker = await insertAsset('public');
    const onAgent = await comment('agent', agent, viewer, 'am Agent');
    await addReaction(stranger, 'entity_comment', onAgent, '👍');
    await addItemReaction(viewer, 'agent', agent, '🎉');
    await comment('studio_asset', sticker, viewer, 'am Sticker');
    await addItemReaction(viewer, 'studio_asset', sticker, '🎉');
    await comment('agent', OFFICIAL_AGENT, owner, 'bleibt');

    await deleteCommentsForEntity('agent', agent);
    const count = async (sql: string) => Number((await pool.query(sql)).rows[0].n);
    expect(
      await count(
        `SELECT count(*) AS n FROM entity_comments WHERE entity_type = 'agent' AND entity_id <> '${OFFICIAL_AGENT}'`
      )
    ).toBe(0);
    expect(
      await count(
        `SELECT count(*) AS n FROM entity_reactions WHERE item_type = 'agent' OR entity_comment_id IS NOT NULL`
      )
    ).toBe(0);

    // Trashed rows count as the person's items too.
    await pool.query('UPDATE studio_assets SET deleted_at = now() WHERE id = $1', [sticker]);
    await deleteCommentsOnItemsOfDeletedUser(owner);
    expect(
      await count(`SELECT count(*) AS n FROM entity_comments WHERE entity_type = 'studio_asset'`)
    ).toBe(0);
    expect(await count(`SELECT count(*) AS n FROM entity_reactions`)).toBe(0);
    // Their own comments elsewhere stay.
    expect(
      await count(`SELECT count(*) AS n FROM entity_comments WHERE entity_id = '${OFFICIAL_AGENT}'`)
    ).toBe(1);
  });
});
