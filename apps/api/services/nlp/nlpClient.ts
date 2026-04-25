import axios from 'axios';

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';

import type { KeywordEntry, NlpClassificationResult } from './types.js';

const log = createLogger('NlpClient');

const NLP_SERVICE_URL = env.NLP_SERVICE_URL ?? 'http://localhost:8000';
const NLP_TIMEOUT_MS = 30_000;

export interface NlpRequestOptions {
  /** Override the default request timeout. */
  timeoutMs?: number;
}

export async function classifyArticles<Topic extends string = string>(
  articles: Array<{ id: string; title: string; text: string }>
): Promise<NlpClassificationResult<Topic>[]> {
  if (articles.length === 0) return [];

  try {
    const response = await axios.post<{ results: NlpClassificationResult<Topic>[] }>(
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

export async function extractKeywords<Topic = string | null>(
  articles: Array<{ id: string; title: string; text: string }>,
  topN = 50,
  options: NlpRequestOptions = {}
): Promise<KeywordEntry<Topic>[]> {
  if (articles.length === 0) return [];

  try {
    const response = await axios.post<{ keywords: KeywordEntry<Topic>[] }>(
      `${NLP_SERVICE_URL}/analyze/keywords`,
      { texts: articles, top_n: topN },
      { timeout: options.timeoutMs ?? NLP_TIMEOUT_MS }
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

/**
 * Run `extractKeywords` over a list in chunks (avoids NLP service timeouts on
 * large payloads), then aggregate the per-batch results into a single top-N list.
 */
export async function extractKeywordsBatched<Topic = string | null>(
  articles: Array<{ id: string; title: string; text: string }>,
  topN: number,
  options: NlpRequestOptions & { batchSize?: number } = {}
): Promise<KeywordEntry<Topic>[]> {
  if (articles.length === 0) return [];
  const batchSize = options.batchSize ?? 20;

  const aggregator = new Map<string, { count: number; topic: Topic }>();
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);
    const batchKeywords = await extractKeywords<Topic>(batch, topN, options);
    for (const k of batchKeywords) {
      const prev = aggregator.get(k.keyword);
      if (prev) {
        prev.count += k.count;
      } else {
        aggregator.set(k.keyword, { count: k.count, topic: k.topic });
      }
    }
  }

  return [...aggregator.entries()]
    .map(([keyword, { count, topic }]) => ({ keyword, count, topic }) as KeywordEntry<Topic>)
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await axios.get<{ status: string }>(`${NLP_SERVICE_URL}/health`, {
      timeout: 5000,
    });
    return response.data?.status === 'ok';
  } catch {
    return false;
  }
}
