import { beforeEach, describe, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => {
  const sets = new Map<string, Set<string>>();
  const strings = new Map<string, string>();
  const expiries = new Map<string, number>();
  const failMulti = { value: false };
  const multiCount = { value: 0 };
  return {
    sets,
    strings,
    expiries,
    failMulti,
    multiCount,
    client: {
      setEx: vi.fn(async (key: string, _ttl: number, value: string) => {
        strings.set(key, value);
      }),
      getDel: vi.fn(async (key: string) => {
        const value = strings.get(key) ?? null;
        strings.delete(key);
        return value;
      }),
      ttl: vi.fn(async (key: string) => {
        const at = expiries.get(key);
        return at == null ? -2 : at - Math.floor(Date.now() / 1000);
      }),
      sMembers: vi.fn(),
      del: vi.fn(),
      multi: () => {
        const ops: (() => unknown)[] = [];
        const chain = {
          sAdd(key: string, member: string) {
            ops.push(() => sets.set(key, (sets.get(key) ?? new Set()).add(member)));
            return chain;
          },
          expireAt(key: string, at: number) {
            ops.push(() => expiries.set(key, at));
            return chain;
          },
          exists(key: string) {
            ops.push(() => (strings.has(key) ? 1 : 0));
            return chain;
          },
          set(key: string, value: string, options: { EX: number }) {
            ops.push(() => {
              strings.set(key, value);
              expiries.set(key, options.EX);
            });
            return chain;
          },
          sMembers(key: string) {
            ops.push(() => [...(sets.get(key) ?? [])]);
            return chain;
          },
          del(key: string) {
            ops.push(() => {
              sets.delete(key);
              expiries.delete(key);
            });
            return chain;
          },
          exec: vi.fn(async () => {
            if (failMulti.value) throw new Error('Redis down');
            multiCount.value += 1;
            return ops.map((op) => op());
          }),
        };
        return chain;
      },
    },
  };
});

const getSessionFromCtx = vi.hoisted(() => vi.fn());
const setSessionCookie = vi.hoisted(() => vi.fn());

vi.mock('../utils/redis/client.js', () => ({ default: redis.client }));
vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../utils/observability/captureAuthIssue.js', () => ({ captureAuthIssue: vi.fn() }));
vi.mock('better-auth/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('better-auth/api')>()),
  getSessionFromCtx,
}));
vi.mock('better-auth/cookies', () => ({ setSessionCookie }));

const { webViewHandoff, revokeHandoffSessions } = await import('./webViewHandoff.js');

const MOBILE_SESSION = { id: 'mobile-session-1', token: 'mobile-token-1' };
const USER = { id: 'user-1' };
const WEB_EXPIRES_AT = new Date('2026-11-09T00:00:00Z');
const MARGIN_SECONDS = 30 * 24 * 60 * 60;

const { webHandoffMint, webHandoff } = webViewHandoff().endpoints;

let createdTokens: string[] = [];
const internalAdapter = {
  findUserById: vi.fn(async () => USER),
  createSession: vi.fn(async () => {
    const token = `web-token-${createdTokens.length + 1}`;
    createdTokens.push(token);
    return { id: `web-session-${createdTokens.length}`, token, expiresAt: WEB_EXPIRES_AT };
  }),
  deleteSession: vi.fn(async (_token: string) => undefined),
};

type Invoke = (input: unknown) => Promise<unknown>;

async function mint(): Promise<string> {
  getSessionFromCtx.mockResolvedValueOnce({ session: MOBILE_SESSION, user: USER });
  const res = (await (webHandoffMint as unknown as Invoke)({
    headers: new Headers({ authorization: 'Bearer mobile-token-1' }),
    context: { internalAdapter },
  })) as { token: string };
  return res.token;
}

async function redeem(query: Record<string, string>): Promise<unknown> {
  try {
    return await (webHandoff as unknown as Invoke)({
      query: { redirect: '/studio/canvas/doc-1', ...query },
      headers: new Headers({ authorization: 'Bearer mobile-token-1' }),
      context: { internalAdapter },
    });
  } catch (err) {
    return err;
  }
}

function isRedirect(result: unknown): boolean {
  return (result as { statusCode?: number }).statusCode === 302;
}

beforeEach(() => {
  redis.sets.clear();
  redis.strings.clear();
  redis.expiries.clear();
  redis.failMulti.value = false;
  redis.multiCount.value = 0;
  createdTokens = [];
  vi.clearAllMocks();
});

describe('webViewHandoff session bookkeeping', () => {
  it('records the handed-off web session under the minting Bearer session', async () => {
    const ott = await mint();
    const result = await redeem({ ott });

    expect(isRedirect(result)).toBe(true);
    expect(setSessionCookie).toHaveBeenCalledTimes(1);
    const key = `webview-handoff-sessions:${MOBILE_SESSION.id}`;
    expect([...(redis.sets.get(key) ?? [])]).toEqual(['web-token-1']);
    expect(redis.expiries.get(key)).toBe(WEB_EXPIRES_AT.getTime() / 1000 + MARGIN_SECONDS);
  });

  it('never shortens the set expiry below what an earlier session needs', async () => {
    const key = `webview-handoff-sessions:${MOBILE_SESSION.id}`;
    const later = WEB_EXPIRES_AT.getTime() / 1000 + 2 * MARGIN_SECONDS;
    redis.sets.set(key, new Set(['web-old']));
    redis.expiries.set(key, later);

    await redeem({ ott: await mint() });

    expect(redis.expiries.get(key)).toBe(later);
    expect(redis.sets.get(key)).toEqual(new Set(['web-old', 'web-token-1']));
  });

  it('deletes the session of a token redeemed after the mobile logout', async () => {
    const ott = await mint();
    await revokeHandoffSessions(internalAdapter, MOBILE_SESSION.id);

    const result = await redeem({ ott });

    expect(isRedirect(result)).toBe(false);
    expect((result as { statusCode?: number }).statusCode).toBe(401);
    expect(setSessionCookie).not.toHaveBeenCalled();
    expect(internalAdapter.deleteSession).toHaveBeenCalledWith('web-token-1');
  });

  it('records sessions from the legacy header-authenticated path too', async () => {
    getSessionFromCtx.mockResolvedValueOnce({ session: MOBILE_SESSION, user: USER });
    const result = await redeem({});

    expect(isRedirect(result)).toBe(true);
    expect([...(redis.sets.get(`webview-handoff-sessions:${MOBILE_SESSION.id}`) ?? [])]).toEqual([
      'web-token-1',
    ]);
  });

  it('still issues the cookie when Redis bookkeeping fails', async () => {
    const ott = await mint();
    redis.failMulti.value = true;
    const result = await redeem({ ott });

    expect(isRedirect(result)).toBe(true);
    expect(setSessionCookie).toHaveBeenCalledTimes(1);
    expect(redis.sets.size).toBe(0);
  });
});

describe('revokeHandoffSessions', () => {
  it('revokes only the sessions handed off from that Bearer session', async () => {
    redis.sets.set('webview-handoff-sessions:mobile-session-1', new Set(['web-a', 'web-b']));
    redis.sets.set('webview-handoff-sessions:other-device', new Set(['web-c']));

    const revoked = await revokeHandoffSessions(internalAdapter, 'mobile-session-1');

    expect(revoked).toBe(2);
    expect(internalAdapter.deleteSession.mock.calls.map(([t]) => t).sort()).toEqual([
      'web-a',
      'web-b',
    ]);
    expect(redis.sets.has('webview-handoff-sessions:mobile-session-1')).toBe(false);
    expect(redis.sets.get('webview-handoff-sessions:other-device')).toEqual(new Set(['web-c']));
  });

  it('reads, clears and tombstones in one MULTI', async () => {
    redis.sets.set('webview-handoff-sessions:mobile-session-1', new Set(['web-a']));

    await revokeHandoffSessions(internalAdapter, 'mobile-session-1');

    expect(redis.multiCount.value).toBe(1);
    expect(redis.client.sMembers).not.toHaveBeenCalled();
    expect(redis.client.del).not.toHaveBeenCalled();
    expect(redis.strings.get('webview-handoff-revoked:mobile-session-1')).toBe('1');
    expect(redis.expiries.get('webview-handoff-revoked:mobile-session-1')).toBe(120);
  });

  it('is a no-op when nothing was handed off', async () => {
    expect(await revokeHandoffSessions(internalAdapter, 'mobile-session-1')).toBe(0);
    expect(internalAdapter.deleteSession).not.toHaveBeenCalled();
  });
});
