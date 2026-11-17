/**
 * Die selbst gehostete Connect-UI fragt ohne `apiURL` im Link Nangos Cloud und
 * meldet jede Session als abgelaufen — so am 03.10.2026 auf prod passiert.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createConnectSession = vi.fn();
const listConnections = vi.fn();
const getConnection = vi.fn();
const isInstanceAdmin = vi.fn();
const env: Record<string, string | undefined> = {};

vi.mock('../../config/env.js', () => ({ env }));
vi.mock('../../utils/adminAuthz.js', () => ({ isInstanceAdmin }));
vi.mock('../../config/nango.js', () => ({
  getNango: () => ({ createConnectSession, listConnections, getConnection }),
  HIDDEN_NANGO_PROVIDERS: new Set(),
  ADMIN_ONLY_NANGO_PROVIDERS: new Set(['microsoft']),
  NANGO_PROVIDERS: {
    microsoft: { label: 'Microsoft 365', services: ['OneDrive'] },
    jira: { label: 'Jira', services: ['Issues'] },
  },
}));

const { ConnectionNotAllowedError, ConnectionService } = await import('./ConnectionService.js');

beforeEach(() => {
  createConnectSession.mockReset().mockResolvedValue({
    data: { connect_link: 'https://connect.example/?session_token=tok' },
  });
  listConnections.mockReset().mockResolvedValue({
    connections: [{ provider_config_key: 'microsoft', connection_id: 'c-ms', created: null }],
  });
  getConnection.mockReset().mockResolvedValue({ credentials: { access_token: 'at' } });
  isInstanceAdmin.mockReset().mockResolvedValue(true);
  env.NANGO_PUBLIC_URL = 'https://nango.example';
});

/**
 * Microsoft 365 ist vorerst Admin-Sache. Die Regel sitzt im Dienst, damit jede
 * Tür sie erbt — auch `@connect` im Chat und eine Verbindung, die eine Person
 * angelegt hat, bevor der Anbieter gesperrt wurde.
 */
describe('Admin-Anbieter', () => {
  it('lässt Microsoft für Nicht-Admins aus der Connect-Session heraus', async () => {
    isInstanceAdmin.mockResolvedValue(false);
    createConnectSession.mockResolvedValue({ data: { token: 'tok' } });
    await ConnectionService.createSessionToken('u1');
    expect(createConnectSession).toHaveBeenCalledWith({
      end_user: { id: 'u1' },
      allowed_integrations: ['jira'],
    });
  });

  it('gibt Admins eine Session ohne Begrenzung', async () => {
    createConnectSession.mockResolvedValue({ data: { token: 'tok' } });
    await ConnectionService.createSessionToken('u1');
    expect(createConnectSession).toHaveBeenCalledWith({ end_user: { id: 'u1' } });
  });

  it('zeigt Nicht-Admins Microsoft nicht im Status', async () => {
    isInstanceAdmin.mockResolvedValue(false);
    const providers = await ConnectionService.listConnections('u1');
    expect(providers.map((p) => p.provider)).toEqual(['jira']);
  });

  it('sperrt eine bestehende Microsoft-Verbindung für Nicht-Admins', async () => {
    isInstanceAdmin.mockResolvedValue(false);
    await expect(ConnectionService.getConnection('u1', 'microsoft')).rejects.toBeInstanceOf(
      ConnectionNotAllowedError
    );
    expect(getConnection).not.toHaveBeenCalled();
  });

  it('gibt Admins die Microsoft-Verbindung', async () => {
    await expect(ConnectionService.getConnection('u1', 'microsoft')).resolves.toMatchObject({
      accessToken: 'at',
    });
  });

  it('verweigert Nicht-Admins den Connect-Link für Microsoft', async () => {
    isInstanceAdmin.mockResolvedValue(false);
    await expect(ConnectionService.createConnectLink('u1', 'microsoft')).rejects.toBeInstanceOf(
      ConnectionNotAllowedError
    );
  });
});

describe('createConnectLink', () => {
  it('hängt die öffentliche Nango-Adresse als apiURL an', async () => {
    const link = new URL(await ConnectionService.createConnectLink('u1', 'microsoft'));

    expect(link.searchParams.get('session_token')).toBe('tok');
    expect(link.searchParams.get('apiURL')).toBe('https://nango.example');
    expect(createConnectSession).toHaveBeenCalledWith({
      end_user: { id: 'u1' },
      allowed_integrations: ['microsoft'],
    });
  });

  it('lässt den Link ohne NANGO_PUBLIC_URL unverändert', async () => {
    env.NANGO_PUBLIC_URL = undefined;
    const link = new URL(await ConnectionService.createConnectLink('u1', 'microsoft'));

    expect(link.searchParams.has('apiURL')).toBe(false);
  });
});
