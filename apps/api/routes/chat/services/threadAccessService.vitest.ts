/**
 * Authorization tests for the thread access service.
 *
 * Auth ≠ authz. These tests exist to pin the access control logic for
 * chat threads — who can see and who can write a given thread. A
 * regression here is a user-data leak, which is why every access path has
 * a test and the negative case (no access) is covered explicitly.
 *
 * Access levels validated (via `getThreadAccessLevel`):
 *
 *   1. Owner — `chat_threads.user_id = userId` → 'owner'.
 *   2. Explicit permissions / public — `permissions ? userId` or
 *      `is_public = true` → 'write' (pre-levels behavior preserved).
 *   3. Group share — thread shared into a group the user is an active
 *      member of (via `group_content_shares` + `group_memberships`):
 *      `write:true` (or a legacy row without the key) → 'write',
 *      `{"write":false}` → 'read', `{"read":false}` → 'none'.
 *   4. No access — none of the above → 'none' (not 500).
 *
 * Doc-linked threads additionally defer to the linked document's access
 * rules (direct + group); those queries run between/after the above and
 * return no rows in most of these tests.
 *
 * The Postgres instance is mocked via `vi.mock` so these tests run in
 * milliseconds with no DB. Each test asserts both the call shape (correct
 * SQL arguments) and the return value.
 *
 * Run: `pnpm --filter @gruenerator/api test`
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThreadId, UserId } from '../../../utils/types/branded.js';

// ── Module mock ───────────────────────────────────────────────────────────

const queryMock = vi.fn();

vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: queryMock }),
}));

// Import AFTER mock
const { getThreadAccessLevel, canAccessThread, canWriteThread } =
  await import('./threadAccessService.js');

// ── Test helpers ──────────────────────────────────────────────────────────

const THREAD_ID = ThreadId('550e8400-e29b-41d4-a716-446655440001');
const USER_ID = UserId('550e8400-e29b-41d4-a716-446655440002');
const OTHER_USER = UserId('550e8400-e29b-41d4-a716-446655440003');

beforeEach(() => {
  queryMock.mockReset();
});

// The service runs up to four sequential queries: direct access (always one
// row when the thread exists) → doc direct access → group share (one
// `bool_or` row; can_write NULL = no share) → doc group share. We program
// the mock per call-order position; later positions default to "no rows"
// for tests that only exercise the early paths.
function mockQueries(
  directRows: unknown[],
  groupRows: unknown[] = [{ can_write: null }],
  docDirectRows: unknown[] = [],
  docGroupRows: unknown[] = []
) {
  queryMock
    .mockResolvedValueOnce(directRows)
    .mockResolvedValueOnce(docDirectRows)
    .mockResolvedValueOnce(groupRows)
    .mockResolvedValueOnce(docGroupRows);
}

const directRow = (isOwner: boolean, hasWriteGrant: boolean, isLinkShared = false) => [
  { is_owner: isOwner, has_write_grant: hasWriteGrant, is_link_shared: isLinkShared },
];

// ── Access levels ─────────────────────────────────────────────────────────

describe('getThreadAccessLevel — owner path', () => {
  it("returns 'owner' when user_id matches", async () => {
    mockQueries(directRow(true, false));

    const result = await getThreadAccessLevel(THREAD_ID, USER_ID);

    expect(result).toBe('owner');
    // Direct-access query was called with (threadId, userId).
    const firstCall = queryMock.mock.calls[0];
    expect(firstCall?.[1]).toEqual([THREAD_ID, USER_ID]);
    // Group query NOT called because direct access short-circuited.
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});

describe('getThreadAccessLevel — explicit permissions / public path', () => {
  it("returns 'write' when userId is in the permissions JSONB map or is_public", async () => {
    // `permissions ? userId::text OR is_public` fold into one flag — both
    // grant full access, exactly as before the level split.
    mockQueries(directRow(false, true));

    const result = await getThreadAccessLevel(THREAD_ID, OTHER_USER);

    expect(result).toBe('write');
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});

describe('getThreadAccessLevel — group share path', () => {
  it("returns 'write' for a writable group share", async () => {
    mockQueries(directRow(false, false), [{ can_write: true }]);

    const result = await getThreadAccessLevel(THREAD_ID, USER_ID);

    expect(result).toBe('write');
    expect(queryMock).toHaveBeenCalledTimes(3);
    // Group query (3rd in order, after direct + doc-direct) was called with
    // (threadId, userId).
    const groupCall = queryMock.mock.calls[2];
    expect(groupCall?.[1]).toEqual([THREAD_ID, USER_ID]);
  });

  it("returns 'write' for a legacy share row without a write key (COALESCE pin)", async () => {
    // Legacy rows were written as {"read":true,"write":true}, but rows with
    // NULL/{} permissions must keep granting write via COALESCE(..., true).
    // The SQL folds that into bool_or, so the mock just returns true — this
    // test pins the SQL text instead.
    mockQueries(directRow(false, false), [{ can_write: true }]);

    await getThreadAccessLevel(THREAD_ID, USER_ID);

    const groupSql = String(queryMock.mock.calls[2]?.[0]);
    expect(groupSql).toContain("COALESCE((gcs.permissions->>'write')::boolean, true)");
    expect(groupSql).toContain("COALESCE((gcs.permissions->>'read')::boolean, true)");
    expect(groupSql).toContain('gm.is_active = TRUE');
  });

  it('returns \'read\' for a read-only group share ({"write":false})', async () => {
    mockQueries(directRow(false, false), [{ can_write: false }]);

    const result = await getThreadAccessLevel(THREAD_ID, USER_ID);

    expect(result).toBe('read');
    // The doc-group query still ran (a writable doc link would outrank read).
    expect(queryMock).toHaveBeenCalledTimes(4);
  });

  it("returns 'none' when the share has read:false or membership is inactive", async () => {
    // Both cases are filtered inside the group SQL (permissions->>'read',
    // gm.is_active), so the query yields no matching rows → can_write NULL.
    mockQueries(directRow(false, false), [{ can_write: null }]);

    const result = await getThreadAccessLevel(THREAD_ID, USER_ID);

    expect(result).toBe('none');
    expect(queryMock).toHaveBeenCalledTimes(4);
  });
});

describe('getThreadAccessLevel — link share path (share_mode)', () => {
  it("returns 'read' when share_mode is 'authenticated' and nothing stronger matches", async () => {
    mockQueries(directRow(false, false, true));

    const result = await getThreadAccessLevel(THREAD_ID, OTHER_USER);

    expect(result).toBe('read');
    // All share queries still ran — a writable grant must outrank the link.
    expect(queryMock).toHaveBeenCalledTimes(4);
  });

  it("owner outranks the link share ('owner', not 'read')", async () => {
    mockQueries(directRow(true, false, true));

    expect(await getThreadAccessLevel(THREAD_ID, USER_ID)).toBe('owner');
  });

  it("a writable group share outranks the link share ('write')", async () => {
    mockQueries(directRow(false, false, true), [{ can_write: true }]);

    expect(await getThreadAccessLevel(THREAD_ID, USER_ID)).toBe('write');
  });

  it("share_mode 'private' grants nothing", async () => {
    mockQueries(directRow(false, false, false));

    expect(await getThreadAccessLevel(THREAD_ID, OTHER_USER)).toBe('none');
  });
});

describe('getThreadAccessLevel — doc-linked paths', () => {
  it("returns 'write' when the linked document grants direct access", async () => {
    mockQueries(directRow(false, false), [{ can_write: null }], [{ '?column?': 1 }]);

    const result = await getThreadAccessLevel(THREAD_ID, USER_ID);

    expect(result).toBe('write');
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("returns 'write' when the linked document is group-shared", async () => {
    mockQueries(directRow(false, false), [{ can_write: null }], [], [{ '?column?': 1 }]);

    const result = await getThreadAccessLevel(THREAD_ID, USER_ID);

    expect(result).toBe('write');
    expect(queryMock).toHaveBeenCalledTimes(4);
  });

  it('a writable doc-group link outranks a read-only thread group share', async () => {
    mockQueries(directRow(false, false), [{ can_write: false }], [], [{ '?column?': 1 }]);

    const result = await getThreadAccessLevel(THREAD_ID, USER_ID);

    expect(result).toBe('write');
  });
});

describe('getThreadAccessLevel — denied path', () => {
  it("returns 'none' when no access path matches", async () => {
    mockQueries(directRow(false, false));

    const result = await getThreadAccessLevel(THREAD_ID, OTHER_USER);

    expect(result).toBe('none');
  });

  it("returns 'none' without further queries when the thread does not exist", async () => {
    // The direct query always returns a row for an existing thread, so an
    // empty result means the thread is gone — no need to probe shares.
    mockQueries([]);

    const nonExistent = ThreadId('00000000-0000-0000-0000-000000000000');
    const result = await getThreadAccessLevel(nonExistent, USER_ID);

    expect(result).toBe('none');
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("returns 'none' for a non-UUID thread id without touching the DB", async () => {
    const result = await getThreadAccessLevel(ThreadId('__LOCALID_abc'), USER_ID);

    expect(result).toBe('none');
    expect(queryMock).not.toHaveBeenCalled();
  });
});

// ── Wrappers ─────────────────────────────────────────────────────────────

describe('canAccessThread / canWriteThread wrappers', () => {
  it('canAccessThread is true for read-only access', async () => {
    mockQueries(directRow(false, false), [{ can_write: false }]);

    expect(await canAccessThread(THREAD_ID, USER_ID)).toBe(true);
  });

  it('canWriteThread is false for read-only access', async () => {
    mockQueries(directRow(false, false), [{ can_write: false }]);

    expect(await canWriteThread(THREAD_ID, USER_ID)).toBe(false);
  });

  it('canWriteThread is true for the owner', async () => {
    mockQueries(directRow(true, false));

    expect(await canWriteThread(THREAD_ID, USER_ID)).toBe(true);
  });

  it('canAccessThread is false when there is no access', async () => {
    mockQueries(directRow(false, false));

    expect(await canAccessThread(THREAD_ID, OTHER_USER)).toBe(false);
  });
});

// ── Branded type boundary ────────────────────────────────────────────────
//
// These tests document the branded-type contract: if someone ever loosens
// the signature back to `(string, string)`, the `@ts-expect-error`
// assertions fail at compile time and CI catches the regression.

describe('getThreadAccessLevel — branded type enforcement (compile-time)', () => {
  it('rejects swapping threadId and userId', () => {
    // Compile-time-only assertions: the `@ts-expect-error` comments fire
    // during `tsc` if the signature ever loosens back to `(string, string)`
    // or if the brand ordering is flipped. Wrapped in a never-called closure
    // so nothing actually hits the mocked DB at runtime.
    const _typeOnlyChecks = () => {
      // @ts-expect-error — cannot pass raw strings where branded IDs required
      void getThreadAccessLevel('raw-string', 'another-raw-string');

      // @ts-expect-error — cannot pass UserId where ThreadId expected (args swapped)
      void getThreadAccessLevel(USER_ID, THREAD_ID);
    };

    expect(typeof _typeOnlyChecks).toBe('function');
  });
});
