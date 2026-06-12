/**
 * Polling data via the official PolitPro API (politpro.eu/api/v1, Bearer
 * token, 30 req/min, recommended update interval 12h).
 *
 * The previous unofficial sources (undocumented JSON endpoint + HTML
 * scraping) were shut down by PolitPro and have been removed. Sub-national
 * parliaments (Bundesländer, AT-Länder) are documented but currently rejected
 * for our token ("Parliament not found or not supported"), so each parliament
 * is probed and negative-cached for 12h; they start working automatically
 * once PolitPro unlocks them for our plan.
 */
import { pollDataSchema } from '@gruenerator/contracts';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import { getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';

import type { PollData, PollResult } from './PollScraper.js';

const log = createLogger('PolitPro');

const API_BASE_URL = 'https://politpro.eu/api/v1';
const CACHE_TTL = 12 * 60 * 60;
const UNSUPPORTED_TTL = 12 * 60 * 60;
const FETCH_TIMEOUT = 15000;

const PARTY_NAME_MAP: Record<string, string> = {
  'CDU/CSU': 'CDU/CSU',
  AfD: 'AfD',
  SPD: 'SPD',
  Grüne: 'GRÜNE',
  Linke: 'DIE LINKE',
  BSW: 'BSW',
  FDP: 'FDP',
  Others: 'Sonstige',
};

export interface PolitProPollData extends PollData {
  source: 'politpro';
  parliament: string;
  trend: Record<string, Array<{ date: string; value: number }>>;
}

/** Cache shape: the contract poll schema with the PolitPro extras required. */
const politProPollDataSchema = pollDataSchema.required({
  source: true,
  parliament: true,
  trend: true,
});

const unsupportedFlagSchema = z.object({ unsupported: z.literal(true) });

/** Internal parliament id → official API parliament code (ISO-style). */
const PARLIAMENT_API_CODES: Record<string, string> = {
  deutschland: 'de',
  oesterreich: 'at',
  'baden-wuerttemberg': 'de-bw',
  bayern: 'de-by',
  berlin: 'de-be',
  brandenburg: 'de-bb',
  bremen: 'de-hb',
  hamburg: 'de-hh',
  hessen: 'de-he',
  'mecklenburg-vorpommern': 'de-mv',
  niedersachsen: 'de-ni',
  'nordrhein-westfalen': 'de-nw',
  'rheinland-pfalz': 'de-rp',
  saarland: 'de-sl',
  sachsen: 'de-sn',
  'sachsen-anhalt': 'de-st',
  'schleswig-holstein': 'de-sh',
  thueringen: 'de-th',
};

interface ApiParty {
  name_short: string;
  name_long: string;
  color: string;
  font_color: string;
  percent: number;
  seats?: number;
  diff?: number;
  election_diff?: number;
}

interface ApiTrendData {
  poll: {
    date: string;
    parliament: string;
    seats_total: number;
    parties: ApiParty[];
  };
}

interface ApiInstitutePoll {
  start: string;
  end: string;
  sample_size?: number | null;
  institute: { name: string; score?: number | null };
  parties: ApiParty[];
}

interface ApiInstitutesData {
  polls: ApiInstitutePoll[];
}

interface ApiHistoryData {
  parliament: string;
  datasets: Array<{
    name_short: string;
    history: Array<{ date: string; percent: number }>;
  }>;
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; notFound: boolean };

/**
 * GET an official API path. Unknown paths return HTTP 200 with an HTML page,
 * so the body must parse as JSON with a truthy `success` to count as ok.
 */
async function fetchApi<T>(path: string): Promise<ApiResult<T>> {
  const failed = (notFound = false): ApiResult<T> => ({ ok: false, notFound });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${env.POLITPRO_API_KEY}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      if (response.status === 404) return failed(true);
      if (response.status === 401) {
        log.error(`API rejected POLITPRO_API_KEY (401) for ${path}`);
      } else if (response.status === 429) {
        log.warn(`API rate limit hit (429) for ${path}`);
      } else {
        log.error(`API error ${response.status} for ${path}`);
      }
      return failed();
    }

    const body = (await response.json()) as { success?: unknown; data?: T };
    if (!body.success || body.data == null) {
      log.error(`API returned success=false for ${path}`);
      return failed();
    }
    return { ok: true, data: body.data };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      log.error(`API timeout for ${path}`);
    } else {
      log.error(`API fetch failed for ${path}: ${error}`);
    }
    return failed();
  }
}

function mapApiParties(parties: ApiParty[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const p of parties) {
    result[PARTY_NAME_MAP[p.name_short] || p.name_short] = p.percent;
  }
  return result;
}

function toApiPollResult(poll: ApiInstitutePoll): PollResult {
  return {
    institute: poll.institute.name,
    date: poll.end,
    parties: mapApiParties(poll.parties),
    sampleSize: poll.sample_size ?? null,
    instituteScore: poll.institute.score ?? null,
  };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Fetch a parliament from the official API.
 * Returns 'unsupported' when the API rejects the parliament code (404).
 */
async function fetchFromApi(parliament: string): Promise<PolitProPollData | 'unsupported' | null> {
  const code = PARLIAMENT_API_CODES[parliament];

  const trendResult = await fetchApi<ApiTrendData>(`/${code}/trend`);
  if (!trendResult.ok) return trendResult.notFound ? 'unsupported' : null;

  const year = new Date().getFullYear();
  const [institutesResult, historyResult] = await Promise.all([
    fetchApi<ApiInstitutesData>(`/${code}/polls/institutes`),
    fetchApi<ApiHistoryData>(`/${code}/trend/history/${year - 1}/${year}?format=party`),
  ]);

  const trendPoll = trendResult.data.poll;
  const average = mapApiParties(trendPoll.parties);

  const diffs: Record<string, number> = {};
  const lastElectionParties: Record<string, number | null> = {};
  for (const p of trendPoll.parties) {
    const name = PARTY_NAME_MAP[p.name_short] || p.name_short;
    if (p.diff != null) diffs[name] = p.diff;
    if (p.election_diff != null) lastElectionParties[name] = round1(p.percent - p.election_diff);
  }

  const institutePolls = institutesResult.ok
    ? institutesResult.data.polls.map(toApiPollResult).sort((a, b) => b.date.localeCompare(a.date))
    : [];

  // Without institute polls, expose the weighted trend as a single entry
  // (frontend treats polls.length > 1 as "real institute polls available").
  const polls: PollResult[] =
    institutePolls.length > 0
      ? institutePolls
      : [{ institute: `PolitPro (${parliament})`, date: trendPoll.date, parties: average }];

  const trend: Record<string, Array<{ date: string; value: number }>> = {};
  if (historyResult.ok) {
    for (const ds of historyResult.data.datasets) {
      const name = PARTY_NAME_MAP[ds.name_short] || ds.name_short;
      trend[name] = ds.history.map((h) => ({ date: h.date, value: h.percent }));
    }
  }

  log.info(
    `[fetchFromApi] ${parliament}: ${polls.length} polls, ${Object.keys(average).length} parties, history=${historyResult.ok}`
  );

  return {
    polls,
    lastElection:
      Object.keys(lastElectionParties).length > 0
        ? { institute: 'Letzte Wahl', date: '', parties: lastElectionParties }
        : null,
    average,
    diffs,
    scrapedAt: new Date().toISOString(),
    source: 'politpro',
    parliament,
    trend,
  };
}

export async function getPolitProPolls(
  parliament = 'deutschland'
): Promise<PolitProPollData | null> {
  if (!VALID_PARLIAMENT_IDS.has(parliament)) {
    log.warn(`[getPolitProPolls] Invalid parliament ID: ${parliament}`);
    return null;
  }

  if (!env.POLITPRO_API_KEY) {
    log.warn('[getPolitProPolls] POLITPRO_API_KEY not set, skipping');
    return null;
  }

  const cacheKey = `monitor:politpro:v2:${parliament}`;
  const cached = await getCachedJson(cacheKey, politProPollDataSchema);
  if (cached) return cached;

  const unsupportedKey = `monitor:politpro:unsupported:${parliament}`;
  if (await getCachedJson(unsupportedKey, unsupportedFlagSchema)) return null;

  const result = await fetchFromApi(parliament);
  if (result === 'unsupported') {
    log.warn(`[getPolitProPolls] API does not support "${parliament}" (plan tier?)`);
    await setCachedJson(unsupportedKey, { unsupported: true }, UNSUPPORTED_TTL);
    return null;
  }
  if (!result) return null;

  await setCachedJson(cacheKey, result, CACHE_TTL);
  return result;
}

export const POLITPRO_PARLIAMENTS = [
  { id: 'deutschland', name: 'Deutschland' },
  { id: 'oesterreich', name: 'Österreich' },
  { id: 'baden-wuerttemberg', name: 'Baden-Württemberg' },
  { id: 'bayern', name: 'Bayern' },
  { id: 'berlin', name: 'Berlin' },
  { id: 'brandenburg', name: 'Brandenburg' },
  { id: 'bremen', name: 'Bremen' },
  { id: 'hamburg', name: 'Hamburg' },
  { id: 'hessen', name: 'Hessen' },
  { id: 'mecklenburg-vorpommern', name: 'Mecklenburg-Vorpommern' },
  { id: 'niedersachsen', name: 'Niedersachsen' },
  { id: 'nordrhein-westfalen', name: 'Nordrhein-Westfalen' },
  { id: 'rheinland-pfalz', name: 'Rheinland-Pfalz' },
  { id: 'saarland', name: 'Saarland' },
  { id: 'sachsen', name: 'Sachsen' },
  { id: 'sachsen-anhalt', name: 'Sachsen-Anhalt' },
  { id: 'schleswig-holstein', name: 'Schleswig-Holstein' },
  { id: 'thueringen', name: 'Thüringen' },
] as const;

const VALID_PARLIAMENT_IDS: Set<string> = new Set(POLITPRO_PARLIAMENTS.map((p) => p.id));
