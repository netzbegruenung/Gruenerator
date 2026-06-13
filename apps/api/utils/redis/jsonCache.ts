/**
 * Zod-validated JSON cache on top of the shared redis client.
 *
 * `getCachedJson` treats redis errors, parse errors and schema mismatches all
 * as cache misses (returning null), so callers keep plain cache-aside logic.
 * Invalid entries are deleted so they cannot poison subsequent reads.
 */
import { toError } from '../errors/index.js';
import { createLogger } from '../logger.js';

import redisClient from './client.js';

import type { z } from 'zod';

const log = createLogger('jsonCache');

export async function getCachedJson<S extends z.ZodTypeAny>(
  key: string,
  schema: S
): Promise<z.infer<S> | null> {
  let raw: string | null;
  try {
    raw = await redisClient.get(key);
  } catch (error) {
    log.warn(`Redis read failed for ${key}: ${toError(error).message}`);
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    log.warn(`Dropping unparseable cache entry ${key}`);
    await deleteCachedKey(key);
    return null;
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    log.warn(`Dropping schema-invalid cache entry ${key}: ${result.error.message}`);
    await deleteCachedKey(key);
    return null;
  }
  return result.data as z.infer<S>;
}

export async function setCachedJson(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  try {
    await redisClient.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (error) {
    log.warn(`Redis write failed for ${key}: ${toError(error).message}`);
  }
}

export async function deleteCachedKey(key: string): Promise<void> {
  try {
    await redisClient.del(key);
  } catch (error) {
    log.warn(`Redis delete failed for ${key}: ${toError(error).message}`);
  }
}
