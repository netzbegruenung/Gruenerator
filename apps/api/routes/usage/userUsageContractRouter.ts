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
import {
  emissionsFromEnergy,
  estimateFootprint,
  hasMarketInstrument,
  marketIntensityFor,
  estimateImageFootprint,
  referenceFootprint,
} from '../../services/usage/energyFootprint.js';
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

// A unit missing from this set does not raise anything — it is silently read as
// 'tokens', which files the row under text models with a token count of zero.
const KNOWN_UNITS = new Set<string>([
  'tokens',
  'images',
  'transcriptions',
  'searches',
  'speech_seconds',
]);

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
        speech_seconds: 0,
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
          speech_seconds: number;
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

      // Footprint accumulators.
      //
      // Coverage is weighted by OUTPUT tokens, not by all tokens. Output drives
      // energy by a factor of 100-760, and real traffic runs ~14:1 input-heavy
      // because the intermediate lane ships huge prompts and writes almost
      // nothing back. Counting all tokens would report ~35% coverage for a
      // workload whose ENERGY is in fact almost fully accounted for — an
      // honesty metric that understates its own honesty is worse than useless.
      let energyWms = 0;
      let emissionsUg = 0;
      let measuredEnergyWms = 0;
      // Energy whose model was never metered anywhere, so it is valued from the
      // bracket between two models that were. Reported separately so the
      // headline number is never taken for more than it is.
      let boundedEnergyWms = 0;
      let textOutputTokens = 0;
      // Doubles as the base of the GPT-4o counterfactual, so both sides of the
      // comparison describe the same requests. TEXT only — the counterfactual
      // has no image half (see energyFootprint.ts).
      let coveredOutputTokens = 0;
      let coveredRequests = 0;
      // Broken out because a single generated image outweighs hundreds of chat
      // turns: without the split the headline would read as a chat footprint.
      let imageEnergyWms = 0;
      let imageEmissionsUg = 0;
      // The same totals under the MARKET-based method, accumulated in parallel
      // so both ends of the range describe exactly the same rows. See
      // MARKET_INTENSITY_G_PER_KWH in energyFootprint.ts.
      let marketEmissionsUg = 0;
      let imageMarketEmissionsUg = 0;
      let marketBackedEnergyWms = 0;

      for (const row of rows) {
        const unit = usageUnitFallback(row.unit);
        const feature = usageFeatureFallback(row.feature);
        const tokens = row.inputTokens + row.outputTokens;

        if (unit === 'tokens') {
          textOutputTokens += row.outputTokens;
          if (row.energyWms > 0) {
            // Measured beats estimated: GreenPT already told us the truth.
            energyWms += row.energyWms;
            measuredEnergyWms += row.energyWms;
            emissionsUg += row.emissionsUg;
            // The provider reported the location-based figure; the market side
            // is ours to apply, and GreenPT runs on Scaleway's GoO-backed
            // supply. Its own hourly grid number stays the headline.
            marketEmissionsUg += emissionsFromEnergy(
              row.energyWms,
              marketIntensityFor(row.provider)
            );
            if (hasMarketInstrument(row.provider)) marketBackedEnergyWms += row.energyWms;
            coveredOutputTokens += row.outputTokens;
            coveredRequests += row.requests;
          } else {
            const estimate = estimateFootprint({
              provider: row.provider,
              model: row.model,
              inputTokens: row.inputTokens,
              outputTokens: row.outputTokens,
              requests: row.requests,
            });
            if (estimate) {
              energyWms += estimate.energyWms;
              emissionsUg += estimate.emissionsUg;
              marketEmissionsUg += estimate.marketEmissionsUg;
              if (hasMarketInstrument(row.provider)) marketBackedEnergyWms += estimate.energyWms;
              coveredOutputTokens += row.outputTokens;
              coveredRequests += row.requests;
              if (estimate.basis === 'bound') boundedEnergyWms += estimate.energyWms;
            }
          }
        }

        if (unit === 'images') {
          const estimate = estimateImageFootprint({
            provider: row.provider,
            model: row.model,
            images: row.ops,
          });
          if (estimate) {
            energyWms += estimate.energyWms;
            emissionsUg += estimate.emissionsUg;
            marketEmissionsUg += estimate.marketEmissionsUg;
            if (hasMarketInstrument(row.provider)) marketBackedEnergyWms += estimate.energyWms;
            imageEnergyWms += estimate.energyWms;
            imageEmissionsUg += estimate.emissionsUg;
            imageMarketEmissionsUg += estimate.marketEmissionsUg;
            if (estimate.basis === 'bound') boundedEnergyWms += estimate.energyWms;
          }
        }

        totals.requests += row.requests;
        totals.input_tokens += row.inputTokens;
        totals.output_tokens += row.outputTokens;
        totals.total_tokens += tokens;
        if (unit === 'images') totals.images += row.ops;
        if (unit === 'transcriptions') totals.transcriptions += row.ops;
        if (unit === 'searches') totals.searches += row.ops;
        if (unit === 'speech_seconds') totals.speech_seconds += row.ops;

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
          speech_seconds: 0,
        };
        featureEntry.requests += row.requests;
        featureEntry.total_tokens += tokens;
        if (unit === 'images') featureEntry.images += row.ops;
        if (unit === 'transcriptions') featureEntry.transcriptions += row.ops;
        if (unit === 'searches') featureEntry.searches += row.ops;
        if (unit === 'speech_seconds') featureEntry.speech_seconds += row.ops;
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

      const reference = referenceFootprint({
        outputTokens: coveredOutputTokens,
        requests: coveredRequests,
      });

      return {
        status: 200 as const,
        body: {
          success: true as const,
          days,
          since: sinceDay,
          totals,
          footprint: {
            energy_wh: energyWms / 3_600_000,
            emissions_g: emissionsUg / 1_000_000,
            measured_share: energyWms > 0 ? measuredEnergyWms / energyWms : 0,
            bounded_share: energyWms > 0 ? boundedEnergyWms / energyWms : 0,
            covered_share: textOutputTokens > 0 ? coveredOutputTokens / textOutputTokens : 0,
            image_energy_wh: imageEnergyWms / 3_600_000,
            image_emissions_g: imageEmissionsUg / 1_000_000,
            reference_energy_wh: reference.energyWms / 3_600_000,
            reference_emissions_g: reference.emissionsUg / 1_000_000,
            market_emissions_g: marketEmissionsUg / 1_000_000,
            image_market_emissions_g: imageMarketEmissionsUg / 1_000_000,
            market_backed_share: energyWms > 0 ? marketBackedEnergyWms / energyWms : 0,
          },
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
