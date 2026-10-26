/**
 * The iOS app version live in the App Store, from Apple's public lookup API.
 * Asked here rather than on the device so that no phone's IP goes to Apple on
 * every launch (the same reason the OTA server is our own, #3904).
 */
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import { getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';

const log = createLogger('iosStoreRelease');

const BUNDLE_ID = 'de.gruenerator.app';
const LOOKUP_URL = `https://itunes.apple.com/lookup?bundleId=${BUNDLE_ID}&country=de`;
const CACHE_KEY = 'app-release:ios';
// A found version changes only with a release; a miss is retried sooner so a
// fresh release shows up within the hour.
const FOUND_TTL_SECONDS = 6 * 60 * 60;
const MISS_TTL_SECONDS = 30 * 60;

const cachedSchema = z.object({ version: z.string().nullable() });
const lookupSchema = z.object({
  results: z.array(z.object({ version: z.string() })),
});

async function lookUp(): Promise<string | null> {
  try {
    const response = await fetch(LOOKUP_URL, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = lookupSchema.safeParse(await response.json());
    return parsed.success ? (parsed.data.results[0]?.version ?? null) : null;
  } catch (error) {
    log.warn(
      `[iosStoreRelease] lookup failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

export async function getIosStoreVersion(): Promise<string | null> {
  const cached = await getCachedJson(CACHE_KEY, cachedSchema);
  if (cached) return cached.version;

  const version = await lookUp();
  await setCachedJson(CACHE_KEY, { version }, version ? FOUND_TTL_SECONDS : MISS_TTL_SECONDS);
  return version;
}
