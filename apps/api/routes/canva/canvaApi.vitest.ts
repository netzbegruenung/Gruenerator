/**
 * The Canva OAuth redirect target saves the connection only for the browser of
 * the user who started the flow. The one-time state names that user; the
 * session of the browser completing the redirect has to match it.
 */
import { type AddressInfo } from 'node:net';

import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
// Stands in for the session cookie: the header names the signed-in user.
vi.mock('../../middleware/authMiddleware.js', () => {
  const fromHeader = (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ): void => {
    const user = req.headers['x-test-user'];
    if (typeof user === 'string') (req as unknown as { user: { id: string } }).user = { id: user };
    next();
  };
  return { optionalAuth: fromHeader, requireAuth: fromHeader };
});
const exchangeCodeForTokens = vi.fn();
vi.mock('../../services/api-clients/canvaClient.js', () => ({
  buildAuthorizeUrl: vi.fn(),
  exchangeCodeForTokens: (...a: unknown[]) => exchangeCodeForTokens(...a),
  getProfileDisplayName: vi.fn(async () => 'Canva User'),
  listDesigns: vi.fn(),
}));
const save = vi.fn();
vi.mock('../../services/connections/canva/CanvaConnectionManager.js', () => ({
  CanvaConnectionManager: { save: (...a: unknown[]) => save(...a) },
  getCanvaCredentials: () => ({ clientId: 'cid', clientSecret: 'secret' }),
  getCanvaRedirectUri: () => 'https://gruenerator.eu/api/canva/auth/callback',
}));
const consumePkceState = vi.fn();
vi.mock('../../services/connections/canva/canvaOAuthState.js', () => ({
  consumePkceState: (...a: unknown[]) => consumePkceState(...a),
  createPkceState: vi.fn(),
}));

const { default: canvaApiRouter } = await import('./canvaApi.js');

let baseUrl = '';
let close: () => void = () => {};

beforeAll(async () => {
  const app = express();
  app.use('/api/canva', canvaApiRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});

afterAll(() => close());

beforeEach(() => {
  consumePkceState
    .mockReset()
    .mockResolvedValue({ userId: 'user-1', codeVerifier: 'v', createdAt: Date.now() });
  exchangeCodeForTokens.mockReset().mockResolvedValue({ access_token: 'at', expires_in: 3600 });
  save.mockReset().mockResolvedValue(undefined);
});

const get = (headers: Record<string, string> = {}) =>
  fetch(`${baseUrl}/api/canva/auth/callback?code=c&state=s`, { headers });

describe('GET /api/canva/auth/callback', () => {
  it.each([
    ['a session of another user', { 'x-test-user': 'user-2' }],
    ['no session at all', {}],
  ])('saves no connection for %s', async (_label, headers: Record<string, string>) => {
    const res = await get(headers);

    expect(res.status).toBe(403);
    expect(consumePkceState).toHaveBeenCalledWith('s');
    expect(exchangeCodeForTokens).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('saves the connection for the user who started the flow', async () => {
    const res = await get({ 'x-test-user': 'user-1' });

    expect(res.status).toBe(200);
    expect(save).toHaveBeenCalledWith('user-1', expect.anything(), 'Canva User');
  });
});
