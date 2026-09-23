/**
 * Zeichen-Offsets eines fertigen Chunks im ROHEN Ausgangstext (#3223).
 *
 * WARUM NACHTRÄGLICH SUCHEN STATT DURCHREICHEN. `sentenceRepack` rechnet
 * `start`/`end` längst aus — aber gegen `chunks.map(c => c.text).join(' ')`,
 * und diese Chunks kommen aus `ParagraphChunker.fallbackSplit`, das die
 * Überlappung DUPLIZIERT (`chunks[i-1].slice(-approxChars) + '\n\n' +
 * chunks[i]`). Die Verkettung ist also länger als die Quelle und enthält
 * Wiederholungen; auf dem Struktur-Pfad läuft `sentenceRepack` zusätzlich je
 * Block und fängt jedes Mal bei 0 an. Diese Zahlen zeigen auf nichts. Sie zu
 * speichern wäre schlimmer als sie wegzuwerfen, weil eine Sprungmarke ihnen
 * glauben würde.
 *
 * Offsets stattdessen durch die Kette zu retten hieße
 * `cleanTextForEmbedding`, `splitTextByPageMarkers` (liefert `.trim()`-te
 * Abschnitte) und den überlappenden Splitter allesamt offset-treu zu machen —
 * das verschiebt Chunk-Grenzen und ist damit eine Retrieval-Änderung mit
 * Re-Index-Entscheidung. Hier wird der Chunk deshalb IM NACHHINEIN im Rohtext
 * wiedergefunden. Der Chunk-Text bleibt byteweise unangetastet;
 * `chunkingGolden.vitest.ts` ist der Beleg.
 *
 * WARUM DIE NORMALFORM GAR KEINEN LEERRAUM HAT. Zwischen Rohtext und
 * Chunk-Text wird Leerraum an mindestens fünf Stellen umgeschrieben: der
 * Reiniger zieht `\s{2,}` zusammen, `fallbackSplit` und `mergeSmallChunks`
 * fügen `\n\n` wieder ein, `sentenceRepack` verbindet Sätze mit einem
 * Leerzeichen, Seitenabschnitte werden ge`trim`t. Jede Regel, die Leerraum
 * NUR zusammenzieht, bleibt dabei angreifbar: der OCR-Zusammenzieht des
 * Reinigers (`([a-zäöüß])\s{2,}([a-zäöüß])`) läuft VOR dem Entfernen der
 * Markdown-Bilder, das anschließend neue Doppel-Leerzeichen erzeugt — dieselbe
 * Regel auf beide Seiten angewandt liefert dann verschiedene Wörter.
 * Leerraum ersatzlos zu streichen macht die Normalform idempotent und immun
 * gegen alle fünf Umschreibungen zugleich. Die Rückabbildung zeigt weiterhin
 * auf echte Rohindizes, und eine Sprungmarke soll ohnehin auf einem Zeichen
 * beginnen und enden, nicht auf einem Leerzeichen.
 *
 * Ein Chunk, der sich nicht wiederfinden lässt, bekommt `null` — nie geraten.
 * Das ist kein hypothetischer Fall: `splitTableBlock` wiederholt die
 * Kopfzeile in jedem Teilstück einer langen Tabelle, und diese Zusammensetzung
 * steht im Rohtext nirgends zusammenhängend.
 */

import { GERMAN_CHARS, SOFT_HYPHEN } from '../../text/constants.js';

const GERMAN_LETTER = new RegExp(`[${GERMAN_CHARS}]`);
const MARKDOWN_IMAGE = /^!\[[^\]]*\]\([^)]+\)/;
/** Trennstrich am Zeilenumbruch: `-`, optional Leerzeichen, Umbruch, Leerraum. */
const HYPHEN_AT_LINE_BREAK = /^-[ \t]*\n\s*/;

export interface OffsetMap {
  /** Normalform ohne jeden Leerraum — darin wird gesucht. */
  normalized: string;
  /** `toRaw[i]` ist der Rohindex von `normalized[i]`. */
  toRaw: number[];
}

export interface ChunkLocation {
  /** Index des ersten Zeichens im Rohtext, inklusiv. */
  start: number;
  /** Index hinter dem letzten Zeichen im Rohtext, exklusiv. */
  end: number;
  /** Suchposition für den nächsten Chunk. */
  cursor: number;
}

/**
 * Baut die Normalform eines Textes samt Rückabbildung auf die Rohindizes.
 *
 * Zeichenweise und nicht per `String.replace`, weil nur so für jedes
 * verbliebene Zeichen bekannt bleibt, woher es kam.
 */
export function buildOffsetMap(raw: string): OffsetMap {
  const out: string[] = [];
  const toRaw: number[] = [];

  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];

    // Leerraum, Null-Bytes und weiche Trennzeichen verschwinden spurlos.
    if (ch === '\0' || ch === SOFT_HYPHEN || /\s/.test(ch)) {
      i += 1;
      continue;
    }

    // `![alt](url)` wird ganz entfernt, nicht nur die Klammern — der Reiniger
    // tut dasselbe, der Chunk-Text enthält davon also nichts mehr.
    if (ch === '!' && raw[i + 1] === '[') {
      const image = MARKDOWN_IMAGE.exec(raw.slice(i));
      if (image) {
        i += image[0].length;
        continue;
      }
    }

    // Trennstrich am Zeilenumbruch: `Förde-\n rung` → `Förderung`. Nur zwischen
    // zwei Buchstaben und nur über einen echten Umbruch hinweg, genau wie
    // `cleaning.ts`. Ein Bindestrich mitten in der Zeile bleibt deshalb stehen —
    // auf beiden Seiten, also unschädlich.
    if (ch === '-' && GERMAN_LETTER.test(out[out.length - 1] ?? '')) {
      const joined = HYPHEN_AT_LINE_BREAK.exec(raw.slice(i));
      if (joined && GERMAN_LETTER.test(raw[i + joined[0].length] ?? '')) {
        i += joined[0].length;
        continue;
      }
    }

    out.push(ch);
    toRaw.push(i);
    i += 1;
  }

  return { normalized: out.join(''), toRaw };
}

/**
 * Die Normalform eines Chunk-Textes — dieselbe Rechnung, ohne Rückabbildung.
 */
export function normalizeForLookup(text: string): string {
  return buildOffsetMap(text).normalized;
}

/**
 * Sucht einen Chunk im Rohtext und liefert seine Grenzen.
 *
 * `cursor` läuft mit und macht die Suche monoton: erst dadurch findet ein
 * Chunk, dessen Text weiter oben schon einmal vorkommt — die duplizierte
 * Überlappung ist genau dieser Fall — das RICHTIGE Vorkommen statt des ersten.
 * Weitergezählt wird auf `Treffer + 1` und nicht hinter das Chunk-Ende, weil
 * aufeinanderfolgende Chunks sich planmäßig überlappen.
 */
export function locateChunk(map: OffsetMap, chunkText: string, cursor = 0): ChunkLocation | null {
  const needle = normalizeForLookup(chunkText);
  if (needle.length === 0) return null;

  const at = map.normalized.indexOf(needle, cursor);
  if (at === -1) return null;

  const start = map.toRaw[at];
  const lastIndex = map.toRaw[at + needle.length - 1];
  if (start === undefined || lastIndex === undefined) return null;

  return { start, end: lastIndex + 1, cursor: at + 1 };
}
