/**
 * Die drei Antworten der Freigabe-Karte im Chat. Die Werkzeugliste der Karte
 * ist Client-Eingabe — es wirkt nur, was beim Server wirklich offen ist.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/getAuthedUser.js', () => ({ getAuthedUser: () => ({ id: 'u1' }) }));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const getPendingDrift = vi.fn();
const approveTools = vi.fn();
vi.mock('../../services/mcp/McpServerRegistry.js', () => ({
  McpServerRegistry: {
    getPendingDrift: (...a: unknown[]) => getPendingDrift(...a),
    approveTools: (...a: unknown[]) => approveTools(...a),
  },
}));

const grantApproval = vi.fn();
const revokeApproval = vi.fn();
vi.mock('../chat/services/agenticLoop/toolApprovalRepo.js', () => ({
  grantApproval: (...a: unknown[]) => grantApproval(...a),
  revokeApproval: (...a: unknown[]) => revokeApproval(...a),
  revokeApprovalsForServer: vi.fn(),
}));

const addThreadGrant = vi.fn();
vi.mock('../../services/mcp/mcpThreadGrants.js', () => ({
  addThreadGrant: (...a: unknown[]) => addThreadGrant(...a),
}));

const resolveToolGrant = vi.fn();
vi.mock('../chat/services/threadPersistenceService.js', () => ({
  resolveToolGrant: (...a: unknown[]) => resolveToolGrant(...a),
}));

const { mcpServersContractRouter } = await import('./mcpServersContractRouter.js');

type Handler = (args: unknown) => Promise<{ status: number; body: unknown }>;
const toolGrant = (mcpServersContractRouter as unknown as { toolGrant: Handler }).toolGrant;

const call = (scope: 'denied' | 'session' | 'always', tools: string[]) =>
  toolGrant({ req: {}, params: { id: 's1' }, body: { scope, threadId: 't1', tools } });

describe('POST /api/mcp/servers/:id/tool-grant', () => {
  beforeEach(() => {
    for (const fn of [grantApproval, revokeApproval, addThreadGrant, resolveToolGrant]) {
      fn.mockReset().mockResolvedValue(undefined);
    }
    getPendingDrift.mockReset().mockResolvedValue({
      name: 'Demo',
      drift: {
        changed: ['search'],
        added: ['themes'],
        detectedAt: 't',
        fingerprints: { search: 'd-search', themes: 'd-themes' },
      },
    });
    approveTools.mockReset().mockResolvedValue({ server: { name: 'Demo' }, changed: ['search'] });
  });

  it('session: pins the recorded digests for this thread only, no server-wide approval', async () => {
    const res = await call('session', ['themes', 'not-pending']);

    expect(res).toEqual({ status: 200, body: { resolved: 'session' } });
    expect(addThreadGrant).toHaveBeenCalledWith('t1', 's1', { themes: 'd-themes' });
    expect(approveTools).not.toHaveBeenCalled();
    expect(resolveToolGrant).toHaveBeenCalledWith('t1', 'u1', 's1', 'session');
  });

  it('always: approves server-wide and drops the stale "always allow" of changed tools', async () => {
    await call('always', ['search', 'themes']);

    expect(approveTools).toHaveBeenCalledWith('u1', 's1');
    expect(revokeApproval).toHaveBeenCalledWith('u1', 'mcp:s1/search');
    expect(addThreadGrant).not.toHaveBeenCalled();
  });

  it('denied: switches exactly the pending tools off, then approves the rest', async () => {
    await call('denied', ['themes', 'not-pending']);

    expect(grantApproval).toHaveBeenCalledTimes(1);
    expect(grantApproval).toHaveBeenCalledWith('u1', 'mcp:s1/themes', 'Demo · themes', 'deny');
    expect(approveTools).toHaveBeenCalledWith('u1', 's1');
  });

  it('answers 404 for a server the caller does not own', async () => {
    getPendingDrift.mockResolvedValue(undefined);
    const res = await call('always', ['search']);
    expect(res.status).toBe(404);
    expect(approveTools).not.toHaveBeenCalled();
  });
});
