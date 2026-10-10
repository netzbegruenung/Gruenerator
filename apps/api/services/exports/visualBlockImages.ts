/**
 * Visual blocks (```chart, ```bars — see `chatVisualBlocks.ts` in contracts)
 * as pictures for the Word and PDF exports.
 *
 * Only the two kinds whose meaning IS the picture are drawn. The others have a
 * native document form that stays editable and accessible — a Word table, a
 * numbered list, a quote — and keep `visualBlockToText`.
 *
 * Drawn on @napi-rs/canvas with the fonts the sharepic renderer registers, not
 * through an SVG and sharp: librsvg would pick the host's system fonts, and
 * the API image has none worth trusting.
 */
import {
  type BarsBlock,
  type ChartBlock,
  type VisualBlock,
  barDisplay,
  barScale,
  parseVisualBlock,
  visualBlockToText,
} from '@gruenerator/contracts';
import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';

import { registerFonts } from '../sharepic/canvas/fileManagement.js';

/** Same mid-tone palette as the chat chart: >= 3:1 on white. */
const PALETTE = ['#52907A', '#A8841C', '#5B87A8', '#C0703A', '#8A72B0', '#6A9583'];
const TONE: Record<NonNullable<BarsBlock['items'][number]['tone']>, string> = {
  primary: '#316049',
  secondary: '#6A9583',
  accent: '#A8841C',
  warning: '#C2410C',
  danger: '#B91C1C',
  neutral: '#7C7C7C',
};
const TEXT = '#262626';
const MUTED = '#656565';
const GRID = '#E4E4E4';
const TRACK = '#EEEEEE';
const FONT = 'PT Sans';

/** Pixels per layout unit: drawn at 2x so the picture stays sharp in print. */
const S = 2;
const WIDTH = 800;

const num = (value: string | number | undefined): number => {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
};

const fmt = (n: number): string => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });

function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const step = (residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1) * magnitude;
  const ticks: number[] = [];
  for (let t = 0; t < max + step; t += step) ticks.push(t);
  return ticks;
}

const TITLE_H = 36;

/**
 * A white canvas for a figure of `height`; a title is drawn into the picture
 * itself so a page break can never split it from its figure.
 */
function context(height: number, title?: string): { ctx: SKRSContext2D; toPng: () => Buffer } {
  registerFonts();
  const top = title ? TITLE_H : 0;
  const canvas = createCanvas(WIDTH * S, (height + top) * S);
  const ctx = canvas.getContext('2d');
  ctx.scale(S, S);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, WIDTH, height + top);
  ctx.textBaseline = 'middle';
  if (title) {
    ctx.font = `bold 17px "${FONT}"`;
    ctx.fillStyle = TEXT;
    ctx.textAlign = 'left';
    ctx.fillText(title, 0, TITLE_H / 2 - 4);
    ctx.translate(0, top);
  }
  return { ctx, toPng: () => canvas.toBuffer('image/png') };
}

function font(ctx: SKRSContext2D, size: number, bold = false) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px "${FONT}"`;
}

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(w, 0), h, radius);
  ctx.fill();
}

function drawBars(block: BarsBlock): Buffer {
  const ROW = 52;
  const PAD = 8;
  const height = PAD * 2 + block.items.length * ROW;
  const { ctx, toPng } = context(height, block.title);
  const geometry = barScale(block);

  block.items.forEach((item, i) => {
    const top = PAD + i * ROW;
    font(ctx, 15);
    ctx.fillStyle = TEXT;
    ctx.textAlign = 'left';
    ctx.fillText(item.label, 0, top + 14);
    ctx.textAlign = 'right';
    ctx.fillText(barDisplay(item, block.unit), WIDTH, top + 14);

    const trackY = top + 30;
    ctx.fillStyle = TRACK;
    roundRect(ctx, 0, trackY, WIDTH, 10, 5);
    const { start, end, open } = geometry(item);
    const x = (start / 100) * WIDTH;
    const w = ((end - start) / 100) * WIDTH;
    const color = TONE[item.tone ?? 'primary'];
    if (open) {
      const gradient = ctx.createLinearGradient(x, 0, x + w, 0);
      gradient.addColorStop(0, color);
      gradient.addColorStop(0.4, color);
      gradient.addColorStop(1, `${color}00`);
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = color;
    }
    roundRect(ctx, x, trackY, w, 10, 5);
  });
  return toPng();
}

function drawLegend(ctx: SKRSContext2D, labels: string[], y: number) {
  font(ctx, 13);
  ctx.textAlign = 'left';
  let x = 0;
  labels.forEach((label, i) => {
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.beginPath();
    ctx.arc(x + 5, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = MUTED;
    ctx.fillText(label, x + 14, y);
    x += 14 + ctx.measureText(label).width + 20;
  });
}

function drawPie(block: ChartBlock): Buffer {
  const height = 340;
  const { ctx, toPng } = context(height, block.title);
  const key = block.yKeys[0] ?? '';
  const values = block.data.map((row) => Math.max(0, num(row[key])));
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const cx = 160;
  const cy = height / 2;
  const r = 140;
  let angle = -Math.PI / 2;
  values.forEach((value, i) => {
    const sweep = (value / total) * Math.PI * 2;
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + sweep);
    ctx.closePath();
    ctx.fill();
    angle += sweep;
  });
  if (block.type === 'donut') {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  // Labelled legend on the right: name and share, since slices carry no text.
  font(ctx, 15);
  ctx.textAlign = 'left';
  const rowH = Math.min(30, (height - 20) / Math.max(values.length, 1));
  const startY = cy - ((values.length - 1) * rowH) / 2;
  block.data.forEach((row, i) => {
    const y = startY + i * rowH;
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    roundRect(ctx, 340, y - 7, 14, 14, 3);
    ctx.fillStyle = TEXT;
    // The value as given, no recomputed share: models often hand over values
    // that already are percentages of a larger whole.
    ctx.fillText(`${String(row[block.xKey] ?? '')}: ${fmt(values[i] ?? 0)}`, 364, y);
  });
  return toPng();
}

function drawCartesian(block: ChartBlock): Buffer {
  const legend = block.yKeys.length > 1;
  const height = legend ? 400 : 370;
  const { ctx, toPng } = context(height, block.title);
  const LEFT = 56;
  const BOTTOM = 34;
  const TOP = 12;
  const plotW = WIDTH - LEFT - 8;
  const plotH = height - BOTTOM - TOP - (legend ? 30 : 0);
  const percent = block.type !== 'line' && block.percent === true;
  const stacked = block.type !== 'line' && (percent || block.stacked === true);

  const rows = block.data.map((row) => {
    const values = block.yKeys.map((key) => num(row[key]));
    if (!percent) return values;
    const total = values.reduce((a, b) => a + b, 0);
    return values.map((v) => (total > 0 ? v / total : 0));
  });
  const max = percent
    ? 1
    : Math.max(0, ...rows.map((v) => (stacked ? v.reduce((a, b) => a + b, 0) : Math.max(...v))));
  const ticks = percent ? [0, 0.25, 0.5, 0.75, 1] : niceTicks(max);
  const yMax = ticks[ticks.length - 1] || 1;
  const yFor = (v: number) => TOP + plotH - (v / yMax) * plotH;
  const group = plotW / Math.max(rows.length, 1);
  const cx = (i: number) => LEFT + group * (i + 0.5);

  font(ctx, 12);
  ticks.forEach((tick) => {
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LEFT, yFor(tick));
    ctx.lineTo(WIDTH - 8, yFor(tick));
    ctx.stroke();
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'right';
    ctx.fillText(percent ? `${Math.round(tick * 100)} %` : fmt(tick), LEFT - 8, yFor(tick));
  });
  const labelStep = Math.max(1, Math.ceil(rows.length / 8));
  ctx.textAlign = 'center';
  block.data.forEach((row, i) => {
    if (i % labelStep !== 0) return;
    ctx.fillStyle = MUTED;
    ctx.fillText(String(row[block.xKey] ?? ''), cx(i), TOP + plotH + 18);
  });

  if (block.type === 'bar') {
    const barW = stacked ? group * 0.6 : (group * 0.7) / block.yKeys.length;
    rows.forEach((values, i) => {
      let base = 0;
      values.forEach((value, s) => {
        ctx.fillStyle = PALETTE[s % PALETTE.length];
        if (stacked) {
          ctx.fillRect(cx(i) - barW / 2, yFor(base + value), barW, yFor(base) - yFor(base + value));
          base += value;
        } else {
          const x = cx(i) - (barW * values.length) / 2 + barW * s;
          ctx.fillRect(x, yFor(value), barW - 2, yFor(0) - yFor(value));
        }
      });
    });
  } else {
    // line and area; a stacked area draws the cumulative bands.
    const cumulative = rows.map((values) => {
      let acc = 0;
      return values.map((v) => (stacked ? (acc += v) : v));
    });
    block.yKeys.forEach((_, s) => {
      const color = PALETTE[s % PALETTE.length];
      const points = cumulative.map((v, i) => [cx(i), yFor(v[s] ?? 0)] as const);
      if (block.type === 'area') {
        const lower = cumulative.map(
          (v, i) => [cx(i), yFor(stacked && s > 0 ? (v[s - 1] ?? 0) : 0)] as const
        );
        ctx.fillStyle = `${color}${stacked ? '99' : '40'}`;
        ctx.beginPath();
        points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        [...lower].reverse().forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
    });
  }

  if (legend) drawLegend(ctx, block.yKeys, height - 12);
  return toPng();
}

/** The picture for a block, or null for a kind that exports as text. */
export function renderVisualBlockImage(visual: VisualBlock): Buffer | null {
  if (visual.kind === 'bars') return drawBars(visual.block);
  if (visual.kind === 'chart') {
    return visual.block.type === 'pie' || visual.block.type === 'donut'
      ? drawPie(visual.block)
      : drawCartesian(visual.block);
  }
  return null;
}

export interface ExportFigure {
  /** Key of the picture in the export's image map. */
  ref: string;
  png: Buffer;
  /** Screen-reader text: title and values, since both are only pixels. */
  alt: string;
  note?: string;
}

/** One stretch of an exported message: Markdown, or a drawn figure. */
export type ExportSegment =
  { kind: 'markdown'; text: string } | { kind: 'figure'; figure: ExportFigure };

const FENCE_RE = /^[ \t]*(`{3,}|~{3,})[ \t]*([\w-]+)[^\n]*\n([\s\S]*?)\n[ \t]*\1[ \t]*$/gm;

/**
 * Split an answer into Markdown and figures. Chart and bars blocks become
 * figures; every other visual block becomes its text form inside the
 * Markdown; anything else is left untouched.
 */
export function segmentForExport(markdown: string): ExportSegment[] {
  const segments: ExportSegment[] = [];
  let text = '';
  let last = 0;
  let index = 0;
  for (const match of markdown.matchAll(FENCE_RE)) {
    const [whole, , lang = '', body = ''] = match;
    const visual = parseVisualBlock(lang, body);
    if (!visual) continue;
    text += markdown.slice(last, match.index);
    last = (match.index ?? 0) + whole.length;
    const png = renderVisualBlockImage(visual);
    if (!png) {
      text += visualBlockToText(visual);
      continue;
    }
    if (text.trim()) segments.push({ kind: 'markdown', text });
    text = '';
    const { note } = visual.block as { note?: string };
    segments.push({
      kind: 'figure',
      figure: {
        ref: `visual-${index++}`,
        png,
        alt: visualBlockToText({
          ...visual,
          block: { ...visual.block, note: undefined },
        } as VisualBlock)
          .replace(/[*_]/g, '')
          .replace(/\n+/g, '; '),
        ...(note && { note }),
      },
    });
  }
  text += markdown.slice(last);
  if (text.trim()) segments.push({ kind: 'markdown', text });
  return segments;
}
