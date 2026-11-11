/**
 * Microsoft 365 ist vorerst Admin-Sache: `/session-token` ist nicht auf einen
 * Anbieter begrenzt, Nangos Connect-Oberfläche würde es also jeder Person
 * anbieten. Was hier leise falsch werden könnte: Nicht-Admins bekommen wieder
 * ein unbegrenztes Token, oder Admins verlieren ihres.
 */
import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireInstanceAdmin = vi.fn();
const createSessionToken = vi.fn();

vi.mock('../../utils/adminAuthz.js', () => ({ requireInstanceAdmin }));
vi.mock('../../services/connections/ConnectionService.js', () => ({
  ConnectionService: { createSessionToken },
}));
vi.mock('../../config/nango.js', () => ({
  NANGO_PROVIDERS: { google: {}, microsoft: {}, jira: {}, confluence: {} },
}));
vi.mock('../../services/api-clients/atlassianClient.js', () => ({}));
vi.mock('../../services/api-clients/googleDriveClient.js', () => ({}));
vi.mock('../../services/api-clients/microsoftGraphClient.js', () => ({}));

async function postSessionToken(): Promise<unknown> {
  const { default: router } = await import('./connectionsController.js');
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { id: 'u1', email: 'u1@example.org' };
    next();
  });
  app.use('/api/connections', router);
  const server = app.listen(0);
  try {
    const { port } = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${port}/api/connections/session-token`, {
      method: 'POST',
    });
    return res.json();
  } finally {
    server.close();
  }
}

beforeEach(() => {
  requireInstanceAdmin.mockReset();
  createSessionToken.mockReset().mockResolvedValue('tok');
});

describe('POST /api/connections/session-token', () => {
  it('lässt Microsoft für Nicht-Admins aus den erlaubten Integrationen heraus', async () => {
    requireInstanceAdmin.mockResolvedValue(false);
    expect(await postSessionToken()).toEqual({ token: 'tok' });
    expect(createSessionToken).toHaveBeenCalledWith('u1', {
      allowedIntegrations: ['google', 'jira', 'confluence'],
    });
  });

  it('gibt Admins ein unbegrenztes Token', async () => {
    requireInstanceAdmin.mockResolvedValue(true);
    await postSessionToken();
    expect(createSessionToken).toHaveBeenCalledWith('u1', undefined);
  });
});
