/**
 * Renders parsed blocks into docx elements.
 *
 * Shared by `docxController` (document export) and `chatMessageExport` (the
 * chat download button) so both produce the same Word document. They used to
 * carry near-identical copies of this loop, and only one of them ever got a
 * fix.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { parseCitationMarkers } from './citationParser.js';

import type { ResolvedImage } from './imageResolver.js';
import type { FormattedBlock, FormattedSegment } from './types.js';
import type * as Docx from 'docx';

export const BODY_FONT = 'PT Sans';
export const HEADING_FONT = 'GrueneTypeNeue';
export const CODE_FONT = 'Consolas';

const BODY_SIZE = 22;
const CODE_SIZE = 20;
const TABLE_SIZE = 20;

const HEADING_SIZE: Record<number, number> = { 1: 28, 2: 26, 3: 24, 4: 22, 5: 22, 6: 22 };

/** Numbering references declared on the Document and referenced per paragraph. */
export const ORDERED_LIST_REFERENCE = 'export-ordered';
export const BULLET_LIST_REFERENCE = 'export-bullet';

const MAX_LIST_LEVEL = 4;

/**
 * A hyperlink is only worth emitting for schemes Word can actually open.
 * Anything else stays coloured text — a `javascript:` target in a document
 * handed to a reader is not a link, it is a payload.
 */
export function isLinkable(href: string): boolean {
  return /^(https?:|mailto:)/i.test(href.trim());
}

function levelIndent(level: number): { left: number; hanging: number } {
  return { left: 720 + level * 360, hanging: 360 };
}

/**
 * Numbering definitions for the whole document. Ordered lists get one
 * `instance` per list occurrence (see `listId`) so a second list restarts at 1
 * instead of continuing the first one's count.
 */
export function buildNumberingConfig(docx: typeof Docx): Docx.INumberingOptions {
  const { LevelFormat, AlignmentType } = docx;
  const levels = Array.from({ length: MAX_LIST_LEVEL }, (_unused, level) => level);

  return {
    config: [
      {
        reference: ORDERED_LIST_REFERENCE,
        levels: levels.map((level) => ({
          level,
          format: level % 2 === 0 ? LevelFormat.DECIMAL : LevelFormat.LOWER_LETTER,
          text: `%${level + 1}.`,
          alignment: AlignmentType.START,
          style: { paragraph: { indent: levelIndent(level) } },
        })),
      },
      {
        reference: BULLET_LIST_REFERENCE,
        levels: levels.map((level) => ({
          level,
          format: LevelFormat.BULLET,
          text: ['•', '◦', '▪', '·'][level] ?? '•',
          alignment: AlignmentType.START,
          style: { paragraph: { indent: levelIndent(level) } },
        })),
      },
    ],
  };
}

interface RunStyle {
  size: number;
  font: string;
  color?: string;
}

function textRunsFor(
  docx: typeof Docx,
  segment: FormattedSegment,
  style: RunStyle
): Docx.ParagraphChild[] {
  const { TextRun, ExternalHyperlink } = docx;
  const isLink = Boolean(segment.href && isLinkable(segment.href));

  const shared = {
    bold: segment.bold,
    italics: segment.italic,
    strike: segment.strike ?? false,
    size: segment.code ? style.size - 2 : style.size,
    font: segment.code ? CODE_FONT : style.font,
    ...(isLink ? { style: 'Hyperlink' } : style.color ? { color: style.color } : {}),
  };

  // A `\n` inside a segment came from a hard line break. A literal newline in
  // <w:t> is collapsed by Word, so each line becomes its own run and every run
  // after the first carries `break: 1`.
  const runs = segment.text
    .split('\n')
    .map(
      (line, index) => new TextRun({ ...shared, text: line, ...(index > 0 ? { break: 1 } : {}) })
    );

  if (isLink && segment.href) {
    return [new ExternalHyperlink({ children: runs, link: segment.href })];
  }
  return runs;
}

/**
 * Split `[cite:N]` markers out of a segment so they render as superscripts.
 * Only applied when the caller actually supplied citations — otherwise the
 * marker text is left exactly as written.
 */
function segmentWithCitations(
  docx: typeof Docx,
  segment: FormattedSegment,
  style: RunStyle
): Docx.ParagraphChild[] {
  if (!segment.text.includes('[cite:')) return textRunsFor(docx, segment, style);

  const { TextRun } = docx;
  return parseCitationMarkers(segment.text).flatMap((part) =>
    part.isCitation
      ? [
          new TextRun({
            text: part.text,
            superScript: true,
            size: 16,
            color: '0066cc',
            font: style.font,
          }),
        ]
      : textRunsFor(docx, { ...segment, text: part.text }, style)
  );
}

function runsForSegments(
  docx: typeof Docx,
  segments: FormattedSegment[],
  style: RunStyle,
  withCitations: boolean
): Docx.ParagraphChild[] {
  return segments.flatMap((segment) =>
    withCitations ? segmentWithCitations(docx, segment, style) : textRunsFor(docx, segment, style)
  );
}

export interface RenderOptions {
  /** Enables `[cite:N]` → superscript rewriting. */
  withCitations?: boolean;
  /** Resolved image data by block `src`; unresolved images fall back to an alt-text link. */
  images?: ReadonlyMap<string, ResolvedImage>;
}

const FONTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public/fonts');

let embeddedFontsPromise: Promise<Array<{ name: string; data: Buffer }>> | null = null;

/**
 * Fonts for the Document's `fonts` option, so the file carries `PT Sans` and
 * `GrueneTypeNeue` instead of hoping the reader's machine has them. Only the
 * regular cuts exist as files; Word synthesises bold/italic from them. Consolas
 * stays unembedded — not ours to ship, and universally installed anyway.
 */
export function loadEmbeddedFonts(): Promise<Array<{ name: string; data: Buffer }>> {
  embeddedFontsPromise ??= Promise.all([
    fs.readFile(path.join(FONTS_DIR, 'PTSans-Regular.ttf')),
    fs.readFile(path.join(FONTS_DIR, 'GrueneTypeNeue-Regular.ttf')),
  ]).then(([body, heading]) => [
    { name: BODY_FONT, data: body },
    { name: HEADING_FONT, data: heading },
  ]);
  return embeddedFontsPromise;
}

/**
 * Section header/footer shared by both export routes: document title top right,
 * `Seite N von M` bottom centre.
 */
export function buildPageChrome(
  docx: typeof Docx,
  title: string
): { headers: { default: Docx.Header }; footers: { default: Docx.Footer } } {
  const { Header, Footer, Paragraph, TextRun, AlignmentType, PageNumber } = docx;
  const style = { size: 16, color: '666666', font: BODY_FONT };

  return {
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            children: [new TextRun({ ...style, text: title })],
            alignment: AlignmentType.RIGHT,
          }),
        ],
      }),
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                ...style,
                children: ['Seite ', PageNumber.CURRENT, ' von ', PageNumber.TOTAL_PAGES],
              }),
            ],
            alignment: AlignmentType.CENTER,
          }),
        ],
      }),
    },
  };
}

/**
 * Turn parsed blocks into the `children` of a docx section.
 */
export function renderBlocks(
  docx: typeof Docx,
  blocks: FormattedBlock[],
  options: RenderOptions = {}
): Docx.FileChild[] {
  const {
    Paragraph,
    HeadingLevel,
    AlignmentType,
    BorderStyle,
    Table,
    TableRow,
    TableCell,
    WidthType,
  } = docx;
  const withCitations = options.withCitations ?? false;
  const out: Docx.FileChild[] = [];

  for (const block of blocks) {
    if (block.kind === 'heading') {
      const size = HEADING_SIZE[block.level] ?? BODY_SIZE;
      out.push(
        new Paragraph({
          children: runsForSegments(
            docx,
            block.segments.map((seg) => ({ ...seg, bold: true })),
            { size, font: HEADING_FONT },
            withCitations
          ),
          heading:
            block.level === 1
              ? HeadingLevel.HEADING_1
              : block.level === 2
                ? HeadingLevel.HEADING_2
                : HeadingLevel.HEADING_3,
          spacing: { before: 300, after: 200 },
        })
      );
    } else if (block.kind === 'paragraph') {
      const quoted = block.quoteDepth > 0;
      out.push(
        new Paragraph({
          children: runsForSegments(
            docx,
            quoted ? block.segments.map((seg) => ({ ...seg, italic: true })) : block.segments,
            { size: BODY_SIZE, font: BODY_FONT, ...(quoted ? { color: '555555' } : {}) },
            withCitations
          ),
          spacing: { after: 200 },
          ...(quoted
            ? {
                indent: { left: 360 * block.quoteDepth },
                border: {
                  left: { style: BorderStyle.SINGLE, size: 12, color: 'cccccc', space: 12 },
                },
              }
            : { alignment: AlignmentType.JUSTIFIED }),
        })
      );
    } else if (block.kind === 'listItem') {
      const level = Math.min(block.level, MAX_LIST_LEVEL - 1);
      out.push(
        new Paragraph({
          children: runsForSegments(
            docx,
            block.segments,
            { size: BODY_SIZE, font: BODY_FONT },
            withCitations
          ),
          numbering: {
            reference: block.ordered ? ORDERED_LIST_REFERENCE : BULLET_LIST_REFERENCE,
            level,
            instance: block.listId,
          },
          spacing: { after: 100 },
        })
      );
    } else if (block.kind === 'code') {
      for (const line of block.text.split('\n')) {
        out.push(
          new Paragraph({
            children: runsForSegments(
              docx,
              [{ text: line || ' ', bold: false, italic: false, code: true }],
              { size: CODE_SIZE, font: CODE_FONT },
              false
            ),
            spacing: { after: 0 },
            indent: { left: 360 },
            shading: { fill: 'f4f4f4' },
          })
        );
      }
      out.push(new Paragraph({ children: [], spacing: { after: 200 } }));
    } else if (block.kind === 'image') {
      const resolved = options.images?.get(block.src);
      if (resolved) {
        out.push(
          new Paragraph({
            children: [
              new docx.ImageRun({
                type: resolved.type,
                data: resolved.data,
                transformation: { width: resolved.width, height: resolved.height },
                altText: {
                  name: block.alt || 'Bild',
                  description: block.alt || 'Bild',
                  title: block.alt || 'Bild',
                },
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          })
        );
      } else {
        // Unresolvable picture: the alt text as a link, exactly the shape the
        // export produced before images were embedded at all.
        out.push(
          new Paragraph({
            children: runsForSegments(
              docx,
              [{ text: block.alt || block.src, bold: false, italic: false, href: block.src }],
              { size: BODY_SIZE, font: BODY_FONT },
              false
            ),
            spacing: { after: 200 },
          })
        );
      }
    } else if (block.kind === 'divider') {
      out.push(
        new Paragraph({
          children: [],
          spacing: { before: 200, after: 200 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'cccccc' } },
        })
      );
    } else if (block.kind === 'table') {
      const columns = Math.max(block.header.length, ...block.rows.map((row) => row.length), 1);

      const cell = (segments: FormattedSegment[], header: boolean): Docx.TableCell =>
        new TableCell({
          children: [
            new Paragraph({
              children: runsForSegments(
                docx,
                header ? segments.map((seg) => ({ ...seg, bold: true })) : segments,
                { size: TABLE_SIZE, font: BODY_FONT },
                withCitations
              ),
              spacing: { after: 0 },
            }),
          ],
          ...(header ? { shading: { fill: 'f0f0f0' } } : {}),
        });

      const pad = (cells: FormattedSegment[][]): FormattedSegment[][] =>
        Array.from({ length: columns }, (_unused, index) => cells[index] ?? []);

      const rows: Docx.TableRow[] = [];
      if (block.header.length > 0) {
        rows.push(
          new TableRow({
            children: pad(block.header).map((segments) => cell(segments, true)),
            tableHeader: true,
          })
        );
      }
      for (const row of block.rows) {
        rows.push(new TableRow({ children: pad(row).map((segments) => cell(segments, false)) }));
      }

      if (rows.length > 0) {
        out.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
        out.push(new Paragraph({ children: [], spacing: { after: 200 } }));
      }
    }
  }

  return out;
}
