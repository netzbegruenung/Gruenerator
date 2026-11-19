/**
 * AuthService — the entire Hocuspocus WebSocket authorization surface, which was
 * previously untested. Covers:
 *  - guest (no-credential) access gated on share_mode / share_permission,
 *    including that 'public' + 'editor' yields anonymous read-WRITE;
 *  - the removal of the forgeable HS256 token branch: a self-signed JWT no longer
 *    authenticates; only a Better Auth session (bearer/cookie) does;
 *  - the auto-grant of a persisted permission entry in 'authenticated' mode;
 *  - the `gm.is_active = TRUE` clause on every group-membership lookup.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.js';

import type { DbQueryFn, RedisLike } from './types.js';

interface Rows {
  doc?: Record<string, unknown> | null;
  group?: { read?: boolean; write?: boolean } | null;
  membership?: boolean;
  thread?: Record<string, unknown> | null;
  /** The group behind `group`/`membership` is in the Papierkorb. */
  groupTrashed?: boolean;
  displayName?: string;
  profilesFail?: boolean;
  /** The `user_sites` row behind a `site-` room, as the access query would see it. */
  site?: { user_id: string; moderation: string; trashed?: boolean; locked?: boolean } | null;
  /** A `user_sites` row with the bare room's id exists (trashed or not). */
  siteExists?: boolean;
}

/** A group lookup only sees a trashed group when its SQL forgets the live-group clause. */
const LIVE_GROUP = /\b(lg|g)\.deleted_at IS NULL/;

function makeDb(rows: Rows) {
  const captured: { sql: string; params?: unknown[] }[] = [];
  const db: DbQueryFn = vi.fn(async (sql: string, params?: unknown[]) => {
    captured.push({ sql, params });
    if (/SELECT 1 FROM user_sites/i.test(sql)) return rows.siteExists ? [{ '?column?': 1 }] : [];
    if (/FROM user_sites/i.test(sql)) {
      const site = rows.site;
      if (!site) return [];
      if (site.trashed && !/s\.deleted_at IS NULL/.test(sql)) return [site];
      if (site.locked && !/sites_unlocked = true/.test(sql)) return [site];
      if (site.trashed || site.locked) return [];
      return [site];
    }
    if (/UPDATE collaborative_documents/i.test(sql)) return [];
    if (/FROM collaborative_documents/i.test(sql)) return rows.doc ? [rows.doc] : [];
    if (/FROM chat_threads/i.test(sql)) return rows.thread ? [rows.thread] : [];
    const groupVisible = !rows.groupTrashed || !LIVE_GROUP.test(sql);
    if (/FROM group_content_shares/i.test(sql) && /can_write/.test(sql)) {
      // Chat-thread share lookup: bool_or over zero rows is one row with NULL.
      const g = rows.group;
      const readable = !!g && g.read !== false && groupVisible;
      return [{ can_write: readable ? (g.write ?? true) : null }];
    }
    if (/FROM group_content_shares/i.test(sql)) {
      return rows.group && groupVisible ? [{ permissions: rows.group }] : [];
    }
    if (/FROM group_memberships/i.test(sql)) {
      return rows.membership && groupVisible ? [{ '?column?': 1 }] : [];
    }
    if (/FROM profiles/i.test(sql)) {
      if (rows.profilesFail) throw new Error('pool exhausted');
      return [{ display_name: rows.displayName ?? 'Tester' }];
    }
    return [];
  });
  return { db, captured };
}

const DOC = '11111111-1111-4111-8111-111111111111';

const redis: RedisLike = { isReady: true, get: async () => null };

const guest = (documentName: string, params: Record<string, string> = {}) => ({
  documentName,
  requestHeaders: new Headers(),
  requestParameters: new URLSearchParams(params),
  token: undefined,
});

const withToken = (documentName: string, token = 'better-auth-token') => ({
  documentName,
  requestHeaders: new Headers(),
  requestParameters: new URLSearchParams(),
  token,
});

const publicDoc = (overrides: Record<string, unknown> = {}) => ({
  id: DOC,
  created_by: 'owner-1',
  permissions: {},
  is_public: true,
  share_mode: 'public',
  share_permission: 'editor',
  is_deleted: false,
  ...overrides,
});

describe('AuthService — guest access', () => {
  it('grants anonymous read-WRITE on a public + editor document', async () => {
    const { db } = makeDb({ doc: publicDoc({ share_permission: 'editor' }) });
    const res = await new AuthService({ db, redis }).authenticateConnection(guest(DOC));
    expect(res.authenticated).toBe(true);
    expect(res.readOnly).toBe(false);
  });

  it('grants anonymous read-only on a public + viewer document', async () => {
    const { db } = makeDb({ doc: publicDoc({ share_permission: 'viewer' }) });
    const res = await new AuthService({ db, redis }).authenticateConnection(guest(DOC));
    expect(res.authenticated).toBe(true);
    expect(res.readOnly).toBe(true);
  });

  it('denies guests on a private document', async () => {
    const { db } = makeDb({
      doc: publicDoc({ is_public: false, share_mode: 'private' }),
    });
    const res = await new AuthService({ db, redis }).authenticateConnection(guest(DOC));
    expect(res.authenticated).toBe(false);
  });

  it('denies guests on an authenticated-only document (login required)', async () => {
    const { db } = makeDb({
      doc: publicDoc({ is_public: false, share_mode: 'authenticated' }),
    });
    const res = await new AuthService({ db, redis }).authenticateConnection(guest(DOC));
    expect(res.authenticated).toBe(false);
  });

  it('denies guests on a deleted document', async () => {
    const { db } = makeDb({ doc: publicDoc({ is_deleted: true }) });
    const res = await new AuthService({ db, redis }).authenticateConnection(guest(DOC));
    expect(res.authenticated).toBe(false);
  });

  it.each(['chat-thread-1', 'group-presence-grp-1'])(
    'denies guests on %s without querying collaborative_documents',
    async (room) => {
      const { db, captured } = makeDb({ doc: publicDoc() });
      const res = await new AuthService({ db, redis }).authenticateConnection(guest(room));
      expect(res.authenticated).toBe(false);
      expect(captured.some((c) => /FROM collaborative_documents/i.test(c.sql))).toBe(false);
    }
  );

  it('honours a client-supplied guestId/guestName', async () => {
    const { db } = makeDb({ doc: publicDoc({ share_permission: 'viewer' }) });
    const res = await new AuthService({ db, redis }).authenticateConnection(
      guest(DOC, { guestId: 'guest-abc', guestName: 'Anon' })
    );
    expect(res.userId).toBe('guest-abc');
    expect(res.userName).toBe('Anon');
  });
});

describe('AuthService — removed HS256 token branch', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('does not authenticate a self-signed token; falls back to the session API (which rejects)', async () => {
    const fetchMock = vi.fn(async () => new Response('no', { status: 401 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { db } = makeDb({ doc: publicDoc({ is_public: false, share_mode: 'private' }) });
    const res = await new AuthService({ db, redis }).authenticateConnection(
      // A token that would have passed the old HS256 verifier if the fallback
      // secret were used. It must now be treated as an opaque bearer token and
      // handed to the session API, which rejects it.
      withToken(DOC, 'forged.jwt.token')
    );

    // The bearer path was taken (session API consulted), not a local JWT verify.
    expect(fetchMock).toHaveBeenCalledOnce();
    // Private doc + rejected session + no cookie ⇒ guest check ⇒ denied.
    expect(res.authenticated).toBe(false);
  });
});

describe('AuthService — authenticated session (bearer)', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ user: { id: 'user-9' } }), { status: 200 })
    ) as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('grants the owner read-write', async () => {
    const { db } = makeDb({
      doc: publicDoc({ created_by: 'user-9', is_public: false, share_mode: 'private' }),
    });
    const res = await new AuthService({ db, redis }).authenticateConnection(withToken(DOC));
    expect(res.authenticated).toBe(true);
    expect(res.userId).toBe('user-9');
    expect(res.readOnly).toBe(false);
  });

  it('grants a direct viewer read-only access', async () => {
    const { db } = makeDb({
      doc: publicDoc({
        created_by: 'owner-1',
        is_public: false,
        share_mode: 'private',
        permissions: { 'user-9': { level: 'viewer' } },
      }),
    });
    const res = await new AuthService({ db, redis }).authenticateConnection(withToken(DOC));
    expect(res.authenticated).toBe(true);
    expect(res.readOnly).toBe(true);
  });

  it('auto-grants a persisted permission entry in authenticated mode', async () => {
    const { db, captured } = makeDb({
      doc: publicDoc({
        created_by: 'owner-1',
        is_public: false,
        share_mode: 'authenticated',
        share_permission: 'editor',
        permissions: {},
      }),
    });
    const res = await new AuthService({ db, redis }).authenticateConnection(withToken(DOC));
    expect(res.authenticated).toBe(true);
    expect(res.readOnly).toBe(false);
    const update = captured.find((c) => /UPDATE collaborative_documents/i.test(c.sql));
    expect(update, 'an auto-grant UPDATE should be issued').toBeDefined();
    expect(update?.params).toContain(DOC);
  });
});

/**
 * Who gets a read-write connection. The REST write check
 * (apps/api/routes/docs/documentAccess.ts `canWriteDocument`) pins the same
 * cases and must answer alike (#4887).
 */
describe('AuthService — write rule shared with the REST layer', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ user: { id: 'user-9' } }), { status: 200 })
    ) as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  const privateDoc = (overrides: Record<string, unknown> = {}) =>
    publicDoc({ is_public: false, share_mode: 'private', share_permission: null, ...overrides });
  const viewerEntry = { 'user-9': { level: 'viewer' } };

  const cases: [string, Rows, boolean][] = [
    [
      'an explicit viewer on an editor link',
      {
        doc: privateDoc({
          permissions: viewerEntry,
          share_mode: 'authenticated',
          share_permission: 'editor',
        }),
      },
      true,
    ],
    [
      'a viewer link, even with a project write share',
      {
        doc: privateDoc({ share_mode: 'authenticated', share_permission: 'viewer' }),
        group: { read: true, write: true },
      },
      true,
    ],
    ['a project write share', { doc: privateDoc(), group: { read: true, write: true } }, false],
    ['a project read share', { doc: privateDoc(), group: { read: true, write: false } }, true],
    [
      'an entry without a level, even with a project write share',
      { doc: privateDoc({ permissions: { 'user-9': {} } }), group: { read: true, write: true } },
      true,
    ],
  ];

  it.each(cases)('%s', async (_name, rows, readOnly) => {
    const { db } = makeDb(rows);
    const res = await new AuthService({ db, redis }).authenticateConnection(withToken(DOC));
    expect(res.authenticated).toBe(true);
    expect(res.readOnly).toBe(readOnly);
  });
});

describe('AuthService — group membership requires is_active (finding #5)', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ user: { id: 'user-9' } }), { status: 200 })
    ) as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('emits the is_active clause when resolving a document group share', async () => {
    const { db, captured } = makeDb({
      doc: publicDoc({
        created_by: 'owner-1',
        is_public: false,
        share_mode: 'private',
        permissions: {},
      }),
      group: { read: true, write: true },
    });
    const res = await new AuthService({ db, redis }).authenticateConnection(withToken(DOC));
    expect(res.authenticated).toBe(true);
    expect(res.readOnly).toBe(false); // group write === true
    const groupQuery = captured.find((c) => /FROM group_content_shares/i.test(c.sql));
    expect(groupQuery?.sql).toMatch(/is_active = TRUE/i);
  });

  it('emits the is_active clause for group-presence rooms', async () => {
    const { db, captured } = makeDb({ membership: true });
    const res = await new AuthService({ db, redis }).authenticateConnection(
      withToken('group-presence-grp-1')
    );
    expect(res.authenticated).toBe(true);
    const membershipQuery = captured.find((c) => /FROM group_memberships/i.test(c.sql));
    expect(membershipQuery?.sql).toMatch(/is_active = TRUE/i);
    expect(membershipQuery?.sql).toMatch(/NOT g\.is_system/);
  });
});

describe('AuthService — a trashed Projekt grants nothing', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ user: { id: 'user-9' } }), { status: 200 })
    ) as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  const privateDoc = publicDoc({ is_public: false, share_mode: 'private', permissions: {} });

  it('denies a document shared only into a trashed Projekt', async () => {
    const shared = { doc: privateDoc, group: { read: true, write: true } };
    const live = makeDb(shared);
    expect(
      (await new AuthService({ db: live.db, redis }).authenticateConnection(withToken(DOC)))
        .authenticated
    ).toBe(true);

    const trashed = makeDb({ ...shared, groupTrashed: true });
    const res = await new AuthService({ db: trashed.db, redis }).authenticateConnection(
      withToken(DOC)
    );
    expect(res.authenticated).toBe(false);
  });

  it('denies a chat thread shared only into a trashed Projekt', async () => {
    const shared = {
      thread: { user_id: 'owner-1', permissions: null, is_public: false, doc_id: null },
      group: { read: true },
    };
    const live = makeDb(shared);
    expect(
      (
        await new AuthService({ db: live.db, redis }).authenticateConnection(
          withToken('chat-thread-1')
        )
      ).authenticated
    ).toBe(true);

    const trashed = makeDb({ ...shared, groupTrashed: true });
    const res = await new AuthService({ db: trashed.db, redis }).authenticateConnection(
      withToken('chat-thread-1')
    );
    expect(res.authenticated).toBe(false);
  });

  it('denies the presence room of a trashed Projekt', async () => {
    const res = await new AuthService({
      db: makeDb({ membership: true, groupTrashed: true }).db,
      redis,
    }).authenticateConnection(withToken('group-presence-grp-1'));
    expect(res.authenticated).toBe(false);
  });
});

describe('AuthService — local dev bypass', () => {
  const env = { ...process.env };
  const viaProxy = (documentName: string, value: string) => ({
    documentName,
    requestHeaders: new Headers({ 'x-dev-auth-bypass': value }),
    requestParameters: new URLSearchParams(),
    token: undefined,
  });
  const ownDoc = () =>
    publicDoc({
      created_by: '00000000-0000-4000-a000-000000000001',
      is_public: false,
      share_mode: 'private',
    });

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DEV_AUTH_BYPASS = 'true';
    process.env.DEV_AUTH_BYPASS_TOKEN = 'dev-token';
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("opens the bypass user's own private document", async () => {
    const { db } = makeDb({ doc: ownDoc() });
    const res = await new AuthService({ db, redis }).authenticateConnection(
      viaProxy(DOC, 'dev-token')
    );
    expect(res.authenticated).toBe(true);
    expect(res.userId).toBe('00000000-0000-4000-a000-000000000001');
    expect(res.readOnly).toBe(false);
  });

  it('still checks room access — a foreign private document stays closed', async () => {
    const { db } = makeDb({
      doc: publicDoc({ created_by: 'owner-1', is_public: false, share_mode: 'private' }),
    });
    const res = await new AuthService({ db, redis }).authenticateConnection(
      viaProxy(DOC, 'dev-token')
    );
    expect(res.authenticated).toBe(false);
  });

  it('switches to the allowlisted second identity via dev_auth_user', async () => {
    const LENA = '00000000-0000-4000-a000-0000000000b2';
    const { db } = makeDb({
      doc: publicDoc({ created_by: LENA, is_public: false, share_mode: 'private' }),
    });
    const res = await new AuthService({ db, redis }).authenticateConnection({
      ...viaProxy(DOC, 'dev-token'),
      requestParameters: new URLSearchParams({ dev_auth_user: LENA }),
    });
    expect(res.authenticated).toBe(true);
    expect(res.userId).toBe(LENA);
  });

  it('ignores dev_auth_user outside the allowlist', async () => {
    const { db } = makeDb({ doc: ownDoc() });
    const res = await new AuthService({ db, redis }).authenticateConnection({
      ...viaProxy(DOC, 'dev-token'),
      requestParameters: new URLSearchParams({
        dev_auth_user: '00000000-0000-4000-a000-0000000000ee',
      }),
    });
    expect(res.userId).toBe('00000000-0000-4000-a000-000000000001');
  });

  it('ignores a wrong token', async () => {
    const { db } = makeDb({ doc: ownDoc() });
    const res = await new AuthService({ db, redis }).authenticateConnection(viaProxy(DOC, 'guess'));
    expect(res.authenticated).toBe(false);
  });

  it('is off outside development', async () => {
    process.env.NODE_ENV = 'production';
    const { db } = makeDb({ doc: ownDoc() });
    const res = await new AuthService({ db, redis }).authenticateConnection(
      viaProxy(DOC, 'dev-token')
    );
    expect(res.authenticated).toBe(false);
  });
});

describe('AuthService — profiles lookup failure does not mask a denial', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ user: { id: 'user-9' } }), { status: 200 })
    ) as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  const privateDoc = publicDoc({ is_public: false, share_mode: 'private', permissions: {} });

  it.each([
    ['no access', privateDoc],
    ['deleted', publicDoc({ is_deleted: true })],
  ])('keeps a %s denial durable', async (_name, doc) => {
    const res = await new AuthService({
      db: makeDb({ doc, profilesFail: true }).db,
      redis,
    }).authenticateConnection(withToken(DOC));
    expect(res.authenticated).toBe(false);
    expect(res.reason).not.toBe('Internal authentication error');
  });

  it('still grants with a fallback name', async () => {
    const res = await new AuthService({
      db: makeDb({ doc: publicDoc(), profilesFail: true }).db,
      redis,
    }).authenticateConnection(withToken(DOC));
    expect(res).toMatchObject({ authenticated: true, userName: 'Unknown User' });
  });
});

describe('AuthService — team chat rooms (final review)', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ user: { id: 'user-9' } }), { status: 200 })
    ) as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  const chat = {
    thread: { user_id: 'owner-1', permissions: null, is_public: false, doc_id: null },
  };
  const run = (rows: Rows) =>
    new AuthService({ db: makeDb(rows).db, redis }).authenticateConnection(
      withToken('chat-thread-1')
    );

  it('compares the TEXT content_id as text, never as uuid', async () => {
    const { db, captured } = makeDb({ ...chat, group: { read: true, write: true } });
    await new AuthService({ db, redis }).authenticateConnection(withToken('chat-thread-1'));
    const q = captured.find((c) => /FROM group_content_shares/i.test(c.sql));
    expect(q?.sql).toMatch(/gcs\.content_id = \$1::text/);
    expect(q?.sql).not.toMatch(/content_id = \$1::uuid/);
  });

  it('filters trashed threads in the room lookup', async () => {
    const { db, captured } = makeDb(chat);
    await new AuthService({ db, redis }).authenticateConnection(withToken('chat-thread-1'));
    const q = captured.find((c) => /FROM chat_threads/i.test(c.sql));
    expect(q?.sql).toMatch(/deleted_at IS NULL/);
  });

  it('write:true share gives a writable member, write:false a read-only one', async () => {
    const w = await run({ ...chat, group: { read: true, write: true } });
    expect(w.authenticated).toBe(true);
    expect(w.readOnly).toBe(false);
    const r = await run({ ...chat, group: { read: true, write: false } });
    expect(r.authenticated).toBe(true);
    expect(r.readOnly).toBe(true);
  });

  it('a share without read grants nothing', async () => {
    const res = await run({ ...chat, group: { read: false, write: true } });
    expect(res.authenticated).toBe(false);
  });

  it('requires the share to be readable in SQL', async () => {
    const { db, captured } = makeDb({ ...chat, group: { read: true } });
    await new AuthService({ db, redis }).authenticateConnection(withToken('chat-thread-1'));
    const q = captured.find((c) => /FROM group_content_shares/i.test(c.sql));
    expect(q?.sql).toMatch(/'read'/);
  });
});

describe('AuthService — site rooms', () => {
  const SITE_ID = '3f2b8c1e-4d5a-4b6c-9e7f-0a1b2c3d4e5f';
  const ROOM = `site-${SITE_ID}`;
  const realFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ user: { id: 'user-9' } }), { status: 200 })
    ) as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  /**
   * A denial on the session path falls through to cookie and guest, whose reason
   * wins; the room check's own reason is read straight from `checkRoomAccess`.
   */
  const roomReason = async (db: DbQueryFn, room: string, userId = 'user-9') => {
    const service = new AuthService({ db, redis }) as unknown as {
      checkRoomAccess(room: string, userId: string): Promise<{ reason?: string }>;
    };
    return (await service.checkRoomAccess(room, userId)).reason;
  };

  it('site room: owner gets read-write', async () => {
    const { db, captured } = makeDb({ site: { user_id: 'user-9', moderation: 'ok' } });
    const res = await new AuthService({ db, redis }).authenticateConnection(withToken(ROOM));
    expect(res).toMatchObject({ authenticated: true, userId: 'user-9', readOnly: false });
    const query = captured.find((c) => /FROM user_sites s/.test(c.sql));
    expect(query?.params).toEqual([SITE_ID]);
    expect(captured.some((c) => /FROM collaborative_documents/.test(c.sql))).toBe(false);
  });

  it('site room: another user is denied', async () => {
    const { db } = makeDb({ site: { user_id: 'owner-1', moderation: 'ok' } });
    const res = await new AuthService({ db, redis }).authenticateConnection(withToken(ROOM));
    expect(res.authenticated).toBe(false);
    expect(await roomReason(db, ROOM)).toBe('Access denied');
  });

  it.each([
    ['trashed', { trashed: true }],
    ['not unlocked', { locked: true }],
  ])('site room: a trashed or not-unlocked site is denied (%s)', async (_label, flags) => {
    const { db, captured } = makeDb({ site: { user_id: 'user-9', moderation: 'ok', ...flags } });
    const res = await new AuthService({ db, redis }).authenticateConnection(withToken(ROOM));
    expect(res.authenticated).toBe(false);
    expect(await roomReason(db, ROOM)).toBe('Site not found');
    const sql = captured.find((c) => /FROM user_sites s/.test(c.sql))?.sql ?? '';
    expect(sql).toContain('s.deleted_at IS NULL');
    expect(sql).toContain('sites_unlocked = true');
  });

  it('site room: a room without a uuid is denied without a query', async () => {
    const { db, captured } = makeDb({ site: { user_id: 'user-9', moderation: 'ok' } });
    const res = await new AuthService({ db, redis }).authenticateConnection(withToken('site-x'));
    expect(res.authenticated).toBe(false);
    expect(await roomReason(db, 'site-x')).toBe('Site not found');
    expect(captured.some((c) => /user_sites/.test(c.sql))).toBe(false);
  });

  it('site room: an upper-case uuid is denied without a query', async () => {
    const { db, captured } = makeDb({ site: { user_id: 'user-9', moderation: 'ok' } });
    const room = `site-${SITE_ID.toUpperCase()}`;
    const res = await new AuthService({ db, redis }).authenticateConnection(withToken(room));
    expect(res.authenticated).toBe(false);
    expect(await roomReason(db, room)).toBe('Site not found');
    expect(captured.some((c) => /user_sites/.test(c.sql))).toBe(false);
  });

  it('site room: removed by moderation is read-only', async () => {
    const { db } = makeDb({ site: { user_id: 'user-9', moderation: 'removed' } });
    const res = await new AuthService({ db, redis }).authenticateConnection(withToken(ROOM));
    expect(res).toMatchObject({ authenticated: true, readOnly: true });
  });

  it('site room: a guest is denied', async () => {
    global.fetch = vi.fn(
      async () => new Response('{}', { status: 401 })
    ) as unknown as typeof fetch;
    const { db, captured } = makeDb({ site: { user_id: 'user-9', moderation: 'ok' } });
    const res = await new AuthService({ db, redis }).authenticateConnection(guest(ROOM));
    expect(res.authenticated).toBe(false);
    expect(captured.some((c) => /FROM collaborative_documents/.test(c.sql))).toBe(false);
  });

  it('bare site id: has no document row, so it is denied', async () => {
    const { db } = makeDb({ doc: null, siteExists: true });
    const res = await new AuthService({ db, redis }).authenticateConnection(withToken(SITE_ID));
    expect(res.authenticated).toBe(false);
    expect(await roomReason(db, SITE_ID)).toBe('Access denied');
  });
});

describe('AuthService — rooms without a collaborative_documents row (#5805)', () => {
  const realFetch = global.fetch;
  const env = { ...process.env };
  const sessionOk = () =>
    vi.fn(
      async () => new Response(JSON.stringify({ user: { id: 'user-9' } }), { status: 200 })
    ) as unknown as typeof fetch;

  beforeEach(() => {
    global.fetch = sessionOk();
  });
  afterEach(() => {
    global.fetch = realFetch;
    process.env = { ...env };
  });

  it('denies a bearer-token user', async () => {
    const { db } = makeDb({ doc: null });
    const res = await new AuthService({ db, redis }).authenticateConnection(withToken(DOC));
    expect(res).toMatchObject({ authenticated: false });
  });

  it('denies a cookie-session user', async () => {
    const { db } = makeDb({ doc: null });
    const res = await new AuthService({ db, redis }).authenticateConnection({
      documentName: DOC,
      requestHeaders: new Headers({ cookie: 'session=abc' }),
      requestParameters: new URLSearchParams(),
      token: undefined,
    });
    expect(res).toMatchObject({ authenticated: false });
  });

  it('denies the dev-bypass user', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DEV_AUTH_BYPASS = 'true';
    process.env.DEV_AUTH_BYPASS_TOKEN = 'dev-token';
    const { db } = makeDb({ doc: null });
    const res = await new AuthService({ db, redis }).authenticateConnection({
      documentName: DOC,
      requestHeaders: new Headers({ 'x-dev-auth-bypass': 'dev-token' }),
      requestParameters: new URLSearchParams(),
      token: undefined,
    });
    expect(res).toMatchObject({ authenticated: false });
  });

  it('denies a doc-bound chat thread whose document is gone', async () => {
    const { db } = makeDb({
      doc: null,
      thread: { user_id: 'user-9', permissions: null, is_public: false, doc_id: DOC },
    });
    const res = await new AuthService({ db, redis }).authenticateConnection(
      withToken('chat-thread-1')
    );
    expect(res).toMatchObject({ authenticated: false });
  });

  it('denies a non-uuid room name without querying collaborative_documents', async () => {
    const { db, captured } = makeDb({ doc: publicDoc() });
    expect(await roomReasonOf(db, 'doc-1')).toBe('Access denied');
    expect(captured.some((c) => /FROM collaborative_documents/i.test(c.sql))).toBe(false);
  });

  it('keeps granting an existing document row', async () => {
    const { db } = makeDb({ doc: publicDoc({ is_public: false, created_by: 'user-9' }) });
    const res = await new AuthService({ db, redis }).authenticateConnection(withToken(DOC));
    expect(res).toMatchObject({ authenticated: true, userId: 'user-9' });
  });

  async function roomReasonOf(db: DbQueryFn, room: string) {
    const service = new AuthService({ db, redis }) as unknown as {
      checkRoomAccess(room: string, userId: string): Promise<{ reason?: string }>;
    };
    return (await service.checkRoomAccess(room, 'user-9')).reason;
  }
});
