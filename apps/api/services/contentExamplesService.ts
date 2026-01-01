/**
 * Content Examples Service
 *
 * Provides relevant examples for any content type using Qdrant vector search.
 * Supports locale-aware retrieval (de-DE for German, de-AT for Austrian content).
 */

import { getQdrantInstance, QdrantService } from '../database/services/QdrantService/index.js';
import { fastEmbedService } from './FastEmbedService.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ContentExamplesService');

// =============================================================================
// Type Definitions
// =============================================================================

type ContentType = 'instagram' | 'facebook' | 'twitter' | 'antrag' | 'rede' | 'pressemitteilung';
type CountryCode = 'DE' | 'AT';
type Locale = 'de-DE' | 'de-AT';

interface ContentExampleResult {
    id: string;
    score: number;
    title?: string;
    content?: string;
    type?: string;
    categories?: string[];
    tags?: string[];
    description?: string;
    content_data?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    created_at?: string;
    similarity_score?: number;
}

interface SocialMediaResult {
    id: string | number;
    score: number;
    content?: string;
    platform?: string;
    country?: string | null;
    source_account?: string | null;
    created_at?: string;
}

interface SearchResponse<T> {
    success: boolean;
    results: T[];
}

interface ThresholdConfig {
    instagram: number;
    facebook: number;
    twitter: number;
    antrag: number;
    rede: number;
    pressemitteilung: number;
    default: number;
}

interface GetExamplesOptions {
    limit?: number;
    threshold?: number;
    fallbackToRandom?: boolean;
    categories?: string[] | null;
    tags?: string[] | null;
    locale?: Locale | null;
    country?: CountryCode | null;
}

interface SearchExamplesOptions {
    limit?: number;
    threshold?: number;
    categories?: string[] | null;
    tags?: string[] | null;
    country?: CountryCode | null;
}

interface RandomExamplesFilters {
    categories?: string[] | null;
    tags?: string[] | null;
    country?: CountryCode | null;
}

interface MockExample {
    id: string;
    title: string;
    content: string;
    type: string;
    platform: string;
    similarity_score: null;
    relevance: 'mock';
    metadata: {
        categories: string[];
        tags: string[];
        isMock: boolean;
    };
    created_at: string;
}

interface ExampleData {
    id: string;
    type: string;
    title: string;
    description?: string;
    content_data?: {
        content?: string;
        caption?: string;
    };
    categories?: string[];
    tags?: string[];
    metadata?: Record<string, unknown>;
    created_at?: string;
}

interface StoreResult {
    success: boolean;
    error?: string;
}

interface CollectionStats {
    total_examples: number;
    vectors_count: number;
    collection_status: string;
}

interface ExamplesStats {
    content_examples?: CollectionStats;
    social_media_examples?: CollectionStats;
    total_all_examples?: number;
}

interface SocialMediaSearchMethodOptions {
    platform?: string | null;
    limit?: number;
    threshold?: number;
    locale?: Locale | null;
    country?: CountryCode | null;
}

interface RandomSocialMediaOptions {
    platform?: string | null;
    limit?: number;
    locale?: Locale | null;
    country?: CountryCode | null;
}

// =============================================================================
// ContentExamplesService Class
// =============================================================================

class ContentExamplesService {
    private defaultLimit: number;
    private qdrant: QdrantService;
    private defaultThresholds: ThresholdConfig;
    private localeToCountry: Record<Locale, CountryCode>;

    constructor() {
        this.defaultLimit = 3;
        this.qdrant = getQdrantInstance();

        this.defaultThresholds = {
            instagram: 0.25,
            facebook: 0.25,
            twitter: 0.20,
            antrag: 0.20,
            rede: 0.20,
            pressemitteilung: 0.20,
            default: 0.25
        };

        this.localeToCountry = {
            'de-DE': 'DE',
            'de-AT': 'AT'
        };
    }

    /**
     * Convert locale string to country code
     */
    getCountryFromLocale(locale: string | null | undefined): CountryCode | null {
        if (!locale) return null;
        return this.localeToCountry[locale as Locale] || null;
    }

    /**
     * Get relevant examples for a specific content type
     */
    async getExamples(
        contentType: string,
        userQuery: string = '',
        options: GetExamplesOptions = {}
    ): Promise<Array<ContentExampleResult | SocialMediaResult | MockExample>> {
        const {
            limit = this.defaultLimit,
            threshold = this.defaultThresholds[contentType as ContentType] || this.defaultThresholds.default,
            fallbackToRandom = true,
            categories = null,
            tags = null,
            locale = null,
            country = null
        } = options;

        const resolvedCountry = country || this.getCountryFromLocale(locale);

        try {
            const countryInfo = resolvedCountry ? ` (country: ${resolvedCountry})` : '';
            log.debug(`Fetching ${limit} ${contentType} examples${countryInfo}`);

            let examples: Array<ContentExampleResult | SocialMediaResult | MockExample> = [];

            if (userQuery && userQuery.trim().length > 0) {
                examples = await this.searchExamples(contentType, userQuery.trim(), {
                    limit,
                    threshold,
                    categories,
                    tags,
                    country: resolvedCountry
                });
            }

            if (examples.length === 0 && fallbackToRandom) {
                examples = await this.getRandomExamples(contentType, limit, {
                    categories,
                    tags,
                    country: resolvedCountry
                });
            }

            if (examples.length === 0 && resolvedCountry && fallbackToRandom) {
                log.debug(`No ${resolvedCountry} examples, falling back to all countries`);
                examples = await this.getRandomExamples(contentType, limit, { categories, tags });
            }

            log.debug(`Returning ${examples.length} examples`);
            return examples;

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.error(`Error fetching examples for ${contentType}: ${message}`);
            return [];
        }
    }

    /**
     * Search examples using vector similarity
     */
    async searchExamples(
        contentType: string,
        query: string,
        options: SearchExamplesOptions = {}
    ): Promise<Array<ContentExampleResult | SocialMediaResult>> {
        try {
            const countryInfo = options.country ? ` (country: ${options.country})` : '';
            log.debug(`Searching for "${query}" in ${contentType}${countryInfo}`);

            await fastEmbedService.init();
            if (!fastEmbedService.isReady()) {
                log.warn('FastEmbed service not ready - vector search disabled');
                return [];
            }

            if (!(await this.qdrant.isAvailable())) {
                log.warn('Qdrant not available - vector search disabled');
                return [];
            }

            const {
                limit = this.defaultLimit,
                threshold = 0.25,
                categories = null,
                tags = null,
                country = null
            } = options;

            let queryEmbedding: number[];
            try {
                queryEmbedding = await fastEmbedService.generateEmbedding(query);
            } catch (embeddingError) {
                const message = embeddingError instanceof Error ? embeddingError.message : String(embeddingError);
                log.error(`Failed to generate embedding: ${message}`);
                return [];
            }

            let searchResult: SearchResponse<ContentExampleResult | SocialMediaResult>;
            try {
                if (contentType === 'facebook' || contentType === 'instagram') {
                    const result = await this.qdrant.searchSocialMediaExamples(queryEmbedding, {
                        platform: contentType,
                        country: country || undefined,
                        limit,
                        threshold
                    });
                    searchResult = result as SearchResponse<SocialMediaResult>;
                } else {
                    const result = await this.qdrant.searchContentExamples(queryEmbedding, {
                        contentType,
                        limit,
                        threshold,
                        categories: categories || undefined,
                        tags: tags || undefined
                    });
                    searchResult = result as SearchResponse<ContentExampleResult>;
                }
            } catch (searchError) {
                const message = searchError instanceof Error ? searchError.message : String(searchError);
                log.error(`Qdrant search failed: ${message}`);
                return [];
            }

            if (!searchResult || !searchResult.success || !searchResult.results) {
                log.debug(`Vector search returned no results for "${query}" in ${contentType}`);
                return [];
            }

            log.debug(`Found ${searchResult.results.length} similar examples`);
            return searchResult.results;

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.error(`Unexpected search error: ${message}`);
            return [];
        }
    }

    /**
     * Get random examples from Qdrant
     */
    async getRandomExamples(
        contentType: string,
        limit: number = 3,
        filters: RandomExamplesFilters = {}
    ): Promise<Array<ContentExampleResult | SocialMediaResult | MockExample>> {
        try {
            if (!(await this.qdrant.isAvailable())) {
                log.warn('Qdrant not available for random examples');
                return this._getMockExamples(contentType, limit);
            }

            const { categories = null, tags = null, country = null } = filters;
            const countryInfo = country ? ` (country: ${country})` : '';
            log.debug(`Getting ${limit} random ${contentType} examples${countryInfo}`);

            let results: Array<ContentExampleResult | SocialMediaResult>;
            try {
                if (contentType === 'facebook' || contentType === 'instagram') {
                    results = await this.qdrant.getRandomSocialMediaExamples({
                        platform: contentType,
                        country: country || undefined,
                        limit
                    });
                } else {
                    results = await this.qdrant.getRandomContentExamples({
                        contentType,
                        limit,
                        categories: categories || undefined,
                        tags: tags || undefined
                    });
                }
            } catch (qdrantError) {
                const message = qdrantError instanceof Error ? qdrantError.message : String(qdrantError);
                log.error(`Qdrant random examples failed: ${message}`);
                return this._getMockExamples(contentType, limit);
            }

            if (results && results.length > 0) {
                log.debug(`Found ${results.length} random examples from Qdrant`);
                return results;
            }

            log.debug('No random examples available from Qdrant, using mock examples');
            return this._getMockExamples(contentType, limit);

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.error(`Unexpected random examples error: ${message}`);
            return this._getMockExamples(contentType, limit);
        }
    }

    /**
     * Generate mock examples when vector services are unavailable
     */
    private _getMockExamples(contentType: string, limit: number = 3): MockExample[] {
        log.debug(`Generating ${limit} mock examples for ${contentType} (vector services unavailable)`);

        const mockExamples: MockExample[] = [];
        const mockContent: Record<string, string[]> = {
            instagram: [
                "🌱 Für eine grünere Zukunft! Unsere Vision für nachhaltige Politik beginnt heute. #Nachhaltigkeit #Grüne #Zukunft",
                "💚 Klimaschutz ist Zukunftsschutz. Jede kleine Tat zählt für unseren Planeten. Gemeinsam schaffen wir den Wandel! #Klimaschutz",
                "🌍 Eine bessere Welt ist möglich - mit grüner Politik, die Menschen und Umwelt in den Mittelpunkt stellt. #GrünePolitik"
            ],
            facebook: [
                "Unsere Sozialpolitik setzt auf Gerechtigkeit und Solidarität. Wir kämpfen für ein Deutschland, in dem alle Menschen die gleichen Chancen haben - unabhängig von Herkunft oder sozialem Status.",
                "Bildung ist der Schlüssel für eine gerechte Gesellschaft. Deshalb investieren wir in Schulen, Universitäten und lebenslanges Lernen für alle.",
                "Gesundheit ist ein Menschenrecht. Unser Ziel ist ein Gesundheitssystem, das allen Menschen - nicht nur den wohlhabenden - beste Versorgung garantiert."
            ]
        };

        const contentArray = mockContent[contentType] || mockContent.instagram;

        for (let i = 0; i < Math.min(limit, contentArray.length); i++) {
            mockExamples.push({
                id: `mock_${contentType}_${i + 1}`,
                title: `Mock ${contentType} Beispiel ${i + 1}`,
                content: contentArray[i],
                type: contentType,
                platform: contentType,
                similarity_score: null,
                relevance: 'mock',
                metadata: {
                    categories: [],
                    tags: ['mock', 'example'],
                    isMock: true
                },
                created_at: new Date().toISOString()
            });
        }

        log.debug(`Generated ${mockExamples.length} mock examples`);
        return mockExamples;
    }

    /**
     * Store a new content example in Qdrant
     */
    async storeExample(exampleData: ExampleData): Promise<StoreResult> {
        try {
            await fastEmbedService.init();
            if (!fastEmbedService.isReady() || !(await this.qdrant.isAvailable())) {
                log.warn('Services not ready for storing');
                return { success: false, error: 'Vector services not available' };
            }

            let contentText = '';
            if (exampleData.content_data?.content) {
                contentText = exampleData.content_data.content;
            } else if (exampleData.content_data?.caption) {
                contentText = exampleData.content_data.caption;
            } else if (exampleData.description) {
                contentText = exampleData.description;
            } else {
                contentText = exampleData.title;
            }

            const embeddingText = `${exampleData.title}\n\n${contentText}`.trim();
            const embedding = await fastEmbedService.generateEmbedding(embeddingText);

            const metadata = {
                type: exampleData.type,
                title: exampleData.title,
                content: contentText,
                description: exampleData.description,
                content_data: exampleData.content_data,
                categories: exampleData.categories || [],
                tags: exampleData.tags || [],
                metadata: exampleData.metadata || {},
                created_at: exampleData.created_at || new Date().toISOString()
            };

            await this.qdrant.indexContentExample(exampleData.id, embedding, metadata);

            log.debug(`Stored example ${exampleData.id} in Qdrant`);
            return { success: true };

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.error(`Error storing example: ${message}`);
            return { success: false, error: message };
        }
    }

    /**
     * Get available content types from Qdrant
     */
    async getAvailableContentTypes(): Promise<string[]> {
        try {
            if (!(await this.qdrant.isAvailable())) {
                log.warn('Qdrant not available for content types');
                return [];
            }

            const stats = await this.qdrant.getCollectionStats('content_examples');

            if ('error' in stats && stats.error) {
                log.error(`Error getting collection stats: ${stats.error}`);
                return [];
            }

            return ['instagram', 'facebook', 'twitter', 'antrag', 'rede', 'pressemitteilung'];

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.error(`Error getting content types: ${message}`);
            return [];
        }
    }

    /**
     * Get statistics about examples in Qdrant
     */
    async getExamplesStats(): Promise<ExamplesStats> {
        try {
            if (!(await this.qdrant.isAvailable())) {
                log.warn('Qdrant not available for stats');
                return {};
            }

            const contentStats = await this.qdrant.getCollectionStats('content_examples');
            const socialMediaStats = await this.qdrant.getCollectionStats('social_media_examples');

            return {
                content_examples: {
                    total_examples: contentStats.points_count || 0,
                    vectors_count: contentStats.vectors_count || 0,
                    collection_status: contentStats.status || 'unknown'
                },
                social_media_examples: {
                    total_examples: socialMediaStats.points_count || 0,
                    vectors_count: socialMediaStats.vectors_count || 0,
                    collection_status: socialMediaStats.status || 'unknown'
                },
                total_all_examples: (contentStats.points_count || 0) + (socialMediaStats.points_count || 0)
            };

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.error(`Stats error: ${message}`);
            return {};
        }
    }

    /**
     * Search social media examples directly (convenience method)
     */
    async searchSocialMediaExamples(
        query: string,
        options: SocialMediaSearchMethodOptions = {}
    ): Promise<SocialMediaResult[]> {
        const {
            platform = null,
            limit = this.defaultLimit,
            threshold = 0.15,
            locale = null,
            country = null
        } = options;

        const resolvedCountry = country || this.getCountryFromLocale(locale);

        try {
            const countryInfo = resolvedCountry ? `, country: ${resolvedCountry}` : '';
            log.debug(`Social media search: "${query}" (platform: ${platform || 'all'}${countryInfo})`);

            await fastEmbedService.init();
            if (!fastEmbedService.isReady() || !(await this.qdrant.isAvailable())) {
                log.warn('Services not ready for social media search');
                return [];
            }

            const queryEmbedding = await fastEmbedService.generateEmbedding(query);

            const searchResult = await this.qdrant.searchSocialMediaExamples(queryEmbedding, {
                platform: platform || undefined,
                country: resolvedCountry || undefined,
                limit,
                threshold
            });

            if (!searchResult.success || !searchResult.results) {
                return [];
            }

            log.debug(`Found ${searchResult.results.length} social media examples`);
            return searchResult.results;

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.error(`Social media search error: ${message}`);
            return [];
        }
    }

    /**
     * Get random social media examples (convenience method)
     */
    async getRandomSocialMediaExamples(options: RandomSocialMediaOptions = {}): Promise<SocialMediaResult[]> {
        const {
            platform = null,
            limit = this.defaultLimit,
            locale = null,
            country = null
        } = options;

        const resolvedCountry = country || this.getCountryFromLocale(locale);

        try {
            if (!(await this.qdrant.isAvailable())) {
                log.warn('Qdrant not available for random social media examples');
                return [];
            }

            const countryInfo = resolvedCountry ? `, country: ${resolvedCountry}` : '';
            log.debug(`Getting ${limit} random social media examples (platform: ${platform || 'all'}${countryInfo})`);

            const results = await this.qdrant.getRandomSocialMediaExamples({
                platform: (platform as 'facebook' | 'instagram') || undefined,
                country: resolvedCountry || undefined,
                limit
            });

            if (results && results.length > 0) {
                log.debug(`Found ${results.length} random social media examples`);
                return results;
            }

            log.debug('No random social media examples available');
            return [];

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.error(`Random social media examples error: ${message}`);
            return [];
        }
    }

    /**
     * Delete an example from Qdrant
     */
    async deleteExample(exampleId: string): Promise<StoreResult> {
        try {
            if (!(await this.qdrant.isAvailable())) {
                return { success: false, error: 'Qdrant not available' };
            }

            const result = await this.qdrant.deleteContentExample(exampleId);
            log.debug(`Deleted example ${exampleId}`);
            return result;

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.error(`Delete error: ${message}`);
            return { success: false, error: message };
        }
    }
}

// Export singleton instance
export const contentExamplesService = new ContentExamplesService();
export default contentExamplesService;
