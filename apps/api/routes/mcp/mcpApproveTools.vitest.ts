/**
 * „Werkzeuge freigeben": zwei Fallen, die das Review gefunden hat — eine
 * `system-…`-ID ohne Zeile darf nicht als 500 am uuid-Cast sterben, und das Freigeben
 * darf eine gerade gesetzte „Aus"-Stufe nicht wieder löschen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/getAuthedUser.js', () => ({ getAuthedUser: () => ({ id: 'u1' }) }));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const approveTools = vi.fn();
vi.mock('../../services/mcp/McpServerRegistry.js', () => ({
  McpServerRegistry: {
    // A `system-…` alias without a row resolves to nothing (never connected).
    resolveServerId: (_u: string, id: string) =>
      Promise.resolve(id.startsWith('system-') ? null : id),
    approveTools: (...a: unknown[]) => approveTools(...a),
  },
}));

const revokeStandingAllow = vi.fn();
vi.mock('../chat/services/agenticLoop/toolApprovalRepo.js', () => ({
  revokeStandingAllow: (...a: unknown[]) => revokeStandingAllow(...a),
  revokeApprovalsForServer: vi.fn(),
}));

const { mcpServersContractRouter } = await import('./mcpServersContractRouter.js');

type Handler = (args: unknown) => Promise<{ status: number; body: unknown }>;
const approve = (id: string) =>
  (mcpServersContractRouter as unknown as { approveTools: Handler }).approveTools({
    req: {},
    params: { id },
  });

describe('POST /api/mcp/servers/:id/approve-tools', () => {
  beforeEach(() => {
    approveTools.mockReset().mockResolvedValue({ server: { name: 'Demo' }, changed: ['search'] });
    revokeStandingAllow.mockReset().mockResolvedValue(undefined);
  });

  it('answers 404 for a known-connector alias without a row, without approving', async () => {
    const res = await approve('system-wetter');
    expect(res.status).toBe(404);
    expect(approveTools).not.toHaveBeenCalled();
  });

  it('revokes only the standing "always allow" of changed tools', async () => {
    const res = await approve('s1');
    expect(res.status).toBe(200);
    expect(revokeStandingAllow).toHaveBeenCalledWith('u1', 'mcp:s1/search');
  });
});
