/* eslint-disable @typescript-eslint/no-unsafe-return -- TODO(follow-up): pre-existing strict-mode violation exposed by log-noise codemod */
/**
 * Redis codecs for the subtitler pipeline.
 *
 * Every read from a subtitler Redis key goes through `parseRedisJson(raw, schema)`
 * instead of `JSON.parse(raw) as T` — this validates the shape at the boundary,
 * catches stale values after deploys, and removes the unsafe cast site.
 *
 * Schemas live in `@gruenerator/contracts` so they're shared with the frontend
 * where applicable.
 */
import {
  autoProgressSchema,
  exportProgressSchema,
  redisJobResultSchema,
  type AutoProgress,
  type ExportProgress,
  type RedisJobResult,
} from '@gruenerator/contracts';

import { createLogger } from '../../utils/logger.js';

import type { z } from 'zod';

const log = createLogger('subtitler-redis');

/**
 * Parse a Redis string value through a Zod schema. Returns `null` if the
 * input was `null` (key miss) or if validation failed (logged). Callers
 * MUST treat `null` as "no usable data" rather than "key missing".
 */
export function parseRedisJson<S extends z.ZodTypeAny>(
  raw: string | null,
  schema: S,
  context: string
): z.infer<S> | null {
  if (raw == null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    log.warn(`[${context}] JSON.parse failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    log.warn(`[${context}] Zod validation failed: ${result.error.message}`);
    return null;
  }
  return result.data;
}

export function parseRedisJobResult(raw: string | null, context: string): RedisJobResult | null {
  return parseRedisJson(raw, redisJobResultSchema, context);
}

export function parseExportProgress(raw: string | null, context: string): ExportProgress | null {
  return parseRedisJson(raw, exportProgressSchema, context);
}

export function parseAutoProgress(raw: string | null, context: string): AutoProgress | null {
  return parseRedisJson(raw, autoProgressSchema, context);
}
