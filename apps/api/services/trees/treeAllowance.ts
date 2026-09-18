/**
 * How many Bäume a user gets per day — the allowance, separate from the
 * counting mechanism in `treeBudget.ts`.
 *
 * Split for the same reason as `deepResearchQuota.ts`: the number must live in
 * exactly one place, or two callers end up enforcing two different ceilings
 * against the same Redis key.
 */

import { hasUnlimitedTrees } from '@gruenerator/shared/instances';

import { CURRENT_INSTANCE } from '../../config/instance.js';
import { isNewsletterSubscriber } from '../newsletter/brevoNewsletter.js';

import { UNITS_PER_TREE } from './treeCosts.js';

export const BASE_DAILY_TREES = 10;
export const NEWSLETTER_BONUS_TREES = 5;

export type TreeAllowance =
  { unlimited: true } | { unlimited: false; dailyUnits: number; newsletterBonus: boolean };

export interface AllowanceDeps {
  unlimited: () => boolean;
  isNewsletterSubscriber: (userId: string) => Promise<boolean>;
}

const defaultDeps: AllowanceDeps = {
  unlimited: () => hasUnlimitedTrees(CURRENT_INSTANCE),
  isNewsletterSubscriber,
};

/**
 * The instance check comes first and short-circuits: an unmetered instance must
 * not pay for a Brevo round trip on every metered action.
 *
 * A Brevo outage answers `false` and is not cached, so a subscriber can see 10
 * instead of 15 for that one call — accepted: the alternative is failing the
 * action outright over a newsletter lookup.
 */
export async function allowanceFor(
  userId: string,
  deps: AllowanceDeps = defaultDeps
): Promise<TreeAllowance> {
  if (deps.unlimited()) return { unlimited: true };

  const newsletterBonus = userId ? await deps.isNewsletterSubscriber(userId) : false;
  const trees = BASE_DAILY_TREES + (newsletterBonus ? NEWSLETTER_BONUS_TREES : 0);
  return { unlimited: false, dailyUnits: trees * UNITS_PER_TREE, newsletterBonus };
}
