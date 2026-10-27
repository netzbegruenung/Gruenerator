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

// Only `admin-1` is an instance admin.
vi.mock('../../utils/adminAuthz.js', () => ({
  requireInstanceAdmin: vi.fn(async (userId: string) => userId === 'admin-1'),
}));
const exportCollectionToCanva = vi.fn();
vi.mock('../../services/connections/canva/canvaStickerExport.js', () => ({
  exportCollectionToCanva: (...a: unknown[]) => exportCollectionToCanva(...a),
}));
const autofillDesign = vi.fn();
const getAutofillFields = vi.fn();
vi.mock('../../services/connections/canva/canvaAutofill.js', () => ({
  autofillDesign: (...a: unknown[]) => autofillDesign(...a),
  getAutofillFields: (...a: unknown[]) => getAutofillFields(...a),
  getAutofillSources: vi.fn(),
}));
vi.mock('../../services/marketplace/context.js', () => ({
  buildMarketplaceContext: (p: { userId: string }) => ({ userId: p.userId }),
}));
vi.mock('../../services/localization/index.js', () => ({
  extractLocaleFromRequest: () => 'de-DE',
}));

const { default: canvaApiRouter } = await import('./canvaApi.js');

let baseUrl = '';
let close: () => void = () => {};

beforeAll(async () => {
  const app = express();
  app.use(express.json());
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

describe('admin gate', () => {
  it.each([
    ['GET', '/status'],
    ['GET', '/auth/start'],
    ['POST', '/collections/queer/export'],
    ['GET', '/autofill/sources'],
    ['GET', '/autofill/fields?kind=design&id=DAF1'],
    ['POST', '/autofill'],
  ])('refuses %s %s to a user who is no instance admin', async (method, path) => {
    const res = await fetch(`${baseUrl}/api/canva${path}`, {
      method,
      headers: { 'x-test-user': 'user-1' },
      redirect: 'manual',
    });

    expect(res.status).toBe(403);
    expect(exportCollectionToCanva).not.toHaveBeenCalled();
  });
});

describe('POST /api/canva/collections/:collectionId/export', () => {
  const post = (collectionId: string) =>
    fetch(`${baseUrl}/api/canva/collections/${collectionId}/export`, {
      method: 'POST',
      headers: { 'x-test-user': 'admin-1' },
    });

  beforeEach(() => exportCollectionToCanva.mockReset());

  it('rejects a collection id that does not exist', async () => {
    const res = await post('gibt-es-nicht');

    expect(res.status).toBe(400);
    expect(exportCollectionToCanva).not.toHaveBeenCalled();
  });

  it('exports the collection for the signed-in admin', async () => {
    const value = { folderName: 'Queer und sichtbar', uploaded: 3, failed: [] };
    exportCollectionToCanva.mockResolvedValue({ ok: true, value });

    const res = await post('queer');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(value);
    expect(exportCollectionToCanva).toHaveBeenCalledWith({ userId: 'admin-1' }, 'queer');
  });

  it('passes a 404 for a collection without stickers through', async () => {
    exportCollectionToCanva.mockResolvedValue({ ok: false, status: 404, message: 'leer' });

    expect((await post('starter')).status).toBe(404);
  });
});

describe('autofill routes', () => {
  const admin = { 'x-test-user': 'admin-1', 'content-type': 'application/json' };

  beforeEach(() => {
    autofillDesign.mockReset();
    getAutofillFields.mockReset();
  });

  it('rejects a source id that is not a Canva id', async () => {
    const res = await fetch(`${baseUrl}/api/canva/autofill/fields?kind=design&id=..%2Fx`, {
      headers: admin,
    });

    expect(res.status).toBe(400);
    expect(getAutofillFields).not.toHaveBeenCalled();
  });

  it('rejects a body without texts', async () => {
    const res = await fetch(`${baseUrl}/api/canva/autofill`, {
      method: 'POST',
      headers: admin,
      body: JSON.stringify({ source: { kind: 'design', id: 'DAF1' } }),
    });

    expect(res.status).toBe(400);
    expect(autofillDesign).not.toHaveBeenCalled();
  });

  it('turns Canva’s missing-capability 403 into a plan hint, without echoing Canva’s body', async () => {
    const { AxiosError } = await import('axios');
    autofillDesign.mockRejectedValue(
      new AxiosError('Request failed', '403', undefined, undefined, {
        status: 403,
        data: { message: 'requires one of capabilities ["autofill"]', access_token: 'secret' },
      } as never)
    );

    const res = await fetch(`${baseUrl}/api/canva/autofill`, {
      method: 'POST',
      headers: admin,
      body: JSON.stringify({ source: { kind: 'design', id: 'DAF1' }, texts: { TITEL: 'x' } }),
    });
    const body = await res.text();

    expect(res.status).toBe(403);
    expect(body).toContain('Canva Pro');
    expect(body).not.toContain('secret');
  });
});
