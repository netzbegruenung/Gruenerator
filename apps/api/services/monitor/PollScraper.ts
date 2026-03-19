/**
 * Poll Scraper — Sonntagsfrage from wahlrecht.de
 * Scrapes the latest federal election poll data from all major institutes.
 * Cached for 6 hours (polls update weekly).
 */

import { createLogger } from '../../utils/logger.js';
import redisClient from '../../utils/redis/client.js';
import { urlCrawler } from '../scrapers/implementations/UrlCrawler/index.js';

const log = createLogger('PollScraper');

const POLL_URL = 'https://www.wahlrecht.de/umfragen/';
const CACHE_KEY = 'monitor:polls';
const CACHE_TTL = 6 * 60 * 60; // 6 hours

export interface PollResult {
  institute: string;
  date: string;
  parties: Record<string, number | null>;
}

export interface PollData {
  polls: PollResult[];
  lastElection: PollResult | null;
  average: Record<string, number>;
  scrapedAt: string;
}

const PARTY_ROW_NAMES = ['CDU/CSU', 'AfD', 'SPD', 'GRÜNE', 'DIE LINKE', 'BSW', 'FDP', 'Sonstige'];

function parsePercentage(text: string): number | null {
  const cleaned = text
    .replace(/&ndash;/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[^0-9,.]/g, '')
    .replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&\w+;/g, '')
    .replace(/&#\d+;/g, '')
    .trim();
}

function parsePollTable(html: string): PollData {
  // Find the wilko table
  const tableStart = html.indexOf('<table class="wilko">');
  const tableEnd = html.indexOf('</table>', tableStart);
  if (tableStart === -1 || tableEnd === -1) {
    log.warn('Could not find wilko table');
    return { polls: [], lastElection: null, average: {}, scrapedAt: new Date().toISOString() };
  }

  const table = html.slice(tableStart, tableEnd);

  // Extract rows
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  const rows: string[][] = [];
  let match;
  while ((match = rowPattern.exec(table)) !== null) {
    const cellPattern = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g;
    const cells: string[] = [];
    let cellMatch;
    while ((cellMatch = cellPattern.exec(match[1])) !== null) {
      cells.push(cellMatch[1]);
    }
    rows.push(cells);
  }

  if (rows.length < 3) {
    log.warn(`Only ${rows.length} rows found in table`);
    return { polls: [], lastElection: null, average: {}, scrapedAt: new Date().toISOString() };
  }

  // Row 0: Institute names, Row 1: Dates, Rows 2-9: Party data
  const instituteRow = rows[0].map(stripHtml);
  const dateRow = rows[1].map(stripHtml);

  // Build institute list (skip empty columns and first column)
  const institutes: Array<{ name: string; date: string; colIdx: number }> = [];
  for (let i = 1; i < instituteRow.length; i++) {
    const name = instituteRow[i];
    if (!name || name.length < 2) continue;
    institutes.push({
      name: name.replace(/\s+/g, ' '),
      date: dateRow[i] || '',
      colIdx: i,
    });
  }

  // Parse party data
  const pollMap = new Map<string, PollResult>();
  for (const inst of institutes) {
    pollMap.set(inst.name, {
      institute: inst.name,
      date: inst.date,
      parties: {},
    });
  }

  for (const partyName of PARTY_ROW_NAMES) {
    const partyRow = rows.find((row) => {
      const first = stripHtml(row[0] || '');
      return first === partyName;
    });
    if (!partyRow) continue;

    for (const inst of institutes) {
      const cellContent = partyRow[inst.colIdx] || '';
      const value = parsePercentage(cellContent);
      const poll = pollMap.get(inst.name);
      if (poll) {
        poll.parties[partyName] = value;
      }
    }
  }

  const allPolls = [...pollMap.values()];

  // Separate Bundestagswahl from regular polls
  const btwIdx = allPolls.findIndex(
    (p) =>
      p.institute.toLowerCase().includes('bundes') && p.institute.toLowerCase().includes('tagswahl')
  );
  let lastElection: PollResult | null = null;
  if (btwIdx >= 0) {
    lastElection = allPolls.splice(btwIdx, 1)[0];
  }

  // Compute averages from institute polls (not Bundestagswahl)
  const average: Record<string, number> = {};
  for (const party of PARTY_ROW_NAMES) {
    const values = allPolls
      .map((p) => p.parties[party])
      .filter((v): v is number => v !== null && v > 0);
    if (values.length > 0) {
      average[party] = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
    }
  }

  return {
    polls: allPolls,
    lastElection,
    average,
    scrapedAt: new Date().toISOString(),
  };
}

export async function getPolls(): Promise<PollData> {
  // Check cache
  try {
    const cached = await redisClient.get(CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch {
    // Fall through
  }

  log.info('Scraping wahlrecht.de for Sonntagsfrage...');

  try {
    const result = await urlCrawler.fetchUrl(POLL_URL, { timeout: 15000 });
    const data = parsePollTable(result.html);

    log.info(
      `Scraped ${data.polls.length} institute polls, average Grüne: ${data.average['GRÜNE'] ?? '?'}%`
    );

    // Cache
    try {
      await redisClient.set(CACHE_KEY, JSON.stringify(data), { EX: CACHE_TTL });
    } catch {
      // Non-critical
    }

    return data;
  } catch (error) {
    log.error(`Poll scraping failed: ${error}`);
    return { polls: [], lastElection: null, average: {}, scrapedAt: new Date().toISOString() };
  }
}
