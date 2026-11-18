/**
 * Bekannte Konnektoren (Bahn, Wetter, Rateo, …) sind Zeilen: „Verbinden" legt
 * sie an, „Trennen" löscht sie, und eine alte `system-<key>`-ID aus einem
 * ausgelieferten Bundle oder einem angehefteten Konnektor tut weiter, was sie
 * vorher tat.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/getAuthedUser.js', () => ({ getAuthedUser: () => ({ id: 'u1' }) }));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const ROW = '7a1b0000-0000-0000-0000-000000000000';
const rows = new Map<string, string>(); // registry key → row id

class RegistryConnectorPatchError extends Error {}
const update = vi.fn();
const remove = vi.fn();
const connectRegistryConnector = vi.fn();
vi.mock('../../services/mcp/McpServerRegistry.js', () => ({
  RegistryConnectorPatchError,
  McpServerRegistry: {
    resolveServerId: (_u: string, ref: string) =>
      Promise.resolve(ref.startsWith('system-') ? (rows.get(ref.slice(7)) ?? null) : ref),
    getRegistryKey: (_u: string, id: string) =>
      Promise.resolve([...rows].find(([, rowId]) => rowId === id)?.[0] ?? null),
    connectRegistryConnector: (...a: unknown[]) => connectRegistryConnector(...a),
    update: (...a: unknown[]) => update(...a),
    delete: (...a: unknown[]) => remove(...a),
  },
}));

vi.mock('../../services/mcp/McpOAuthService.js', () => ({
  McpOAuthService: {
    tokenRevocation: () => Promise.resolve(null),
    redirectUri: () => 'x',
    startAuthorization: vi.fn(),
  },
}));

const revokeApprovalsForServer = vi.fn();
vi.mock('../chat/services/agenticLoop/toolApprovalRepo.js', () => ({
  grantApproval: vi.fn(),
  revokeStandingAllow: vi.fn(),
  revokeApprovalsForServer: (...a: unknown[]) => revokeApprovalsForServer(...a),
}));

const { mcpServersContractRouter } = await import('./mcpServersContractRouter.js');

type Handler = (args: unknown) => Promise<{ status: number; body: unknown }>;
const router = mcpServersContractRouter as unknown as Record<string, Handler>;
const SUMMARY = { id: ROW, name: 'Rateo', url: '', registryKey: 'rateo', enabled: true };

beforeEach(() => {
  rows.clear();
  update.mockReset().mockResolvedValue(SUMMARY);
  remove.mockReset().mockResolvedValue(true);
  revokeApprovalsForServer.mockReset().mockResolvedValue(undefined);
  connectRegistryConnector.mockReset().mockImplementation((_u: string, key: string) => {
    if (key !== 'rateo' && key !== 'bahn') return Promise.resolve(null);
    rows.set(key, ROW);
    return Promise.resolve({ ...SUMMARY, registryKey: key });
  });
});

describe('POST /api/mcp/servers/connect/:registryKey', () => {
  it('verbindet einen bekannten Konnektor', async () => {
    const res = await router.connectRegistryConnector!({
      req: {},
      params: { registryKey: 'rateo' },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ server: { registryKey: 'rateo', url: '' } });
  });

  it('antwortet 404 für einen unbekannten Schlüssel', async () => {
    const res = await router.connectRegistryConnector!({
      req: {},
      params: { registryKey: 'unbekannt' },
    });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/mcp/servers/:id', () => {
  it('Alt-Bundle: system-<key> einschalten ohne Zeile verbindet', async () => {
    const res = await router.update!({
      req: {},
      params: { id: 'system-bahn' },
      body: { enabled: true },
    });
    expect(res.status).toBe(200);
    expect(connectRegistryConnector).toHaveBeenCalledWith('u1', 'bahn');
    expect(update).not.toHaveBeenCalled();
  });

  it('Alt-Bundle: system-<key> ausschalten ohne Zeile ist 404', async () => {
    const res = await router.update!({
      req: {},
      params: { id: 'system-bahn' },
      body: { enabled: false },
    });
    expect(res.status).toBe(404);
    expect(connectRegistryConnector).not.toHaveBeenCalled();
  });

  it('schaltet über den Alias die Zeile der Person', async () => {
    rows.set('bahn', ROW);
    const res = await router.update!({
      req: {},
      params: { id: 'system-bahn' },
      body: { enabled: false },
    });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith('u1', ROW, { enabled: false });
  });

  it('lehnt eine URL-Änderung an einem bekannten Konnektor mit 400 ab', async () => {
    rows.set('rateo', ROW);
    update.mockRejectedValue(new RegistryConnectorPatchError());
    const res = await router.update!({
      req: {},
      params: { id: ROW },
      body: { url: 'https://example.org/mcp' },
    });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/mcp/servers/:id', () => {
  it('trennt einen bekannten Konnektor über den Alias und räumt seine Freigaben ab', async () => {
    rows.set('bahn', ROW);
    const res = await router.remove!({ req: {}, params: { id: 'system-bahn' } });
    expect(res.status).toBe(200);
    expect(remove).toHaveBeenCalledWith('u1', ROW);
    expect(revokeApprovalsForServer).toHaveBeenCalledWith('u1', ROW);
    expect(revokeApprovalsForServer).toHaveBeenCalledWith('u1', 'bahn', 'managed');
  });

  it('antwortet 404 für einen Alias ohne Zeile', async () => {
    const res = await router.remove!({ req: {}, params: { id: 'system-bahn' } });
    expect(res.status).toBe(404);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('POST /api/mcp/servers/:id/oauth/start', () => {
  it('startet für einen bekannten Konnektor keine Anmeldung', async () => {
    rows.set('rateo', ROW);
    const res = await router.oauthStart!({ req: {}, params: { id: ROW } });
    expect(res.status).toBe(400);
  });
});
