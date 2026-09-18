import { describe, expect, it, vi } from 'vitest';

import { allowanceFor } from './treeAllowance.js';
import { BASE_DAILY_TREES, NEWSLETTER_BONUS_TREES, UNITS_PER_TREE } from './treeCosts.js';

// The defaults reach for the instance registry and Brevo; every case injects
// its own deps, so the real modules must never be pulled in.
vi.mock('@gruenerator/shared/instances', () => ({ hasUnlimitedTrees: () => false }));
vi.mock('../../config/instance.js', () => ({ CURRENT_INSTANCE: 'production' }));
vi.mock('../newsletter/brevoNewsletter.js', () => ({ isNewsletterSubscriber: async () => false }));

describe('allowanceFor', () => {
  it('gives the base allowance to an ordinary user', async () => {
    const isNewsletterSubscriber = vi.fn().mockResolvedValue(false);
    expect(await allowanceFor('u1', { unlimited: () => false, isNewsletterSubscriber })).toEqual({
      unlimited: false,
      dailyUnits: BASE_DAILY_TREES * UNITS_PER_TREE,
      newsletterBonus: false,
    });
    expect(isNewsletterSubscriber).toHaveBeenCalledWith('u1');
  });

  it('adds the newsletter bonus for a subscriber', async () => {
    const allowance = await allowanceFor('u1', {
      unlimited: () => false,
      isNewsletterSubscriber: async () => true,
    });
    expect(allowance).toEqual({
      unlimited: false,
      dailyUnits: (BASE_DAILY_TREES + NEWSLETTER_BONUS_TREES) * UNITS_PER_TREE,
      newsletterBonus: true,
    });
  });

  it('short-circuits on an unlimited instance without asking Brevo', async () => {
    const isNewsletterSubscriber = vi.fn().mockResolvedValue(true);
    expect(await allowanceFor('u1', { unlimited: () => true, isNewsletterSubscriber })).toEqual({
      unlimited: true,
    });
    expect(isNewsletterSubscriber).not.toHaveBeenCalled();
  });

  it('asks nobody about a missing user', async () => {
    const isNewsletterSubscriber = vi.fn().mockResolvedValue(true);
    expect(await allowanceFor('', { unlimited: () => false, isNewsletterSubscriber })).toEqual({
      unlimited: false,
      dailyUnits: BASE_DAILY_TREES * UNITS_PER_TREE,
      newsletterBonus: false,
    });
    expect(isNewsletterSubscriber).not.toHaveBeenCalled();
  });
});
