/**
 * Die Katalogliste zeigt das eigene Land; `land` wechselt es nur für
 * Instanz-Admins, für alle anderen bleibt die Antwort dieselbe.
 */
import { beforeEach, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  isInstanceAdmin: vi.fn(),
  listSharepicVorlagen: vi.fn((locale: string) => [{ id: `vorlage-${locale}` }]),
}));

vi.mock('../../utils/adminAuthz.js', () => ({ isInstanceAdmin: m.isInstanceAdmin }));
vi.mock('../../services/sharepicVorlagen/catalog.js', () => ({
  listSharepicVorlagen: m.listSharepicVorlagen,
  getSharepicVorlage: vi.fn(),
  sharepicVorlageThumbFile: vi.fn(),
}));

const { sharepicVorlagenContractRouter } = await import('./sharepicVorlagenRouter.js');

type Result = { status: number; body: { vorlagen: Array<{ id: string }> } };
const list = (land?: 'de-DE' | 'de-AT') =>
  (sharepicVorlagenContractRouter.list as unknown as (args: unknown) => Promise<Result>)({
    req: { user: { id: 'viewer', locale: 'de-DE' }, headers: {} },
    query: land ? { land } : {},
  });

beforeEach(() => m.isInstanceAdmin.mockReset());

it('lists the viewer country by default', async () => {
  const res = await list();
  expect(res.body.vorlagen).toEqual([{ id: 'vorlage-de-DE' }]);
});

it('lists the other country for an instance admin', async () => {
  m.isInstanceAdmin.mockResolvedValue(true);
  const res = await list('de-AT');
  expect(res.body.vorlagen).toEqual([{ id: 'vorlage-de-AT' }]);
});

it('ignores `land` for a non-admin', async () => {
  m.isInstanceAdmin.mockResolvedValue(false);
  const res = await list('de-AT');
  expect(res.status).toBe(200);
  expect(res.body.vorlagen).toEqual([{ id: 'vorlage-de-DE' }]);
});
