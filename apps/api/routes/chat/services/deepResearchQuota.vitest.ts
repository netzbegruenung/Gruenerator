import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * One booking, two engines.
 *
 * `@deepresearch` is answered by the research agent, or — when that one cannot
 * run — by Linkup's one-shot dossier. A run costs the same either way, so the
 * caller books one Baum before either starts. What is asserted here is that
 * this module adds nothing of its own on top: it books and releases exactly
 * `TREE_COST_DEEP_RESEARCH` against the shared budget, and the refusal it
 * composes names the one number the budget reports.
 */

import { treeBudgetSpentMessage, type TreeBalance } from '../../../services/trees/treeBudget.js';
import { TREE_COST_DEEP_RESEARCH } from '../../../services/trees/treeCosts.js';

const USER = 'user-1';

const { budget } = vi.hoisted(() => ({
  budget: {
    reserve: vi.fn(),
    release: vi.fn(),
  },
}));
vi.mock('../../../services/trees/index.js', () => ({ getTreeBudget: () => budget }));

const { deepResearchQuotaSpentMessage, releaseDeepResearch, reserveDeepResearch } =
  await import('./deepResearchQuota.js');

const balance = (over: Partial<TreeBalance> = {}): TreeBalance => ({
  usedUnits: 950,
  limitUnits: 1000,
  remainingUnits: 50,
  resetsAt: new Date(Date.now() + 5 * 60 * 60 * 1000),
  newsletterBonus: false,
  ...over,
});

beforeEach(() => {
  budget.reserve.mockReset().mockResolvedValue({ ok: true, status: balance() });
  budget.release.mockReset().mockResolvedValue(balance());
});

describe('reserveDeepResearch', () => {
  it('books one Baum against the shared budget and hands the verdict back untouched', async () => {
    const refusal = { ok: false, reason: 'exceeded', status: balance() };
    budget.reserve.mockResolvedValue(refusal);

    await expect(reserveDeepResearch(USER)).resolves.toBe(refusal);
    expect(budget.reserve).toHaveBeenCalledWith(USER, TREE_COST_DEEP_RESEARCH);
    expect(TREE_COST_DEEP_RESEARCH).toBe(100);
  });
});

describe('releaseDeepResearch', () => {
  it('gives the same amount back', async () => {
    await releaseDeepResearch(USER, '2026-09-18');
    // The day comes from the reservation, so a turn that outlived UTC midnight
    // settles against its own key instead of opening tomorrow's below zero.
    expect(budget.release).toHaveBeenCalledWith(USER, TREE_COST_DEEP_RESEARCH, '2026-09-18');
  });

  it('swallows a Redis failure rather than losing an answer already produced', async () => {
    budget.release.mockRejectedValue(new Error('redis down'));
    await expect(releaseDeepResearch(USER, '2026-09-18')).resolves.toBeUndefined();
  });
});

describe('deepResearchQuotaSpentMessage', () => {
  it('names the budget number and the fallback that happened instead', () => {
    const status = balance();
    const message = deepResearchQuotaSpentMessage({ ok: false, reason: 'exceeded', status });

    expect(message).toBe(
      `${treeBudgetSpentMessage(status, TREE_COST_DEEP_RESEARCH)} Ich habe stattdessen normal recherchiert.`
    );
    expect(message).toMatch(/Ich habe stattdessen normal recherchiert\.$/);
  });

  it('says the budget could not be read when Redis was the problem', () => {
    const message = deepResearchQuotaSpentMessage({ ok: false, reason: 'unavailable' });

    expect(message).toMatch(/lässt sich gerade nicht prüfen/);
    expect(message).toMatch(/Ich habe stattdessen normal recherchiert\.$/);
  });
});
