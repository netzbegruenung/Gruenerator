/**
 * Reine Bausteine des Landtag-NRW-Ingests: aus einem Listentreffer werden
 * Dokumenttyp, Urheber, Ausschuss, Kopftext und Payload. Getestet in
 * `builders.vitest.ts` gegen echte Treffer.
 */

import { type Ergebnis, sortedErgebnisse } from '../../parliament/outcome.js';
import { regionsOf } from '../../parliament/regions.js';

import { type LandtagListEntry, type PageRange } from './listParser.js';
import { politikfelderOf } from './politikfelder.js';
import { NRW_REGIONS } from './regions.js';

export const LANDTAG_NRW_SOURCE = 'landtag-nrw';
export const LANDTAG_NRW_COLLECTION = 'landtag_nrw_documents';
export const WAHLPERIODE = 18;

/** Die drei Dokumentarten, die das Notebook führt — der Wert landet als `content_type`. */
export const LANDTAG_PARTS = {
  drucksache: 'DRUCKSACHE',
  plenarprotokoll: 'PLENARPROTOKOLL',
  ausschussprotokoll: 'AUSSCHUSSPROTOKOLL',
} as const;

export type LandtagPart = keyof typeof LANDTAG_PARTS;

export const LANDTAG_PART_LABELS: Record<LandtagPart, string> = {
  drucksache: 'Drucksache',
  plenarprotokoll: 'Plenarprotokoll',
  ausschussprotokoll: 'Ausschussprotokoll',
};

/**
 * Die Dokumenttypen der Parlamentsdatenbank (Suchformular, Feld „Dokumenttyp")
 * plus „Antwort"-Varianten, wie sie am Anfang der Beschreibungszeile stehen.
 * Längste zuerst, damit „Antrag auf Aktuelle Stunde" nicht als „Antrag" endet.
 */
const DOC_TYPES = [
  '1. Lesung',
  '1. und 2. Lesung',
  '2. Lesung',
  '2. und 3. Lesung',
  '3. Lesung',
  'Abschlussbericht',
  'Aktuelle Anfrage/Aktuelle Viertelstunde',
  'Aktuelle Stunde',
  'Ansprache',
  'Antrag',
  'Antrag (Staatsvertrag)',
  'Antrag auf Aktuelle Stunde',
  'Antrag zur Geschäftsordnung',
  'Antwort',
  'Ausschussreise',
  'Auswärtige Sitzung',
  'Änderungsantrag',
  'Bekanntmachung',
  'Beratung (öffentlich)',
  'Beratungsergebnis',
  'Beratungsgrundlage',
  'Bericht',
  'Berichtigung',
  'Beschlossenes Gesetz',
  'Beschlussdrucksache',
  'Beschlussempfehlung',
  'Beschlussempfehlung und Bericht',
  'Beschlüsse zu Petitionen',
  'Diverse',
  'Dringliche Anfrage',
  'Dringliche Frage im Ausschuss',
  'Eilantrag',
  'Entscheidung',
  'Entschließungsantrag',
  'Ergänzung',
  'Ergebnis Berichterstattergespräch',
  'Erklärung',
  'Geschäftsordnung',
  'Gesetz',
  'Gesetzentwurf',
  'Große Anfrage',
  'Gutachten',
  'Kleine Anfrage',
  'Konstituierung',
  'Mitteilung',
  'Mitteilung des Beratungsergebnisses an einen federführenden Ausschuss',
  'Mündliche Anfrage',
  'Mündliche Anfrage (dringlich)',
  'Öffentliche Anhörung',
  'Regierungserklärung',
  'Richtlinie',
  'Runderlass',
  'Sondersitzung',
  'Staatsvertrag',
  'Unterbrechung',
  'Unterrichtung',
  'Übersicht',
  'Vereidigung',
  'Verfassungsgerichtliches Verfahren',
  'Verordnung',
  'Verordnungsentwurf',
  'Verpflichtung',
  'Verwaltungsvereinbarung',
  'Verwaltungsvorschrift',
  'Wahl',
  'Wahlvorschlag',
].sort((a, b) => b.length - a.length);

/**
 * Dokumenttyp aus dem Anfang der Beschreibungszeile, in der Schreibung des
 * Landtags. Unbekanntes fällt auf das erste Wort zurück statt auf nichts — ein
 * neuer Typ soll im Filter auftauchen, nicht verschwinden.
 */
export function classifyDocType(descriptor: string): string {
  const lower = descriptor.toLocaleLowerCase('de-DE');
  const hit = DOC_TYPES.find((t) => {
    const prefix = t.toLocaleLowerCase('de-DE');
    if (!lower.startsWith(prefix)) return false;
    const next = lower.charAt(prefix.length);
    return next === '' || !/[\p{L}\p{N}]/u.test(next);
  });
  return hit ? descriptor.slice(0, hit.length) : (descriptor.split(' ')[0] ?? '');
}

/**
 * Kleine Anfragen bleiben draußen: die Antwort der Landesregierung zitiert die
 * Fragen wörtlich und trägt dazu die Fakten — die Anfrage allein wäre eine
 * zweite, ärmere Fassung desselben Treffers.
 */
export function isExcludedDocType(docType: string): boolean {
  return docType === 'Kleine Anfrage';
}

const FRAKTIONEN = ['CDU', 'SPD', 'GRÜNE', 'FDP', 'AfD'] as const;

/**
 * Urheber einer Drucksache: die Fraktionen vor einem „zu …"-Bezug, bei
 * Antworten und Regierungsvorlagen die Landesregierung. Was hinter „zu" steht,
 * ist das Bezugsdokument („zu GesEntw LRg"), nicht der Urheber.
 */
export function urheberOf(descriptor: string, docType: string): string[] {
  if (docType === 'Antwort') return ['Landesregierung'];
  const own = descriptor.split(' zu ')[0] ?? descriptor;
  const found: string[] = FRAKTIONEN.filter((f) =>
    new RegExp(`(^|[\\s,(])${f}($|[\\s,)])`).test(own)
  );
  if (/(^|\s)LRg($|\s)/.test(own)) found.push('Landesregierung');
  return found;
}

/**
 * Ausschuss-Kürzel einer Sitzungsangabe. Eine gemeinsame Sitzung steht als
 * „HFA/52.HFA/UAP" — je Ausschuss Kürzel und dessen Sitzungsnummer, und ein
 * Unterausschuss trägt selbst einen Schrägstrich (HFA/UAP). Geteilt wird
 * deshalb nur vor einer Nummer.
 */
export function gremienOf(raw: string): string[] {
  const parts = raw.split(/\/\s*\d+\.\s*/).map((g) => g.trim().toLocaleUpperCase('de-DE'));
  return [...new Set(parts.filter(Boolean))];
}

/** Ausschüsse und erste Sitzungsnummer aus „17.09.2026 92.AHeiKo S.1, 4". */
export function ausschussOf(trailer: string): { gremien: string[]; sitzung: number } | null {
  const m = /\d{2}\.\d{2}\.\d{4}\s+(\d+)\.\s*(.+?)\s+S\.\s*\d/.exec(trailer);
  if (!m) return null;
  return { sitzung: Number(m[1]), gremien: gremienOf(m[2]) };
}

/**
 * Die Seiten des Originalprotokolls, aus denen ein Auszug besteht, in der
 * Reihenfolge des Auszugs. `null` für ganze Dokumente (`|1|0`) — dort ist die
 * Seite im PDF schon die echte.
 */
export function originalPagesOf(ranges: readonly PageRange[]): number[] | null {
  if (ranges.length === 0 || ranges.some((r) => r.to === 0)) return null;
  return ranges.flatMap((r) =>
    Array.from({ length: Math.max(0, r.to - r.from + 1) }, (_, i) => r.from + i)
  );
}

export type ProcessOutcome = 'stored' | 'known' | 'excluded' | 'empty';

/**
 * Der Nacht-Sync blättert, bis er auf ein schon gespeichertes Dokument trifft —
 * die Liste steht neueste zuerst, dahinter ist alles bekannt. „Nichts
 * gespeichert" wäre das falsche Signal: Kleine Anfragen werden nie gespeichert,
 * und eine Seite voller neuer Anfragen beendete den Lauf vor den echten
 * Dokumenten dahinter.
 */
export function reachedKnownDocuments(outcomes: readonly (ProcessOutcome | undefined)[]): boolean {
  return outcomes.includes('known');
}

/** „Blumenrath, Peter CDU S. 30" → „Blumenrath, Peter CDU" */
export function speakerName(line: string): string {
  return line
    .replace(/\s+S\.\s*\d.*$/, '')
    .replace(/\s*\(KInt\)\s*$/, '')
    .trim();
}

const SPEAKER_FRAKTIONEN = new Set(['CDU', 'SPD', 'GRÜNE', 'FDP', 'AfD', 'fraktionslos']);

/**
 * „Dr. Korte, Robin GRÜNE" → Robin Korte mit Titel und Fraktion. Hinter dem
 * Namen steht die Fraktion oder bei Regierungsmitgliedern das Ressortkürzel
 * („Reul, Herbert IM", „(MSB)") — die zählen als Landesregierung. Die
 * Sitzungsleitung (Präs, VizePräs) ist kein Redebeitrag und fällt weg.
 */
export function speakerOf(line: string): { name: string; party: string } | null {
  const m = /^(?<last>[^,]+),\s*(?<first>.+?)\s+(?<tag>\S+)$/.exec(speakerName(line));
  if (!m?.groups) return null;
  const { last, first, tag } = m.groups;
  if (/^\(?(Vize)?Präs/i.test(tag)) return null;
  const titled = /^((?:(?:Dr|Prof)\.\s*)+)(.+)$/.exec(last.trim());
  const name = titled ? `${titled[1].trim()} ${first} ${titled[2]}` : `${first} ${last.trim()}`;
  return { name, party: SPEAKER_FRAKTIONEN.has(tag) ? tag : 'Landesregierung' };
}

/**
 * Ergebnis aus dem Beschluss der Datenbank („Der Antrag - Drucksache … - wurde
 * … abgelehnt", „Zustimmung zu dem Gesetzentwurf …"). Die Sammelzeile „Die
 * Abstimmungsergebnisse in Übersicht …" bestätigt Empfehlungen, ohne zu sagen,
 * welche — sie bekommt keins.
 */
export function ergebnisOf(beschluss: string | null): Ergebnis[] {
  if (!beschluss || /Abstimmungsergebnisse in Übersicht/.test(beschluss)) return [];
  const found: Ergebnis[] = [];
  if (/abgelehnt|Ablehnung/.test(beschluss)) found.push('abgelehnt');
  if (/angenommen|Annahme|Zustimmung|zugestimmt/.test(beschluss)) found.push('angenommen');
  if (/überwiesen|Überweisung/.test(beschluss)) found.push('überwiesen');
  return sortedErgebnisse(found);
}

/** Wie viel Text der Ortsabgleich einer Drucksache sieht: Kopf und Anfang. */
const REGION_TEXT_CHARS = 4000;

/**
 * Filterfelder, die aus Rednerliste, Beschluss und Text folgen. Eigene
 * Funktion, weil `scripts/backfill-parliament-filters.ts` sie für den Bestand
 * aus der gespeicherten Payload nachrechnet.
 */
export function filterFieldsOf(input: {
  redner: readonly string[];
  beschluss: string | null;
  title: string;
  part: LandtagPart;
  text: string;
}): Record<string, string[]> {
  const speakers = input.redner.map(speakerOf).filter((s) => s !== null);
  // Protokolle über ihren Titel: eine Debatte nennt nebenbei viele Städte.
  const regionText =
    input.part === 'drucksache'
      ? `${input.title}\n${input.text.slice(0, REGION_TEXT_CHARS)}`
      : input.title;
  return {
    speakers: [...new Set(speakers.map((s) => s.name))],
    speaker_party: [...new Set(speakers.map((s) => s.party))],
    ergebnis: ergebnisOf(input.beschluss),
    region: regionsOf(regionText, NRW_REGIONS),
  };
}

export function documentIdOf(entry: Pick<LandtagListEntry, 'recordId'>): string {
  return `ltnrw-${entry.recordId.replace('/', '-')}`;
}

/**
 * Die Drucksache, auf die sich ein Treffer bezieht: „Entschließungsantrag CDU,
 * GRÜNE zu GesEntw LRg Drs 18/14581 …" → `18/14581`. Manche Zeilen lassen das
 * „Drs" weg („zu Antr SPD 18/7709"); die erste Nummer nach „zu" ist es trotzdem.
 */
export function bezugOf(descriptor: string): string | null {
  return /\bzu\s.*?(\d+\/\d+)/.exec(descriptor)?.[1] ?? null;
}

const titleKey = (s: string): string =>
  s
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLocaleLowerCase('de-DE');

/**
 * Kopf vor dem PDF-Text: Titel als Überschrift, dazu was nur in der Datenbank
 * steht — Bezug, Inhaltsangabe, Beschluss mit Abstimmungsergebnis, Redner*innen.
 * Er landet im ersten Chunk, damit die Suche auch diese Angaben trifft.
 *
 * `bezugTitel` ist der Titel der Drucksache aus {@link bezugOf}. Ein
 * Entschließungsantrag trägt meist einen eigenen Titel, beraten wird er aber
 * unter dem Wortlaut des Ursprungs-TOPs. Ohne diese Zeile stand er bei einer
 * Frage zu seinem Thema in 38 von 117 Fällen unter den ersten zehn Dokumenten,
 * mit ihr in 60 (gemessen am Bestand, Oktober 2026). Trägt der Treffer den
 * Bezugstitel schon selbst (Änderungsanträge, Beschlussempfehlungen), entfällt sie.
 */
export function headerTextOf(
  entry: LandtagListEntry,
  part: LandtagPart,
  bezugTitel: string | null
): string {
  const lines = [`# ${entry.title}`, ''];
  const datum = entry.publishedAt ? ` vom ${entry.publishedAt.split('-').reverse().join('.')}` : '';
  lines.push(`${LANDTAG_PART_LABELS[part]} ${entry.documentNumber}${datum} (Landtag NRW)`);
  if (entry.descriptor) lines.push(entry.descriptor);
  if (bezugTitel && titleKey(bezugTitel) !== titleKey(entry.title)) lines.push(`Zu: ${bezugTitel}`);
  if (entry.abstract) lines.push('', entry.abstract);
  if (entry.beschluss) lines.push('', `Beschluss: ${entry.beschluss}`);
  if (entry.redner.length > 0)
    lines.push('', `Redner*innen: ${entry.redner.map(speakerName).join('; ')}`);
  return lines.join('\n');
}

/** Payload-Felder, die jeder Chunk eines Dokuments trägt. */
export function documentPayloadOf(
  entry: LandtagListEntry,
  part: LandtagPart,
  text: string
): Record<string, unknown> {
  const docType = classifyDocType(entry.descriptor);
  const ausschuss = part === 'ausschussprotokoll' ? ausschussOf(entry.trailer) : null;
  return {
    document_id: documentIdOf(entry),
    record_id: entry.recordId,
    title: entry.title,
    source_url: entry.pdfUrl,
    source: LANDTAG_NRW_SOURCE,
    country: 'DE',
    wahlperiode: WAHLPERIODE,
    content_type: part,
    doc_type: docType,
    document_number: entry.documentNumber,
    published_at: entry.publishedAt,
    primary_category: politikfelderOf(entry.systematik),
    subcategories: entry.systematik,
    keywords: entry.schlagworte,
    party: part === 'drucksache' ? urheberOf(entry.descriptor, docType) : [],
    gremium: ausschuss?.gremien ?? [],
    redner: entry.redner.map(speakerName),
    beschluss: entry.beschluss,
    ...filterFieldsOf({
      redner: entry.redner,
      beschluss: entry.beschluss,
      title: entry.title,
      part,
      text,
    }),
  };
}
