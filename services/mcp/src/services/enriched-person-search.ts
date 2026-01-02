/**
 * EnrichedPersonSearch for gruenerator-mcp
 * Orchestrates multi-source search when a person (Abgeordneter) is detected
 */

import { getPersonDetectionService } from './person-detection.ts';
import { getBundestagMCPClient } from './bundestag-client.ts';
import { getQdrantClient } from '../qdrant/client.ts';
import { generateEmbedding } from '../embeddings.ts';

class EnrichedPersonSearch {
    constructor() {
        this.personDetection = getPersonDetectionService();
        this.mcpClient = getBundestagMCPClient();
    }

    async search(query, options = {}) {
        const detection = await this.personDetection.detectPerson(query);

        if (!detection.detected) {
            return { isPersonQuery: false };
        }

        const person = detection.person;
        const personName = `${person.vorname} ${person.nachname}`;

        console.log(`[EnrichedPersonSearch] Detected MP: ${personName} (confidence: ${detection.confidence.toFixed(2)})`);

        const startTime = Date.now();
        const [personDetails, contentMentions, drucksachen, aktivitaeten] = await Promise.all([
            this._fetchPersonDetails(person.id),
            this._searchBundestagContent(personName, options.contentLimit || 15),
            this._searchDrucksachen(personName, options.drucksachenLimit || 20),
            this._searchAktivitaeten(person.id, options.aktivitaetenLimit || 30)
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
                fetchTimeMs: elapsed
            }
        };
    }

    async _fetchPersonDetails(personId) {
        if (!personId) return null;

        try {
            return await this.mcpClient.getPerson(personId);
        } catch (error) {
            console.error('[EnrichedPersonSearch] Failed to fetch person details:', error.message);
            return null;
        }
    }

    async _searchBundestagContent(personName, limit = 15) {
        try {
            const qdrant = await getQdrantClient();
            const embedding = await generateEmbedding(personName);

            const searchResults = await qdrant.search('bundestag_content', {
                vector: embedding,
                limit: limit * 2,
                with_payload: true,
                score_threshold: 0.3
            });

            const textResults = await qdrant.scroll('bundestag_content', {
                filter: {
                    must: [
                        { key: 'chunk_text', match: { text: personName } }
                    ]
                },
                limit: limit,
                with_payload: true
            });

            const seen = new Set();
            const merged = [];

            for (const result of searchResults || []) {
                if (!seen.has(result.id)) {
                    seen.add(result.id);
                    merged.push({ ...result, searchMethod: 'vector' });
                }
            }

            for (const point of textResults?.points || []) {
                if (!seen.has(point.id)) {
                    seen.add(point.id);
                    merged.push({
                        id: point.id,
                        score: 0.8,
                        payload: point.payload,
                        searchMethod: 'text'
                    });
                }
            }

            return merged
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .slice(0, limit);

        } catch (error) {
            console.error('[EnrichedPersonSearch] bundestag_content search failed:', error.message);
            return [];
        }
    }

    async _searchDrucksachen(personName, limit = 20) {
        try {
            return await this.mcpClient.searchDrucksachen({
                urheber: personName,
                wahlperiode: 20,
                limit
            });
        } catch (error) {
            console.error('[EnrichedPersonSearch] Drucksachen search failed:', error.message);
            return { documents: [] };
        }
    }

    async _searchAktivitaeten(personId, limit = 30) {
        if (!personId) return { documents: [] };

        try {
            return await this.mcpClient.searchAktivitaeten({
                person_id: personId,
                wahlperiode: 20,
                limit
            });
        } catch (error) {
            console.error('[EnrichedPersonSearch] Aktivitäten search failed:', error.message);
            return { documents: [] };
        }
    }

    _buildPersonProfile(basicPerson, detailedPerson) {
        const details = detailedPerson || {};
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

    _formatContentMentions(results) {
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

    _formatDrucksachen(result) {
        return (result?.documents || []).map(d => ({
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

    _formatAktivitaeten(result) {
        return (result?.documents || []).map(a => ({
            id: a.id,
            aktivitaetsart: a.aktivitaetsart,
            titel: a.titel,
            datum: a.datum,
            wahlperiode: a.wahlperiode,
            vorgangsbezug: a.vorgangsbezug,
            source: 'DIP_Aktivitaeten'
        }));
    }

    _truncateSnippet(text, maxLength = 300) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength).trim() + '...';
    }

    generateActivitySummary(enrichedResult) {
        if (!enrichedResult.isPersonQuery) return null;

        const { person, drucksachen, aktivitaeten, contentMentions } = enrichedResult;
        const lines = [];

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
            const byType = {};
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

let serviceInstance = null;

function getEnrichedPersonSearch() {
    if (!serviceInstance) {
        serviceInstance = new EnrichedPersonSearch();
    }
    return serviceInstance;
}

export { EnrichedPersonSearch, getEnrichedPersonSearch };
