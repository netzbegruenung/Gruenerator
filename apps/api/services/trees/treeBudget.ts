/**
 * The daily "Bäume" budget: one counter behind every metered feature.
 *
 * Reserve-then-reconcile, as the per-feature counters did before it: a request
 * books its estimate atomically with INCRBY before the provider is called, so
 * parallel requests from one account cannot all pass a read-then-act check;
 * afterwards `adjust` corrects the difference to what was really spent.
 *
 * One Redis key per user and UTC day. Key name and TTL are read from the SAME
 * clock — the old image counter mixed a UTC key with a local-midnight TTL
 * and therefore reset twice a day on a non-UTC host.
 *
 * Fail closed: a dead or erroring Redis refuses the booking instead of letting
 * it through. The allowance is worth money at the provider, and an outage must
 * not turn into an unmetered day.
 */

import { createLogger } from '../../utils/logger.js';

import { BASE_DAILY_TREES, formatTrees, UNITS_PER_TREE, unitsToTrees } from './treeCosts.js';

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
  /**
   * UTC date (`YYYY-MM-DD`) of the key this balance belongs to. A reservation
   * carries it so the correction settles against its OWN day: a document job
   * runs two hours and a synthesis tens of seconds, so both routinely reconcile
   * after midnight, when re-reading the clock would pick tomorrow's key. Not on
   * the wire — `toTreeBudgetStatusDto` leaves it out.
   */
  day: string;
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

  private dayOf(now: Date): string {
    return now.toISOString().slice(0, 10);
  }

  private key(userId: string, day: string): string {
    return `trees:${userId}:${day}`;
  }

  private resetsAt(now: Date): Date {
    const next = new Date(now.getTime());
    next.setUTCHours(24, 0, 0, 0);
    return next;
  }

  private ttlSeconds(now: Date): number {
    return Math.max(60, Math.floor((this.resetsAt(now).getTime() - now.getTime()) / 1000));
  }

  /** Seconds left on `day`'s key, or null once that day is over and the key is gone. */
  private ttlSecondsForDay(day: string, now: Date): number | null {
    const midnightAfter = Date.parse(`${day}T00:00:00.000Z`) + 24 * 60 * 60 * 1000;
    const remaining = Math.floor((midnightAfter - now.getTime()) / 1000);
    return remaining <= 0 ? null : Math.max(60, remaining);
  }

  /**
   * The allowance lookup asks Postgres (newsletter check) and rethrows its
   * errors. Outside a try that turns every door into a thrower: the
   * `finally`-adjust in speech synthesis would REPLACE the provider's error,
   * and the chat search branch would kill the whole turn.
   */
  private async allowanceOrNull(userId: string): Promise<TreeAllowance | null> {
    try {
      return await this.allowanceFor(userId);
    } catch (error) {
      log.error(`[TreeBudget] Kontingent nicht ermittelbar: ${String(error)}`);
      return null;
    }
  }

  /**
   * The TTL is armed after the units are booked, so a failing EXPIRE must not
   * undo the booking — the key then lives without one until the next write
   * re-arms it.
   */
  private async armTtl(key: string, seconds: number): Promise<void> {
    try {
      await this.redis.expire(key, seconds);
    } catch (error) {
      log.error(`[TreeBudget] TTL nicht gesetzt (${key}): ${String(error)}`);
    }
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
      day: this.dayOf(now),
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
      day: this.dayOf(now),
    };
  }

  private failClosed(dailyUnits: number, bonus: boolean, now: Date): TreeBalance {
    return this.balance(dailyUnits, dailyUnits, bonus, now);
  }

  /**
   * Allowance unknown means nothing is known to be left — shown against the
   * base allowance so the tab reads "0 von 10", not "0 von 0".
   */
  private unknownAllowance(now: Date): TreeBalance {
    return this.failClosed(BASE_DAILY_TREES * UNITS_PER_TREE, false, now);
  }

  async status(userId: string): Promise<TreeBalance> {
    const allowance = await this.allowanceOrNull(userId);
    const now = this.now();
    if (!allowance) return this.unknownAllowance(now);
    if (allowance.unlimited) return this.unlimitedBalance(now);

    if (!userId || this.redis.isReady === false) {
      return this.failClosed(allowance.dailyUnits, allowance.newsletterBonus, now);
    }
    try {
      const raw = await this.redis.get(this.key(userId, this.dayOf(now)));
      const used = parseInt(raw ?? '0', 10) || 0;
      return this.balance(used, allowance.dailyUnits, allowance.newsletterBonus, now);
    } catch (error) {
      log.error(`[TreeBudget] Kontingent nicht lesbar: ${String(error)}`);
      return this.failClosed(allowance.dailyUnits, allowance.newsletterBonus, now);
    }
  }

  /** Books `units` up front; rolled back and refused when that crosses the allowance. */
  async reserve(userId: string, units: number): Promise<TreeReservation> {
    const allowance = await this.allowanceOrNull(userId);
    const now = this.now();
    if (!allowance) return { ok: false, reason: 'unavailable' };
    if (allowance.unlimited) return { ok: true, status: this.unlimitedBalance(now) };

    if (!userId || this.redis.isReady === false) return { ok: false, reason: 'unavailable' };
    const amount = Math.max(0, Math.round(units));
    try {
      const key = this.key(userId, this.dayOf(now));
      const used = await this.redis.incrBy(key, amount);
      await this.armTtl(key, this.ttlSeconds(now));
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

  /**
   * Corrects a reservation by the real outcome; a negative delta gives units
   * back. `day` is the reservation's own day (`TreeBalance.day`), never the
   * clock at correction time.
   */
  async adjust(userId: string, deltaUnits: number, day: string): Promise<TreeBalance> {
    const allowance = await this.allowanceOrNull(userId);
    const now = this.now();
    if (!allowance) return this.unknownAllowance(now);
    if (allowance.unlimited) return this.unlimitedBalance(now);

    if (!userId || this.redis.isReady === false) {
      return this.failClosed(allowance.dailyUnits, allowance.newsletterBonus, now);
    }
    // The day is over, so its key expired with it: INCRBY would RE-CREATE it,
    // and a give-back would sit there as a negative base. Nothing to correct.
    const ttl = this.ttlSecondsForDay(day, now);
    if (ttl === null) return this.status(userId);
    try {
      const key = this.key(userId, day);
      let used = await this.redis.incrBy(key, Math.round(deltaUnits));
      if (used < 0) {
        // `reserve` compares the RAW counter against the allowance, so a
        // negative base would hand out free units for the rest of the day.
        used = await this.redis.incrBy(key, -used);
      }
      await this.armTtl(key, ttl);
      return this.balance(used, allowance.dailyUnits, allowance.newsletterBonus, now);
    } catch (error) {
      log.error(`[TreeBudget] Korrektur fehlgeschlagen: ${String(error)}`);
      return this.failClosed(allowance.dailyUnits, allowance.newsletterBonus, now);
    }
  }

  async release(userId: string, units: number, day: string): Promise<TreeBalance> {
    return this.adjust(userId, -units, day);
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
