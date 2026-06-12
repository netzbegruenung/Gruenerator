import { stateElectionsResponseSchema } from '@gruenerator/contracts';
import { desc } from 'drizzle-orm';

import { monitorStateElections } from '../../database/schema/monitor.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { createLogger } from '../../utils/logger.js';
import { getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';

import { getMeinungsbild } from './MeinungsbildService.js';
import { getPolitProPolls } from './PolitProService.js';

import type { StateElectionResult, StateElectionsData } from './types.js';

const log = createLogger('StateElections');

const CACHE_KEY = 'monitor:state-elections';
const CACHE_TTL = 24 * 60 * 60;

const SOURCE = 'GERDA: German Election Database (Heddesheimer, Hilbig, Sichart & Wiedemann, 2025)';
const CITATION =
  'Heddesheimer, V., Hilbig, H., Sichart, F. & Wiedemann, A. (2025). GERDA: German Election Database. Nature: Scientific Data, 12: 618.';
const ELECTION_TYPE = 'Landtagswahl';

/**
 * Latest Landtagswahl result per Bundesland (GERDA, vote-weighted to state level).
 * Read from the `monitor_state_elections` table seeded by
 * `scripts/seed-gerda-state-elections.ts`. Cached in Redis.
 */
export async function getStateElections(): Promise<StateElectionsData | null> {
  const cached = await getCachedJson(CACHE_KEY, stateElectionsResponseSchema);
  if (cached) {
    log.info('Cache hit');
    return cached;
  }

  let rows;
  try {
    rows = await getDrizzleInstance()
      .select()
      .from(monitorStateElections)
      .orderBy(desc(monitorStateElections.updated_at));
  } catch (error) {
    log.error(`DB read failed: ${error}`);
    return null;
  }

  if (rows.length === 0) {
    log.warn('No state-election rows — run scripts/seed-gerda-state-elections.ts');
    return null;
  }

  const states: Record<string, StateElectionResult> = {};
  let latest = '';
  for (const row of rows) {
    states[row.state_code] = {
      stateCode: row.state_code,
      stateName: row.state_name,
      politProId: row.polit_pro_id,
      short: row.short,
      electionYear: row.election_year,
      electionDate: row.election_date,
      turnout: row.turnout,
      results: row.results,
    };
    if (row.updated_at > latest) latest = row.updated_at;
  }

  const data: StateElectionsData = {
    source: SOURCE,
    citation: CITATION,
    electionType: ELECTION_TYPE,
    fetchedAt: latest || new Date().toISOString(),
    states,
  };

  await setCachedJson(CACHE_KEY, data, CACHE_TTL);

  return data;
}

/**
 * Resolve a free-text Bundesland query (name, short code or PolitPro id) to its
 * election result. Used by the AI Bundesland-lookup tool.
 */
export async function findStateElection(query: string): Promise<StateElectionResult | null> {
  const data = await getStateElections();
  if (!data) return null;

  const q = query.trim().toLowerCase();
  if (!q) return null;

  const all = Object.values(data.states);
  return (
    all.find((s) => s.stateName.toLowerCase() === q) ??
    all.find((s) => s.short.toLowerCase() === q || s.politProId === q) ??
    all.find(
      (s) => s.stateName.toLowerCase().includes(q) || q.includes(s.stateName.toLowerCase())
    ) ??
    null
  );
}

function formatShares(record: Record<string, number>, limit = 8): string {
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([party, share]) => `${party} ${(share * 100).toFixed(1)}%`)
    .join(', ');
}

/**
 * Combine everything the Monitor knows about one Bundesland into a single chat
 * context block: latest Landtagswahl result, current Sonntagsfrage, and the
 * Meinungsbild (MRP) topic ranking for that state. Used by the AI lookup tool.
 */
export async function lookupBundeslandProfile(query: string): Promise<string | null> {
  const state = await findStateElection(query);
  if (!state) return null;

  const parts: string[] = [`Bundesland: ${state.stateName}`];

  // Landtagswahl
  const lt = [
    `Letzte Landtagswahl (${state.electionYear}${state.electionDate ? `, ${state.electionDate}` : ''}):`,
    `  ${formatShares(state.results, 10)}`,
  ];
  if (state.turnout != null) lt.push(`  Wahlbeteiligung: ${(state.turnout * 100).toFixed(1)}%`);
  parts.push(lt.join('\n'));

  // Sonntagsfrage (PolitPro)
  try {
    const polls = await getPolitProPolls(state.politProId);
    if (polls && Object.keys(polls.average).length > 0) {
      parts.push(`Aktuelle Sonntagsfrage:\n  ${formatShares(polls.average, 8)}`);
    }
  } catch {
    // Polls are optional context.
  }

  // Meinungsbild (MRP) — topic ranking for this state
  try {
    const mb = await getMeinungsbild();
    if (mb) {
      const ranked = mb.issues
        .map((issue) => {
          const est = mb.estimates[issue.id]?.find((e) => e.state_code === state.stateCode);
          return est ? { label: issue.label_de, estimate: est.estimate } : null;
        })
        .filter((x): x is { label: string; estimate: number } => x !== null)
        .sort((a, b) => b.estimate - a.estimate);

      if (ranked.length > 0) {
        const top = ranked.slice(0, 5);
        const bottom = ranked.slice(-5).reverse();
        parts.push(
          [
            `Meinungsbild ${state.stateName} (MRP-Schätzung, Anteil Zustimmung):`,
            `  Höchste Zustimmung: ${top.map((t) => `${t.label} ${(t.estimate * 100).toFixed(0)}%`).join(', ')}`,
            `  Niedrigste Zustimmung: ${bottom.map((t) => `${t.label} ${(t.estimate * 100).toFixed(0)}%`).join(', ')}`,
          ].join('\n')
        );
      }
    }
  } catch {
    // Meinungsbild is optional context.
  }

  return (
    parts.join('\n\n') +
    '\n\nQuelle: GERDA — German Election Database (Heddesheimer, Hilbig, Sichart & Wiedemann, 2025), ' +
    'Landtagswahlergebnisse & MRP-Meinungsbild; Sonntagsfrage via PolitPro.'
  );
}
