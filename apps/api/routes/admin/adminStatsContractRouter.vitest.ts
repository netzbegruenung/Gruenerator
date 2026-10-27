/**
 * Das Gatter dieses Routers: ohne Instanz-Admin keine Zahlen, und ein
 * Länderfilter nur im Monatsraster — feiner ließe sich eine verborgene Zelle aus
 * dem Monat zurückrechnen (services/usage/adminContentStats.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireInstanceAdmin = vi.fn();
const getAdminStats = vi.fn();

vi.mock('../../utils/adminAuthz.js', () => ({ requireInstanceAdmin }));
vi.mock('../../services/usage/adminContentStats.js', () => ({
  getAdminStats,
  firstDay: async () => '2025-01-01',
  todayInBerlin: () => '2026-10-26',
}));

const req = { user: { id: 'admin-1', email: 'admin@example.org' } } as never;

async function getStats(query: Record<string, string>) {
  const { adminStatsContractRouter } = await import('./adminStatsContractRouter.js');
  return adminStatsContractRouter.getStats({ req, query } as never);
}

beforeEach(() => {
  requireInstanceAdmin.mockReset().mockResolvedValue(true);
  getAdminStats.mockReset().mockResolvedValue({ success: true });
});

describe('adminStatsContract.getStats', () => {
  it('weist ohne Instanz-Admin mit 403 ab und zählt nichts', async () => {
    requireInstanceAdmin.mockResolvedValue(false);
    const res = await getStats({});
    expect(res.status).toBe(403);
    expect(getAdminStats).not.toHaveBeenCalled();
  });

  it('lehnt einen Länderfilter im Tagesraster ab', async () => {
    const res = await getStats({ locale: 'at', bucket: 'day' });
    expect(res.status).toBe(400);
    expect(getAdminStats).not.toHaveBeenCalled();
  });

  it('füllt fehlende Grenzen mit Beginn und heute, Raster Monat', async () => {
    const res = await getStats({ locale: 'de' });
    expect(res.status).toBe(200);
    expect(getAdminStats).toHaveBeenCalledWith({
      from: '2025-01-01',
      to: '2026-10-26',
      bucket: 'month',
      locale: 'de',
    });
  });

  it('lehnt ein zu langes Tagesraster ab', async () => {
    const res = await getStats({ from: '2024-01-01', to: '2026-10-26', bucket: 'day' });
    expect(res.status).toBe(400);
  });
});
