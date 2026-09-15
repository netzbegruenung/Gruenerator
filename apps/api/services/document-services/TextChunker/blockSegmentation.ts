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

import { PROMPT_SOURCE_MAX_CHARS } from './chunkBudget.js';

export type BlockKind = 'text' | 'table';

export interface DocumentBlock {
  kind: BlockKind;
  /** Der Blocktext samt der Überschriftenzeilen, die ihn einleiten. */
  text: string;
  /** Der Pfad, der über diesem Block gilt; leer oberhalb der ersten Überschrift. */
  headingPath: string[];
  /**
   * Laufende Nummer des Abschnitts JE SEITE, nicht je Dokument: `chunkStructured`
   * ruft die Blockzerlegung einmal pro Seitenmarker auf, der Zähler beginnt also
   * auf jeder Seite wieder bei 0 (= vor der ersten Überschrift dieser Seite).
   */
  sectionIndex: number;
}

/** `# …` bis `###### …`, höchstens drei führende Leerzeichen (CommonMark). */
const MARKDOWN_HEADING = /^ {0,3}(#{1,6})[ \t]+(\S.*?)[ \t]*$/;

/**
 * `3.1`, `3.1.1`, `1.` — Nummer, optional Punkt oder Doppelpunkt, dann ein
 * Großbuchstabe. Die Nummer ist in drei Teilen gefangen, weil der Punkt hinter
 * einer einstelligen Nummer (`1.`) über Zulassen oder Ablehnen entscheidet.
 */
const NUMBERED_HEADING = /^ {0,3}((?:\d+\.){0,3}\d+)([.:]?)[ \t]+(\p{Lu}\S.*?)[ \t]*$/u;

/** Deutsche Monatsnamen: `5. Mai` ist ein Datum, keine Überschrift. */
const MONTH_START =
  /^(Januar|Februar|M\u00e4rz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\b/u;

/** Eine Zeile, die mit `|` beginnt und endet. */
const TABLE_ROW = /^\s*\|.*\|\s*$/;

/**
 * Obergrenze für eine Überschrift. Ohne sie liest der nummerierte Zweig jeden
 * Aufzählungssatz als Abschnittsanfang und zerschneidet Fließtext, der heute
 * unauffällig durchläuft.
 */
const MAX_HEADING_CHARS = 120;

/**
 * Engere Grenzen für den nummerierten Zweig. Er hat kein `#` als Beweis, also
 * trägt er die Beweislast selbst: eine nummerierte Überschrift ist kurz.
 */
const MAX_NUMBERED_HEADING_CHARS = 80;
const MAX_NUMBERED_HEADING_WORDS = 10;

/**
 * `1. …` ist die zweideutigste Form überhaupt: sie ist genauso oft ein
 * Aufzählungspunkt („1. Wir fordern mehr Radwege", „1. Die Landesregierung wird
 * aufgefordert") wie eine Abschnittsnummer („1. Einleitung"). Eine innere
 * Nummer (`3.1`) trägt die Beweislast selbst, eine blosse `1.` nicht — deshalb
 * gilt hier zusätzlich eine harte Wortgrenze. Der Preis ist bekannt und
 * gewollt: „1. Grundlagen der kommunalen Wärmeplanung" wird künftig übersehen,
 * also wie bisher als Fließtext behandelt. Eine übersehene Überschrift kostet
 * die Struktur EINES Abschnitts; eine erfundene zerschneidet ein ganzes
 * Dokument in Ein-Satz-Chunks.
 */
const MAX_ENUMERATOR_TITLE_WORDS = 3;

/**
 * Erkennt eine Überschriftenzeile. `level` ist die Tiefe im Stapel (1 = oberste),
 * `title` der Text, wie er in `heading_path` landet.
 *
 * Ein Seitenmarker (`## Seite 3`) sieht von hier aus wie eine Überschrift der
 * Ebene 2 und würde als solche im `heading_path` landen. Dass das nie passiert,
 * ist KEINE Leistung dieser Funktion, sondern hängt allein daran, dass
 * `splitTextByPageMarkers` (`pageMarkerProcessing.ts`) die Marker vor dem
 * Chunken herausschneidet — `smartChunkDocument` ruft die Blockzerlegung erst
 * je Seite auf. Wer diese Reihenfolge ändert, braucht hier einen Ausschluss.
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
  const [, number, punctuation, title] = numbered;

  // Ein Satz ist keine Überschrift: „3. Wir wollen die Wärmewende gestalten."
  if (/[.;:,]$/.test(trimmed)) return null;
  if (/\.\s/.test(title)) return null;

  const groups = number.split('.');

  // Eine blosse Zahl ist keine Nummerierung, sondern ein Satzanfang: „2 Personen
  // waren anwesend", „10 Prozent mehr Radwege bis 2030", „2026 Wahlprogramm".
  // Es braucht einen Punkt — innen (`3.1`) oder hinten (`1.`).
  if (groups.length === 1 && punctuation !== '.') return null;
  // „3.1.2024 Beschluss der Landesdelegiertenkonferenz" ist ein Datum.
  if (groups.length === 3 && /^\d{4}$/.test(groups[2])) return null;
  // „5. Mai" ist eins.
  if (MONTH_START.test(title)) return null;

  if (trimmed.length > MAX_NUMBERED_HEADING_CHARS) return null;
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length > MAX_NUMBERED_HEADING_WORDS) return null;
  if (groups.length === 1 && words.length > MAX_ENUMERATOR_TITLE_WORDS) return null;

  return { level: groups.length, title: trimmed };
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

  /**
   * Überschriftenzeilen, die auf den nächsten Block warten, je mit der Ebene,
   * auf der sie in den Stapel kamen. Die Ebene entscheidet beim Verdrängen —
   * nicht die Position im Array: `openText()` leert den Carry bei jedem
   * Blockwechsel, während `stack` die volle Vorfahrenkette behält, die beiden
   * laufen also nach einem Teil-Flush nicht mehr synchron.
   */
  let carry: Array<{ level: number; line: string }> = [];
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
    pending.push(...carry.map((entry) => entry.line));
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
      // Das läuft über die gespeicherte Ebene jeder Carry-Zeile, NICHT über
      // `stack.length`: nach einem Teil-Flush zeigt `stack.length` die volle
      // Vorfahrenkette, der Carry aber nur die seit dem Flush gesehenen
      // Überschriften — beide Längen sind dann nicht mehr dieselbe Position.
      carry = carry.filter((entry) => entry.level < heading.level);
      stack.push(heading.title);
      sectionIndex += 1;
      carry.push({ level: heading.level, line: lines[i].trim() });
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
      push(
        'table',
        [...carry.map((entry) => entry.line), ...rows].join('\n'),
        [...stack],
        sectionIndex
      );
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
    last.text = [last.text, ...carry.map((entry) => entry.line)].join('\n');
  } else {
    openText();
    flushText();
  }
  return blocks;
}

/**
 * Ab hier gilt ein Block als lang genug, um für sich zu stehen. Dieselbe Zahl
 * wie `mergeSmallChunks`' `minChars` (`paragraphSplitter.ts`), eine Ebene
 * höher angewandt: dort werden Chunks INNERHALB eines Blocks zusammengefasst,
 * hier die Blöcke selbst.
 */
const MERGE_BLOCKS_UNDER_CHARS = 800;

/**
 * Zwei benachbarte Textblöcke gehören zusammen, wenn sie denselben Pfad tragen
 * oder der zweite eine Ebene tiefer unter dem ersten hängt. Ein Geschwister-
 * abschnitt (`3.1` → `3.2`) und ein Sprung nach oben (`3.1.1` → `3.2`) tun das
 * nicht.
 */
function isSameSection(earlier: string[], later: string[]): boolean {
  if (earlier.length === later.length) return earlier.every((h, i) => later[i] === h);
  if (later.length === earlier.length + 1) return earlier.every((h, i) => later[i] === h);
  return false;
}

/**
 * Fasst kurze, benachbarte `text`-Blöcke desselben Abschnitts zusammen, BEVOR
 * jeder für sich durch den Chunker geht.
 *
 * Ohne diesen Schritt bekommt jeder Block seinen eigenen `chunkDocument` →
 * `mergeSmallChunks` → `sentenceRepack`-Lauf, und nichts fasst über eine
 * Blockgrenze hinweg zusammen: ein überschriftendichtes Dokument zerfällt in
 * einen Kleinstchunk je Abschnitt. Gemessen am 02.09.2026 an einer
 * Wahlprüfsteinsammlung (289 127 Zeichen, 65 Blöcke): 239 Chunks auf dem alten
 * Fließtext-Pfad gegen 264 auf dem Struktur-Pfad, davon 39 unter 800 Zeichen
 * statt 3, der kürzeste 44 statt 385 Zeichen.
 *
 * Der Preis steht im Kopf des zusammengefassten Blocks: er behält den
 * `headingPath` und den `sectionIndex` des ERSTEN Blocks, die Unterabschnitte
 * darin verlieren also ihren eigenen Pfad im Payload. Ihre Überschriftenzeilen
 * bleiben im Text und damit im lexikalischen Treffer. Eine Tabelle wird nie
 * zusammengefasst — sie ist ihre eigene Einheit.
 */
export function mergeSiblingTextBlocks(blocks: DocumentBlock[]): DocumentBlock[] {
  const out: DocumentBlock[] = [];

  for (const block of blocks) {
    const previous = out.at(-1);
    if (
      previous &&
      previous.kind === 'text' &&
      block.kind === 'text' &&
      previous.text.length < MERGE_BLOCKS_UNDER_CHARS &&
      isSameSection(previous.headingPath, block.headingPath)
    ) {
      previous.text = `${previous.text}\n\n${block.text}`;
      continue;
    }
    out.push({ ...block, headingPath: [...block.headingPath] });
  }

  return out;
}

/**
 * Deckel für einen Tabellen-Chunk: dieselbe Zahl wie `PROMPT_SOURCE_MAX_CHARS`,
 * das Fenster, das der Antwort-Prompt je Quelle durchlässt.
 *
 * Er lag bis zum 02.09.2026 bei 2400 und damit ÜBER diesem Fenster. Die Folge
 * war unsichtbar und teuer: `splitTableBlock` teilte sorgfältig entlang der
 * Zeilen, und `sourceTextForPrompt` schnitt die letzten 600 Zeichen davon
 * anschliessend mitten in einer Zeile wieder ab. Wer den Deckel wieder hebt,
 * hebt zuerst `PROMPT_SOURCE_MAX_CHARS`.
 */
export const TABLE_CHUNK_MAX_CHARS = PROMPT_SOURCE_MAX_CHARS;

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
