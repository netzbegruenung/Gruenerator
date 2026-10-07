/**
 * Where each element of a composed slide comes from, and whether its text can
 * be written back into the spec. Derived from the composer's deterministic
 * ids (`sc-${item}-${type}…`, chrome `sc-…`), then checked against the spec:
 * a text only counts as liftable when inverting it reproduces its field
 * exactly — anything the composer rewrote beyond that stays `opaque`.
 */
import { accentLines, type SharepicItem, type SharepicSlide } from '@gruenerator/contracts';

import { type ComposedSlide } from './composeSharepic';
import { stripMarks } from './marks';

export type SharepicProvenanceLift =
  | 'verbatim'
  | 'bullets'
  | 'prefix'
  | 'lines'
  /** `lines` the grown cover split into rows: `wraps` rows per spec line. */
  | 'unwrap'
  | 'opaque';

export interface SharepicProvenance {
  kind: 'item' | 'chrome' | 'plane';
  /** Index in `slide.items`. */
  item?: number;
  /** Dotted path of the spec field the text came from, on the item (or the slide for chrome). */
  field?: string;
  lift: SharepicProvenanceLift;
  /** `lines` on a part of the array: the text stands for `field.slice(start, end)`. */
  range?: { start: number; end: number };
  /** `unwrap`: how many rows each spec line of the range was split into. */
  wraps?: number[];
}

const BULLET = '• ';
const QUELLE_PREFIX = 'Quelle: ';

/** The spec value an element's text stands for; null when the lift is not reversible. */
export function invertLiftedText(
  lift: SharepicProvenanceLift,
  text: string,
  wraps: number[] | null = null
): string | string[] | null {
  switch (lift) {
    case 'verbatim':
      return text;
    case 'bullets': {
      const lines = text.split('\n');
      return lines.every((l) => l.startsWith(BULLET))
        ? lines.map((l) => l.slice(BULLET.length))
        : null;
    }
    case 'lines':
      return text.split('\n');
    case 'unwrap': {
      if (!wraps) return null;
      const rows = text.split('\n').map((r) => r.trim());
      if (rows.some((r) => !r)) return null;
      // The rows as composed, or one per line once the person took the wraps out.
      if (rows.length === wraps.reduce((a, b) => a + b, 0)) {
        let at = 0;
        return wraps.map((n) => rows.slice(at, (at += n)).join(' '));
      }
      return rows.length === wraps.length ? rows : null;
    }
    case 'prefix':
      return text.startsWith(QUELLE_PREFIX) ? text.slice(QUELLE_PREFIX.length) : null;
    case 'opaque':
      return null;
  }
}

const PLANES = new Set(['sc-bg', 'sc-scrim', 'sc-panel', 'sc-tint']);
const CHROME_FIELDS: Record<string, [string, SharepicProvenanceLift]> = {
  'sc-quelle': ['quelle', 'prefix'],
  'sc-weiter': ['weiter', 'verbatim'],
  'sc-ort': ['ort.lines', 'lines'],
};

type Rule = [RegExp, string, SharepicProvenanceLift];
const V = 'verbatim' as const;
/**
 * Per item type: the id suffix (after `sc-${item}-${type}`) of a text that
 * carries one spec field, and the field. Suffixes not listed are opaque.
 * The headline is resolved apart: its ids count segments, not lines.
 */
const ITEM_RULES: Record<Exclude<SharepicItem['type'], 'headline'>, Rule[]> = {
  dachzeile: [[/^$/, 'text', V]],
  text: [[/^$/, 'text', V]],
  absatz: [[/^$/, 'text', V]],
  zitat: [
    [/^$/, 'text', V],
    [/^-name$/, 'name', V],
  ],
  frage: [[/^$/, 'text', V]],
  liste: [
    [/^$/, 'items', 'bullets'],
    [/^-(\d+)$/, 'items.$1', V],
  ],
  button: [[/^$/, 'text', V]],
  diagramm: [[/^-titel$/, 'titel', V]],
  iconliste: [[/^-(\d+)$/, 'zeilen.$1.text', V]],
  vergleich: [
    [/^-(links|rechts)-titel$/, '$1.titel', V],
    [/^-(links|rechts)-(\d+)$/, '$1.punkte.$2', V],
  ],
  faktencheck: [[/^-(\d+)-(mythos|fakt)-text$/, 'paare.$1.$2', V]],
  infografik: [[/^-(\d+)-(titel|text)$/, 'punkte.$1.$2', V]],
  zahl: [[/^-(wert|label)$/, '$1', V]],
  rechnung: [
    [/^-(\d+)-(wert|label)$/, 'glieder.$1.$2', V],
    [/^-ergebnis-(wert|label)$/, 'ergebnis.$1', V],
  ],
  schlagzeile: [[/^-(medium|titel)$/, '$1', V]],
  bingo: [[/^-(\d+)$/, 'felder.$1', V]],
  termine: [[/^-(\d+)-(datum|titel|ort)$/, 'eintraege.$1.$2', V]],
  aufruf: [
    [/^$/, 'text', V],
    [/^-(adressat|hinweis)$/, '$1', V],
  ],
};

const valueAt = (source: unknown, field: string): unknown =>
  field.split('.').reduce<unknown>((value, key) => {
    if (value === null || typeof value !== 'object') return null;
    return (value as Record<string, unknown>)[key] ?? null;
  }, source);

const sameValue = (a: unknown, b: unknown) =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((v, i) => v === b[i])
    : a !== null && a === b;

type HeadlineItem = Extract<SharepicItem, { type: 'headline' }>;

/** The spec line indices behind each headline text, as the composer groups them. */
function headlineSegments(item: HeadlineItem): number[][] {
  const accented = accentLines(item.akzent);
  const segments: { lines: number[]; accent: boolean }[] = [];
  item.lines.forEach((_, i) => {
    const accent = accented.includes(i);
    const last = segments[segments.length - 1];
    if (last && !last.accent && !accent) last.lines.push(i);
    else segments.push({ lines: [i], accent });
  });
  return segments.map((s) => s.lines);
}

/** What provenance reads of a composed slide: ids, and the text of texts and pills. */
type ProvenanceInput = {
  [K in 'additionalTexts' | 'pillBadgeInstances']: { id: string; text: string }[];
} & {
  [
    K in
      | 'circleBadgeInstances'
      | 'shapeInstances'
      | 'assetInstances'
      | 'chartInstances'
      | 'userImageInstances'
  ]: { id: string }[];
} & Pick<ComposedSlide, 'selectedIcons' | 'iconStates' | 'layerOrder'>;

export function slideProvenance(
  slide: SharepicSlide,
  composed: ProvenanceInput
): Record<string, SharepicProvenance> {
  const texts = new Map<string, { text: string; pill: boolean }>();
  for (const t of composed.additionalTexts) texts.set(t.id, { text: t.text, pill: false });
  for (const p of composed.pillBadgeInstances) texts.set(p.id, { text: p.text, pill: true });
  const ids = new Set([
    ...composed.additionalTexts.map((t) => t.id),
    ...composed.pillBadgeInstances.map((p) => p.id),
    ...composed.circleBadgeInstances.map((c) => c.id),
    ...composed.shapeInstances.map((s) => s.id),
    ...composed.assetInstances.map((a) => a.id),
    ...composed.chartInstances.map((c) => c.id),
    ...composed.userImageInstances.map((u) => u.id),
    ...composed.selectedIcons,
    ...Object.keys(composed.iconStates),
    ...composed.layerOrder,
  ]);
  const prefixes = slide.items.map((item, index) => `sc-${index}-${item.type}`);
  const itemOf = (id: string) => {
    const bare = id.startsWith('chart-') ? id.slice('chart-'.length) : id;
    const index = prefixes.findIndex((p) => bare === p || bare.startsWith(`${p}-`));
    return index < 0 ? null : { index, rest: bare.slice(prefixes[index]!.length) };
  };

  /** A candidate lift holds only if inverting the text gives back the field exactly. */
  const checked = (
    base: Omit<SharepicProvenance, 'field' | 'lift'>,
    id: string,
    source: unknown,
    field: string,
    lift: SharepicProvenanceLift
  ): SharepicProvenance => {
    const text = texts.get(id)?.text;
    const value = valueAt(source, field);
    const expected =
      base.range && Array.isArray(value) ? value.slice(base.range.start, base.range.end) : value;
    const holds =
      text !== undefined && sameValue(invertLiftedText(lift, text, base.wraps ?? null), expected);
    if (holds) return { ...base, field, lift };
    // A range only means something on a liftable entry.
    const opaque: SharepicProvenance = { kind: base.kind, field, lift: 'opaque' };
    if (base.item !== undefined) opaque.item = base.item;
    return opaque;
  };

  /**
   * A grown cover split spec lines into rows (`\n`) of its segment texts. Per
   * segment that holds whole spec lines: their range and the rows of each.
   * Empty when the rows do not read as the spec lines.
   */
  const unwrapSpans = (index: number, item: HeadlineItem) => {
    const spans = new Map<number, { range: { start: number; end: number }; wraps: number[] }>();
    const prefix = `${prefixes[index]!}-`;
    const segments = [...texts]
      .filter(
        ([other, t]) =>
          !t.pill && other.startsWith(prefix) && /^\d+$/.test(other.slice(prefix.length))
      )
      .map(([other, t]) => ({ k: Number(other.slice(prefix.length)), rows: t.text.split('\n') }))
      .sort((a, b) => a.k - b.k);
    const rows = segments.flatMap((s) => s.rows.map(stripMarks));
    // Each spec line takes rows until they join to it: `bounds[i]` is the row line i starts on.
    const bounds = [0];
    let at = 0;
    for (const line of item.lines) {
      const want = stripMarks(line);
      let joined = rows[at++];
      while (joined !== undefined && joined.length < want.length && at < rows.length) {
        joined = `${joined} ${rows[at++]!}`;
      }
      if (joined !== want) return spans;
      bounds.push(at);
    }
    if (at !== rows.length) return spans;
    // A segment qualifies when its rows start and end on spec line boundaries.
    let row = 0;
    for (const segment of segments) {
      const start = bounds.indexOf(row);
      row += segment.rows.length;
      const end = bounds.indexOf(row);
      if (start < 0 || end <= start) continue;
      const wraps = bounds.slice(start + 1, end + 1).map((b, j) => b - bounds[start + j]!);
      spans.set(segment.k, { range: { start, end }, wraps });
    }
    return spans;
  };

  /** The headline text as the spec segments it; opaque where the composer regrouped. */
  const segmentProvenance = (index: number, item: HeadlineItem, id: string, rest: string) => {
    const base = { kind: 'item' as const, item: index };
    const k = /^-(\d+)$/.exec(rest)?.[1];
    const own = texts.get(id);
    if (k === undefined || !own) return { ...base, lift: 'opaque' as const };
    // Boxed: a pill per line. Otherwise a text per segment. A count that does
    // not match the spec means the composer regrouped the lines (a grown cover).
    const prefix = prefixes[index]!;
    const siblings = [...texts].filter(
      ([other, t]) =>
        t.pill === own.pill &&
        other.startsWith(`${prefix}-`) &&
        /^\d+$/.test(other.slice(prefix.length + 1))
    ).length;
    const groups = own.pill ? item.lines.map((_, i) => [i]) : headlineSegments(item);
    const lines = groups.length === siblings ? groups[Number(k)] : undefined;
    if (!lines) return { ...base, lift: 'opaque' as const };
    if (lines.length === 1) return checked(base, id, item, `lines.${lines[0]}`, 'verbatim');
    // Plain lines in a row share one text, joined by `\n`.
    const range = { start: lines[0]!, end: lines[lines.length - 1]! + 1 };
    return checked({ ...base, range }, id, item, 'lines', 'lines');
  };

  const headlineProvenance = (index: number, item: HeadlineItem, id: string, rest: string) => {
    const found = segmentProvenance(index, item, id, rest);
    const own = texts.get(id);
    if (found.lift !== 'opaque' || !own || own.pill) return found;
    const span = unwrapSpans(index, item).get(Number(/^-(\d+)$/.exec(rest)?.[1] ?? NaN));
    if (!span) return found;
    const unwrapped = checked({ kind: 'item', item: index, ...span }, id, item, 'lines', 'unwrap');
    return unwrapped.lift === 'opaque' ? found : unwrapped;
  };

  const out: Record<string, SharepicProvenance> = {};
  for (const id of ids) {
    const owner = itemOf(id);
    if (owner) {
      const item = slide.items[owner.index]!;
      if (item.type === 'headline') {
        out[id] = headlineProvenance(owner.index, item, id, owner.rest);
        continue;
      }
      const base = { kind: 'item' as const, item: owner.index };
      const rule = id.startsWith('chart-')
        ? undefined
        : ITEM_RULES[item.type].find(([pattern]) => pattern.test(owner.rest));
      out[id] = rule
        ? checked(base, id, item, owner.rest.replace(rule[0], rule[1]), rule[2])
        : { ...base, lift: 'opaque' };
    } else if (PLANES.has(id)) {
      out[id] = { kind: 'plane', lift: 'opaque' };
    } else if (CHROME_FIELDS[id]) {
      const [field, lift] = CHROME_FIELDS[id];
      out[id] = checked({ kind: 'chrome' }, id, slide, field, lift);
    } else {
      out[id] = { kind: 'chrome', lift: 'opaque' };
    }
  }
  return out;
}
