/**
 * Der Schreiber gegen ein echtes PostgreSQL, mit dem echten Projekt-Tor
 * (`assertCanShareToGroup`): ein Doppelklick ergibt genau eine Freigabe und
 * eine Benachrichtigung, ein privater Agent wird erst nach dem Tor gehoben,
 * und das System-Projekt bleibt Instanz-Admins vorbehalten.
 *
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests").
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { runMigrations } from '../../database/services/PostgresService/migrations.js';

import type { GroupShareWriterDeps } from './groupShareWriter.js';

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
};

vi.mock('../../database/services/PostgresService/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));

const { assertCanShareToGroup } = await import('./groupMembership.js');
const { addGroupShare, GroupShareForbiddenError, removeGroupShare } =
  await import('./groupShareWriter.js');

const owner = randomUUID();
const outsider = randomUUID();
const group = randomUUID();
const foreignGroup = randomUUID();
const systemGroup = randomUUID();

const notifyShared = vi.fn();
const closeRoom = vi.fn(async () => {});
const deps = (): GroupShareWriterDeps => ({
  postgres: adapter as unknown as GroupShareWriterDeps['postgres'],
  assertCanShare: assertCanShareToGroup,
  getNotebookCollection: vi.fn(async () => null),
  updateNotebookCollection: vi.fn(async () => ({ success: true })),
  notifyShared,
  closeRoom,
});

async function newAgent(): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO user_agents (id, user_id, identifier, title, description, system_role, avatar,
       background_color, model, provider, params, opening_message, author, share_mode)
     VALUES ($1, $2, $3, 'Agent', '', '', '', '', 'm', 'mistral', '{}', '', 'Ada', 'private')`,
    [id, owner, `agent-${id.slice(0, 8)}`]
  );
  return id;
}

const sharesOf = async (contentId: string) =>
  (
    await pool.query(
      `SELECT group_id, permissions FROM group_content_shares WHERE content_id = $1`,
      [contentId]
    )
  ).rows;

const shareModeOf = async (id: string) =>
  (await pool.query('SELECT share_mode FROM user_agents WHERE id = $1', [id])).rows[0]?.share_mode;

describe.skipIf(!url)('groupShareWriter gegen Postgres', () => {
  const dbName = `gcswriter_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    await pool.query('INSERT INTO profiles (id, display_name) VALUES ($1, $2), ($3, $4)', [
      owner,
      'Ada',
      outsider,
      'Bea',
    ]);
    await pool.query(
      `INSERT INTO groups (id, name, created_by, is_system)
       VALUES ($1, 'KV Teststadt', $2, false), ($3, 'OV Fremd', $4, false),
              ($5, 'Grünerator', $2, true)`,
      [group, owner, foreignGroup, outsider, systemGroup]
    );
    await pool.query(
      `INSERT INTO group_memberships (group_id, user_id, role, is_active)
       VALUES ($1, $2, 'member', TRUE), ($3, $4, 'admin', TRUE), ($5, $2, 'member', TRUE)`,
      [group, owner, foreignGroup, outsider, systemGroup]
    );
  });

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  it('a double click yields one share and one notification', async () => {
    const agent = await newAgent();
    notifyShared.mockClear();
    const input = {
      userId: owner,
      groupId: group,
      contentType: 'user_agents' as const,
      contentId: agent,
      permissions: { read: true, write: false },
    };
    const results = await Promise.all([
      addGroupShare(input, deps()),
      addGroupShare(input, deps()),
      addGroupShare(input, deps()),
    ]);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await sharesOf(agent)).toHaveLength(1);
    expect(notifyShared).toHaveBeenCalledTimes(1);
    expect(await shareModeOf(agent)).toBe('groups');
  });

  it('leaves a private agent private for a project the owner is not in', async () => {
    const agent = await newAgent();
    await expect(
      addGroupShare(
        {
          userId: owner,
          groupId: foreignGroup,
          contentType: 'user_agents',
          contentId: agent,
          permissions: { read: true, write: false },
        },
        deps()
      )
    ).rejects.toBeInstanceOf(GroupShareForbiddenError);
    expect(await shareModeOf(agent)).toBe('private');
    expect(await sharesOf(agent)).toHaveLength(0);
  });

  it('keeps the system project for instance admins', async () => {
    const agent = await newAgent();
    await expect(
      addGroupShare(
        {
          userId: owner,
          groupId: systemGroup,
          contentType: 'user_agents',
          contentId: agent,
          permissions: { read: true, write: false },
        },
        deps()
      )
    ).rejects.toBeInstanceOf(GroupShareForbiddenError);
    expect(await sharesOf(agent)).toHaveLength(0);
  });

  it('upserts the rights of a chat share and only then closes its room', async () => {
    const thread = randomUUID();
    const input = {
      userId: owner,
      groupId: group,
      contentType: 'chat_threads' as const,
      contentId: thread,
      onExisting: 'update-permissions' as const,
    };
    closeRoom.mockClear();
    await addGroupShare({ ...input, permissions: { read: true, write: false } }, deps());
    await addGroupShare({ ...input, permissions: { read: true, write: false } }, deps());
    expect(closeRoom).not.toHaveBeenCalled(); // same rights: nothing changed
    const changed = await addGroupShare(
      { ...input, permissions: { read: true, write: true } },
      deps()
    );
    expect(changed.created).toBe(false);
    expect(closeRoom).toHaveBeenCalledWith('chat_threads', thread);
    expect(await sharesOf(thread)).toEqual([
      { group_id: group, permissions: { read: true, write: true, collaborative: false } },
    ]);
  });

  it('removes a share, and a second removal finds nothing', async () => {
    const agent = await newAgent();
    await addGroupShare(
      {
        userId: owner,
        groupId: group,
        contentType: 'user_agents',
        contentId: agent,
        permissions: { read: true, write: false },
      },
      deps()
    );
    const target = { groupId: group, contentType: 'user_agents' as const, contentId: agent };
    expect(await removeGroupShare(target, deps())).toBe(true);
    expect(await removeGroupShare(target, deps())).toBe(false);
    expect(await sharesOf(agent)).toHaveLength(0);
  });
});
