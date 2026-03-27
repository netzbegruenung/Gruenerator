import axios from 'axios';

import { createLogger } from '../../utils/logger.js';

import type { KeywordEntry, NlpClassificationResult } from './types.js';

const log = createLogger('NlpClient');

const NLP_SERVICE_URL = process.env.NLP_SERVICE_URL || 'http://localhost:8000';
const NLP_TIMEOUT_MS = 30_000;

interface NlpBatchResponse {
  results: NlpClassificationResult[];
}

export async function classifyArticles(
  articles: Array<{ id: string; title: string; text: string }>
): Promise<NlpClassificationResult[]> {
  if (articles.length === 0) return [];

  try {
    const response = await axios.post<NlpBatchResponse>(
      `${NLP_SERVICE_URL}/analyze/topics`,
      { texts: articles },
      { timeout: NLP_TIMEOUT_MS }
    );
    return response.data.results;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      log.error(
        `NLP service call failed: ${error.message} (${error.response?.status ?? 'no response'})`
      );
    } else {
      log.error(`NLP service call failed: ${error}`);
    }
    return [];
  }
}

export async function extractKeywords(
  articles: Array<{ id: string; title: string; text: string }>,
  topN = 50
): Promise<KeywordEntry[]> {
  if (articles.length === 0) return [];

  try {
    const response = await axios.post<{ keywords: KeywordEntry[] }>(
      `${NLP_SERVICE_URL}/analyze/keywords`,
      { texts: articles, top_n: topN },
      { timeout: NLP_TIMEOUT_MS }
    );
    return response.data.keywords;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      log.error(
        `NLP keywords call failed: ${error.message} (${error.response?.status ?? 'no response'})`
      );
    } else {
      log.error(`NLP keywords call failed: ${error}`);
    }
    return [];
  }
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await axios.get(`${NLP_SERVICE_URL}/health`, { timeout: 5000 });
    return response.data?.status === 'ok';
  } catch {
    return false;
  }
}
