import { describe, expect, it, vi } from 'vitest';

import type { Request, Response } from 'express';

// Local .env disables rate limits for dev; this test needs the real limiter.
vi.stubEnv('DISABLE_RATE_LIMITS', 'false');
const { parteitageUnlockLimiter } = await import('./unlockLimiter.js');

const fakeRes = () => {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, unknown>,
    setHeader: vi.fn((k: string, v: unknown) => {
      res.headers[k] = v;
    }),
    getHeader: vi.fn(),
    status: vi.fn((c: number) => {
      res.statusCode = c;
      return res;
    }),
    send: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
  };
  return res;
};

const fakeReq = (method: string, path: string, userId: string) =>
  ({ method, path, ip: '127.0.0.1', user: { id: userId }, headers: {} }) as unknown as Request;

const run = async (req: Request) => {
  const res = fakeRes();
  const next = vi.fn();
  await (
    parteitageUnlockLimiter as (r: Request, s: Response, n: () => void) => Promise<void> | void
  )(req, res as unknown as Response, next);
  return { res, next };
};

describe('parteitageUnlockLimiter', () => {
  it('answers 429 on the 11th unlock attempt of one user', async () => {
    for (let i = 0; i < 10; i++) {
      const { next } = await run(fakeReq('POST', '/abc-123/entsperren', 'u-limit'));
      expect(next).toHaveBeenCalled();
    }
    const { res, next } = await run(fakeReq('POST', '/abc-123/entsperren', 'u-limit'));
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
  });

  it('does not count other requests or other users', async () => {
    for (let i = 0; i < 15; i++) {
      const { next } = await run(fakeReq('GET', '/abc-123', 'u-read'));
      expect(next).toHaveBeenCalled();
    }
    const { next } = await run(fakeReq('POST', '/abc-123/entsperren', 'u-other'));
    expect(next).toHaveBeenCalled();
  });
});
