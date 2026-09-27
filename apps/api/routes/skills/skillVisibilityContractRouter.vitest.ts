/**
 * Was der Admin-Katalog überhaupt aufzählt.
 *
 * Der Schalter darauf schreibt in `admin_hidden_skills` — eine Ausnahmetabelle,
 * die jede Entdeckungsfläche zusätzlich zur Instanz-Politik liest. Zählte der
 * Katalog Rezepte auf, die die Instanz gar nicht führt, wäre der Schalter
 * daneben wirkungslos: `isSkillOfferedIn` hat sie längst fallen lassen.
 *
 * Genau das war der Zustand auf der bgst-Instanz — alle ~25
 * Landesverbands-Rezepte standen dort mit Schalter, obwohl Composer,
 * Rezept-Bibliothek und der Katalog des Modells sie korrekt weglassen.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getHiddenSkillMentions = vi.fn();
const getEffectiveHiddenSkillMentions = vi.fn();
const hideSkill = vi.fn();
const unhideSkill = vi.fn();
const requireInstanceAdmin = vi.fn();

vi.mock('../../services/skills/AdminHiddenSkillsService.js', () => ({
  getHiddenSkillMentions,
  getEffectiveHiddenSkillMentions,
  hideSkill,
  unhideSkill,
}));

vi.mock('../../services/landesverband/LandesverbandDerivationService.js', () => ({
  getUserLandesverbandId: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../utils/adminAuthz.js', () => ({ requireInstanceAdmin }));

const req = { user: { id: 'admin-1', email: 'admin@example.org' } } as never;

/**
 * `CURRENT_INSTANCE` ist eine Modul-Konstante, entsteht also beim Laden — der
 * Instanz-Wechsel braucht deshalb `resetModules` und einen frischen Import,
 * kein Umschalten zur Laufzeit.
 */
async function loadRouterOn(instanceId: string) {
  vi.resetModules();
  vi.doMock('../../config/instance.js', () => ({ CURRENT_INSTANCE: instanceId }));
  const { skillVisibilityContractRouter } = await import('./skillVisibilityContractRouter.js');
  return skillVisibilityContractRouter;
}

async function listSkillsOn(instanceId: string): Promise<string[]> {
  const router = await loadRouterOn(instanceId);
  const res = await router.list({ req } as never);

  expect(res.status).toBe(200);
  const body = res.body as { data: { mention: string }[] };
  return body.data.map((s) => s.mention);
}

beforeEach(() => {
  getHiddenSkillMentions.mockResolvedValue([]);
  requireInstanceAdmin.mockResolvedValue(true);
});

describe('skillVisibilityContract.list', () => {
  it('zählt die Landesverbands-Rezepte auf, wo die Instanz sie führt', async () => {
    const mentions = await listSkillsOn('production');

    expect(mentions).toContain('presse');
    expect(mentions).toContain('presse-berlin-fraktion');
    expect(mentions).toContain('insta-at');
  });

  // Der eigentliche Befund: bgst blendet `notebookCategories: ['landesebene',
  // 'oesterreich']` aus, wodurch die LV-Agenten und mit ihnen ihre Rezepte
  // fallen — der Admin-Katalog las daran vorbei.
  it('lässt sie weg, wo die Instanz die Landesverbände ausblendet', async () => {
    const mentions = await listSkillsOn('bgst');

    expect(mentions).toContain('presse');
    expect(mentions).toContain('wahlpruefstein');
    expect(mentions.filter((m) => m.includes('berlin'))).toEqual([]);
    expect(mentions).not.toContain('insta-at');
    expect(mentions).not.toContain('presse-at');
  });

  // `hide.skillMentions: ['reel']` ist der andere Zweig von `isSkillOfferedIn`:
  // nicht der Besitzer fällt, sondern das Rezept selbst.
  it('lässt auch ein einzeln ausgeblendetes Rezept weg', async () => {
    expect(await listSkillsOn('production')).toContain('reel');
    expect(await listSkillsOn('bgst')).not.toContain('reel');
  });

  it('trägt den Admin-Schalter unabhängig von der Instanz-Politik', async () => {
    getHiddenSkillMentions.mockResolvedValue(['presse']);

    const router = await loadRouterOn('bgst');
    const res = await router.list({ req } as never);

    const body = res.body as { data: { mention: string; hidden: boolean }[] };
    expect(body.data.find((s) => s.mention === 'presse')?.hidden).toBe(true);
    expect(body.data.find((s) => s.mention === 'instagram')?.hidden).toBe(false);
  });

  it('antwortet 403 ohne Admin-Berechtigung', async () => {
    requireInstanceAdmin.mockResolvedValue(false);

    const router = await loadRouterOn('bgst');
    expect((await router.list({ req } as never)).status).toBe(403);
  });
});
