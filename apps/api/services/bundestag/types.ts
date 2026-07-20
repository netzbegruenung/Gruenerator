/**
 * Type definitions for Bundestag Services
 */
import {
  type BtPerson,
  type BtAktivitaet,
  type BtSpeech,
  type BtDrucksache,
  type BtVorgang,
  type BtSemanticHit,
} from './schemas.js';

/**
 * Pattern for person name detection
 */
export interface PersonPattern {
  type: 'explicit' | 'activity_query' | 'action_query' | 'who_is' | 'title' | 'direct_name';
  re: RegExp;
  nameGroup: number;
}

/**
 * Person role within Bundestag
 */
export interface PersonRole {
  fraktion?: string | undefined;
  rolle?: string | undefined;
  von?: string | undefined;
  bis?: string | undefined;
}

/**
 * Person/MP information
 */
export interface Person {
  id?: string | undefined;
  vorname: string;
  nachname: string;
  titel?: string | undefined;
  fraktion?: string | string[] | undefined;
  wahlkreis?: string | undefined;
  biografie?: string | undefined;
  person_roles?: PersonRole[] | undefined;
  [key: string]: unknown;
}

/**
 * Person detection result
 */
export interface PersonDetectionResult {
  detected: boolean;
  person?: Person | undefined;
  confidence: number;
  source?: 'cache' | 'api' | 'cache_weak' | undefined;
  extractedName?: string | undefined;
}

/**
 * Search parameters for person search
 */
export interface PersonSearchParams {
  query?: string | undefined;
  fraktion?: string | undefined;
  wahlperiode?: number | undefined;
  limit?: number | undefined;
}

/**
 * Person search result from MCP
 */
export interface PersonSearchResult {
  documents: Person[];
  total?: number | undefined;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  size: number;
  lastUpdated: string | null;
  ttlRemaining: number;
}

/**
 * Drucksachen (document) search parameters
 */
export interface DrucksachenSearchParams {
  query?: string | undefined;
  urheber?: string | undefined;
  drucksachetyp?: string | undefined;
  wahlperiode?: number | undefined;
  limit?: number | undefined;
}

/**
 * Activities search parameters
 */
export interface AktivitaetenSearchParams {
  person_id?: string | number | undefined;
  aktivitaetsart?: string | undefined;
  wahlperiode?: number | undefined;
  limit?: number | undefined;
}

/**
 * Generic search result structure from MCP
 */
export interface SearchResult {
  documents?: Record<string, unknown>[] | undefined;
  results?: Record<string, unknown>[] | undefined;
  [key: string]: unknown;
}

/**
 * Options for enriched person search
 */
export interface EnrichedSearchOptions {
  contentLimit?: number | undefined;
  drucksachenLimit?: number | undefined;
  aktivitaetenLimit?: number | undefined;
}

/**
 * Combined person profile with DIP details
 */
export interface PersonProfile {
  id?: string | undefined;
  vorname: string;
  nachname: string;
  name: string;
  titel?: string | undefined;
  fraktion?: string | string[] | undefined;
  wahlkreis?: string | undefined;
  geburtsdatum?: string | undefined;
  geburtsort?: string | undefined;
  beruf?: string | undefined;
  biografie?: string | undefined;
  vita?: string | undefined;
  wahlperioden?: Record<string, unknown>[] | undefined;
  source: string;
}

/**
 * Formatted content mention from bundestag_content
 */
export interface ContentMention {
  title: string;
  url?: string | undefined;
  snippet: string;
  similarity: number;
  searchMethod?: string | undefined;
  category?: string | undefined;
  publishedAt?: string | undefined;
  source: string;
}

/**
 * Formatted Drucksache document
 */
export interface FormattedDrucksache {
  id?: string | undefined;
  dokumentnummer?: string | undefined;
  titel?: string | undefined;
  drucksachetyp?: string | undefined;
  datum?: string | undefined;
  wahlperiode?: number | undefined;
  urheber?: string | undefined;
  fundstelle?: string | undefined;
  source: string;
}

/**
 * Formatted Aktivität
 */
export interface FormattedAktivitaet {
  id?: string | undefined;
  aktivitaetsart?: string | undefined;
  titel?: string | undefined;
  datum?: string | undefined;
  wahlperiode?: number | undefined;
  vorgangsbezug?: Record<string, unknown> | undefined;
  source: string;
}

/**
 * Enriched person search result
 */
export interface EnrichedPersonSearchResult {
  isPersonQuery: boolean;
  person?: PersonProfile | undefined;
  contentMentions?: ContentMention[] | undefined;
  drucksachen?: FormattedDrucksache[] | undefined;
  aktivitaeten?: FormattedAktivitaet[] | undefined;
  metadata?: {
    query: string;
    extractedName?: string | undefined;
    detectionConfidence: number;
    detectionSource?: string | undefined;
    contentMentionsCount: number;
    drucksachenCount: number;
    aktivitaetenCount: number;
    fetchTimeMs: number;
  };
}

// ── Enriched chat result (BundestagEnrichedService) ──────────────────────────
export {
  type BtPerson,
  type BtAktivitaet,
  type BtSpeech,
  type BtDrucksache,
  type BtVorgang,
  type BtSemanticHit,
} from './schemas.js';

/**
 * Discriminated on `kind`:
 *  - 'person'   → a specific MP was resolved (profile + activities + speeches)
 *  - 'document' → an explicit Drucksache number was asked about
 *  - 'topic'    → default: semantic hits + matching speeches for a subject
 *  - 'none'     → nothing resolvable; caller falls back to a graceful message
 */
export interface BtEnrichedResult {
  kind: 'person' | 'document' | 'topic' | 'none';
  person?: { person: BtPerson; aktivitaeten: BtAktivitaet[]; speeches: BtSpeech[] };
  document?: { drucksache: BtDrucksache; siblings: BtDrucksache[]; vorgang: BtVorgang | null };
  /** `documents`/`vorgaenge` come from the raw DIP title search — the fallback
   *  when the semantic layer returns nothing (e.g. vector backend down). */
  topic?: {
    hits: BtSemanticHit[];
    speeches: BtSpeech[];
    documents: BtDrucksache[];
    vorgaenge: BtVorgang[];
  };
  /** Human-readable "+N weitere" / fallback disclosures (no silent caps). */
  notes: string[];
  metadata: {
    query: string;
    extractedName: string | null;
    matchedDokumentnummer: string | null;
    fetchTimeMs: number;
  };
}
