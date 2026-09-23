/**
 * Inline-Auszeichnung in Sharepic-Texten — geteilt, DOM-frei, Client + Server.
 *
 * Ein Sharepic-Textfeld ist ein flacher String (siehe `listLayout.ts`). Fett,
 * Kursiv und Unterstrichen stehen darin als Markdown-lite: `**fett**`,
 * `_kursiv_`, `<u>unterstrichen</u>`. Das ist die Form, die Nutzer*innen
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
}

export interface InlineRun extends RunStyle {
  text: string;
}

export const PLAIN_STYLE: RunStyle = { bold: false, italic: false, underline: false };

type MarkKind = 'bold' | 'italic' | 'underline';

interface DelimToken {
  type: 'delim';
  kind: MarkKind;
  raw: string;
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
    next: string | undefined
  ) => {
    flush();
    // Ein `_` mitten im Wort (`snake_case`) darf nicht ÖFFNEN, sonst würde
    // jeder Bezeichner kursiv. Beim SCHLIESSEN gilt die Einschränkung nicht:
    // `_grün_er` — ein kursiver Wortanfang — hat rechts vom schließenden
    // Marker ein Wortzeichen, und mit der Bedingung auch dort ließ sich
    // genau das nicht mehr lesen, was `serializeInlineMarks` selbst schreibt.
    // Ohne einen offenen Marker auf dem Stapel paart `resolve` ohnehin nicht,
    // `snake_case_name` bleibt also unberührt.
    const wordBound = raw.startsWith('_');
    tokens.push({
      type: 'delim',
      kind,
      raw,
      canOpen: !isSpace(next) && !(wordBound && isWordChar(prev)),
      canClose: !isSpace(prev),
      partner: -1,
      opens: false,
    });
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
    if (
      last &&
      last.bold === style.bold &&
      last.italic === style.italic &&
      last.underline === style.underline
    ) {
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
    }
  }
  return runs;
}

/** Trägt eine Zeile mindestens einen aufgelösten Marker? */
export function hasInlineMarks(text: string): boolean {
  return text
    .split('\n')
    .some((line) => parseInlineMarks(line).some((run) => run.bold || run.italic || run.underline));
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

const MARK_ORDER: MarkKind[] = ['bold', 'italic', 'underline'];
const DELIMS: Record<MarkKind, [string, string]> = {
  bold: ['**', '**'],
  italic: ['_', '_'],
  underline: ['<u>', '</u>'],
};

/**
 * Umschließt `inner` mit dem Marker — Leerraum an den Rändern bleibt draußen,
 * sonst stünde der schließende Marker hinter einem Leerzeichen und wäre beim
 * nächsten Lesen keiner mehr.
 */
function wrap(kind: MarkKind, inner: string): string {
  const lead = inner.length - inner.trimStart().length;
  const trail = inner.length - inner.trimEnd().length;
  const core = inner.trim();
  if (core === '') return inner;
  const [open, close] = DELIMS[kind];
  return `${inner.slice(0, lead)}${open}${core}${close}${inner.slice(inner.length - trail)}`;
}

function serialize(runs: InlineRun[], marks: MarkKind[]): string {
  if (runs.length === 0) return '';
  const [mark, ...rest] = marks;
  if (mark === undefined) return runs.map((run) => run.text).join('');

  // Gleich ausgezeichnete Nachbarn teilen sich ein Markerpaar:
  // `**a _b_**` statt `**a **_**b**_`.
  let out = '';
  let group: InlineRun[] = [];
  let groupOn: boolean | null = null;
  const flush = () => {
    if (group.length === 0) return;
    const inner = serialize(group, rest);
    out += groupOn ? wrap(mark, inner) : inner;
    group = [];
  };
  for (const run of runs) {
    if (groupOn !== null && run[mark] !== groupOn) flush();
    groupOn = run[mark];
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
