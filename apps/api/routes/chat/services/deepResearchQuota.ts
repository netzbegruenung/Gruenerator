/**
 * What `@deepresearch` costs, in one place: one Baum out of the shared daily
 * budget per run.
 *
 * Two engines answer that mention — the research agent first, Linkup's one-shot
 * dossier behind it — and a run costs the same whichever one delivers. So the
 * caller books ONCE before either starts and gives the booking back when
 * neither delivered. Each engine used to charge for itself against a shared
 * key with its own limit (agent 3, dossier 1), which made the verdict depend on
 * which engine happened to run: one successful agent run locked the dossier out
 * for the rest of the day, so the fallback that exists precisely for a failing
 * agent could not fire.
 */

import { getTreeBudget } from '../../../services/trees/index.js';
import {
  treeBudgetSpentMessage,
  TreeBudgetUnavailableError,
  type TreeReservation,
} from '../../../services/trees/treeBudget.js';
import { TREE_COST_DEEP_RESEARCH } from '../../../services/trees/treeCosts.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('DeepResearchQuota');

export async function reserveDeepResearch(userId: string): Promise<TreeReservation> {
  return getTreeBudget().reserve(userId, TREE_COST_DEEP_RESEARCH);
}

/**
 * swallow-ok — the release happens after the turn has answered by other means,
 * and losing it to a Redis hiccup is the better trade of the two.
 */
export async function releaseDeepResearch(userId: string, day: string): Promise<void> {
  try {
    await getTreeBudget().release(userId, TREE_COST_DEEP_RESEARCH, day);
  } catch (error) {
    log.error(`[DeepResearchQuota] Rückbuchung fehlgeschlagen: ${String(error)}`);
  }
}

/** The one refusal message, so neither engine can name a different number. */
export function deepResearchQuotaSpentMessage(
  reservation: Exclude<TreeReservation, { ok: true }>
): string {
  const fallback = 'Ich habe stattdessen normal recherchiert.';
  if (reservation.reason === 'exceeded') {
    return `${treeBudgetSpentMessage(reservation.status, TREE_COST_DEEP_RESEARCH)} ${fallback}`;
  }
  return `${new TreeBudgetUnavailableError().message} ${fallback}`;
}
