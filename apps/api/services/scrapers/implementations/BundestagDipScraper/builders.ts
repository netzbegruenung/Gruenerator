/**
 * Reine Abbildung DIP-Dokument → Einheiten (eine Rede bzw. ein Drucksachen-
 * Abschnitt) → Qdrant-Punkte. Scraper und einmaliger Import aus Bundestag
 * Wrapped laufen beide hier durch; nur so tragen ihre Punkte dieselben IDs und
 * dasselbe Payload, und der Scraper erkennt importierte Dokumente wieder.
 *
 * Warum die Einheit und nicht das ganze Dokument die `document_id` trägt: die
 * Facetten zählen nur Punkte mit `chunk_index = 0` (`getFacetCountFilter`). Wäre
 * eine Drucksache ein Dokument, sähe die Abschnitts-Facette nur den ersten
 * Abschnitt jeder Drucksache. `parent_id` hält die Einheiten eines DIP-Dokuments
 * zusammen — für Änderungserkennung und Löschen.
 */
import { v5 as uuidv5 } from 'uuid';

import { type ParsedSection } from './drucksacheParser.js';
import { partiesFromHeader, partiesFromUrheber } from './factions.js';
import { type ParsedSpeech } from './protokollParser.js';

export type DipContentType = 'rede' | 'drucksache';

export interface DipUnit {
  documentId: string;
  contentType: DipContentType;
  title: string;
  headingPath: string[];
  text: string;
  sourceUrl: string;
  publishedAt: string | null;
  wahlperiode: string | null;
  dokumentnummer: string;
  party: string[];
  speaker: string | null;
  isGovernment: boolean;
  drucksachetyp: string | null;
  urheber: string[];
  sectionType: string | null;
}

export interface DipParent {
  parentId: string;
  /** Hash über den DIP-Volltext; `null` für importierte Dokumente (unbekannt). */
  contentHash: string | null;
  units: DipUnit[];
}

export interface ProtokollMeta {
  id: string;
  dokumentnummer: string;
  wahlperiode: number | null;
  datum: string | null;
  pdfUrl?: string | null;
}

export interface DrucksacheMeta {
  id: string;
  dokumentnummer: string;
  drucksachetyp: string;
  wahlperiode: number | null;
  datum: string | null;
  titel: string;
  urheber: string[];
  /** Anfang des Volltexts — Fraktion, solange DIP `urheber` noch nicht gefüllt hat. */
  headerText?: string;
  pdfUrl?: string | null;
}

export const protokollParentId = (id: string) => `protokoll:${id}`;
export const drucksacheParentId = (id: string) => `drucksache:${id}`;

/** Deterministische Punkt-ID. Ein 32-Bit-Hash kollidiert bei ~10⁵ Punkten schon. */
export function dipPointId(documentId: string, chunkIndex: number): string {
  return uuidv5(`https://dip.bundestag.de/${documentId}#${chunkIndex}`, uuidv5.URL);
}

function splitNummer(dokumentnummer: string): { wp: string; nr: string } | null {
  const m = /^(\d+)\/(\d+)$/.exec(dokumentnummer.trim());
  return m ? { wp: m[1], nr: m[2] } : null;
}

/** dserver-PDF eines Plenarprotokolls: 21/90 → btp/21/21090.pdf */
export function protokollPdfUrl(dokumentnummer: string): string {
  const n = splitNummer(dokumentnummer);
  if (!n) return 'https://dip.bundestag.de';
  return `https://dserver.bundestag.de/btp/${n.wp}/${n.wp}${n.nr.padStart(3, '0')}.pdf`;
}

/** dserver-PDF einer Drucksache: 21/4268 → btd/21/042/2104268.pdf */
export function drucksachePdfUrl(dokumentnummer: string): string {
  const n = splitNummer(dokumentnummer);
  if (!n) return 'https://dip.bundestag.de';
  const nr = n.nr.padStart(5, '0');
  return `https://dserver.bundestag.de/btd/${n.wp}/${nr.slice(0, 3)}/${n.wp}${nr}.pdf`;
}

function formatDatum(datum: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(datum ?? '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

export function buildProtokollParent(
  meta: ProtokollMeta,
  speeches: readonly ParsedSpeech[],
  contentHash: string | null
): DipParent {
  const datum = formatDatum(meta.datum);
  const protokoll = `Plenarprotokoll ${meta.dokumentnummer}`;
  const sourceUrl = meta.pdfUrl || protokollPdfUrl(meta.dokumentnummer);
  return {
    parentId: protokollParentId(meta.id),
    contentHash,
    units: speeches.map((s, i) => ({
      documentId: `rede:${meta.id}:${i}`,
      // Je Einheit eine eigene URL: die Volltext-Ansicht einer Quelle sucht nach
      // `source_url` und mischte sonst alle Reden des Protokolls.
      sourceUrl: `${sourceUrl}#rede-${i + 1}`,
      contentType: 'rede',
      title: `Rede von ${s.speaker}${s.party ? ` (${s.party})` : ''} – ${protokoll}${datum ? `, ${datum}` : ''}`,
      headingPath: [protokoll, s.speaker],
      text: s.text,
      publishedAt: meta.datum,
      wahlperiode: meta.wahlperiode != null ? String(meta.wahlperiode) : null,
      dokumentnummer: meta.dokumentnummer,
      party: s.party ? [s.party] : [],
      speaker: s.speaker,
      isGovernment: s.isGovernment,
      drucksachetyp: null,
      urheber: [],
      sectionType: s.speechType,
    })),
  };
}

export function buildDrucksacheParent(
  meta: DrucksacheMeta,
  sections: readonly ParsedSection[],
  contentHash: string | null
): DipParent {
  const sourceUrl = meta.pdfUrl || drucksachePdfUrl(meta.dokumentnummer);
  const fromUrheber = partiesFromUrheber(meta.urheber);
  const party = fromUrheber.length > 0 ? fromUrheber : partiesFromHeader(meta.headerText ?? '');
  return {
    parentId: drucksacheParentId(meta.id),
    contentHash,
    units: sections.map((s, i) => ({
      documentId: `drucksache:${meta.id}:${i}`,
      sourceUrl: `${sourceUrl}#abschnitt-${i + 1}`,
      contentType: 'drucksache',
      title: meta.titel,
      headingPath: [`${meta.drucksachetyp} ${meta.dokumentnummer}`, s.title],
      text: s.text,
      publishedAt: meta.datum,
      wahlperiode: meta.wahlperiode != null ? String(meta.wahlperiode) : null,
      dokumentnummer: meta.dokumentnummer,
      party,
      speaker: null,
      isGovernment: false,
      drucksachetyp: meta.drucksachetyp,
      urheber: meta.urheber,
      sectionType: s.sectionType,
    })),
  };
}

/** Facetten- und Anzeigefelder einer Einheit, wie sie in jedem ihrer Punkte stehen. */
export function unitPayload(unit: DipUnit, parent: DipParent): Record<string, unknown> {
  return {
    document_id: unit.documentId,
    parent_id: parent.parentId,
    content_hash: parent.contentHash,
    content_type: unit.contentType,
    title: unit.title,
    source_url: unit.sourceUrl,
    published_at: unit.publishedAt,
    wahlperiode: unit.wahlperiode,
    dokumentnummer: unit.dokumentnummer,
    party: unit.party,
    speaker: unit.speaker,
    is_government: unit.isGovernment,
    drucksachetyp: unit.drucksachetyp,
    urheber: unit.urheber,
    section_type: unit.sectionType,
    source: 'bundestag-dip',
  };
}
