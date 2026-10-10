/**
 * Shared text utilities for canvas editor
 *
 * Umbruch, Aufzählungsmarker, hängender Einzug und Inline-Auszeichnung liegen
 * in `@gruenerator/contracts` (`text/listLayout.ts`, `text/inlineMarks.ts`) —
 * DOM-frei, damit die Vorschau hier und der Server-Renderer an derselben
 * Stelle umbrechen. Hier bleibt nur, was ein Canvas braucht: die Messung.
 */
import {
  layoutRichTextBlock,
  wrapLines,
  type MeasureRun,
  type RunStyle,
} from '@gruenerator/contracts';

import { notifyFontLoaded } from '../hooks/useFontGeneration';

import { primaryFontFamily } from './fontMarkSupport';

/**
 * Simple text wrapping using character width estimation
 * @deprecated Use wrapTextAccurate() for accurate font-aware wrapping
 */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  charWidthRatio = 0.5
): string[] {
  return wrapLines(text, maxWidth, (value) => value.length * fontSize * charWidthRatio);
}

let measureContext: CanvasRenderingContext2D | null = null;
let measureContextResolved = false;

// One shared context: word-wrap loops measure per word candidate, and a fresh
// <canvas> + 2D context per call made each keystroke allocate hundreds of them.
// Ohne DOM (Tests, SSR) gibt es kein Canvas zum Messen — dann auf die
// Schätzung zurückfallen statt zu werfen.
function getMeasureContext(): CanvasRenderingContext2D | null {
  if (!measureContextResolved) {
    measureContextResolved = true;
    measureContext =
      typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  }
  return measureContext;
}

const checkedFaces = new Set<string>();
const seenRawFaces = new Set<string>();

// Safari stößt über ein Canvas allein kein Laden an: eine Schrift, die noch
// kein DOM-Text braucht, träfe nie ein und `loadingdone` (→ `useFontGeneration`)
// bliebe aus — der mit der Ersatzschrift gemessene Umbruch stünde dann fest.
// Je Familie+Schnitt einmal geprüft (die Messung läuft pro Wort); ein
// fehlgeschlagenes Laden wird bewusst nicht wiederholt, sonst hämmerte jede
// Messung auf eine kaputte URL.
function requestFace(fontSize: number, fontFamily: string, style: string, text: string): void {
  if (typeof document === 'undefined' || !document.fonts) return;
  const rawKey = `${fontFamily}:${style}`;
  if (seenRawFaces.has(rawKey)) return;
  seenRawFaces.add(rawKey);
  const family = primaryFontFamily(fontFamily);
  const key = `${family}:${style}`;
  if (checkedFaces.has(key)) return;
  checkedFaces.add(key);
  try {
    const spec = `${style} ${fontSize}px "${family}"`;
    if (document.fonts.check(spec, text)) return;
    void document.fonts
      .load(spec, text)
      .then((faces) => {
        if (faces.length > 0) notifyFontLoaded();
      })
      .catch(() => undefined);
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.warn(
        `[textUtils] Font "${family}" (${style}) not loaded, measurements may use fallback. This warning appears once per font.`
      );
    }
  } catch {
    // Eine Messung darf nie an der Schriftanfrage scheitern.
  }
}

/**
 * Measure actual text width using Canvas 2D context
 * Uses browser's font rendering engine for accurate measurements
 *
 * @param text - The text to measure
 * @param fontSize - Font size in pixels
 * @param fontFamily - Font family name (e.g., 'GrueneTypeNeue', 'PT Sans')
 * @param fontStyle - CSS font style (e.g., 'normal', 'bold', 'italic', 'bold italic')
 */
export function measureTextWidthWithFont(
  text: string,
  fontSize: number,
  fontFamily: string,
  fontStyle: string = 'normal'
): number {
  const ctx = getMeasureContext();
  if (!ctx) {
    // Fallback to estimation if canvas unavailable
    return text.length * fontSize * 0.5;
  }

  // Build CSS font string (e.g., "bold italic 90px GrueneTypeNeue, Arial, sans-serif")
  ctx.font = `${fontStyle} ${fontSize}px ${fontFamily}, Arial, sans-serif`;
  requestFace(fontSize, fontFamily, fontStyle, text);

  return ctx.measureText(text).width;
}

/**
 * Konva-`fontStyle` für einen Lauf: Blockstil plus die Marks des Laufs.
 * Konva kennt genau die vier Werte `normal`, `bold`, `italic`, `bold italic`.
 *
 * **Kursiv schlägt fett.** Keine unserer Schriften hat einen Fett-Kursiv-
 * Schnitt, und die beiden Seiten lösen `bold italic` gegensätzlich auf:
 * der Browser nimmt den Kursivschnitt und fettet ihn synthetisch (gemessen:
 * `bold italic` ist exakt so breit wie `italic`), `@napi-rs/canvas` nimmt den
 * Fettschnitt und neigt ihn. Dieselbe Zeile wäre damit ~5 % verschieden breit
 * und bräche in Vorschau und Export an anderer Stelle um — genau das, was der
 * geteilte Umbruch verhindern soll. Also fragen beide Seiten nur `italic` an;
 * ein kursives Wort in einem fetten Block ist dann nicht fett, aber überall
 * gleich. Ausnahme Vollkorn, das einen echten Fett-Kursiv-Schnitt hat: siehe
 * `runFont`.
 */
export function fontStyleForRun(
  baseStyle: string,
  style: RunStyle
): 'normal' | 'bold' | 'italic' | 'bold italic' {
  if (style.italic || baseStyle.includes('italic')) return 'italic';
  return style.bold || baseStyle.includes('bold') ? 'bold' : 'normal';
}

/**
 * Wie ein `==Akzent==`-Lauf aussieht. Die Marke entscheidet das, nicht der
 * Text: AT setzt das Wort gelb in Vollkorn kursiv, DE nur in einer
 * anderen Farbe. Ohne `accent` am Text bleibt ein Akzentlauf unauffällig.
 */
export interface TextAccent {
  fill: string;
  fontFamily?: string;
  fontStyle?: 'normal' | 'bold' | 'italic' | 'bold italic';
}

/**
 * Wie ein `++Marker++`-Lauf aussieht: ein Kasten hinter dem Lauf, je
 * Zeilenstück einer, mit dunkler Schrift darin. Nur DE setzt ihn (die
 * Textmarker-Box der Posts); ohne `marker` am Text bleibt ein Markerlauf
 * unauffällig. Abstände in Vielfachen der Schriftgröße.
 */
export interface TextMarker {
  /** Farbe des Kastens. */
  fill: string;
  /** Schriftfarbe im Kasten — der Kasten steht oft auf dunklem Grund. */
  color: string;
  /** Innenabstand links/rechts; Vorgabe 0.18. */
  padX?: number;
  /** Innenabstand oben/unten; Vorgabe 0.04. */
  padY?: number;
}

/**
 * Familien, deren `bold italic` in `typography.css` ein echter Schnitt ist:
 * Vollkorn trägt dort Bold Italic als `italic` und Black Italic als
 * `bold italic`. Nur hier gilt „kursiv schlägt fett" nicht — der Browser
 * fettet nichts synthetisch, er lädt den Black-Schnitt. Den braucht die
 * österreichische Betonung (CI 2026, S. 22).
 */
const REAL_BOLD_ITALIC: ReadonlySet<string> = new Set(['Vollkorn']);

/**
 * Families whose bold cut `typography.css` declares as a family of its own:
 * `font-weight: bold` on Gotham Book would hit no face and be faked.
 */
const BOLD_FAMILY: Readonly<Record<string, string>> = { 'GothamNarrow-Book': 'GothamNarrow-Bold' };

/** Schrift und Schnitt eines Laufs — Messung und Zeichnung fragen beide hier. */
export function runFont(
  fontFamily: string,
  baseStyle: string,
  style: RunStyle,
  accent: TextAccent | null | undefined
): { fontFamily: string; fontStyle: 'normal' | 'bold' | 'italic' | 'bold italic' } {
  // Eine eigene Passagenfarbe färbt nur: die Akzentschrift der Vorlage gehört
  // zur Vorlagenfarbe. Sonst verschöbe ein eingefärbter Buchstabe den Umbruch.
  const asAccent = !!style.accent && !!accent && !style.accentColor;
  const family = asAccent ? (accent?.fontFamily ?? fontFamily) : fontFamily;
  const requested = asAccent ? (accent?.fontStyle ?? baseStyle) : baseStyle;
  const bold = !!style.bold || requested.includes('bold');
  const italic = !!style.italic || requested.includes('italic');
  if (bold && italic && REAL_BOLD_ITALIC.has(family)) {
    return { fontFamily: family, fontStyle: 'bold italic' };
  }
  const boldFamily = BOLD_FAMILY[family];
  if (bold && !italic && boldFamily) return { fontFamily: boldFamily, fontStyle: 'normal' };
  // Every other run: italic wins, so the browser and the server renderer pick
  // the same face (see `fontStyleForRun`).
  return { fontFamily: family, fontStyle: fontStyleForRun(requested, style) };
}

/**
 * Bindet eine konkrete Schrift an eine Messfunktion für `listLayout` — je
 * Lauf mit dessen Stil, denn ein fettes Wort ist breiter, und der Umbruch
 * muss das wissen. Vier mögliche Stile, darum ein kleiner Cache je
 * Kombination statt eines Canvas je Messung.
 *
 * `fontGeneration` ist der Stand von `document.fonts`, gegen den gemessen
 * wird (`useFontGeneration`). Er steht im Cache-Schlüssel, damit er ein
 * echter Eingang der Messung ist — nur so bleibt er im Memo des Aufrufers
 * eine Abhängigkeit, die der React-Compiler nicht wegkürzt.
 */
export function runMeasurer(
  fontSize: number,
  fontFamily: string,
  fontStyle: string = 'normal',
  fontGeneration = 0,
  accent: TextAccent | null = null
): MeasureRun {
  const cache = new Map<string, number>();
  return (text, style) => {
    const run = runFont(fontFamily, fontStyle, style, accent);
    const key = `${fontGeneration}:${run.fontFamily}:${run.fontStyle}:${text}`;
    let width = cache.get(key);
    if (width === undefined) {
      width = measureTextWidthWithFont(text, fontSize, run.fontFamily, run.fontStyle);
      cache.set(key, width);
    }
    return width;
  };
}

/**
 * Wrap text using accurate font measurement
 * This produces line breaks that match actual Konva text rendering
 *
 * Bricht auch an `\n`, rechnet den Einzug einer Aufzählung und die Breite
 * fetter Läufe mit — die Zeilenzahl ist genau das, was die Auto-Fit-Schleifen
 * der Vorlagen auswerten. Die Marker stehen in den gelieferten Zeilen wieder
 * vorn, Auszeichnungsmarker sind entfernt, damit Aufrufer, die die Strings
 * zeichnen statt sie zu zählen, sich nicht ändern müssen.
 */
export function wrapTextAccurate(
  text: string,
  maxWidth: number,
  fontSize: number,
  fontFamily: string,
  fontStyle: string = 'normal'
): string[] {
  return layoutRichTextBlock(text, maxWidth, runMeasurer(fontSize, fontFamily, fontStyle)).map(
    (line) => {
      const body = line.runs.map((run) => run.text).join('');
      return line.marker ? `${line.marker} ${body}` : body;
    }
  );
}
