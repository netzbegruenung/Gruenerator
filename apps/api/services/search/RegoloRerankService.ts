/**
 * Regolo Rerank Service
 *
 * Uses Regolo's dedicated /rerank endpoint with Qwen3-Reranker-4B
 * (a cross-encoder model) for fast, accurate relevance scoring.
 *
 * Replaces the previous LLM-based reranking that sent documents to
 * mistral-small-4 and parsed JSON score responses.
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('RegoloRerank');

const REGOLO_RERANK_URL = 'https://api.regolo.ai/rerank';
const RERANK_MODEL = 'Qwen3-Reranker-4B';
const DEFAULT_INSTRUCT = 'Given a search query, retrieve relevant passages that answer the query';

export interface RerankRequest {
  query: string;
  documents: string[];
  topN?: number;
  instruct?: string;
}

export interface RerankResultItem {
  originalIndex: number;
  relevanceScore: number;
  text: string;
}

interface RegoloRerankResponse {
  id: string;
  results: Array<{
    index: number;
    relevance_score: number;
    document: { text: string };
  }>;
  meta: unknown;
}

class RegoloRerankService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.REGOLO_API_KEY || '';
    if (!this.apiKey) {
      log.warn('Missing REGOLO_API_KEY — reranking will fall back to original order');
    }
  }

  async rerank(request: RerankRequest): Promise<RerankResultItem[]> {
    if (!this.apiKey) {
      throw new Error('REGOLO_API_KEY is not configured');
    }

    const { query, documents, topN, instruct } = request;
    const instructText = instruct || DEFAULT_INSTRUCT;

    const formattedQuery = `<Instruct>: ${instructText}\n<Query>: ${query}`;
    const formattedDocuments = documents.map((doc) => `<Document>: ${doc}`);

    log.info(`Reranking ${documents.length} documents${topN ? ` (top_n=${topN})` : ''}`);

    const startTime = Date.now();

    const response = await fetch(REGOLO_RERANK_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: RERANK_MODEL,
        query: formattedQuery,
        documents: formattedDocuments,
        ...(topN && { top_n: topN }),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Regolo rerank API error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const data = (await response.json()) as RegoloRerankResponse;

    const results: RerankResultItem[] = data.results.map((r) => ({
      originalIndex: r.index,
      relevanceScore: r.relevance_score,
      text: r.document.text,
    }));

    log.info(
      `Reranked in ${Date.now() - startTime}ms — top score: ${results[0]?.relevanceScore.toFixed(3) ?? 'N/A'}`
    );

    return results;
  }
}

export const regoloRerankService = new RegoloRerankService();
