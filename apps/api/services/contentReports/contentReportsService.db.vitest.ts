/**
 * Meldungen gegen ein echtes PostgreSQL: Doppelmeldung, eigene Inhalte, das
 * automatische Ausblenden ab drei Meldenden und die Admin-Aktionen — für
 * Sticker/Hintergründe ebenso wie für Agents, Rezepte und Vorlagen, samt dem,
 * was die öffentlichen Leser danach noch zeigen.
 *
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests") und legt sich
 * wie `studioAssetsService.db.vitest.ts` eine eigene Datenbank an.
 */
import { randomUUID } from 'node:crypto';

import { type ContentReportCreate } from '@gruenerator/contracts';
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

// The gallery module mounts routes; its auth middleware would boot Better Auth.
vi.mock('../../middleware/authMiddleware.js', () => ({ default: { requireAuth: vi.fn() } }));

const {
  AUTO_HIDE_REPORT_THRESHOLD,
  countOpenReportTargets,
  listReportGroups,
  recordContentReport,
  resolveReports,
} = await import('./contentReportsService.js');
const { restoreOwnedRow } = await import('../trash/ownedRowTrash.js');
const { STUDIO_ASSET_TRASH } = await import('../studioAssets/studioAssetTrash.js');
const { isRemovedStudioAssetShare } = await import('../studioAssets/studioAssetShare.js');
const { getPublicUserAgent, listPublicUserAgents } =
  await import('../userAgents/userAgentsRepository.js');
const { listPublicTextForms, updateTextFormSharing, upsertTextForm } =
  await import('../user/textFormRepository.js');
const { buildGalleryTemplates } = await import('../../routes/auth/templates/templateGallery.js');

const owner = randomUUID();
const reporters = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const admin = randomUUID();

/** What the file routes ask before serving the asset's image. */
async function fileRemoved(assetId: string): Promise<boolean> {
  const res = await pool.query<{ media_id: string }>(
    'SELECT media_id FROM studio_assets WHERE id = $1',
    [assetId]
  );
  return isRemovedStudioAssetShare({ id: res.rows[0]!.media_id, upload_source: 'studio-asset' });
}

async function moderationOf(id: string): Promise<string> {
  const res = await pool.query<{ moderation: string }>(
    'SELECT moderation FROM studio_assets WHERE id = $1',
    [id]
  );
  return res.rows[0]!.moderation;
}

async function insertAsset(
  o: { visibility?: string; moderation?: string; deleted?: boolean } = {}
): Promise<string> {
  const token = randomUUID().replace(/-/g, '');
  await pool.query(
    `INSERT INTO shared_media (user_id, share_token, media_type, mime_type, upload_source,
                               is_library_item, image_metadata)
     VALUES ($1, $2, 'image', 'image/png', 'studio-asset', FALSE, '{"width":512,"height":512}')`,
    [owner, token]
  );
  const res = await pool.query<{ id: string }>(
    `INSERT INTO studio_assets (user_id, kind, title, media_id, src, width, height, source,
                                visibility, moderation, deleted_at)
     SELECT $1, 'sticker', 'Sonnenblume', id, '/api/share/' || share_token || '/download',
            512, 512, 'upload', $2, $3, CASE WHEN $4 THEN now() END
     FROM shared_media WHERE share_token = $5
     RETURNING id`,
    [owner, o.visibility ?? 'public', o.moderation ?? 'ok', o.deleted ?? false, token]
  );
  return res.rows[0]!.id;
}

async function insertAgent(o: { shareMode?: string; locale?: string } = {}): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO user_agents (user_id, identifier, title, description, system_role, avatar,
                              background_color, model, provider, params, opening_message,
                              author, share_mode, is_public, locale)
     VALUES ($1, $2, 'Pressebot', 'Schreibt', 'Rolle', '', '#fff', 'm', 'mistral', '{}'::jsonb,
             'Hallo', 'Anna', $3, $4, $5)
     RETURNING id`,
    [
      owner,
      `bot-${randomUUID().slice(0, 8)}`,
      o.shareMode ?? 'authenticated',
      (o.shareMode ?? 'authenticated') === 'authenticated',
      o.locale ?? 'de-DE',
    ]
  );
  return res.rows[0]!.id;
}

async function insertRecipe(o: { isPublic?: boolean; audience?: string } = {}): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO user_text_forms (user_id, kind, mention, title, style_block, share_mode,
                                  is_public, public_ownership, audience)
     VALUES ($1, 'custom', $2, 'Pressemitteilung', 'Stil', 'authenticated', $3, 'owner', $4)
     RETURNING id`,
    [owner, `pm-${randomUUID().slice(0, 8)}`, o.isPublic ?? true, o.audience ?? 'de-DE']
  );
  return res.rows[0]!.id;
}

async function insertTemplate(o: { isPrivate?: boolean } = {}): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO user_templates (user_id, title, template_type, is_private, status, audience)
     VALUES ($1, 'Plakat', 'gruenerator', $2, 'published', 'de-DE')
     RETURNING id`,
    [owner, o.isPrivate ?? false]
  );
  return res.rows[0]!.id;
}

const TABLE_OF = {
  user_agent: 'user_agents',
  user_text_form: 'user_text_forms',
  user_template: 'user_templates',
} as const;

const INSERT_OF = {
  user_agent: () => insertAgent(),
  user_text_form: () => insertRecipe(),
  user_template: () => insertTemplate(),
} as const;

async function moderationIn(kind: keyof typeof TABLE_OF, id: string): Promise<string> {
  const res = await pool.query<{ moderation: string }>(
    `SELECT moderation FROM ${TABLE_OF[kind]} WHERE id = $1`,
    [id]
  );
  return res.rows[0]!.moderation;
}

const report = (targetId: string, o: Partial<ContentReportCreate> = {}): ContentReportCreate => ({
  kind: 'studio_asset',
  targetId,
  reason: 'offensive',
  ...o,
});

async function reportBy(n: number, assetId: string): Promise<void> {
  for (const reporter of reporters.slice(0, n)) {
    const res = await recordContentReport(reporter, report(assetId));
    expect(res.ok).toBe(true);
  }
}

describe.skipIf(!url)('Meldungen (contentReportsService)', () => {
  const dbName = `content_reports_${randomUUID().replace(/-/g, '')}`;
  const adminPool = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await adminPool.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    for (const id of [owner, ...reporters, admin]) {
      await pool.query('INSERT INTO profiles (id, display_name) VALUES ($1, $2)', [
        id,
        id === owner ? '  Sticker-Person ' : 'Jemand',
      ]);
    }
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await adminPool.end();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM content_reports');
    await pool.query('DELETE FROM studio_assets');
    await pool.query('DELETE FROM user_agents');
    await pool.query('DELETE FROM user_text_forms');
    await pool.query('DELETE FROM user_templates');
  });

  it('stores one row per reporter and target; a repeat is a no-op', async () => {
    const asset = await insertAsset();
    const first = await recordContentReport(reporters[0]!, report(asset, { note: 'eins' }));
    const again = await recordContentReport(reporters[0]!, report(asset, { reason: 'other' }));
    expect(first).toEqual({ ok: true, value: { stored: true, hidden: false } });
    expect(again).toEqual({ ok: true, value: { stored: false, hidden: false } });
    const rows = await pool.query('SELECT reason, note FROM content_reports');
    expect(rows.rows).toEqual([{ reason: 'offensive', note: 'eins' }]);
  });

  it('rejects reporting your own asset and assets that are not public and ok', async () => {
    const own = await insertAsset();
    expect(await recordContentReport(owner, report(own))).toMatchObject({
      ok: false,
      status: 400,
      message: 'Eigene Inhalte kannst du nicht melden.',
    });
    for (const asset of [
      await insertAsset({ visibility: 'private' }),
      await insertAsset({ moderation: 'hidden' }),
      await insertAsset({ moderation: 'removed' }),
      await insertAsset({ deleted: true }),
    ]) {
      expect(await recordContentReport(reporters[0]!, report(asset))).toMatchObject({
        ok: false,
        status: 404,
      });
    }
    expect(await recordContentReport(reporters[0]!, report('not-a-uuid'))).toMatchObject({
      status: 404,
    });
    expect((await pool.query('SELECT 1 FROM content_reports')).rowCount).toBe(0);
  });

  it(`hides an asset at ${AUTO_HIDE_REPORT_THRESHOLD} distinct reporters, not before`, async () => {
    const asset = await insertAsset();
    await reportBy(2, asset);
    await recordContentReport(reporters[1]!, report(asset));
    expect(await moderationOf(asset)).toBe('ok');

    const third = await recordContentReport(reporters[2]!, report(asset));
    expect(third).toEqual({ ok: true, value: { stored: true, hidden: true } });
    expect(await moderationOf(asset)).toBe('hidden');
  });

  it('hides once when the last reports arrive at the same time', async () => {
    const asset = await insertAsset();
    await reportBy(1, asset);
    const results = await Promise.all(
      reporters.slice(1, 4).map((r) => recordContentReport(r, report(asset)))
    );
    expect(await moderationOf(asset)).toBe('hidden');
    const hiddenBy = results.filter((r) => r.ok && r.value.hidden);
    expect(hiddenBy).toHaveLength(1);
  });

  it('stores reports on other kinds without a target check', async () => {
    const res = await recordContentReport(reporters[0]!, {
      kind: 'group_post',
      targetId: 'post-1',
      groupId: 'kein-uuid',
      threadId: 'thread-1',
      reason: 'harassment',
      excerpt: 'Text',
    });
    expect(res.ok).toBe(true);
    const row = await pool.query('SELECT group_id, thread_id, excerpt FROM content_reports');
    expect(row.rows[0]).toEqual({ group_id: null, thread_id: 'thread-1', excerpt: 'Text' });
  });

  it('groups reports per target with reasons, newest notes and the asset', async () => {
    const asset = await insertAsset();
    await recordContentReport(reporters[0]!, report(asset, { note: 'alt' }));
    await recordContentReport(reporters[1]!, report(asset, { reason: 'illegal', note: 'neu' }));
    const groupId = randomUUID();
    await recordContentReport(reporters[0]!, {
      kind: 'group_post',
      targetId: 'post-9',
      groupId,
      reason: 'other',
      excerpt: 'Beitrag',
    });

    const groups = await listReportGroups({ status: 'open' });
    expect(groups).toHaveLength(2);
    const assetGroup = groups.find((g) => g.kind === 'studio_asset')!;
    expect(assetGroup).toMatchObject({
      targetId: asset,
      reportCount: 2,
      status: 'open',
      target: {
        id: asset,
        kind: 'sticker',
        moderation: 'ok',
        ownerId: owner,
        ownerName: 'Sticker-Person',
      },
    });
    expect(assetGroup.reasons).toEqual(
      expect.arrayContaining([
        { reason: 'offensive', count: 1 },
        { reason: 'illegal', count: 1 },
      ])
    );
    expect(assetGroup.notes.map((n) => n.note)).toEqual(['neu', 'alt']);

    const postGroup = groups.find((g) => g.kind === 'group_post')!;
    expect(postGroup).toMatchObject({ excerpt: 'Beitrag', groupId, target: null });
    expect(groups[0]!.kind).toBe('group_post');

    expect(await listReportGroups({ status: 'open', kind: 'group_post' })).toHaveLength(1);
    expect(await listReportGroups({ status: 'resolved' })).toEqual([]);
    expect(await countOpenReportTargets()).toBe(2);
  });

  it('a trashed asset stays a target the admin can remove; restoring it keeps the removal', async () => {
    const asset = await insertAsset();
    await reportBy(1, asset);
    await pool.query('UPDATE studio_assets SET deleted_at = now() WHERE id = $1', [asset]);
    const [group] = await listReportGroups({ status: 'open' });
    expect(group).toMatchObject({ targetId: asset, target: { id: asset, trashed: true } });

    const res = await resolveReports(admin, {
      kind: 'studio_asset',
      targetId: asset,
      action: 'remove',
    });
    expect(res).toEqual({ ok: true, value: { resolved: 1, moderation: 'removed' } });
    expect(await moderationOf(asset)).toBe('removed');
    expect(await fileRemoved(asset)).toBe(true);

    expect(await restoreOwnedRow(STUDIO_ASSET_TRASH, owner, asset)).toBe('ok');
    expect(await moderationOf(asset)).toBe('removed');
    const [after] = await listReportGroups({ status: 'resolved' });
    expect(after!.target).toMatchObject({ trashed: false, moderation: 'removed' });
    expect(await fileRemoved(asset)).toBe(true);
  });

  it('remove takes the asset down and resolves every open report', async () => {
    const asset = await insertAsset();
    await reportBy(2, asset);
    const res = await resolveReports(admin, {
      kind: 'studio_asset',
      targetId: asset,
      action: 'remove',
    });
    expect(res).toEqual({ ok: true, value: { resolved: 2, moderation: 'removed' } });
    expect(await moderationOf(asset)).toBe('removed');
    const rows = await pool.query(
      'SELECT DISTINCT status, resolution, resolved_by FROM content_reports'
    );
    expect(rows.rows).toEqual([{ status: 'resolved', resolution: 'removed', resolved_by: admin }]);
    expect(await countOpenReportTargets()).toBe(0);
    expect(await listReportGroups({ status: 'resolved' })).toHaveLength(1);
  });

  it('restore brings a hidden or removed asset back', async () => {
    const asset = await insertAsset();
    await reportBy(3, asset);
    expect(await moderationOf(asset)).toBe('hidden');
    expect(await fileRemoved(asset)).toBe(false);
    const res = await resolveReports(admin, {
      kind: 'studio_asset',
      targetId: asset,
      action: 'restore',
    });
    expect(res).toEqual({ ok: true, value: { resolved: 3, moderation: 'ok' } });

    await pool.query("UPDATE studio_assets SET moderation = 'removed' WHERE id = $1", [asset]);
    const later = await resolveReports(admin, {
      kind: 'studio_asset',
      targetId: asset,
      action: 'restore',
    });
    expect(later).toEqual({ ok: true, value: { resolved: 0, moderation: 'ok' } });
    expect(await fileRemoved(asset)).toBe(false);
    const rows = await pool.query('SELECT DISTINCT status, resolution FROM content_reports');
    expect(rows.rows).toEqual([{ status: 'resolved', resolution: 'restored' }]);
  });

  it('dismiss lifts an auto-hide but leaves a removal alone', async () => {
    const hidden = await insertAsset();
    await reportBy(3, hidden);
    expect(
      await resolveReports(admin, { kind: 'studio_asset', targetId: hidden, action: 'dismiss' })
    ).toEqual({ ok: true, value: { resolved: 3, moderation: 'ok' } });
    const rows = await pool.query('SELECT DISTINCT status, resolution FROM content_reports');
    expect(rows.rows).toEqual([{ status: 'dismissed', resolution: 'dismissed' }]);

    const removed = await insertAsset();
    await reportBy(1, removed);
    await pool.query("UPDATE studio_assets SET moderation = 'removed' WHERE id = $1", [removed]);
    expect(
      await resolveReports(admin, { kind: 'studio_asset', targetId: removed, action: 'dismiss' })
    ).toEqual({ ok: true, value: { resolved: 1, moderation: 'removed' } });
  });

  it('a dismissed report no longer counts towards the threshold', async () => {
    const asset = await insertAsset();
    await reportBy(2, asset);
    await resolveReports(admin, { kind: 'studio_asset', targetId: asset, action: 'dismiss' });
    await recordContentReport(reporters[2]!, report(asset));
    expect(await moderationOf(asset)).toBe('ok');
  });

  it('the same reporter can report again once the earlier report is dismissed', async () => {
    const asset = await insertAsset();
    await reportBy(1, asset);
    await resolveReports(admin, { kind: 'studio_asset', targetId: asset, action: 'dismiss' });
    const again = await recordContentReport(reporters[0]!, report(asset, { reason: 'illegal' }));
    expect(again).toEqual({ ok: true, value: { stored: true, hidden: false } });
    const repeat = await recordContentReport(reporters[0]!, report(asset));
    expect(repeat).toEqual({ ok: true, value: { stored: false, hidden: false } });
    const rows = await pool.query('SELECT status, reason FROM content_reports ORDER BY created_at');
    expect(rows.rows).toEqual([
      { status: 'dismissed', reason: 'offensive' },
      { status: 'open', reason: 'illegal' },
    ]);
  });

  it('a stale dismiss without open reports leaves a hidden asset hidden', async () => {
    const asset = await insertAsset();
    await reportBy(3, asset);
    await resolveReports(admin, { kind: 'studio_asset', targetId: asset, action: 'remove' });
    await pool.query("UPDATE studio_assets SET moderation = 'hidden' WHERE id = $1", [asset]);
    expect(
      await resolveReports(admin, { kind: 'studio_asset', targetId: asset, action: 'dismiss' })
    ).toMatchObject({ ok: false, status: 404 });
    expect(await moderationOf(asset)).toBe('hidden');
  });

  it('other kinds: remove and dismiss close the reports, restore is refused', async () => {
    await recordContentReport(reporters[0]!, {
      kind: 'chat_message',
      targetId: 'msg-1',
      reason: 'false_information',
    });
    const body = { kind: 'chat_message' as const, targetId: 'msg-1' };
    expect(await resolveReports(admin, { ...body, action: 'restore' })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(await resolveReports(admin, { ...body, action: 'remove' })).toEqual({
      ok: true,
      value: { resolved: 1, moderation: null },
    });
    expect(await resolveReports(admin, { ...body, action: 'dismiss' })).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it.each(['user_agent', 'user_text_form', 'user_template'] as const)(
    'reports on a public %s: own refused, hidden at the threshold, restore and remove',
    async (kind) => {
      const id = await INSERT_OF[kind]();
      expect(await recordContentReport(owner, report(id, { kind }))).toMatchObject({
        ok: false,
        status: 400,
      });
      for (const reporter of reporters.slice(0, 2)) {
        await recordContentReport(reporter, report(id, { kind }));
      }
      expect(await moderationIn(kind, id)).toBe('ok');
      expect(await recordContentReport(reporters[2]!, report(id, { kind }))).toEqual({
        ok: true,
        value: { stored: true, hidden: true },
      });
      expect(await moderationIn(kind, id)).toBe('hidden');
      expect(await recordContentReport(reporters[3]!, report(id, { kind }))).toMatchObject({
        status: 404,
      });

      expect(await resolveReports(admin, { kind, targetId: id, action: 'remove' })).toEqual({
        ok: true,
        value: { resolved: 3, moderation: 'removed' },
      });
      expect(await resolveReports(admin, { kind, targetId: id, action: 'restore' })).toEqual({
        ok: true,
        value: { resolved: 0, moderation: 'ok' },
      });
    }
  );

  it('only publicly reachable agents, recipes and Vorlagen can be reported', async () => {
    for (const [kind, id] of [
      ['user_agent', await insertAgent({ shareMode: 'groups' })],
      ['user_text_form', await insertRecipe({ isPublic: false })],
      ['user_template', await insertTemplate({ isPrivate: true })],
    ] as const) {
      expect(await recordContentReport(reporters[0]!, report(id, { kind }))).toMatchObject({
        ok: false,
        status: 404,
      });
    }
  });

  it('previews every moderatable kind in the queue, trashed ones too', async () => {
    const agent = await insertAgent();
    const recipe = await insertRecipe();
    const template = await insertTemplate();
    const asset = await insertAsset();
    await recordContentReport(reporters[0]!, report(agent, { kind: 'user_agent' }));
    await recordContentReport(reporters[0]!, report(recipe, { kind: 'user_text_form' }));
    await recordContentReport(reporters[0]!, report(template, { kind: 'user_template' }));
    await recordContentReport(reporters[0]!, report(asset));
    await pool.query('UPDATE user_text_forms SET deleted_at = now() WHERE id = $1', [recipe]);
    await pool.query("UPDATE studio_assets SET moderation = 'removed' WHERE id = $1", [asset]);

    const groups = await listReportGroups({ status: 'open' });
    const byKind = new Map(groups.map((g) => [g.kind, g]));
    const ownerPart = { ownerId: owner, ownerName: 'Sticker-Person' };
    expect(byKind.get('user_agent')).toMatchObject({
      target: null,
      preview: {
        title: 'Pressebot',
        thumbUrl: null,
        moderation: 'ok',
        trashed: false,
        ...ownerPart,
      },
    });
    expect(byKind.get('user_agent')!.preview!.href).toMatch(/^\/agentura\/agent\/bot-/);
    expect(byKind.get('user_text_form')).toMatchObject({
      preview: { title: 'Pressemitteilung', trashed: true, ...ownerPart },
    });
    expect(byKind.get('user_template')).toMatchObject({
      preview: { title: 'Plakat', href: `/vorlagen/v/${template}`, ...ownerPart },
    });
    const assetGroup = byKind.get('studio_asset')!;
    expect(assetGroup.target).toMatchObject({ id: asset, moderation: 'removed' });
    // The signed thumbnail is blocked once removed; the preview points at the file.
    expect(assetGroup.preview).toMatchObject({
      thumbUrl: assetGroup.target!.src,
      moderation: 'removed',
    });
  });

  it('public readers drop hidden items; link access only refuses removed ones', async () => {
    const agent = await insertAgent();
    const identifier = (
      await pool.query<{ identifier: string }>('SELECT identifier FROM user_agents WHERE id = $1', [
        agent,
      ])
    ).rows[0]!.identifier;
    const recipe = await insertRecipe();
    const template = await insertTemplate();
    const listed = async () => ({
      agents: (await listPublicUserAgents(reporters[0]!, 'de-DE')).map((a) => a.id),
      recipes: (await listPublicTextForms('de-DE')).map((f) => f.id),
      templates: (await buildGalleryTemplates({ audience: 'de-DE' })).map((t) => t.id),
    });
    expect(await listed()).toEqual({ agents: [agent], recipes: [recipe], templates: [template] });

    for (const table of ['user_agents', 'user_text_forms', 'user_templates']) {
      await pool.query(`UPDATE ${table} SET moderation = 'hidden'`);
    }
    expect(await listed()).toEqual({ agents: [], recipes: [], templates: [] });
    expect((await getPublicUserAgent(identifier))?.id).toBe(agent);

    await pool.query("UPDATE user_agents SET moderation = 'removed'");
    expect(await getPublicUserAgent(identifier)).toBeUndefined();
  });

  it('the public recipe listing shows the viewer country plus all', async () => {
    const de = await insertRecipe({ audience: 'de-DE' });
    const at = await insertRecipe({ audience: 'de-AT' });
    const all = await insertRecipe({ audience: 'all' });
    const ids = async (locale: string) =>
      (await listPublicTextForms(locale)).map((f) => f.id).sort();
    expect(await ids('de-DE')).toEqual([de, all].sort());
    expect(await ids('de-AT')).toEqual([at, all].sort());
  });

  it('a new recipe takes its owner locale as audience', async () => {
    await pool.query("UPDATE profiles SET locale = 'de-AT' WHERE id = $1", [owner]);
    try {
      const form = await upsertTextForm(owner, {
        kind: 'custom',
        mention: 'wahlaufruf',
        title: 'Wahlaufruf',
        examples: [],
        styleBlock: 'Stil',
      });
      const res = await pool.query<{ audience: string }>(
        'SELECT audience FROM user_text_forms WHERE id = $1',
        [form.id]
      );
      expect(res.rows[0]!.audience).toBe('de-AT');
    } finally {
      await pool.query('UPDATE profiles SET locale = NULL WHERE id = $1', [owner]);
    }
  });

  it('a removed recipe cannot be listed publicly again', async () => {
    const recipe = await insertRecipe({ isPublic: false });
    const { mention } = (
      await pool.query<{ mention: string }>(
        "UPDATE user_text_forms SET moderation = 'removed' WHERE id = $1 RETURNING mention",
        [recipe]
      )
    ).rows[0]!;
    expect(
      await updateTextFormSharing(owner, mention, { is_public: true, public_ownership: 'owner' })
    ).toEqual({ ok: false, reason: 'removed' });
    expect(await updateTextFormSharing(owner, mention, { share_mode: 'groups' })).toEqual({
      ok: true,
      updated: true,
    });
  });
});
