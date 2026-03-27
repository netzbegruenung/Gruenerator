import * as cheerio from 'cheerio';

import { createLogger } from '../../utils/logger.js';
import redisClient from '../../utils/redis/client.js';

import type { PollData, PollResult } from './PollScraper.js';

const log = createLogger('PolitPro');

const SITE_URL = 'https://politpro.eu/de';
const API_URL = 'https://politpro.eu/de/data';
const CACHE_TTL = 6 * 60 * 60;
const FETCH_TIMEOUT = 15000;

interface PolitProDataset {
  name: string;
  slug: string;
  color: string;
  font_color: string;
  development: Array<{ x: string; y: number }>;
}

interface PolitProResponse {
  success: boolean;
  data: {
    parliament: string;
    start: string;
    end: string;
    datasets: PolitProDataset[];
  };
}

const PARTY_NAME_MAP: Record<string, string> = {
  'CDU/CSU': 'CDU/CSU',
  AfD: 'AfD',
  SPD: 'SPD',
  Grüne: 'GRÜNE',
  Linke: 'DIE LINKE',
  BSW: 'BSW',
  FDP: 'FDP',
};

async function fetchPolitPro(parliament: string, year: number): Promise<PolitProResponse | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(`${API_URL}/${parliament}/development/${year}/${year}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      log.error(`PolitPro API error (${parliament}): ${response.status}`);
      return null;
    }

    const data = (await response.json()) as PolitProResponse;
    if (!data.success) {
      log.error(`PolitPro returned success=false for ${parliament}`);
      return null;
    }

    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      log.error(`PolitPro timeout (${parliament})`);
    } else {
      log.error(`PolitPro fetch failed (${parliament}): ${error}`);
    }
    return null;
  }
}

function toPollData(data: PolitProResponse, parliament: string): PollData {
  const latest: Record<string, number> = {};

  for (const ds of data.data.datasets) {
    const partyName = PARTY_NAME_MAP[ds.name] || ds.name;
    const lastPoint = ds.development[ds.development.length - 1];
    if (lastPoint) {
      latest[partyName] = lastPoint.y;
    }
  }

  const lastDate = data.data.datasets[0]?.development.slice(-1)[0]?.x || '';

  const poll: PollResult = {
    institute: `PolitPro (${parliament})`,
    date: lastDate,
    parties: latest,
  };

  return {
    polls: [poll],
    lastElection: null,
    average: latest,
    scrapedAt: new Date().toISOString(),
  };
}

export interface PolitProPollData extends PollData {
  source: 'politpro';
  parliament: string;
  trend: Record<string, Array<{ date: string; value: number }>>;
}

function toExtendedPollData(
  data: PolitProResponse,
  parliament: string,
  institutePolls?: PollResult[]
): PolitProPollData {
  const base = toPollData(data, parliament);

  const trend: Record<string, Array<{ date: string; value: number }>> = {};
  for (const ds of data.data.datasets) {
    const partyName = PARTY_NAME_MAP[ds.name] || ds.name;
    trend[partyName] = ds.development.map((d) => ({ date: d.x, value: d.y }));
  }

  const useInstitutePolls = institutePolls && institutePolls.length > 0;
  log.info(
    `[toExtendedPollData] Branch: ${useInstitutePolls ? `institutePolls (${institutePolls!.length})` : `base.polls (${base.polls.length})`}`
  );

  return {
    ...base,
    polls: useInstitutePolls ? institutePolls! : base.polls,
    source: 'politpro',
    parliament: data.data.parliament,
    trend,
  };
}

async function scrapeInstitutePolls(parliament: string): Promise<PollResult[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(`${SITE_URL}/${parliament}`, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Gruenerator-Monitor/1.0',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      log.warn(`[scrapeInstitutePolls] HTTP ${response.status} for ${parliament}`);
      return [];
    }

    const html = await response.text();
    log.info(`[scrapeInstitutePolls] HTML response length: ${html.length} chars for ${parliament}`);

    const $ = cheerio.load(html);
    const pollListItems = $('.poll-list-item');
    log.info(`[scrapeInstitutePolls] Found ${pollListItems.length} .poll-list-item elements`);

    if (pollListItems.length === 0) {
      log.warn(
        `[scrapeInstitutePolls] No .poll-list-item elements found — HTML snippet (first 500 chars): ${html.slice(0, 500)}`
      );
    }

    const polls: PollResult[] = [];

    $('.poll-list-item').each((_, el) => {
      const institute = $(el).find('.poll-list-item-header-institute').text().trim();
      const date = $(el).find('.poll-list-item-header-date').text().trim();
      if (!institute) return;

      const parties: Record<string, number | null> = {};
      $(el)
        .find('.horizontal-parties-list-item')
        .each((_, partyEl) => {
          const name = $(partyEl).attr('title');
          const val = $(partyEl).find('.list-horizontal-value').text().trim();
          if (name && val) {
            const partyName = PARTY_NAME_MAP[name] || name;
            parties[partyName] = parseFloat(val) || null;
          }
        });

      polls.push({ institute, date, parties });
    });

    log.info(`[scrapeInstitutePolls] Parsed ${polls.length} institute polls for ${parliament}`);
    if (polls.length > 0) {
      log.info(
        `[scrapeInstitutePolls] First 2 polls:`,
        polls
          .slice(0, 2)
          .map((p) => ({
            institute: p.institute,
            date: p.date,
            partyCount: Object.keys(p.parties).length,
          }))
      );
    } else {
      log.warn(
        `[scrapeInstitutePolls] 0 institute polls parsed despite ${pollListItems.length} DOM elements`
      );
    }
    return polls;
  } catch (error) {
    log.error(`PolitPro scrape failed (${parliament}): ${error}`);
    return [];
  }
}

export async function getPolitProPolls(
  parliament = 'deutschland'
): Promise<PolitProPollData | null> {
  if (!VALID_PARLIAMENT_IDS.has(parliament)) {
    log.warn(`[getPolitProPolls] Invalid parliament ID: ${parliament}`);
    return null;
  }

  const cacheKey = `monitor:politpro:${parliament}`;

  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as PolitProPollData;
      log.info(
        `[getPolitProPolls] Cache hit (${parliament}): ${parsed.polls.length} polls, first poll date: ${parsed.polls[0]?.date ?? 'none'}, institute: ${parsed.polls[0]?.institute ?? 'none'}`
      );
      return parsed;
    }
  } catch {
    // Fall through
  }

  const year = new Date().getFullYear();
  const [data, institutePolls] = await Promise.all([
    fetchPolitPro(parliament, year),
    scrapeInstitutePolls(parliament),
  ]);
  if (!data) return null;

  log.info(`[getPolitProPolls] Institute polls found: ${institutePolls.length} for ${parliament}`);
  if (institutePolls.length === 0) {
    log.warn(
      `[getPolitProPolls] No institute polls scraped — will fall back to API interpolated data`
    );
  }

  const result = toExtendedPollData(data, parliament, institutePolls);

  log.info(
    `[getPolitProPolls] Final result (${parliament}): ${result.polls.length} polls, ${Object.keys(result.average).length} parties`
  );

  try {
    await redisClient.set(cacheKey, JSON.stringify(result), { EX: CACHE_TTL });
  } catch {
    // Non-critical
  }

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
