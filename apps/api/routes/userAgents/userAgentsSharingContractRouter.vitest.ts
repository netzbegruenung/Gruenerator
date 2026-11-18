/**
 * Der Link-Endpunkt der Agent-Freigabe ohne HTTP-Schicht und ohne Datenbank:
 * welcher Schlüssel an das Repository geht, und dass der Prompt eines Agents
 * nie mitkommt — ein Link erlaubt das Benutzen, nicht das Lesen (#3781).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
  getAccessibleUserAgentById: vi.fn(),
  getAccessibleUserAgentBySlugSuffix: vi.fn(),
  getAgentSharing: vi.fn(),
  listPublicUserAgents: vi.fn(),
  updateAgentSharing: vi.fn(),
}));

vi.mock('../../services/userAgents/userAgentsRepository.js', () => repo);
vi.mock('../../database/services/PostgresService.js', () => ({ getPostgresInstance: vi.fn() }));
vi.mock('../../services/groups/groupContent.js', () => ({ notifyContentShared: vi.fn() }));
vi.mock('../../services/groups/groupMembership.js', () => ({ assertCanShareToGroup: vi.fn() }));

const { userAgentsSharingContractRouter: router } =
  await import('./userAgentsSharingContractRouter.js');

const req = { user: { id: 'user-1', locale: 'de-DE' }, headers: {} } as never;
const resolve = (slug: string) => router.resolveLink({ req, params: { slug } } as never);
const UUID = '6f1c2d3e-0000-4000-8000-000000000001';

beforeEach(() => {
  for (const fn of Object.values(repo)) fn.mockReset();
});

describe('resolveLink', () => {
  it('resolves by suffix and leaves the prompt out', async () => {
    repo.getAccessibleUserAgentBySlugSuffix.mockResolvedValue({
      id: UUID,
      identifier: 'klima',
      title: 'Klima',
      systemRole: 'Geheimer Prompt der Eigentümerin',
    });
    const res = await resolve('klima-Ab3xK9');
    expect(repo.getAccessibleUserAgentBySlugSuffix).toHaveBeenCalledWith('Ab3xK9', 'user-1');
    expect(res).toMatchObject({ status: 200, body: { agent: { id: UUID } } });
    expect(JSON.stringify(res)).not.toContain('Geheimer Prompt');
  });

  it('still resolves an old uuid link', async () => {
    repo.getAccessibleUserAgentById.mockResolvedValue({ id: UUID, identifier: 'klima' });
    expect(await resolve(UUID)).toMatchObject({ status: 200 });
    expect(repo.getAccessibleUserAgentById).toHaveBeenCalledWith(UUID, 'user-1');
  });

  it('never resolves a bare identifier — it is unique only per owner', async () => {
    expect(await resolve('klima')).toMatchObject({ status: 404 });
    expect(repo.getAccessibleUserAgentBySlugSuffix).not.toHaveBeenCalled();
    expect(repo.getAccessibleUserAgentById).not.toHaveBeenCalled();
  });

  it('answers 404 for an agent the caller may not use', async () => {
    repo.getAccessibleUserAgentBySlugSuffix.mockResolvedValue(undefined);
    expect(await resolve('klima-Ab3xK9')).toMatchObject({ status: 404 });
  });
});
