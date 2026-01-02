/**
 * Type definitions for Bundestag Services
 */

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
  fraktion?: string;
  rolle?: string;
  von?: string;
  bis?: string;
}

/**
 * Person/MP information
 */
export interface Person {
  id?: string;
  vorname: string;
  nachname: string;
  titel?: string;
  fraktion?: string | string[];
  wahlkreis?: string;
  biografie?: string;
  person_roles?: PersonRole[];
  [key: string]: any;
}

/**
 * Person detection result
 */
export interface PersonDetectionResult {
  detected: boolean;
  person?: Person;
  confidence: number;
  source?: 'cache' | 'api' | 'cache_weak';
  extractedName?: string;
}

/**
 * Search parameters for person search
 */
export interface PersonSearchParams {
  query?: string;
  fraktion?: string;
  wahlperiode?: number;
  limit?: number;
}

/**
 * Person search result from MCP
 */
export interface PersonSearchResult {
  documents: Person[];
  total?: number;
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
  query?: string;
  urheber?: string;
  drucksachetyp?: string;
  wahlperiode?: number;
  limit?: number;
}

/**
 * Activities search parameters
 */
export interface AktivitaetenSearchParams {
  person_id?: string | number;
  aktivitaetsart?: string;
  wahlperiode?: number;
  limit?: number;
}

/**
 * Generic search result structure from MCP
 */
export interface SearchResult {
  documents?: any[];
  results?: any[];
  [key: string]: any;
}

/**
 * Options for enriched person search
 */
export interface EnrichedSearchOptions {
  contentLimit?: number;
  drucksachenLimit?: number;
  aktivitaetenLimit?: number;
}

/**
 * Combined person profile with DIP details
 */
export interface PersonProfile {
  id?: string;
  vorname: string;
  nachname: string;
  name: string;
  titel?: string;
  fraktion?: string | string[];
  wahlkreis?: string;
  geburtsdatum?: string;
  geburtsort?: string;
  beruf?: string;
  biografie?: string;
  vita?: string;
  wahlperioden?: any[];
  source: string;
}

/**
 * Formatted content mention from bundestag_content
 */
export interface ContentMention {
  title: string;
  url?: string;
  snippet: string;
  similarity: number;
  searchMethod?: string;
  category?: string;
  publishedAt?: string;
  source: string;
}

/**
 * Formatted Drucksache document
 */
export interface FormattedDrucksache {
  id?: string;
  dokumentnummer?: string;
  titel?: string;
  drucksachetyp?: string;
  datum?: string;
  wahlperiode?: number;
  urheber?: string;
  fundstelle?: string;
  source: string;
}

/**
 * Formatted Aktivität
 */
export interface FormattedAktivitaet {
  id?: string;
  aktivitaetsart?: string;
  titel?: string;
  datum?: string;
  wahlperiode?: number;
  vorgangsbezug?: any;
  source: string;
}

/**
 * Enriched person search result
 */
export interface EnrichedPersonSearchResult {
  isPersonQuery: boolean;
  person?: PersonProfile;
  contentMentions?: ContentMention[];
  drucksachen?: FormattedDrucksache[];
  aktivitaeten?: FormattedAktivitaet[];
  metadata?: {
    query: string;
    extractedName?: string;
    detectionConfidence: number;
    detectionSource?: string;
    contentMentionsCount: number;
    drucksachenCount: number;
    aktivitaetenCount: number;
    fetchTimeMs: number;
  };
}
