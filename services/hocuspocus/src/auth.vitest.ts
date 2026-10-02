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
}

/** A group lookup only sees a trashed group when its SQL forgets the live-group clause. */
const LIVE_GROUP = /\b(lg|g)\.deleted_at IS NULL/;

function makeDb(rows: Rows) {
  const captured: { sql: string; params?: unknown[] }[] = [];
  const db: DbQueryFn = vi.fn(async (sql: string, params?: unknown[]) => {
    captured.push({ sql, params });
    if (/UPDATE collaborative_documents/i.test(sql)) return [];
    if (/FROM collaborative_documents/i.test(sql)) return rows.doc ? [rows.doc] : [];
    if (/FROM chat_threads/i.test(sql)) return rows.thread ? [rows.thread] : [];
    const groupVisible = !rows.groupTrashed || !LIVE_GROUP.test(sql);
    if (/FROM group_content_shares/i.test(sql)) {
      return rows.group && groupVisible ? [{ permissions: rows.group }] : [];
    }
    if (/FROM group_memberships/i.test(sql)) {
      return rows.membership && groupVisible ? [{ '?column?': 1 }] : [];
    }
    if (/FROM profiles/i.test(sql)) return [{ display_name: rows.displayName ?? 'Tester' }];
    return [];
  });
  return { db, captured };
}

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
  id: 'doc-1',
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
    const res = await new AuthService({ db, redis }).authenticateConnection(guest('doc-1'));
    expect(res.authenticated).toBe(true);
    expect(res.readOnly).toBe(false);
  });

  it('grants anonymous read-only on a public + viewer document', async () => {
    const { db } = makeDb({ doc: publicDoc({ share_permission: 'viewer' }) });
    const res = await new AuthService({ db, redis }).authenticateConnection(guest('doc-1'));
    expect(res.authenticated).toBe(true);
    expect(res.readOnly).toBe(true);
  });

  it('denies guests on a private document', async () => {
    const { db } = makeDb({
      doc: publicDoc({ is_public: false, share_mode: 'private' }),
    });
    const res = await new AuthService({ db, redis }).authenticateConnection(guest('doc-1'));
    expect(res.authenticated).toBe(false);
  });

  it('denies guests on an authenticated-only document (login required)', async () => {
    const { db } = makeDb({
      doc: publicDoc({ is_public: false, share_mode: 'authenticated' }),
    });
    const res = await new AuthService({ db, redis }).authenticateConnection(guest('doc-1'));
    expect(res.authenticated).toBe(false);
  });

  it('denies guests on a deleted document', async () => {
    const { db } = makeDb({ doc: publicDoc({ is_deleted: true }) });
    const res = await new AuthService({ db, redis }).authenticateConnection(guest('doc-1'));
    expect(res.authenticated).toBe(false);
  });

  it('honours a client-supplied guestId/guestName', async () => {
    const { db } = makeDb({ doc: publicDoc({ share_permission: 'viewer' }) });
    const res = await new AuthService({ db, redis }).authenticateConnection(
      guest('doc-1', { guestId: 'guest-abc', guestName: 'Anon' })
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
      withToken('doc-1', 'forged.jwt.token')
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
    const res = await new AuthService({ db, redis }).authenticateConnection(withToken('doc-1'));
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
    const res = await new AuthService({ db, redis }).authenticateConnection(withToken('doc-1'));
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
    const res = await new AuthService({ db, redis }).authenticateConnection(withToken('doc-1'));
    expect(res.authenticated).toBe(true);
    expect(res.readOnly).toBe(false);
    const update = captured.find((c) => /UPDATE collaborative_documents/i.test(c.sql));
    expect(update, 'an auto-grant UPDATE should be issued').toBeDefined();
    expect(update?.params).toContain('doc-1');
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
    const res = await new AuthService({ db, redis }).authenticateConnection(withToken('doc-1'));
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
      (await new AuthService({ db: live.db, redis }).authenticateConnection(withToken('doc-1')))
        .authenticated
    ).toBe(true);

    const trashed = makeDb({ ...shared, groupTrashed: true });
    const res = await new AuthService({ db: trashed.db, redis }).authenticateConnection(
      withToken('doc-1')
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
      viaProxy('doc-1', 'dev-token')
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
      viaProxy('doc-1', 'dev-token')
    );
    expect(res.authenticated).toBe(false);
  });

  it('ignores a wrong token', async () => {
    const { db } = makeDb({ doc: ownDoc() });
    const res = await new AuthService({ db, redis }).authenticateConnection(
      viaProxy('doc-1', 'guess')
    );
    expect(res.authenticated).toBe(false);
  });

  it('is off outside development', async () => {
    process.env.NODE_ENV = 'production';
    const { db } = makeDb({ doc: ownDoc() });
    const res = await new AuthService({ db, redis }).authenticateConnection(
      viaProxy('doc-1', 'dev-token')
    );
    expect(res.authenticated).toBe(false);
  });
});
