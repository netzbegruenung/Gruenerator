/**
 * Die selbst gehostete Connect-UI fragt ohne `apiURL` im Link Nangos Cloud und
 * meldet jede Session als abgelaufen — so am 03.10.2026 auf prod passiert.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createConnectSession = vi.fn();
const env: Record<string, string | undefined> = {};

vi.mock('../../config/env.js', () => ({ env }));
vi.mock('../../config/nango.js', () => ({
  getNango: () => ({ createConnectSession }),
  HIDDEN_NANGO_PROVIDERS: new Set(),
  NANGO_PROVIDERS: {},
}));

const { ConnectionService } = await import('./ConnectionService.js');

beforeEach(() => {
  createConnectSession.mockReset().mockResolvedValue({
    data: { connect_link: 'https://connect.example/?session_token=tok' },
  });
  env.NANGO_PUBLIC_URL = 'https://nango.example';
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
