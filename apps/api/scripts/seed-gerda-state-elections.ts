/**
 * seed-gerda-state-elections.ts
 *
 * Populates the `monitor_state_elections` table for the Monitor "Bundesländer" tab.
 *
 * Downloads the GERDA state-election dataset (Landtagswahlen, harmonised to 2025
 * boundaries, municipality level), aggregates the MOST RECENT Landtag election per
 * Bundesland into a vote-weighted per-state party result, and UPSERTs the 16 rows
 * via Drizzle. Re-run after each Landtagswahl / GERDA data update (idempotent).
 *
 * Source (same repo the Monitor already uses for the Meinungsbild data):
 *   https://github.com/awiedem/german_election_data  (GERDA)
 *   data/state_elections/final/state_harm_25.csv
 *
 * Cite: Heddesheimer, V., Hilbig, H., Sichart, F. & Wiedemann, A. (2025).
 *   GERDA: German Election Database. Nature: Scientific Data, 12: 618.
 *
 * Usage (requires a reachable Postgres; the backend's migrations create the table):
 *   npx tsx apps/api/scripts/seed-gerda-state-elections.ts
 */

import * as dotenv from 'dotenv';

dotenv.config();

const CSV_URL =
  'https://github.com/awiedem/german_election_data/raw/refs/heads/main/data/state_elections/final/state_harm_25.csv';

// ── State metadata: GERDA state code (AGS prefix 01–16) → German name + PolitPro id ──
// politProId matches the LAENDER ids used by the poll endpoint; state_code matches
// the Meinungsbild estimates `state_code`. Keeps the three data sources joinable.
const STATE_META: Record<string, { nameDe: string; politProId: string; short: string }> = {
  '01': { nameDe: 'Schleswig-Holstein', politProId: 'schleswig-holstein', short: 'SH' },
  '02': { nameDe: 'Hamburg', politProId: 'hamburg', short: 'HH' },
  '03': { nameDe: 'Niedersachsen', politProId: 'niedersachsen', short: 'NI' },
  '04': { nameDe: 'Bremen', politProId: 'bremen', short: 'HB' },
  '05': { nameDe: 'Nordrhein-Westfalen', politProId: 'nordrhein-westfalen', short: 'NW' },
  '06': { nameDe: 'Hessen', politProId: 'hessen', short: 'HE' },
  '07': { nameDe: 'Rheinland-Pfalz', politProId: 'rheinland-pfalz', short: 'RP' },
  '08': { nameDe: 'Baden-Württemberg', politProId: 'baden-wuerttemberg', short: 'BW' },
  '09': { nameDe: 'Bayern', politProId: 'bayern', short: 'BY' },
  '10': { nameDe: 'Saarland', politProId: 'saarland', short: 'SL' },
  '11': { nameDe: 'Berlin', politProId: 'berlin', short: 'BE' },
  '12': { nameDe: 'Brandenburg', politProId: 'brandenburg', short: 'BB' },
  '13': { nameDe: 'Mecklenburg-Vorpommern', politProId: 'mecklenburg-vorpommern', short: 'MV' },
  '14': { nameDe: 'Sachsen', politProId: 'sachsen', short: 'SN' },
  '15': { nameDe: 'Sachsen-Anhalt', politProId: 'sachsen-anhalt', short: 'ST' },
  '16': { nameDe: 'Thüringen', politProId: 'thueringen', short: 'TH' },
};

// Non-party columns: structural fields, turnout flags, derived aggregates and
// municipality covariates. Everything else in a row is treated as a party share.
// `other` (GERDA's residual) is handled separately and folded into "Sonstige".
const META_COLS = new Set([
  'ags',
  'election_year',
  'election_date',
  'state',
  'state_name',
  'eligible_voters',
  'number_voters',
  'valid_votes',
  'invalid_votes',
  'turnout',
  'cdu_csu', // derived combined column — would double-count cdu + csu
  'far_right',
  'far_left',
  'far_left_w_linke',
  'total_vote_share',
  'perc_total_votes_incongruence',
  'pop',
  'area_ags',
  'population_ags',
  'employees_ags',
  'pop_density_ags',
]);

const isMetaCol = (c: string): boolean =>
  META_COLS.has(c) || c === 'other' || c.startsWith('flag_') || c.endsWith('_ags');

// Alias groups → canonical display name. Spelling/historical variants of the same
// party are summed. Columns not listed keep their own (prettified) key.
const PARTY_ALIASES: Record<string, string> = {
  cdu: 'CDU',
  csu: 'CSU',
  spd: 'SPD',
  fdp: 'FDP',
  afd: 'AfD',
  gruene: 'Grüne',
  b90_gr: 'Grüne',
  bue90_gruene: 'Grüne',
  buendnis_90: 'Grüne',
  grue_nf: 'Grüne',
  linke_pds: 'Die Linke',
  pds: 'Die Linke',
  bsw: 'BSW',
  freie_wahler: 'Freie Wähler',
  freiewaehler: 'Freie Wähler',
  fr_waehler: 'Freie Wähler',
  ssw: 'SSW',
  die_partei: 'Die PARTEI',
  npd: 'NPD/Die Heimat',
  die_heimat_heimat: 'NPD/Die Heimat',
  piraten: 'Piraten',
  volt: 'Volt',
  diebasis: 'dieBasis',
  tier_schutz_partei: 'Tierschutzpartei',
  tierschutz: 'Tierschutzpartei',
  odp: 'ÖDP',
  werteunion: 'WerteUnion',
  bayernpartei_bp: 'Bayernpartei',
  rep: 'REP',
};

// Below this vote share a party is folded into "Sonstige".
const DISPLAY_THRESHOLD = 0.01;

function prettifyKey(key: string): string {
  return key
    .split('_')
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Minimal RFC-4180-ish CSV parser handling quoted fields with embedded commas. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

interface StateAcc {
  electionYear: number;
  electionDate: string;
  totalValid: number;
  totalEligible: number;
  totalVoters: number;
  shares: Record<string, number>; // weighted: Σ(share · valid_votes)
  otherWeighted: number; // GERDA residual, folded into "Sonstige"
}

interface AggregatedState {
  stateCode: string;
  stateName: string;
  politProId: string;
  short: string;
  electionYear: number;
  electionDate: string | null;
  turnout: number | null;
  results: Record<string, number>;
}

async function aggregate(): Promise<AggregatedState[]> {
  console.log(`Downloading ${CSV_URL} ...`);
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const text = await res.text();
  console.log(`Downloaded ${(text.length / 1e6).toFixed(1)} MB`);

  const lines = text.split('\n');
  const header = parseCsvLine(lines[0]);
  const idx = (name: string) => header.indexOf(name);
  const iState = idx('state');
  const iYear = idx('election_year');
  const iDate = idx('election_date');
  const iValid = idx('valid_votes');
  const iEligible = idx('eligible_voters');
  const iVoters = idx('number_voters');
  const iOther = idx('other');

  const partyCols = header
    .map((name, i) => ({ name, i }))
    .filter((c) => c.name && !isMetaCol(c.name));

  // Pass 1: latest election year per state.
  const maxYear: Record<string, number> = {};
  for (let r = 1; r < lines.length; r++) {
    const line = lines[r];
    if (!line) continue;
    const row = parseCsvLine(line);
    const state = row[iState];
    const yearStr = row[iYear];
    if (!state || !STATE_META[state] || !yearStr) continue;
    const year = Math.round(parseFloat(yearStr));
    if (!Number.isFinite(year)) continue;
    if (year > (maxYear[state] ?? 0)) maxYear[state] = year;
  }

  // Pass 2: aggregate the latest election per state, vote-weighted.
  const acc: Record<string, StateAcc> = {};
  for (let r = 1; r < lines.length; r++) {
    const line = lines[r];
    if (!line) continue;
    const row = parseCsvLine(line);
    const state = row[iState];
    if (!state || !STATE_META[state]) continue;
    const year = Math.round(parseFloat(row[iYear]));
    if (year !== maxYear[state]) continue;
    const valid = parseFloat(row[iValid]);
    if (!Number.isFinite(valid) || valid <= 0) continue;

    const a =
      acc[state] ??
      (acc[state] = {
        electionYear: year,
        electionDate: row[iDate] || '',
        totalValid: 0,
        totalEligible: 0,
        totalVoters: 0,
        shares: {},
        otherWeighted: 0,
      });
    a.totalValid += valid;
    const eligible = parseFloat(row[iEligible]);
    const voters = parseFloat(row[iVoters]);
    if (Number.isFinite(eligible)) a.totalEligible += eligible;
    if (Number.isFinite(voters)) a.totalVoters += voters;
    if (!a.electionDate && row[iDate]) a.electionDate = row[iDate];

    if (iOther >= 0) {
      const o = parseFloat(row[iOther]);
      if (Number.isFinite(o) && o > 0) a.otherWeighted += o * valid;
    }

    for (const { name, i } of partyCols) {
      const v = parseFloat(row[i]);
      if (!Number.isFinite(v) || v <= 0) continue;
      a.shares[name] = (a.shares[name] ?? 0) + v * valid;
    }
  }

  // Finalise: weighted shares, alias-grouping, threshold → Sonstige.
  const out: AggregatedState[] = [];
  for (const code of Object.keys(STATE_META).sort()) {
    const a = acc[code];
    const meta = STATE_META[code];
    if (!a) {
      console.warn(`No data aggregated for ${code} ${meta.nameDe}`);
      continue;
    }
    const grouped: Record<string, number> = {};
    for (const [col, weighted] of Object.entries(a.shares)) {
      const share = weighted / a.totalValid;
      if (share <= 0 || share > 1.2) continue; // drop covariate leftovers
      const label = PARTY_ALIASES[col] ?? prettifyKey(col);
      grouped[label] = (grouped[label] ?? 0) + share;
    }

    const results: Record<string, number> = {};
    let sonstige = a.otherWeighted / a.totalValid;
    for (const [label, share] of Object.entries(grouped)) {
      if (share >= DISPLAY_THRESHOLD) results[label] = Math.round(share * 10000) / 10000;
      else sonstige += share;
    }
    if (sonstige > 0) results['Sonstige'] = Math.round(sonstige * 10000) / 10000;

    const turnout =
      a.totalEligible > 0 ? Math.round((a.totalVoters / a.totalEligible) * 10000) / 10000 : null;

    out.push({
      stateCode: code,
      stateName: meta.nameDe,
      politProId: meta.politProId,
      short: meta.short,
      electionYear: a.electionYear,
      electionDate: a.electionDate || null,
      turnout,
      results,
    });

    const sum = Object.values(results).reduce((s, v) => s + v, 0);
    console.log(
      `${code} ${meta.nameDe.padEnd(24)} ${a.electionYear}  parties=${Object.keys(results).length}  Σ=${(sum * 100).toFixed(1)}%`
    );
  }
  return out;
}

async function main(): Promise<void> {
  const states = await aggregate();
  if (states.length === 0) throw new Error('Aggregation produced no states — aborting.');

  // Dynamic imports so the heavy DB/env modules load only when actually seeding.
  const { getPostgresInstance } = await import('../database/services/PostgresService.js');
  const { getDrizzleInstance } = await import('../database/services/DrizzleService.js');
  const { monitorStateElections } = await import('../database/schema/monitor.js');
  const { sql } = await import('drizzle-orm');

  console.log('\nConnecting to Postgres + running migrations ...');
  await getPostgresInstance().init();
  const db = getDrizzleInstance();

  await db
    .insert(monitorStateElections)
    .values(
      states.map((s) => ({
        state_code: s.stateCode,
        state_name: s.stateName,
        polit_pro_id: s.politProId,
        short: s.short,
        election_year: s.electionYear,
        election_date: s.electionDate,
        turnout: s.turnout,
        results: s.results,
      }))
    )
    .onConflictDoUpdate({
      target: monitorStateElections.state_code,
      set: {
        state_name: sql`EXCLUDED.state_name`,
        polit_pro_id: sql`EXCLUDED.polit_pro_id`,
        short: sql`EXCLUDED.short`,
        election_year: sql`EXCLUDED.election_year`,
        election_date: sql`EXCLUDED.election_date`,
        turnout: sql`EXCLUDED.turnout`,
        results: sql`EXCLUDED.results`,
        updated_at: sql`now()`,
      },
    });

  console.log(`\nUpserted ${states.length} states into monitor_state_elections.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
