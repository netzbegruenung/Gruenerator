/**
 * EnrichedPersonSearch for gruenerator-mcp
 * Orchestrates multi-source search when a person (Abgeordneter) is detected
 */

import { generateEmbedding } from '../embeddings.ts';
import { getQdrantClient } from '../qdrant/client.ts';

import { getBundestagMCPClient } from './bundestag-client.ts';
import { getPersonDetectionService } from './person-detection.ts';

interface PersonBase {
  id?: string | number;
  vorname?: string;
  nachname?: string;
  titel?: string;
  fraktion?: string | string[];
}

interface PersonDetails extends PersonBase {
  wahlkreis?: string;
  geburtsdatum?: string;
  geburtsort?: string;
  beruf?: string;
  biografie?: string;
  vita_kurz?: string;
  wahlperioden?: unknown;
}

interface ContentMention {
  id: string | number;
  score: number;
  payload?: Record<string, unknown>;
  searchMethod: string;
}

interface DIPDocument {
  id?: string | number;
  dokumentnummer?: string;
  titel?: string;
  drucksachetyp?: string;
  datum?: string;
  wahlperiode?: number;
  urheber?: string;
  fundstelle?: string;
  aktivitaetsart?: string;
  vorgangsbezug?: unknown;
}

interface DIPResult {
  documents?: DIPDocument[];
}

class EnrichedPersonSearch {
  private personDetection: ReturnType<typeof getPersonDetectionService>;
  private mcpClient: ReturnType<typeof getBundestagMCPClient>;

  constructor() {
    this.personDetection = getPersonDetectionService();
    this.mcpClient = getBundestagMCPClient();
  }

  async search(query: string, options: Record<string, unknown> = {}) {
    const detection = await this.personDetection.detectPerson(query);

    if (!detection.detected) {
      return { isPersonQuery: false };
    }

    const person = detection.person!;
    const personName = `${person.vorname} ${person.nachname}`;

    console.log(
      `[EnrichedPersonSearch] Detected MP: ${personName} (confidence: ${detection.confidence.toFixed(2)})`
    );

    const startTime = Date.now();
    const [personDetails, contentMentions, drucksachen, aktivitaeten] = await Promise.all([
      this._fetchPersonDetails(person.id),
      this._searchBundestagContent(personName, Number(options.contentLimit) || 15),
      this._searchDrucksachen(personName, Number(options.drucksachenLimit) || 20),
      this._searchAktivitaeten(person.id, Number(options.aktivitaetenLimit) || 30),
    ]);

    const elapsed = Date.now() - startTime;
    console.log(`[EnrichedPersonSearch] Fetched all sources in ${elapsed}ms`);

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
        fetchTimeMs: elapsed,
      },
    };
  }

  async _fetchPersonDetails(personId: string | number | undefined): Promise<PersonDetails | null> {
    if (!personId) return null;

    try {
      return (await this.mcpClient.getPerson(personId)) as PersonDetails;
    } catch (err) {
      console.error(
        '[EnrichedPersonSearch] Failed to fetch person details:',
        err instanceof Error ? err.message : String(err)
      );
      return null;
    }
  }

  async _searchBundestagContent(personName: string, limit = 15): Promise<ContentMention[]> {
    try {
      const qdrant = await getQdrantClient();
      const embedding = await generateEmbedding(personName);

      const searchResults = await qdrant.search('bundestag_content', {
        vector: embedding,
        limit: limit * 2,
        with_payload: true,
        score_threshold: 0.3,
      });

      const textResults = await qdrant.scroll('bundestag_content', {
        filter: {
          must: [{ key: 'chunk_text', match: { text: personName } }],
        },
        limit: limit,
        with_payload: true,
      });

      const seen = new Set<string | number>();
      const merged: ContentMention[] = [];

      for (const result of searchResults || []) {
        if (!seen.has(result.id)) {
          seen.add(result.id);
          merged.push({
            id: result.id,
            score: result.score,
            payload: result.payload as Record<string, unknown>,
            searchMethod: 'vector',
          });
        }
      }

      for (const point of textResults?.points || []) {
        if (!seen.has(point.id)) {
          seen.add(point.id);
          merged.push({
            id: point.id,
            score: 0.8,
            payload: point.payload as Record<string, unknown>,
            searchMethod: 'text',
          });
        }
      }

      return merged.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, limit);
    } catch (err) {
      console.error(
        '[EnrichedPersonSearch] bundestag_content search failed:',
        err instanceof Error ? err.message : String(err)
      );
      return [];
    }
  }

  async _searchDrucksachen(personName: string, limit = 20): Promise<DIPResult> {
    try {
      return (await this.mcpClient.searchDrucksachen({
        urheber: personName,
        wahlperiode: 20,
        limit,
      })) as DIPResult;
    } catch (err) {
      console.error(
        '[EnrichedPersonSearch] Drucksachen search failed:',
        err instanceof Error ? err.message : String(err)
      );
      return { documents: [] };
    }
  }

  async _searchAktivitaeten(personId: string | number | undefined, limit = 30): Promise<DIPResult> {
    if (!personId) return { documents: [] };

    try {
      return (await this.mcpClient.searchAktivitaeten({
        person_id: personId,
        wahlperiode: 20,
        limit,
      })) as DIPResult;
    } catch (err) {
      console.error(
        '[EnrichedPersonSearch] Aktivitäten search failed:',
        err instanceof Error ? err.message : String(err)
      );
      return { documents: [] };
    }
  }

  _buildPersonProfile(basicPerson: PersonBase, detailedPerson: PersonDetails | null) {
    const details = detailedPerson || ({} as PersonDetails);
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
      source: 'DIP',
    };
  }

  _formatContentMentions(results: ContentMention[] | null) {
    return (results || []).map((r) => ({
      title: r.payload?.title || 'Unbekannt',
      url: r.payload?.source_url || r.payload?.url,
      snippet: this._truncateSnippet(r.payload?.chunk_text as string | undefined, 300),
      similarity: r.score || 0,
      searchMethod: r.searchMethod,
      category: r.payload?.primary_category,
      publishedAt: r.payload?.published_at,
      source: 'bundestag_content',
    }));
  }

  _formatDrucksachen(result: DIPResult | null) {
    return (result?.documents || []).map((d) => ({
      id: d.id,
      dokumentnummer: d.dokumentnummer,
      titel: d.titel,
      drucksachetyp: d.drucksachetyp,
      datum: d.datum,
      wahlperiode: d.wahlperiode,
      urheber: d.urheber,
      fundstelle: d.fundstelle,
      source: 'DIP_Drucksachen',
    }));
  }

  _formatAktivitaeten(result: DIPResult | null) {
    return (result?.documents || []).map((a) => ({
      id: a.id,
      aktivitaetsart: a.aktivitaetsart,
      titel: a.titel,
      datum: a.datum,
      wahlperiode: a.wahlperiode,
      vorgangsbezug: a.vorgangsbezug,
      source: 'DIP_Aktivitaeten',
    }));
  }

  _truncateSnippet(text: string | undefined, maxLength = 300): string {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  }

  generateActivitySummary(enrichedResult: {
    isPersonQuery: boolean;
    person?: {
      name?: string;
      fraktion?: string;
      wahlkreis?: string;
      beruf?: string;
      vita?: string;
    };
    drucksachen?: Array<{
      drucksachetyp?: string;
      titel?: string;
      dokumentnummer?: string;
      datum?: string;
    }>;
    aktivitaeten?: Array<{ aktivitaetsart?: string }>;
    contentMentions?: Array<{ title?: string }>;
  }) {
    if (!enrichedResult.isPersonQuery) return null;

    const { person, drucksachen, aktivitaeten, contentMentions } = enrichedResult;
    const lines: string[] = [];

    lines.push(`## ${person?.name}`);
    if (person?.fraktion) lines.push(`Fraktion: ${person.fraktion}`);
    if (person?.wahlkreis) lines.push(`Wahlkreis: ${person.wahlkreis}`);
    if (person?.beruf) lines.push(`Beruf: ${person.beruf}`);
    if (person?.vita) lines.push(`\n${person.vita}`);

    if (drucksachen && drucksachen.length > 0) {
      lines.push(`\n### Drucksachen (${drucksachen.length})`);
      for (const d of drucksachen.slice(0, 10)) {
        lines.push(`- [${d.drucksachetyp}] ${d.titel} (${d.dokumentnummer}, ${d.datum})`);
      }
    }

    if (aktivitaeten && aktivitaeten.length > 0) {
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

    if (contentMentions && contentMentions.length > 0) {
      lines.push(`\n### Erwähnungen auf gruene-bundestag.de (${contentMentions.length})`);
      for (const m of contentMentions.slice(0, 5)) {
        lines.push(`- ${m.title}`);
      }
    }

    return lines.join('\n');
  }
}

let serviceInstance: EnrichedPersonSearch | null = null;

function getEnrichedPersonSearch(): EnrichedPersonSearch {
  if (!serviceInstance) {
    serviceInstance = new EnrichedPersonSearch();
  }
  return serviceInstance;
}

export { getEnrichedPersonSearch };
