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
  type PDFDict,
  type PDFEmbeddedPage,
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

/** The slice of fontkit's Font we use; @pdf-lib/fontkit ships no public types. */
interface FontkitFont {
  hasGlyphForCodePoint(codePoint: number): boolean;
}

export type PdfLocale = 'de-DE' | 'de-AT';

export interface PdfSender {
  name?: string | null;
  organization?: string | null;
  address?: string | null;
}

export interface RenderPdfOptions {
  locale: PdfLocale;
  sender?: PdfSender | null;
  /**
   * Draw the Absender block in the `document`/`form` layouts too.
   *
   * A letterhead is an additive band, NOT a layout: it must not drag in the
   * DIN-5008 furniture (recipient, place/date, subject, salutation, signature)
   * that `kind: 'letter'` implies. Letters ignore this flag: there the Absender
   * stands in der Rücksendeangabe des Anschriftfelds, und der Block kommt nur
   * dann dazu, wenn die fehlt.
   *
   * Deliberately explicit rather than derived from `sender != null`:
   * renderPdfFixtures.ts passes a sender to the document and form fixtures too,
   * so a derived rule would silently give them a letterhead.
   */
  letterhead?: boolean;
  /**
   * Versandweg. Die DIN-5008-Geometrie ist für beide dieselbe — verschieden ist
   * nur, ob oben rechts 74 × 40 mm für Freimachung und Matchcode freibleiben
   * müssen. Kommt aus dem Briefkopf der Nutzer*in, weil es vom gewählten
   * Versanddienst abhängt und nicht von uns.
   */
  dispatchMode?: 'fensterkuvert' | 'direktfrankierung';
  /** Absenderzeile im Sichtfenster. Aus, wenn der Briefbogen sie schon trägt. */
  returnLine?: boolean;
  /** Falz- und Lochmarken — beim Selbstdruck nützlich, beim Dienstleister nicht. */
  foldMarks?: boolean;
  /**
   * Eigener Briefbogen, der UNTER den Text gelegt wird: PDF (erste Seite auf
   * Seite 1, zweite auf alle Folgeseiten — das klassische Briefbogen/Folgebogen-
   * Paar) oder ein Bild. Trägt er Logo und Absender, zeichnet der Renderer
   * beides nicht noch einmal darüber.
   */
  stationery?: { bytes: Buffer; type: 'pdf' | 'png' | 'jpg' } | null;
}

export interface RenderPdfResult {
  bytes: Buffer;
  /** AcroForm field names in tab order — empty for non-form documents. */
  fields: string[];
  checks: TaggingChecks;
  /** True when the viewer has to build the field appearances itself. */
  appearanceFallback: boolean;
  /** Characters dropped because no embedded font could render them. */
  missingGlyphs: string[];
  /** Total number of dropped characters, not just how many distinct ones. */
  droppedGlyphCount: number;
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
/** PDF user units per millimetre — every DIN measurement below is stated in mm. */
const MM = 2.834645669;

/**
 * DIN 5008 Form B — the geometry a windowed DIN-lang envelope and every digital
 * mail service (LetterXpress, Pingen, E-POST) validate against.
 *
 * Form B rather than Form A because the letter carries a letterhead band: the
 * logo and the Absender block occupy the top 45 mm, which is exactly the space
 * Form A would need for the Anschriftfeld.
 *
 * The field holds 9 lines over 40 mm: 3 lines Zusatz- und Vermerkzone (the
 * Rücksendeangabe sits in the first) and 6 lines Anschriftzone for the address
 * itself. Nothing else may be printed inside it — it is what shows through the
 * envelope window.
 */
const ADDRESS_FIELD = {
  left: 20 * MM,
  width: 85 * MM,
  /**
   * Das Feld wird NICHT bis an den Rand beschriftet: der Anschrifttext steht
   * 5 mm eingerückt und landet damit auf derselben Fluchtlinie wie Betreff und
   * Brieftext (25 mm). Am Feldrand gesetzt stand die Anschrift sichtbar 5 mm
   * links vom übrigen Brief — die 20 mm sind die Grenze der Zone, nicht die
   * Textkante.
   */
  textInset: 5 * MM,
  top: 50 * MM,
  height: 40 * MM,
  lineHeight: (40 / 9) * MM,
  zvzLines: 3,
};
/** Fluchtlinie des Anschrifttexts — deckungsgleich mit MARGIN_L. */
const ADDRESS_TEXT_LEFT = ADDRESS_FIELD.left + ADDRESS_FIELD.textInset;
const ADDRESS_TEXT_WIDTH = ADDRESS_FIELD.width - ADDRESS_FIELD.textInset;
/** Anschriftzone: where the recipient's own lines start. */
const ADDRESS_ZONE_TOP = ADDRESS_FIELD.top + ADDRESS_FIELD.zvzLines * ADDRESS_FIELD.lineHeight;
/** Left edge of the DIN Informationsblock — right of the envelope window. */
const INFO_BLOCK_LEFT = 125 * MM;
/** Two lines below the Anschriftfeld, per DIN 5008. */
const SUBJECT_TOP = ADDRESS_FIELD.top + ADDRESS_FIELD.height + 2 * ADDRESS_FIELD.lineHeight;
/**
 * Codierzone: Deutsche Post prints the routing code into the bottom 15 mm of
 * the address side, so nothing of ours may be there. The reserve keeps body
 * text a further margin above it; the footer is drawn in between.
 */
/**
 * Freimachungszone: wird direkt aufs Blatt frankiert statt aufs Kuvert, muss
 * oben rechts dieses Feld frei bleiben — dort sitzen Freimachungsvermerk und
 * Matchcode. Im Fensterkuvert ist es belanglos, deshalb hängt es am Versandweg.
 */
const FRANKING_ZONE = { width: 74 * MM, height: 40 * MM };
const CODING_ZONE = 15 * MM;
const FOOTER_BASELINE = CODING_ZONE + 5;
const MARGIN_L = 25 * MM;
const MARGIN_R = 20 * MM;
const FOOTER_RESERVE = 62;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
const CONTINUATION_TOP = PAGE_H - 70;

const BODY_COLOR = rgb(0.2, 0.2, 0.2);
const MUTED_COLOR = rgb(0.45, 0.45, 0.45);
const FIELD_BG = rgb(0.965, 0.973, 0.965);
const FIELD_BORDER = rgb(0.62, 0.66, 0.62);
const RULE_COLOR = rgb(0.85, 0.87, 0.85);

const EMOJI_REGEX = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu;

/**
 * The area body text may occupy. Exported so the self-check measures against the
 * real layout — the page box alone would not catch text printed over the footer.
 *
 * `exempt` is the DIN Anschriftfeld: it sits 5 mm LEFT of the writing margin by
 * standard, so without the exemption every dispatch-ready address would be
 * reported as overflow.
 */
export const PDF_TYPE_AREA = {
  left: MARGIN_L,
  right: PAGE_W - MARGIN_R,
  bottom: FOOTER_RESERVE - 10,
  exempt: {
    left: ADDRESS_FIELD.left,
    right: ADDRESS_FIELD.left + ADDRESS_FIELD.width,
    top: PAGE_H - ADDRESS_FIELD.top,
    bottom: PAGE_H - ADDRESS_FIELD.top - ADDRESS_FIELD.height,
  },
};

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
  /** Whether a font actually has a glyph for a code point. */
  supports: (font: PDFFont, codePoint: number) => boolean;
  /** Characters no embedded font could render; reported with the result. */
  missing: Set<string>;
  /** How OFTEN that happened — the set alone hides the scale of the loss. */
  droppedCount: { value: number };
}

/**
 * ASCII stand-ins for characters our CI fonts do not carry. Drawing them anyway
 * would emit a .notdef glyph, which PDF/UA 7.21.8 forbids outright and which
 * shows up as an empty box in the reader.
 */
const GLYPH_FALLBACKS: Record<string, string> = {
  // The hyphen family. U+2011 (non-breaking hyphen) is the one that bit us:
  // language models type it inside compound names, no CI font carries it, and
  // without a stand-in it was DELETED — "Klarwasser‑BASIS‑1" reached the reader
  // as "KlarwasserBASIS1", a different string in the document's own title.
  '‐': '-', // hyphen
  '‑': '-', // non-breaking hyphen
  '‒': '-', // figure dash
  '–': '-', // en dash
  '—': '-', // em dash
  '―': '-', // horizontal bar
  // Typographic spaces. Dropping one glues two words together silently, and
  // the reader sees a compound word that was never written.
  '\u00A0': ' ', // no-break space
  '\u2007': ' ', // figure space
  '\u2009': ' ', // thin space
  '\u200A': ' ', // hair space
  '\u202F': ' ', // narrow no-break space
  // Bullets that turn up in generated lists.
  '‣': '-',
  '▪': '-',
  '▫': '-',
  '◦': '-',
  '→': '->',
  '⇒': '=>',
  '➔': '->',
  '➜': '->',
  '⟶': '->',
  '←': '<-',
  '⇐': '<=',
  '↔': '<->',
  '✓': 'x',
  '✔': 'x',
  '✗': '-',
  '✘': '-',
  '☑': '[x]',
  '☐': '[ ]',
  '−': '-',
  '⋅': '·',
};

/**
 * Invisible formatting marks that are SUPPOSED to disappear in print: a soft
 * hyphen only marks where a word may break, a zero-width space only permits one.
 * They have no glyph by design, so reporting them as "characters we could not
 * render" would fill the self-check with problems that are not problems — and
 * a problem list nobody trusts is one nobody reads.
 */
const SILENTLY_DROPPED = new Set([
  '\u00AD', // soft hyphen
  '\u200B', // zero-width space
  '\u200C', // zero-width non-joiner
  '\u200D', // zero-width joiner
  '\u200E', // left-to-right mark
  '\u200F', // right-to-left mark
  '\uFEFF', // byte-order mark
]);

/**
 * Split text into runs by which embedded font can actually render each
 * character: body font first, emoji font second, ASCII stand-in third. A
 * character with no glyph anywhere is dropped and recorded.
 */
function splitIntoFontRuns(text: string, textFont: PDFFont, fonts: RendererFonts): FontRun[] {
  const runs: FontRun[] = [];
  const push = (chunk: string, font: PDFFont) => {
    const last = runs[runs.length - 1];
    if (last && last.font === font) last.text += chunk;
    else runs.push({ text: chunk, font });
  };

  // NFC zuerst: in zerlegter Form (NFD — der Normalfall bei macOS-Dateinamen
  // und vielen Copy-Paste-Wegen) ist "ä" ein "a" plus ein kombinierendes
  // Trema. Für das Trema hat keine unserer Schriften eine Glyphe, es fiel
  // heraus, und aus "Wärmeplanung für Österreich" wurde "Warmeplanung fur
  // Osterreich" — falsches Deutsch, ohne jede Meldung.
  for (const char of text.normalize('NFC')) {
    const cp = char.codePointAt(0);
    if (cp === undefined) continue;
    if (SILENTLY_DROPPED.has(char)) continue;
    if (fonts.supports(textFont, cp)) {
      push(char, textFont);
      continue;
    }
    if (fonts.supports(fonts.emoji, cp)) {
      push(char, fonts.emoji);
      continue;
    }
    const fallback = GLYPH_FALLBACKS[char];
    if (fallback) {
      push(fallback, textFont);
      continue;
    }
    // No glyph and no stand-in: dropping is the only PDF/UA-legal option, but
    // it IS a loss, so it gets reported rather than swallowed.
    fonts.missing.add(char);
    fonts.droppedCount.value += 1;
  }

  return runs.length ? runs : [{ text: '', font: textFont }];
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

// Decode &amp; LAST to prevent double-decoding (&amp;lt; would otherwise become
// "<" instead of "&lt;") — same order as contentParser.ts.
function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
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
  // A word ends at whitespace — NOT at a segment boundary. Segments split
  // wherever formatting changes, so treating each one as its own word put a
  // space inside every word that changes style mid-way: "Maß**nahme**" came
  // out as "Maß nahme", "A**B**C" as "A B C".
  let current: Word | null = null;
  const closeWord = () => {
    if (current) words.push(current);
    current = null;
  };
  for (const seg of segments) {
    const font = seg.bold ? fonts.bodyBold : fonts.body;
    for (const token of seg.text.split(/(\s+)/)) {
      if (!token) continue;
      if (/^\s+$/.test(token)) {
        closeWord();
        for (const ch of token) {
          if (ch === '\n') words.push({ runs: [], width: 0, lineBreak: true });
        }
        continue;
      }
      const runs = splitIntoFontRuns(token, font, fonts);
      const width = measureRuns(runs, fontSize);
      if (current) {
        current.runs.push(...runs);
        current.width += width;
      } else {
        current = { runs, width };
      }
    }
  }
  closeWord();

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

/**
 * Zwei Überschriften auf dieselbe Zeile prüfen, ohne an Anführungszeichen,
 * Bindestrichen oder Groß-/Kleinschreibung zu scheitern: der Dokumenttitel
 * verliert unterwegs schon mal die Gänsefüßchen, gemeint ist trotzdem dieselbe
 * Zeile.
 */
function sameHeadline(a: string, b: string): boolean {
  const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const normalized = norm(a);
  return normalized.length > 0 && normalized === norm(b);
}

/**
 * Eine führende Überschrift streichen, die den Kopf nur wiederholt.
 *
 * Der Docs-Export schickt den Dokumenttitel als Betreff UND den Dokumentinhalt
 * mitsamt dessen eigener H1 — dieselbe Zeile stand dann zweimal untereinander.
 * Geprüft wird nur der ERSTE Block: eine gleichlautende Überschrift weiter
 * unten gliedert den Text und bleibt stehen.
 *
 * Der letzte Block bleibt unangetastet, damit aus einem Dokument, das nur aus
 * seinem Titel besteht, keine Seite ohne jeden Inhalt wird.
 */
function dropRepeatedHeadline(blocks: PdfBlock[], headline: string): PdfBlock[] {
  const first = blocks[0];
  if (blocks.length < 2 || !first || first.type !== 'heading') return blocks;
  return sameHeadline(first.text, headline) ? blocks.slice(1) : blocks;
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

/** Eingebetteter Briefbogen: PDF-Seiten oder ein Bild, beides vollflächig. */
type Stationery =
  | { kind: 'page'; first: PDFEmbeddedPage; rest: PDFEmbeddedPage }
  | { kind: 'image'; image: PDFImage };

class PdfRenderer {
  private page: PDFPage;
  private y: number;
  private readonly tagger: PdfTagger;
  private readonly form: PDFForm;
  private readonly takenNames = new Set<string>();
  private readonly fieldNames: string[] = [];
  private fieldAppearanceFailed = false;
  /**
   * Quellebenen der offenen Abschnitte. Der Dokumenttitel ist bereits eine H1,
   * deshalb beginnt der Inhalt eine Ebene darunter.
   */
  private readonly outline: number[] = [];

  constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: RendererFonts,
    private readonly theme: Theme,
    private readonly logo: PDFImage,
    private readonly spec: PdfDocumentSpec,
    private readonly opts: RenderPdfOptions,
    private readonly stationery: Stationery | null = null
  ) {
    this.tagger = new PdfTagger(doc, { language: spec.language, title: spec.title });
    this.form = doc.getForm();
    this.page = doc.addPage([PAGE_W, PAGE_H]);
    this.drawStationery();
    this.y = CONTINUATION_TOP;
  }

  // ── page plumbing ──────────────────────────────────────────────────────────

  private newPage(): void {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.drawStationery();
    this.y = CONTINUATION_TOP;
  }

  /**
   * Briefbogen unter den Inhalt legen. Muss direkt nach dem Anlegen der Seite
   * laufen: der Inhaltsstrom wird in Zeichenreihenfolge gemalt, später gezogen
   * läge der Bogen ÜBER dem Text.
   */
  private drawStationery(): void {
    const stationery = this.stationery;
    if (!stationery) return;
    const page = this.page;
    const first = this.doc.getPageCount() === 1;
    this.tagger.artifact(page, () => {
      const box = { x: 0, y: 0, width: PAGE_W, height: PAGE_H };
      if (stationery.kind === 'image') page.drawImage(stationery.image, box);
      else page.drawPage(first ? stationery.first : stationery.rest, box);
    });
  }

  private ensureSpace(needed: number): void {
    if (this.y - needed < FOOTER_RESERVE) this.newPage();
  }

  private drawLogo(): void {
    // Der eigene Briefbogen trägt seine eigene Marke — unser Logo daraufzulegen
    // ergäbe zwei Absender auf einem Blatt.
    if (this.stationery) return;
    const height = this.theme.logoHeight;
    const width = (this.logo.width / this.logo.height) * height;
    const page = this.page;
    // Bei Direktfrankierung gehören die oberen 40 mm rechts der Post: dort
    // landen Freimachung und Matchcode. Das Logo rückt darunter, auf Höhe des
    // Anschriftfelds, und bleibt rechts vom Sichtfenster.
    const top = this.opts.dispatchMode === 'direktfrankierung' ? FRANKING_ZONE.height + 2 : 42;
    this.tagger.artifact(page, () =>
      page.drawImage(this.logo, {
        x: PAGE_W - MARGIN_R - width,
        y: PAGE_H - top - height,
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
        const titleRuns = splitIntoFontRuns(shortTitle, this.fonts.body, this.fonts);
        drawRuns(page, titleRuns, MARGIN_L, FOOTER_BASELINE, 8, MUTED_COLOR);
        if (pages.length > 1) {
          const label = `Seite ${i + 1} von ${pages.length}`;
          const runs = splitIntoFontRuns(label, this.fonts.body, this.fonts);
          drawRuns(
            page,
            runs,
            PAGE_W - MARGIN_R - measureRuns(runs, 8),
            FOOTER_BASELINE,
            8,
            MUTED_COLOR
          );
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

  /**
   * Wrap `text` to `maxWidth`, keep at most `maxLines` and ellipsize the rest.
   * Without a bound, long text used to run past the page edge and over the
   * neighbouring column — visually broken and impossible to notice in a test
   * that only checks that the PDF is valid.
   */
  private boundedLines(
    text: string,
    font: PDFFont,
    size: number,
    maxWidth: number,
    maxLines: number
  ): FontRun[][] {
    const forced = { ...this.fonts, body: font, bodyBold: font };
    const lines = wrapSegments([{ text, bold: false }], forced, size, maxWidth);
    if (lines.length <= maxLines) return lines;

    const kept = lines.slice(0, maxLines).map((line) => line.map((run) => ({ ...run })));
    const ellipsis = splitIntoFontRuns('…', font, this.fonts);
    const ellipsisWidth = measureRuns(ellipsis, size);
    const last = kept[maxLines - 1];
    while (last.length && measureRuns(last, size) + ellipsisWidth > maxWidth) {
      const tail = last[last.length - 1];
      if (tail.text.length > 1) tail.text = tail.text.slice(0, -1);
      else last.pop();
    }
    kept[maxLines - 1] = [...last, ...ellipsis];
    return kept;
  }

  /**
   * Tagged text at an absolute position. Goes through the same font-run split as
   * body text, so a character the CI fonts lack never reaches the page as a
   * .notdef box here either. Returns the number of lines drawn.
   */
  private writeLineAt(
    tag: Parameters<PdfTagger['tag']>[0],
    text: string,
    x: number,
    y: number,
    size: number,
    font: PDFFont,
    color: RGB,
    bounds?: { maxWidth: number; maxLines?: number; lineHeight?: number }
  ): number {
    const page = this.page;
    const lines = bounds
      ? this.boundedLines(text, font, size, bounds.maxWidth, bounds.maxLines ?? 1)
      : [splitIntoFontRuns(text, font, this.fonts)];
    const lineHeight = bounds?.lineHeight ?? size * 1.25;

    this.tagger.tag(tag, () => {
      lines.forEach((line, i) => {
        if (!line.length) return;
        const lineY = y - i * lineHeight;
        this.tagger.content(page, () => drawRuns(page, line, x, lineY, size, color));
      });
    });
    return Math.max(lines.length, 1);
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

  /**
   * Quellebene → Ausgabeebene, so dass Geschwister Geschwister bleiben.
   *
   * Eine reine Klemmung auf "höchstens eine Ebene tiefer als die vorige"
   * erzeugt aus drei gleichrangigen `###` eine H2 mit zwei untergeordneten H3:
   * die erste rutscht hoch, die folgenden nicht. Der Screenreader kündigt
   * damit eine Gliederung an, die es im Dokument nicht gibt. Deshalb wird die
   * Verschachtelung aus den Quellebenen abgeleitet statt aus der Vorgängerin.
   */
  private outlineLevel(sourceLevel: number): 1 | 2 | 3 {
    while (this.outline.length && this.outline[this.outline.length - 1]! >= sourceLevel) {
      this.outline.pop();
    }
    this.outline.push(sourceLevel);
    // +1, weil der Dokumenttitel die H1 belegt; tiefer als H3 kann das
    // Blockmodell nicht, dort laufen weitere Ebenen zusammen.
    return Math.min(this.outline.length + 1, 3) as 1 | 2 | 3;
  }

  private renderBlock(block: PdfBlock): void {
    switch (block.type) {
      case 'heading': {
        const level = this.outlineLevel(block.level);
        const size = level === 1 ? 16 : level === 2 ? 13.5 : 12;
        this.ensureSpace(size * 2.6);
        this.y -= 8;
        this.tagger.tag(level === 1 ? 'H1' : level === 2 ? 'H2' : 'H3', () =>
          this.writeText(inlineSegments(block.text), {
            fontSize: size,
            lineHeight: size * 1.3,
            color: this.theme.primary,
            spacingAfter: 6,
            font: level <= 2 ? this.fonts.heading : this.fonts.bodyBold,
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
    interface ListNode {
      text: string;
      ordered: boolean;
      children: ListNode[];
    }

    // Die flache Eintragsliste trägt ihre Tiefe mit; daraus wird wieder ein
    // Baum, damit jede Ebene eigenständig zählt und als eigenes L-Element
    // getaggt wird (ein Screenreader kündigt die Unterliste dann als solche an).
    const roots: ListNode[] = [];
    const path: ListNode[] = [];
    for (const raw of block.items) {
      const entry =
        typeof raw === 'string'
          ? { text: raw, level: 0, ordered: block.ordered ?? false }
          : { text: raw.text, level: raw.level, ordered: raw.ordered ?? block.ordered ?? false };
      const node: ListNode = { text: entry.text, ordered: entry.ordered, children: [] };
      // Eine Ebene, die ohne Elternteil auftaucht (fehlerhafte Quelle), rutscht
      // nach oben statt verlorenzugehen.
      const depth = Math.min(entry.level, path.length);
      path.length = depth;
      if (depth === 0) roots.push(node);
      else path[depth - 1]!.children.push(node);
      path.push(node);
    }

    const fontSize = 11;
    const step = 16;

    const renderLevel = (nodes: ListNode[], depth: number): void => {
      const indent = step * (depth + 1);
      this.tagger.open('L');
      let index = 1;
      for (const node of nodes) {
        this.tagger.open('LI');
        const marker = node.ordered ? `${index}.` : depth > 0 ? '–' : '•';
        this.ensureSpace(fontSize * 1.45);
        this.writeLineAt(
          'Lbl',
          marker,
          MARGIN_L + indent - 12,
          this.y,
          fontSize,
          node.ordered ? this.fonts.body : this.fonts.bodyBold,
          this.theme.accent
        );
        // Die Unterliste gehört IN den LBody: ein LI darf laut PDF/UA (7.2-20)
        // nur Lbl und LBody enthalten, kein L als drittes Geschwister.
        this.tagger.open('LBody');
        this.writeText(inlineSegments(node.text), { fontSize, indent, spacingAfter: 3 });
        if (node.children.length) renderLevel(node.children, depth + 1);
        this.tagger.close();
        this.tagger.close();
        index += 1;
      }
      this.tagger.close();
    };

    renderLevel(roots, 0);
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

  /**
   * The box is drawn per page, not once: a long note used to paint a single
   * rectangle whose lower edge ended up thousands of points below the page while
   * the text kept flowing onto later pages without any box at all.
   */
  private renderNote(block: Extract<PdfBlock, { type: 'note' }>): void {
    const padding = 10;
    const lineHeight = 15;
    const fontSize = 10.5;
    const innerWidth = CONTENT_W - padding * 2;
    const titleHeight = block.title ? 16 : 0;
    const lines = wrapSegments(inlineSegments(block.text), this.fonts, fontSize, innerWidth);

    this.tagger.open('Sect');
    let index = 0;
    let first = true;
    while (index < lines.length) {
      const reserved = padding * 2 + (first ? titleHeight : 0);
      let capacity = Math.floor((this.y + 4 - FOOTER_RESERVE - reserved) / lineHeight);
      if (capacity < 1) {
        this.newPage();
        capacity = Math.floor((this.y + 4 - FOOTER_RESERVE - reserved) / lineHeight);
        if (capacity < 1) break;
      }
      const slice = lines.slice(index, index + capacity);
      const page = this.page;
      const boxTop = this.y + 4;
      const boxHeight = slice.length * lineHeight + reserved;
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
      if (first && block.title) {
        this.writeLineAt(
          'P',
          block.title,
          MARGIN_L + padding,
          this.y,
          fontSize,
          this.fonts.bodyBold,
          this.theme.primary,
          { maxWidth: innerWidth }
        );
        this.y -= titleHeight;
      }
      this.tagger.open('P');
      for (const line of slice) {
        if (line.length) {
          const lineY = this.y;
          this.tagger.content(page, () =>
            drawRuns(page, line, MARGIN_L + padding, lineY, fontSize, BODY_COLOR)
          );
        }
        this.y -= lineHeight;
      }
      this.tagger.close();

      this.y -= padding;
      index += slice.length;
      first = false;
      if (index < lines.length) this.newPage();
    }
    this.tagger.close();
    this.y -= 8;
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
      if (row.length <= columnCount) {
        const cells = [...row];
        while (cells.length < columnCount) cells.push('');
        return cells;
      }
      // More cells than columns: fold the surplus into the last column rather
      // than dropping it. Silently losing a cell is worse than a crowded one.
      const cells = row.slice(0, columnCount - 1);
      cells.push(
        row
          .slice(columnCount - 1)
          .filter(Boolean)
          .join(' · ')
      );
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

    const wrapCells = (cells: string[], header: boolean): FontRun[][][] =>
      cells.map((cell, i) =>
        wrapSegments(
          header ? [{ text: cell, bold: true }] : inlineSegments(cell),
          this.fonts,
          fontSize,
          (widths[i] ?? CONTENT_W) - padX * 2
        )
      );

    /** Draw one slice of a row: `take` lines per cell, starting at `from`. */
    const drawSlice = (
      wrapped: FontRun[][][],
      from: number,
      take: number,
      header: boolean,
      tagged: boolean
    ): void => {
      const height = take * lineHeight + padY * 2;
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

      const drawCells = () => {
        let x = MARGIN_L;
        wrapped.forEach((lines, i) => {
          const isHeaderCell = header || rowHeaderColumn === i;
          const cellX = x;
          const color = isHeaderCell ? this.theme.primary : BODY_COLOR;
          const paint = (wrap: (draw: () => void) => void) => {
            let cellY = this.y;
            for (const line of lines.slice(from, from + take)) {
              if (line.length) {
                const lineY = cellY;
                wrap(() => drawRuns(page, line, cellX + padX, lineY, fontSize, color));
              }
              cellY -= lineHeight;
            }
          };
          if (tagged) {
            this.tagger.open(
              isHeaderCell ? 'TH' : 'TD',
              isHeaderCell ? { scope: header ? 'Column' : 'Row' } : {}
            );
            paint((draw) => this.tagger.content(page, draw));
            this.tagger.close();
          } else {
            // A repeated header is a visual aid only; tagging it again would
            // make a screen reader read the header row twice.
            paint((draw) => this.tagger.artifact(page, draw));
          }
          x += widths[i] ?? 0;
        });
      };

      if (tagged) {
        this.tagger.open('TR');
        drawCells();
        this.tagger.close();
      } else {
        drawCells();
      }
      this.y -= height;
    };

    const headerWrapped = columns ? wrapCells(columns, true) : null;
    const headerLines = headerWrapped ? Math.max(...headerWrapped.map((w) => w.length), 1) : 0;
    const linesAvailable = (): number =>
      Math.floor((this.y + lineHeight - 2 - FOOTER_RESERVE - padY * 2) / lineHeight);
    const linesPerFreshPage = Math.floor(
      (CONTINUATION_TOP + lineHeight - 2 - FOOTER_RESERVE - padY * 2) / lineHeight
    );

    /**
     * Repeat the header after a page break — but never at the cost of data: an
     * unbounded repeat used to fill whole pages and push every following row
     * off the document.
     */
    const repeatHeader = (): void => {
      if (!headerWrapped) return;
      if (headerLines > linesAvailable() || headerLines * 2 > linesPerFreshPage) return;
      drawSlice(headerWrapped, 0, headerLines, true, false);
    };

    /**
     * A row taller than a whole page is split so it cannot print through the
     * footer; a row that would simply fit on the next page moves as a unit
     * instead of being torn apart mid-cell.
     */
    const drawRow = (cells: string[], header: boolean): void => {
      const wrapped = wrapCells(cells, header);
      const total = Math.max(...wrapped.map((w) => w.length), 1);
      if (!header && total <= linesPerFreshPage && total > linesAvailable()) {
        this.newPage();
        repeatHeader();
      }
      let from = 0;
      while (from < total) {
        let capacity = linesAvailable();
        if (capacity < 1) {
          this.newPage();
          if (!header) repeatHeader();
          capacity = linesAvailable();
          if (capacity < 1) break;
        }
        const take = Math.min(capacity, total - from);
        drawSlice(wrapped, from, take, header, true);
        from += take;
      }
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
    let labelLines = 1;
    for (let i = 0; i < count; i++) {
      labelLines = Math.max(
        labelLines,
        this.writeLineAt(
          'P',
          block.labels[i],
          MARGIN_L + i * slot,
          this.y,
          8.5,
          this.fonts.body,
          MUTED_COLOR,
          { maxWidth: slot - 12, maxLines: 2, lineHeight: 10.5 }
        )
      );
    }
    this.y -= 10 + labelLines * 10.5;
  }

  // ── form fields ────────────────────────────────────────────────────────────

  private renderFieldRow(fields: FieldBlock[]): void {
    const columns = fields.length;
    const gap = columns > 1 ? 16 : 0;
    const width = (CONTENT_W - gap * (columns - 1)) / columns;
    const height = Math.max(...fields.map((f) => this.fieldHeight(f, width)));
    this.ensureSpace(height + 8);
    const rowTop = this.y;
    fields.forEach((field, i) => {
      this.y = rowTop;
      this.renderField(field, MARGIN_L + i * (width + gap), width);
    });
    this.y = rowTop - height - 8;
  }

  /** Height must include a label that wrapped, or the next row draws on top of it. */
  private fieldHeight(field: FieldBlock, width: number): number {
    const label = field.required ? `${field.label} *` : field.label;
    const labelLines = this.boundedLines(label, this.fonts.bodyBold, 9, width, 2).length;
    const labelH = 5 + labelLines * 11;
    const helpH = field.help ? 16 : 0;
    if (field.kind === 'multiline') return labelH + (field.rows ?? 4) * 14 + 14 + helpH;
    if (field.kind === 'checkbox') {
      const beside = this.boundedLines(label, this.fonts.body, 10, width - 19, 2).length;
      return 24 + (beside - 1) * 11 + helpH;
    }
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

    // A `Form` element without a Role attribute must have exactly ONE child --
    // the object reference to its widget (PDF/UA-1, 7.18.4). So the label and
    // the hint are SIBLINGS of it inside a section, not children.
    this.tagger.open('Sect', { title: field.label });
    // The checkbox/radio label sits NEXT to the control, everything else above.
    if (field.kind !== 'checkbox') {
      const labelLines = this.writeLineAt(
        'Lbl',
        label,
        x,
        this.y,
        9,
        this.fonts.bodyBold,
        this.theme.primary,
        { maxWidth: width, maxLines: 2, lineHeight: 11 }
      );
      this.y -= 5 + labelLines * 11;
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
          field.kind === 'date' ? `${accessibleName} — Datum TT.MM.JJJJ` : accessibleName,
          text.acroField.dict
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
          accessibleName,
          checkbox.acroField.dict
        );
        this.writeLineAt(
          'Lbl',
          label,
          x + box + 7,
          top - box + 2,
          10,
          this.fonts.body,
          BODY_COLOR,
          {
            maxWidth: width - box - 7,
            maxLines: 2,
            lineHeight: 11,
          }
        );
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
            `${accessibleName}: ${option}`,
            group.acroField.dict
          );
          const optionLines = this.writeLineAt(
            'Lbl',
            option,
            x + size + 7,
            top - size + 2,
            10,
            this.fonts.body,
            BODY_COLOR,
            { maxWidth: width - size - 7, maxLines: 2, lineHeight: 11 }
          );
          this.y = top - size - 16 - (optionLines - 1) * 11;
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
          `${accessibleName} — Auswahl: ${options.join(', ')}`,
          dropdown.acroField.dict
        );
        dropdown.setFontSize(10);
        this.y = top - boxHeight - 12;
        break;
      }
    }

    if (field.help) {
      this.writeLineAt('P', field.help, x, this.y, 8, this.fonts.body, MUTED_COLOR, {
        maxWidth: width,
      });
      this.y -= 12;
    }

    this.tagger.close();
    this.fieldNames.push(name);
  }

  /**
   * pdf-lib appends the widget annotation to the page; grab the ref it just
   * pushed, wrap it in its own `Form` element (exactly one child) and name it.
   */
  private addWidget(
    add: () => void,
    page: PDFPage,
    accessibleName: string,
    fieldDict: PDFDict
  ): void {
    add();
    const annots = page.node.get(PDFName.of('Annots'));
    if (annots instanceof PDFArray && annots.size() > 0) {
      const ref = annots.get(annots.size() - 1);
      if (ref instanceof PDFRef) {
        this.tagger.tag(
          'Form',
          () => this.tagger.attachWidget(page, ref, accessibleName, fieldDict),
          { alt: accessibleName }
        );
      }
    }
  }

  // ── layouts ────────────────────────────────────────────────────────────────

  private renderDocumentHeader(): void {
    this.drawLogo();
    // Letterhead band above the title. Absolutely positioned, so the title
    // stays at PAGE_H-130 whether it is drawn or not; with the option off, not
    // a single tagger call happens and the output is byte-for-byte the old one.
    if (this.opts.letterhead) this.drawSenderBlock(senderLines(this.opts.sender));
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

  /**
   * Absender block, top-left above the type area.
   *
   * Absolutely positioned and never touches `this.y`, so it cannot disturb the
   * caller's text flow — that is what lets the document layout draw it in the
   * band above the title (PAGE_H-52 … PAGE_H-130) without moving anything.
   *
   * Im Brieflayout ist er der Ausnahmefall, nicht die Regel: dort trägt die
   * Rücksendeangabe den Absender, und beides zusammen stand doppelt auf dem
   * Blatt.
   *
   * The `Sect` is opened ONLY for a non-empty sender: opening it
   * unconditionally left sender-less letters with a childless structure
   * element, which is a PDF/UA smell no fixture covered.
   *
   * Content, not decoration — deliberately tagged rather than marked as an
   * artifact, so a screen reader can reach the sender's identity.
   */
  private drawSenderBlock(sender: string[]): void {
    // Auf eigenem Briefpapier steht der Absender schon im Kopf des Bogens.
    if (!sender.length || this.stationery) return;
    this.tagger.open('Sect', { title: 'Absender' });
    let senderY = PAGE_H - 52;
    sender.slice(0, 5).forEach((line, i) => {
      this.writeLineAt(
        'P',
        line,
        MARGIN_L,
        senderY,
        i === 0 ? 9.5 : 8.5,
        i === 0 ? this.fonts.bodyBold : this.fonts.body,
        i === 0 ? this.theme.primary : MUTED_COLOR,
        { maxWidth: CONTENT_W / 2 }
      );
      senderY -= i === 0 ? 13 : 11;
    });
    this.tagger.close();
  }

  /**
   * Falz- und Lochmarken, DIN 5008 Form B: folded at 105 mm and 210 mm the
   * Anschriftfeld lands in the window of a DIN-lang envelope. Hairlines at the
   * very left edge, drawn as artifacts so they never reach a screen reader.
   */
  private drawFoldMarks(): void {
    if (this.opts.foldMarks === false) return;
    const page = this.page;
    this.tagger.artifact(page, () => {
      for (const [fromTop, length] of [
        [105 * MM, 4 * MM],
        [148.5 * MM, 6 * MM],
        [210 * MM, 4 * MM],
      ]) {
        page.drawLine({
          start: { x: 8 * MM, y: PAGE_H - fromTop },
          end: { x: 8 * MM + length, y: PAGE_H - fromTop },
          thickness: 0.4,
          color: RULE_COLOR,
        });
      }
    });
  }

  /**
   * Rücksendeangabe für die erste Zeile des Anschriftfelds.
   *
   * Sie muss in EINE 85-mm-Zeile passen. Sie einfach zu kürzen wäre falsch:
   * abgeschnitten wird zuerst der Ort, also genau die Angabe, die eine
   * Rücksendung braucht. Stattdessen fallen die entbehrlichen Teile der Reihe
   * nach weg — erst der Personenname neben der Organisation, dann die Straße —
   * und die erste Fassung, die passt, wird gezeichnet.
   */
  private fitReturnLine(sender: string[]): string {
    if (!sender.length) return '';
    const head = sender[0];
    const rest = sender.slice(1);
    const city = rest.length ? rest[rest.length - 1] : '';
    const candidates = [
      sender,
      // Ohne den Personennamen, sofern eine Organisation davorsteht.
      rest.length > 1 ? [head, ...rest.slice(1)] : null,
      city ? [head, city] : null,
      [head],
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      const text = candidate.join(' · ');
      const runs = splitIntoFontRuns(text, this.fonts.body, this.fonts);
      if (measureRuns(runs, 7) <= ADDRESS_TEXT_WIDTH) return text;
    }
    return head;
  }

  private renderLetterHeader(): void {
    this.drawLogo();
    this.drawFoldMarks();
    const letter = this.spec.letter ?? {};
    const sender = senderLines(this.opts.sender);
    const page = this.page;

    // Rücksendeangabe — erste Zeile der Zusatz- und Vermerkzone, also INNERHALB
    // des Anschriftfelds. Sie ist die einzige Angabe außer der Anschrift, die
    // dort stehen darf.
    const returnLine = this.opts.returnLine === false ? '' : this.fitReturnLine(sender);

    // Der Absender gehört genau EINMAL aufs Blatt. Steht er in der
    // Rücksendeangabe, entfällt der Block oben links — sonst las sich derselbe
    // Absender zweimal, wenige Zentimeter übereinander. Ohne Rücksendeangabe
    // (eigener Briefbogen, abgeschaltete Option) bleibt der Block die einzige
    // Stelle, an der er überhaupt steht.
    if (!returnLine) this.drawSenderBlock(sender);

    if (returnLine) {
      const ruleY = PAGE_H - ADDRESS_FIELD.top - ADDRESS_FIELD.lineHeight;
      // Getaggt statt als Artefakt: seit sie den Absenderblock ersetzt, ist sie
      // die einzige Stelle, an der ein Screenreader den Absender erreicht.
      // Eigener Sect-Titel, damit „Absender“ weiterhin genau den Block meint.
      this.tagger.open('Sect', { title: 'Rücksendeangabe' });
      this.writeLineAt(
        'P',
        returnLine,
        ADDRESS_TEXT_LEFT,
        ruleY + 3,
        7,
        this.fonts.body,
        MUTED_COLOR,
        { maxWidth: ADDRESS_TEXT_WIDTH }
      );
      this.tagger.close();
      this.tagger.artifact(page, () => {
        page.drawLine({
          start: { x: ADDRESS_TEXT_LEFT, y: ruleY },
          end: { x: ADDRESS_TEXT_LEFT + ADDRESS_TEXT_WIDTH, y: ruleY },
          thickness: 0.5,
          color: MUTED_COLOR,
        });
      });
    }

    // Anschriftzone: 6 Zeilen, keine Leerzeile dazwischen, linksbündig auf der
    // Fluchtlinie — so liest die Sortieranlage der Post die Adresse.
    this.tagger.open('Sect', { title: 'Empfänger' });
    let addrY = PAGE_H - ADDRESS_ZONE_TOP - ADDRESS_FIELD.lineHeight * 0.72;
    for (const line of (letter.recipient ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 6)) {
      // The DIN 5008 address window is narrow — an overlong line must be cut,
      // not printed across the page.
      this.writeLineAt('P', line, ADDRESS_TEXT_LEFT, addrY, 10.5, this.fonts.body, BODY_COLOR, {
        maxWidth: ADDRESS_TEXT_WIDTH,
      });
      addrY -= ADDRESS_FIELD.lineHeight;
    }
    this.tagger.close();

    const dateLine = letter.place
      ? `${letter.place}, ${formatDate(this.opts.locale)}`
      : formatDate(this.opts.locale);
    // Bounded to the Informationsblock, not to half the page: a long place name
    // would otherwise push the right-aligned line left into the envelope window.
    // And measure what is actually DRAWN — labels go through the font-run split,
    // so the raw-text width can differ (stand-in glyphs, emoji font).
    const infoWidth = PAGE_W - MARGIN_R - INFO_BLOCK_LEFT;
    const [dateRuns] = this.boundedLines(dateLine, this.fonts.body, 10, infoWidth, 1);
    const dateWidth = measureRuns(dateRuns ?? [], 10);
    const dateY = PAGE_H - ADDRESS_FIELD.top - ADDRESS_FIELD.height + 3;
    this.tagger.tag('P', () =>
      this.tagger.content(page, () =>
        drawRuns(page, dateRuns ?? [], PAGE_W - MARGIN_R - dateWidth, dateY, 10, BODY_COLOR)
      )
    );

    this.y = PAGE_H - SUBJECT_TOP;

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

    // Was im Kopf steht — Betreff beim Brief, Titel sonst — und deshalb nicht
    // gleich darunter noch einmal stehen darf.
    const headline =
      this.spec.kind === 'letter' ? this.spec.letter?.subject || this.spec.title : this.spec.title;
    this.renderBlocks(dropRepeatedHeadline(this.spec.blocks, headline));

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
      missingGlyphs: [...this.fonts.missing],
      droppedGlyphCount: this.fonts.droppedCount.value,
    };
  }
}

/**
 * Den hochgeladenen Briefbogen einbetten.
 *
 * Ein zweiseitiges PDF wird als Briefbogen/Folgebogen gelesen — Seite 1 auf die
 * erste, Seite 2 auf alle weiteren Seiten. Das ist die übliche Aufteilung und
 * spart eine zweite Einstellung.
 *
 * Fehler sind hier nie fatal: ein unlesbarer Briefbogen darf den Brief nicht
 * verhindern, er fällt auf das CI-Layout zurück.
 */
async function embedStationery(
  doc: PDFDocument,
  input: RenderPdfOptions['stationery']
): Promise<Stationery | null> {
  if (!input) return null;
  try {
    if (input.type === 'pdf') {
      const source = await PDFDocument.load(input.bytes);
      const count = source.getPageCount();
      if (!count) return null;
      const pages = await doc.embedPdf(source, count > 1 ? [0, 1] : [0]);
      const first = pages[0];
      if (!first) return null;
      return { kind: 'page', first, rest: pages[1] ?? first };
    }
    const image =
      input.type === 'png' ? await doc.embedPng(input.bytes) : await doc.embedJpg(input.bytes);
    return { kind: 'image', image };
  } catch (err) {
    log.warn(
      `[pdfRenderer] Briefbogen konnte nicht eingebettet werden, CI-Layout greift: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return null;
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

  // Ligatures off: fontkit would substitute "ff" with a single ligature glyph
  // that pdf-lib maps neither to a correct width nor back to Unicode — the
  // document then fails PDF/UA 7.21.5 and 7.21.7 on words like
  // "Öffentlichkeitsarbeit", and the text no longer extracts cleanly.
  const embed = (bytes: Buffer) => doc.embedFont(bytes, { features: { liga: false } });

  const body = await embed(bodyBytes);
  const heading = await embed(headingBytes);
  const bodyBold = await embed(boldBytes);
  const emoji = emojiBytes ? await embed(emojiBytes) : body;

  // Coverage is read from the font programs themselves; results are memoised
  // because every character of the document passes through this check.
  const coverage = new Map<PDFFont, { probe: FontkitFont; cache: Map<number, boolean> }>();
  const register = (font: PDFFont, bytes: Buffer) => {
    if (!coverage.has(font)) {
      coverage.set(font, { probe: fontkit.create(bytes) as FontkitFont, cache: new Map() });
    }
  };
  register(body, bodyBytes);
  register(heading, headingBytes);
  register(bodyBold, boldBytes);
  if (emojiBytes) register(emoji, emojiBytes);

  const fonts: RendererFonts = {
    heading,
    body,
    bodyBold,
    emoji,
    supports: (font, codePoint) => {
      const entry = coverage.get(font);
      if (!entry) return true;
      const cached = entry.cache.get(codePoint);
      if (cached !== undefined) return cached;
      let has = false;
      try {
        has = entry.probe.hasGlyphForCodePoint(codePoint);
      } catch {
        has = false;
      }
      entry.cache.set(codePoint, has);
      return has;
    },
    missing: new Set<string>(),
    droppedCount: { value: 0 },
  };
  const logo = await doc.embedPng(logoBytes);
  const stationery = await embedStationery(doc, opts.stationery ?? null);

  return new PdfRenderer(doc, fonts, theme, logo, spec, opts, stationery).render();
}
