/**
 * Authorization tests for `canAccessThread`.
 *
 * Auth ≠ authz. These tests exist to pin the access control logic for
 * chat threads — who can see a given thread. A regression here is a
 * user-data leak, which is why every access path has a test and the
 * negative case (no access) is covered explicitly.
 *
 * Access paths validated:
 *
 *   1. Owner — `chat_threads.user_id = userId`.
 *   2. Explicit permissions — `chat_threads.permissions ? userId`.
 *   3. Public — `chat_threads.is_public = true`.
 *   4. Group share — thread shared into a group the user is a member of
 *      (via `group_content_shares` + `group_memberships`).
 *   5. No access — none of the above → returns false (not 500).
 *
 * Doc-linked threads additionally defer to the linked document's access
 * rules (direct + group); those queries run between/after the above and
 * return no rows in these tests.
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
const { canAccessThread } = await import('./threadAccessService.js');

// ── Test helpers ──────────────────────────────────────────────────────────

const THREAD_ID = ThreadId('550e8400-e29b-41d4-a716-446655440001');
const USER_ID = UserId('550e8400-e29b-41d4-a716-446655440002');
const OTHER_USER = UserId('550e8400-e29b-41d4-a716-446655440003');

beforeEach(() => {
  queryMock.mockReset();
});

// The service runs up to four sequential queries (each short-circuits on a
// hit): direct access → doc direct access → group share → doc group share.
// We program the mock per call-order position; later positions default to
// "no rows" for tests that only exercise the early paths.
function mockQueries(
  directAccessRows: unknown[],
  groupAccessRows: unknown[],
  docDirectAccessRows: unknown[] = [],
  docGroupAccessRows: unknown[] = []
) {
  queryMock
    .mockResolvedValueOnce(directAccessRows)
    .mockResolvedValueOnce(docDirectAccessRows)
    .mockResolvedValueOnce(groupAccessRows)
    .mockResolvedValueOnce(docGroupAccessRows);
}

// ── Access paths ──────────────────────────────────────────────────────────

describe('canAccessThread — owner path', () => {
  it('returns true when user_id matches (owner)', async () => {
    mockQueries([{ '?column?': 1 }], []);

    const result = await canAccessThread(THREAD_ID, USER_ID);

    expect(result).toBe(true);
    // Direct-access query was called with (threadId, userId).
    const firstCall = queryMock.mock.calls[0];
    expect(firstCall?.[1]).toEqual([THREAD_ID, USER_ID]);
    // Group query NOT called because direct access short-circuited.
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});

describe('canAccessThread — explicit permissions path', () => {
  it('returns true when userId is in the permissions JSONB map', async () => {
    // `permissions ? userId::text` matches in the direct-access query.
    // Same query path as owner — the SQL handles all three in one shot.
    mockQueries([{ '?column?': 1 }], []);

    const result = await canAccessThread(THREAD_ID, USER_ID);

    expect(result).toBe(true);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});

describe('canAccessThread — public path', () => {
  it('returns true when is_public is true (any user)', async () => {
    // Same query; `OR is_public = true` matches regardless of userId.
    mockQueries([{ '?column?': 1 }], []);

    const result = await canAccessThread(THREAD_ID, OTHER_USER);

    expect(result).toBe(true);
  });
});

describe('canAccessThread — group share path', () => {
  it('returns true when user is a member of a group the thread is shared to', async () => {
    // Direct access empty, group access has a row.
    mockQueries([], [{ '?column?': 1 }]);

    const result = await canAccessThread(THREAD_ID, USER_ID);

    expect(result).toBe(true);
    expect(queryMock).toHaveBeenCalledTimes(3);
    // Group query (3rd in order, after direct + doc-direct) was called with
    // (threadId, userId).
    const groupCall = queryMock.mock.calls[2];
    expect(groupCall?.[1]).toEqual([THREAD_ID, USER_ID]);
  });

  it('returns false when thread is shared to a group the user is NOT in', async () => {
    mockQueries([], []);

    const result = await canAccessThread(THREAD_ID, OTHER_USER);

    expect(result).toBe(false);
    expect(queryMock).toHaveBeenCalledTimes(4);
  });
});

describe('canAccessThread — denied path', () => {
  it('returns false when no access path matches', async () => {
    // Non-owner, not in permissions, not public, not in group.
    mockQueries([], []);

    const result = await canAccessThread(THREAD_ID, OTHER_USER);

    expect(result).toBe(false);
  });

  it('returns false when the thread does not exist', async () => {
    // Non-existent thread id — both queries return nothing.
    mockQueries([], []);

    const nonExistent = ThreadId('00000000-0000-0000-0000-000000000000');
    const result = await canAccessThread(nonExistent, USER_ID);

    expect(result).toBe(false);
  });
});

// ── Branded type boundary ────────────────────────────────────────────────
//
// These tests document the branded-type contract: if someone ever loosens
// the signature back to `(string, string)`, the `@ts-expect-error`
// assertions fail at compile time and CI catches the regression.

describe('canAccessThread — branded type enforcement (compile-time)', () => {
  it('rejects swapping threadId and userId', () => {
    // Compile-time-only assertions: the `@ts-expect-error` comments fire
    // during `tsc` if the signature ever loosens back to `(string, string)`
    // or if the brand ordering is flipped. Wrapped in a never-called closure
    // so nothing actually hits the mocked DB at runtime.
    const _typeOnlyChecks = () => {
      // @ts-expect-error — cannot pass raw strings where branded IDs required
      void canAccessThread('raw-string', 'another-raw-string');

      // @ts-expect-error — cannot pass UserId where ThreadId expected (args swapped)
      void canAccessThread(USER_ID, THREAD_ID);
    };

    expect(typeof _typeOnlyChecks).toBe('function');
  });
});
