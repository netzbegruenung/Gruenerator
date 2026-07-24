/**
 * Renderer for generated PDFs: block list → CI-styled, tagged A4 document.
 *
 * Deliberately no headless browser — pdf-lib + marked's inline lexer only.
 * Every visible element goes through `PdfTagger`, so the output carries a
 * logical structure tree (headings, lists, tables, form fields) instead of a
 * flat text soup; decoration is emitted as /Artifact.
 *
 * Three page layouts, picked by `spec.kind`:
 *   document — title block, headings, page footer
 *   letter   — DIN-5008-angelehnt (Absender, Adressfeld, Ort/Datum, Betreff, …)
 *   form     — like `document`, plus real AcroForm fields the user can fill in
 *
 * Locale picks the theme: de-DE (GrueneTypeNeue/PTSans, Tanne, Sonnenblume)
 * vs de-AT (GothamNarrow, "The Odd" 2026 Grün, AT-Logo).
 */

import fs from 'fs/promises';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import fontkit from '@pdf-lib/fontkit';
import { marked, type Token, type Tokens } from 'marked';
import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFRef,
  rgb,
  type PDFFont,
  type PDFForm,
  type PDFImage,
  type PDFPage,
  type RGB,
} from 'pdf-lib';

import { createLogger } from '../../utils/logger.js';

import { fieldName, type PdfBlock, type PdfDocumentSpec } from './pdfDocument.js';
import { PdfTagger, type TaggingChecks } from './pdfTagging.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

const log = createLogger('pdfRenderer');

export type PdfLocale = 'de-DE' | 'de-AT';

export interface PdfSender {
  name?: string | null;
  organization?: string | null;
  address?: string | null;
}

export interface RenderPdfOptions {
  locale: PdfLocale;
  sender?: PdfSender | null;
}

export interface RenderPdfResult {
  bytes: Buffer;
  /** AcroForm field names in tab order — empty for non-form documents. */
  fields: string[];
  checks: TaggingChecks;
  /** True when the viewer has to build the field appearances itself. */
  appearanceFallback: boolean;
}

interface Theme {
  headingFont: string;
  bodyFont: string;
  bodyBoldFont: string;
  primary: RGB;
  accent: RGB;
  logo: string;
  /** Logo render height in pt (logos have different aspect ratios). */
  logoHeight: number;
}

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16);
  return rgb(((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255);
}

const THEMES: Record<PdfLocale, Theme> = {
  'de-DE': {
    headingFont: 'fonts/GrueneTypeNeue-Regular.ttf',
    bodyFont: 'fonts/PTSans-Regular.ttf',
    bodyBoldFont: 'fonts/PTSans-Bold.ttf',
    primary: hexToRgb('#005538'),
    accent: hexToRgb('#008939'),
    logo: 'sonnenblume_gruen.png',
    logoHeight: 52,
  },
  'de-AT': {
    headingFont: 'fonts/GothamNarrow-Ultra.ttf',
    bodyFont: 'fonts/GothamNarrow-Book.otf',
    bodyBoldFont: 'fonts/GothamNarrow-Bold.otf',
    primary: hexToRgb('#257639'),
    accent: hexToRgb('#56af31'),
    logo: 'gruene-at-logo-gruen.png',
    logoHeight: 34,
  },
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_L = 70;
const MARGIN_R = 55;
const FOOTER_RESERVE = 50;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
const CONTINUATION_TOP = PAGE_H - 70;

const BODY_COLOR = rgb(0.2, 0.2, 0.2);
const MUTED_COLOR = rgb(0.45, 0.45, 0.45);
const FIELD_BG = rgb(0.965, 0.973, 0.965);
const FIELD_BORDER = rgb(0.62, 0.66, 0.62);
const RULE_COLOR = rgb(0.85, 0.87, 0.85);

const EMOJI_REGEX = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu;

interface FontRun {
  text: string;
  font: PDFFont;
}

interface InlineSegment {
  text: string;
  bold: boolean;
}

interface RendererFonts {
  heading: PDFFont;
  body: PDFFont;
  bodyBold: PDFFont;
  emoji: PDFFont;
}

function splitIntoFontRuns(text: string, textFont: PDFFont, emojiFont: PDFFont): FontRun[] {
  const runs: FontRun[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(EMOJI_REGEX)) {
    const idx = match.index!;
    if (idx > lastIndex) runs.push({ text: text.slice(lastIndex, idx), font: textFont });
    runs.push({ text: match[0], font: emojiFont });
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < text.length) runs.push({ text: text.slice(lastIndex), font: textFont });
  return runs.length ? runs : [{ text, font: textFont }];
}

/** widthOfTextAtSize throws on glyphs missing from the font; treat them as spaces. */
function safeWidth(font: PDFFont, text: string, fontSize: number): number {
  try {
    return font.widthOfTextAtSize(text, fontSize);
  } catch {
    return font.widthOfTextAtSize(' '.repeat(text.length), fontSize);
  }
}

function measureRuns(runs: FontRun[], fontSize: number): number {
  return runs.reduce((w, r) => w + safeWidth(r.font, r.text, fontSize), 0);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Flatten marked inline tokens into bold-aware segments (links keep their text). */
function flattenInline(tokens: Token[] | undefined, bold = false): InlineSegment[] {
  if (!tokens) return [];
  const out: InlineSegment[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'strong':
        out.push(...flattenInline((token as Tokens.Strong).tokens, true));
        break;
      case 'em':
      case 'link':
      case 'del':
        out.push(...flattenInline((token as Tokens.Em).tokens, bold));
        break;
      case 'codespan':
        out.push({ text: (token as Tokens.Codespan).text, bold });
        break;
      case 'br':
        out.push({ text: '\n', bold });
        break;
      case 'escape':
        out.push({ text: (token as Tokens.Escape).text, bold });
        break;
      case 'text': {
        const t = token as Tokens.Text;
        if (t.tokens?.length) out.push(...flattenInline(t.tokens, bold));
        else out.push({ text: decodeEntities(t.text), bold });
        break;
      }
      default: {
        const raw = (token as { raw?: string }).raw;
        if (raw) out.push({ text: decodeEntities(raw), bold });
      }
    }
  }
  return out;
}

/**
 * Block text may still carry inline markdown (**fett**, *kursiv*) — block-level
 * structure is expressed by the block type instead, so only inline is parsed.
 */
function inlineSegments(text: string): InlineSegment[] {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return [];
  try {
    return flattenInline(marked.Lexer.lexInline(trimmed));
  } catch {
    return [{ text: trimmed, bold: false }];
  }
}

/** Break segments into per-word font runs and word-wrap them into lines. */
function wrapSegments(
  segments: InlineSegment[],
  fonts: RendererFonts,
  fontSize: number,
  maxWidth: number
): FontRun[][] {
  interface Word {
    runs: FontRun[];
    width: number;
    lineBreak?: boolean;
  }
  const words: Word[] = [];
  for (const seg of segments) {
    const font = seg.bold ? fonts.bodyBold : fonts.body;
    const parts = seg.text.split('\n');
    parts.forEach((part, i) => {
      for (const word of part.split(/\s+/).filter(Boolean)) {
        const runs = splitIntoFontRuns(word, font, fonts.emoji);
        words.push({ runs, width: measureRuns(runs, fontSize) });
      }
      if (i < parts.length - 1) words.push({ runs: [], width: 0, lineBreak: true });
    });
  }

  const spaceWidth = safeWidth(fonts.body, ' ', fontSize);
  const lines: FontRun[][] = [];
  let line: FontRun[] = [];
  let lineWidth = 0;

  const flush = () => {
    lines.push(line);
    line = [];
    lineWidth = 0;
  };

  for (const word of words) {
    if (word.lineBreak) {
      flush();
      continue;
    }
    // Hard-break words wider than the line so they can never overflow.
    if (word.width > maxWidth) {
      for (const run of word.runs) {
        for (const ch of run.text) {
          const w = safeWidth(run.font, ch, fontSize);
          if (lineWidth + w > maxWidth && line.length) flush();
          line.push({ text: ch, font: run.font });
          lineWidth += w;
        }
      }
      continue;
    }
    const needed = (line.length ? spaceWidth : 0) + word.width;
    if (lineWidth + needed > maxWidth && line.length) flush();
    if (line.length) {
      line.push({ text: ' ', font: fonts.body });
      lineWidth += spaceWidth;
    }
    line.push(...word.runs);
    lineWidth += word.width;
  }
  if (line.length) flush();
  return lines.length ? lines : [[]];
}

function drawRuns(
  page: PDFPage,
  runs: FontRun[],
  startX: number,
  y: number,
  fontSize: number,
  color: RGB
): void {
  let x = startX;
  for (const run of runs) {
    try {
      page.drawText(run.text, { x, y, size: fontSize, font: run.font, color });
    } catch {
      // Glyph missing from every embedded font — skip the run, keep the layout.
    }
    x += safeWidth(run.font, run.text, fontSize);
  }
}

function formatDate(locale: PdfLocale): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

function senderLines(sender: PdfSender | null | undefined): string[] {
  if (!sender) return [];
  const lines: string[] = [];
  if (sender.organization) lines.push(sender.organization);
  if (sender.name) lines.push(sender.name);
  if (sender.address) {
    lines.push(
      ...sender.address
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    );
  }
  return lines;
}

interface TextStyle {
  fontSize: number;
  lineHeight?: number;
  color?: RGB;
  indent?: number;
  width?: number;
  spacingAfter?: number;
  font?: PDFFont;
  forceBold?: boolean;
}

type FieldBlock = Extract<PdfBlock, { type: 'field' }>;

class PdfRenderer {
  private page: PDFPage;
  private y: number;
  private readonly tagger: PdfTagger;
  private readonly form: PDFForm;
  private readonly takenNames = new Set<string>();
  private readonly fieldNames: string[] = [];
  private fieldAppearanceFailed = false;

  constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: RendererFonts,
    private readonly theme: Theme,
    private readonly logo: PDFImage,
    private readonly spec: PdfDocumentSpec,
    private readonly opts: RenderPdfOptions
  ) {
    this.tagger = new PdfTagger(doc, { language: spec.language, title: spec.title });
    this.form = doc.getForm();
    this.page = doc.addPage([PAGE_W, PAGE_H]);
    this.y = CONTINUATION_TOP;
  }

  // ── page plumbing ──────────────────────────────────────────────────────────

  private newPage(): void {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = CONTINUATION_TOP;
  }

  private ensureSpace(needed: number): void {
    if (this.y - needed < FOOTER_RESERVE) this.newPage();
  }

  private drawLogo(): void {
    const height = this.theme.logoHeight;
    const width = (this.logo.width / this.logo.height) * height;
    const page = this.page;
    this.tagger.artifact(page, () =>
      page.drawImage(this.logo, {
        x: PAGE_W - MARGIN_R - width,
        y: PAGE_H - 42 - height,
        width,
        height,
      })
    );
  }

  /** Footers run last so the total page count is known. */
  private drawFooters(): void {
    const pages = this.doc.getPages();
    const shortTitle =
      this.spec.title.length > 60 ? `${this.spec.title.slice(0, 57)}…` : this.spec.title;
    pages.forEach((page, i) => {
      this.tagger.artifact(page, () => {
        page.drawText(shortTitle, {
          x: MARGIN_L,
          y: 28,
          size: 8,
          font: this.fonts.body,
          color: MUTED_COLOR,
        });
        if (pages.length > 1) {
          const label = `Seite ${i + 1} von ${pages.length}`;
          const w = safeWidth(this.fonts.body, label, 8);
          page.drawText(label, {
            x: PAGE_W - MARGIN_R - w,
            y: 28,
            size: 8,
            font: this.fonts.body,
            color: MUTED_COLOR,
          });
        }
      });
    });
  }

  // ── text primitives ────────────────────────────────────────────────────────

  /** Draw wrapped text as content of the CURRENT structure element. */
  private writeText(segments: InlineSegment[], style: TextStyle): void {
    const fontSize = style.fontSize;
    const lineHeight = style.lineHeight ?? fontSize * 1.45;
    const indent = style.indent ?? 0;
    const color = style.color ?? BODY_COLOR;
    const width = (style.width ?? CONTENT_W) - indent;
    const segs = style.forceBold ? segments.map((s) => ({ ...s, bold: true })) : segments;
    const effective = style.font
      ? { ...this.fonts, body: style.font, bodyBold: style.font }
      : this.fonts;

    for (const line of wrapSegments(segs, effective, fontSize, width)) {
      this.ensureSpace(lineHeight);
      const page = this.page;
      const y = this.y;
      if (line.length) {
        this.tagger.content(page, () =>
          drawRuns(page, line, MARGIN_L + indent, y, fontSize, color)
        );
      }
      this.y -= lineHeight;
    }
    this.y -= style.spacingAfter ?? 6;
  }

  private writePlain(text: string, style: TextStyle): void {
    this.writeText([{ text, bold: false }], style);
  }

  /** Single tagged line at an absolute position (headers, labels, captions). */
  private writeLineAt(
    tag: Parameters<PdfTagger['tag']>[0],
    text: string,
    x: number,
    y: number,
    size: number,
    font: PDFFont,
    color: RGB
  ): void {
    const page = this.page;
    this.tagger.tag(tag, () =>
      this.tagger.content(page, () => page.drawText(text, { x, y, size, font, color }))
    );
  }

  // ── blocks ─────────────────────────────────────────────────────────────────

  private renderBlocks(blocks: PdfBlock[]): void {
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      // Two half-width fields share a row.
      if (block.type === 'field' && block.width === 'half') {
        const next = blocks[i + 1];
        if (next && next.type === 'field' && next.width === 'half') {
          this.renderFieldRow([block, next]);
          i += 1;
          continue;
        }
      }
      this.renderBlock(block);
    }
  }

  private renderBlock(block: PdfBlock): void {
    switch (block.type) {
      case 'heading': {
        const size = block.level === 1 ? 16 : block.level === 2 ? 13.5 : 12;
        this.ensureSpace(size * 2.6);
        this.y -= 8;
        this.tagger.tag(block.level === 1 ? 'H1' : block.level === 2 ? 'H2' : 'H3', () =>
          this.writeText(inlineSegments(block.text), {
            fontSize: size,
            lineHeight: size * 1.3,
            color: this.theme.primary,
            spacingAfter: 6,
            font: block.level <= 2 ? this.fonts.heading : this.fonts.bodyBold,
          })
        );
        break;
      }
      case 'paragraph':
        this.tagger.tag('P', () =>
          this.writeText(inlineSegments(block.text), { fontSize: 11, spacingAfter: 8 })
        );
        break;
      case 'list':
        this.renderList(block);
        break;
      case 'table':
        this.renderTable(block);
        break;
      case 'quote':
        this.renderQuote(block);
        break;
      case 'note':
        this.renderNote(block);
        break;
      case 'keyvalue':
        this.renderKeyValue(block);
        break;
      case 'divider': {
        this.ensureSpace(22);
        this.y -= 6;
        const page = this.page;
        const y = this.y;
        this.tagger.artifact(page, () =>
          page.drawLine({
            start: { x: MARGIN_L, y },
            end: { x: PAGE_W - MARGIN_R, y },
            thickness: 0.75,
            color: this.theme.accent,
          })
        );
        this.y -= 14;
        break;
      }
      case 'pagebreak':
        this.newPage();
        break;
      case 'field':
        this.renderFieldRow([block]);
        break;
      case 'signature':
        this.renderSignature(block);
        break;
    }
  }

  private renderList(block: Extract<PdfBlock, { type: 'list' }>): void {
    const fontSize = 11;
    const indent = 16;
    this.tagger.open('L');
    let index = 1;
    for (const item of block.items) {
      this.tagger.open('LI');
      const marker = block.ordered ? `${index}.` : '•';
      this.ensureSpace(fontSize * 1.45);
      this.writeLineAt(
        'Lbl',
        marker,
        MARGIN_L + indent - 12,
        this.y,
        fontSize,
        block.ordered ? this.fonts.body : this.fonts.bodyBold,
        this.theme.accent
      );
      this.tagger.tag('LBody', () =>
        this.writeText(inlineSegments(item), { fontSize, indent, spacingAfter: 3 })
      );
      this.tagger.close();
      index += 1;
    }
    this.tagger.close();
    this.y -= 5;
  }

  private renderQuote(block: Extract<PdfBlock, { type: 'quote' }>): void {
    this.tagger.open('BlockQuote');
    const startY = this.y;
    const startPage = this.page;
    this.tagger.tag('P', () =>
      this.writeText(inlineSegments(block.text), {
        fontSize: 11,
        indent: 16,
        color: MUTED_COLOR,
        spacingAfter: block.source ? 2 : 4,
      })
    );
    if (block.source) {
      const source = block.source;
      this.tagger.tag('P', () =>
        this.writePlain(`— ${source}`, {
          fontSize: 9.5,
          indent: 16,
          color: MUTED_COLOR,
          spacingAfter: 4,
        })
      );
    }
    // Accent bar only when the quote stayed on one page.
    if (this.page === startPage && startY > this.y) {
      const barBottom = this.y;
      this.tagger.artifact(startPage, () =>
        startPage.drawRectangle({
          x: MARGIN_L + 2,
          y: barBottom + 8,
          width: 2.5,
          height: startY - barBottom + 4,
          color: this.theme.accent,
        })
      );
    }
    this.tagger.close();
    this.y -= 6;
  }

  private renderNote(block: Extract<PdfBlock, { type: 'note' }>): void {
    const padding = 10;
    const innerWidth = CONTENT_W - padding * 2;
    const lines = wrapSegments(inlineSegments(block.text), this.fonts, 10.5, innerWidth);
    const boxHeight = lines.length * 15 + padding * 2 + (block.title ? 16 : 0);
    this.ensureSpace(boxHeight + 10);

    const page = this.page;
    const boxTop = this.y + 4;
    this.tagger.artifact(page, () =>
      page.drawRectangle({
        x: MARGIN_L,
        y: boxTop - boxHeight,
        width: CONTENT_W,
        height: boxHeight,
        color: FIELD_BG,
        borderColor: this.theme.accent,
        borderWidth: 0.5,
      })
    );

    this.y -= padding;
    this.tagger.open('Sect');
    if (block.title) {
      const title = block.title;
      this.tagger.tag('P', () =>
        this.writePlain(title, {
          fontSize: 10.5,
          indent: padding,
          width: CONTENT_W - padding,
          color: this.theme.primary,
          forceBold: true,
          spacingAfter: 2,
        })
      );
    }
    this.tagger.tag('P', () =>
      this.writeText(inlineSegments(block.text), {
        fontSize: 10.5,
        lineHeight: 15,
        indent: padding,
        width: CONTENT_W - padding,
        spacingAfter: 0,
      })
    );
    this.tagger.close();
    this.y -= padding + 8;
  }

  private renderKeyValue(block: Extract<PdfBlock, { type: 'keyvalue' }>): void {
    // A definition list is a two-column table with ROW headers — that is what a
    // screen reader can navigate ("Label: Wert"), unlike two loose paragraphs.
    this.renderTableRows({
      columns: null,
      rows: block.entries.map((e) => [e.label, e.value]),
      widths: [CONTENT_W * 0.34, CONTENT_W * 0.66],
      rowHeaderColumn: 0,
    });
  }

  private renderTable(block: Extract<PdfBlock, { type: 'table' }>): void {
    const columnCount = block.columns.length;
    const rows = block.rows.map((row) => {
      const cells = row.slice(0, columnCount);
      while (cells.length < columnCount) cells.push('');
      return cells;
    });
    // Column widths follow the widest cell so a "Nr."-column stays narrow.
    const weights = block.columns.map((col, i) => {
      const longest = Math.max(col.length, ...rows.map((r) => (r[i] ?? '').length), 1);
      return Math.min(Math.max(longest, 6), 40);
    });
    const total = weights.reduce((a, b) => a + b, 0);

    this.renderTableRows({
      columns: block.columns,
      rows,
      widths: weights.map((w) => (w / total) * CONTENT_W),
      rowHeaderColumn: null,
      caption: block.caption ?? null,
    });
  }

  private renderTableRows(input: {
    columns: string[] | null;
    rows: string[][];
    widths: number[];
    rowHeaderColumn: number | null;
    caption?: string | null;
  }): void {
    const { columns, rows, widths, rowHeaderColumn } = input;
    const fontSize = 9.5;
    const lineHeight = 13;
    const padX = 5;
    const padY = 5;

    this.tagger.open('Table');
    if (input.caption) {
      const caption = input.caption;
      this.tagger.tag('Caption', () =>
        this.writePlain(caption, { fontSize: 9.5, color: MUTED_COLOR, spacingAfter: 3 })
      );
    }

    const drawRow = (cells: string[], header: boolean): void => {
      const wrapped = cells.map((cell, i) =>
        wrapSegments(
          header ? [{ text: cell, bold: true }] : inlineSegments(cell),
          this.fonts,
          fontSize,
          (widths[i] ?? CONTENT_W) - padX * 2
        )
      );
      const height = Math.max(...wrapped.map((w) => w.length), 1) * lineHeight + padY * 2;
      this.ensureSpace(height);

      const page = this.page;
      const top = this.y + lineHeight - 2;
      this.tagger.artifact(page, () => {
        if (header) {
          page.drawRectangle({
            x: MARGIN_L,
            y: top - height,
            width: CONTENT_W,
            height,
            color: FIELD_BG,
          });
        }
        page.drawLine({
          start: { x: MARGIN_L, y: top - height },
          end: { x: MARGIN_L + CONTENT_W, y: top - height },
          thickness: 0.5,
          color: RULE_COLOR,
        });
      });

      this.tagger.open('TR');
      let x = MARGIN_L;
      wrapped.forEach((lines, i) => {
        const isHeaderCell = header || rowHeaderColumn === i;
        const cellX = x;
        this.tagger.open(
          isHeaderCell ? 'TH' : 'TD',
          isHeaderCell ? { scope: header ? 'Column' : 'Row' } : {}
        );
        let cellY = this.y;
        for (const line of lines) {
          if (line.length) {
            const lineY = cellY;
            this.tagger.content(page, () =>
              drawRuns(
                page,
                line,
                cellX + padX,
                lineY,
                fontSize,
                isHeaderCell ? this.theme.primary : BODY_COLOR
              )
            );
          }
          cellY -= lineHeight;
        }
        this.tagger.close();
        x += widths[i] ?? 0;
      });
      this.tagger.close();
      this.y -= height;
    };

    if (columns) drawRow(columns, true);
    for (const row of rows) drawRow(row, false);
    this.tagger.close();
    this.y -= 10;
  }

  private renderSignature(block: Extract<PdfBlock, { type: 'signature' }>): void {
    this.ensureSpace(70);
    this.y -= 34;
    const count = Math.min(block.labels.length, 3);
    const slot = CONTENT_W / count;
    const lineWidth = Math.min(slot - 20, 200);
    const page = this.page;
    const lineY = this.y;

    this.tagger.artifact(page, () => {
      for (let i = 0; i < count; i++) {
        page.drawLine({
          start: { x: MARGIN_L + i * slot, y: lineY },
          end: { x: MARGIN_L + i * slot + lineWidth, y: lineY },
          thickness: 0.75,
          color: FIELD_BORDER,
        });
      }
    });

    this.y -= 12;
    for (let i = 0; i < count; i++) {
      this.writeLineAt(
        'P',
        block.labels[i],
        MARGIN_L + i * slot,
        this.y,
        8.5,
        this.fonts.body,
        MUTED_COLOR
      );
    }
    this.y -= 20;
  }

  // ── form fields ────────────────────────────────────────────────────────────

  private renderFieldRow(fields: FieldBlock[]): void {
    const columns = fields.length;
    const gap = columns > 1 ? 16 : 0;
    const width = (CONTENT_W - gap * (columns - 1)) / columns;
    const height = Math.max(...fields.map((f) => this.fieldHeight(f)));
    this.ensureSpace(height + 8);
    const rowTop = this.y;
    fields.forEach((field, i) => {
      this.y = rowTop;
      this.renderField(field, MARGIN_L + i * (width + gap), width);
    });
    this.y = rowTop - height - 8;
  }

  private fieldHeight(field: FieldBlock): number {
    const labelH = 16;
    const helpH = field.help ? 16 : 0;
    if (field.kind === 'multiline') return labelH + (field.rows ?? 4) * 14 + 14 + helpH;
    if (field.kind === 'checkbox') return 24 + helpH;
    if (field.kind === 'radio') return labelH + (field.options?.length ?? 2) * 20 + helpH;
    return labelH + 34 + helpH;
  }

  private renderField(field: FieldBlock, x: number, width: number): void {
    const name = fieldName(field, this.takenNames);
    const baseLabel = field.kind === 'select' ? `${field.label} (Auswahl)` : field.label;
    const label = field.required ? `${baseLabel} *` : baseLabel;
    const accessibleName = [field.label, field.required ? '(Pflichtfeld)' : '', field.help ?? '']
      .filter(Boolean)
      .join(' — ');
    const page = this.page;

    this.tagger.open('Form');
    // The checkbox/radio label sits NEXT to the control, everything else above.
    if (field.kind !== 'checkbox') {
      this.writeLineAt('Lbl', label, x, this.y, 9, this.fonts.bodyBold, this.theme.primary);
      this.y -= 16;
    }

    switch (field.kind) {
      case 'text':
      case 'date':
      case 'multiline': {
        const boxHeight = field.kind === 'multiline' ? (field.rows ?? 4) * 14 : 20;
        const top = this.y + 12;
        const text = this.form.createTextField(name);
        if (field.kind === 'multiline') text.enableMultiline();
        if (field.required) text.enableRequired();
        this.addWidget(
          () =>
            text.addToPage(page, {
              x,
              y: top - boxHeight,
              width,
              height: boxHeight,
              backgroundColor: FIELD_BG,
              borderColor: FIELD_BORDER,
              borderWidth: 0.75,
              font: this.fonts.body,
            }),
          page,
          field.kind === 'date' ? `${accessibleName} — Datum TT.MM.JJJJ` : accessibleName
        );
        // Only valid once addToPage created the widget's /DA entry.
        text.setFontSize(10);
        this.y = top - boxHeight - 12;
        break;
      }
      case 'checkbox': {
        const box = 12;
        const top = this.y + 10;
        const checkbox = this.form.createCheckBox(name);
        if (field.required) checkbox.enableRequired();
        this.addWidget(
          () =>
            checkbox.addToPage(page, {
              x,
              y: top - box,
              width: box,
              height: box,
              backgroundColor: FIELD_BG,
              borderColor: FIELD_BORDER,
              borderWidth: 0.75,
            }),
          page,
          accessibleName
        );
        this.writeLineAt('Lbl', label, x + box + 7, top - box + 2, 10, this.fonts.body, BODY_COLOR);
        this.y = top - box - 6;
        break;
      }
      case 'radio': {
        const options = field.options?.length ? field.options : ['Ja', 'Nein'];
        const group = this.form.createRadioGroup(name);
        if (field.required) group.enableRequired();
        for (const option of options) {
          const size = 12;
          const top = this.y + 10;
          this.addWidget(
            () =>
              group.addOptionToPage(option, page, {
                x,
                y: top - size,
                width: size,
                height: size,
                backgroundColor: FIELD_BG,
                borderColor: FIELD_BORDER,
                borderWidth: 0.75,
              }),
            page,
            `${accessibleName}: ${option}`
          );
          this.writeLineAt(
            'Lbl',
            option,
            x + size + 7,
            top - size + 2,
            10,
            this.fonts.body,
            BODY_COLOR
          );
          this.y = top - size - 16;
        }
        break;
      }
      case 'select': {
        const options = field.options?.length ? field.options : ['Bitte wählen'];
        const boxHeight = 20;
        const top = this.y + 12;
        const dropdown = this.form.createDropdown(name);
        dropdown.addOptions(options);
        if (field.required) dropdown.enableRequired();
        this.addWidget(
          () =>
            dropdown.addToPage(page, {
              x,
              y: top - boxHeight,
              width,
              height: boxHeight,
              backgroundColor: FIELD_BG,
              borderColor: FIELD_BORDER,
              borderWidth: 0.75,
              font: this.fonts.body,
            }),
          page,
          `${accessibleName} — Auswahl: ${options.join(', ')}`
        );
        dropdown.setFontSize(10);
        this.y = top - boxHeight - 12;
        break;
      }
    }

    if (field.help) {
      this.writeLineAt('P', field.help, x, this.y, 8, this.fonts.body, MUTED_COLOR);
      this.y -= 12;
    }

    this.tagger.close();
    this.fieldNames.push(name);
  }

  /**
   * pdf-lib appends the widget annotation to the page; grab the ref it just
   * pushed so the tagger can link it into the structure tree and name it.
   */
  private addWidget(add: () => void, page: PDFPage, accessibleName: string): void {
    add();
    const annots = page.node.get(PDFName.of('Annots'));
    if (annots instanceof PDFArray && annots.size() > 0) {
      const ref = annots.get(annots.size() - 1);
      if (ref instanceof PDFRef) this.tagger.attachWidget(page, ref, accessibleName);
    }
  }

  // ── layouts ────────────────────────────────────────────────────────────────

  private renderDocumentHeader(): void {
    this.drawLogo();
    this.y = PAGE_H - 130;

    const page = this.page;
    const titleFonts = { ...this.fonts, body: this.fonts.heading, bodyBold: this.fonts.heading };
    this.tagger.open('H1');
    for (const line of wrapSegments(
      [{ text: this.spec.title, bold: false }],
      titleFonts,
      23,
      CONTENT_W - this.theme.logoHeight
    )) {
      const y = this.y;
      if (line.length) {
        this.tagger.content(page, () => drawRuns(page, line, MARGIN_L, y, 23, this.theme.primary));
      }
      this.y -= 30;
    }
    this.tagger.close();

    this.y += 4;
    const barY = this.y - 2;
    this.tagger.artifact(page, () =>
      page.drawRectangle({ x: MARGIN_L, y: barY, width: 64, height: 3.5, color: this.theme.accent })
    );
    this.y -= 18;

    if (this.spec.subtitle) {
      const subtitle = this.spec.subtitle;
      this.tagger.tag('P', () =>
        this.writePlain(subtitle, { fontSize: 11, color: MUTED_COLOR, spacingAfter: 2 })
      );
    }
    this.tagger.tag('P', () =>
      this.writePlain(formatDate(this.opts.locale), {
        fontSize: 9,
        color: MUTED_COLOR,
        spacingAfter: 14,
      })
    );
  }

  private renderLetterHeader(): void {
    this.drawLogo();
    const letter = this.spec.letter ?? {};
    const sender = senderLines(this.opts.sender);
    const page = this.page;

    this.tagger.open('Sect', { title: 'Absender' });
    let senderY = PAGE_H - 52;
    sender.slice(0, 5).forEach((line, i) => {
      const y = senderY;
      this.tagger.tag('P', () =>
        this.tagger.content(page, () =>
          page.drawText(line, {
            x: MARGIN_L,
            y,
            size: i === 0 ? 9.5 : 8.5,
            font: i === 0 ? this.fonts.bodyBold : this.fonts.body,
            color: i === 0 ? this.theme.primary : MUTED_COLOR,
          })
        )
      );
      senderY -= i === 0 ? 13 : 11;
    });
    this.tagger.close();

    // Rücksendeangabe über dem Adressfeld — DIN-5008-Lage, rein visuell.
    const returnLine = sender.join(' · ');
    if (returnLine) {
      this.tagger.artifact(page, () => {
        page.drawText(returnLine.length > 90 ? `${returnLine.slice(0, 87)}…` : returnLine, {
          x: MARGIN_L,
          y: PAGE_H - 127,
          size: 6.5,
          font: this.fonts.body,
          color: MUTED_COLOR,
        });
        page.drawLine({
          start: { x: MARGIN_L, y: PAGE_H - 131 },
          end: { x: MARGIN_L + 200, y: PAGE_H - 131 },
          thickness: 0.5,
          color: MUTED_COLOR,
        });
      });
    }

    this.tagger.open('Sect', { title: 'Empfänger' });
    let addrY = PAGE_H - 148;
    for (const line of (letter.recipient ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 6)) {
      const y = addrY;
      this.tagger.tag('P', () =>
        this.tagger.content(page, () =>
          page.drawText(line, {
            x: MARGIN_L,
            y,
            size: 11,
            font: this.fonts.body,
            color: BODY_COLOR,
          })
        )
      );
      addrY -= 15;
    }
    this.tagger.close();

    const dateLine = letter.place
      ? `${letter.place}, ${formatDate(this.opts.locale)}`
      : formatDate(this.opts.locale);
    const dateWidth = safeWidth(this.fonts.body, dateLine, 10);
    this.writeLineAt(
      'P',
      dateLine,
      PAGE_W - MARGIN_R - dateWidth,
      PAGE_H - 235,
      10,
      this.fonts.body,
      BODY_COLOR
    );

    this.y = PAGE_H - 270;

    const subject = letter.subject || this.spec.title;
    if (subject) {
      this.tagger.tag('H1', () =>
        this.writeText([{ text: subject, bold: true }], {
          fontSize: 11.5,
          color: this.theme.primary,
          spacingAfter: 16,
        })
      );
    }
    if (letter.salutation) {
      const salutation = letter.salutation;
      this.tagger.tag('P', () => this.writePlain(salutation, { fontSize: 11, spacingAfter: 8 }));
    }
  }

  private renderLetterFooter(): void {
    const letter = this.spec.letter ?? {};
    this.ensureSpace(95);
    this.y -= 8;
    if (letter.closing) {
      const closing = letter.closing;
      this.tagger.tag('P', () => this.writePlain(closing, { fontSize: 11, spacingAfter: 30 }));
    }
    if (letter.signature) {
      this.tagger.open('Sect', { title: 'Unterschrift' });
      for (const line of letter.signature
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)) {
        this.tagger.tag('P', () =>
          this.writePlain(line, { fontSize: 11, forceBold: true, spacingAfter: 0 })
        );
      }
      this.tagger.close();
    }
  }

  async render(): Promise<RenderPdfResult> {
    if (this.spec.kind === 'letter') this.renderLetterHeader();
    else this.renderDocumentHeader();

    this.renderBlocks(this.spec.blocks);

    if (this.spec.kind === 'letter') this.renderLetterFooter();

    this.drawFooters();

    if (this.fieldNames.length) {
      try {
        this.form.updateFieldAppearances(this.fonts.body);
      } catch (err) {
        // Let the viewer build appearances rather than shipping invisible boxes.
        this.fieldAppearanceFailed = true;
        this.form.acroForm.dict.set(PDFName.of('NeedAppearances'), this.doc.context.obj(true));
        log.warn(
          `[pdfRenderer] field appearances failed, falling back to NeedAppearances: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }

    const checks = this.tagger.finalize();
    const bytes = Buffer.from(await this.doc.save());
    return {
      bytes,
      fields: this.fieldNames,
      checks,
      appearanceFallback: this.fieldAppearanceFailed,
    };
  }
}

export async function renderPdf(
  spec: PdfDocumentSpec,
  opts: RenderPdfOptions
): Promise<RenderPdfResult> {
  const theme = THEMES[opts.locale] ?? THEMES['de-DE'];

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  // NOTE: pdf-lib's `subset: true` produces corrupted glyph mappings with the
  // CI fonts (PTSans/Gotham) — fonts must be embedded whole. To keep files
  // small, the ~1.5MB emoji font is only embedded when the text needs it.
  const needsEmoji = EMOJI_REGEX.test(JSON.stringify(spec));
  EMOJI_REGEX.lastIndex = 0;

  const [headingBytes, bodyBytes, boldBytes, emojiBytes, logoBytes] = await Promise.all([
    fs.readFile(path.join(PUBLIC_DIR, theme.headingFont)),
    fs.readFile(path.join(PUBLIC_DIR, theme.bodyFont)),
    fs.readFile(path.join(PUBLIC_DIR, theme.bodyBoldFont)),
    needsEmoji ? fs.readFile(path.join(PUBLIC_DIR, 'fonts', 'NotoEmoji-Regular.ttf')) : null,
    fs.readFile(path.join(PUBLIC_DIR, theme.logo)),
  ]);

  const body = await doc.embedFont(bodyBytes);
  const fonts: RendererFonts = {
    heading: await doc.embedFont(headingBytes),
    body,
    bodyBold: await doc.embedFont(boldBytes),
    emoji: emojiBytes ? await doc.embedFont(emojiBytes) : body,
  };
  const logo = await doc.embedPng(logoBytes);

  return new PdfRenderer(doc, fonts, theme, logo, spec, opts).render();
}
