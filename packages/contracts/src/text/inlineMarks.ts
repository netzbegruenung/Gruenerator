/**
 * Inline-Auszeichnung in Sharepic-Texten — geteilt, DOM-frei, Client + Server.
 *
 * Ein Sharepic-Textfeld ist ein flacher String (siehe `listLayout.ts`). Fett,
 * Kursiv und Unterstrichen stehen darin als Markdown-lite: `**fett**`,
 * `_kursiv_`, `<u>unterstrichen</u>`, `==Akzent==`, `++Marker++`. Das ist die Form, die Nutzer*innen
 * kennen, die ein Modell ohnehin schreibt und die ohne Contract-Umbau in
 * jedes vorhandene Feld passt.
 *
 * Gelesen werden zusätzlich `__fett__` und `*kursiv*`, weil Modelle beides
 * schreiben; serialisiert wird nur die eine Form. Dieses Modul ist die
 * EINZIGE Stelle, die entscheidet, was ein Marker ist — Editor, Konva-Renderer,
 * Server-Renderer und KI-Sanitizer fragen alle hier.
 *
 * Der Parser ist ein linearer Scan ohne Regex (CodeQL meldete beim
 * Listen-Parser `js/polynomial-redos`; der Text hier kommt aus Nutzereingaben
 * und Modellausgaben). Ein Marker öffnet nur vor einem Nicht-Leerzeichen und
 * schließt nur hinter einem — `2 * 3 * 4` bleibt Text. Ungepaarte Marker
 * bleiben literal.
 */

export interface RunStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /**
   * Das hervorgehobene Wort einer Zeile in der Akzentfarbe (und, wo die Marke
   * es vorsieht, der Akzentschrift) — der Text trägt dafür `accentFill` usw.
   */
  accent: boolean;
  /**
   * Eine Textmarker-Box hinter dem Lauf (DE-Signatur) — der Text trägt dafür
   * einen `TextMarker`. `++` und nicht `=`/`-`/`~`: `+` leitet keine
   * Aufzählung ein, und `++` kommt in Prosa nur als `C++` vor, das nie
   * öffnet (kein Nicht-Leerzeichen dahinter) und nie paart.
   */
  marker: boolean;
  /**
   * Eigene Farbe der Passage (`=={#E6007E}Wort==`, `++{#FFFFFF}Wort++`) statt
   * der Farbe, die die Vorlage für Akzent bzw. Kasten vorsieht. Nur gesetzt,
   * solange `accent` bzw. `marker` gilt.
   */
  accentColor?: string;
  markerColor?: string;
}

export interface InlineRun extends RunStyle {
  text: string;
}

export const PLAIN_STYLE: RunStyle = {
  bold: false,
  italic: false,
  underline: false,
  accent: false,
  marker: false,
};

/** Gleicher Stil samt Passagenfarben — Läufe dürfen nur dann verschmelzen. */
export const sameRunStyle = (a: RunStyle, b: RunStyle): boolean =>
  a.bold === b.bold &&
  a.italic === b.italic &&
  a.underline === b.underline &&
  a.accent === b.accent &&
  a.marker === b.marker &&
  a.accentColor === b.accentColor &&
  a.markerColor === b.markerColor;

/** Nur die Stilfelder eines Laufs, ohne leere Farbfelder. */
export function runStyleOf(run: RunStyle): RunStyle {
  const style: RunStyle = {
    bold: run.bold,
    italic: run.italic,
    underline: run.underline,
    accent: run.accent,
    marker: run.marker,
  };
  if (run.accentColor) style.accentColor = run.accentColor;
  if (run.markerColor) style.markerColor = run.markerColor;
  return style;
}

type MarkKind = 'bold' | 'italic' | 'underline' | 'accent' | 'marker';
type ColorKind = 'accent' | 'marker';

const COLOR_FIELD = { accent: 'accentColor', marker: 'markerColor' } as const;

const isHexDigit = (char: string | undefined): boolean =>
  char !== undefined &&
  ((char >= '0' && char <= '9') || (char >= 'a' && char <= 'f') || (char >= 'A' && char <= 'F'));

/**
 * Liest einen Farbzusatz `{#RRGGBB}` an Stelle `at` — linear, ohne Regex.
 * Liefert die Farbe in Großbuchstaben, damit gleiche Farben gleich vergleichen.
 */
function readColorTag(line: string, at: number): string | null {
  if (line[at] !== '{' || line[at + 1] !== '#' || line[at + 8] !== '}') return null;
  for (let i = at + 2; i < at + 8; i++) if (!isHexDigit(line[i])) return null;
  return line.slice(at + 1, at + 8).toUpperCase();
}

const COLOR_TAG_LENGTH = 9;

interface DelimToken {
  type: 'delim';
  kind: MarkKind;
  raw: string;
  /** Farbzusatz eines öffnenden `==`/`++`; ein solcher Marker schließt nie. */
  color?: string;
  canOpen: boolean;
  canClose: boolean;
  /** Index des Partners nach der Auflösung; `-1` = literal. */
  partner: number;
  /** `true` = öffnender Marker eines aufgelösten Paars. */
  opens: boolean;
}

interface TextToken {
  type: 'text';
  value: string;
}

type Token = DelimToken | TextToken;

const isSpace = (char: string | undefined): boolean =>
  char === undefined || char === ' ' || char === '\t';

const isWordChar = (char: string | undefined): boolean =>
  char !== undefined && /[\p{L}\p{N}]/u.test(char);

/**
 * Darf ein `++` an Stelle `at` öffnen? Wie `_` nie direkt hinter einem
 * Wortzeichen — sonst verlöre `C++, Java und C++` seine Pluszeichen. Die EINE
 * Regel: Tokenizer, Normalizer und Zähler des Creators fragen alle hier.
 */
export const markerCanOpenAt = (text: string, at: number): boolean =>
  at === 0 || !isWordChar(text[at - 1]);

/**
 * Zerlegt eine Zeile in Text und Marker-Kandidaten. Ob ein Kandidat öffnen
 * oder schließen darf, hängt nur von seinen Nachbarzeichen ab; gepaart wird
 * erst in `resolve`.
 */
function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let text = '';
  const flush = () => {
    if (text !== '') tokens.push({ type: 'text', value: text });
    text = '';
  };
  const push = (
    kind: MarkKind,
    raw: string,
    prev: string | undefined,
    next: string | undefined,
    color: string | null = null
  ) => {
    flush();
    // Ein `_` (und `++`, siehe `markerCanOpenAt`) mitten im Wort (`snake_case`) darf nicht ÖFFNEN, sonst würde
    // jeder Bezeichner kursiv. Beim SCHLIESSEN gilt die Einschränkung nicht:
    // `_grün_er` — ein kursiver Wortanfang — hat rechts vom schließenden
    // Marker ein Wortzeichen, und mit der Bedingung auch dort ließ sich
    // genau das nicht mehr lesen, was `serializeInlineMarks` selbst schreibt.
    // Ohne einen offenen Marker auf dem Stapel paart `resolve` ohnehin nicht,
    // `snake_case_name` bleibt also unberührt.
    const wordBound = raw.startsWith('_') || kind === 'marker';
    tokens.push({
      type: 'delim',
      kind,
      raw,
      ...(color ? { color } : {}),
      canOpen: !isSpace(next) && !(wordBound && isWordChar(prev)),
      // Ein Farbzusatz gehört zum öffnenden Marker; als schließender ginge er verloren.
      canClose: !color && !isSpace(prev),
      partner: -1,
      opens: false,
    });
  };
  /** `==`/`++` an Stelle `i`, mit optionalem Farbzusatz dahinter; liefert die Länge. */
  const pushColorable = (kind: ColorKind, prev: string | undefined): number => {
    const tag = readColorTag(line, i + 2);
    // Ein Zusatz, hinter dem nichts öffnen kann, ist Text hinter einem gewöhnlichen `==`.
    const color = tag && !isSpace(line[i + 2 + COLOR_TAG_LENGTH]) ? tag : null;
    const length = 2 + (color ? COLOR_TAG_LENGTH : 0);
    // `raw` hält den Zusatz, wie er dastand: bleibt der Marker literal, bleibt er es auch.
    push(kind, line.slice(i, i + length), prev, line[i + length], color);
    return length;
  };

  let i = 0;
  while (i < line.length) {
    const ch = line[i]!;
    const prev = line[i - 1];
    if (ch === '*' || ch === '_') {
      if (line[i + 1] === ch) {
        push('bold', ch + ch, prev, line[i + 2]);
        i += 2;
        continue;
      }
      push('italic', ch, prev, line[i + 1]);
      i += 1;
      continue;
    }
    if (ch === '=' && line[i + 1] === '=') {
      i += pushColorable('accent', prev);
      continue;
    }
    if (ch === '+' && line[i + 1] === '+') {
      i += pushColorable('marker', prev);
      continue;
    }
    if (ch === '<') {
      const open = line.startsWith('<u>', i);
      const close = !open && line.startsWith('</u>', i);
      if (open || close) {
        const raw = open ? '<u>' : '</u>';
        flush();
        tokens.push({
          type: 'delim',
          kind: 'underline',
          raw,
          canOpen: open,
          canClose: close,
          partner: -1,
          opens: false,
        });
        i += raw.length;
        continue;
      }
    }
    text += ch;
    i += 1;
  }
  flush();
  return tokens;
}

/**
 * Paart Marker über einen Stapel. Ein schließender Marker sucht den nächsten
 * offenen derselben Art; alles, was darüber noch offen liegt, wird literal —
 * `**a _b** c` ergibt fettes „a _b" und ein literales `_`.
 */
function resolve(tokens: Token[]): void {
  const open: number[] = [];
  tokens.forEach((token, index) => {
    if (token.type !== 'delim') return;
    if (token.canClose) {
      let at = open.length - 1;
      while (at >= 0 && (tokens[open[at]!] as DelimToken).kind !== token.kind) at--;
      if (at >= 0) {
        const opener = tokens[open[at]!] as DelimToken;
        opener.partner = index;
        opener.opens = true;
        token.partner = open[at]!;
        open.length = at;
        return;
      }
    }
    if (token.canOpen) open.push(index);
  });
}

/** Zerlegt EINE Zeile in Läufe. Läufe mit gleichem Stil werden verschmolzen. */
export function parseInlineMarks(line: string): InlineRun[] {
  const tokens = tokenize(line);
  resolve(tokens);

  const style: RunStyle = { ...PLAIN_STYLE };
  const runs: InlineRun[] = [];
  const append = (value: string) => {
    if (value === '') return;
    const last = runs[runs.length - 1];
    if (last && sameRunStyle(last, style)) {
      last.text += value;
    } else {
      runs.push({ text: value, ...style });
    }
  };

  for (const token of tokens) {
    if (token.type === 'text') {
      append(token.value);
    } else if (token.partner < 0) {
      append(token.raw);
    } else {
      style[token.kind] = token.opens;
      if (token.kind === 'accent' || token.kind === 'marker') {
        const field = COLOR_FIELD[token.kind];
        if (token.opens && token.color) style[field] = token.color;
        else delete style[field];
      }
    }
  }
  return runs;
}

/** Trägt eine Zeile mindestens einen aufgelösten Marker? */
export function hasInlineMarks(text: string): boolean {
  return text
    .split('\n')
    .some((line) =>
      parseInlineMarks(line).some(
        (run) => run.bold || run.italic || run.underline || run.accent || run.marker
      )
    );
}

/** Nur der Text, ohne Marker — für Teilen, Kopieren, Alt-Texte. */
export function stripInlineMarks(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      parseInlineMarks(line)
        .map((run) => run.text)
        .join('')
    )
    .join('\n');
}

const MARK_ORDER: MarkKind[] = ['marker', 'accent', 'bold', 'italic', 'underline'];
const DELIMS: Record<MarkKind, [string, string]> = {
  bold: ['**', '**'],
  italic: ['_', '_'],
  underline: ['<u>', '</u>'],
  accent: ['==', '=='],
  marker: ['++', '++'],
};

/**
 * Umschließt `inner` mit dem Marker — Leerraum an den Rändern bleibt draußen,
 * sonst stünde der schließende Marker hinter einem Leerzeichen und wäre beim
 * nächsten Lesen keiner mehr.
 */
function wrap(kind: MarkKind, inner: string, color: string | null): string {
  const lead = inner.length - inner.trimStart().length;
  const trail = inner.length - inner.trimEnd().length;
  const core = inner.trim();
  if (core === '') return inner;
  const [open, close] = DELIMS[kind];
  const tag = color ? `{${color}}` : '';
  return `${inner.slice(0, lead)}${open}${tag}${core}${close}${inner.slice(inner.length - trail)}`;
}

const colorOf = (run: RunStyle, mark: MarkKind): string | null =>
  mark === 'accent' || mark === 'marker' ? (run[COLOR_FIELD[mark]] ?? null) : null;

function serialize(runs: InlineRun[], marks: MarkKind[]): string {
  if (runs.length === 0) return '';
  const [mark, ...rest] = marks;
  if (mark === undefined) return runs.map((run) => run.text).join('');

  // Gleich ausgezeichnete Nachbarn teilen sich ein Markerpaar:
  // `**a _b_**` statt `**a **_**b**_`. Verschieden gefärbte nicht.
  let out = '';
  let group: InlineRun[] = [];
  let groupOn: boolean | null = null;
  let groupColor: string | null = null;
  const flush = () => {
    if (group.length === 0) return;
    const inner = serialize(group, rest);
    out += groupOn ? wrap(mark, inner, groupColor) : inner;
    group = [];
  };
  for (const run of runs) {
    const color = run[mark] ? colorOf(run, mark) : null;
    if (groupOn !== null && (run[mark] !== groupOn || color !== groupColor)) flush();
    groupOn = run[mark];
    groupColor = color;
    group.push(run);
  }
  flush();
  return out;
}

/** Läufe → Markdown-lite, in der einen kanonischen Form. */
export function serializeInlineMarks(runs: InlineRun[]): string {
  return serialize(runs, MARK_ORDER);
}

/**
 * Bringt jede Zeile in die kanonische Form: `__x__` → `**x**`, `*x*` → `_x_`,
 * ungepaarte Marker bleiben, wie sie sind. Listenmarker am Zeilenanfang
 * (`* Punkt`) sind davon nicht betroffen — `*` vor einem Leerzeichen öffnet nie.
 */
export function normalizeInlineMarks(text: string): string {
  return text
    .split('\n')
    .map((line) => serializeInlineMarks(parseInlineMarks(line)))
    .join('\n');
}

/**
 * `++Marker++` als `==Akzent==` lesen — für die Orte, an denen der Marker
 * keine Box hat (AT setzt Hervorhebungen gelb in Vollkorn kursiv, nie als
 * Kasten). Texte ohne `++` bleiben Zeichen für Zeichen unberührt; nur ein Text
 * mit Marker läuft durch Parser und Serializer.
 */
export function foldMarkerIntoAccent(text: string): string {
  if (!text.includes('++')) return text;
  return text
    .split('\n')
    .map((line) =>
      serializeInlineMarks(
        // Eine Kastenfarbe taugt nicht als Schriftfarbe (weißer Kasten → weiße
        // Schrift auf weißem Grund): der gefaltete Lauf nimmt den Akzent der Marke.
        parseInlineMarks(line).map(({ markerColor: _boxColor, ...run }) => ({
          ...run,
          accent: run.accent || run.marker,
          marker: false,
        }))
      )
    )
    .join('\n');
}
