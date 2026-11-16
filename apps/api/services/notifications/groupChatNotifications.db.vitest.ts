/**
 * Who gets told about a team chat message, against a real PostgreSQL: owner and
 * everyone who has written in the thread — if still an active member of the
 * Projekt. The unit test only pins the SQL text.
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests").
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { runMigrations } from '../../database/services/PostgresService/migrations.js';

let pool: pg.Pool;
const url = process.env.MIGRATIONS_TEST_DATABASE_URL;

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
const createNotificationsForUsers = vi.fn(async () => []);
vi.mock('./NotificationService.js', () => ({ createNotificationsForUsers }));

const { notifyTeamChatParticipants } = await import('./groupChatNotifications.js');

const OWNER = randomUUID();
const SENDER = randomUUID();
const PARTICIPANT = randomUUID();
const LURKER = randomUUID(); // active member, never wrote
const FORMER = randomUUID(); // wrote, then left the Projekt
const STRANGER = randomUUID(); // wrote (e.g. via a link), never a member
const GROUP = randomUUID();
const THREAD = randomUUID();

describe.skipIf(!url)('notifyTeamChatParticipants gegen Postgres', () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    expect(await runMigrations(pool)).toBe(true);
    for (const id of [OWNER, SENDER, PARTICIPANT, LURKER, FORMER, STRANGER]) {
      await pool.query(`INSERT INTO profiles (id, email) VALUES ($1, $2)`, [
        id,
        `${id}@example.invalid`,
      ]);
    }
    await pool.query(`INSERT INTO groups (id, name, group_type) VALUES ($1, 'P', 'standard')`, [
      GROUP,
    ]);
    for (const [u, active] of [
      [OWNER, true],
      [SENDER, true],
      [PARTICIPANT, true],
      [LURKER, true],
      [FORMER, false],
    ] as const) {
      await pool.query(
        `INSERT INTO group_memberships (group_id, user_id, is_active) VALUES ($1, $2, $3)`,
        [GROUP, u, active]
      );
    }
    await pool.query(
      `INSERT INTO chat_threads (id, user_id, group_id, slug_suffix) VALUES ($1, $2, $3, 'abc234')`,
      [THREAD, OWNER, GROUP]
    );
    await pool.query(
      `INSERT INTO group_content_shares (group_id, shared_by_user_id, content_type, content_id, permissions)
       VALUES ($1, $2, 'chat_threads', $3, '{"read":true,"write":true}'::jsonb)`,
      [GROUP, OWNER, THREAD]
    );
    for (const [i, u] of [SENDER, PARTICIPANT, FORMER, STRANGER].entries()) {
      await pool.query(
        `INSERT INTO chat_messages (thread_id, role, user_id, content, created_at)
         VALUES ($1, 'user', $2, 'x', now() + ($3 || ' seconds')::interval)`,
        [THREAD, u, String(i)]
      );
    }
  });
  afterAll(async () => {
    await pool?.end();
  });

  it('notifies owner and active participants, nobody else, never the sender', async () => {
    createNotificationsForUsers.mockClear();
    await notifyTeamChatParticipants({
      threadId: THREAD,
      senderId: SENDER,
      senderName: 'Anna',
      threadTitle: 'Plakate',
    });
    expect(createNotificationsForUsers).toHaveBeenCalledOnce();
    const recipients = (createNotificationsForUsers.mock.calls[0] as unknown[])[0] as string[];
    expect([...recipients].sort()).toEqual([OWNER, PARTICIPANT].sort());
    for (const nobody of [LURKER, FORMER, STRANGER, SENDER]) {
      expect(recipients).not.toContain(nobody);
    }
  });

  it('a read-only share (no team chat) notifies nobody', async () => {
    await pool.query(
      `UPDATE group_content_shares SET permissions = '{"read":true,"write":false}'::jsonb
        WHERE content_id = $1`,
      [THREAD]
    );
    createNotificationsForUsers.mockClear();
    await notifyTeamChatParticipants({
      threadId: THREAD,
      senderId: SENDER,
      senderName: 'Anna',
      threadTitle: 'Plakate',
    });
    expect(createNotificationsForUsers).not.toHaveBeenCalled();
  });
});
