import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const internalAdapter = { deleteSession: vi.fn() };
const getSession = vi.fn();
const signOut = vi.fn(async () => {
  calls.push('signOut');
});
const revokeHandoffSessions = vi.fn(async (_adapter: unknown, _sessionId: string) => {
  calls.push('revoke');
  return 1;
});

vi.mock('../../config/betterAuth.js', () => ({
  auth: { api: { getSession, signOut }, $context: Promise.resolve({ internalAdapter }) },
}));
vi.mock('../../middleware/authMiddleware.js', () => ({ requireAuth: vi.fn() }));
vi.mock('../../plugins/webViewHandoff.js', () => ({ revokeHandoffSessions }));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const { default: router } = await import('./mobileAuth.js');

let server: Server;
let baseUrl = '';

beforeAll(async () => {
  const app = express();
  app.use(router);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

function logout(): Promise<Response> {
  return fetch(`${baseUrl}/mobile/logout`, {
    method: 'POST',
    headers: { authorization: 'Bearer mobile-token-1' },
  });
}

describe('POST /mobile/logout', () => {
  it('revokes the WebView sessions of the calling Bearer session before signing out', async () => {
    getSession.mockResolvedValueOnce({ session: { id: 'mobile-session-1' }, user: { id: 'u1' } });

    const res = await logout();

    expect(res.status).toBe(200);
    expect(revokeHandoffSessions).toHaveBeenCalledWith(internalAdapter, 'mobile-session-1');
    expect(calls).toEqual(['revoke', 'signOut']);
  });

  it('skips revocation without a valid session and still answers success', async () => {
    getSession.mockResolvedValueOnce(null);

    const res = await logout();

    expect(res.status).toBe(200);
    expect(revokeHandoffSessions).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('still signs out when revocation fails', async () => {
    getSession.mockResolvedValueOnce({ session: { id: 'mobile-session-1' }, user: { id: 'u1' } });
    revokeHandoffSessions.mockRejectedValueOnce(new Error('Redis down'));

    const res = await logout();

    expect(res.status).toBe(200);
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
