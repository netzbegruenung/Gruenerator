/**
 * The daily allowance behind `@deepresearch`, in one place.
 *
 * Two engines answer that mention — the research agent first, Linkup's one-shot
 * dossier behind it — and they meter through ONE Redis key. Each used to carry
 * its own limit against that key (agent 3, dossier 1), which made the allowance
 * depend on which engine happened to run: at a count of 2 the agent went ahead
 * while the dossier refused, and one successful agent run locked the dossier out
 * for the rest of the day although none of ITS budget had been spent — so the
 * fallback that exists precisely for a failing agent could not fire.
 *
 * Hence: limit, counter and check all live here, the caller asks once before
 * either engine starts, and the engines only CHARGE — after they have actually
 * delivered something.
 */

import { DeepResearchCounter } from '../../../services/counters/index.js';
import { createLogger } from '../../../utils/logger.js';

import type { DeepResearchStatus } from '../../../services/counters/index.js';

const log = createLogger('DeepResearchQuota');

/**
 * Runs per user per day, across both engines.
 *
 * Three rather than one: neither engine touches Linkup's per-prompt research
 * endpoint. The agent buys ordinary searches plus at most two `deep` ones; the
 * dossier path is a single `depth: 'deep'` call to `/search`. A run costs cents,
 * so the cheaper engine is not worth a separate, lower ceiling — and a second
 * ceiling on a shared key is what caused the divergence above.
 */
export const DEEP_RESEARCH_DAILY_LIMIT = 3;

/** Lazy, so importing this module does not open a Redis connection. */
let counter: DeepResearchCounter | null = null;
async function getCounter(): Promise<DeepResearchCounter> {
  if (!counter) {
    const { redisClient } = await import('../../../utils/redis/index.js');
    counter = new DeepResearchCounter(redisClient, DEEP_RESEARCH_DAILY_LIMIT);
  }
  return counter;
}

/** Test seam: the module-level counter would otherwise survive between cases. */
export function _resetDeepResearchQuotaForTests(): void {
  counter = null;
}

/**
 * `resetIn` travels with the status because every refusal names it, and asking
 * for it separately would mean a second round trip through the lazy counter.
 */
export type DeepResearchQuota = DeepResearchStatus & { resetIn: string };

export async function checkDeepResearchQuota(userId: string): Promise<DeepResearchQuota> {
  const quotaCounter = await getCounter();
  const status = await quotaCounter.checkLimit(userId);
  return { ...status, resetIn: quotaCounter.getTimeUntilReset() };
}

/**
 * Books one run against the shared key.
 *
 * swallow-ok — both callers charge only once the user already has their answer,
 * and losing it to a Redis hiccup is the better trade of the two.
 */
export async function chargeDeepResearch(userId: string): Promise<void> {
  try {
    const quotaCounter = await getCounter();
    await quotaCounter.incrementCount(userId);
  } catch (error) {
    log.error(`[DeepResearchQuota] Kontingent konnte nicht verbucht werden: ${String(error)}`);
  }
}

/** The one refusal message, so neither engine can name a different number. */
export function deepResearchQuotaSpentMessage(quota: DeepResearchQuota): string {
  return `Die Tiefenrecherche ist für heute aufgebraucht (${quota.limit}× pro Tag, neu in ${quota.resetIn}). Ich habe stattdessen normal recherchiert.`;
}
