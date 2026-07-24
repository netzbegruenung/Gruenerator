/**
 * ts-rest router for /api/usage (read-only).
 *
 * Serves the authenticated user their own consumption aggregate for the
 * profile "Nutzung" tab. The rows are already daily buckets, so the window is
 * at most a few hundred rows per user — the slicing into totals / daily series
 * / breakdowns happens in memory rather than in four separate SQL aggregates.
 */

import { userUsageContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';
import { and, eq, gte } from 'drizzle-orm';

import { userUsageDaily } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { UsageFeature, UsageUnit } from '@gruenerator/contracts';
import type { Application } from 'express';

const log = createLogger('userUsageContract');

const s = initServer();

/** Rows predate schema changes; an unknown slug must not break the response. */
const KNOWN_FEATURES = new Set<string>([
  'chat',
  'docs',
  'sheets',
  'presentations',
  'boards',
  'sharepic',
  'subtitler',
  'search',
  'monitor',
  'sites',
  'texte',
  'notebook',
  'other',
]);

function usageFeatureFallback(feature: string): UsageFeature {
  // Boundary cast: the Set membership check IS the runtime assertion.
  return (KNOWN_FEATURES.has(feature) ? feature : 'other') as UsageFeature;
}

const KNOWN_UNITS = new Set<string>(['tokens', 'images', 'transcriptions', 'searches']);

function usageUnitFallback(unit: string): UsageUnit {
  return (KNOWN_UNITS.has(unit) ? unit : 'tokens') as UsageUnit;
}

export const userUsageContractRouter = s.router(userUsageContract, {
  getMyUsage: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const days = args.query.days ?? 30;

      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      since.setUTCDate(since.getUTCDate() - (days - 1));
      const sinceDay = since.toISOString().slice(0, 10);

      const db = getDrizzleInstance();
      const rows = await db
        .select()
        .from(userUsageDaily)
        .where(and(eq(userUsageDaily.userId, userId), gte(userUsageDaily.day, sinceDay)));

      const totals = {
        requests: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        images: 0,
        transcriptions: 0,
        searches: 0,
      };
      const daily = new Map<string, { requests: number; input: number; output: number }>();
      const byFeature = new Map<
        UsageFeature,
        {
          requests: number;
          total_tokens: number;
          images: number;
          transcriptions: number;
          searches: number;
        }
      >();
      const byModel = new Map<
        string,
        {
          provider: string;
          model: string;
          unit: ReturnType<typeof usageUnitFallback>;
          requests: number;
          total_tokens: number;
          ops: number;
        }
      >();

      for (const row of rows) {
        const unit = usageUnitFallback(row.unit);
        const feature = usageFeatureFallback(row.feature);
        const tokens = row.inputTokens + row.outputTokens;

        totals.requests += row.requests;
        totals.input_tokens += row.inputTokens;
        totals.output_tokens += row.outputTokens;
        totals.total_tokens += tokens;
        if (unit === 'images') totals.images += row.ops;
        if (unit === 'transcriptions') totals.transcriptions += row.ops;
        if (unit === 'searches') totals.searches += row.ops;

        const dayEntry = daily.get(row.day) ?? { requests: 0, input: 0, output: 0 };
        dayEntry.requests += row.requests;
        dayEntry.input += row.inputTokens;
        dayEntry.output += row.outputTokens;
        daily.set(row.day, dayEntry);

        const featureEntry = byFeature.get(feature) ?? {
          requests: 0,
          total_tokens: 0,
          images: 0,
          transcriptions: 0,
          searches: 0,
        };
        featureEntry.requests += row.requests;
        featureEntry.total_tokens += tokens;
        if (unit === 'images') featureEntry.images += row.ops;
        if (unit === 'transcriptions') featureEntry.transcriptions += row.ops;
        if (unit === 'searches') featureEntry.searches += row.ops;
        byFeature.set(feature, featureEntry);

        const modelKey = `${row.provider}|${row.model}|${unit}`;
        const modelEntry = byModel.get(modelKey) ?? {
          provider: row.provider,
          model: row.model,
          unit,
          requests: 0,
          total_tokens: 0,
          ops: 0,
        };
        modelEntry.requests += row.requests;
        modelEntry.total_tokens += tokens;
        modelEntry.ops += row.ops;
        byModel.set(modelKey, modelEntry);
      }

      return {
        status: 200 as const,
        body: {
          success: true as const,
          days,
          since: sinceDay,
          totals,
          daily: [...daily.entries()]
            .map(([day, entry]) => ({
              day,
              requests: entry.requests,
              input_tokens: entry.input,
              output_tokens: entry.output,
            }))
            .sort((a, b) => a.day.localeCompare(b.day)),
          byFeature: [...byFeature.entries()]
            .map(([feature, entry]) => ({ feature, ...entry }))
            .sort((a, b) => b.total_tokens - a.total_tokens || b.requests - a.requests),
          byModel: [...byModel.values()].sort(
            (a, b) => b.total_tokens - a.total_tokens || b.ops - a.ops
          ),
        },
      };
    } catch (error) {
      log.error('[UserUsage Contract] Error retrieving usage:', error);
      return {
        status: 500 as const,
        body: { error: (error as Error).message || 'Failed to retrieve usage' },
      };
    }
  },
});

/** Mount the ts-rest contract router onto an Express app instance. */
export function mountUserUsageContractRouter(app: Application): void {
  createExpressEndpoints(userUsageContract, userUsageContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'userUsageContract'),
  });
}
