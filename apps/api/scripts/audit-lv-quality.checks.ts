/**
 * Reine Prüfungen für den LV-Zensus (`audit-lv-quality.ts`) — ohne Qdrant,
 * damit sie sich ohne Netz testen lassen.
 *
 * Jede Prüfung meldet höchstens einen Befund pro Dokument (= `source_id` +
 * `source_url`), auch wenn das Dokument aus vielen Chunks besteht. Die
 * Befundcodes sind bewusst eng gefasst: ein Code, eine Ursache — sonst lässt
 * sich eine Zahl im Bericht nicht einer Reparatur zuordnen.
 */

export interface CensusPoint {
  id: number | string;
  source_id: string;
  source_url: string;
  landesverband: string;
  content_type: string;
  content_type_label: string;
  title: string;
  published_at: string | null;
  chunk_index: number;
  content_hash: string;
  full_text: string | null;
  wolke_etag: string | null;
  nlp_version: number | null;
}

export interface SourceMeta {
  name: string;
  shortName: string;
  /** null = die Quelle setzt kein `maxAgeYears`, der Archivschritt überspringt sie. */
  maxAgeYears: number | null;
}

export interface CheckContext {
  sources: Record<string, SourceMeta>;
  /** Alle `landesverband`-Werte, die mindestens ein Notebook-`defaultFilter` abdeckt. */
  notebookLandesverbaende: ReadonlySet<string>;
  contentTypeLabels: Record<string, string>;
  now: Date;
}

export const CHECK_CODES = [
  'title_empty',
  'title_source_fallback',
  'title_html_entity',
  'title_linebreak',
  'title_whitespace',
  'title_too_long',
  'title_teaser',
  'title_repeated',
  'date_missing_html',
  'date_missing_file',
  'date_not_iso',
  'date_future',
  'date_mid_june_guess',
  'date_beyond_max_age',
  'content_short',
  'content_no_full_text',
  'content_boilerplate_start',
  'content_duplicate_hash',
  'chunk_gap',
  'chunk_zero_repeated',
  'chunk_zero_missing',
  'nlp_missing',
  'url_query_or_fragment',
  'url_normalized_duplicate',
  'url_in_two_sources',
  'source_unknown',
  'landesverband_no_notebook',
  'content_type_unknown',
  'content_type_label_mismatch',
] as const;

export type CheckCode = (typeof CHECK_CODES)[number];

export interface Finding {
  code: CheckCode;
  sourceId: string;
  url: string;
  detail: string;
}

export interface Sample {
  url: string;
  detail: string;
}

export interface SourceReport {
  landesverband: string;
  points: number;
  documents: number;
  codes: Partial<Record<CheckCode, number>>;
  oldest: string | null;
  newest: string | null;
  dateFormats: { day: number; timestamp: number };
  samples: Partial<Record<CheckCode, Sample[]>>;
}

export interface CensusReport {
  findings: Finding[];
  sources: Record<string, SourceReport>;
}

const SAMPLES_PER_CODE = 10;
const MAX_TITLE_LENGTH = 150;
const MIN_FULL_TEXT = 300;
const REPEATED_TITLE_URLS = 3;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
const MID_JUNE = /^\d{4}-06-15(?:T00:00(?::00(?:\.000)?)?Z?)?$/;
const HTML_ENTITY = /&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i;
const TEASER = /: .{15,}(?:\.\.\.|…)$/s;
const FILE_PATH = /\.(?:pdf|docx?|odt)$|\/download\//i;
const BOILERPLATE_MARKERS = [
  /\bMenü\b/,
  /\bStartseite\b/,
  /\bImpressum\b/,
  /\bDatenschutz/,
  /\bCookie/i,
  /\bNavigation\b/,
  /\bSuche\b/,
];
const DAY_MS = 24 * 60 * 60 * 1000;

interface Doc {
  sourceId: string;
  url: string;
  chunks: CensusPoint[];
  head: CensusPoint | null;
}

function groupDocuments(points: CensusPoint[]): Doc[] {
  const byKey = new Map<string, Doc>();
  for (const p of points) {
    const key = `${p.source_id}\u0000${p.source_url}`;
    let doc = byKey.get(key);
    if (!doc) {
      doc = { sourceId: p.source_id, url: p.source_url, chunks: [], head: null };
      byKey.set(key, doc);
    }
    doc.chunks.push(p);
    if (p.chunk_index === 0 && !doc.head) doc.head = p;
  }
  return [...byKey.values()];
}

function isFile(p: CensusPoint): boolean {
  if (p.wolke_etag) return true;
  try {
    return FILE_PATH.test(new URL(p.source_url).pathname);
  } catch {
    return false;
  }
}

/**
 * Ein Wolke-Link trägt den Dateipfad im Fragment (`/s/<token>#/Ordner/Datei.pdf`)
 * — dort ist das Fragment Teil der Identität, kein Anhängsel.
 */
function routeFragment(u: URL): string {
  return u.hash.startsWith('#/') ? u.hash : '';
}

function normalizedUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}${routeFragment(u)}`;
  } catch {
    return url;
  }
}

function subtractYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() - years);
  return d;
}

function titleFindings(
  head: CensusPoint,
  source: SourceMeta | null,
  ctx: CheckContext
): Array<[CheckCode, string]> {
  const title = head.title;
  if (!title.trim()) return [['title_empty', title]];
  const out: Array<[CheckCode, string]> = [];
  const label = ctx.contentTypeLabels[head.content_type] ?? head.content_type;
  if (source && title === `${source.name} - ${label}`) out.push(['title_source_fallback', title]);
  if (HTML_ENTITY.test(title)) out.push(['title_html_entity', title]);
  if (/[\r\n]/.test(title)) out.push(['title_linebreak', title]);
  if (/ | {2,}/.test(title)) out.push(['title_whitespace', title]);
  if (title.length > MAX_TITLE_LENGTH) out.push(['title_too_long', title]);
  if (TEASER.test(title)) out.push(['title_teaser', title]);
  return out;
}

function dateFindings(
  head: CensusPoint,
  source: SourceMeta | null,
  ctx: CheckContext
): Array<[CheckCode, string]> {
  const raw = head.published_at;
  if (!raw) return [[isFile(head) ? 'date_missing_file' : 'date_missing_html', '']];
  if (!ISO_DATE.test(raw) || Number.isNaN(new Date(raw).getTime())) return [['date_not_iso', raw]];
  const date = new Date(raw);
  const out: Array<[CheckCode, string]> = [];
  if (date.getTime() > ctx.now.getTime() + DAY_MS) out.push(['date_future', raw]);
  // Nur bei Dateien: ein HTML-Artikel kann wirklich am 15. Juni erschienen sein.
  if (MID_JUNE.test(raw) && isFile(head)) out.push(['date_mid_june_guess', raw]);
  if (source?.maxAgeYears && date < subtractYears(ctx.now, source.maxAgeYears)) {
    out.push(['date_beyond_max_age', raw]);
  }
  return out;
}

function contentFindings(head: CensusPoint): Array<[CheckCode, string]> {
  const text = head.full_text;
  if (text === null) return [['content_no_full_text', '']];
  const out: Array<[CheckCode, string]> = [];
  if (text.length < MIN_FULL_TEXT) out.push(['content_short', text]);
  const start = text.slice(0, 300);
  if (BOILERPLATE_MARKERS.filter((re) => re.test(start)).length >= 2) {
    out.push(['content_boilerplate_start', start]);
  }
  return out;
}

function chunkFindings(doc: Doc): Array<[CheckCode, string]> {
  const out: Array<[CheckCode, string]> = [];
  const zeros = doc.chunks.filter((c) => c.chunk_index === 0).length;
  if (zeros === 0) out.push(['chunk_zero_missing', `${doc.chunks.length} chunks`]);
  if (zeros > 1) out.push(['chunk_zero_repeated', `${zeros}× chunk 0`]);
  const indices = [...new Set(doc.chunks.map((c) => c.chunk_index))].sort((a, b) => a - b);
  if (zeros > 0 && indices[indices.length - 1] !== indices.length - 1) {
    out.push(['chunk_gap', indices.join(',')]);
  }
  return out;
}

function identityFindings(
  head: CensusPoint,
  source: SourceMeta | null,
  ctx: CheckContext
): Array<[CheckCode, string]> {
  const out: Array<[CheckCode, string]> = [];
  if (!source) out.push(['source_unknown', head.source_id]);
  if (!ctx.notebookLandesverbaende.has(head.landesverband)) {
    out.push(['landesverband_no_notebook', head.landesverband]);
  }
  const expectedLabel = ctx.contentTypeLabels[head.content_type];
  if (expectedLabel === undefined) out.push(['content_type_unknown', head.content_type]);
  else if (head.content_type_label !== expectedLabel) {
    out.push(['content_type_label_mismatch', `${head.content_type} / ${head.content_type_label}`]);
  }
  try {
    const u = new URL(head.source_url);
    if (u.search || (u.hash && !routeFragment(u)))
      out.push(['url_query_or_fragment', head.source_url]);
  } catch {
    out.push(['url_query_or_fragment', head.source_url]);
  }
  return out;
}

/** Dokumente, die sich einen Schlüssel mit einem anderen Dokument teilen. */
function sharedKey(
  docs: Doc[],
  key: (d: Doc) => string | null,
  distinct: (d: Doc) => string
): Set<Doc> {
  const groups = new Map<string, Doc[]>();
  for (const d of docs) {
    const k = key(d);
    if (k === null) continue;
    const list = groups.get(k) ?? [];
    list.push(d);
    groups.set(k, list);
  }
  const hit = new Set<Doc>();
  for (const list of groups.values()) {
    if (new Set(list.map(distinct)).size > 1) for (const d of list) hit.add(d);
  }
  return hit;
}

export function runChecks(points: CensusPoint[], ctx: CheckContext): CensusReport {
  const docs = groupDocuments(points);
  const findings: Finding[] = [];
  const sources: Record<string, SourceReport> = {};

  const dupHash = sharedKey(
    docs,
    (d) => d.head?.content_hash || null,
    (d) => d.url
  );
  const twins = sharedKey(
    docs,
    (d) => normalizedUrl(d.url),
    (d) => d.url
  );
  const twoSources = sharedKey(
    docs,
    (d) => d.url,
    (d) => d.sourceId
  );
  const repeatedTitle = new Set<Doc>();
  const byTitle = new Map<string, Doc[]>();
  for (const d of docs) {
    const t = d.head?.title.trim();
    if (!t) continue;
    const k = `${d.sourceId}\u0000${t}`;
    byTitle.set(k, [...(byTitle.get(k) ?? []), d]);
  }
  for (const list of byTitle.values()) {
    if (list.length > REPEATED_TITLE_URLS) for (const d of list) repeatedTitle.add(d);
  }

  for (const doc of docs) {
    const head = doc.head;
    const source = ctx.sources[doc.sourceId] ?? null;
    const report = (sources[doc.sourceId] ??= {
      landesverband: head?.landesverband ?? doc.chunks[0].landesverband,
      points: 0,
      documents: 0,
      codes: {},
      oldest: null,
      newest: null,
      dateFormats: { day: 0, timestamp: 0 },
      samples: {},
    });
    report.points += doc.chunks.length;
    report.documents += 1;

    const hits: Array<[CheckCode, string]> = [...chunkFindings(doc)];
    if (head) {
      hits.push(
        ...titleFindings(head, source, ctx),
        ...dateFindings(head, source, ctx),
        ...contentFindings(head),
        ...identityFindings(head, source, ctx)
      );
      if (head.nlp_version === null) hits.push(['nlp_missing', '']);
      if (repeatedTitle.has(doc)) hits.push(['title_repeated', head.title]);
      if (dupHash.has(doc)) hits.push(['content_duplicate_hash', head.content_hash]);

      const raw = head.published_at;
      if (raw && ISO_DATE.test(raw) && !Number.isNaN(new Date(raw).getTime())) {
        report.dateFormats[raw.includes('T') ? 'timestamp' : 'day'] += 1;
        if (!report.oldest || new Date(raw) < new Date(report.oldest)) report.oldest = raw;
        if (!report.newest || new Date(raw) > new Date(report.newest)) report.newest = raw;
      }
    }
    if (twins.has(doc)) hits.push(['url_normalized_duplicate', normalizedUrl(doc.url)]);
    if (twoSources.has(doc)) hits.push(['url_in_two_sources', doc.url]);

    for (const [code, detail] of hits) {
      const short = detail.length > 200 ? `${detail.slice(0, 200)}…` : detail;
      findings.push({ code, sourceId: doc.sourceId, url: doc.url, detail: short });
      report.codes[code] = (report.codes[code] ?? 0) + 1;
      const samples = (report.samples[code] ??= []);
      if (samples.length < SAMPLES_PER_CODE) samples.push({ url: doc.url, detail: short });
    }
  }

  return { findings, sources };
}
