/**
 * Integration tests for `requireAuth`, `optionalAuth`, `requireAdmin`.
 *
 * These tests exercise the middleware functions with mocked Better Auth +
 * env state. They pin four security-critical invariants:
 *
 *   1. `requireAuth` 401s when there is no resolvable session.
 *   2. `requireAuth` 500s (fail-fast) when `ALLOW_DEV_AUTH_BYPASS` is true
 *      in production — a misconfiguration that would otherwise let anyone
 *      sign in without credentials.
 *   3. The dev auth bypass only activates in `NODE_ENV=development` AND
 *      with a valid token — neither alone is sufficient.
 *   4. `optionalAuth` never 401s — it leaves `req.user` unset and calls
 *      `next()` when no session is present, even on API routes.
 *
 * Better Auth's `auth.api.getSession` is mocked so we don't need a live
 * DB or session store. The env module is mocked per-test to flip
 * `NODE_ENV` and `ALLOW_DEV_AUTH_BYPASS` without process restarts.
 *
 * Run: `pnpm --filter @gruenerator/api test`
 */

import { type NextFunction, type Request, type Response } from 'express';
import { beforeEach, describe, it, expect, vi, afterEach } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────
//
// These must be declared before `import`s from the modules they stub,
// because vitest hoists `vi.mock` calls above imports at transform time.

const getSessionMock = vi.fn();

vi.mock('../config/betterAuth.js', () => ({
  auth: { api: { getSession: getSessionMock } },
}));

// The locale overlay would otherwise hit Redis/Postgres and hang the test.
vi.mock('../services/localization/localeCache.js', () => ({
  getUserLocale: vi.fn().mockResolvedValue(null),
}));

// Default env — individual tests override via `envMock.*` assignment.
const envMock = {
  NODE_ENV: 'development' as 'development' | 'production' | 'test',
  ALLOW_DEV_AUTH_BYPASS: false,
  DEV_AUTH_BYPASS_TOKEN: null as string | null,
};

vi.mock('../config/env.js', () => ({
  get env() {
    return envMock;
  },
}));

// Import AFTER mocks so the middleware picks up the mocked modules.
const { requireAuth, optionalAuth, requireAdmin, getUserId } = await import('./authMiddleware.js');

// ── Test helpers ──────────────────────────────────────────────────────────

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    query: {},
    originalUrl: '/api/test',
    method: 'GET',
    ...overrides,
  } as unknown as Request;
}

function mockRes() {
  const state = {
    statusCode: 200 as number,
    body: undefined as unknown,
    redirected: null as string | null,
    headers: {} as Record<string, string>,
  };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(body: unknown) {
      state.body = body;
      return res;
    },
    redirect(url: string) {
      state.redirected = url;
      return res;
    },
    setHeader(name: string, value: string) {
      state.headers[name] = value;
      return res;
    },
  };
  return { res: res as unknown as Response, state };
}

beforeEach(() => {
  getSessionMock.mockReset();
  envMock.NODE_ENV = 'development';
  envMock.ALLOW_DEV_AUTH_BYPASS = false;
  envMock.DEV_AUTH_BYPASS_TOKEN = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── requireAuth ───────────────────────────────────────────────────────────

describe('requireAuth', () => {
  it('401s a JSON request with no session', async () => {
    getSessionMock.mockResolvedValue(null);
    const req = mockReq({ originalUrl: '/api/chat-service/threads' });
    const { res, state } = mockRes();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(state.statusCode).toBe(401);
    expect(state.body).toMatchObject({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('redirects an HTML request with no session', async () => {
    getSessionMock.mockResolvedValue(null);
    const req = mockReq({ originalUrl: '/dashboard', headers: { accept: 'text/html' } });
    const { res, state } = mockRes();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(state.redirected).toBe('/auth/login');
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches req.user and calls next() when a session resolves', async () => {
    getSessionMock.mockResolvedValue({
      session: { id: 'sess-1', userId: 'user-1' },
      user: {
        id: 'user-1',
        email: 'alice@example.com',
        name: 'Alice',
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        avatar_robot_id: 3,
        beta_features: { workplace: true },
        user_defaults: {},
        is_admin: true,
        first_name: 'Alice',
      },
    });
    const req = mockReq();
    const { res, state } = mockRes();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(state.statusCode).toBe(200); // untouched
    expect(req.user?.id).toBe('user-1');
    expect(req.user?.email).toBe('alice@example.com');
    expect(req.user?.display_name).toBe('Alice');
    expect(req.user?.is_admin).toBe(true);
  });

  it('500s (fail-fast) when ALLOW_DEV_AUTH_BYPASS is true in production', async () => {
    // This is the critical security guarantee the codebase makes:
    // production must NEVER honor the dev bypass even if it's misconfigured.
    envMock.NODE_ENV = 'production';
    envMock.ALLOW_DEV_AUTH_BYPASS = true;

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = mockReq({ headers: { 'x-dev-auth-bypass': 'anything' } });
    const { res, state } = mockRes();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(state.statusCode).toBe(500);
    expect(state.body).toMatchObject({
      error: 'Critical security misconfiguration detected',
    });
    expect(next).not.toHaveBeenCalled();
    // Confirms the critical alert was logged (ops visibility).
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('CRITICAL SECURITY ALERT'));
  });

  it('accepts dev bypass only with matching token', async () => {
    envMock.NODE_ENV = 'development';
    envMock.ALLOW_DEV_AUTH_BYPASS = true;
    envMock.DEV_AUTH_BYPASS_TOKEN = 'secret-dev-token';

    // Valid token → should pass
    const req = mockReq({ headers: { 'x-dev-auth-bypass': 'secret-dev-token' } });
    const { res } = mockRes();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user?.id).toBe('00000000-0000-4000-a000-000000000001');
  });

  it('rejects dev bypass with wrong token even in development', async () => {
    envMock.NODE_ENV = 'development';
    envMock.ALLOW_DEV_AUTH_BYPASS = true;
    envMock.DEV_AUTH_BYPASS_TOKEN = 'secret-dev-token';
    getSessionMock.mockResolvedValue(null);

    const req = mockReq({ headers: { 'x-dev-auth-bypass': 'WRONG' } });
    const { res, state } = mockRes();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(state.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('ignores dev bypass header when ALLOW_DEV_AUTH_BYPASS is false', async () => {
    envMock.NODE_ENV = 'development';
    envMock.ALLOW_DEV_AUTH_BYPASS = false;
    envMock.DEV_AUTH_BYPASS_TOKEN = 'secret-dev-token';
    getSessionMock.mockResolvedValue(null);

    const req = mockReq({ headers: { 'x-dev-auth-bypass': 'secret-dev-token' } });
    const { res, state } = mockRes();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(state.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('ignores dev bypass header when DEV_AUTH_BYPASS_TOKEN is null', async () => {
    envMock.NODE_ENV = 'development';
    envMock.ALLOW_DEV_AUTH_BYPASS = true;
    envMock.DEV_AUTH_BYPASS_TOKEN = null;
    getSessionMock.mockResolvedValue(null);

    const req = mockReq({ headers: { 'x-dev-auth-bypass': 'any' } });
    const { res, state } = mockRes();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(state.statusCode).toBe(401);
  });

  it('503s with auth_unavailable when Better Auth throws during session resolution', async () => {
    // An infra failure (Redis/Postgres down) is NOT a dead session. A 401
    // here makes the frontend wipe its auth state and force a re-login —
    // the exact production bug this distinction fixes.
    getSessionMock.mockRejectedValue(new Error('Redis connection lost'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const req = mockReq();
    const { res, state } = mockRes();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(state.statusCode).toBe(503);
    expect(state.body).toMatchObject({ error: 'auth_unavailable' });
    expect(next).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('503s (no login redirect) for HTML requests when Better Auth throws', async () => {
    getSessionMock.mockRejectedValue(new Error('Postgres timeout'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const req = mockReq({ originalUrl: '/dashboard', headers: { accept: 'text/html' } });
    const { res, state } = mockRes();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(state.statusCode).toBe(503);
    expect(state.redirected).toBeNull();
    expect(next).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

// ── optionalAuth ──────────────────────────────────────────────────────────

describe('optionalAuth', () => {
  it('calls next() with req.user unset when no auth headers are present', async () => {
    const req = mockReq({ headers: {} });
    const { res } = mockRes();
    const next = vi.fn() as NextFunction;

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
    // Must NOT call Better Auth at all when no headers (saves a round trip).
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('attaches req.user when a session resolves', async () => {
    getSessionMock.mockResolvedValue({
      session: { id: 'sess-2', userId: 'user-2' },
      user: {
        id: 'user-2',
        email: 'carol@example.com',
        name: 'Carol',
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        avatar_robot_id: 1,
        beta_features: {},
        user_defaults: {},
      },
    });
    const req = mockReq({ headers: { cookie: 'better-auth.session=xyz' } });
    const { res } = mockRes();
    const next = vi.fn() as NextFunction;

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user?.id).toBe('user-2');
  });

  it('never 401s — calls next() even when session resolution fails', async () => {
    getSessionMock.mockResolvedValue(null);
    const req = mockReq({ headers: { cookie: 'garbage' } });
    const { res, state } = mockRes();
    const next = vi.fn() as NextFunction;

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(state.statusCode).toBe(200); // untouched
    expect(req.user).toBeUndefined();
  });

  it('degrades to guest (next(), no user) when Better Auth throws', async () => {
    getSessionMock.mockRejectedValue(new Error('Redis connection lost'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const req = mockReq({ headers: { cookie: 'better-auth.session=xyz' } });
    const { res, state } = mockRes();
    const next = vi.fn() as NextFunction;

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(state.statusCode).toBe(200); // untouched — no 503 on public content
    expect(req.user).toBeUndefined();
    errorSpy.mockRestore();
  });
});

// ── requireAdmin ──────────────────────────────────────────────────────────

describe('requireAdmin', () => {
  it('calls next() when authReq.user is already set', () => {
    const req = mockReq() as Request & { user?: unknown };
    req.user = { id: 'admin-1', email: 'a@b.c' };
    const { res } = mockRes();
    const next = vi.fn() as NextFunction;

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('falls through to requireAuth when user is unset', async () => {
    getSessionMock.mockResolvedValue(null);
    const req = mockReq();
    const { res, state } = mockRes();
    const next = vi.fn() as NextFunction;

    requireAdmin(req, res, next);

    // requireAuth is async; give it a tick to run
    await new Promise((r) => setImmediate(r));
    expect(state.statusCode).toBe(401);
  });
});

// ── getUserId helper ──────────────────────────────────────────────────────

describe('getUserId', () => {
  it('returns the branded UserId from an authenticated request', () => {
    const req = mockReq() as Request & { user?: unknown };
    req.user = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'alice@example.com',
    };

    const userId = getUserId(req);

    // Runtime value is the raw UUID — brand is phantom.
    expect(userId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('throws when called on an unauthenticated request', () => {
    const req = mockReq();
    expect(() => getUserId(req)).toThrow(/requireAuth/);
  });

  it('returned UserId cannot be assigned to DocumentId at compile time', async () => {
    // This test exists to document the branded-type contract. If the
    // assertion below ever becomes unnecessary (because `UserId` and
    // `DocumentId` converge), the branding has been broken.
    const { DocumentId } = await import('../utils/types/branded.js');

    const req = mockReq() as Request & { user?: unknown };
    req.user = { id: 'user-1', email: 'x@y.z' };
    const userId = getUserId(req);

    // @ts-expect-error — UserId must NOT assign to DocumentId
    const _wrong: ReturnType<typeof DocumentId> = userId;

    // Explicit conversion through the string layer is fine (and visible).
    const explicit = DocumentId(userId as unknown as string);
    expect(explicit).toBe('user-1');
  });
});
