/**
 * Per-user consumption tracking (tokens, requests, non-LLM operations).
 *
 * The request path must not pay for this: `recordTokenUsage` / `recordOperation`
 * only mutate an in-memory Map — no await, no database roundtrip. A timer
 * flushes accumulated deltas as one batched upsert every FLUSH_INTERVAL_MS (or
 * earlier once the buffer grows past FLUSH_THRESHOLD). Increments are additive
 * (`requests = requests + EXCLUDED.requests`), so every cluster worker can flush
 * its own buffer and Postgres sums them.
 *
 * Worst case a hard crash drops up to one flush interval of counters. That is
 * an acceptable trade for a consumption display.
 */

import { sql } from 'drizzle-orm';

import type { UsageUnit as ContractUsageUnit } from '@gruenerator/contracts';

import { userUsageDaily } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { createLogger } from '../../utils/logger.js';
import { getUsageFeature, getUsageUserId } from '../../utils/usageContext.js';

const log = createLogger('usageTracking');

const FLUSH_INTERVAL_MS = 15_000;
const FLUSH_THRESHOLD = 200;

/**
 * What is being counted — decides how the usage tab renders a row.
 *
 * Derived from the contract rather than restated, so the wire enum and the
 * server cannot drift apart. Note that for `speech_seconds` alone, `ops` carries
 * a DURATION in whole seconds rather than a count of operations.
 */
export type UsageUnit = ContractUsageUnit;

interface UsageDelta {
  userId: string;
  day: string;
  feature: string;
  provider: string;
  model: string;
  unit: UsageUnit;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  ops: number;
  /** Measured footprint. GreenPT is the only provider that reports it. */
  energyWms: number;
  emissionsUg: number;
}

const buffer = new Map<string, UsageDelta>();
let flushTimer: NodeJS.Timeout | null = null;
let flushing: Promise<void> | null = null;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function add(entry: Omit<UsageDelta, 'day'>): void {
  const day = today();
  const key = `${entry.userId}|${day}|${entry.feature}|${entry.provider}|${entry.model}|${entry.unit}`;
  const existing = buffer.get(key);
  if (existing) {
    existing.requests += entry.requests;
    existing.inputTokens += entry.inputTokens;
    existing.outputTokens += entry.outputTokens;
    existing.ops += entry.ops;
    existing.energyWms += entry.energyWms;
    existing.emissionsUg += entry.emissionsUg;
  } else {
    buffer.set(key, { ...entry, day });
  }

  ensureTimer();
  if (buffer.size >= FLUSH_THRESHOLD) void flushUsageBuffer();
}

function ensureTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushUsageBuffer();
  }, FLUSH_INTERVAL_MS);
  // Never keep the process alive just to flush counters.
  flushTimer.unref?.();
}

/**
 * Record one completed LLM call. Silently ignored outside an authenticated
 * request context — background jobs (cron, scrapers) belong to no user.
 */
export function recordTokenUsage(params: {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  userId?: string | null;
  feature?: string | null;
}): void {
  const userId = params.userId ?? getUsageUserId();
  if (!userId) return;

  add({
    userId,
    feature: params.feature ?? getUsageFeature() ?? 'other',
    provider: params.provider || 'unknown',
    model: params.model || 'unknown',
    unit: 'tokens',
    requests: 1,
    inputTokens: Math.max(0, Math.round(params.inputTokens || 0)),
    outputTokens: Math.max(0, Math.round(params.outputTokens || 0)),
    ops: 0,
    energyWms: 0,
    emissionsUg: 0,
  });
}

/**
 * Record the MEASURED footprint of one call, for the providers that report it.
 *
 * Deliberately a second write rather than a field on `recordTokenUsage`: the
 * figures arrive from the HTTP layer (see services/ai/greenptImpact.ts), and on
 * a streamed response they arrive after the token counts have already been
 * booked. Both writes land on the same primary key, so Postgres sums them into
 * one row — `requests: 0` here keeps the request count from being doubled.
 */
export function recordImpact(params: {
  provider: string;
  model: string;
  energyWms: number;
  emissionsUg: number;
  userId?: string | null;
  feature?: string | null;
}): void {
  const userId = params.userId ?? getUsageUserId();
  if (!userId) return;

  add({
    userId,
    feature: params.feature ?? getUsageFeature() ?? 'other',
    provider: params.provider || 'unknown',
    model: params.model || 'unknown',
    unit: 'tokens',
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    ops: 0,
    energyWms: Math.max(0, Math.round(params.energyWms || 0)),
    emissionsUg: Math.max(0, Math.round(params.emissionsUg || 0)),
  });
}

/**
 * Record one non-LLM operation (generated image, transcription, web research).
 */
export function recordOperation(params: {
  unit: Exclude<UsageUnit, 'tokens'>;
  provider: string;
  model?: string | null;
  count?: number;
  userId?: string | null;
  feature?: string | null;
}): void {
  const userId = params.userId ?? getUsageUserId();
  if (!userId) return;

  add({
    userId,
    feature: params.feature ?? getUsageFeature() ?? 'other',
    provider: params.provider || 'unknown',
    model: params.model || params.provider || 'unknown',
    unit: params.unit,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    ops: params.count ?? 1,
    energyWms: 0,
    emissionsUg: 0,
  });
}

/** Write everything buffered so far. Never throws. */
export async function flushUsageBuffer(): Promise<void> {
  if (flushing) return flushing;
  if (buffer.size === 0) return;

  const batch = [...buffer.values()];
  buffer.clear();

  flushing = (async () => {
    try {
      const db = getDrizzleInstance();
      await db
        .insert(userUsageDaily)
        .values(batch)
        .onConflictDoUpdate({
          target: [
            userUsageDaily.userId,
            userUsageDaily.day,
            userUsageDaily.feature,
            userUsageDaily.provider,
            userUsageDaily.model,
            userUsageDaily.unit,
          ],
          set: {
            requests: sql`${userUsageDaily.requests} + excluded.requests`,
            inputTokens: sql`${userUsageDaily.inputTokens} + excluded.input_tokens`,
            outputTokens: sql`${userUsageDaily.outputTokens} + excluded.output_tokens`,
            ops: sql`${userUsageDaily.ops} + excluded.ops`,
            energyWms: sql`${userUsageDaily.energyWms} + excluded.energy_wms`,
            emissionsUg: sql`${userUsageDaily.emissionsUg} + excluded.emissions_ug`,
            updatedAt: new Date(),
          },
        });
    } catch (error) {
      log.warn(`[UsageTracking] Flush of ${batch.length} entries failed:`, error);
    } finally {
      flushing = null;
    }
  })();

  return flushing;
}

/** Stop the flush timer and drain the buffer once — for graceful shutdown. */
export async function stopUsageTracking(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await flushUsageBuffer();
}

process.on('SIGTERM', () => void stopUsageTracking());
process.on('SIGINT', () => void stopUsageTracking());
