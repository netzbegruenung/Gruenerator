/**
 * Blockzerlegung vor dem Split.
 *
 * Zerlegt einen Text zeilenweise in `text`- und `table`-Blöcke und führt dabei
 * einen Überschriftenstapel mit. Das ist die einzige Struktur-Erkennung des
 * aktiven Chunker-Pfads; `DocumentStructureDetector` speist ausschließlich
 * `hierarchicalChunkDocument`, und das läuft nur im toten catch-Zweig.
 *
 * Die Eingabe MUSS mit `cleanTextForEmbedding(text, true)` vorbereitet sein.
 * Mit der Vorgabe `preserveStructure=false` ersetzt diese Funktion jedes
 * `\s{2,}` durch ein Leerzeichen (`services/text/cleaning.ts:74-76`) — danach
 * hat das Dokument keine Zeilen mehr, und hier ist nichts mehr zu erkennen.
 *
 * Eine Überschriftenzeile erzeugt KEINEN eigenen Block: sie wandert als erste
 * Zeile in den Block, der auf sie folgt. Sonst verlöre `chunk_text` die
 * Überschriftentexte — und damit den lexikalischen Treffer, den BM25 daraus
 * zieht.
 *
 * Ausnahme: eine Überschrift am Dokumentende, der kein Inhalt mehr folgt. Sie
 * hängt sich als letzte Zeile an den vorigen text-Block (dessen `headingPath`
 * unverändert bleibt) — oder bildet, wenn der vorige Block eine Tabelle ist
 * oder es gar keinen vorigen Block gibt, ausnahmsweise doch einen eigenen
 * text-Block.
 */

export type BlockKind = 'text' | 'table';

export interface DocumentBlock {
  kind: BlockKind;
  /** Der Blocktext samt der Überschriftenzeilen, die ihn einleiten. */
  text: string;
  /** Der Pfad, der über diesem Block gilt; leer oberhalb der ersten Überschrift. */
  headingPath: string[];
  /** Laufende Nummer des Abschnitts im Dokument; 0 vor der ersten Überschrift. */
  sectionIndex: number;
}

/** `# …` bis `###### …`, höchstens drei führende Leerzeichen (CommonMark). */
const MARKDOWN_HEADING = /^ {0,3}(#{1,6})[ \t]+(\S.*?)[ \t]*$/;

/** `3`, `3.1`, `3.1.1` — optional mit Punkt oder Doppelpunkt, dann ein Großbuchstabe. */
const NUMBERED_HEADING = /^ {0,3}((?:\d+\.){0,3}\d+)[.:]?[ \t]+(\p{Lu}\S.*?)[ \t]*$/u;

/** Eine Zeile, die mit `|` beginnt und endet. */
const TABLE_ROW = /^\s*\|.*\|\s*$/;

/**
 * Obergrenze für eine Überschrift. Ohne sie liest der nummerierte Zweig jeden
 * Aufzählungssatz als Abschnittsanfang und zerschneidet Fließtext, der heute
 * unauffällig durchläuft.
 */
const MAX_HEADING_CHARS = 120;

/**
 * Erkennt eine Überschriftenzeile. `level` ist die Tiefe im Stapel (1 = oberste),
 * `title` der Text, wie er in `heading_path` landet.
 */
export function parseHeading(line: string): { level: number; title: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > MAX_HEADING_CHARS) return null;
  if (TABLE_ROW.test(line)) return null;

  const markdown = MARKDOWN_HEADING.exec(line);
  if (markdown) {
    // Abschliessende Rauten sind Dekoration (`## Titel ##`).
    const title = markdown[2].replace(/[ \t]*#+[ \t]*$/, '').trim();
    return title ? { level: markdown[1].length, title } : null;
  }

  const numbered = NUMBERED_HEADING.exec(line);
  if (!numbered) return null;
  // Ein Satz ist keine Überschrift: „3. Wir wollen die Wärmewende gestalten."
  if (/[.;:,]$/.test(trimmed)) return null;
  if (/\.\s/.test(numbered[2])) return null;
  return { level: numbered[1].split('.').length, title: trimmed };
}

/** Eine Tabelle braucht mindestens zwei aufeinanderfolgende Pipe-Zeilen. */
function isTableStart(lines: string[], i: number): boolean {
  return TABLE_ROW.test(lines[i]) && TABLE_ROW.test(lines[i + 1] ?? '');
}

export function segmentBlocks(text: string): DocumentBlock[] {
  const lines = (text ?? '').split('\n');
  const blocks: DocumentBlock[] = [];
  const stack: string[] = [];
  let sectionIndex = 0;

  /** Überschriftenzeilen, die auf den nächsten Block warten. */
  let carry: string[] = [];
  /** Zeilen des laufenden text-Blocks. */
  let pending: string[] = [];
  let pendingPath: string[] = [];
  let pendingSection = 0;
  /**
   * Leerzeilen zwischen einer Überschrift und dem nächsten Inhalt. Werden erst
   * committet, wenn feststeht, WELCHER Block sie bekommt — sonst reißt eine
   * Leerzeile den Überschriften-Carry vorzeitig in einen eigenen, inhaltslosen
   * text-Block, noch bevor die eigentliche Tabelle oder der Absatz drankommt.
   */
  let blankBuffer: string[] = [];

  const push = (kind: BlockKind, body: string, path: string[], section: number): void => {
    const trimmed = body.trim();
    if (!trimmed) return;
    blocks.push({ kind, text: trimmed, headingPath: path, sectionIndex: section });
  };

  const flushText = (): void => {
    if (pending.length === 0) return;
    push('text', pending.join('\n'), pendingPath, pendingSection);
    pending = [];
  };

  const openText = (): void => {
    if (pending.length > 0) return;
    pendingPath = [...stack];
    pendingSection = sectionIndex;
    pending.push(...carry);
    carry = [];
  };

  let i = 0;
  while (i < lines.length) {
    const heading = parseHeading(lines[i]);
    if (heading) {
      flushText();
      blankBuffer = [];
      // NIE wachsen: eine Ebene überspringende Überschrift (z. B. `# H1` direkt
      // gefolgt von `### H3`) darf keine Lücke (`undefined`) in den Stapel
      // reissen. `Math.min` kürzt nur, `stack.push` unten hängt die neue
      // Überschrift direkt an — `headingPath` wird dadurch `['H1', 'H3']`,
      // nicht `['H1', undefined, 'H3']`.
      stack.length = Math.min(stack.length, heading.level - 1);
      // Eine Geschwister- oder Vorfahren-Überschrift ersetzt die alte(n) Zeile(n)
      // auf derselben oder einer höheren Ebene im Carry — sonst reitet die
      // längst überholte Zeile mit in den nächsten Block. Eine tiefere
      // Überschrift unter einem noch nicht verbrauchten Elternteil behält
      // dessen Zeile, exakt wie `headingPath` den Elternteil auch behält.
      carry.length = Math.min(carry.length, stack.length);
      stack.push(heading.title);
      sectionIndex += 1;
      carry.push(lines[i].trim());
      i += 1;
      continue;
    }

    if (isTableStart(lines, i)) {
      flushText();
      blankBuffer = [];
      const rows: string[] = [];
      while (i < lines.length && TABLE_ROW.test(lines[i])) {
        rows.push(lines[i].trim());
        i += 1;
      }
      push('table', [...carry, ...rows].join('\n'), [...stack], sectionIndex);
      carry = [];
      continue;
    }

    if (!lines[i].trim() && pending.length === 0) {
      // Vor dem ersten Inhalt eines Blocks: zwischenspeichern statt committen.
      blankBuffer.push(lines[i]);
      i += 1;
      continue;
    }

    openText();
    pending.push(...blankBuffer, lines[i]);
    blankBuffer = [];
    i += 1;
  }

  // Eine Überschrift ohne folgenden Inhalt (Dokumentende) bekommt keinen
  // eigenen, inhaltslosen Block — sie hängt sich als letzte Zeile an den
  // vorigen Block, dessen `headingPath` unverändert bleibt. Das gilt NUR,
  // wenn der vorige Block ein text-Block ist: an eine Tabelle angehängt wäre
  // die letzte Zeile keine Pipe-Zeile mehr, und `splitTableBlock` bekäme eine
  // kaputte Tabelle. Ist der vorige Block eine Tabelle, oder gibt es gar
  // keinen vorigen Block, bleibt es bei der Ausnahme: ein einzelner
  // text-Block, der nur aus der Überschrift besteht.
  const last = blocks.length > 0 ? blocks[blocks.length - 1] : undefined;
  if (pending.length === 0 && carry.length > 0 && last?.kind === 'text') {
    last.text = [last.text, ...carry].join('\n');
  } else {
    openText();
    flushText();
  }
  return blocks;
}

/**
 * Deckel für einen Tabellen-Chunk. Dieselbe Zahl wie `mergeSmallChunks`'
 * `maxMergedChars` (`langchainIntegration.ts:100`), damit eine Tabelle nicht
 * größer wird als das, was der Fließtext-Pfad zusammenfassen darf.
 */
export const TABLE_CHUNK_MAX_CHARS = 2400;

/** Eine Markdown-Trennzeile: `| --- | :---: |`. */
const TABLE_SEPARATOR = /^\s*\|[\s:|-]+\|\s*$/;

/**
 * Teilt einen Tabellenblock zeilenweise, mit Kopf über jedem Teil.
 *
 * Der Kopf sind alle Zeilen bis einschliesslich der Trennzeile — also auch die
 * Überschriftenzeilen, die der Block trägt. Ohne diese Wiederholung ist jedes
 * Teilstück ab dem zweiten eine Zahlenkolonne ohne Spaltennamen.
 *
 * Fehlt die Trennzeile (der Block hat KEINEN Header — `segmentBlocks` verlangt
 * ja nur zwei aufeinanderfolgende Pipe-Zeilen, keine Trennzeile), gibt es
 * nichts zu wiederholen: jede Zeile ist eine Datenzeile, jedes Teilstück eine
 * reine Zeilengruppe ohne Kopf.
 *
 * Eine EINZELNE Zeile über `maxChars` bleibt ganz und reißt den Deckel: eine
 * halbe Tabellenzeile ist wertlos, und die Anbietergrenze liegt bei 20480
 * Zeichen je Text (MistralEmbeddingClient), also weit darüber.
 */
export function splitTableBlock(text: string, maxChars: number = TABLE_CHUNK_MAX_CHARS): string[] {
  if (text.length <= maxChars) return [text];

  const lines = text.split('\n');
  const separatorAt = lines.findIndex((line) => TABLE_SEPARATOR.test(line));
  const header = separatorAt >= 0 ? lines.slice(0, separatorAt + 1) : [];
  const body = separatorAt >= 0 ? lines.slice(separatorAt + 1) : lines;

  const assemble = (rows: string[]): string => [...header, ...rows].join('\n');

  const parts: string[] = [];
  let buffer: string[] = [];

  for (const row of body) {
    const candidate = assemble([...buffer, row]);
    if (buffer.length > 0 && candidate.length > maxChars) {
      parts.push(assemble(buffer));
      buffer = [row];
    } else {
      buffer.push(row);
    }
  }
  if (buffer.length > 0) parts.push(assemble(buffer));

  return parts.length > 0 ? parts : [text];
}
