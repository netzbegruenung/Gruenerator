import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import express from 'express';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => ({
  NODE_ENV: 'test' as string,
  SESSION_SECRET: 'test-session-secret' as string | null,
  KEYCLOAK_BASE_URL: 'https://keycloak.invalid',
  KEYCLOAK_REALM: 'test',
  DISABLE_RATE_LIMITS: true,
}));

const redisStrings = vi.hoisted(() => new Map<string, string>());
const redisClient = vi.hoisted(() => ({
  setEx: vi.fn(async (key: string, _ttl: number, value: string) => {
    redisStrings.set(key, value);
  }),
  getDel: vi.fn(async (key: string) => {
    const value = redisStrings.get(key) ?? null;
    redisStrings.delete(key);
    return value;
  }),
}));

const getSession = vi.hoisted(() => vi.fn());

vi.mock('../config/env.js', () => ({ env: envMock }));
vi.mock('../config/betterAuth.js', () => ({ auth: { api: { getSession } } }));
vi.mock('../utils/redis/client.js', () => ({ default: redisClient }));
vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../utils/observability/captureAuthIssue.js', () => ({ captureAuthIssue: vi.fn() }));

const { mobileTokenExchange } = await import('./mobileTokenExchange.js');
const { default: appLoginRouter } = await import('../routes/auth/appLogin.js');

const USER = { id: 'user-1', email: 'user@example.org' };
const internalAdapter = {
  findUserById: vi.fn(async (id: string) => (id === USER.id ? USER : null)),
  createSession: vi.fn(async () => ({
    token: 'session-token',
    expiresAt: new Date('2026-11-21T00:00:00Z'),
  })),
};

type Invoke = (input: unknown) => Promise<unknown>;

async function exchange(code: string): Promise<{ token?: string } | Error> {
  const { tokenExchangeCode } = mobileTokenExchange().endpoints;
  try {
    return (await (tokenExchangeCode as unknown as Invoke)({
      body: { code },
      context: { internalAdapter },
    })) as { token?: string };
  } catch (err) {
    return err as Error;
  }
}

/** Signs a code exactly like `appLogin.ts`, without storing its jti. */
function signCode(secret: string, jti: string): Promise<string> {
  return new SignJWT({ token_use: 'app_login_code', sub: USER.id, jti })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('60s')
    .setIssuer('gruenerator-auth')
    .setAudience('gruenerator-app-login-code')
    .sign(new TextEncoder().encode(secret));
}

let server: Server;
let baseUrl = '';

beforeAll(async () => {
  const app = express();
  app.use(appLoginRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  redisStrings.clear();
  vi.clearAllMocks();
});

/** Runs the real `/app-callback` and returns the code it hands to the app. */
async function mintViaAppCallback(): Promise<string> {
  redisStrings.set(
    'app-login:state:nonce-1',
    JSON.stringify({ redirectTo: 'gruenerator://auth/callback' })
  );
  getSession.mockResolvedValueOnce({ user: { id: USER.id } });
  const res = await fetch(`${baseUrl}/app-callback?state=nonce-1`, { redirect: 'manual' });
  expect(res.status).toBe(302);
  const code = new URL(res.headers.get('location') ?? '').searchParams.get('code');
  expect(code).toBeTruthy();
  return code ?? '';
}

describe('app login code', () => {
  it('exchanges a freshly minted code for a session', async () => {
    const result = await exchange(await mintViaAppCallback());

    expect(result).toMatchObject({ token: 'session-token' });
    expect(internalAdapter.createSession).toHaveBeenCalledWith(USER.id, false);
  });

  it('refuses the second redemption of the same code', async () => {
    const code = await mintViaAppCallback();

    await exchange(code);
    const second = await exchange(code);

    expect(second).toBeInstanceOf(Error);
    expect(internalAdapter.createSession).toHaveBeenCalledTimes(1);
  });

  it('refuses a validly signed code whose jti was never stored', async () => {
    const result = await exchange(await signCode('test-session-secret', 'never-stored'));

    expect(result).toBeInstanceOf(Error);
    expect(internalAdapter.createSession).not.toHaveBeenCalled();
  });

  it('refuses a code whose stored subject differs from the signed one', async () => {
    redisStrings.set('app-login:code:jti-1', 'someone-else');

    const result = await exchange(await signCode('test-session-secret', 'jti-1'));

    expect(result).toBeInstanceOf(Error);
    expect(internalAdapter.createSession).not.toHaveBeenCalled();
  });
});

describe('app login code signing key', () => {
  it('accepts no code in production when SESSION_SECRET is missing', async () => {
    envMock.NODE_ENV = 'production';
    envMock.SESSION_SECRET = null;
    vi.resetModules();
    try {
      const fresh = await import('./mobileTokenExchange.js');
      // Signed with the key the code used to fall back to.
      const code = await signCode('fallback-secret-please-change', 'jti-2');
      redisStrings.set('app-login:code:jti-2', USER.id);

      let result: unknown;
      try {
        result = await (
          fresh.mobileTokenExchange().endpoints.tokenExchangeCode as unknown as Invoke
        )({ body: { code }, context: { internalAdapter } });
      } catch (err) {
        result = err;
      }

      expect(result).toBeInstanceOf(Error);
      expect(internalAdapter.createSession).not.toHaveBeenCalled();
    } finally {
      envMock.NODE_ENV = 'test';
      envMock.SESSION_SECRET = 'test-session-secret';
    }
  });
});
