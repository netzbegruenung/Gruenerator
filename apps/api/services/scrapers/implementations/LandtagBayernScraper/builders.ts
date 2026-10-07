/**
 * Reine Bausteine des Ingests für den Bayerischen Landtag: aus einem
 * Listentreffer und dem PDF-Text werden Dokument-Id, Dokumenttyp, Urheber,
 * Redner*innen, Kopftext und Payload. Getestet in `builders.vitest.ts` gegen
 * echte Treffer und Textauszüge.
 *
 * Anders als NRW und Berlin führt der Landtag keine Systematik — das Thema
 * kommt über die NLP-Anreicherung (`ENRICHMENT_COLLECTIONS`), das eigene
 * Vokabular des Landtags steht als Schlagworte in `keywords`.
 */

import { type BayernListEntry } from './listParser.js';

export const LANDTAG_BAYERN_SOURCE = 'landtag-bayern';
export const LANDTAG_BAYERN_COLLECTION = 'landtag_bayern_documents';
export const WAHLPERIODE = 19;

/** Die Dokumentarten, die das Notebook führt — der Schlüssel landet als `content_type`. */
export const LANDTAG_PARTS = {
  drucksache: 'Drucksache',
  plenarprotokoll: 'Plenarprotokoll',
} as const;

export type LandtagPart = keyof typeof LANDTAG_PARTS;

/**
 * Ein Dokument mit allen Vorgängen, die es auf einer Listenseite betrifft.
 * `entry` ist der erste Treffer; `titles` die Titel aller Treffer.
 */
export interface BayernDocument {
  entry: BayernListEntry;
  titles: string[];
}

/**
 * Typen am Anfang der Beschreibungszeile, wie sie der Landtag schreibt.
 * Längste zuerst, damit „Beschlussempfehlung mit Bericht" nicht als
 * „Beschluss…" und „Dringlichkeitsantrag" nicht als „Antrag" endet.
 */
const DOC_TYPES = [
  '1. Lesung',
  '2. Lesung',
  '3. Lesung',
  'Aktuelle Stunde',
  'Anfragen zum Plenum',
  'Ansprache, Erklärung, Gedenken',
  'Antrag',
  'Antrag auf Einsetzung eines Untersuchungsausschuss',
  'Antrag zur Geschäftsordnung',
  'Bayerische Verfassungsbeschwerde',
  'Beratungsphase',
  'Bericht',
  'Beschluss des Plenums',
  'Beschlussempfehlung mit Bericht',
  'Dringlichkeitsantrag',
  'Erklärung gem. Geschäftsordnung',
  'EU-Konsultation gemäß § 83d BayLTGeschO',
  'EU-Vorhaben gemäß § 83c BayLTGeschO',
  'Geschäftliches',
  'Gesetzentwurf',
  'Haushaltsgesetz, Nachtragshaushaltsgesetz',
  'Haushaltsrechnung',
  'Interpellation',
  'Mitteilung',
  'Regierungserklärung',
  'Schriftliche Anfrage',
  'Staatsvertrag',
  'Verordnung',
  'Wahl',
  'Änderungsantrag',
].sort((a, b) => b.length - a.length);

/**
 * Fraktionen der 19. Wahlperiode in der Schreibung der Beschreibungszeile →
 * die Kurzform, die auch in den Rednerzeilen der Protokolle steht.
 */
const FRAKTIONEN: Record<string, string> = {
  CSU: 'CSU',
  'FREIE WÄHLER': 'FREIE WÄHLER',
  'BÜNDNIS 90/DIE GRÜNEN': 'GRÜNE',
  AfD: 'AfD',
  SPD: 'SPD',
};
const SPEAKER_PARTIES = ['CSU', 'FREIE WÄHLER', 'GRÜNE', 'AfD', 'SPD', 'fraktionslos'];
const GOVERNMENT = 'Staatsregierung';

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * Dokumenttyp aus dem Anfang der Beschreibungszeile. Unbekanntes fällt auf
 * das erste Wort zurück — ein neuer Typ soll im Filter auftauchen, nicht
 * verschwinden.
 */
export function classifyDocType(descriptor: string): string {
  const hit = DOC_TYPES.find((t) => {
    if (!descriptor.startsWith(t)) return false;
    const next = descriptor.charAt(t.length);
    return next === '' || !/[\p{L}\p{N}]/u.test(next);
  });
  return hit ?? descriptor.split(' ')[0] ?? '';
}

/**
 * Urheber einer Drucksache: Fraktionen und Staatsregierung im eigenen Teil
 * der Beschreibungszeile. Was hinter „zu" steht, gehört zum Bezugsvorgang
 * („Beschlussempfehlung mit Bericht zu Antrag SPD") — nicht zum Urheber.
 */
export function urheberOf(descriptor: string): string[] {
  const own = descriptor.split(' zu ')[0] ?? descriptor;
  const found = Object.entries(FRAKTIONEN)
    .filter(([name]) => new RegExp(`(^|[\\s,])${escapeRe(name)}($|[\\s,])`).test(own))
    .map(([, short]) => short);
  if (/(^|\s)Staatsregierung($|\s)/.test(own)) found.push(GOVERNMENT);
  return found;
}

const slugOf = (s: string): string =>
  s
    .toLocaleLowerCase('de-DE')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Stabile Id aus dem PDF-Pfad: dasselbe PDF ist dasselbe Dokument, egal wie
 * viele Vorgänge es in der Liste nennen. Drucksachen behalten den Pfad hinter
 * der Textablage, weil Basis- und Folgedrucksachen getrennt nummeriert sind;
 * Protokollauszüge tragen Sitzung und Tagesordnungspunkt schon im Dateinamen
 * (`087_PL_005_…`), ihre Ordner sind nur Ablage.
 */
export function documentIdOf(pdfUrl: string): string {
  const pathname = decodeURIComponent(new URL(pdfUrl).pathname).replace(/\.pdf$/i, '');
  const m = /ElanTextAblage_(WP\d+)\/(.+)$/.exec(pathname);
  if (!m) return `ltby-${slugOf(pathname)}`;
  const [, wp, rest] = m;
  if (rest.startsWith('Protokolle/')) {
    return `ltby-${slugOf(wp)}-protokoll-${slugOf(rest.split('/').pop() ?? rest)}`;
  }
  return `ltby-${slugOf(wp)}-${slugOf(rest)}`;
}

/** Fasst die Treffer einer Listenseite je PDF zusammen, in der Reihenfolge der Liste. */
export function groupByDocument(entries: readonly BayernListEntry[]): BayernDocument[] {
  const byId = new Map<string, BayernDocument>();
  for (const entry of entries) {
    const id = documentIdOf(entry.pdfUrl);
    const doc = byId.get(id);
    if (!doc) byId.set(id, { entry, titles: [entry.title] });
    else if (!doc.titles.includes(entry.title)) doc.titles.push(entry.title);
  }
  return [...byId.values()];
}

export interface Speaker {
  name: string;
  party: string;
}

const PARTY_ALT = SPEAKER_PARTIES.map(escapeRe).join('|');
const NAME = String.raw`(?:(?:Prof\.|Dr\.)\s*)*[A-ZÄÖÜ][\p{L}'’-]+(?:\s+(?:von\s+|van\s+|de\s+|zu\s+)?[A-ZÄÖÜ][\p{L}'’-]+){1,3}`;
/** „Florian Siekmann (GRÜNE): Frau Präsidentin, …" — Zwischenrufe stehen in Klammern und fallen weg. */
const MEMBER_LINE = new RegExp(`^\\s*(${NAME})\\s+\\((${PARTY_ALT})\\):`, 'gmu');
/** „Staatsminister Joachim Herrmann (Innenministerium): …" */
const GOVERNMENT_LINE = new RegExp(
  `^\\s*(?:Staatsminister(?:in)?|Staatssekretär(?:in)?|Ministerpräsident(?:in)?)\\s+(${NAME})(?:\\s+\\([^)]*\\))?:`,
  'gmu'
);
/** „Schriftliche Anfrage der Abgeordneten Anna Rasehorn SPD vom 10.08.2026" */
const ANFRAGE_HEAD = new RegExp(
  `Schriftliche\\s+Anfrage\\s+de[rs]\\s+Abgeordneten\\s+(${NAME})\\s+(${[...Object.keys(FRAKTIONEN), ...SPEAKER_PARTIES].map(escapeRe).join('|')})\\s+vom`,
  'u'
);

/**
 * Redner*innen eines Protokollauszugs aus den Zeilen, mit denen ein Beitrag
 * beginnt. Die Sitzungsleitung („Präsidentin Ilse Aigner:") hat keine
 * Fraktion in Klammern und fällt dadurch heraus.
 */
export function protocolSpeakersOf(text: string): Speaker[] {
  const found = new Map<string, Speaker>();
  for (const m of text.matchAll(MEMBER_LINE)) {
    const name = m[1].replace(/\s+/g, ' ');
    if (!found.has(name)) found.set(name, { name, party: m[2] });
  }
  for (const m of text.matchAll(GOVERNMENT_LINE)) {
    const name = m[1].replace(/\s+/g, ' ');
    if (!found.has(name)) found.set(name, { name, party: GOVERNMENT });
  }
  return [...found.values()];
}

/** Fragesteller*in einer Schriftlichen Anfrage aus dem Kopf des PDFs. */
export function anfrageAuthorOf(text: string): Speaker | null {
  const m = ANFRAGE_HEAD.exec(text.slice(0, 2000).replace(/\s+/g, ' '));
  if (!m) return null;
  return { name: m[1], party: FRAKTIONEN[m[2]] ?? m[2] };
}

export function speakersOf(part: LandtagPart, docType: string, text: string): Speaker[] {
  if (part === 'plenarprotokoll') return protocolSpeakersOf(text);
  if (docType === 'Schriftliche Anfrage') {
    const author = anfrageAuthorOf(text);
    return author ? [author] : [];
  }
  return [];
}

const partOf = (entry: BayernListEntry): LandtagPart =>
  entry.documentKind === 'Plenarprotokoll' ? 'plenarprotokoll' : 'drucksache';

/** Wie viele weitere Vorgangstitel der Kopf eines Sammeldokuments nennt. */
const MAX_HEADER_TITLES = 20;

/**
 * Kopf vor dem PDF-Text: Titel, Nummer und Datum, Beschreibungszeile,
 * Kurzbeschreibung — und bei Sammeldokumenten die übrigen Vorgänge. Er landet
 * im ersten Chunk, damit die Suche auch diese Angaben trifft.
 */
export function headerTextOf(doc: BayernDocument): string {
  const { entry } = doc;
  const lines = [`# ${entry.title}`, ''];
  const datum = entry.publishedAt ? ` vom ${entry.publishedAt.split('-').reverse().join('.')}` : '';
  lines.push(
    `${LANDTAG_PARTS[partOf(entry)]} ${entry.documentNumber}${datum} (Bayerischer Landtag)`
  );
  if (entry.descriptor) lines.push(entry.descriptor);
  if (entry.abstract) lines.push('', entry.abstract);
  const others = doc.titles.slice(1);
  if (others.length > 0) {
    const shown = others.slice(0, MAX_HEADER_TITLES).map((t) => `- ${t}`);
    if (others.length > MAX_HEADER_TITLES)
      shown.push(`- … und ${others.length - MAX_HEADER_TITLES} weitere`);
    lines.push('', 'Betrifft auch:', ...shown);
  }
  if (entry.schlagworte.length > 0) lines.push('', `Schlagworte: ${entry.schlagworte.join(', ')}`);
  return lines.join('\n');
}

/** Payload-Felder, die jeder Chunk eines Dokuments trägt. */
export function documentPayloadOf(doc: BayernDocument, text: string): Record<string, unknown> {
  const { entry } = doc;
  const part = partOf(entry);
  const docType = classifyDocType(entry.descriptor);
  const speakers = speakersOf(part, docType, text);
  return {
    document_id: documentIdOf(entry.pdfUrl),
    gegenstand_id: entry.gegenstandId,
    title: entry.title,
    source_url: entry.pdfUrl,
    source: LANDTAG_BAYERN_SOURCE,
    country: 'DE',
    wahlperiode: WAHLPERIODE,
    content_type: part,
    doc_type: docType,
    document_number: entry.documentNumber,
    published_at: entry.publishedAt,
    keywords: entry.schlagworte,
    party: part === 'drucksache' ? urheberOf(entry.descriptor) : [],
    speakers: speakers.map((s) => s.name),
    speaker_party: [...new Set(speakers.map((s) => s.party))],
    vorgaenge: doc.titles,
  };
}
