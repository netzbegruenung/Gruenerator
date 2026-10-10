/**
 * Reine Bausteine des Abgeordnetenhaus-Ingests: aus PARDOK-Einträgen werden
 * Einheiten (ein Dokument im Notebook), aus Protokolltext die Abschnitte je
 * Tagesordnungspunkt, dazu Kopftext und Payload. Getestet in
 * `builders.vitest.ts` gegen echte Einträge und Protokollauszüge.
 *
 * Eine Einheit ist:
 *   - Drucksache: ein PDF. Anfrage und Antwort einer Schriftlichen Anfrage
 *     liegen in derselben Datei; solange nur die Anfrage da ist, bleibt sie
 *     draußen — wie im Landtag NRW zählt die Antwort, die die Fragen zitiert.
 *   - Plenarprotokoll: ein Seitenbereich des Wortprotokolls. PARDOK führt je
 *     Beratung einen Eintrag mit den gedruckten Seiten; Einträge mit denselben
 *     Seiten (Mündliche Anfrage und Antwort, gemeinsam beratene Drucksachen)
 *     werden ein Dokument.
 *   - Ausschussprotokoll: ein Tagesordnungspunkt einer Sitzung, aus dem
 *     Wortprotokoll, wo es den Punkt wörtlich führt, sonst aus dem
 *     Inhaltsprotokoll.
 */

import { type PageText } from '../../parliament/index.js';
import { type Ergebnis, sortedErgebnisse } from '../../parliament/outcome.js';
import { regionsOf } from '../../parliament/regions.js';

import { type PardokEntry, type PardokPart } from './pardokClient.js';
import { berlinPolitikfelderOf } from './politikfelder.js';
import { BERLIN_BEZIRKE } from './regions.js';

export const LANDTAG_BERLIN_SOURCE = 'landtag-berlin';
export const LANDTAG_BERLIN_COLLECTION = 'landtag_berlin_documents';
export const WAHLPERIODE = 19;

export const LANDTAG_BERLIN_PART_LABELS: Record<PardokPart, string> = {
  drucksache: 'Drucksache',
  plenarprotokoll: 'Plenarprotokoll',
  ausschussprotokoll: 'Ausschussprotokoll',
};

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

/** „…/SchrAnfr/S19-27175.pdf" → „s19-27175" */
export function fileKeyOf(url: string): string {
  const file = decodeURIComponent(url.split('/').pop() ?? url);
  return file
    .replace(/\.pdf$/i, '')
    .toLocaleLowerCase('de-DE')
    .replace(/[^a-z0-9äöüß]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── Urheber ────────────────────────────────────────────────────────────────

const FRAKTIONEN: Record<string, string> = {
  grüne: 'GRÜNE',
  'bündnis 90/die grünen': 'GRÜNE',
  'die linke': 'Die Linke',
  linke: 'Die Linke',
  cdu: 'CDU',
  spd: 'SPD',
  afd: 'AfD',
  fdp: 'FDP',
  bsw: 'BSW',
  fraktionslos: 'fraktionslos',
};

/**
 * Fraktion in der Schreibung des Notebooks (GRÜNE wie im Landtag NRW), „Senat"
 * für Senatsverwaltungen, Senator*innen und die Senatskanzlei; `null` für
 * alles andere (Ausschüsse, Staatssekretär*innen ohne Ressort).
 */
export function urheberOf(name: string): string | null {
  const lower = name.trim().toLocaleLowerCase('de-DE');
  if (FRAKTIONEN[lower]) return FRAKTIONEN[lower];
  if (/^(der |die )?(senat|regierende|bürgermeister)/.test(lower)) return 'Senat';
  if (/^Sen[A-ZÄÖÜ]/.test(name.trim())) return 'Senat'; // Kürzel wie „SenIAS"
  return null;
}

export function partiesOf(entries: readonly PardokEntry[]): string[] {
  const names = entries.flatMap((e) => [...e.urheber.map((u) => u.fraktion), ...e.koerperschaften]);
  return unique(names.map(urheberOf).filter((p): p is string => p !== null));
}

/** Ausschüsse und Kommissionen, ohne „(federführend)". */
export function gremienOf(entries: readonly PardokEntry[]): string[] {
  return unique(
    entries
      .flatMap((e) => e.koerperschaften)
      .filter((k) => /ausschuss|kommission/i.test(k))
      .map((k) => k.replace(/\s*\(federführend\)\s*$/, '').trim())
  );
}

// ── Drucksachen ────────────────────────────────────────────────────────────

export interface DrucksacheUnit {
  pdfUrl: string;
  entries: PardokEntry[];
}

/** Einträge je Haupt-PDF (das erste `pdf_url`; weitere sind Anlagen). */
export function drucksacheUnitsOf(entries: readonly PardokEntry[]): DrucksacheUnit[] {
  const units = new Map<string, PardokEntry[]>();
  for (const e of entries) {
    const url = e.pdfUrls[0]?.url;
    if (!url) continue;
    units.set(url, [...(units.get(url) ?? []), e]);
  }
  return [...units].map(([pdfUrl, es]) => ({ pdfUrl, entries: es }));
}

/** Eine Schriftliche Anfrage, deren Antwort noch nicht da ist. */
export function isPendingAnfrage(unit: DrucksacheUnit): boolean {
  return unit.entries.every((e) => e.docType === 'Schriftliche Anfrage');
}

// ── Plenarprotokolle ───────────────────────────────────────────────────────

/** Das Wortprotokoll eines Plenareintrags; die übrigen PDFs sind Beschlüsse. */
export function plenarProtocolUrlOf(entry: PardokEntry): string | null {
  return entry.pdfUrls.find((p) => /-wp\.pdf$/i.test(p.url))?.url ?? null;
}

/**
 * Gedruckte Seiten aus `dseit`: „9400"–„9406" oder eine Liste „9305, 9230,
 * 9231" (Beratung über mehrere Stellen verteilt). Aufsteigend, ohne Dubletten.
 * Ein unplausibler Bereich ergibt keine Seiten statt nur der ersten — sonst
 * fehlte der Rest der Beratung still im Dokument.
 */
export function printedPagesOf(pages: PardokEntry['pages']): number[] {
  if (!pages) return [];
  if (pages.to) {
    const from = Number(pages.from);
    const to = Number(pages.to);
    const sane = Number.isInteger(from) && Number.isInteger(to) && to >= from && to - from < 500;
    return sane ? Array.from({ length: to - from + 1 }, (_, i) => from + i) : [];
  }
  const listed = pages.from
    .split(/[,;]/)
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return unique(listed).sort((a, b) => a - b);
}

export interface PlenarUnit {
  protocolUrl: string;
  printedPages: number[];
  entries: PardokEntry[];
}

/**
 * Einträge eines Protokolls, gruppiert nach ihren Seiten. Zusammen gehört, was
 * dieselben Seiten hat (gemeinsam beratene Drucksachen) oder mit demselben
 * Titel auf derselben Seite beginnt: die Antwort auf eine Mündliche Anfrage
 * reicht oft eine Seite weiter als die Frage (9382–9383 gegen 9382–9384).
 */
export function plenarUnitsOf(entries: readonly PardokEntry[]): PlenarUnit[] {
  const units: (PlenarUnit & { titles: Set<string> })[] = [];
  for (const e of entries) {
    const protocolUrl = plenarProtocolUrlOf(e);
    const printedPages = printedPagesOf(e.pages);
    if (!protocolUrl || printedPages.length === 0) continue;
    const key = printedPages.join(',');
    const unit = units.find(
      (u) =>
        u.protocolUrl === protocolUrl &&
        (u.printedPages.join(',') === key ||
          (u.printedPages[0] === printedPages[0] && u.titles.has(e.title)))
    );
    if (unit) {
      unit.entries.push(e);
      unit.titles.add(e.title);
      unit.printedPages = unique([...unit.printedPages, ...printedPages]).sort((a, b) => a - b);
    } else {
      units.push({ protocolUrl, printedPages, entries: [e], titles: new Set([e.title]) });
    }
  }
  return units
    .map(({ protocolUrl, printedPages, entries: es }) => ({
      protocolUrl,
      printedPages,
      entries: es,
    }))
    .sort((a, b) => a.printedPages[0] - b.printedPages[0]);
}

/**
 * Abstand zwischen PDF-Seite und gedruckter Seite. Jede Protokollseite trägt
 * im Kopf „Seite 9338 Plenarprotokoll 19/91"; die Deckseite nicht, und im
 * Inhaltsverzeichnis stehen viele Seitenzahlen — deshalb zählt nur die erste
 * Zeile mit „Seite N" je Seite, und gewonnen hat der häufigste Abstand.
 */
export function printedPageOffsetOf(pages: readonly PageText[]): number | null {
  const counts = new Map<number, number>();
  for (const p of pages) {
    const head = p.text.split('\n').slice(0, 6).join('\n');
    const m = /\bSeite\s+(\d{1,5})\b/.exec(head);
    if (!m) continue;
    const offset = Number(m[1]) - p.page;
    counts.set(offset, (counts.get(offset) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [offset, count] of counts) {
    if (count > bestCount) [best, bestCount] = [offset, count];
  }
  return best;
}

/** Die Seiten einer Einheit, mit gedruckten Seitenzahlen in den Marken. */
export function plenarPagesOf(
  pages: readonly PageText[],
  offset: number,
  printedPages: readonly number[]
): PageText[] {
  const wanted = new Set(printedPages);
  return pages
    .filter((p) => wanted.has(p.page + offset))
    .map((p) => ({ page: p.page + offset, text: p.text }));
}

// ── Ausschussprotokolle ────────────────────────────────────────────────────

/** „…/sw/sw19-074-ip.pdf" → „…/sw/sw19-074" */
export function sessionKeyOf(url: string): string | null {
  const m = /^(.*)-(bp|ip|wp)\.pdf$/i.exec(url);
  return m ? m[1] : null;
}

export interface AusschussSession {
  key: string;
  wortprotokoll: string | null;
  inhaltsprotokoll: string | null;
  entries: PardokEntry[];
}

export function ausschussSessionsOf(entries: readonly PardokEntry[]): AusschussSession[] {
  const sessions = new Map<string, AusschussSession>();
  for (const e of entries) {
    for (const { url } of e.pdfUrls) {
      const key = sessionKeyOf(url);
      if (!key) continue;
      const session = sessions.get(key) ?? {
        key,
        wortprotokoll: null,
        inhaltsprotokoll: null,
        entries: [],
      };
      if (/-wp\.pdf$/i.test(url)) session.wortprotokoll = url;
      if (/-ip\.pdf$/i.test(url)) session.inhaltsprotokoll = url;
      if (!session.entries.includes(e)) session.entries.push(e);
      sessions.set(key, session);
    }
  }
  return [...sessions.values()].filter((s) => s.wortprotokoll || s.inhaltsprotokoll);
}

export interface TopSection {
  number: number;
  /** Erste Zeilen nach „Punkt N der Tagesordnung". */
  heading: string;
  /** Mit Seitenmarke am Anfang, damit der erste Chunk seine Seite kennt. */
  text: string;
}

const TOP_LINE = /^Punkt\s+(\d+)\s+der\s+Tagesordnung\s*$/;
const PAGE_LINE = /^##\s*Seite\s+(\d+)\s*$/;

/**
 * Schneidet ein Ausschussprotokoll an „Punkt N der Tagesordnung". Eine Zeile
 * zählt nur, wenn N der nächste Punkt ist — ein Verweis „siehe Punkt 4 der
 * Tagesordnung" auf eigener Zeile schneidet sonst mitten in einen Punkt.
 * Was vor Punkt 1 steht (Kopf, „Vor Eintritt in die Tagesordnung"), fällt weg.
 */
export function splitTops(text: string): TopSection[] {
  const lines = text.split('\n');
  const tops: { number: number; page: number; lines: string[] }[] = [];
  let page = 1;
  for (const line of lines) {
    const pageMatch = PAGE_LINE.exec(line.trim());
    if (pageMatch) page = Number(pageMatch[1]);
    const topMatch = TOP_LINE.exec(line.trim());
    const next = (tops.at(-1)?.number ?? 0) + 1;
    if (topMatch && Number(topMatch[1]) === next) {
      tops.push({ number: next, page, lines: [] });
      continue;
    }
    tops.at(-1)?.lines.push(line);
  }
  return tops.map((t) => {
    const body = t.lines.join('\n').trim();
    const heading = t.lines
      .map((l) => l.trim())
      .filter((l) => l && !PAGE_LINE.test(l))
      .slice(0, 2)
      .join(' ')
      .replace(/-\s+(?=\p{Ll})/gu, '')
      .slice(0, 200);
    const marked = PAGE_LINE.test(body.split('\n')[0]?.trim() ?? '')
      ? body
      : `## Seite ${t.page}\n\n${body}`;
    return { number: t.number, heading, text: marked };
  });
}

/** „Siehe Inhaltsprotokoll." — der Punkt steht im anderen Protokoll. */
export function isStubTop(top: TopSection): boolean {
  const body = top.text.replace(/^##\s*Seite\s+\d+\s*$/gm, '').trim();
  return body.length < 400 && /siehe\s+(inhalts|wort|beschluss)protokoll/i.test(body);
}

export interface ChosenTop extends TopSection {
  sourceUrl: string;
}

/** Je Punkt der wörtliche Text, wo es ihn gibt, sonst die Zusammenfassung. */
export function chooseTops(
  wort: { url: string; tops: TopSection[] } | null,
  inhalt: { url: string; tops: TopSection[] } | null
): ChosenTop[] {
  const numbers = unique([
    ...(wort?.tops ?? []).map((t) => t.number),
    ...(inhalt?.tops ?? []).map((t) => t.number),
  ]).sort((a, b) => a - b);
  const chosen: ChosenTop[] = [];
  for (const n of numbers) {
    for (const source of [wort, inhalt]) {
      const top = source?.tops.find((t) => t.number === n);
      if (source && top && !isStubTop(top)) {
        chosen.push({ ...top, sourceUrl: source.url });
        break;
      }
    }
  }
  return chosen;
}

const normalizeForMatch = (s: string): string =>
  s
    .toLocaleLowerCase('de-DE')
    .replace(/-\s*\n\s*(?=\p{Ll})/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Die PARDOK-Einträge, die ein Punkt behandelt: der Titel des Eintrags steht
 * im Kopf des Punkts. Ein Punkt ohne Treffer (Aktuelle Viertelstunde, Bericht
 * des Senats) bekommt nur, was für die ganze Sitzung gilt.
 */
export function entriesOfTop(top: TopSection, entries: readonly PardokEntry[]): PardokEntry[] {
  const head = normalizeForMatch(top.text.slice(0, 2000));
  return entries.filter((e) => {
    const title = normalizeForMatch(e.title).slice(0, 60);
    return title.length >= 12 && head.includes(title);
  });
}

// ── Filterfelder aus dem Text ──────────────────────────────────────────────

/** „Schulze, Tobias" → „Tobias Schulze"; ein Name ohne Komma bleibt, wie er ist. */
export function personName(name: string): string {
  const m = /^([^,]+),\s*(.+)$/.exec(name.trim());
  return m ? `${m[2]} ${m[1]}` : name.trim();
}

const FRAKTION_IN_KLAMMERN = '(CDU|SPD|GRÜNE|LINKE|AfD|FDP|BSW|fraktionslos)';
const NAME = "(?:(?:Dr|Prof)\\.\\s)*\\p{Lu}[\\p{L}.'\\- ]{1,60}?";
/**
 * Ein Redebeitrag beginnt mit Name und Fraktion am Zeilenanfang: im
 * Plenarprotokoll als eigene Zeile „## Werner Graf (GRÜNE):", im
 * Wortprotokoll eines Ausschusses „Christian Goiny (CDU): Herzlich …", im
 * Inhaltsprotokoll „Christian Goiny (CDU) fragt …".
 */
const ABGEORDNETE = new RegExp(
  `^(?:##\\s*)?(${NAME})\\s\\(${FRAKTION_IN_KLAMMERN}\\)(?::|\\s+(?=\\p{Ll}))`,
  'u'
);
const SENAT = new RegExp(
  `^(?:##\\s*)?(?:Senator(?:in)?|Regierende[rn]? Bürgermeister(?:in)?|Bürgermeister(?:in)?|Staatssekretär(?:in)?)\\s(${NAME})(?:\\s\\([^)]{1,20}\\))?(?::|\\s+(?=\\p{Ll}))`,
  'u'
);
const KEIN_NAME = /^(Beifall|Zuruf|Zurufe|Heiterkeit|Lachen|Widerspruch|Unruhe)\b/;

const FRAKTION_NAMEN: Record<string, string> = { LINKE: 'Die Linke', GRÜNE: 'GRÜNE' };

/**
 * Redner*innen eines Protokollabschnitts mit Fraktion, „Senat" für Senat und
 * Staatssekretär*innen. Zwischenrufe stehen in eckigen Klammern, oft über
 * mehrere Zeilen — eine Zeile innerhalb einer offenen Klammer zählt nicht.
 * Die Sitzungsleitung trägt keine Fraktion in Klammern und fällt so heraus.
 */
export function speakersOf(text: string): { name: string; party: string }[] {
  const found = new Map<string, string>();
  let depth = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (depth === 0 && !line.startsWith('[') && !KEIN_NAME.test(line)) {
      const abgeordnete = ABGEORDNETE.exec(line);
      const senat = abgeordnete ? null : SENAT.exec(line);
      if (abgeordnete) {
        found.set(abgeordnete[1].trim(), FRAKTION_NAMEN[abgeordnete[2]] ?? abgeordnete[2]);
      } else if (senat) {
        found.set(senat[1].trim(), 'Senat');
      }
    }
    depth = Math.max(0, depth + (line.match(/\[/g)?.length ?? 0) - (line.match(/]/g)?.length ?? 0));
  }
  return [...found].map(([name, party]) => ({ name, party }));
}

/** Zeilenumbrüche und Silbentrennung heraus, damit ein Satz ein Satz ist. */
const asProse = (text: string): string =>
  text.replace(/(\p{Ll})-\n(\p{Ll})/gu, '$1$2').replace(/\s+/g, ' ');

const ABSTIMMUNG =
  /Wer (?:stimmt|enthält)|Gegenstimmen|Enthaltung|Wer (?:dem|der|den) [^?]{0,120}zustimmen/;

/**
 * Ergebnis eines Protokollabschnitts aus den festen Formeln der Sitzungsleitung:
 * „… Wer enthält sich? – … Damit ist der Antrag abgelehnt." zählt nur mit
 * einer Abstimmungsfrage davor, sonst träfe „Den haben Sie abgelehnt." aus
 * einer Rede. Überweisungen: „Vorgeschlagen wird die Überweisung … –
 * Widerspruch höre ich nicht". Ausschüsse: „Der Ausschuss beschließt, dem
 * Plenum die Ablehnung …".
 */
export function ergebnisOf(text: string, part: PardokPart): Ergebnis[] {
  if (part === 'drucksache') return [];
  const prose = asProse(text);
  const found: Ergebnis[] = [];
  const vote =
    /\b(?:ist|sind)\s+(?:(?:damit|somit|so|dann|auch|demnach)\s+)*(?:(?:der|die|das|dieser|diese|dieses)\s+)?(?:[\p{L}-]+\s+){0,5}?(?:(?:damit|somit|so)\s+)?(angenommen|abgelehnt)\s*[.!]/gu;
  for (const m of prose.matchAll(vote)) {
    const before = prose.slice(Math.max(0, m.index - 400), m.index);
    if (ABSTIMMUNG.test(before)) found.push(m[1] as Ergebnis);
  }
  if (/Überweisung[^.]{0,400}\.\s*[–-]\s*Widerspruch höre ich nicht/.test(prose)) {
    found.push('überwiesen');
  }
  for (const m of prose.matchAll(
    /Der Ausschuss (?:beschließt|empfiehlt)[^.]{0,200}?\b(Annahme|Ablehnung)/g
  )) {
    found.push(m[1] === 'Annahme' ? 'angenommen' : 'abgelehnt');
  }
  return sortedErgebnisse(found);
}

/** Wie viel Text der Bezirksabgleich einer Drucksache sieht: Kopf und Anfang. */
const REGION_TEXT_CHARS = 4000;

/**
 * Filterfelder aus Text und Urheber*innen. Eigene Funktion, weil
 * `scripts/backfill-parliament-filters.ts` sie für den Bestand aus der
 * gespeicherten Payload nachrechnet — deshalb nur aus dem, was dort steht.
 */
export function filterFieldsOf(input: {
  part: PardokPart;
  title: string;
  text: string;
  /** Urheber*innen aus PARDOK, roh oder schon normalisiert. */
  urheber: readonly string[];
  /** Für Protokolle: die Fraktionen der Einträge (Fragesteller*innen, Senat). */
  parties: readonly string[];
}): Record<string, string[]> {
  const isProtocol = input.part !== 'drucksache';
  const redner = isProtocol ? speakersOf(input.text) : [];
  const regionText = isProtocol
    ? input.title
    : `${input.title}\n${input.text.slice(0, REGION_TEXT_CHARS)}`;
  return {
    speakers: unique([...input.urheber.map(personName), ...redner.map((r) => r.name)]),
    speaker_party: isProtocol ? unique([...input.parties, ...redner.map((r) => r.party)]) : [],
    ergebnis: ergebnisOf(input.text, input.part),
    region: regionsOf(regionText, BERLIN_BEZIRKE),
  };
}

// ── Kopf und Payload ───────────────────────────────────────────────────────

export interface UnitDescription {
  documentId: string;
  part: PardokPart;
  title: string;
  sourceUrl: string;
  documentNumber: string;
  publishedAt: string | null;
  entries: PardokEntry[];
  /** Sitzungsweite Ausschüsse, wenn die Einträge eines Punkts keine nennen. */
  gremien?: string[];
  /** Für Protokollabschnitte: welcher Abschnitt von wie vielen. */
  segment?: { protocolId: string; index: number; count: number };
}

const isoToGerman = (iso: string): string => iso.split('-').reverse().join('.');

/**
 * Kopf vor dem PDF-Text: Titel als Überschrift, dazu was nur in PARDOK steht —
 * Dokumentart, Urheber*innen, Sachgebiet. Er landet im ersten Chunk, damit die
 * Suche auch diese Angaben trifft.
 */
export function headerTextOf(unit: UnitDescription): string {
  const lines = [`# ${unit.title}`, ''];
  const datum = unit.publishedAt ? ` vom ${isoToGerman(unit.publishedAt)}` : '';
  lines.push(
    `${LANDTAG_BERLIN_PART_LABELS[unit.part]} ${WAHLPERIODE}/${unit.documentNumber}${datum} (Abgeordnetenhaus Berlin)`
  );
  const types = unique(unit.entries.map((e) => e.docType).filter(Boolean));
  if (types.length > 0) lines.push(types.join(', '));
  const gremien = gremienOf(unit.entries).length > 0 ? gremienOf(unit.entries) : unit.gremien;
  if (gremien && gremien.length > 0) lines.push(gremien.join(', '));
  const personen = unique(
    unit.entries.flatMap((e) => e.urheber.map((u) => `${u.name} (${u.fraktion})`))
  );
  if (personen.length > 0) lines.push('', `Urheber*innen: ${personen.join('; ')}`);
  const titles = unique(unit.entries.map((e) => e.title)).filter((t) => t !== unit.title);
  if (titles.length > 0) lines.push('', ...titles.map((t) => `- ${t}`));
  return lines.join('\n');
}

/**
 * Das Verfahren einer Drucksache: Änderungsanträge tragen die Nummer ihrer
 * Vorlage mit Suffix (`3105-1` → `3105`). PARDOK liefert keine Vorgangs-ID, die
 * Nummer ist der einzige belegte Schlüssel (#4307).
 */
export function vorgangIdOf(documentNumber: string): string {
  return documentNumber.replace(/-\d+$/, '');
}

/** Payload-Felder, die jeder Chunk eines Dokuments trägt. */
export function documentPayloadOf(unit: UnitDescription, text: string): Record<string, unknown> {
  const sachgebiete = unique(
    unit.entries.map((e) => e.sachgebiet).filter((s): s is string => Boolean(s))
  );
  const gremien = gremienOf(unit.entries).length > 0 ? gremienOf(unit.entries) : unit.gremien;
  const stellen = unit.entries.flatMap((e) => [
    ...e.koerperschaften,
    ...e.urheber.map((u) => u.fraktion),
  ]);
  return {
    document_id: unit.documentId,
    record_id: unique(unit.entries.map((e) => e.id)),
    title: unit.title,
    source_url: unit.sourceUrl,
    source: LANDTAG_BERLIN_SOURCE,
    country: 'DE',
    wahlperiode: WAHLPERIODE,
    content_type: unit.part,
    doc_type: unique(unit.entries.map((e) => e.docType).filter(Boolean)),
    document_number: unit.documentNumber,
    ...(unit.part === 'drucksache' ? { vorgang_id: vorgangIdOf(unit.documentNumber) } : {}),
    published_at: unit.publishedAt,
    primary_category: berlinPolitikfelderOf(sachgebiete, [...stellen, ...(gremien ?? [])]),
    subcategories: sachgebiete,
    party: partiesOf(unit.entries),
    gremium: gremien ?? [],
    ...filterFieldsOf({
      part: unit.part,
      title: unit.title,
      text,
      urheber: unit.entries.flatMap((e) => e.urheber.map((u) => u.name)),
      parties: partiesOf(unit.entries),
    }),
    ...(unit.segment
      ? {
          protocol_id: unit.segment.protocolId,
          segment_index: unit.segment.index,
          segment_count: unit.segment.count,
        }
      : {}),
  };
}

/** Das späteste Datum der Einträge — bei Anfrage und Antwort das der Antwort. */
export function latestDateOf(entries: readonly PardokEntry[]): string | null {
  const dates = entries.map((e) => e.publishedAt).filter((d): d is string => d !== null);
  return dates.length > 0 ? dates.sort().at(-1)! : null;
}
