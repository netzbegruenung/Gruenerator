import { createLogger } from '../../utils/logger.js';
import redisClient from '../../utils/redis/client.js';

import type { MeinungsbildData, MeinungsbildEstimate, MeinungsbildIssue } from './types.js';

const log = createLogger('Meinungsbild');

const BASE_URL =
  'https://raw.githubusercontent.com/awiedem/german_election_data/main/meinungsbild/web/public/data';
const CACHE_KEY = 'monitor:meinungsbild';
const CACHE_TTL = 24 * 60 * 60;
const FETCH_TIMEOUT = 15000;

interface RawIssue {
  issue_id: string;
  label_de: string;
  category: string;
  question_de: string;
  direction: string;
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(`${BASE_URL}/${path}`, {
      headers: { 'User-Agent': 'Gruenerator-Monitor/1.0' },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      log.error(`Fetch failed for ${path}: HTTP ${response.status}`);
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      log.error(`Fetch timeout for ${path}`);
    } else {
      log.error(`Fetch error for ${path}: ${error}`);
    }
    return null;
  }
}

function transformData(
  rawIssues: RawIssue[],
  rawEstimates: Record<
    string,
    Array<{ state_code: string; state_name: string; estimate: number; pop: number }>
  >
): MeinungsbildData {
  const estimateKeys = new Set(Object.keys(rawEstimates));

  const issues: MeinungsbildIssue[] = rawIssues
    .filter((i) => estimateKeys.has(i.issue_id))
    .map((i) => ({
      id: i.issue_id,
      label_de: i.label_de,
      category: i.category,
      question_de: i.question_de,
      direction: i.direction,
    }));

  const estimates: Record<string, MeinungsbildEstimate[]> = {};
  for (const issue of issues) {
    const raw = rawEstimates[issue.id];
    if (raw) {
      estimates[issue.id] = raw.map((e) => ({
        state_code: e.state_code,
        state_name: e.state_name,
        estimate: e.estimate,
        pop: e.pop,
      }));
    }
  }

  return { issues, estimates, fetchedAt: new Date().toISOString() };
}

export async function getMeinungsbild(): Promise<MeinungsbildData | null> {
  try {
    const cached = await redisClient.get(CACHE_KEY);
    if (cached) {
      log.info('Cache hit');
      return JSON.parse(cached) as MeinungsbildData;
    }
  } catch {
    // Fall through
  }

  const [rawIssues, rawEstimates] = await Promise.all([
    fetchJson<RawIssue[]>('issues.json'),
    fetchJson<
      Record<
        string,
        Array<{ state_code: string; state_name: string; estimate: number; pop: number }>
      >
    >('estimates_bundesland.json'),
  ]);

  if (!rawIssues || !rawEstimates) {
    log.error('Failed to fetch meinungsbild data from GitHub');
    return null;
  }

  const data = transformData(rawIssues, rawEstimates);
  log.info(
    `Fetched ${data.issues.length} issues with estimates for ${Object.keys(data.estimates).length} topics`
  );

  try {
    await redisClient.set(CACHE_KEY, JSON.stringify(data), { EX: CACHE_TTL });
  } catch {
    // Non-critical
  }

  return data;
}

/**
 * Find issues matching a freetext query by searching label_de and question_de.
 * Returns matching issues with their Bundesland estimates, formatted for chat context.
 */
export async function lookupMeinungsbildByTopic(topic: string): Promise<string | null> {
  const data = await getMeinungsbild();
  if (!data) return null;

  const query = topic.toLowerCase();
  const words = query.split(/\s+/).filter((w) => w.length > 2);

  const scored = data.issues.map((issue) => {
    const haystack = `${issue.label_de} ${issue.question_de}`.toLowerCase();
    let score = 0;
    for (const word of words) {
      if (haystack.includes(word)) score++;
    }
    if (haystack.includes(query)) score += 3;
    return { issue, score };
  });

  const matches = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (matches.length === 0) return null;

  const parts: string[] = [];
  for (const { issue } of matches) {
    const estimates = data.estimates[issue.id];
    if (!estimates) continue;

    const totalPop = estimates.reduce((sum, e) => sum + e.pop, 0);
    const nationalAvg = estimates.reduce((sum, e) => sum + e.estimate * e.pop, 0) / totalPop;

    const sorted = [...estimates].sort((a, b) => b.estimate - a.estimate);
    const top3 = sorted.slice(0, 3);
    const bottom3 = sorted.slice(-3).reverse();

    const lines = [
      `Thema: ${issue.label_de}`,
      `Frage: „${issue.question_de}"`,
      `Deutschland gesamt: ${(nationalAvg * 100).toFixed(1)}%`,
      `Höchste Zustimmung: ${top3.map((e) => `${e.state_name} ${(e.estimate * 100).toFixed(1)}%`).join(', ')}`,
      `Niedrigste Zustimmung: ${bottom3.map((e) => `${e.state_name} ${(e.estimate * 100).toFixed(1)}%`).join(', ')}`,
      `Richtung: ${issue.direction}`,
    ];
    parts.push(lines.join('\n'));
  }

  return (
    'Meinungsbild Deutschland (MRP-Schätzung basierend auf ~118.000 Befragten)\n' +
    'Quelle: Heddesheimer, Hilbig, Sichart & Wiedemann (2025). GERDA: German Election Database. Nature: Scientific Data, 12: 618.\n\n' +
    parts.join('\n\n---\n\n')
  );
}
