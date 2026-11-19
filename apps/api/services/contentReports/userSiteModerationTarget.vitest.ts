/**
 * The published-site entry of the moderation registry. No Postgres here: the
 * statements are captured and their WHERE clauses rendered, so what a reporter
 * may reach and what an admin may still touch is read off the SQL.
 */
import { type SQL, sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Step = { method: string; args: unknown[] };
const state = vi.hoisted(() => ({
  steps: [] as Step[],
  rows: [] as Record<string, unknown>[],
}));

const chain = (): unknown =>
  new Proxy(() => undefined, {
    get(_target, method: string) {
      if (method === 'then') {
        return (resolve: (rows: unknown) => unknown) => resolve(state.rows);
      }
      return (...args: unknown[]) => {
        state.steps.push({ method, args });
        return chain();
      };
    },
  });

vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => chain(),
}));
vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: function NotebookQdrantHelper() {
    return {};
  },
}));

const { MODERATION_TARGETS } = await import('./moderationTargets.js');
const target = MODERATION_TARGETS.user_site;

const ID = '00000000-0000-4000-8000-0000000000aa';
const dialect = new PgDialect();
const render = (clause: unknown) => {
  const { sql: text, params } = dialect.sqlToQuery(clause as SQL);
  return { text, params };
};
const whereOf = (method = 'where') => {
  const step = state.steps.find((s) => s.method === method);
  if (!step) throw new Error(`no ${method} step`);
  return render(step.args[0]);
};
const db = () => chain() as never;

beforeEach(() => {
  state.steps = [];
  state.rows = [];
});

describe('user site moderation target', () => {
  it('is reportable only for a live, published, unhidden site with a snapshot', async () => {
    state.rows = [{ ownerId: 'owner' }];
    expect(await target.loadReportable(ID)).toEqual({ ownerId: 'owner' });

    const { text, params } = whereOf();
    expect(text).toContain('"user_sites"."is_published" = $');
    expect(text).toContain('"user_sites"."published_snapshot" is not null');
    expect(text).toContain('"user_sites"."moderation" = $');
    expect(text).toContain('"user_sites"."deleted_at" is null');
    expect(params).toEqual(expect.arrayContaining([ID, true, 'ok']));
  });

  it('returns null when no row matches (trashed, unpublished or hidden)', async () => {
    state.rows = [];
    expect(await target.loadReportable(ID)).toBeNull();
  });

  it('hides from `ok` only, under the report condition', async () => {
    state.rows = [{ id: ID }];
    expect(await target.hideIf(db(), ID, sql`marker_condition`)).toBe(true);

    const set = state.steps.find((s) => s.method === 'set');
    expect(set?.args[0]).toMatchObject({ moderation: 'hidden' });
    const { text, params } = whereOf();
    expect(text).toContain('marker_condition');
    expect(text).toContain('"user_sites"."moderation" = $');
    expect(text).toContain('"user_sites"."published_snapshot" is not null');
    expect(text).toContain('"user_sites"."deleted_at" is null');
    expect(params).toEqual(expect.arrayContaining(['ok']));

    state.steps = [];
    state.rows = [];
    expect(await target.hideIf(db(), ID, sql`marker_condition`)).toBe(false);
  });

  it('honours `onlyFrom` and reaches trashed rows', async () => {
    state.rows = [{ moderation: 'ok' }];
    expect(await target.setModeration(db(), ID, 'ok', 'hidden')).toBe('ok');

    const { text, params } = whereOf();
    expect(text).toContain('"user_sites"."moderation" = $');
    expect(params).toEqual(expect.arrayContaining([ID, 'hidden']));
    expect(text).not.toContain('deleted_at');
    expect(state.steps.find((s) => s.method === 'set')?.args[0]).toMatchObject({
      moderation: 'ok',
    });

    state.steps = [];
    await target.setModeration(db(), ID, 'removed');
    const without = whereOf();
    expect(without.params).toEqual([ID]);
  });

  it('returns null when the site does not exist', async () => {
    state.rows = [];
    expect(await target.setModeration(db(), ID, 'removed')).toBeNull();
  });

  it('previews each site with its title, owner and state, and no link yet', async () => {
    state.rows = [
      {
        id: ID,
        title: 'Anna Muster',
        moderation: 'hidden',
        ownerId: 'owner',
        ownerName: ' Anna ',
        deletedAt: null,
      },
      {
        id: 'other',
        title: 'Orphan',
        moderation: 'ok',
        ownerId: null,
        ownerName: null,
        deletedAt: null,
      },
    ];
    const previews = await target.previews([ID, 'other']);
    expect(previews.get(ID)).toEqual({
      title: 'Anna Muster',
      thumbUrl: null,
      href: null,
      ownerId: 'owner',
      ownerName: 'Anna',
      moderation: 'hidden',
      trashed: false,
    });
    expect(previews.has('other')).toBe(false);
  });

  it('previews nothing for no ids', async () => {
    expect((await target.previews([])).size).toBe(0);
    expect(state.steps).toEqual([]);
  });
});
