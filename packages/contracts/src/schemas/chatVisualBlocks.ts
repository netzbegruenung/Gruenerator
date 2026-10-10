import { z } from 'zod';

import { chartPayloadSchema } from './chatStreamEvents.js';

/**
 * Visual blocks: fenced JSON inside an assistant answer (```bars {…}```) that a
 * client draws as a component instead of a code block.
 *
 * The fence lives in the persisted message text, so live streaming and a
 * reloaded thread share one render path, and every reader of that text that is
 * not a chat renderer (copy, export, voice) must go through
 * `replaceVisualBlocksWithText` — otherwise it shows raw JSON.
 *
 * Kinds are F0: they are written into stored messages. Add, never rename.
 *
 * Parsing is lenient on purpose. The payload is model output: German decimal
 * commas and numeric strings are accepted, unknown fields are dropped, and a
 * payload that still does not fit returns null so the client falls back to the
 * plain code view instead of drawing something wrong.
 */

export const VISUAL_BLOCK_KINDS = [
  'chart',
  'bars',
  'stats',
  'callout',
  'timeline',
  'steps',
  'compare',
  'table',
] as const;
export const visualBlockKindSchema = z.enum(VISUAL_BLOCK_KINDS);
export type VisualBlockKind = z.infer<typeof visualBlockKindSchema>;

export function isVisualBlockKind(language: string): language is VisualBlockKind {
  return (VISUAL_BLOCK_KINDS as readonly string[]).includes(language);
}

/** Accepts 12, "12", "12,5" and "1.234,5" — models write German numbers. */
const lenientNumber = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim().replace(/\s/g, '');
  const normalised = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed;
  return normalised === '' ? value : Number(normalised);
}, z.number().finite());

/**
 * Citation markers (`[3]`, `[1, 7]`, `[cite:12]`) are only resolved in prose;
 * inside a block they would show as raw brackets, so they are dropped.
 */
const CITATION_MARKER_RE = /\s*\[(?:cite:)?\d+(?:\s*,\s*\d+)*\]/g;
const text = z
  .string()
  .transform((value) => value.replace(CITATION_MARKER_RE, '').trim())
  .pipe(z.string().min(1));

/** Semantic colours; each client maps them onto its own theme tokens. */
export const visualToneSchema = z.enum([
  'primary',
  'secondary',
  'accent',
  'warning',
  'danger',
  'neutral',
]);
export type VisualTone = z.infer<typeof visualToneSchema>;

const common = {
  title: text.optional(),
  /** Footnote under the block: source, caveat, definition. */
  note: text.optional(),
};

export const chartBlockSchema = chartPayloadSchema.extend({
  ...common,
  data: z.array(z.record(z.union([z.string(), z.number()]))).min(1),
  yKeys: z.array(z.string()).min(1),
});
export type ChartBlock = z.infer<typeof chartBlockSchema>;

/**
 * Labelled horizontal bars: label left, `display` (or the value) right, filled
 * track below. `from` turns a bar into a range (3–8 Wochen on a 0–8 scale);
 * `from` without a larger `value` is an open range ("über 8 Wochen").
 */
export const barsBlockSchema = z.object({
  ...common,
  /** Scale end; defaults to the largest value. */
  max: lenientNumber.optional(),
  /** Appended to the value when no `display` is given ("%", " Mrd. €"). */
  unit: z.string().optional(),
  items: z
    .array(
      z.object({
        label: text,
        value: lenientNumber,
        from: lenientNumber.optional(),
        display: text.optional(),
        tone: visualToneSchema.optional(),
      })
    )
    .min(1)
    .max(20),
});
export type BarsBlock = z.infer<typeof barsBlockSchema>;

/** Key figures as tiles: big value, label, optional change line. */
export const statsBlockSchema = z.object({
  ...common,
  items: z
    .array(
      z.object({
        label: text,
        value: text,
        /** Change line, free text: "+3,2 % ggü. 2020". */
        change: text.optional(),
        trend: z.enum(['up', 'down', 'flat']).optional(),
        /** Whether the trend is good news; colours the change line. */
        sentiment: z.enum(['positive', 'negative', 'neutral']).optional(),
        /** Optional history, drawn as a sparkline under the value. */
        points: z.array(lenientNumber).min(2).max(60).optional(),
      })
    )
    .min(1)
    .max(6),
});
export type StatsBlock = z.infer<typeof statsBlockSchema>;

export const calloutBlockSchema = z.object({
  title: text.optional(),
  variant: z.enum(['info', 'tip', 'important', 'warning']).default('info'),
  text,
});
export type CalloutBlock = z.infer<typeof calloutBlockSchema>;

export const timelineBlockSchema = z.object({
  ...common,
  items: z
    .array(z.object({ date: text, title: text, text: text.optional() }))
    .min(1)
    .max(20),
});
export type TimelineBlock = z.infer<typeof timelineBlockSchema>;

export const stepsBlockSchema = z.object({
  ...common,
  items: z
    .array(z.object({ title: text, text: text.optional() }))
    .min(1)
    .max(15),
});
export type StepsBlock = z.infer<typeof stepsBlockSchema>;

/** Two or three columns side by side; `pro`/`contra` colour the column. */
export const compareBlockSchema = z.object({
  ...common,
  columns: z
    .array(
      z.object({
        title: text,
        tone: z.enum(['pro', 'contra', 'neutral']).optional(),
        items: z.array(text).min(1).max(12),
      })
    )
    .min(2)
    .max(3),
  /** Index of the column to highlight as the recommendation. */
  recommended: z.number().int().min(0).optional(),
});
export type CompareBlock = z.infer<typeof compareBlockSchema>;

export const tableColumnFormatSchema = z.enum(['text', 'number', 'percent', 'currency', 'delta']);

/**
 * A sortable data table — for many rows of the same shape. A plain Markdown
 * table stays the default for anything small; this one earns its place by
 * sorting, number formatting and turning into cards on narrow screens.
 */
export const tableBlockSchema = z.object({
  ...common,
  columns: z
    .array(
      z.object({
        key: text,
        label: text,
        format: tableColumnFormatSchema.optional(),
      })
    )
    .min(1)
    .max(8),
  rows: z
    .array(z.record(z.union([z.string(), z.number(), z.null()])))
    .min(1)
    .max(100),
});
export type TableBlock = z.infer<typeof tableBlockSchema>;

export type VisualBlock =
  | { kind: 'chart'; block: ChartBlock }
  | { kind: 'bars'; block: BarsBlock }
  | { kind: 'stats'; block: StatsBlock }
  | { kind: 'callout'; block: CalloutBlock }
  | { kind: 'timeline'; block: TimelineBlock }
  | { kind: 'steps'; block: StepsBlock }
  | { kind: 'compare'; block: CompareBlock }
  | { kind: 'table'; block: TableBlock };

const SCHEMAS = {
  chart: chartBlockSchema,
  bars: barsBlockSchema,
  stats: statsBlockSchema,
  callout: calloutBlockSchema,
  timeline: timelineBlockSchema,
  steps: stepsBlockSchema,
  compare: compareBlockSchema,
  table: tableBlockSchema,
} as const satisfies Record<VisualBlockKind, z.ZodTypeAny>;

/** Parse a fence body of the given language, or null if it is not a valid block. */
export function parseVisualBlock(language: string, code: string): VisualBlock | null {
  if (!isVisualBlockKind(language)) return null;
  let json: unknown;
  try {
    json = JSON.parse(code);
  } catch {
    return null;
  }
  const result = SCHEMAS[language].safeParse(json);
  if (!result.success) return null;
  // The cast is the boundary: `language` picked the schema, so the parsed value
  // belongs to that kind. TS cannot correlate the two through the lookup.
  const parsed = { kind: language, block: result.data } as VisualBlock;
  if (parsed.kind === 'chart' && parsed.block.yKeys.some((k) => k === parsed.block.xKey)) {
    return null;
  }
  if (parsed.kind === 'compare' && (parsed.block.recommended ?? 0) >= parsed.block.columns.length) {
    return null;
  }
  return parsed;
}

const formatNumber = (n: number): string => n.toLocaleString('de-DE', { maximumFractionDigits: 2 });

/** Display text of one table cell, by its column format. */
export function formatTableCell(
  value: string | number | null | undefined,
  format: z.infer<typeof tableColumnFormatSchema> = 'text'
): string {
  if (value == null || value === '') return '–';
  if (typeof value !== 'number') return String(value);
  switch (format) {
    case 'percent':
      return `${formatNumber(value)} %`;
    case 'currency':
      return value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
    case 'delta':
      return `${value > 0 ? '+' : ''}${formatNumber(value)}`;
    default:
      return formatNumber(value);
  }
}

/** A bar whose `from` has no larger `value`: an open range, "ab 8". */
export function isOpenBar(item: BarsBlock['items'][number]): boolean {
  return item.from != null && item.value <= item.from;
}

/**
 * Scale end and bar geometry, shared by web and app so both draw the same.
 * An open range needs room to run out, so the scale grows by a quarter past
 * its last bound when one is present.
 */
export function barScale(block: BarsBlock): (item: BarsBlock['items'][number]) => {
  start: number;
  end: number;
  open: boolean;
} {
  const bounds = block.items.flatMap((item) => [item.value, item.from ?? 0]);
  const top = Math.max(block.max ?? 0, ...bounds);
  const hasOpen = block.items.some(isOpenBar);
  const scale = hasOpen ? top * 1.25 : top;
  const pct = (v: number) => (scale > 0 ? Math.min(100, Math.max(0, (v / scale) * 100)) : 0);
  return (item) => {
    const open = isOpenBar(item);
    const start = item.from != null ? pct(item.from) : 0;
    return { start, end: open ? 100 : Math.max(pct(item.value), start + 1), open };
  };
}

/** The value a bar shows on its right edge. */
export function barDisplay(item: BarsBlock['items'][number], unit?: string): string {
  if (item.display) return item.display;
  if (item.from != null && isOpenBar(item)) return `ab ${formatNumber(item.from)}${unit ?? ''}`;
  const value = `${formatNumber(item.value)}${unit ?? ''}`;
  return item.from != null ? `${formatNumber(item.from)}–${value}` : value;
}

const CALLOUT_LABEL: Record<CalloutBlock['variant'], string> = {
  info: 'Hinweis',
  tip: 'Tipp',
  important: 'Wichtig',
  warning: 'Achtung',
};
export function calloutLabel(variant: CalloutBlock['variant']): string {
  return CALLOUT_LABEL[variant];
}

/**
 * Readable Markdown for a block — what copy, export and voice see in place of
 * the JSON, and the screen-reader text of a drawn chart.
 */
export function visualBlockToText(visual: VisualBlock): string {
  const lines: string[] = [];
  const heading = (title?: string) => {
    if (title) lines.push(`**${title}**`);
  };
  const note = (value?: string) => {
    if (value) lines.push('', `_${value}_`);
  };

  switch (visual.kind) {
    case 'chart': {
      const b = visual.block;
      heading(b.title);
      for (const row of b.data) {
        const values = b.yKeys
          .map((key) => (b.yKeys.length > 1 ? `${key}: ${row[key] ?? '–'}` : `${row[key] ?? '–'}`))
          .join(', ');
        lines.push(`- ${row[b.xKey] ?? ''}: ${values}`);
      }
      note(b.note);
      break;
    }
    case 'bars': {
      const b = visual.block;
      heading(b.title);
      for (const item of b.items) lines.push(`- ${item.label}: ${barDisplay(item, b.unit)}`);
      note(b.note);
      break;
    }
    case 'stats': {
      const b = visual.block;
      heading(b.title);
      for (const item of b.items) {
        lines.push(`- ${item.label}: **${item.value}**${item.change ? ` (${item.change})` : ''}`);
      }
      note(b.note);
      break;
    }
    case 'callout': {
      const b = visual.block;
      const label = b.title ?? calloutLabel(b.variant);
      lines.push(`> **${label}:** ${b.text.replace(/\n/g, '\n> ')}`);
      break;
    }
    case 'timeline': {
      const b = visual.block;
      heading(b.title);
      for (const item of b.items) {
        lines.push(`- **${item.date}** – ${item.title}${item.text ? `: ${item.text}` : ''}`);
      }
      note(b.note);
      break;
    }
    case 'steps': {
      const b = visual.block;
      heading(b.title);
      b.items.forEach((item, i) => {
        lines.push(`${i + 1}. **${item.title}**${item.text ? ` – ${item.text}` : ''}`);
      });
      note(b.note);
      break;
    }
    case 'compare': {
      const b = visual.block;
      heading(b.title);
      b.columns.forEach((column, i) => {
        const mark = i === b.recommended ? ' (Empfehlung)' : '';
        lines.push('', `**${column.title}**${mark}`, ...column.items.map((item) => `- ${item}`));
      });
      note(b.note);
      break;
    }
    case 'table': {
      const b = visual.block;
      heading(b.title);
      // Backslashes first, or an escaped pipe in the value would cancel out.
      const cell = (v: string) => v.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
      lines.push(`| ${b.columns.map((c) => cell(c.label)).join(' | ')} |`);
      lines.push(`| ${b.columns.map(() => '---').join(' | ')} |`);
      for (const row of b.rows) {
        lines.push(
          `| ${b.columns.map((c) => cell(formatTableCell(row[c.key], c.format))).join(' | ')} |`
        );
      }
      note(b.note);
      break;
    }
  }
  return lines.join('\n').trim();
}

export interface MarkdownFence {
  /** Offset of the opening fence line's first character. */
  start: number;
  /** Offset just past the closing fence line (before its newline). */
  end: number;
  language: string;
  body: string;
}

const OPENING_FENCE_RE = /^[ \t]*(`{3,}|~{3,})[ \t]*([\w-]+)/;

/**
 * Every fenced code block with a language tag, in order. A line scanner rather
 * than one regex over the whole text: the regex form backtracks polynomially on
 * long runs of `-` (CodeQL js/polynomial-redos), and this is fed model output.
 * The closing fence must repeat the opening one exactly; an unclosed fence is
 * not a block.
 */
export function findFences(markdown: string): MarkdownFence[] {
  const fences: MarkdownFence[] = [];
  let open: { start: number; marker: string; language: string; bodyStart: number } | null = null;
  let offset = 0;
  for (const line of markdown.split('\n')) {
    const lineEnd = offset + line.length;
    if (open) {
      if (line.trim() === open.marker) {
        fences.push({
          start: open.start,
          end: lineEnd,
          language: open.language,
          body: markdown.slice(open.bodyStart, Math.max(open.bodyStart, offset - 1)),
        });
        open = null;
      }
    } else {
      const match = OPENING_FENCE_RE.exec(line);
      if (match) {
        open = {
          start: offset,
          marker: match[1] ?? '',
          language: match[2] ?? '',
          bodyStart: lineEnd + 1,
        };
      }
    }
    offset = lineEnd + 1;
  }
  return fences;
}

/**
 * Replace every valid visual-block fence in a Markdown text with its readable
 * text form. Invalid or unknown fences stay as they are.
 */
export function replaceVisualBlocksWithText(markdown: string): string {
  if (!markdown.includes('```') && !markdown.includes('~~~')) return markdown;
  let out = '';
  let last = 0;
  for (const fence of findFences(markdown)) {
    const visual = parseVisualBlock(fence.language, fence.body);
    if (!visual) continue;
    out += markdown.slice(last, fence.start) + visualBlockToText(visual);
    last = fence.end;
  }
  return out + markdown.slice(last);
}
