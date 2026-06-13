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
import {
  euGreensHistoryResponseSchema,
  euGreensResponseSchema,
  pollDataSchema,
  pollsHistoryResponseSchema,
  type EuGreensData,
  type EuGreensHistoryData,
  type PollData,
  type PollResult,
  type PollsHistoryData,
} from '@gruenerator/contracts';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import { getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';

const log = createLogger('PolitPro');

const API_BASE_URL = 'https://politpro.eu/api/v1';
const CACHE_TTL = 12 * 60 * 60;
// PolitPro stores one history point per week and recommends weekly updates.
const HISTORY_TTL = 24 * 60 * 60;
const UNSUPPORTED_TTL = 12 * 60 * 60;
const FETCH_TIMEOUT = 15000;
/** Earliest year with PolitPro history data (varies by parliament). */
const HISTORY_START_YEAR = 2019;

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
  burgenland: 'at-1',
  kaernten: 'at-2',
  niederoesterreich: 'at-3',
  oberoesterreich: 'at-4',
  salzburg: 'at-5',
  steiermark: 'at-6',
  tirol: 'at-7',
  vorarlberg: 'at-8',
  wien: 'at-9',
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
  parliament?: string;
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

interface ApiPollHistoryData {
  parliament: string;
  polls: Array<{ date: string; parties: ApiParty[] }>;
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

/**
 * Guard against a live PolitPro bug: the API intermittently serves the data
 * of a DIFFERENT parliament than requested (observed: every country code
 * returning de-bw). Reject any response whose parliament field mismatches.
 */
function parliamentMatches(expectedCode: string, actual: string | undefined | null): boolean {
  return actual != null && actual.toLowerCase() === expectedCode.toLowerCase();
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
  if (!parliamentMatches(code, trendResult.data.poll.parliament)) {
    log.error(
      `[fetchFromApi] API returned wrong parliament "${trendResult.data.poll.parliament}" for "${code}" — discarding`
    );
    return null;
  }

  const year = new Date().getFullYear();
  const [institutesRaw, historyRaw] = await Promise.all([
    fetchApi<ApiInstitutesData>(`/${code}/polls/institutes`),
    fetchApi<ApiHistoryData>(`/${code}/trend/history/${year - 1}/${year}?format=party`),
  ]);
  const institutesResult =
    institutesRaw.ok &&
    institutesRaw.data.polls.some((p) => !parliamentMatches(code, p.parliament ?? code))
      ? ({ ok: false, notFound: false } as const)
      : institutesRaw;
  const historyResult =
    historyRaw.ok && !parliamentMatches(code, historyRaw.data.parliament)
      ? ({ ok: false, notFound: false } as const)
      : historyRaw;

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

// ── EU greens (green-party trend across European parliaments) ────────────────

export interface EuGreenPartyEntry {
  countryCode: string;
  countryName: string;
  /** Must match the API's `name_short` exactly. */
  partyShort: string;
  partyLabel: string;
  note?: string;
  website: string | null;
  /** Wikipedia article title (verified), null when no article exists. */
  wikipedia: string | null;
  /** Wikipedia language edition of the article; defaults to 'de'. */
  wikipediaLang?: string;
}

/**
 * Curated map of green parties per European parliament, keyed by PolitPro
 * country code. Criterion: European Green Party member or Greens/EFA-affiliated.
 * Countries whose greens run inside a broader alliance carry a `note`;
 * countries where no green result is extractable (FR inside NFP, ES inside
 * Sumar, PL inside KO, BE/CZ/GR/HU below threshold) are omitted.
 */
export const EU_GREEN_PARTIES: EuGreenPartyEntry[] = [
  {
    countryCode: 'de',
    countryName: 'Deutschland',
    partyShort: 'Grüne',
    partyLabel: 'Grüne',
    website: 'https://www.gruene.de',
    wikipedia: 'Bündnis 90/Die Grünen',
  },
  {
    countryCode: 'at',
    countryName: 'Österreich',
    partyShort: 'GRÜNE',
    partyLabel: 'Grüne',
    website: 'https://www.gruene.at',
    wikipedia: 'Die Grünen – Die Grüne Alternative',
  },
  {
    countryCode: 'eu',
    countryName: 'EU-Parlament',
    partyShort: 'G/EFA',
    partyLabel: 'Greens/EFA',
    note: 'Fraktion im EU-Parlament',
    website: 'https://www.greens-efa.eu',
    wikipedia: 'Die Grünen/Europäische Freie Allianz',
  },
  {
    countryCode: 'fi',
    countryName: 'Finnland',
    partyShort: 'VIHR',
    partyLabel: 'Vihreät',
    website: 'https://www.vihreat.fi',
    wikipedia: 'Grüner Bund',
  },
  {
    countryCode: 'se',
    countryName: 'Schweden',
    partyShort: 'MP',
    partyLabel: 'Miljöpartiet',
    website: 'https://www.mp.se',
    wikipedia: 'Miljöpartiet de Gröna',
  },
  {
    countryCode: 'dk',
    countryName: 'Dänemark',
    partyShort: 'F',
    partyLabel: 'SF',
    note: 'Grün-linke Partei, Mitglied der Europäischen Grünen',
    website: 'https://sf.dk',
    wikipedia: 'Socialistisk Folkeparti',
  },
  {
    countryCode: 'ie',
    countryName: 'Irland',
    partyShort: 'GP',
    partyLabel: 'Green Party',
    website: 'https://www.greenparty.ie',
    wikipedia: 'Green Party (Irland)',
  },
  {
    countryCode: 'lu',
    countryName: 'Luxemburg',
    partyShort: 'DG',
    partyLabel: 'déi gréng',
    website: 'https://greng.lu',
    wikipedia: 'Déi Gréng',
  },
  {
    countryCode: 'nl',
    countryName: 'Niederlande',
    partyShort: 'GL/PvdA',
    partyLabel: 'GroenLinks–PvdA',
    note: 'Gemeinsame Liste mit den Sozialdemokraten',
    website: 'https://groenlinkspvda.nl',
    wikipedia: 'GroenLinks-PvdA',
  },
  {
    countryCode: 'it',
    countryName: 'Italien',
    partyShort: 'AVS',
    partyLabel: 'Alleanza Verdi e Sinistra',
    note: 'Allianz von Grünen und Linker',
    website: 'https://verdisinistra.it',
    wikipedia: 'Greens and Left Alliance',
    wikipediaLang: 'en',
  },
  {
    countryCode: 'hr',
    countryName: 'Kroatien',
    partyShort: 'M',
    partyLabel: 'Možemo!',
    website: 'https://mozemo.hr',
    wikipedia: 'Možemo!',
  },
  {
    countryCode: 'pt',
    countryName: 'Portugal',
    partyShort: 'L',
    partyLabel: 'Livre',
    website: 'https://partidolivre.pt',
    wikipedia: 'LIVRE',
  },
  {
    countryCode: 'lv',
    countryName: 'Lettland',
    partyShort: 'P',
    partyLabel: 'Progresīvie',
    website: 'https://progresivie.lv',
    wikipedia: 'Progresīvie',
  },
  {
    countryCode: 'ro',
    countryName: 'Rumänien',
    partyShort: 'SENS',
    partyLabel: 'SENS',
    website: 'https://sens.ro',
    wikipedia: null,
  },
  {
    countryCode: 'ee',
    countryName: 'Estland',
    partyShort: 'EER',
    partyLabel: 'Eestimaa Rohelised',
    website: 'https://rohelised.ee',
    wikipedia: 'Eestimaa Rohelised',
  },
];

export async function getEuGreens(): Promise<EuGreensData | null> {
  if (!env.POLITPRO_API_KEY) {
    log.warn('[getEuGreens] POLITPRO_API_KEY not set, skipping');
    return null;
  }

  const cacheKey = 'monitor:politpro:eu-greens';
  const cached = await getCachedJson(cacheKey, euGreensResponseSchema);
  if (cached) return cached;

  const results = await Promise.all(
    EU_GREEN_PARTIES.map(async (entry) => {
      const trendResult = await fetchApi<ApiTrendData>(`/${entry.countryCode}/trend`);
      if (!trendResult.ok) return null;
      if (!parliamentMatches(entry.countryCode, trendResult.data.poll.parliament)) {
        log.error(
          `[getEuGreens] API returned wrong parliament "${trendResult.data.poll.parliament}" for "${entry.countryCode}" — discarding`
        );
        return null;
      }
      const party = trendResult.data.poll.parties.find((p) => p.name_short === entry.partyShort);
      if (!party) {
        log.warn(`[getEuGreens] Party "${entry.partyShort}" not found for ${entry.countryCode}`);
        return null;
      }
      return {
        countryCode: entry.countryCode,
        countryName: entry.countryName,
        party: entry.partyLabel,
        percent: party.percent,
        diff: party.diff != null ? round1(party.diff) : null,
        electionDiff: party.election_diff != null ? round1(party.election_diff) : null,
        date: trendResult.data.poll.date,
        note: entry.note ?? null,
      };
    })
  );

  const found = results
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.percent - a.percent);

  log.info(`[getEuGreens] ${found.length}/${EU_GREEN_PARTIES.length} green parties resolved`);
  if (found.length === 0) return null;

  const data: EuGreensData = { results: found, fetchedAt: new Date().toISOString() };
  // Don't cache heavily incomplete batches (rate-limit burst or the upstream
  // wrong-parliament bug) — retry on the next request instead.
  if (found.length >= EU_GREEN_PARTIES.length - 3) {
    await setCachedJson(cacheKey, data, CACHE_TTL);
  }
  return data;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run thunks in paced chunks to stay clear of the 30 req/min API rate limit
 * (the EU batches can coincide with the per-parliament requests).
 */
async function inChunks<T>(
  thunks: Array<() => Promise<T>>,
  size: number,
  delayMs = 4000
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < thunks.length; i += size) {
    if (i > 0) await sleep(delayMs);
    results.push(...(await Promise.all(thunks.slice(i, i + size).map((t) => t()))));
  }
  return results;
}

/**
 * History start years to try per parliament. Data availability varies
 * ("ab frühestens 2019"); a range starting before the parliament's first
 * data point is rejected with 404, so fall back to a shorter range.
 */
const HISTORY_START_CASCADE = [HISTORY_START_YEAR, 2022, 2024];

async function fetchHistoryDatasets(code: string): Promise<ApiHistoryData | null> {
  const year = new Date().getFullYear();
  for (const start of HISTORY_START_CASCADE) {
    const res = await fetchApi<ApiHistoryData>(
      `/${code}/trend/history/${start}/${year}?format=party`
    );
    if (res.ok) {
      if (!parliamentMatches(code, res.data.parliament)) {
        log.error(
          `[fetchHistoryDatasets] API returned wrong parliament "${res.data.parliament}" for "${code}" — discarding`
        );
        return null;
      }
      return res.data;
    }
    if (!res.notFound) return null; // rate limit / network — don't burn more calls
  }
  return null;
}

/**
 * Weekly green-party trend per country since 2019, for the EU comparison
 * chart and the per-card sparklines.
 */
export async function getEuGreensHistory(): Promise<EuGreensHistoryData | null> {
  if (!env.POLITPRO_API_KEY) return null;

  const cacheKey = 'monitor:politpro:eu-greens-history';
  const cached = await getCachedJson(cacheKey, euGreensHistoryResponseSchema);
  if (cached) return cached;

  const series = (
    await inChunks(
      EU_GREEN_PARTIES.map((entry) => async () => {
        const data = await fetchHistoryDatasets(entry.countryCode);
        const ds = data?.datasets.find((d) => d.name_short === entry.partyShort);
        if (!ds) return null;
        return {
          countryCode: entry.countryCode,
          countryName: entry.countryName,
          party: entry.partyLabel,
          points: ds.history.map((h) => ({ date: h.date, value: h.percent })),
        };
      }),
      4
    )
  ).filter((s): s is NonNullable<typeof s> => s !== null);

  log.info(`[getEuGreensHistory] ${series.length}/${EU_GREEN_PARTIES.length} series resolved`);
  if (series.length === 0) return null;

  const data: EuGreensHistoryData = { series, fetchedAt: new Date().toISOString() };
  // Don't cache heavily incomplete batches (e.g. after a 429 burst).
  if (series.length >= EU_GREEN_PARTIES.length - 3) {
    await setCachedJson(cacheKey, data, HISTORY_TTL);
  }
  return data;
}

/**
 * Full poll history of one parliament: weekly trend per party since 2019
 * plus the individual polls of the last ~2 years (for the scatter overlay).
 */
export async function getPolitProHistory(
  parliament = 'deutschland'
): Promise<PollsHistoryData | null> {
  if (!VALID_PARLIAMENT_IDS.has(parliament)) {
    log.warn(`[getPolitProHistory] Invalid parliament ID: ${parliament}`);
    return null;
  }
  if (!env.POLITPRO_API_KEY) return null;

  const cacheKey = `monitor:politpro:history:${parliament}`;
  const cached = await getCachedJson(cacheKey, pollsHistoryResponseSchema);
  if (cached) return cached;

  const unsupportedKey = `monitor:politpro:unsupported:${parliament}`;
  if (await getCachedJson(unsupportedKey, unsupportedFlagSchema)) return null;

  const code = PARLIAMENT_API_CODES[parliament];
  const year = new Date().getFullYear();
  const [partyData, pollResult] = await Promise.all([
    fetchHistoryDatasets(code),
    fetchApi<ApiPollHistoryData>(`/${code}/trend/history/${year - 1}/${year}?format=poll`),
  ]);

  if (!partyData) return null;

  const trend: Record<string, Array<{ date: string; value: number }>> = {};
  for (const ds of partyData.datasets) {
    const name = PARTY_NAME_MAP[ds.name_short] || ds.name_short;
    trend[name] = ds.history.map((h) => ({ date: h.date, value: h.percent }));
  }

  const polls =
    pollResult.ok && parliamentMatches(code, pollResult.data.parliament)
      ? pollResult.data.polls
          .map((p) => ({ date: p.date, parties: mapApiParties(p.parties) }))
          .sort((a, b) => a.date.localeCompare(b.date))
      : [];

  const data: PollsHistoryData = {
    parliament,
    trend,
    polls,
    scrapedAt: new Date().toISOString(),
  };
  await setCachedJson(cacheKey, data, HISTORY_TTL);
  return data;
}

export const POLITPRO_PARLIAMENTS = [
  { id: 'deutschland', name: 'Deutschland' },
  { id: 'oesterreich', name: 'Österreich' },
  { id: 'burgenland', name: 'Burgenland' },
  { id: 'kaernten', name: 'Kärnten' },
  { id: 'niederoesterreich', name: 'Niederösterreich' },
  { id: 'oberoesterreich', name: 'Oberösterreich' },
  { id: 'salzburg', name: 'Salzburg' },
  { id: 'steiermark', name: 'Steiermark' },
  { id: 'tirol', name: 'Tirol' },
  { id: 'vorarlberg', name: 'Vorarlberg' },
  { id: 'wien', name: 'Wien' },
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
