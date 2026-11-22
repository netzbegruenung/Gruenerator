/**
 * `POST /api/user-agents` ist geschlossen (#5939): jede Anfrage, auch aus einer
 * ausgelieferten App-Version, bekommt 410 mit derselben Absage wie Chat-Werkzeug
 * und MCP — und es wird nichts angelegt.
 */
import { describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
  createUserAgent: vi.fn(),
  deleteUserAgent: vi.fn(),
  getUserAgent: vi.fn(),
  listMentionableUserAgents: vi.fn(),
  listUserAgents: vi.fn(),
  updateUserAgent: vi.fn(),
}));

vi.mock('../../services/userAgents/userAgentsRepository.js', () => repo);
vi.mock('../../database/services/PostgresService.js', () => ({ getPostgresInstance: vi.fn() }));

const { userAgentsContractRouter: router } = await import('./userAgentsContractRouter.js');
const { AGENT_CREATION_CLOSED } = await import('../chat/agents/userAgentTools.js');

describe('create', () => {
  it('answers 410 with the AGENT_CREATION_CLOSED message and creates nothing', async () => {
    const res = await router.create({
      req: { user: { id: 'user-1', locale: 'de-DE' }, headers: {} },
      body: { identifier: 'neu', title: 'Neu' },
    } as never);
    expect(res).toEqual({ status: 410, body: { success: false, message: AGENT_CREATION_CLOSED } });
    expect(repo.createUserAgent).not.toHaveBeenCalled();
  });
});
