/**
 * Lightweight, dependency-free natural-language parser for notebook/research queries.
 * Turns a query like "was hat berlin seit 2023 zu klima beschlossen" into structured
 * filters (region, date range, topic). Pure TypeScript so both the web manual-search
 * and the mobile Wissen composer can share it.
 *
 * Heuristic, not a grammar: it matches known region names, a few German date phrases,
 * and strips question scaffolding to leave the topic keywords.
 */

export interface NotebookQueryFilters {
  /** Canonical region name (a German Bundesland or Austrian Land), if named. */
  region?: string;
  /** Inclusive ISO start date "YYYY-01-01", if a year/"seit"/"letzten N Jahren" is named. */
  dateFrom?: string;
  /** Inclusive ISO end date "YYYY-12-31", if a single year (not a "since") is named. */
  dateTo?: string;
  /** The residual topic keywords (region + date phrases + scaffolding removed). */
  topic: string;
}

// Longest names first so "Sachsen-Anhalt" wins over "Sachsen", "Nordrhein-Westfalen"
// over its aliases, etc. Each entry maps aliases → the canonical display name.
const REGIONS: Array<{ canonical: string; patterns: string[] }> = [
  { canonical: 'Mecklenburg-Vorpommern', patterns: ['mecklenburg-vorpommern', 'meck-pomm', 'mv'] },
  { canonical: 'Nordrhein-Westfalen', patterns: ['nordrhein-westfalen', 'nrw'] },
  { canonical: 'Rheinland-Pfalz', patterns: ['rheinland-pfalz', 'rlp'] },
  { canonical: 'Sachsen-Anhalt', patterns: ['sachsen-anhalt'] },
  { canonical: 'Schleswig-Holstein', patterns: ['schleswig-holstein', 'sh'] },
  {
    canonical: 'Baden-Württemberg',
    patterns: ['baden-württemberg', 'baden-wuerttemberg', 'bawü', 'bawue', 'bw'],
  },
  { canonical: 'Niedersachsen', patterns: ['niedersachsen'] },
  { canonical: 'Niederösterreich', patterns: ['niederösterreich', 'niederoesterreich'] },
  { canonical: 'Oberösterreich', patterns: ['oberösterreich', 'oberoesterreich'] },
  { canonical: 'Brandenburg', patterns: ['brandenburg'] },
  { canonical: 'Vorarlberg', patterns: ['vorarlberg'] },
  { canonical: 'Burgenland', patterns: ['burgenland'] },
  { canonical: 'Steiermark', patterns: ['steiermark'] },
  { canonical: 'Thüringen', patterns: ['thüringen', 'thueringen'] },
  { canonical: 'Kärnten', patterns: ['kärnten', 'kaernten'] },
  { canonical: 'Salzburg', patterns: ['salzburg'] },
  { canonical: 'Saarland', patterns: ['saarland'] },
  { canonical: 'Sachsen', patterns: ['sachsen'] },
  { canonical: 'Hessen', patterns: ['hessen'] },
  { canonical: 'Bayern', patterns: ['bayern'] },
  { canonical: 'Berlin', patterns: ['berlin'] },
  { canonical: 'Bremen', patterns: ['bremen'] },
  { canonical: 'Hamburg', patterns: ['hamburg'] },
  { canonical: 'Tirol', patterns: ['tirol'] },
  { canonical: 'Wien', patterns: ['wien'] },
];

// German question/scaffolding words stripped from the residual topic.
const STOPWORDS = new Set([
  'was',
  'wie',
  'welche',
  'welcher',
  'welches',
  'hat',
  'haben',
  'wurde',
  'wurden',
  'gibt',
  'es',
  'zu',
  'zur',
  'zum',
  'über',
  'ueber',
  'beschlossen',
  'gesagt',
  'gefordert',
  'gemacht',
  'der',
  'die',
  'das',
  'dem',
  'den',
  'ein',
  'eine',
  'und',
  'oder',
  'seit',
  'ab',
  'im',
  'in',
  'jahr',
  'jahre',
  'jahren',
  'letzten',
  'letzte',
  'vor',
  'von',
  'bis',
]);

function matchWholeWord(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}])${escaped}(?:$|[^\\p{L}])`, 'u').test(haystack);
}

export function parseNotebookQuery(text: string): NotebookQueryFilters {
  const lower = text.toLowerCase();
  const currentYear = new Date().getFullYear();

  // Region — first (longest) match wins.
  let region: string | undefined;
  let regionPattern: string | undefined;
  for (const entry of REGIONS) {
    const hit = entry.patterns.find((p) => matchWholeWord(lower, p));
    if (hit) {
      region = entry.canonical;
      regionPattern = hit;
      break;
    }
  }

  // Dates.
  let dateFrom: string | undefined;
  let dateTo: string | undefined;
  const sinceYear = lower.match(/\b(?:seit|ab)\s+((?:19|20)\d{2})\b/);
  const lastN = lower.match(/\bletzten?\s+(\d{1,2})\s+jahren?\b/);
  const bareYear = lower.match(/\b((?:19|20)\d{2})\b/);
  if (sinceYear) {
    dateFrom = `${sinceYear[1]}-01-01`;
  } else if (lastN) {
    const n = Number(lastN[1]);
    dateFrom = `${currentYear - n}-01-01`;
  } else if (bareYear) {
    dateFrom = `${bareYear[1]}-01-01`;
    dateTo = `${bareYear[1]}-12-31`;
  }

  // Topic = residual meaningful words.
  const topic = lower
    .replace(/\b(?:seit|ab)\s+(?:19|20)\d{2}\b/g, ' ')
    .replace(/\bletzten?\s+\d{1,2}\s+jahren?\b/g, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(
      regionPattern ? new RegExp(regionPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') : /$^/,
      ' '
    )
    .split(/[^\p{L}\d]+/u)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .join(' ')
    .trim();

  return { region, dateFrom, dateTo, topic };
}
