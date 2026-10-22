/**
 * The MCP OAuth redirect target. Two things leave it: whose session completed
 * the redirect (the service stores tokens only for the user who started the
 * flow), and the page shown in the popup — which must not carry what a remote
 * endpoint answered.
 */
import { type AddressInfo } from 'node:net';

import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../../config/env.js', () => ({ env: { BASE_URL: 'https://gruenerator.eu' } }));
// Stands in for the session cookie: the header names the signed-in user.
vi.mock('../../middleware/authMiddleware.js', () => ({
  optionalAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const user = req.headers['x-test-user'];
    if (typeof user === 'string') (req as unknown as { user: { id: string } }).user = { id: user };
    next();
  },
}));
const handleCallback = vi.fn();
vi.mock('../../services/mcp/McpOAuthService.js', () => ({
  McpOAuthService: {
    handleCallback: (...a: unknown[]) => handleCallback(...a),
    clientMetadataDocument: () => null,
  },
}));

const { mountMcpOAuthCallbackRouter } = await import('./mcpOAuthCallbackRouter.js');

let baseUrl = '';
let close: () => void = () => {};

beforeAll(async () => {
  const app = express();
  mountMcpOAuthCallbackRouter(app);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});

afterAll(() => close());

beforeEach(() => {
  handleCallback.mockReset().mockResolvedValue({ serverId: 'srv-1' });
});

const get = (headers: Record<string, string> = {}) =>
  fetch(`${baseUrl}/api/mcp/auth/callback?code=c&state=s`, { headers });

describe('GET /api/mcp/auth/callback', () => {
  it('hands the service the session that completed the redirect', async () => {
    await get({ 'x-test-user': 'user-2' });

    expect(handleCallback).toHaveBeenCalledWith({
      code: 'c',
      state: 's',
      iss: null,
      sessionUserId: 'user-2',
    });
  });

  it('hands the service no user when the browser has no session', async () => {
    await get();

    expect(handleCallback).toHaveBeenCalledWith(expect.objectContaining({ sessionUserId: null }));
  });

  it('shows our own worded errors in the popup', async () => {
    handleCallback.mockRejectedValue(
      Object.assign(new Error('Die Verbindung wurde nicht in dieser Anmeldung gestartet.'), {
        statusCode: 403,
      })
    );

    const html = await (await get()).text();

    expect(html).toContain('nicht in dieser Anmeldung gestartet');
  });

  it('keeps any other error message out of the popup', async () => {
    handleCallback.mockRejectedValue(new Error('HTTP 400: Raw body: internal-admin-console-7f3a'));

    const html = await (await get()).text();

    expect(html).not.toContain('internal-admin-console-7f3a');
    expect(html).toContain('Verbindung fehlgeschlagen');
  });
});
