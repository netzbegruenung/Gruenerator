/**
 * EnrichedPersonSearchService
 * Orchestrates multi-source search when a person (Abgeordneter) is detected
 *
 * Data sources:
 * 1. DIP Person API - Official profile data
 * 2. bundestag_content (Qdrant) - Vectored mentions from gruene-bundestag.de
 * 3. DIP Drucksachen - Anträge where MP is author
 * 4. DIP Aktivitäten - Speeches, questions, activities
 */

import { getPersonDetectionService } from './PersonDetectionService.js';
import { getBundestagMCPClient, type BundestagMCPClient } from './BundestagMCPClient.js';
import { getQdrantInstance } from '../../database/services/QdrantService.js';
import MistralEmbeddingClient from '../mistral/MistralEmbeddingService/MistralEmbeddingClient.js';
import type {
  Person,
  SearchResult,
  EnrichedSearchOptions,
  PersonProfile,
  ContentMention,
  FormattedDrucksache,
  FormattedAktivitaet,
  EnrichedPersonSearchResult
} from './types.js';

interface QdrantSearchResult {
  id: string | number;
  score?: number;
  payload?: Record<string, any>;
  searchMethod?: string;
}

interface QdrantScrollResult {
  points?: Array<{
    id: string | number;
    payload?: Record<string, any>;
  }>;
}

export class EnrichedPersonSearchService {
  private personDetection: ReturnType<typeof getPersonDetectionService>;
  private mcpClient: BundestagMCPClient;
  private qdrant: ReturnType<typeof getQdrantInstance>;
  private embeddingClient: MistralEmbeddingClient;

  constructor() {
    this.personDetection = getPersonDetectionService();
    this.mcpClient = getBundestagMCPClient();
    this.qdrant = getQdrantInstance();
    this.embeddingClient = new MistralEmbeddingClient();
  }

  /**
   * Main entry point: detect person and fetch enriched results
   * @param query - User query
   * @param options - Search options
   * @returns Enriched search result or null if not a person query
   */
  async search(query: string, options: EnrichedSearchOptions = {}): Promise<EnrichedPersonSearchResult> {
    // Step 1: Detect if this is a person query
    const detection = await this.personDetection.detectPerson(query);

    if (!detection.detected || !detection.person) {
      return { isPersonQuery: false };
    }

    const person = detection.person;
    const personName = `${person.vorname} ${person.nachname}`;

    console.log(`[EnrichedPersonSearch] Detected MP: ${personName} (confidence: ${detection.confidence.toFixed(2)})`);

    // Step 2: Parallel fetch from all sources
    const startTime = Date.now();
    const [personDetails, contentMentions, drucksachen, aktivitaeten] = await Promise.all([
      this._fetchPersonDetails(person.id),
      this._searchBundestagContent(personName, options.contentLimit || 15),
      this._searchDrucksachen(personName, options.drucksachenLimit || 20),
      this._searchAktivitaeten(person.id, options.aktivitaetenLimit || 30)
    ]);

    const elapsed = Date.now() - startTime;
    console.log(`[EnrichedPersonSearch] Fetched all sources in ${elapsed}ms`);

    // Step 3: Build enriched result
    return {
      isPersonQuery: true,
      person: this._buildPersonProfile(person, personDetails),
      contentMentions: this._formatContentMentions(contentMentions),
      drucksachen: this._formatDrucksachen(drucksachen),
      aktivitaeten: this._formatAktivitaeten(aktivitaeten),
      metadata: {
        query,
        extractedName: detection.extractedName,
        detectionConfidence: detection.confidence,
        detectionSource: detection.source,
        contentMentionsCount: contentMentions?.length || 0,
        drucksachenCount: drucksachen?.documents?.length || 0,
        aktivitaetenCount: aktivitaeten?.documents?.length || 0,
        fetchTimeMs: elapsed
      }
    };
  }

  /**
   * Fetch detailed person profile from DIP
   */
  private async _fetchPersonDetails(personId?: string): Promise<SearchResult | null> {
    if (!personId) return null;

    try {
      const result = await this.mcpClient.getPerson(personId);
      return result;
    } catch (error: any) {
      console.error('[EnrichedPersonSearch] Failed to fetch person details:', error.message);
      return null;
    }
  }

  /**
   * Search bundestag_content Qdrant collection for mentions
   */
  private async _searchBundestagContent(personName: string, limit: number = 15): Promise<QdrantSearchResult[]> {
    try {
      const embedding = await this.embeddingClient.generateEmbedding(personName);
      if (!embedding) {
        console.warn('[EnrichedPersonSearch] Failed to create embedding for person name');
        return [];
      }

      // Hybrid search in bundestag_content
      const searchResults: QdrantSearchResult[] = (await this.qdrant.client?.search('bundestag_content', {
        vector: embedding,
        limit: limit * 2,
        with_payload: true,
        score_threshold: 0.3
      }) ?? []) as QdrantSearchResult[];

      // Also do text search for exact name matches
      const textResults: QdrantScrollResult = (await this.qdrant.client?.scroll('bundestag_content', {
        filter: {
          must: [
            { key: 'chunk_text', match: { text: personName } }
          ]
        },
        limit: limit,
        with_payload: true
      }) ?? { points: [] }) as QdrantScrollResult;

      // Merge and deduplicate results
      const seen = new Set<string | number>();
      const merged: QdrantSearchResult[] = [];

      // Add vector results first (better semantic matches)
      for (const result of searchResults || []) {
        if (!seen.has(result.id)) {
          seen.add(result.id);
          merged.push({
            ...result,
            searchMethod: 'vector'
          });
        }
      }

      // Add text results
      for (const point of textResults?.points || []) {
        if (!seen.has(point.id)) {
          seen.add(point.id);
          merged.push({
            id: point.id,
            score: 0.8, // Fixed score for text matches
            payload: point.payload,
            searchMethod: 'text'
          });
        }
      }

      // Sort by score and limit
      return merged
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, limit);

    } catch (error: any) {
      console.error('[EnrichedPersonSearch] bundestag_content search failed:', error.message);
      return [];
    }
  }

  /**
   * Search DIP Drucksachen where person is author/urheber
   */
  private async _searchDrucksachen(personName: string, limit: number = 20): Promise<SearchResult> {
    try {
      const result = await this.mcpClient.searchDrucksachen({
        urheber: personName,
        wahlperiode: 20,
        limit
      });
      return result;
    } catch (error: any) {
      console.error('[EnrichedPersonSearch] Drucksachen search failed:', error.message);
      return { documents: [] };
    }
  }

  /**
   * Search DIP Aktivitäten for person
   */
  private async _searchAktivitaeten(personId: string | undefined, limit: number = 30): Promise<SearchResult> {
    if (!personId) return { documents: [] };

    try {
      const result = await this.mcpClient.searchAktivitaeten({
        person_id: personId,
        wahlperiode: 20,
        limit
      });
      return result;
    } catch (error: any) {
      console.error('[EnrichedPersonSearch] Aktivitäten search failed:', error.message);
      return { documents: [] };
    }
  }

  /**
   * Build combined person profile
   */
  private _buildPersonProfile(basicPerson: Person, detailedPerson: SearchResult | null): PersonProfile {
    const details: any = detailedPerson || {};
    return {
      id: basicPerson.id,
      vorname: basicPerson.vorname || details.vorname,
      nachname: basicPerson.nachname || details.nachname,
      name: `${basicPerson.vorname || details.vorname || ''} ${basicPerson.nachname || details.nachname || ''}`.trim(),
      titel: basicPerson.titel || details.titel,
      fraktion: basicPerson.fraktion || details.fraktion,
      wahlkreis: details.wahlkreis,
      geburtsdatum: details.geburtsdatum,
      geburtsort: details.geburtsort,
      beruf: details.beruf,
      biografie: details.biografie || details.vita_kurz,
      vita: details.vita_kurz,
      wahlperioden: details.wahlperioden,
      source: 'DIP'
    };
  }

  /**
   * Format content mentions from bundestag_content
   */
  private _formatContentMentions(results: QdrantSearchResult[]): ContentMention[] {
    return (results || []).map(r => ({
      title: r.payload?.title || 'Unbekannt',
      url: r.payload?.source_url || r.payload?.url,
      snippet: this._truncateSnippet(r.payload?.chunk_text, 300),
      similarity: r.score || 0,
      searchMethod: r.searchMethod,
      category: r.payload?.primary_category,
      publishedAt: r.payload?.published_at,
      source: 'bundestag_content'
    }));
  }

  /**
   * Format Drucksachen results
   */
  private _formatDrucksachen(result: SearchResult): FormattedDrucksache[] {
    return (result?.documents || []).map((d: any) => ({
      id: d.id,
      dokumentnummer: d.dokumentnummer,
      titel: d.titel,
      drucksachetyp: d.drucksachetyp,
      datum: d.datum,
      wahlperiode: d.wahlperiode,
      urheber: d.urheber,
      fundstelle: d.fundstelle,
      source: 'DIP_Drucksachen'
    }));
  }

  /**
   * Format Aktivitäten results
   */
  private _formatAktivitaeten(result: SearchResult): FormattedAktivitaet[] {
    return (result?.documents || []).map((a: any) => ({
      id: a.id,
      aktivitaetsart: a.aktivitaetsart,
      titel: a.titel,
      datum: a.datum,
      wahlperiode: a.wahlperiode,
      vorgangsbezug: a.vorgangsbezug,
      source: 'DIP_Aktivitaeten'
    }));
  }

  /**
   * Truncate snippet to max length
   */
  private _truncateSnippet(text: any, maxLength: number = 300): string {
    if (!text) return '';
    const str = String(text);
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength).trim() + '...';
  }

  /**
   * Generate a summary of activities for AI context
   */
  generateActivitySummary(enrichedResult: EnrichedPersonSearchResult): string | null {
    if (!enrichedResult.isPersonQuery || !enrichedResult.person) return null;

    const { person, drucksachen = [], aktivitaeten = [], contentMentions = [] } = enrichedResult;
    const lines: string[] = [];

    lines.push(`## ${person.name}`);
    if (person.fraktion) lines.push(`Fraktion: ${person.fraktion}`);
    if (person.wahlkreis) lines.push(`Wahlkreis: ${person.wahlkreis}`);
    if (person.beruf) lines.push(`Beruf: ${person.beruf}`);
    if (person.vita) lines.push(`\n${person.vita}`);

    if (drucksachen.length > 0) {
      lines.push(`\n### Drucksachen (${drucksachen.length})`);
      for (const d of drucksachen.slice(0, 10)) {
        lines.push(`- [${d.drucksachetyp}] ${d.titel} (${d.dokumentnummer}, ${d.datum})`);
      }
    }

    if (aktivitaeten.length > 0) {
      lines.push(`\n### Aktivitäten (${aktivitaeten.length})`);
      const byType: Record<string, number> = {};
      for (const a of aktivitaeten) {
        const type = a.aktivitaetsart || 'Sonstige';
        byType[type] = (byType[type] || 0) + 1;
      }
      for (const [type, count] of Object.entries(byType)) {
        lines.push(`- ${type}: ${count}`);
      }
    }

    if (contentMentions.length > 0) {
      lines.push(`\n### Erwähnungen auf gruene-bundestag.de (${contentMentions.length})`);
      for (const m of contentMentions.slice(0, 5)) {
        lines.push(`- ${m.title}`);
      }
    }

    return lines.join('\n');
  }
}

// Singleton
let serviceInstance: EnrichedPersonSearchService | null = null;

export function getEnrichedPersonSearchService(): EnrichedPersonSearchService {
  if (!serviceInstance) {
    serviceInstance = new EnrichedPersonSearchService();
  }
  return serviceInstance;
}
