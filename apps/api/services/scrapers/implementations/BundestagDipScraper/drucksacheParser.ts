/**
 * Abschnitte aus dem Volltext einer Drucksache (DIP `drucksache-text`).
 *
 * Port von `drucksacheParser.js` aus Bundestag Wrapped, der den importierten
 * Bestand erzeugt hat. Ein Unterschied: lange Abschnitte werden hier NICHT bei
 * 4000 Zeichen geteilt — das macht danach `smartChunkDocument` mit der im
 * Grünerator üblichen Größe, damit ein Abschnitt nicht im Antwort-Prompt
 * (`PROMPT_SOURCE_MAX_CHARS`) abgeschnitten wird.
 */

export interface ParsedSection {
  sectionType: string;
  title: string;
  text: string;
}

const P = {
  // Gesetzentwürfe überschreiben den Abschnitt meist „A. Problem und Ziel".
  problem: /^A\.\s*Problem(?:\s+und\s+Ziel)?\s*$/i,
  loesung: /^B\.\s*Lösung\s*$/i,
  alternativen: /^C\.\s*Alternativen?\s*$/i,
  haushalt: /^D\.\s*Haushaltsausgaben/i,
  erfuellung: /^E\.\s*Erfüllungsaufwand/i,
  kosten: /^F\.\s*Weitere Kosten/i,
  artikel: /^Artikel\s+(\d+)\s*(?:\(([^)]+)\))?\s*$/i,
  begruendungStart: /^Begründung\s*$/i,
  allgemeinerTeil: /^A\.\s*Allgemeiner Teil/i,
  besondererTeil: /^B\.\s*Besonderer Teil/i,
  zuArtikel: /^Zu\s+Artikel\s+(\d+)/i,
  romanNumeral: /^([IVX]+)\.\s+(.+)/,
  frageTitel: /^Wir fragen die Bundesregierung:?\s*$/i,
  beschlussAntrag:
    /^Der (?:Bundestag|Bundesrat) (?:möge beschließen|wolle beschließen|beschließt|fordert)/i,
  headerLine: /^(?:Deutscher Bundestag|Bundesrat)\s+Drucksache\s+\d+\/\d+/,
  documentType:
    /^(Gesetzentwurf|Kleine Anfrage|Große Anfrage|Antrag|Beschlussempfehlung|Unterrichtung|Entschließungsantrag|Änderungsantrag|Bericht|Schriftliche Frage)\s*$/i,
};

export function parseDrucksache(text: string, drucksachetyp: string): ParsedSection[] {
  switch (drucksachetyp) {
    case 'Gesetzentwurf':
      return parseGesetzentwurf(text);
    case 'Kleine Anfrage':
    case 'Große Anfrage':
      return parseAnfrage(text);
    case 'Antrag':
    case 'Entschließungsantrag':
      return parseAntrag(text);
    case 'Beschlussempfehlung und Bericht':
    case 'Beschlussempfehlung':
    case 'Bericht':
      return parseBericht(text);
    default:
      return parseGeneric(text);
  }
}

/**
 * Text eines Abschnitts. Die Zeilenumbrüche bleiben stehen: der Chunker arbeitet
 * zeilenweise und erkennt nur so die `#`-Zeilen, die `parseGesetzentwurf` aus
 * Gliederungsüberschriften macht (CLAUDE.md, #3163).
 */
function joinLines(lines: string[]): string {
  return lines.join('\n').trim();
}

function isBoilerplate(line: string): boolean {
  return (
    /^Gesamtherstellung:/i.test(line) ||
    /^Vertrieb:/i.test(line) ||
    /^ISSN\s+[\d-]+/i.test(line) ||
    /^www\./i.test(line) ||
    /^Telefon\s*\(/i.test(line) ||
    /^Drucksache\s+\d+\/\d+\s*-?\s*\d*\s*-?\s*$/i.test(line) ||
    /^\d+\.\s*Wahlperiode\s+[\d.]+$/i.test(line)
  );
}

function isHeaderLine(line: string): boolean {
  return P.headerLine.test(line) || /^\d+\.\s*Wahlperiode/i.test(line);
}

function lines(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isBoilerplate(l));
}

/** Sammelt Zeilen unter der jeweils aktuellen Überschrift. */
class SectionCollector {
  readonly sections: ParsedSection[] = [];
  #current: { sectionType: string; title: string } | null = null;
  #buffer: string[] = [];

  constructor(
    private readonly defaultType: string,
    private readonly minChars = 50
  ) {}

  start(sectionType: string, title: string): void {
    this.flush();
    this.#current = { sectionType, title };
  }

  push(line: string): void {
    this.#buffer.push(line);
  }

  flush(fallbackType = this.defaultType): void {
    const text = joinLines(this.#buffer);
    if (text.length >= this.minChars) {
      this.sections.push({
        sectionType: this.#current?.sectionType ?? fallbackType,
        title: this.#current?.title ?? 'Abschnitt',
        text,
      });
    }
    this.#buffer = [];
  }
}

function parseGesetzentwurf(text: string): ParsedSection[] {
  const c = new SectionCollector('overview');
  let inBegruendung = false;
  const overview: Array<[RegExp, string, string]> = [
    [P.problem, 'problem', 'A. Problem'],
    [P.loesung, 'loesung', 'B. Lösung'],
    [P.alternativen, 'alternativen', 'C. Alternativen'],
    [P.haushalt, 'haushalt', 'D. Haushaltsausgaben'],
    [P.erfuellung, 'erfuellung', 'E. Erfüllungsaufwand'],
    [P.kosten, 'kosten', 'F. Weitere Kosten'],
  ];

  for (const line of lines(text)) {
    if (isHeaderLine(line) || P.documentType.test(line)) continue;
    if (P.begruendungStart.test(line)) {
      c.start('begruendung_header', 'Begründung');
      inBegruendung = true;
      continue;
    }
    if (inBegruendung) {
      if (P.allgemeinerTeil.test(line)) {
        c.start('begruendung_allgemein', 'Begründung – Allgemeiner Teil');
        continue;
      }
      if (P.besondererTeil.test(line)) {
        c.start('begruendung_besonders', 'Begründung – Besonderer Teil');
        continue;
      }
      const zu = P.zuArtikel.exec(line);
      if (zu) {
        c.start('begruendung_artikel', `Begründung zu Artikel ${zu[1]}`);
        continue;
      }
      // „I. Zielsetzung und Notwendigkeit" gliedert lange Begründungen. Ebene 1,
      // nicht 2: ohne `#` darüber stapelt `segmentBlocks` Geschwister-`##`
      // ineinander statt nebeneinander.
      if (P.romanNumeral.test(line) && line.length < 120) {
        c.push(`# ${line}`);
        continue;
      }
    } else {
      const hit = overview.find(([re]) => re.test(line));
      if (hit) {
        c.start(hit[1], hit[2]);
        continue;
      }
      if (P.artikel.test(line)) {
        c.start('artikel', line);
        continue;
      }
    }
    c.push(line);
  }
  c.flush(inBegruendung ? 'begruendung' : 'artikel');
  return c.sections;
}

function parseAnfrage(text: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const vorbemerkung: string[] = [];
  let inQuestions = false;
  let question: { n: number; lines: string[] } | null = null;

  const saveQuestion = () => {
    if (!question) return;
    const body = joinLines(question.lines);
    if (body.length > 20) {
      sections.push({ sectionType: 'question', title: `Frage ${question.n}`, text: body });
    }
  };

  for (const line of lines(text)) {
    if (!inQuestions && P.frageTitel.test(line)) {
      const body = joinLines(vorbemerkung);
      if (body.length > 50) {
        sections.push({
          sectionType: 'vorbemerkung',
          title: 'Vorbemerkung der Fragesteller',
          text: body,
        });
      }
      inQuestions = true;
      continue;
    }
    if (inQuestions) {
      const q = /^(\d+)\.\s+(.+)/.exec(line);
      if (q) {
        saveQuestion();
        question = { n: Number.parseInt(q[1], 10), lines: [line] };
      } else if (question) {
        question.lines.push(line);
      }
    } else if (!isHeaderLine(line) && !P.documentType.test(line)) {
      vorbemerkung.push(line);
    }
  }
  saveQuestion();
  return sections;
}

function parseAntrag(text: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const intro: string[] = [];
  let mode: 'intro' | 'resolution' | 'begruendung' = 'intro';
  let point: number | null = null;
  let current: string[] = [];

  const save = (sectionType: string, title: string, min: number) => {
    const body = joinLines(current);
    if (body.length >= min) sections.push({ sectionType, title, text: body });
  };
  const saveResolution = () => {
    if (point !== null) save('resolution_point', `Beschlusspunkt ${point}`, 20);
    else save('resolution', 'Beschlussantrag', 30);
  };
  const saveBegruendung = () =>
    save('begruendung', point !== null ? `Begründung zu Punkt ${point}` : 'Begründung', 30);

  for (const line of lines(text)) {
    if (mode === 'intro' && P.beschlussAntrag.test(line)) {
      const body = joinLines(intro);
      if (body.length > 50) {
        sections.push({ sectionType: 'introduction', title: 'Einleitung', text: body });
      }
      mode = 'resolution';
      current = [line];
      continue;
    }
    if (mode !== 'begruendung' && (P.begruendungStart.test(line) || /^Begründung:/i.test(line))) {
      if (mode === 'resolution') saveResolution();
      mode = 'begruendung';
      point = null;
      current = [];
      continue;
    }
    if (mode === 'resolution') {
      const p = /^(\d+)\.\s+(.+)/.exec(line);
      if (p) {
        saveResolution();
        point = Number.parseInt(p[1], 10);
        current = [line];
        continue;
      }
      current.push(line);
    } else if (mode === 'begruendung') {
      const zu = /^[Zz]u\s+(\d+)\.\s*(.*)/.exec(line);
      if (zu) {
        saveBegruendung();
        point = Number.parseInt(zu[1], 10);
        current = [line];
        continue;
      }
      current.push(line);
    } else if (!isHeaderLine(line) && !P.documentType.test(line)) {
      intro.push(line);
    }
  }
  if (mode === 'resolution') saveResolution();
  else if (mode === 'begruendung') saveBegruendung();
  return sections;
}

function parseBericht(text: string): ParsedSection[] {
  const c = new SectionCollector('section');
  for (const line of lines(text)) {
    if (
      (P.romanNumeral.test(line) && line.length < 200) ||
      (/^[A-ZÄÖÜ][A-ZÄÖÜ\s]+$/.test(line) && line.length > 5 && line.length < 100)
    ) {
      c.start('section', line);
      continue;
    }
    c.push(line);
  }
  c.flush();
  return c.sections;
}

function parseGeneric(text: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let n = 0;
  for (const paragraph of text.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
    const body = joinLines(
      paragraph
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !isBoilerplate(l))
    );
    if (body.length > 100) {
      sections.push({ sectionType: 'paragraph', title: `Abschnitt ${++n}`, text: body });
    }
  }
  return sections;
}
