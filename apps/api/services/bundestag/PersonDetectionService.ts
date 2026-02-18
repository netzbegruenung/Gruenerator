/**
 * PersonDetectionService
 * Detects when a query is about a specific German MP (Abgeordneter)
 * Uses pattern matching, cached MP list, and DIP API validation
 */

import { getBundestagMCPClient } from './BundestagMCPClient.js';

import type {
  Person,
  PersonDetectionResult,
  PersonPattern,
  PersonSearchParams,
  PersonSearchResult,
  CacheStats,
} from './types.js';

// MP cache: normalizedName -> person object
const mpCache = new Map<string, Person>();
let cacheLastUpdated = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Patterns that indicate person-related queries
const PERSON_PATTERNS: PersonPattern[] = [
  // "Abgeordneter/Abgeordnete Name" or "MdB Name"
  {
    type: 'explicit',
    re: /\b(?:abgeordnete[r]?|mdb)\s+([A-ZÄÖÜ][a-zäöüß]+(?:[\s-][A-ZÄÖÜ][a-zäöüß]+){0,2})\b/i,
    nameGroup: 1,
  },
  // "Anträge/Reden/Anfragen von/durch Name"
  {
    type: 'activity_query',
    re: /\b(?:anträge?|reden?|anfragen?|aktivitäten?|abstimmungen?)\s+(?:von|durch|des|der)\s+([A-ZÄÖÜ][a-zäöüß]+(?:[\s-][A-ZÄÖÜ][a-zäöüß]+){0,2})\b/i,
    nameGroup: 1,
  },
  // "Was hat Name gemacht/beantragt/gesagt"
  {
    type: 'action_query',
    re: /\b(?:was\s+hat|wie\s+hat|hat)\s+([A-ZÄÖÜ][a-zäöüß]+(?:[\s-][A-ZÄÖÜ][a-zäöüß]+){0,2})\s+(?:gemacht|beantragt|gesagt|gefordert|vorgeschlagen|abgestimmt)/i,
    nameGroup: 1,
  },
  // "Wer ist Name"
  {
    type: 'who_is',
    re: /\bwer\s+ist\s+([A-ZÄÖÜ][a-zäöüß]+(?:[\s-][A-ZÄÖÜ][a-zäöüß]+){0,2})\b/i,
    nameGroup: 1,
  },
  // Title prefix: "Dr./Prof. Name"
  {
    type: 'title',
    re: /\b(?:Dr\.|Prof\.)\s+([A-ZÄÖÜ][a-zäöüß]+(?:[\s-][A-ZÄÖÜ][a-zäöüß]+){0,2})\b/i,
    nameGroup: 1,
  },
  // Direct name at start with context words
  {
    type: 'direct_name',
    re: /^([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+){1,2})(?:\s+(?:grüne?|bundestag|fraktion|partei|politik)|\s*$)/i,
    nameGroup: 1,
  },
];

// Well-known Green MPs for quick detection (subset, cache will have full list)
const KNOWN_GREEN_MPS = [
  'Ricarda Lang',
  'Omid Nouripour',
  'Robert Habeck',
  'Annalena Baerbock',
  'Katrin Göring-Eckardt',
  'Anton Hofreiter',
  'Britta Haßelmann',
  'Cem Özdemir',
  'Steffi Lemke',
  'Lisa Badum',
  'Katharina Dröge',
];

export class PersonDetectionService {
  private mcpClient: any;

  constructor() {
    this.mcpClient = getBundestagMCPClient();
  }

  /**
   * Detect if query is about a specific MP
   * @param query - User query
   * @returns Detection result with person information
   */
  async detectPerson(query: string): Promise<PersonDetectionResult> {
    const trimmed = (query || '').trim();
    if (!trimmed || trimmed.length < 3) {
      return { detected: false, confidence: 0 };
    }

    // Extract potential name from query
    const extractedName = this.extractNameFromQuery(trimmed);
    if (!extractedName) {
      return { detected: false, confidence: 0 };
    }

    console.log(
      `[PersonDetection] Extracted name: "${extractedName}" from query: "${trimmed.substring(0, 50)}..."`
    );

    // Try cache lookup first
    await this.ensureCachePopulated();
    const cachedMatch = this.findMatchingMP(extractedName);

    if (cachedMatch && cachedMatch.confidence >= 0.85) {
      console.log(
        `[PersonDetection] Cache hit: ${cachedMatch.person.titel || ''} ${cachedMatch.person.vorname} ${cachedMatch.person.nachname} (${cachedMatch.confidence.toFixed(2)})`
      );
      return {
        detected: true,
        person: cachedMatch.person,
        confidence: cachedMatch.confidence,
        source: 'cache',
        extractedName,
      };
    }

    // Fallback: Query bundestag-mcp for person search
    try {
      const result: PersonSearchResult = await this.mcpClient.searchPersonen({
        query: extractedName,
        fraktion: 'GRÜNE',
        limit: 5,
      });

      if (result.documents && result.documents.length > 0) {
        const bestMatch = result.documents[0];
        const fullName = `${bestMatch.vorname} ${bestMatch.nachname}`;
        const confidence = this.calculateNameSimilarity(extractedName, fullName);

        if (confidence >= 0.7) {
          // Cache the newly found MP
          const cacheKey = this.normalizeForCache(fullName);
          mpCache.set(cacheKey, bestMatch);

          console.log(`[PersonDetection] API match: ${fullName} (${confidence.toFixed(2)})`);
          return {
            detected: true,
            person: bestMatch,
            confidence,
            source: 'api',
            extractedName,
          };
        }
      }
    } catch (error: any) {
      console.error('[PersonDetection] API search failed:', error.message);
    }

    // Weak cache match (0.7-0.85) as last resort
    if (cachedMatch && cachedMatch.confidence >= 0.7) {
      console.log(
        `[PersonDetection] Weak cache match: ${cachedMatch.person.vorname} ${cachedMatch.person.nachname} (${cachedMatch.confidence.toFixed(2)})`
      );
      return {
        detected: true,
        person: cachedMatch.person,
        confidence: cachedMatch.confidence,
        source: 'cache_weak',
        extractedName,
      };
    }

    return { detected: false, confidence: 0, extractedName };
  }

  /**
   * Extract potential person name from query
   */
  extractNameFromQuery(query: string): string | null {
    // Try each pattern
    for (const pattern of PERSON_PATTERNS) {
      const match = query.match(pattern.re);
      if (match && match[pattern.nameGroup]) {
        const name = match[pattern.nameGroup].trim();
        // Name should have at least 2 characters and not be a common word
        if (name.length >= 2 && !this.isCommonWord(name)) {
          return name;
        }
      }
    }

    // Check for known MPs directly mentioned in query
    for (const knownName of KNOWN_GREEN_MPS) {
      if (query.toLowerCase().includes(knownName.toLowerCase())) {
        return knownName;
      }
    }

    return null;
  }

  /**
   * Check if word is a common German word (not a name)
   */
  isCommonWord(word: string): boolean {
    const commonWords = new Set([
      'der',
      'die',
      'das',
      'und',
      'oder',
      'aber',
      'wie',
      'was',
      'wer',
      'grüne',
      'grünen',
      'partei',
      'bundestag',
      'fraktion',
      'antrag',
      'politik',
      'deutschland',
      'berlin',
      'thema',
      'frage',
    ]);
    return commonWords.has(word.toLowerCase());
  }

  /**
   * Check if person is from Grüne faction
   */
  private _isGrueneFraktion(person: Person): boolean {
    const gruenePatterns = ['GRÜNE', 'BÜNDNIS 90/DIE GRÜNEN', 'B90/GRÜNE'];

    // Check direct fraktion field (can be array or string)
    const fraktion = person.fraktion;
    if (fraktion) {
      const fraktionArray = Array.isArray(fraktion) ? fraktion : [fraktion];
      if (fraktionArray.some((f) => gruenePatterns.some((p) => f.includes(p)))) {
        return true;
      }
    }

    // Check nested person_roles
    if (person.person_roles && Array.isArray(person.person_roles)) {
      for (const role of person.person_roles) {
        if (role.fraktion && gruenePatterns.some((p) => role.fraktion!.includes(p))) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Find matching MP in cache using fuzzy matching
   */
  findMatchingMP(name: string): { person: Person; confidence: number } | null {
    const normalizedSearch = this.normalizeForCache(name);

    // Exact match first
    if (mpCache.has(normalizedSearch)) {
      return { person: mpCache.get(normalizedSearch)!, confidence: 1.0 };
    }

    // Fuzzy match
    let bestMatch: Person | null = null;
    let bestSimilarity = 0;

    for (const [cachedName, person] of mpCache.entries()) {
      const similarity = this.calculateNameSimilarity(normalizedSearch, cachedName);
      if (similarity > bestSimilarity && similarity >= 0.7) {
        bestSimilarity = similarity;
        bestMatch = person;
      }
    }

    return bestMatch ? { person: bestMatch, confidence: bestSimilarity } : null;
  }

  /**
   * Calculate similarity between two names
   */
  calculateNameSimilarity(name1: string, name2: string): number {
    const n1 = this.normalizeForCache(name1);
    const n2 = this.normalizeForCache(name2);

    // Check if one contains the other (partial match)
    if (n1.includes(n2) || n2.includes(n1)) {
      const shorter = n1.length < n2.length ? n1 : n2;
      const longer = n1.length >= n2.length ? n1 : n2;
      return (shorter.length / longer.length) * 0.95; // Partial match penalty
    }

    // Levenshtein distance
    const maxLen = Math.max(n1.length, n2.length);
    if (maxLen === 0) return 1.0;

    const distance = this.levenshteinDistance(n1, n2);
    return 1 - distance / maxLen;
  }

  /**
   * Levenshtein distance calculation
   */
  levenshteinDistance(s1: string, s2: string): number {
    const m = s1.length;
    const n = s2.length;
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1, // deletion
          dp[i][j - 1] + 1, // insertion
          dp[i - 1][j - 1] + cost // substitution
        );
      }
    }
    return dp[m][n];
  }

  /**
   * Normalize name for cache lookup
   */
  normalizeForCache(name: string): string {
    return (name || '')
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Ensure MP cache is populated
   */
  async ensureCachePopulated(): Promise<void> {
    const now = Date.now();
    if (mpCache.size > 0 && now - cacheLastUpdated < CACHE_TTL) {
      return;
    }

    await this.refreshMPCache();
  }

  /**
   * Refresh MP cache from bundestag-mcp
   */
  async refreshMPCache(): Promise<void> {
    try {
      console.log('[PersonDetection] Refreshing MP cache...');

      const result: PersonSearchResult = await this.mcpClient.searchPersonen({
        fraktion: 'GRÜNE',
        wahlperiode: 20,
        limit: 100,
      });

      if (result.documents && result.documents.length > 0) {
        mpCache.clear();

        // First add known MPs to ensure they're in cache
        for (const name of KNOWN_GREEN_MPS) {
          const normalized = this.normalizeForCache(name);
          const [vorname, ...rest] = name.split(' ');
          mpCache.set(normalized, { vorname, nachname: rest.join(' '), fraktion: 'GRÜNE' });
        }

        // Then add from API, filtering to GRÜNE only
        for (const person of result.documents) {
          const isGruene = this._isGrueneFraktion(person);
          if (!isGruene) continue;

          const fullName = `${person.vorname} ${person.nachname}`;
          const normalizedName = this.normalizeForCache(fullName);
          mpCache.set(normalizedName, person);

          // Also cache by last name only for common queries
          const lastName = this.normalizeForCache(person.nachname);
          if (!mpCache.has(lastName)) {
            mpCache.set(lastName, person);
          }
        }
        cacheLastUpdated = Date.now();
        console.log(`[PersonDetection] Cached ${mpCache.size} entries for Green MPs`);
      }
    } catch (error: any) {
      console.error('[PersonDetection] Failed to refresh MP cache:', error.message);
      // Populate with known MPs as fallback
      for (const name of KNOWN_GREEN_MPS) {
        const normalized = this.normalizeForCache(name);
        if (!mpCache.has(normalized)) {
          const [vorname, ...rest] = name.split(' ');
          mpCache.set(normalized, { vorname, nachname: rest.join(' '), fraktion: 'GRÜNE' });
        }
      }
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    return {
      size: mpCache.size,
      lastUpdated: cacheLastUpdated ? new Date(cacheLastUpdated).toISOString() : null,
      ttlRemaining: cacheLastUpdated ? Math.max(0, CACHE_TTL - (Date.now() - cacheLastUpdated)) : 0,
    };
  }
}

// Singleton
let serviceInstance: PersonDetectionService | null = null;

export function getPersonDetectionService(): PersonDetectionService {
  if (!serviceInstance) {
    serviceInstance = new PersonDetectionService();
  }
  return serviceInstance;
}
