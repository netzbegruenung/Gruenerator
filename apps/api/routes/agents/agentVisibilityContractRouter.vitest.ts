/**
 * Der Agenten-Katalog des Admins und sein Schalter.
 *
 * Zwei Dinge, die leise falsch werden könnten: der Katalog zählt etwas auf, das
 * die Instanz gar nicht führt (dann tut der Schalter nichts Sichtbares), und
 * der Prozess-Puffer im heißen Pfad überlebt einen Schaltvorgang (dann preist
 * der Systemprompt eine Minute lang einen Agenten an, den es nicht mehr gibt).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getHiddenAgentIdentifiers = vi.fn();
const hideAgent = vi.fn();
const unhideAgent = vi.fn();
const clearHiddenAgentsCache = vi.fn();
const requireInstanceAdmin = vi.fn();

vi.mock('../../services/agents/AdminHiddenAgentsService.js', () => ({
  getHiddenAgentIdentifiers,
  hideAgent,
  unhideAgent,
  clearHiddenAgentsCache,
}));

vi.mock('../../utils/adminAuthz.js', () => ({ requireInstanceAdmin }));

const req = { user: { id: 'admin-1', email: 'admin@example.org' } } as never;

async function loadRouterOn(instanceId: string) {
  vi.resetModules();
  vi.doMock('../../config/instance.js', () => ({ CURRENT_INSTANCE: instanceId }));
  const { agentVisibilityContractRouter } = await import('./agentVisibilityContractRouter.js');
  return agentVisibilityContractRouter;
}

beforeEach(() => {
  for (const fn of [getHiddenAgentIdentifiers, hideAgent, unhideAgent, clearHiddenAgentsCache]) {
    fn.mockReset();
  }
  getHiddenAgentIdentifiers.mockResolvedValue([]);
  requireInstanceAdmin.mockResolvedValue(true);
  hideAgent.mockResolvedValue(undefined);
  unhideAgent.mockResolvedValue(undefined);
});

describe('agentVisibilityContract.list', () => {
  it('zählt die Agenten der Instanz auf', async () => {
    const router = await loadRouterOn('bgst');
    const res = await router.list({ req } as never);

    expect(res.status).toBe(200);
    const body = res.body as { data: { identifier: string; hidden: boolean }[] };
    expect(body.data.map((a) => a.identifier)).toContain('gruenerator-antrag');
    expect(body.data.every((a) => a.hidden === false)).toBe(true);
  });

  // Die Spezialisten fallen mit ihrem Landesverband; einzeln geschaltet stünden
  // sie quer zu der Kaskade, die Notebook, Agent und Rezepte gemeinsam führt.
  it('lässt die Landesverbands-Spezialisten weg', async () => {
    const router = await loadRouterOn('production');
    const res = await router.list({ req } as never);

    const body = res.body as { data: { identifier: string }[] };
    expect(body.data.filter((a) => a.identifier.includes('-berlin'))).toEqual([]);
    expect(body.data.filter((a) => a.identifier.includes('buergeranfragen-'))).toEqual([]);
  });

  it('trägt den Schaltzustand aus der Tabelle', async () => {
    getHiddenAgentIdentifiers.mockResolvedValue(['gruenerator-antrag']);

    const router = await loadRouterOn('bgst');
    const res = await router.list({ req } as never);

    const body = res.body as { data: { identifier: string; hidden: boolean }[] };
    expect(body.data.find((a) => a.identifier === 'gruenerator-antrag')?.hidden).toBe(true);
    expect(body.data.find((a) => a.identifier === 'gruenerator-suche')?.hidden).toBe(false);
  });

  it('antwortet 403 ohne Admin-Berechtigung', async () => {
    requireInstanceAdmin.mockResolvedValue(false);

    const router = await loadRouterOn('bgst');
    expect((await router.list({ req } as never)).status).toBe(403);
  });
});

describe('agentVisibilityContract.setHidden', () => {
  it('schreibt und leert dabei den Prozess-Puffer', async () => {
    const router = await loadRouterOn('bgst');
    const res = await router.setHidden({
      req,
      params: { identifier: 'gruenerator-antrag' },
      body: { hidden: true },
    } as never);

    expect(res.status).toBe(200);
    expect(hideAgent).toHaveBeenCalledWith('gruenerator-antrag', 'admin-1');
    // Ohne das preist der Systemprompt den Agenten bis zu einer Minute weiter an.
    expect(clearHiddenAgentsCache).toHaveBeenCalledTimes(1);
  });

  it('nimmt die Ausblendung zurück und leert den Puffer ebenso', async () => {
    const router = await loadRouterOn('bgst');
    await router.setHidden({
      req,
      params: { identifier: 'gruenerator-antrag' },
      body: { hidden: false },
    } as never);

    expect(unhideAgent).toHaveBeenCalledWith('gruenerator-antrag');
    expect(clearHiddenAgentsCache).toHaveBeenCalledTimes(1);
  });

  it('antwortet 403 ohne Admin-Berechtigung und schreibt nicht', async () => {
    requireInstanceAdmin.mockResolvedValue(false);

    const router = await loadRouterOn('bgst');
    const res = await router.setHidden({
      req,
      params: { identifier: 'gruenerator-antrag' },
      body: { hidden: true },
    } as never);

    expect(res.status).toBe(403);
    expect(hideAgent).not.toHaveBeenCalled();
  });
});

describe('agentVisibilityContract.getVisibility', () => {
  it('gibt die ausgeblendeten Kennungen ohne Admin-Prüfung heraus', async () => {
    getHiddenAgentIdentifiers.mockResolvedValue(['gruenerator-antrag']);
    requireInstanceAdmin.mockResolvedValue(false);

    const router = await loadRouterOn('bgst');
    const res = await router.getVisibility({ req } as never);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hiddenIdentifiers: ['gruenerator-antrag'] });
  });
});
