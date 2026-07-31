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
  getPresentationBrandTheme,
  PRESENTATION_FONT_SIZE_SCALE,
  type PresentationBrandTheme,
  type Slide,
} from '@gruenerator/contracts';
import { marked, type Token } from 'marked';

import { validateUrlForFetch } from '../../utils/validation/urlSecurity.js';

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

const PAD_X = 72; // .gruene-slide padding-left/right
const PAD_Y = 64; // .gruene-slide padding-top/bottom
const MARGIN = inch(PAD_X);
const CONTENT_W = inch(960 - PAD_X * 2); // 8.5in

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
  };
}

/** Per-slide type scale, mirroring the CSS `--gs-font-scale`. `shrink` marks
 * auto-fit slides: they export at scale 1 with PowerPoint's own
 * shrink-on-overflow on the body boxes (applied by PowerPoint on first
 * edit/resize of the box — pptxgenjs cannot pre-compute the factor). */
interface TypeScale {
  fs: number;
  shrink: boolean;
}

function slideTypeScale(slide: Slide): TypeScale {
  if (slide.fontSize) return { fs: PRESENTATION_FONT_SIZE_SCALE[slide.fontSize], shrink: false };
  // Code slides are excluded from auto-fit on screen too (SlideSurface passes
  // `presetScale == null && !isCode`): their body is its own scroll container,
  // so the surface never overflows and a shrink would only misrepresent it.
  return { fs: 1, shrink: slide.layout !== 'code' };
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
  numbered?: boolean;
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

/**
 * Convert a slide's markdown body into pptxgenjs text runs, ONE ARRAY PER
 * PARAGRAPH. `emitLine` pushes one run per span, not per paragraph, so a flat
 * list cannot be cut safely: the two-column split used to slice it by index and
 * could land `**Wichtig**` and ` und dringend` in different columns.
 *
 * `italic` forces the quote style; `numbered` picks numbered vs dot bullets for
 * the content variants; `fontFace`/`bold` override the brand body face (the AT
 * quote uses Vollkorn, which ships only bold faces). Images are dropped —
 * the image layout handles them separately.
 */
function bodyToParagraphs(
  markdown: string,
  color: string,
  ctx: BrandCtx,
  opts: BodyOpts = {}
): PptxTextProps[][] {
  const tokens = marked.lexer(markdown);
  const paragraphs: PptxTextProps[][] = [];
  /** One paragraph per call, so callers can split on paragraph boundaries. */
  const emit = (runs: Run[], lineOpts: LineOpts): void => {
    const paragraph: PptxTextProps[] = [];
    emitLine(
      paragraph,
      runs,
      color,
      { ...lineOpts, fontFace: opts.fontFace, bold: opts.bold },
      ctx
    );
    paragraphs.push(paragraph);
  };
  const out = {
    push: (props: PptxTextProps) => paragraphs.push([props]),
  };

  for (const token of tokens) {
    const tok = token as Token & {
      tokens?: Token[];
      items?: { tokens?: Token[] }[];
      ordered?: boolean;
      text?: string;
    };
    if (tok.type === 'list' && tok.items) {
      const ordered = tok.ordered || opts.numbered;
      tok.items.forEach((item) => {
        const runs: Run[] = [];
        collectRuns(item.tokens, {}, runs);
        emit(runs, {
          bullet: ordered ? { type: 'number' } : { code: '2022' },
          indentLevel: 0,
          italic: opts.italic,
        });
      });
    } else if (tok.type === 'blockquote') {
      const runs: Run[] = [];
      collectRuns(tok.tokens, {}, runs);
      emit(runs, { italic: true });
    } else if (tok.type === 'heading') {
      const runs: Run[] = [];
      collectRuns(tok.tokens, { bold: true }, runs);
      emit(runs, { italic: opts.italic });
    } else if (tok.type === 'code') {
      out.push({
        text: tok.text ?? '',
        options: { color, fontFace: FONT_MONO, breakLine: true },
      });
    } else if (tok.type === 'paragraph') {
      const runs: Run[] = [];
      collectRuns(tok.tokens, {}, runs);
      emit(runs, { italic: opts.italic });
    }
  }

  return paragraphs;
}

/** Flat run list for the single-box layouts. */
function bodyToTextProps(
  markdown: string,
  color: string,
  ctx: BrandCtx,
  opts: BodyOpts = {}
): PptxTextProps[] {
  return bodyToParagraphs(markdown, color, ctx, opts).flat();
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
  ctx: BrandCtx,
  ts: TypeScale
): void {
  const tColor = titleColor(dark, accentHex);
  const bColor = bodyColor(dark);

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
        fontSize: pt(56 * ts.fs),
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
    for (const part of bodyToTextProps(data.body, bColor, ctx)) {
      const size = part.options?.fontSize ?? pt(28 * ts.fs);
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
  ctx: BrandCtx,
  ts: TypeScale
): void {
  const bColor = bodyColor(dark);
  const ruleColor = dark ? ctx.onDarkSoftHex : accentHex;

  if (data.title.trim()) {
    slide.addText(data.title, {
      x: MARGIN,
      y: inch(64),
      w: CONTENT_W,
      h: inch(80),
      fontFace: ctx.fontHead,
      fontSize: pt(44 * ts.fs),
      bold: true,
      lineSpacingMultiple: ctx.headingLine,
      color: titleColor(dark, accentHex),
      align: variant === 1 ? 'center' : 'left',
    });
  }

  if (variant === 0) {
    slide.addShape('rect', {
      x: MARGIN,
      y: inch(180),
      w: inch(6),
      h: inch(200),
      fill: { color: ruleColor },
    });
  }

  const bodyX = variant === 0 ? inch(PAD_X + 34) : MARGIN;
  // AT sets quotes in Vollkorn and forces weight 700 — the app ships only its
  // Bold/BlackItalic faces, so a regular would be a synthesized fake.
  const quoteRuns = bodyToTextProps(data.body, bColor, ctx, {
    italic: true,
    fontFace: ctx.fontQuote,
    bold: ctx.fontQuote !== null,
  });
  slide.addText(quoteRuns, {
    x: bodyX,
    y: inch(180),
    w: variant === 0 ? CONTENT_W - inch(34) : CONTENT_W,
    h: inch(220),
    valign: 'middle',
    align: variant === 1 ? 'center' : 'left',
    fontSize: pt(34 * ts.fs),
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
      y: inch(64),
      w: CONTENT_W,
      h: inch(70),
      fontFace: ctx.fontHead,
      fontSize: pt(44 * ts.fs),
      bold: true,
      lineSpacingMultiple: ctx.headingLine,
      color: titleColor(dark, accentHex),
    });
  }
  const panelY = inch(160);
  const panelH = PAGE_H - panelY - inch(PAD_Y);
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
    placeImage({ x: inch(400), y: inch(64), w: inch(488), h: inch(412) });
    return;
  }

  if (data.title.trim()) {
    slide.addText(data.title, {
      x: MARGIN,
      y: inch(64),
      w: CONTENT_W,
      h: inch(80),
      fontFace: ctx.fontHead,
      fontSize: pt(44 * ts.fs),
      bold: true,
      lineSpacingMultiple: ctx.headingLine,
      color: tColor,
    });
  }
  placeImage({ x: MARGIN, y: inch(160), w: CONTENT_W, h: inch(316) });
}

/** Content / split layouts: title top, bullet (or numbered / two-column) body. */
function addContentSlide(
  slide: PptxSlide,
  data: Slide,
  variant: number,
  accentHex: string,
  dark: boolean,
  split: boolean,
  ctx: BrandCtx,
  ts: TypeScale
): void {
  const bColor = bodyColor(dark);
  if (data.title.trim()) {
    slide.addText(data.title, {
      x: MARGIN,
      y: inch(64),
      w: CONTENT_W,
      h: inch(70),
      fontFace: ctx.fontHead,
      fontSize: pt(44 * ts.fs),
      bold: true,
      lineSpacingMultiple: ctx.headingLine,
      color: titleColor(dark, accentHex),
    });
  }

  const bodyY = inch(160);
  const bodyH = PAGE_H - bodyY - inch(PAD_Y);
  // `split` has no variant rules in the deck CSS — it is always plain bullets.
  // Without this guard a split slide the AI planner marked `variant: 2`
  // exported numbered while the screen showed dots.
  const paragraphs = bodyToParagraphs(data.body, bColor, ctx, {
    numbered: !split && variant === 2,
  });
  const runs = paragraphs.flat();

  if (split) {
    // Split on PARAGRAPH boundaries, never inside one.
    const mid = Math.ceil(paragraphs.length / 2);
    const left = paragraphs.slice(0, mid).flat();
    const right = paragraphs.slice(mid).flat();
    const colW = (CONTENT_W - inch(48)) / 2;
    slide.addText(left, {
      x: MARGIN,
      y: bodyY,
      w: colW,
      h: bodyH,
      fontSize: pt(28 * ts.fs),
      valign: 'top',
      lineSpacingMultiple: 1.15,
      ...(ts.shrink ? { fit: 'shrink' as const } : {}),
    });
    slide.addText(right.length ? right : [{ text: '' }], {
      x: MARGIN + colW + inch(48),
      y: bodyY,
      w: colW,
      h: bodyH,
      fontSize: pt(28 * ts.fs),
      valign: 'top',
      lineSpacingMultiple: 1.15,
      ...(ts.shrink ? { fit: 'shrink' as const } : {}),
    });
    return;
  }

  slide.addText(runs.length ? runs : [{ text: '' }], {
    x: MARGIN,
    y: bodyY,
    w: CONTENT_W,
    h: bodyH,
    fontSize: pt(28 * ts.fs),
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
  const ts = slideTypeScale(data);

  const bg = await resolveBackground(data, accent);
  slide.background = bg.image ? { data: bg.image } : { color: bg.color ?? WHITE_HEX };

  switch (data.layout) {
    case 'title':
      addTitleSlide(slide, data, variant, accentHex, bg.dark, ctx, ts);
      break;
    case 'quote':
      addQuoteSlide(slide, data, variant, accentHex, bg.dark, ctx, ts);
      break;
    case 'code':
      addCodeSlide(slide, data, accentHex, bg.dark, ctx, ts);
      break;
    case 'image':
      await addImageSlide(slide, data, variant, accentHex, bg.dark, ctx, ts);
      break;
    case 'split':
      addContentSlide(slide, data, variant, accentHex, bg.dark, true, ctx, ts);
      break;
    case 'content':
    default:
      addContentSlide(slide, data, variant, accentHex, bg.dark, false, ctx, ts);
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
