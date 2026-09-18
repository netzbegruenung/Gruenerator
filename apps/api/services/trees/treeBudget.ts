/**
 * The daily "Bäume" budget: one counter behind every metered feature.
 *
 * Reserve-then-reconcile, as the per-feature counters did before it: a request
 * books its estimate atomically with INCRBY before the provider is called, so
 * parallel requests from one account cannot all pass a read-then-act check;
 * afterwards `adjust` corrects the difference to what was really spent.
 *
 * One Redis key per user and UTC day. Key name and TTL are read from the SAME
 * clock — `ImageGenerationCounter` mixes a UTC key with a local-midnight TTL
 * and therefore resets twice a day on a non-UTC host.
 *
 * Fail closed: a dead or erroring Redis refuses the booking instead of letting
 * it through. The allowance is worth money at the provider, and an outage must
 * not turn into an unmetered day.
 */

import { createLogger } from '../../utils/logger.js';

import { formatTrees, unitsToTrees } from './treeCosts.js';

import type { TreeAllowance } from './treeAllowance.js';
import type { RedisIncrByClient } from '../counters/types.js';
import type { TreeBudgetStatus } from '@gruenerator/contracts';

const log = createLogger('TreeBudget');

export interface TreeBalance {
  usedUnits: number;
  /** null = unlimited instance. */
  limitUnits: number | null;
  remainingUnits: number | null;
  resetsAt: Date;
  newsletterBonus: boolean;
}

export type TreeReservation =
  | { ok: true; status: TreeBalance }
  /** `exceeded`: nothing was booked, `status` is the untouched balance. */
  | { ok: false; reason: 'exceeded'; status: TreeBalance }
  /** `unavailable`: Redis is down or there is no user — fail closed. */
  | { ok: false; reason: 'unavailable' };

export interface TreeBudgetDeps {
  allowanceFor: (userId: string) => Promise<TreeAllowance>;
  now?: () => Date;
}

export class TreeBudget {
  private redis: RedisIncrByClient;
  private allowanceFor: (userId: string) => Promise<TreeAllowance>;
  private now: () => Date;

  constructor(redisClient: RedisIncrByClient, deps: TreeBudgetDeps) {
    this.redis = redisClient;
    this.allowanceFor = deps.allowanceFor;
    this.now = deps.now ?? ((): Date => new Date());
  }

  private key(userId: string, now: Date): string {
    return `trees:${userId}:${now.toISOString().slice(0, 10)}`;
  }

  private resetsAt(now: Date): Date {
    const next = new Date(now.getTime());
    next.setUTCHours(24, 0, 0, 0);
    return next;
  }

  private ttlSeconds(now: Date): number {
    return Math.max(60, Math.floor((this.resetsAt(now).getTime() - now.getTime()) / 1000));
  }

  /**
   * An unmetered instance keeps working through a Redis outage: nothing is
   * read or written here. Who used how much stays visible for everyone in
   * `user_usage_daily`, which is fed independently of this counter.
   */
  private unlimitedBalance(now: Date): TreeBalance {
    return {
      usedUnits: 0,
      limitUnits: null,
      remainingUnits: null,
      resetsAt: this.resetsAt(now),
      newsletterBonus: false,
    };
  }

  private balance(usedUnits: number, dailyUnits: number, bonus: boolean, now: Date): TreeBalance {
    const used = Math.max(0, usedUnits);
    return {
      usedUnits: used,
      limitUnits: dailyUnits,
      remainingUnits: Math.max(0, dailyUnits - used),
      resetsAt: this.resetsAt(now),
      newsletterBonus: bonus,
    };
  }

  private failClosed(dailyUnits: number, bonus: boolean, now: Date): TreeBalance {
    return this.balance(dailyUnits, dailyUnits, bonus, now);
  }

  async status(userId: string): Promise<TreeBalance> {
    const allowance = await this.allowanceFor(userId);
    const now = this.now();
    if (allowance.unlimited) return this.unlimitedBalance(now);

    if (!userId || this.redis.isReady === false) {
      return this.failClosed(allowance.dailyUnits, allowance.newsletterBonus, now);
    }
    try {
      const raw = await this.redis.get(this.key(userId, now));
      const used = parseInt(raw ?? '0', 10) || 0;
      return this.balance(used, allowance.dailyUnits, allowance.newsletterBonus, now);
    } catch (error) {
      log.error(`[TreeBudget] Kontingent nicht lesbar: ${String(error)}`);
      return this.failClosed(allowance.dailyUnits, allowance.newsletterBonus, now);
    }
  }

  /** Books `units` up front; rolled back and refused when that crosses the allowance. */
  async reserve(userId: string, units: number): Promise<TreeReservation> {
    const allowance = await this.allowanceFor(userId);
    const now = this.now();
    if (allowance.unlimited) return { ok: true, status: this.unlimitedBalance(now) };

    if (!userId || this.redis.isReady === false) return { ok: false, reason: 'unavailable' };
    const amount = Math.max(0, Math.round(units));
    try {
      const key = this.key(userId, now);
      const used = await this.redis.incrBy(key, amount);
      await this.redis.expire(key, this.ttlSeconds(now));
      if (used > allowance.dailyUnits) {
        await this.redis.incrBy(key, -amount);
        return {
          ok: false,
          reason: 'exceeded',
          status: this.balance(used - amount, allowance.dailyUnits, allowance.newsletterBonus, now),
        };
      }
      return {
        ok: true,
        status: this.balance(used, allowance.dailyUnits, allowance.newsletterBonus, now),
      };
    } catch (error) {
      log.error(`[TreeBudget] Buchung fehlgeschlagen: ${String(error)}`);
      return { ok: false, reason: 'unavailable' };
    }
  }

  /** Corrects a reservation by the real outcome; a negative delta gives units back. */
  async adjust(userId: string, deltaUnits: number): Promise<TreeBalance> {
    const allowance = await this.allowanceFor(userId);
    const now = this.now();
    if (allowance.unlimited) return this.unlimitedBalance(now);

    if (!userId || this.redis.isReady === false) {
      return this.failClosed(allowance.dailyUnits, allowance.newsletterBonus, now);
    }
    try {
      const key = this.key(userId, now);
      const used = await this.redis.incrBy(key, Math.round(deltaUnits));
      await this.redis.expire(key, this.ttlSeconds(now));
      return this.balance(used, allowance.dailyUnits, allowance.newsletterBonus, now);
    } catch (error) {
      log.error(`[TreeBudget] Korrektur fehlgeschlagen: ${String(error)}`);
      return this.failClosed(allowance.dailyUnits, allowance.newsletterBonus, now);
    }
  }

  async release(userId: string, units: number): Promise<TreeBalance> {
    return this.adjust(userId, -units);
  }

  /** For call sites that answer with an HTTP status or a tool error rather than a branch. */
  async reserveOrThrow(userId: string, units: number): Promise<TreeBalance> {
    const reservation = await this.reserve(userId, units);
    if (reservation.ok) return reservation.status;
    if (reservation.reason === 'unavailable') throw new TreeBudgetUnavailableError();
    throw new TreeBudgetExceededError(reservation.status, Math.max(0, Math.round(units)));
  }
}

export class TreeBudgetExceededError extends Error {
  constructor(
    readonly status: TreeBalance,
    readonly neededUnits: number
  ) {
    super(treeBudgetSpentMessage(status, neededUnits));
    this.name = 'TreeBudgetExceededError';
  }
}

export class TreeBudgetUnavailableError extends Error {
  constructor() {
    super('Das Kontingent lässt sich gerade nicht prüfen. Bitte versuch es gleich noch einmal.');
    this.name = 'TreeBudgetUnavailableError';
  }
}

function treeNoun(units: number): string {
  return unitsToTrees(units) === 1 ? 'Baum' : 'Bäume';
}

/** "von 15 Bäumen", but "von 1 Baum" — the dative plural differs. */
function treeNounDative(units: number): string {
  return unitsToTrees(units) === 1 ? 'Baum' : 'Bäumen';
}

function resetIn(resetsAt: Date): string {
  const minutes = Math.max(1, Math.ceil((resetsAt.getTime() - Date.now()) / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

/**
 * The one refusal sentence — HTTP 429, chat tool errors and the SSE warning all
 * come through here, so no door can name a different number.
 */
export function treeBudgetSpentMessage(status: TreeBalance, neededUnits?: number): string {
  // An unlimited status never refuses; if one arrives anyway, the empty
  // sentence is the harmless fallback.
  const limitUnits = status.limitUnits ?? 0;
  const limit = formatTrees(limitUnits);
  const reset = resetIn(status.resetsAt);
  const remaining = Math.max(0, status.remainingUnits ?? 0);

  if (!neededUnits || remaining <= 0) {
    return `Dein Tagesbudget von ${limit} ${treeNounDative(limitUnits)} ist aufgebraucht – in ${reset} gibt es wieder ${limit}.`;
  }
  return `Dafür brauchst du ${formatTrees(neededUnits)} ${treeNoun(neededUnits)}, heute sind nur noch ${formatTrees(remaining)} von ${limit} übrig – in ${reset} gibt es wieder ${limit}.`;
}

export function toTreeBudgetStatusDto(status: TreeBalance): TreeBudgetStatus {
  return {
    used: unitsToTrees(status.usedUnits),
    limit: status.limitUnits === null ? null : unitsToTrees(status.limitUnits),
    remaining: status.remainingUnits === null ? null : unitsToTrees(status.remainingUnits),
    resetsAt: status.resetsAt.toISOString(),
    newsletterBonus: status.newsletterBonus,
  };
}
