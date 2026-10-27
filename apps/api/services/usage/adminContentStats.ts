/**
 * Instance-admin statistics: how much was created on this deployment, per kind
 * and time bucket. Counts only — no user id, no row, no content.
 *
 * Two sources (see packages/contracts/src/schemas/adminStats.ts):
 *  - `live` counts the content tables, back to their first row, but only rows
 *    that still exist. Like "Deine Werke" (userActivityStats.ts) it reads
 *    trashed rows ON PURPOSE — the view says "created", and a count reveals no
 *    content. The file is allowlisted in services/trash/trashReaders.vitest.ts
 *    for that; keep any reader that returns rows out of it.
 *  - `counter` reads `platform_creation_daily`, tallied by triggers at insert
 *    time (migrations/zz_20261026_platform_creation_daily.sql).
 *
 * Anonymity. `user_id` is collapsed in SQL; the per-user rows never reach
 * JavaScript (notebooks are the exception, their owner ids pass through
 * `notebookSource` on their way into SQL). The unfiltered view publishes plain
 * sums. A country view additionally suppresses every cell behind fewer than
 * MIN_GROUP_SIZE people — and more than that, because the unfiltered view is
 * published next to it and anyone can subtract:
 *
 *  - Per bucket, a kind is a small table: subtypes × countries, closed by the
 *    per-country totals. Its row sums (the unfiltered per-subtype figures) are
 *    public, its column sums are the per-country totals.
 *  - Along each line, the hidden cells together must stand for at least
 *    MIN_GROUP_SIZE people, or another cell is hidden too (`protectLine`).
 *    Countries are disjoint, so their people add up; one person can create
 *    several subtypes, so across subtypes only the largest hidden cell is a safe
 *    lower bound for the people behind them.
 *  - The table only protects anything on one fixed grid. A day cell hidden
 *    inside a published month would be "month minus the other days". So a
 *    country view is month-only, and its window is snapped to whole months; the
 *    router enforces both.
 *
 * In `counter` there is no user id to count people with, so there the
 * threshold applies to the number of items instead.
 */
import { adminStatsKindSchema, getAdminStatsResponseSchema } from '@gruenerator/contracts';

import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import { getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';

import { MIN_GROUP_SIZE } from './platformUsageStats.js';

import type {
  AdminStatsBucket,
  AdminStatsKind,
  AdminStatsLocale,
  AdminStatsPoint,
  AdminStatsSeries,
  GetAdminStatsResponseDto,
} from '@gruenerator/contracts';

const log = createLogger('adminContentStats');

const CACHE_TTL_SECONDS = 15 * 60;
const CACHE_KEY_PREFIX = 'admin:stats:v1';
const TIME_ZONE = 'Europe/Berlin';

/** The segments a country view can pick; `all` is their sum. */
const SEGMENTS = ['de', 'at', 'unknown'] as const;
type Segment = (typeof SEGMENTS)[number];

/** Kinds whose subtype is worth a breakdown; the rest carry `''`. */
const SUBTYPED_KINDS: ReadonlySet<AdminStatsKind> = new Set([
  'chats',
  'documents',
  'designs',
  'text_generations',
  'recipes',
  'templates',
]);

/**
 * One SELECT per kind, each yielding (ts, subtype, owner). Full statements
 * rather than fragments so the trash scanner sees every table read here.
 * Subtype defaults match the triggers', so `live` and `counter` line up.
 */
const LIVE_SOURCES: Record<Exclude<AdminStatsKind, 'notebooks'>, string> = {
  active_users: `SELECT (day::timestamp AT TIME ZONE '${TIME_ZONE}') AS ts, '' AS subtype, user_id AS owner FROM user_usage_daily`,
  signups: `SELECT created_at AS ts, '' AS subtype, id AS owner FROM profiles`,
  chats: `SELECT created_at AS ts, coalesce(thread_type, 'chat') AS subtype, user_id AS owner FROM chat_threads`,
  chat_messages: `SELECT created_at AS ts, '' AS subtype, user_id AS owner FROM chat_messages WHERE role = 'user'`,
  documents: `SELECT created_at AS ts, coalesce(document_subtype, 'docs') AS subtype, created_by AS owner
      FROM collaborative_documents WHERE coalesce(document_subtype, 'docs') <> 'canvas'`,
  designs: `SELECT d.created_at AS ts, c.template_type AS subtype, d.created_by AS owner
      FROM canvas_documents c JOIN collaborative_documents d ON d.id = c.document_id`,
  ai_images: `SELECT created_at AS ts, '' AS subtype, user_id AS owner
      FROM shared_media WHERE media_type = 'image' AND content_origin = 'ki'`,
  text_generations: `SELECT created_at AS ts, coalesce(generation_type, 'unbekannt') AS subtype, user_id AS owner FROM generation_logs`,
  reels: `SELECT created_at AS ts, '' AS subtype, user_id AS owner FROM subtitler_projects`,
  podcasts: `SELECT created_at AS ts, '' AS subtype, user_id AS owner FROM podcasts`,
  explainables: `SELECT created_at AS ts, '' AS subtype, user_id AS owner FROM explainables`,
  // user_id is TEXT here; a value that is no uuid counts as an item without a person.
  deep_research: `SELECT started_at AS ts, '' AS subtype,
      CASE WHEN user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN user_id::uuid END AS owner
      FROM deep_research_runs`,
  agents: `SELECT created_at AS ts, '' AS subtype, user_id AS owner FROM user_agents`,
  recipes: `SELECT created_at AS ts, coalesce(kind, 'custom') AS subtype, user_id AS owner FROM user_text_forms`,
  templates: `SELECT created_at AS ts, coalesce(type, 'unbekannt') AS subtype, user_id AS owner FROM user_templates`,
  projects: `SELECT created_at AS ts, '' AS subtype, created_by AS owner FROM groups WHERE NOT coalesce(is_system, false)`,
  project_posts: `SELECT created_at AS ts, '' AS subtype, author_id AS owner FROM group_posts`,
};

/** The owner ids of notebooks enter SQL here and are collapsed there. */
const NOTEBOOK_SOURCE = `SELECT n.ts, '' AS subtype, n.owner FROM unnest($4::timestamptz[], $5::uuid[]) AS n(ts, owner)`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Bucket × subtype × country cells, plus bucket × country totals
 * (`is_total`, subtype NULL) — the latter need their own distinct count, since
 * one person behind several subtypes is still one person.
 * $1 bucket, $2 first day, $3 last day (inclusive, Europe/Berlin).
 */
function censusSql(source: string): string {
  return `
    WITH src AS (${source}),
    tagged AS (
      SELECT to_char(date_trunc($1, src.ts AT TIME ZONE '${TIME_ZONE}'), 'YYYY-MM-DD') AS bucket,
             src.subtype,
             src.owner,
             CASE p.locale WHEN 'de-DE' THEN 'de' WHEN 'de-AT' THEN 'at' ELSE 'unknown' END AS segment
        FROM src
        LEFT JOIN profiles p ON p.id = src.owner
       WHERE src.ts >= ($2::date::timestamp AT TIME ZONE '${TIME_ZONE}')
         AND src.ts < (($3::date + 1)::timestamp AT TIME ZONE '${TIME_ZONE}')
    )
    SELECT bucket, subtype, segment, GROUPING(subtype) = 1 AS is_total,
           count(*)::int AS items, count(DISTINCT owner)::int AS people
      FROM tagged
     GROUP BY GROUPING SETS ((bucket, subtype, segment), (bucket, segment))`;
}

const COUNTER_SQL = `
  SELECT to_char(date_trunc($1, day::timestamp), 'YYYY-MM-DD') AS bucket,
         kind, subtype, locale AS segment, sum(count)::int AS items
    FROM platform_creation_daily
   WHERE day >= $2::date AND day <= $3::date
   GROUP BY 1, 2, 3, 4`;

interface CensusRow {
  bucket: string;
  subtype: string | null;
  segment: Segment;
  is_total: boolean;
  items: number;
  people: number;
}

// ── The suppression grid ─────────────────────────────────────────────────────

export interface Cell {
  items: number;
  /** Who stands behind the cell; the threshold is applied to this. */
  people: number;
  hidden: boolean;
}

/** One kind in one bucket: subtype rows × segment columns, and the column totals. */
export interface Grid {
  rows: Map<string, Record<Segment, Cell>>;
  totals: Record<Segment, Cell>;
}

const emptyCell = (): Cell => ({ items: 0, people: 0, hidden: false });
const emptyRow = (): Record<Segment, Cell> => ({
  de: emptyCell(),
  at: emptyCell(),
  unknown: emptyCell(),
});

/**
 * Keep the hidden cells of one line from being read off its published sum.
 * Returns whether it hid anything, so the caller can iterate to a fixpoint.
 *
 * A line is safe when it hides nothing, or at least two cells that together
 * stand for MIN_GROUP_SIZE people. One hidden cell alone is never safe, however
 * many people it holds: it is the sum minus the rest, and once known it turns
 * into a published cell of every other line it sits in.
 *
 * `union` says how the people of several cells combine: `sum` where they are
 * disjoint, `max` (a lower bound) where one person may sit in several cells.
 * `closer` is the line's own total if it can be hidden (a country total);
 * without one the line sums to a figure that is always public.
 */
function protectLine(cells: Cell[], union: 'sum' | 'max', closer: Cell | null): boolean {
  const hidden = cells.filter((c) => c.hidden);
  if (hidden.length === 0) return false;
  if (closer?.hidden) return false;
  const people = hidden.map((c) => c.people);
  const bound = union === 'sum' ? people.reduce((a, b) => a + b, 0) : Math.max(...people);
  const holdsPeople = hidden.some((c) => c.items > 0);
  if (hidden.length >= 2 && (!holdsPeople || bound >= MIN_GROUP_SIZE)) return false;

  const next =
    cells
      .filter((c) => !c.hidden && c.items > 0)
      .sort((a, b) => a.people - b.people || a.items - b.items)[0] ?? null;
  if (next) {
    next.hidden = true;
    return true;
  }
  if (closer) {
    closer.hidden = true;
    return true;
  }
  // Nothing left to hide but the zeros. Hiding them keeps the public sum from
  // saying which segment the few people are in.
  const zeros = cells.filter((c) => !c.hidden);
  for (const c of zeros) c.hidden = true;
  return zeros.length > 0;
}

/**
 * Mark the cells of one grid that a country view must not publish.
 * `subtypeUnion` is `max` for people (overlapping across subtypes) and `sum`
 * where the measure is items.
 */
export function suppressGrid(grid: Grid, subtypeUnion: 'sum' | 'max'): void {
  const thin = (c: Cell) => c.people > 0 && c.people < MIN_GROUP_SIZE;
  for (const row of [...grid.rows.values(), grid.totals]) {
    for (const s of SEGMENTS) row[s].hidden = thin(row[s]);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const row of [...grid.rows.values(), grid.totals]) {
      changed =
        protectLine(
          SEGMENTS.map((s) => row[s]),
          'sum',
          null
        ) || changed;
    }
    for (const s of SEGMENTS) {
      const column = [...grid.rows.values()].map((row) => row[s]);
      changed = protectLine(column, subtypeUnion, grid.totals[s]) || changed;
    }
  }
}

// ── Windows and buckets ──────────────────────────────────────────────────────

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE });

export function todayInBerlin(): string {
  return dayFormat.format(new Date());
}

const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
const toDay = (date: Date) => date.toISOString().slice(0, 10);

function bucketStart(day: string, bucket: AdminStatsBucket): string {
  const d = toDate(day);
  if (bucket === 'month') d.setUTCDate(1);
  if (bucket === 'week') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return toDay(d);
}

function nextBucket(day: string, bucket: AdminStatsBucket): string {
  const d = toDate(day);
  if (bucket === 'day') d.setUTCDate(d.getUTCDate() + 1);
  if (bucket === 'week') d.setUTCDate(d.getUTCDate() + 7);
  if (bucket === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
  return toDay(d);
}

/** The window snapped outward to whole buckets, and the buckets in it. */
export function snapWindow(
  from: string,
  to: string,
  bucket: AdminStatsBucket
): { from: string; to: string; buckets: string[] } {
  const buckets: string[] = [];
  let cursor = bucketStart(from, bucket);
  while (cursor <= to) {
    buckets.push(cursor);
    cursor = nextBucket(cursor, bucket);
  }
  const end = toDate(cursor);
  end.setUTCDate(end.getUTCDate() - 1);
  return { from: buckets[0] ?? from, to: toDay(end), buckets };
}

// ── Assembly ─────────────────────────────────────────────────────────────────

/** kind → bucket → grid */
type Census = Map<AdminStatsKind, Map<string, Grid>>;

function gridFor(census: Census, kind: AdminStatsKind, bucket: string): Grid {
  const byBucket = census.get(kind) ?? new Map<string, Grid>();
  census.set(kind, byBucket);
  let grid = byBucket.get(bucket);
  if (!grid) {
    grid = { rows: new Map(), totals: emptyRow() };
    byBucket.set(bucket, grid);
  }
  return grid;
}

function addLiveRows(census: Census, kind: AdminStatsKind, rows: CensusRow[]): void {
  const subtyped = SUBTYPED_KINDS.has(kind);
  for (const row of rows) {
    const grid = gridFor(census, kind, row.bucket);
    // A person active on a day is the item for active_users.
    const items = kind === 'active_users' ? row.people : row.items;
    const cell = { items, people: row.people, hidden: false };
    if (row.is_total) {
      grid.totals[row.segment] = cell;
    } else if (subtyped) {
      const key = row.subtype ?? '';
      const target = grid.rows.get(key) ?? emptyRow();
      target[row.segment] = cell;
      grid.rows.set(key, target);
    }
  }
}

function seriesFrom(
  census: Census,
  kind: AdminStatsKind,
  buckets: string[],
  locale: AdminStatsLocale
): { series: AdminStatsSeries; suppressed: number } {
  let suppressed = 0;
  const points = buckets.map((bucket): AdminStatsPoint => {
    const grid = census.get(kind)?.get(bucket);
    if (!grid) return { bucket, total: 0, by_subtype: [] };

    if (locale === 'all') {
      const sum = (row: Record<Segment, Cell>) => SEGMENTS.reduce((a, s) => a + row[s].items, 0);
      return {
        bucket,
        total: sum(grid.totals),
        by_subtype: [...grid.rows]
          .map(([subtype, row]) => ({ subtype, value: sum(row) }))
          .filter((entry) => entry.value > 0)
          .sort((a, b) => b.value - a.value),
      };
    }

    const value = (cell: Cell) => {
      if (cell.hidden) suppressed++;
      return cell.hidden ? null : cell.items;
    };
    return {
      bucket,
      total: value(grid.totals[locale]),
      by_subtype: [...grid.rows]
        .filter(([, row]) => row[locale].items > 0 || row[locale].hidden)
        .map(([subtype, row]) => ({ subtype, value: value(row[locale]) }))
        .sort((a, b) => (b.value ?? -1) - (a.value ?? -1)),
    };
  });
  return { series: { kind, points }, suppressed };
}

async function notebookCensus(
  bucket: AdminStatsBucket,
  from: string,
  to: string
): Promise<CensusRow[] | null> {
  try {
    const stamps = (await new NotebookQdrantHelper().listCreationStamps()).filter((s) =>
      UUID_RE.test(s.userId)
    );
    return await getPostgresInstance().query<CensusRow>(censusSql(NOTEBOOK_SOURCE), [
      bucket,
      from,
      to,
      stamps.map((s) => s.createdAt),
      stamps.map((s) => s.userId),
    ]);
  } catch (error) {
    // Qdrant down is no reason to fail the page; the kind is left out, not zeroed.
    log.warn(`notebook census skipped: ${(error as Error).message}`);
    return null;
  }
}

export interface AdminStatsWindow {
  from: string;
  to: string;
  bucket: AdminStatsBucket;
  locale: AdminStatsLocale;
}

/** Compute the statistics. Prefer `getAdminStats`, which caches this. */
export async function computeAdminStats(
  window: AdminStatsWindow
): Promise<GetAdminStatsResponseDto> {
  const { from, to, buckets } = snapWindow(window.from, window.to, window.bucket);
  const params = [window.bucket, from, to];
  const db = getPostgresInstance();

  const liveKinds = Object.keys(LIVE_SOURCES) as Exclude<AdminStatsKind, 'notebooks'>[];
  const [liveRows, notebookRows, counterRows, sinceRow] = await Promise.all([
    Promise.all(
      liveKinds.map((kind) => db.query<CensusRow>(censusSql(LIVE_SOURCES[kind]), params))
    ),
    notebookCensus(window.bucket, from, to),
    db.query<{ bucket: string; kind: string; subtype: string; segment: Segment; items: number }>(
      COUNTER_SQL,
      params
    ),
    db.queryOne<{ since: string | null }>(
      `SELECT to_char(min(day), 'YYYY-MM-DD') AS since FROM platform_creation_daily`
    ),
  ]);

  const live: Census = new Map();
  liveKinds.forEach((kind, i) => addLiveRows(live, kind, liveRows[i] ?? []));
  if (notebookRows) addLiveRows(live, 'notebooks', notebookRows);

  const counter: Census = new Map();
  const knownKinds = new Set<string>(adminStatsKindSchema.options);
  for (const row of counterRows) {
    if (!knownKinds.has(row.kind)) continue;
    // Boundary cast: the Set membership check IS the runtime assertion.
    const kind = row.kind as AdminStatsKind;
    const grid = gridFor(counter, kind, row.bucket);
    const segment = (SEGMENTS as readonly string[]).includes(row.segment) ? row.segment : 'unknown';
    // No people in the counter: the threshold falls on the items.
    grid.totals[segment].items += row.items;
    grid.totals[segment].people += row.items;
    if (SUBTYPED_KINDS.has(kind)) {
      const target = grid.rows.get(row.subtype) ?? emptyRow();
      target[segment].items += row.items;
      target[segment].people += row.items;
      grid.rows.set(row.subtype, target);
    }
  }

  if (window.locale !== 'all') {
    for (const byBucket of live.values()) for (const g of byBucket.values()) suppressGrid(g, 'max');
    for (const byBucket of counter.values())
      for (const g of byBucket.values()) suppressGrid(g, 'sum');
  }

  let suppressed = 0;
  const collect = (census: Census, kinds: AdminStatsKind[]) =>
    kinds.map((kind) => {
      const result = seriesFrom(census, kind, buckets, window.locale);
      suppressed += result.suppressed;
      return result.series;
    });
  const allKinds = adminStatsKindSchema.options;

  const liveSeries = collect(
    live,
    allKinds.filter((kind) => kind !== 'notebooks' || notebookRows)
  );
  // No trigger can see an active day, so the counter has no active_users.
  const counterSeries = collect(
    counter,
    allKinds.filter((kind) => kind !== 'active_users')
  );

  return {
    success: true,
    bucket: window.bucket,
    locale: window.locale,
    from,
    to,
    generated_at: new Date().toISOString(),
    min_group_size: MIN_GROUP_SIZE,
    suppressed_cells: suppressed,
    live: liveSeries,
    counter: { since: sinceRow?.since ?? null, series: counterSeries },
  };
}

export async function getAdminStats(window: AdminStatsWindow): Promise<GetAdminStatsResponseDto> {
  const key = `${CACHE_KEY_PREFIX}:${window.from}:${window.to}:${window.bucket}:${window.locale}`;
  const cached = await getCachedJson(key, getAdminStatsResponseSchema);
  if (cached) return cached;

  const stats = await computeAdminStats(window);
  await setCachedJson(key, stats, CACHE_TTL_SECONDS);
  return stats;
}

/** Earliest day worth showing when the request names none: the first profile. */
export async function firstDay(): Promise<string> {
  const row = await getPostgresInstance().queryOne<{ day: string | null }>(
    `SELECT to_char(min(created_at) AT TIME ZONE '${TIME_ZONE}', 'YYYY-MM-DD') AS day FROM profiles`
  );
  return row?.day ?? todayInBerlin();
}
