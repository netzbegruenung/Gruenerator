/**
 * Die Freischaltung von „Panda" ist die einzige Schreibstelle dieses Routers.
 * Was nicht still falsch werden darf: das Admin-Gatter (sonst schaltet sich
 * jede angemeldete Person selbst frei) und die Herleitung des wirksamen Werts
 * aus Entscheidung und Instanz-Standard.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireInstanceAdmin = vi.fn();
const query = vi.fn();

vi.mock('../../utils/adminAuthz.js', () => ({ requireInstanceAdmin }));
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

const req = { user: { id: 'admin-1', email: 'admin@example.org' } } as never;
const USER_ID = '6f1c1d1e-8f3a-4c2b-9a51-2b7f0c4d9e10';

function row(panda_enabled: boolean | null) {
  return {
    id: USER_ID,
    email: 'person@example.org',
    display_name: 'Person',
    is_admin: false,
    last_login: null,
    created_at: '2026-09-01T00:00:00.000Z',
    panda_enabled,
  };
}

async function loadRouter() {
  const mod = await import('./instanceAdminOverviewContractRouter.js');
  return mod.instanceAdminOverviewContractRouter;
}

beforeEach(() => {
  requireInstanceAdmin.mockReset().mockResolvedValue(true);
  query.mockReset();
});

describe('instanceAdminOverviewContract.setUserPanda', () => {
  it('weist ohne Instanz-Admin mit 403 ab und schreibt nichts', async () => {
    requireInstanceAdmin.mockResolvedValue(false);
    const router = await loadRouter();
    const res = await router.setUserPanda({
      req,
      params: { userId: USER_ID },
      body: { enabled: true },
    } as never);

    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('schreibt die Entscheidung und meldet sie als wirksam zurück', async () => {
    query.mockResolvedValue([row(true)]);
    const router = await loadRouter();
    const res = await router.setUserPanda({
      req,
      params: { userId: USER_ID },
      body: { enabled: true },
    } as never);

    expect(query).toHaveBeenCalledWith(expect.stringContaining('SET panda_enabled = $1'), [
      true,
      USER_ID,
    ]);
    expect(res).toMatchObject({
      status: 200,
      body: { data: { id: USER_ID, pandaEnabled: true, pandaEffective: true } },
    });
  });

  it('meldet 404 für eine unbekannte Person', async () => {
    query.mockResolvedValue([]);
    const router = await loadRouter();
    const res = await router.setUserPanda({
      req,
      params: { userId: USER_ID },
      body: { enabled: false },
    } as never);

    expect(res.status).toBe(404);
  });
});

describe('instanceAdminOverviewContract.listUsers', () => {
  it('zeigt ohne Entscheidung den Instanz-Standard (hier: production, aus)', async () => {
    query.mockResolvedValue([row(null)]);
    const router = await loadRouter();
    const res = await router.listUsers({ req } as never);

    expect(res).toMatchObject({
      status: 200,
      body: { data: [{ pandaEnabled: null, pandaEffective: false }] },
    });
  });
});
