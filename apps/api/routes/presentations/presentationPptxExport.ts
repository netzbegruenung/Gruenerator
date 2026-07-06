/**
 * Native PPTX export for the WYSIWYG deck.
 *
 * Builds editable PowerPoint with pptxgenjs, mirroring the on-screen deck theme
 * (`packages/presentations/src/components/theme/gruene-deck.css` +
 * `SlideSurface.tsx`): brand fonts (Raleway/PT Sans/JetBrains Mono), the deck
 * accent colour, per-layout + per-variant treatments (title side panel / top
 * bar, quote rule, numbered/card content, split columns, dark code panel) and
 * the light/dark text inversion derived from each slide's resolved background.
 *
 * The slide surface is 960×540 CSS px; the PPTX slide is a matching 16:9 layout
 * of 10×5.625 in, so 1 in = 96 px and a CSS px maps to 0.75 pt.
 */

import { Buffer } from 'buffer';

import { type Slide } from '@gruenerator/contracts';
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
const MARGIN = inch(PAD_X);
const CONTENT_W = inch(960 - PAD_X * 2); // 8.5in

// ── Brand palette (mirrors gruene-deck.css) ─────────────────────────────────
const INK = '262A28';
const WHITE = 'FFFFFF';
const SAND = 'F5F1E9';
const CODE_BG = '1E2420';
const CODE_FG = 'E8EFE9';
const KLEE = '52907A';

const FONT_HEAD = 'Raleway';
const FONT_BODY = 'PT Sans';
const FONT_MONO = 'JetBrains Mono';

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
}

/** Emit one paragraph (a run of text objects terminated by breakLine). */
function emitLine(out: PptxTextProps[], runs: Run[], color: string, lineOpts: LineOpts): void {
  const effective = runs.length ? runs : [{ text: '' }];
  effective.forEach((run, idx) => {
    const options: PptxTextOptions = {
      color: run.link ? KLEE : color,
      fontFace: run.mono ? FONT_MONO : FONT_BODY,
      breakLine: idx === effective.length - 1,
    };
    if (run.bold) options.bold = true;
    if (run.italic || lineOpts.italic) options.italic = true;
    if (run.strike) options.strike = true;
    if (run.link) options.hyperlink = { url: run.link };
    if (idx === 0 && lineOpts.bullet) options.bullet = lineOpts.bullet;
    if (idx === 0 && lineOpts.indentLevel !== undefined) options.indentLevel = lineOpts.indentLevel;
    out.push({ text: run.text, options });
  });
}

/**
 * Convert a slide's markdown body into pptxgenjs text runs. `italic` forces the
 * quote style; `accentBullets` picks numbered vs dot bullets for content
 * variants. Images are dropped (handled separately for image layouts).
 */
function bodyToTextProps(
  markdown: string,
  color: string,
  opts: { italic?: boolean; numbered?: boolean } = {}
): PptxTextProps[] {
  const tokens = marked.lexer(markdown);
  const out: PptxTextProps[] = [];

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
        emitLine(out, runs, color, {
          bullet: ordered ? { type: 'number' } : { code: '2022' },
          indentLevel: 0,
          italic: opts.italic,
        });
      });
    } else if (tok.type === 'blockquote') {
      const runs: Run[] = [];
      collectRuns(tok.tokens, {}, runs);
      emitLine(out, runs, color, { italic: true });
    } else if (tok.type === 'heading') {
      const runs: Run[] = [];
      collectRuns(tok.tokens, { bold: true }, runs);
      emitLine(out, runs, color, { italic: opts.italic });
    } else if (tok.type === 'code') {
      out.push({
        text: tok.text ?? '',
        options: { color, fontFace: FONT_MONO, breakLine: true },
      });
    } else if (tok.type === 'paragraph') {
      const runs: Run[] = [];
      collectRuns(tok.tokens, {}, runs);
      emitLine(out, runs, color, { italic: opts.italic });
    }
  }

  return out;
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
  dark: boolean
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
        fontFace: FONT_HEAD,
        fontSize: pt(56),
        bold: true,
        color: tColor,
        breakLine: true,
      },
    });
  }
  if (data.body.trim()) {
    for (const part of bodyToTextProps(data.body, bColor)) {
      const size = part.options?.fontSize ?? pt(28);
      runs.push({ text: part.text ?? '', options: { ...part.options, fontSize: size } });
    }
  }

  slide.addText(runs.length ? runs : [{ text: '' }], {
    x: MARGIN,
    y: variant === 2 ? inch(252) : 0,
    w: textW,
    h: variant === 2 ? PAGE_H - inch(252) - inch(48) : PAGE_H,
    align,
    valign: variant === 0 ? 'middle' : variant === 1 ? 'middle' : 'top',
    lineSpacingMultiple: 1.15,
  });
}

/** Quote layout: italic, larger body, v0 with an accent left rule; v1 centered. */
function addQuoteSlide(
  slide: PptxSlide,
  data: Slide,
  variant: number,
  accentHex: string,
  dark: boolean
): void {
  const bColor = bodyColor(dark);
  const ruleColor = dark ? 'A9D3BE' : accentHex;

  if (data.title.trim()) {
    slide.addText(data.title, {
      x: MARGIN,
      y: inch(64),
      w: CONTENT_W,
      h: inch(80),
      fontFace: FONT_HEAD,
      fontSize: pt(44),
      bold: true,
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
  slide.addText(bodyToTextProps(data.body, bColor, { italic: true }), {
    x: bodyX,
    y: inch(180),
    w: variant === 0 ? CONTENT_W - inch(34) : CONTENT_W,
    h: inch(220),
    valign: 'middle',
    align: variant === 1 ? 'center' : 'left',
    fontSize: pt(34),
    italic: true,
    lineSpacingMultiple: 1.2,
  });
}

/** Code layout: dark monospace panel. */
function addCodeSlide(slide: PptxSlide, data: Slide, accentHex: string, dark: boolean): void {
  if (data.title.trim()) {
    slide.addText(data.title, {
      x: MARGIN,
      y: inch(64),
      w: CONTENT_W,
      h: inch(70),
      fontFace: FONT_HEAD,
      fontSize: pt(44),
      bold: true,
      color: titleColor(dark, accentHex),
    });
  }
  const panelY = inch(160);
  const panelH = PAGE_H - panelY - inch(48);
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
    fontSize: pt(20),
    color: CODE_FG,
    valign: 'top',
    lineSpacingMultiple: 1.45,
  });
}

/** Image layout: title top; embedded image below (v0) or right (v1). */
async function addImageSlide(
  slide: PptxSlide,
  data: Slide,
  variant: number,
  accentHex: string,
  dark: boolean
): Promise<void> {
  const imgUrl = firstImageUrl(data.body);
  const imgData = imgUrl ? await fetchImageData(imgUrl) : null;
  const tColor = titleColor(dark, accentHex);

  if (variant === 1) {
    if (data.title.trim()) {
      slide.addText(data.title, {
        x: MARGIN,
        y: 0,
        w: inch(326),
        h: PAGE_H,
        fontFace: FONT_HEAD,
        fontSize: pt(44),
        bold: true,
        color: tColor,
        valign: 'middle',
      });
    }
    if (imgData) {
      slide.addImage({ data: imgData, x: inch(400), y: inch(64), w: inch(488), h: inch(412) });
    }
    return;
  }

  if (data.title.trim()) {
    slide.addText(data.title, {
      x: MARGIN,
      y: inch(64),
      w: CONTENT_W,
      h: inch(80),
      fontFace: FONT_HEAD,
      fontSize: pt(44),
      bold: true,
      color: tColor,
    });
  }
  if (imgData) {
    slide.addImage({ data: imgData, x: MARGIN, y: inch(160), w: CONTENT_W, h: inch(316) });
  }
}

/** Content / split layouts: title top, bullet (or numbered / two-column) body. */
function addContentSlide(
  slide: PptxSlide,
  data: Slide,
  variant: number,
  accentHex: string,
  dark: boolean,
  split: boolean
): void {
  const bColor = bodyColor(dark);
  if (data.title.trim()) {
    slide.addText(data.title, {
      x: MARGIN,
      y: inch(64),
      w: CONTENT_W,
      h: inch(70),
      fontFace: FONT_HEAD,
      fontSize: pt(44),
      bold: true,
      color: titleColor(dark, accentHex),
    });
  }

  const bodyY = inch(160);
  const bodyH = PAGE_H - bodyY - inch(48);
  const runs = bodyToTextProps(data.body, bColor, { numbered: variant === 2 });

  if (split) {
    const mid = Math.ceil(runs.length / 2);
    const colW = (CONTENT_W - inch(48)) / 2;
    slide.addText(runs.slice(0, mid), {
      x: MARGIN,
      y: bodyY,
      w: colW,
      h: bodyH,
      fontSize: pt(28),
      valign: 'top',
      lineSpacingMultiple: 1.15,
    });
    slide.addText(runs.slice(mid).length ? runs.slice(mid) : [{ text: '' }], {
      x: MARGIN + colW + inch(48),
      y: bodyY,
      w: colW,
      h: bodyH,
      fontSize: pt(28),
      valign: 'top',
      lineSpacingMultiple: 1.15,
    });
    return;
  }

  slide.addText(runs.length ? runs : [{ text: '' }], {
    x: MARGIN,
    y: bodyY,
    w: CONTENT_W,
    h: bodyH,
    fontSize: pt(28),
    valign: 'top',
    lineSpacingMultiple: 1.15,
  });
}

async function addSlide(
  pptx: PptxInstance,
  data: Slide,
  accent: string,
  showNotes: boolean
): Promise<void> {
  const slide = pptx.addSlide();
  const accentHex = toHex(accent) ?? '316049';
  const variant = data.variant ?? 0;

  const bg = await resolveBackground(data, accent);
  slide.background = bg.image ? { data: bg.image } : { color: bg.color ?? WHITE_HEX };

  switch (data.layout) {
    case 'title':
      addTitleSlide(slide, data, variant, accentHex, bg.dark);
      break;
    case 'quote':
      addQuoteSlide(slide, data, variant, accentHex, bg.dark);
      break;
    case 'code':
      addCodeSlide(slide, data, accentHex, bg.dark);
      break;
    case 'image':
      await addImageSlide(slide, data, variant, accentHex, bg.dark);
      break;
    case 'split':
      addContentSlide(slide, data, variant, accentHex, bg.dark, true);
      break;
    case 'content':
    default:
      addContentSlide(slide, data, variant, accentHex, bg.dark, false);
  }

  if (showNotes && data.notes.trim()) slide.addNotes(data.notes.trim());
}

/**
 * Build a themed, editable PPTX buffer from a deck. Hidden slides are omitted;
 * `accent` drives titles, panels and markers (defaults to the brand green).
 */
export async function exportPresentationToPptx(
  slides: readonly Slide[],
  title: string,
  accent?: string | null
): Promise<Buffer> {
  const pptxModule = await import('pptxgenjs');
  const PptxGenJS = (pptxModule.default ?? pptxModule) as unknown as PptxCtor;
  const pptx = new PptxGenJS();

  pptx.author = 'Grünerator';
  pptx.subject = 'Präsentation';
  pptx.title = title || 'Präsentation';
  pptx.defineLayout({ name: 'GRUENE_16x9', width: PAGE_W, height: PAGE_H });
  pptx.layout = 'GRUENE_16x9';

  const deckAccent = accent?.trim() || '#316049';
  for (const slide of slides) {
    if (slide.hidden) continue;
    await addSlide(pptx, slide, deckAccent, true);
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
