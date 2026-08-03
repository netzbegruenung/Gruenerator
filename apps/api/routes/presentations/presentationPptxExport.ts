/**
 * Native PPTX export for the WYSIWYG deck.
 *
 * Builds editable PowerPoint with pptxgenjs, mirroring the on-screen deck theme
 * (`packages/presentations/src/components/theme/gruene-deck.css` +
 * `SlideSurface.tsx`): the country-brand fonts (DE: GrueneType Neue/PT Sans, AT:
 * Gotham Narrow; JetBrains Mono for code), the deck
 * accent colour, per-layout + per-variant treatments (title side panel / top
 * bar, quote rule, numbered/card content, split columns, dark code panel) and
 * the light/dark text inversion derived from each slide's resolved background.
 *
 * The slide surface is 960×540 CSS px; the PPTX slide is a matching 16:9 layout
 * of 10×5.625 in, so 1 in = 96 px and a CSS px maps to 0.75 pt.
 */

import { Buffer } from 'buffer';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  fitScaleForRatio,
  getPresentationBrandTheme,
  PRESENTATION_FONT_SIZE_SCALE,
  type PresentationBrandTheme,
  type Slide,
} from '@gruenerator/contracts';
import { marked, type Token } from 'marked';

import { validateUrlForFetch } from '../../utils/validation/urlSecurity.js';

import { countLines, deckFaces, type DeckFaces } from './slideTextMetrics.js';

// pptxgenjs exposes its option interfaces as members of a `declare namespace`
// merged with the default-exported class. Under NodeNext neither a static
// default import (not constructable) nor `PptxGenJS.TextProps` namespace access
// resolves cleanly, so derive everything structurally from an import() type
// query and construct the class via a dynamic import at runtime.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- namespace-merged default resolves only via import() query
type PptxCtor = (typeof import('pptxgenjs'))['default'];
type PptxInstance = InstanceType<PptxCtor>;
type PptxSlide = ReturnType<PptxInstance['addSlide']>;
type PptxTextProps = Extract<Parameters<PptxSlide['addText']>[0], unknown[]>[number];
type PptxTextOptions = NonNullable<Parameters<PptxSlide['addText']>[1]>;
type PptxHAlign = NonNullable<PptxTextOptions['align']>;

// ── Geometry (CSS px → PPTX in/pt) ──────────────────────────────────────────
const PAGE_W = 10;
const PAGE_H = 5.625;
const PX_PER_IN = 96;
const inch = (px: number): number => px / PX_PER_IN;
const pt = (px: number): number => px * 0.75;

const SURFACE_H = 540; // .gruene-slide height
const PAD_X = 72; // .gruene-slide padding-left/right
const PAD_Y = 64; // .gruene-slide padding-top/bottom
const MARGIN = inch(PAD_X);
const CONTENT_W = inch(960 - PAD_X * 2); // 8.5in
const CONTENT_W_PX = 960 - PAD_X * 2;

// Type + rhythm from gruene-deck.css. Everything here is a slide-px value at
// scale 1; `--gs-font-scale` multiplies them (frame geometry stays fixed).
const COL_GAP = 20; // .gruene-slide gap
const BODY_FS = 28; // .gruene-slide__body font-size
const BODY_LH = 1.4; // .gruene-slide line-height
const TITLE_FS = 44; // .gruene-slide__title
const TITLE_FS_LARGE = 56; // .layout-title .gruene-slide__title
const QUOTE_FS = 34; // .layout-quote .gruene-slide__body
const BULLET_PAD = 26; // ul li padding-left
const ITEM_GAP = 14; // ul li margin-bottom
const PARA_GAP = 0.5; // p margin-bottom, in em
const SPLIT_GAP = 48; // .layout-split column-gap

// Content variant 1 "Karten": two-column card grid.
const CARD_GAP = 16;
const CARD_PAD_X = 20;
const CARD_PAD_Y = 18;
const CARD_RADIUS = 12; // border-radius is a literal px, never scaled
const CARD_BG = 'F0F5F2';
/** `rgba(255,255,255,.12)` as a pptxgenjs white fill + transparency percent. */
const CARD_BG_DARK_ALPHA = 88;

// Content variant 2 "Nummeriert": accent pills.
const PILL_SIZE = 30;
const PILL_PAD = 46; // li padding-left
const PILL_FS = 16;
const PILL_BG = 'EAF2EE';
/** `rgba(255,255,255,.16)`. */
const PILL_BG_DARK_ALPHA = 84;

const IMAGE_MAX_H = 380; // .layout-image .gruene-slide__body img max-height

// ── Palette (brand-neutral values; country CI comes from PRESENTATION_BRANDS) ─
const INK = '262A28';
const WHITE = 'FFFFFF';
const SAND = 'F5F1E9';
const CODE_BG = '1E2420';
const CODE_FG = 'E8EFE9';

const FONT_MONO = 'JetBrains Mono';

/** Per-export brand context: resolved once, threaded through the builders so
 * concurrent exports with different brands never share state. */
interface BrandCtx {
  fontHead: string;
  fontBody: string;
  /** Quote-layout face; null uses `fontBody`. */
  fontQuote: string | null;
  /** Hyperlink colour (brand accent), hex without #. */
  linkHex: string;
  /** Rule/bullet tint on dark surfaces, hex without #. */
  onDarkSoftHex: string;
  /** Headline line spacing (AT CI: 0.9). */
  headingLine: number;
  /** Preloaded title-slide logo (per background darkness), or null. */
  logo: { light: string; dark: string; w: number; h: number } | null;
  /** Local font aliases the measurement pass wraps text in. */
  faces: DeckFaces;
}

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public');

async function loadLogo(
  theme: PresentationBrandTheme,
  showLogo: boolean
): Promise<BrandCtx['logo']> {
  if (!showLogo) return null;
  try {
    const [light, dark] = await Promise.all(
      [theme.logo.light.apiFile, theme.logo.dark.apiFile].map(async (file) => {
        const buf = await readFile(path.join(PUBLIC_DIR, file));
        return `data:image/png;base64,${buf.toString('base64')}`;
      })
    );
    const h = inch(theme.logo.heightPx);
    return { light, dark, w: h * theme.logo.aspect, h };
  } catch {
    // Missing asset must never break the export — just omit the logo.
    return null;
  }
}

function buildBrandCtx(theme: PresentationBrandTheme, logo: BrandCtx['logo']): BrandCtx {
  return {
    fontHead: theme.pptxFonts.heading,
    fontBody: theme.pptxFonts.body,
    fontQuote: theme.pptxFonts.quote,
    linkHex: toHex(theme.colors.accent) ?? '52907A',
    onDarkSoftHex: toHex(theme.colors.onDarkSoft) ?? 'A9D3BE',
    headingLine: theme.headingLineHeight,
    logo,
    faces: deckFaces(theme.brand),
  };
}

/**
 * Per-slide type scale (the CSS `--gs-font-scale`) plus the geometry that
 * depends on it. `shrink` still asks PowerPoint for shrink-on-overflow as a
 * safety net — it is a no-op in LibreOffice/Keynote/Google Slides and only
 * applies in PowerPoint once the box is edited, which is exactly why `fs` is
 * now computed here instead of being left to the viewer.
 */
interface TypeScale {
  fs: number;
  shrink: boolean;
  /** Top of the body box in slide px — below the title, as the flex column lays out. */
  bodyTop: number;
  /** Remaining height for the body box in slide px. */
  bodyH: number;
}

/** Title type size for a layout, in slide px at scale 1. */
function titleFontPx(layout: Slide['layout']): number {
  return layout === 'title' ? TITLE_FS_LARGE : TITLE_FS;
}

/** Inline size available to the title, in slide px (variant side panels narrow it). */
function titleWidthPx(slide: Slide, variant: number): number {
  if (slide.layout === 'title' && variant === 1) return 960 - 403 - PAD_X;
  if (slide.layout === 'image' && variant === 1) return 326;
  return CONTENT_W_PX;
}

/** Wrapped title height in slide px at scale 1, or 0 when there is no title. */
async function measureTitle(slide: Slide, variant: number, ctx: BrandCtx): Promise<number> {
  if (!slide.title.trim()) return 0;
  const fontPx = titleFontPx(slide.layout);
  const lines = await countLines([{ text: slide.title }], {
    maxWidthPx: titleWidthPx(slide, variant),
    fontPx,
    faces: ctx.faces,
    face: ctx.faces.heading,
    bold: true,
  });
  return lines * fontPx * ctx.headingLine;
}

/**
 * Natural height of a body's blocks in slide px at scale 1 — the same stack the
 * browser produces, so the ratio below matches what `useAutoFitScale` measures.
 */
async function measureBlocks(
  blocks: Block[],
  ctx: BrandCtx,
  opts: { widthPx: number; fontPx: number; face?: string | null; bold?: boolean; variant?: number }
): Promise<number> {
  const wrap = {
    faces: ctx.faces,
    fontPx: opts.fontPx,
    ...(opts.face ? { face: opts.face } : {}),
    ...(opts.bold ? { bold: opts.bold } : {}),
  };
  const lineBox = opts.fontPx * BODY_LH;
  let total = 0;

  for (const block of blocks) {
    if (block.kind === 'list') {
      if (opts.variant === 1) {
        total += await measureCardGrid(block.items, ctx, opts.widthPx, opts.fontPx);
        continue;
      }
      const pad = opts.variant === 2 ? PILL_PAD : BULLET_PAD;
      for (const item of block.items) {
        const lines = await countLines(item.runs, { ...wrap, maxWidthPx: opts.widthPx - pad });
        const h = lines * lineBox;
        total += (opts.variant === 2 ? Math.max(h, PILL_SIZE) : h) + ITEM_GAP;
      }
    } else {
      const lines = await countLines(block.para.runs, { ...wrap, maxWidthPx: opts.widthPx });
      total += lines * lineBox + (block.kind === 'para' ? PARA_GAP * opts.fontPx : 0);
    }
  }
  return total;
}

/** Row heights of the two-column card grid, in slide px at scale 1. */
async function measureCards(
  items: Para[],
  ctx: BrandCtx,
  widthPx: number,
  fontPx: number
): Promise<{ colW: number; rows: number[] }> {
  const colW = (widthPx - CARD_GAP) / 2;
  const textW = colW - CARD_PAD_X * 2;
  const heights: number[] = [];
  for (const item of items) {
    const lines = await countLines(item.runs, {
      faces: ctx.faces,
      fontPx,
      maxWidthPx: textW,
    });
    heights.push(lines * fontPx * BODY_LH + CARD_PAD_Y * 2);
  }
  // CSS grid rows are as tall as their tallest item, and items stretch to fill.
  const rows: number[] = [];
  for (let i = 0; i < heights.length; i += 2) {
    rows.push(Math.max(heights[i], heights[i + 1] ?? 0));
  }
  return { colW, rows };
}

async function measureCardGrid(
  items: Para[],
  ctx: BrandCtx,
  widthPx: number,
  fontPx: number
): Promise<number> {
  const { rows } = await measureCards(items, ctx, widthPx, fontPx);
  return rows.reduce((sum, h) => sum + h, 0) + Math.max(0, rows.length - 1) * CARD_GAP;
}

/**
 * Resolve a slide's type scale and body geometry.
 *
 * The screen lays the surface out as a flex column: 64px padding, the title at
 * its natural wrapped height, a 20px gap, then the body. Both the title height
 * and the gap scale with the type scale, so the body top is not a constant —
 * it used to be pinned at 160px, which sat ~28px too low under a one-line DE
 * title and a full 96px too low when a slide had no title at all.
 *
 * Auto-fit ("Auto" size) then works out like the browser's: every contributor
 * to the column scales linearly, so one measurement at scale 1 gives the ratio
 * and `fitScaleForRatio` picks the same ladder step `useAutoFitScale` would
 * converge on by probing.
 */
async function slideTypeScale(slide: Slide, blocks: Block[], ctx: BrandCtx): Promise<TypeScale> {
  const variant = slide.variant ?? 0;
  const available = SURFACE_H - PAD_Y * 2;
  const titleH1 = await measureTitle(slide, variant, ctx);
  const gap1 = titleH1 > 0 ? COL_GAP : 0;

  let fs: number;
  let shrink: boolean;
  if (slide.fontSize) {
    fs = PRESENTATION_FONT_SIZE_SCALE[slide.fontSize];
    shrink = false;
  } else if (slide.layout === 'code') {
    // Code slides are excluded from auto-fit on screen too (SlideSurface passes
    // `presetScale == null && !isCode`): their body is its own scroll container,
    // so the surface never overflows and a shrink would only misrepresent it.
    fs = 1;
    shrink = false;
  } else {
    const measured = await measureBlocks(blocks, ctx, {
      widthPx: bodyWidthPx(slide, variant),
      fontPx: slide.layout === 'quote' ? QUOTE_FS : BODY_FS,
      ...(slide.layout === 'quote' && ctx.faces.quote ? { face: ctx.faces.quote, bold: true } : {}),
      ...(slide.layout === 'content' ? { variant } : {}),
    });
    // `column-count: 2` balances the body over two columns, so only about half
    // of it stacks vertically — measuring the whole run would shrink a split
    // slide roughly twice as far as the screen does.
    const bodyH1 = slide.layout === 'split' ? measured / 2 : measured;
    const natural = titleH1 + gap1 + bodyH1;
    // +1 mirrors the browser probe's `scrollHeight <= clientHeight + 1`.
    fs = natural > 0 ? fitScaleForRatio((available + 1) / natural) : 1;
    shrink = true;
  }

  const bodyTop = PAD_Y + fs * (titleH1 + gap1);
  return { fs, shrink, bodyTop, bodyH: Math.max(0, SURFACE_H - bodyTop - PAD_Y) };
}

/** Inline size available to a slide's body, in slide px. */
function bodyWidthPx(slide: Slide, variant: number): number {
  if (slide.layout === 'split') return (CONTENT_W_PX - SPLIT_GAP) / 2;
  if (slide.layout === 'quote') return variant === 0 ? CONTENT_W_PX - 34 : CONTENT_W_PX;
  if (slide.layout === 'title' && variant === 1) return 960 - 403 - PAD_X;
  return CONTENT_W_PX;
}

// ── Colour helpers ──────────────────────────────────────────────────────────
/** Normalise a CSS hex colour to a 6-digit uppercase string (no #), else null. */
function toHex(color: string | null | undefined): string | null {
  if (!color) return null;
  const raw = color.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return raw
      .split('')
      .map((c) => c + c)
      .join('')
      .toUpperCase();
  }
  return null;
}

/** Perceived-luminance dark test — mirrors SlideSurface.isDarkColor. */
function isDarkColor(c: string): boolean {
  const hex = toHex(c);
  if (!hex) return /^#?(00|31|0c|1b|05)/i.test(c.trim());
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

const SAND_HEX = SAND;
const WHITE_HEX = WHITE;

/** Default background for a (layout, variant) — mirrors SlideSurface.defaultBg. */
function defaultBg(layout: Slide['layout'], variant: number, accent: string): string {
  if (layout === 'title') return [accent, `#${WHITE_HEX}`, `#${SAND_HEX}`][variant] ?? accent;
  if (layout === 'quote') return [accent, `#${SAND_HEX}`][variant] ?? accent;
  return `#${WHITE_HEX}`;
}

interface ResolvedBg {
  /** Solid slide fill (hex, no #). Null when an image fill is used. */
  color: string | null;
  /** data: URL for an image background, when resolved. */
  image: string | null;
  /** Whether the surface uses light (white) text. */
  dark: boolean;
}

/**
 * Intrinsic size of a data: URL image.
 *
 * Needed because pptxgenjs never decodes images in Node: its `sizing.contain`
 * fits against the w/h the caller declared, not the real ones, so it cannot
 * correct an aspect ratio (and emits a negative <a:srcRect> letterbox that
 * LibreOffice and Keynote render inconsistently). We compute the contain box
 * ourselves instead.
 */
async function imageSize(dataUrl: string): Promise<{ w: number; h: number } | null> {
  try {
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const { default: sharp } = await import('sharp');
    const meta = await sharp(Buffer.from(base64, 'base64')).metadata();
    return meta.width && meta.height ? { w: meta.width, h: meta.height } : null;
  } catch {
    return null;
  }
}

/** CSS `object-fit: contain`: largest centred rect of `natW×natH` inside `box`. */
function containRect(
  natW: number,
  natH: number,
  box: { x: number; y: number; w: number; h: number }
): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(box.w / natW, box.h / natH);
  const w = natW * scale;
  const h = natH * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/**
 * Fetch a remote/data image as a base64 data URL for embedding. Remote URLs are
 * SSRF-validated; relative paths (e.g. `/images/x.jpg`) and any failure resolve
 * to null so the caller can fall back to a solid fill.
 */
async function fetchImageData(url: string): Promise<string | null> {
  if (url.startsWith('data:image/')) return url;
  if (!/^https?:\/\//i.test(url)) return null;
  const validation = await validateUrlForFetch(url);
  if (!validation.isValid || !validation.url) return null;
  try {
    const res = await fetch(validation.url.toString(), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 6_000_000) return null;
    return `data:${contentType};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Resolve a slide's effective background into a PPTX fill — mirrors resolveBackground. */
async function resolveBackground(slide: Slide, accent: string): Promise<ResolvedBg> {
  const bg = slide.background?.trim() || defaultBg(slide.layout, slide.variant ?? 0, accent);
  if (/^(https?:|data:|\/)/.test(bg)) {
    const image = await fetchImageData(bg);
    if (image) return { color: null, image, dark: true };
    return { color: toHex(accent) ?? INK, image: null, dark: true };
  }
  if (/gradient\(/.test(bg)) {
    // pptxgenjs has no CSS-gradient fill — approximate with the accent colour.
    return { color: toHex(accent) ?? INK, image: null, dark: true };
  }
  return { color: toHex(bg) ?? WHITE_HEX, image: null, dark: isDarkColor(bg) };
}

// ── Markdown body → pptxgenjs text runs ─────────────────────────────────────
interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  mono?: boolean;
  link?: string;
}

/** Flatten marked inline tokens into styled runs (recursing through emphasis). */
function collectRuns(tokens: Token[] | undefined, style: Omit<Run, 'text'>, out: Run[]): void {
  if (!tokens) return;
  for (const t of tokens) {
    const tok = t as Token & { tokens?: Token[]; text?: string; href?: string };
    switch (tok.type) {
      case 'strong':
        collectRuns(tok.tokens, { ...style, bold: true }, out);
        break;
      case 'em':
        collectRuns(tok.tokens, { ...style, italic: true }, out);
        break;
      case 'del':
        collectRuns(tok.tokens, { ...style, strike: true }, out);
        break;
      case 'link':
        collectRuns(tok.tokens, tok.href ? { ...style, link: tok.href } : style, out);
        break;
      case 'codespan':
        if (tok.text) out.push({ text: tok.text, mono: true, ...style });
        break;
      case 'br':
        out.push({ text: '\n', ...style });
        break;
      case 'text':
        if (tok.tokens?.length) collectRuns(tok.tokens, style, out);
        else if (tok.text) out.push({ text: tok.text, ...style });
        break;
      default:
        if (tok.text) out.push({ text: tok.text, ...style });
    }
  }
}

interface LineOpts {
  bullet?: PptxTextOptions['bullet'] | undefined;
  indentLevel?: number | undefined;
  italic?: boolean | undefined;
  /** Overrides the brand body face (the quote layout uses its own). */
  fontFace?: string | null | undefined;
  bold?: boolean | undefined;
}

interface BodyOpts {
  italic?: boolean;
  /** List marker style; 'none' when a content variant draws its own. */
  bullets?: BulletStyle;
  /** Overrides the brand body face for every run (quote layout). */
  fontFace?: string | null;
  bold?: boolean;
}

/** Emit one paragraph (a run of text objects terminated by breakLine). */
function emitLine(
  out: PptxTextProps[],
  runs: Run[],
  color: string,
  lineOpts: LineOpts,
  ctx: BrandCtx
): void {
  const effective = runs.length ? runs : [{ text: '' }];
  effective.forEach((run, idx) => {
    const options: PptxTextOptions = {
      color: run.link ? ctx.linkHex : color,
      // Runs carry the face, so a box-level `fontFace` would never win — the
      // override has to be threaded down to here.
      fontFace: run.mono ? FONT_MONO : (lineOpts.fontFace ?? ctx.fontBody),
      breakLine: idx === effective.length - 1,
    };
    if (run.bold || lineOpts.bold) options.bold = true;
    if (run.italic || lineOpts.italic) options.italic = true;
    if (run.strike) options.strike = true;
    if (run.link) options.hyperlink = { url: run.link };
    if (idx === 0 && lineOpts.bullet) options.bullet = lineOpts.bullet;
    if (idx === 0 && lineOpts.indentLevel !== undefined) options.indentLevel = lineOpts.indentLevel;
    out.push({ text: run.text, options });
  });
}

/** One paragraph: the styled spans (for measuring) plus the emitted pptx runs. */
interface Para {
  runs: Run[];
  props: PptxTextProps[];
}

/**
 * A body block, mirroring the markdown structure the deck CSS styles. Lists
 * stay grouped because the content variants restyle `ul li` as a whole — cards
 * (v1) and numbered pills (v2) need to address the items, not a flat run list.
 */
type Block =
  | { kind: 'list'; ordered: boolean; items: Para[] }
  | { kind: 'para'; para: Para }
  | { kind: 'code'; para: Para };

/** How list markers are produced: by PowerPoint, or by shapes we draw ourselves. */
type BulletStyle = 'dot' | 'number' | 'none';

/**
 * Convert a slide's markdown body into blocks of pptxgenjs text runs, ONE ARRAY
 * PER PARAGRAPH. `emitLine` pushes one run per span, not per paragraph, so a
 * flat list cannot be cut safely: the two-column split used to slice it by
 * index and could land `**Wichtig**` and ` und dringend` in different columns.
 *
 * `italic` forces the quote style; `bullets` picks the list marker ('none' when
 * a variant draws its own); `fontFace`/`bold` override the brand body face (the
 * AT quote uses Vollkorn, which ships only bold faces). Images are dropped —
 * the image layout handles them separately.
 */
function bodyToBlocks(
  markdown: string,
  color: string,
  ctx: BrandCtx,
  opts: BodyOpts = {}
): Block[] {
  const tokens = marked.lexer(markdown);
  const blocks: Block[] = [];
  const para = (runs: Run[], lineOpts: LineOpts): Para => {
    const props: PptxTextProps[] = [];
    emitLine(props, runs, color, { ...lineOpts, fontFace: opts.fontFace, bold: opts.bold }, ctx);
    return { runs, props };
  };

  for (const token of tokens) {
    const tok = token as Token & {
      tokens?: Token[];
      items?: { tokens?: Token[] }[];
      ordered?: boolean;
      text?: string;
    };
    if (tok.type === 'list' && tok.items) {
      const ordered = tok.ordered || opts.bullets === 'number';
      const marker: LineOpts['bullet'] =
        opts.bullets === 'none' ? undefined : ordered ? { type: 'number' } : { code: '2022' };
      const items = tok.items.map((item) => {
        const runs: Run[] = [];
        collectRuns(item.tokens, {}, runs);
        return para(runs, { bullet: marker, indentLevel: 0, italic: opts.italic });
      });
      blocks.push({ kind: 'list', ordered, items });
    } else if (tok.type === 'blockquote') {
      const runs: Run[] = [];
      collectRuns(tok.tokens, {}, runs);
      blocks.push({ kind: 'para', para: para(runs, { italic: true }) });
    } else if (tok.type === 'heading') {
      const runs: Run[] = [];
      collectRuns(tok.tokens, { bold: true }, runs);
      blocks.push({ kind: 'para', para: para(runs, { italic: opts.italic }) });
    } else if (tok.type === 'code') {
      const runs: Run[] = [{ text: tok.text ?? '', mono: true }];
      blocks.push({
        kind: 'code',
        para: {
          runs,
          props: [
            { text: tok.text ?? '', options: { color, fontFace: FONT_MONO, breakLine: true } },
          ],
        },
      });
    } else if (tok.type === 'paragraph') {
      const runs: Run[] = [];
      collectRuns(tok.tokens, {}, runs);
      blocks.push({ kind: 'para', para: para(runs, { italic: opts.italic }) });
    }
  }

  return blocks;
}

/** Every paragraph in document order — the unit the split layout may cut on. */
function blocksToParagraphs(blocks: Block[]): PptxTextProps[][] {
  return blocks.flatMap((block) =>
    block.kind === 'list' ? block.items.map((i) => i.props) : [block.para.props]
  );
}

/**
 * Body parsing options for a slide. One place, because the measurement pass and
 * the render pass must agree: measuring dot bullets and then drawing cards
 * would place every card at the wrong height.
 */
function bodyOpts(data: Slide, variant: number, ctx: BrandCtx): BodyOpts {
  if (data.layout === 'quote') {
    // AT sets quotes in Vollkorn and forces weight 700 — the app ships only its
    // Bold/BlackItalic faces, so a regular would be a synthesized fake.
    return { italic: true, fontFace: ctx.fontQuote, bold: ctx.fontQuote !== null };
  }
  // `split` has no variant rules in the deck CSS — it is always plain bullets.
  // Without this guard a split slide the AI planner marked `variant: 2`
  // exported numbered while the screen showed dots.
  if (data.layout !== 'content') return {};
  // Variants 1 (cards) and 2 (pills) draw their own markers.
  if (variant === 1 || variant === 2) return { bullets: 'none' };
  return {};
}

/** First markdown image URL in a body, if any (for the image layout). */
function firstImageUrl(markdown: string): string | null {
  const match = markdown.match(/!\[[^\]]*\]\(([^)]+)\)/);
  return match ? match[1].trim() : null;
}

// ── Slide builders ──────────────────────────────────────────────────────────
function titleColor(dark: boolean, accentHex: string): string {
  return dark ? WHITE : accentHex;
}
function bodyColor(dark: boolean): string {
  return dark ? WHITE : INK;
}

/** Title layout: v0 centered, v1 left + accent side panel, v2 left + accent top bar. */
function addTitleSlide(
  slide: PptxSlide,
  data: Slide,
  variant: number,
  accentHex: string,
  dark: boolean,
  blocks: Block[],
  ctx: BrandCtx,
  ts: TypeScale
): void {
  const tColor = titleColor(dark, accentHex);

  if (variant === 1) {
    slide.addShape('rect', {
      x: inch(960 - 346),
      y: 0,
      w: inch(346),
      h: PAGE_H,
      fill: { color: accentHex },
    });
  }

  const textW = variant === 1 ? inch(960 - 403 - PAD_X) : CONTENT_W;
  const align: PptxHAlign = variant === 0 ? 'center' : 'left';

  if (variant === 2) {
    slide.addShape('roundRect', {
      x: MARGIN,
      y: inch(232),
      w: inch(64),
      h: inch(8),
      rectRadius: inch(4),
      fill: { color: accentHex },
    });
  }

  const runs: PptxTextProps[] = [];
  if (data.title.trim()) {
    runs.push({
      text: data.title,
      options: {
        fontFace: ctx.fontHead,
        fontSize: pt(TITLE_FS_LARGE * ts.fs),
        bold: true,
        color: tColor,
        breakLine: true,
        // Headline leading is a CI property (AT: 0.9 × size); paragraph-level
        // so the subtitle below keeps the default block spacing.
        lineSpacingMultiple: ctx.headingLine,
      },
    });
  }
  if (data.body.trim()) {
    for (const part of blocksToParagraphs(blocks).flat()) {
      const size = part.options?.fontSize ?? pt(BODY_FS * ts.fs);
      runs.push({ text: part.text ?? '', options: { ...part.options, fontSize: size } });
    }
  }

  slide.addText(runs.length ? runs : [{ text: '' }], {
    x: MARGIN,
    y: variant === 2 ? inch(252) : 0,
    w: textW,
    h: variant === 2 ? PAGE_H - inch(252) - inch(PAD_Y) : PAGE_H,
    align,
    valign: variant === 0 ? 'middle' : variant === 1 ? 'middle' : 'top',
    lineSpacingMultiple: 1.15,
    ...(ts.shrink ? { fit: 'shrink' as const } : {}),
  });
}

/** Quote layout: italic, larger body, v0 with an accent left rule; v1 centered. */
function addQuoteSlide(
  slide: PptxSlide,
  data: Slide,
  variant: number,
  accentHex: string,
  dark: boolean,
  blocks: Block[],
  ctx: BrandCtx,
  ts: TypeScale
): void {
  const ruleColor = dark ? ctx.onDarkSoftHex : accentHex;

  if (data.title.trim()) {
    slide.addText(data.title, {
      x: MARGIN,
      y: inch(PAD_Y),
      w: CONTENT_W,
      h: inch(ts.bodyTop - PAD_Y),
      fontFace: ctx.fontHead,
      fontSize: pt(TITLE_FS * ts.fs),
      bold: true,
      lineSpacingMultiple: ctx.headingLine,
      color: titleColor(dark, accentHex),
      align: variant === 1 ? 'center' : 'left',
      valign: 'top',
    });
  }

  // The quote block is vertically centred (`justify-content: center`), so 180px
  // is the right resting place for a one-line title — but the title box now
  // grows with the measured text, and a three-line quote title would run
  // straight through the body. Never start above the title's bottom edge.
  const bodyY = Math.max(180, ts.bodyTop);
  const bodyH = SURFACE_H - bodyY - PAD_Y;

  if (variant === 0) {
    slide.addShape('rect', {
      x: MARGIN,
      y: inch(bodyY),
      w: inch(6),
      h: inch(bodyH),
      fill: { color: ruleColor },
    });
  }

  const bodyX = variant === 0 ? inch(PAD_X + 34) : MARGIN;
  const quoteRuns = blocksToParagraphs(blocks).flat();
  slide.addText(quoteRuns.length ? quoteRuns : [{ text: '' }], {
    x: bodyX,
    y: inch(bodyY),
    w: variant === 0 ? CONTENT_W - inch(34) : CONTENT_W,
    h: inch(bodyH),
    valign: 'middle',
    align: variant === 1 ? 'center' : 'left',
    fontSize: pt(QUOTE_FS * ts.fs),
    italic: true,
    lineSpacingMultiple: 1.2,
    ...(ts.shrink ? { fit: 'shrink' as const } : {}),
  });
}

/** Code layout: dark monospace panel. */
function addCodeSlide(
  slide: PptxSlide,
  data: Slide,
  accentHex: string,
  dark: boolean,
  ctx: BrandCtx,
  ts: TypeScale
): void {
  if (data.title.trim()) {
    slide.addText(data.title, {
      x: MARGIN,
      y: inch(PAD_Y),
      w: CONTENT_W,
      h: inch(ts.bodyTop - PAD_Y),
      fontFace: ctx.fontHead,
      fontSize: pt(TITLE_FS * ts.fs),
      bold: true,
      lineSpacingMultiple: ctx.headingLine,
      color: titleColor(dark, accentHex),
      valign: 'top',
    });
  }
  const panelY = inch(ts.bodyTop);
  const panelH = inch(ts.bodyH);
  slide.addShape('roundRect', {
    x: MARGIN,
    y: panelY,
    w: CONTENT_W,
    h: panelH,
    rectRadius: inch(8),
    fill: { color: CODE_BG },
  });
  slide.addText(data.body, {
    x: MARGIN + inch(24),
    y: panelY + inch(20),
    w: CONTENT_W - inch(48),
    h: panelH - inch(40),
    fontFace: FONT_MONO,
    fontSize: pt(20 * ts.fs),
    color: CODE_FG,
    valign: 'top',
    lineSpacingMultiple: 1.45,
    ...(ts.shrink ? { fit: 'shrink' as const } : {}),
  });
}

/** Image layout: title top; embedded image below (v0) or right (v1). */
async function addImageSlide(
  slide: PptxSlide,
  data: Slide,
  variant: number,
  accentHex: string,
  dark: boolean,
  ctx: BrandCtx,
  ts: TypeScale
): Promise<void> {
  const imgUrl = firstImageUrl(data.body);
  const imgData = imgUrl ? await fetchImageData(imgUrl) : null;
  const natural = imgData ? await imageSize(imgData) : null;
  const tColor = titleColor(dark, accentHex);

  /** Place the picture aspect-correct; fall back to filling the box. */
  const placeImage = (box: { x: number; y: number; w: number; h: number }): void => {
    if (!imgData) return;
    const rect = natural ? containRect(natural.w, natural.h, box) : box;
    slide.addImage({ data: imgData, ...rect });
  };

  if (variant === 1) {
    if (data.title.trim()) {
      slide.addText(data.title, {
        x: MARGIN,
        y: 0,
        w: inch(326),
        h: PAGE_H,
        fontFace: ctx.fontHead,
        fontSize: pt(44 * ts.fs),
        bold: true,
        color: tColor,
        valign: 'middle',
        lineSpacingMultiple: ctx.headingLine,
      });
    }
    const sideH = Math.min(SURFACE_H - PAD_Y * 2, IMAGE_MAX_H);
    placeImage({
      x: inch(400),
      y: inch((SURFACE_H - sideH) / 2),
      w: inch(488),
      h: inch(sideH),
    });
    return;
  }

  if (data.title.trim()) {
    slide.addText(data.title, {
      x: MARGIN,
      y: inch(PAD_Y),
      w: CONTENT_W,
      h: inch(ts.bodyTop - PAD_Y),
      fontFace: ctx.fontHead,
      fontSize: pt(TITLE_FS * ts.fs),
      bold: true,
      lineSpacingMultiple: ctx.headingLine,
      color: tColor,
      valign: 'top',
    });
  }
  // The body box centres the picture, which `max-height: 380px` caps.
  const boxH = Math.min(ts.bodyH, IMAGE_MAX_H);
  placeImage({
    x: MARGIN,
    y: inch(ts.bodyTop + (ts.bodyH - boxH) / 2),
    w: CONTENT_W,
    h: inch(boxH),
  });
}

/**
 * Content variant 1 "Karten": the deck CSS turns the body `ul` into a
 * two-column grid of rounded cards and hides the bullet. Each card is its own
 * shape + text box, and grid rows are as tall as their tallest card.
 */
async function addCardGrid(
  slide: PptxSlide,
  items: Para[],
  top: number,
  dark: boolean,
  ctx: BrandCtx,
  ts: TypeScale
): Promise<number> {
  const { colW, rows } = await measureCards(items, ctx, CONTENT_W_PX, BODY_FS * ts.fs);
  const fill = dark
    ? { color: WHITE, transparency: CARD_BG_DARK_ALPHA }
    : { color: CARD_BG, transparency: 0 };

  let y = top;
  rows.forEach((rowH, row) => {
    for (let col = 0; col < 2; col += 1) {
      const item = items[row * 2 + col];
      if (!item) continue;
      const x = PAD_X + col * (colW + CARD_GAP);
      slide.addShape('roundRect', {
        x: inch(x),
        y: inch(y),
        w: inch(colW),
        h: inch(rowH),
        rectRadius: inch(CARD_RADIUS),
        fill,
      });
      slide.addText(item.props, {
        x: inch(x + CARD_PAD_X),
        y: inch(y + CARD_PAD_Y),
        w: inch(colW - CARD_PAD_X * 2),
        h: inch(rowH - CARD_PAD_Y * 2),
        fontSize: pt(BODY_FS * ts.fs),
        valign: 'top',
        lineSpacingMultiple: BODY_LH,
      });
    }
    y += rowH + (row < rows.length - 1 ? CARD_GAP : 0);
  });
  return y;
}

/**
 * Content variant 2 "Nummeriert": a 30px accent pill carrying the index in the
 * heading face, with the item text indented past it. PowerPoint's own numbering
 * (what this used to emit) cannot be styled that way — wrong shape, wrong
 * colour, wrong font.
 */
async function addNumberedList(
  slide: PptxSlide,
  items: Para[],
  top: number,
  accentHex: string,
  dark: boolean,
  ctx: BrandCtx,
  ts: TypeScale
): Promise<number> {
  const fontPx = BODY_FS * ts.fs;
  const pill = PILL_SIZE * ts.fs;
  const pad = PILL_PAD * ts.fs;
  const fill = dark
    ? { color: WHITE, transparency: PILL_BG_DARK_ALPHA }
    : { color: PILL_BG, transparency: 0 };

  let y = top;
  for (const [index, item] of items.entries()) {
    const lines = await countLines(item.runs, {
      faces: ctx.faces,
      fontPx,
      maxWidthPx: CONTENT_W_PX - pad,
    });
    const h = Math.max(lines * fontPx * BODY_LH, pill);
    slide.addShape('ellipse', {
      x: MARGIN,
      y: inch(y),
      w: inch(pill),
      h: inch(pill),
      fill,
    });
    slide.addText(String(index + 1), {
      x: MARGIN,
      y: inch(y),
      w: inch(pill),
      h: inch(pill),
      align: 'center',
      valign: 'middle',
      fontFace: ctx.fontHead,
      fontSize: pt(PILL_FS * ts.fs),
      bold: true,
      color: dark ? WHITE : accentHex,
    });
    slide.addText(item.props, {
      x: inch(PAD_X + pad),
      y: inch(y),
      w: inch(CONTENT_W_PX - pad),
      h: inch(h),
      fontSize: pt(fontPx),
      valign: 'middle',
      lineSpacingMultiple: BODY_LH,
    });
    y += h + ITEM_GAP * ts.fs;
  }
  return y;
}

/** Content / split layouts: title top, bullet (or card / numbered / two-column) body. */
async function addContentSlide(
  slide: PptxSlide,
  data: Slide,
  variant: number,
  accentHex: string,
  dark: boolean,
  split: boolean,
  blocks: Block[],
  ctx: BrandCtx,
  ts: TypeScale
): Promise<void> {
  if (data.title.trim()) {
    slide.addText(data.title, {
      x: MARGIN,
      y: inch(PAD_Y),
      w: inch(titleWidthPx(data, variant)),
      h: inch(ts.bodyTop - PAD_Y),
      fontFace: ctx.fontHead,
      fontSize: pt(TITLE_FS * ts.fs),
      bold: true,
      lineSpacingMultiple: ctx.headingLine,
      color: titleColor(dark, accentHex),
      valign: 'top',
    });
  }

  const bodyY = inch(ts.bodyTop);
  const bodyH = inch(ts.bodyH);

  if (split) {
    // Split on PARAGRAPH boundaries, never inside one.
    const paragraphs = blocksToParagraphs(blocks);
    const mid = Math.ceil(paragraphs.length / 2);
    const left = paragraphs.slice(0, mid).flat();
    const right = paragraphs.slice(mid).flat();
    const colW = (CONTENT_W - inch(SPLIT_GAP)) / 2;
    slide.addText(left.length ? left : [{ text: '' }], {
      x: MARGIN,
      y: bodyY,
      w: colW,
      h: bodyH,
      fontSize: pt(BODY_FS * ts.fs),
      valign: 'top',
      lineSpacingMultiple: 1.15,
      ...(ts.shrink ? { fit: 'shrink' as const } : {}),
    });
    slide.addText(right.length ? right : [{ text: '' }], {
      x: MARGIN + colW + inch(SPLIT_GAP),
      y: bodyY,
      w: colW,
      h: bodyH,
      fontSize: pt(BODY_FS * ts.fs),
      valign: 'top',
      lineSpacingMultiple: 1.15,
      ...(ts.shrink ? { fit: 'shrink' as const } : {}),
    });
    return;
  }

  // Variants 1/2 restyle list items into shapes we place ourselves; anything
  // that is not a list (and every other variant) stays one plain text box.
  if (variant === 1 || variant === 2) {
    let y = ts.bodyTop;
    for (const block of blocks) {
      if (block.kind === 'list') {
        y =
          variant === 1
            ? await addCardGrid(slide, block.items, y, dark, ctx, ts)
            : await addNumberedList(slide, block.items, y, accentHex, dark, ctx, ts);
        continue;
      }
      const lines = await countLines(block.para.runs, {
        faces: ctx.faces,
        fontPx: BODY_FS * ts.fs,
        maxWidthPx: CONTENT_W_PX,
      });
      const h = lines * BODY_FS * ts.fs * BODY_LH;
      slide.addText(block.para.props, {
        x: MARGIN,
        y: inch(y),
        w: CONTENT_W,
        h: inch(h),
        fontSize: pt(BODY_FS * ts.fs),
        valign: 'top',
        lineSpacingMultiple: BODY_LH,
      });
      y += h + PARA_GAP * BODY_FS * ts.fs;
    }
    return;
  }

  const runs = blocksToParagraphs(blocks).flat();
  slide.addText(runs.length ? runs : [{ text: '' }], {
    x: MARGIN,
    y: bodyY,
    w: CONTENT_W,
    h: bodyH,
    fontSize: pt(BODY_FS * ts.fs),
    valign: 'top',
    lineSpacingMultiple: 1.15,
    ...(ts.shrink ? { fit: 'shrink' as const } : {}),
  });
}

async function addSlide(
  pptx: PptxInstance,
  data: Slide,
  accent: string,
  showNotes: boolean,
  ctx: BrandCtx
): Promise<void> {
  const slide = pptx.addSlide();
  const accentHex = toHex(accent) ?? '316049';
  const variant = data.variant ?? 0;

  const bg = await resolveBackground(data, accent);
  slide.background = bg.image ? { data: bg.image } : { color: bg.color ?? WHITE_HEX };

  const blocks = bodyToBlocks(data.body, bodyColor(bg.dark), ctx, bodyOpts(data, variant, ctx));
  const ts = await slideTypeScale(data, blocks, ctx);

  switch (data.layout) {
    case 'title':
      addTitleSlide(slide, data, variant, accentHex, bg.dark, blocks, ctx, ts);
      break;
    case 'quote':
      addQuoteSlide(slide, data, variant, accentHex, bg.dark, blocks, ctx, ts);
      break;
    case 'code':
      addCodeSlide(slide, data, accentHex, bg.dark, ctx, ts);
      break;
    case 'image':
      await addImageSlide(slide, data, variant, accentHex, bg.dark, ctx, ts);
      break;
    case 'split':
      await addContentSlide(slide, data, variant, accentHex, bg.dark, true, blocks, ctx, ts);
      break;
    case 'content':
    default:
      await addContentSlide(slide, data, variant, accentHex, bg.dark, false, blocks, ctx, ts);
  }

  // Country logo, title slides only. Variant 1 (Geteilt) puts the accent side
  // panel bottom-right where the logo sits → on-dark variant even on light bg.
  if (data.layout === 'title' && ctx.logo) {
    const onDark = bg.dark || variant === 1;
    slide.addImage({
      data: onDark ? ctx.logo.dark : ctx.logo.light,
      x: PAGE_W - inch(40) - ctx.logo.w,
      y: PAGE_H - inch(36) - ctx.logo.h,
      w: ctx.logo.w,
      h: ctx.logo.h,
    });
  }

  if (showNotes && data.notes.trim()) slide.addNotes(data.notes.trim());
}

export interface PptxExportOptions {
  /** Country CI ('de-DE' | 'de-AT'); anything else exports the de-DE theme. */
  brand?: string | null;
  /** Render the party logo on title-layout slides (default true). */
  showLogo?: boolean;
}

/**
 * Build a themed, editable PPTX buffer from a deck. Hidden slides are omitted;
 * `accent` drives titles, panels and markers (defaults to the brand green).
 * Fonts/palette/logo follow the deck's country brand (DE ↔ AT CI).
 */
export async function exportPresentationToPptx(
  slides: readonly Slide[],
  title: string,
  accent?: string | null,
  opts?: PptxExportOptions
): Promise<Buffer> {
  const pptxModule = await import('pptxgenjs');
  const PptxGenJS = (pptxModule.default ?? pptxModule) as unknown as PptxCtor;
  const pptx = new PptxGenJS();

  pptx.author = 'Grünerator';
  pptx.subject = 'Präsentation';
  pptx.title = title || 'Präsentation';
  pptx.defineLayout({ name: 'GRUENE_16x9', width: PAGE_W, height: PAGE_H });
  pptx.layout = 'GRUENE_16x9';

  const theme = getPresentationBrandTheme(opts?.brand);
  const ctx = buildBrandCtx(theme, await loadLogo(theme, opts?.showLogo !== false));
  const deckAccent = accent?.trim() || theme.defaultAccent;
  for (const slide of slides) {
    if (slide.hidden) continue;
    await addSlide(pptx, slide, deckAccent, true, ctx);
  }

  const out = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  return out;
}

// ── Download filename helpers (Content-Disposition) ─────────────────────────
/** Human-readable filename (Unicode letters kept) for the UTF-8 `filename*` param. */
export function sanitizeFilename(title: string): string {
  const cleaned = title
    .replace(/[^\p{L}\p{N}\-_ ]/gu, '')
    .trim()
    .slice(0, 80);
  return cleaned || 'Praesentation';
}

/**
 * ASCII-only fallback for the bare `filename=` token: RFC 6266 forbids raw
 * non-ASCII there, and Node's setHeader rejects some bytes. Transliterate German
 * umlauts, drop any other non-ASCII.
 */
export function asciiFilename(title: string): string {
  const cleaned = title
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/["\\]/g, '')
    .replace(/[^A-Za-z0-9\-_ ]/g, '')
    .trim()
    .slice(0, 80);
  return cleaned || 'Praesentation';
}

/**
 * Build a Content-Disposition value with an ASCII `filename=` fallback plus a
 * UTF-8 `filename*` (RFC 5987) so umlaut titles download with correct names.
 */
export function contentDispositionAttachment(title: string): string {
  const ascii = `${asciiFilename(title)}.pptx`;
  const utf8 = encodeURIComponent(`${sanitizeFilename(title)}.pptx`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
