/**
 * Reine Abbildung Parlamentsquelle → Einheiten für den geteilten Einheiten-
 * Store (`utils/parentStore.ts`).
 *
 * - Eine **Sitzung** (`nrsitz:{gp}:{n}`) hat je Wortmeldung eine Einheit.
 * - Ein **Gegenstand** (`gegenstand:{gp}:{ityp}:{inr}`) hat je Volltext-Dokument
 *   eine Einheit: Antrag; Gesetzestext und Erläuterungen einer Regierungs-
 *   vorlage; Anfrage und — sobald sie da ist — ihre Beantwortung.
 *
 * Jede Einheit hat ihre eigene `source_url`: die Volltext-Ansicht einer Quelle
 * sucht nach ihr und mischte sonst alle Reden eines Protokolls.
 */
import { v5 as uuidv5 } from 'uuid';

import { PARLAMENT_BASE_URL, type ListRow } from './parlamentClient.js';
import { type ParsedSpeech } from './protokollHtml.js';

import type { ParentDoc } from '../../utils/parentStore.js';

export const PARLAMENT_COLLECTION = 'parlament_at_documents';
export const PARLAMENT_SOURCE = 'parlament-at';

export type AtContentType =
  'rede' | 'antrag' | 'regierungsvorlage' | 'anfrage' | 'anfragebeantwortung';

/** Deterministische Punkt-ID. Ein 32-Bit-Hash kollidiert bei ~10⁵ Punkten schon. */
export function atPointId(documentId: string, chunkIndex: number): string {
  return uuidv5(`${PARLAMENT_BASE_URL}/${documentId}#${chunkIndex}`, uuidv5.URL);
}

export const sitzungParentId = (gp: string, n: number) => `nrsitz:${gp}:${n}`;
export const gegenstandParentId = (gp: string, ityp: string, inr: string) =>
  `gegenstand:${gp}:${ityp}:${inr}`;

export interface SitzungMeta {
  gp: string;
  n: number;
  /** ISO-Datum der Sitzung. */
  datum: string | null;
}

/**
 * Eine Wortmeldung samt dem HTML, in dem sie steht — das Stenographische
 * Protokoll der Sitzung oder, solange es fehlt, ihr Einzelprotokoll.
 */
export type SitzungSpeech = ParsedSpeech & { documentPath: string };

/** Hashes, über die der Scraper unveränderte Quellen erkennt — stehen in jedem Punkt. */
export interface ParentHashes {
  contentHash: string;
  rowHash: string | null;
}

export function buildSitzungParent(
  meta: SitzungMeta,
  speeches: readonly SitzungSpeech[],
  governmentParty: (personId: string | null) => string | null,
  hashes: ParentHashes
): ParentDoc {
  const sitzung = `${meta.n}. Sitzung des Nationalrats`;
  const datum = formatDatum(meta.datum);
  return {
    parentId: sitzungParentId(meta.gp, meta.n),
    units: speeches.map((s, i) => {
      const party = s.party ?? (s.isGovernment ? governmentParty(s.personId) : null);
      return {
        documentId: `rede:${meta.gp}:${meta.n}:${i}`,
        title: `Rede von ${s.speaker}${party ? ` (${party})` : ''} – ${sitzung}${datum ? `, ${datum}` : ''}`,
        headingPath: [`${sitzung} (${meta.gp}. GP)`, ...(s.agenda ? [s.agenda] : []), s.speaker],
        text: s.text,
        sourceUrl: `${PARLAMENT_BASE_URL}${s.documentPath}#${s.anchor ?? `rede-${i + 1}`}`,
        payload: {
          ...hashPayload(hashes),
          content_type: 'rede' satisfies AtContentType,
          party: party ? [party] : [],
          wahlperiode: meta.gp,
          speaker: s.speaker,
          person_id: s.personId,
          is_government: s.isGovernment,
          section_type: s.role,
          doc_type: null,
          primary_category: [],
          ministerium: null,
          zitation: `${meta.n}/NRSITZ`,
          published_at: meta.datum,
        },
      };
    }),
  };
}

export interface GegenstandPart {
  contentType: AtContentType;
  /** Titel des Dokuments auf der Geschichtsseite („Erläuterungen", „Anfragebeantwortung"). */
  title: string;
  path: string;
  text: string;
  party: string[];
  /** Für die Beantwortung: wer geantwortet hat. */
  speaker?: string | null;
  publishedAt: string | null;
}

export interface GegenstandMeta {
  row: ListRow;
  ministerium: string | null;
}

export function buildGegenstandParent(
  meta: GegenstandMeta,
  parts: readonly GegenstandPart[],
  hashes: ParentHashes
): ParentDoc {
  const { row } = meta;
  return {
    parentId: gegenstandParentId(row.gp, row.ityp, row.inr),
    units: parts.map((part, i) => ({
      documentId: `${row.gp}:${row.ityp}:${row.inr}:${i}`,
      title: row.title,
      headingPath: [`${row.zitation} (${row.gp}. GP)`, part.title],
      text: part.text,
      sourceUrl: `${PARLAMENT_BASE_URL}${part.path}`,
      payload: {
        ...hashPayload(hashes),
        content_type: part.contentType,
        party: part.party,
        wahlperiode: row.gp,
        speaker: part.speaker ?? null,
        person_id: null,
        is_government:
          part.contentType === 'regierungsvorlage' || part.contentType === 'anfragebeantwortung',
        section_type: part.title,
        doc_type: row.doktypLang || null,
        primary_category: row.themen,
        ministerium: meta.ministerium,
        zitation: row.zitation,
        gegenstand_url: `${PARLAMENT_BASE_URL}${row.hisUrl}`,
        published_at: part.publishedAt ?? row.datum,
      },
    })),
  };
}

function hashPayload(hashes: ParentHashes): Record<string, unknown> {
  return { content_hash: hashes.contentHash, row_hash: hashes.rowHash };
}

function formatDatum(datum: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(datum ?? '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}
