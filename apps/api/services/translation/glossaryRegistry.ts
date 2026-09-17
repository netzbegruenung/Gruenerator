/**
 * The one account glossary every translation carries automatically.
 *
 * DeepL is the source of truth — there is no Postgres mirror. The admin tab
 * edits dictionaries straight against `/v3/glossaries`, and this module only
 * remembers WHICH glossary is ours: its id lives in Redis without TTL (name
 * lookup is the fallback when the id is missing or DeepL says 404), and the
 * pair list is cached for ten minutes because every translation asks for it.
 *
 * Glossaries work on root languages (`en`, never `en-GB`), so pairs are keyed
 * `de>en` and callers pass whatever code they have.
 */
import { z } from 'zod';

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import redisClient from '../../utils/redis/client.js';
import { deleteCachedKey, getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';

import { DeepLError, rootLang, type DeepLGlossary, type DeepLService } from './DeepLService.js';

const log = createLogger('DeepLGlossary');

const ID_KEY = 'deepl:glossary:id';
const INFO_KEY = 'deepl:glossary:info:v1';
const INFO_TTL_SECONDS = 10 * 60;

const infoSchema = z.object({
  glossaryId: z.string(),
  pairs: z.array(z.string()),
});

export type GlossaryInfo = z.infer<typeof infoSchema>;

export function pairKey(sourceLang: string, targetLang: string): string {
  return `${rootLang(sourceLang)}>${rootLang(targetLang)}`;
}

export function glossaryName(): string {
  return env.DEEPL_GLOSSARY_NAME;
}

function toInfo(glossary: DeepLGlossary): GlossaryInfo {
  return {
    glossaryId: glossary.glossaryId,
    pairs: glossary.dictionaries.map((d) => `${d.sourceLang}>${d.targetLang}`),
  };
}

async function rememberId(glossaryId: string): Promise<void> {
  try {
    await redisClient.set(ID_KEY, glossaryId);
  } catch (error) {
    log.warn(`[DeepLGlossary] could not persist glossary id: ${(error as Error).message}`);
  }
}

async function knownId(): Promise<string | null> {
  try {
    const raw = await redisClient.get(ID_KEY);
    return typeof raw === 'string' && raw ? raw : null;
  } catch {
    return null;
  }
}

/** The account glossary, or null when none exists yet. */
export async function resolveGlossary(service: DeepLService): Promise<GlossaryInfo | null> {
  const cached = await getCachedJson(INFO_KEY, infoSchema);
  if (cached) return cached;

  let glossary: DeepLGlossary | null = null;
  const id = await knownId();
  if (id) {
    try {
      glossary = await service.getGlossary(id);
    } catch (error) {
      if (!(error instanceof DeepLError && error.status === 404)) throw error;
      log.warn(`[DeepLGlossary] remembered glossary ${id} is gone, looking it up by name`);
    }
  }
  if (!glossary) {
    const named = (await service.listGlossaries())
      .filter((g) => g.name === glossaryName())
      .sort((a, b) => b.creationTime.localeCompare(a.creationTime));
    if (named.length > 1) {
      log.warn(
        `[DeepLGlossary] ${named.length} glossaries named "${glossaryName()}" — using the newest (${named[0]!.glossaryId})`
      );
    }
    glossary = named[0] ?? null;
    if (glossary) await rememberId(glossary.glossaryId);
  }
  if (!glossary) return null;

  const info = toInfo(glossary);
  await setCachedJson(INFO_KEY, info, INFO_TTL_SECONDS);
  return info;
}

/** The glossary id to send for this pair, or null when no dictionary covers it. */
export function glossaryIdFor(
  info: GlossaryInfo | null,
  sourceLang: string,
  targetLang: string
): string | null {
  if (!info) return null;
  return info.pairs.includes(pairKey(sourceLang, targetLang)) ? info.glossaryId : null;
}

/** After an admin write: forget the pair list, keep the id. */
export async function invalidateGlossaryInfo(): Promise<void> {
  await deleteCachedKey(INFO_KEY);
}

/** Remember a glossary the admin path just created. */
export async function registerGlossary(glossary: DeepLGlossary): Promise<GlossaryInfo> {
  await rememberId(glossary.glossaryId);
  const info = toInfo(glossary);
  await setCachedJson(INFO_KEY, info, INFO_TTL_SECONDS);
  return info;
}
