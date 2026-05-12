/**
 * TypeScript Type Verification Test
 * This file exists solely to verify that all types compile correctly
 */

import { createLogger } from '../../../utils/logger.js';

import type {
  CrawlMetadata,
  Citation,
  DeepSearchOutput,
  NormalSearchOutput,
  ReferencesMap,
  SearchOptions,
  SearchResult,
  Source,
  ValidationResult,
  WebSearchInput,
} from './types.js';
import type { AIWorkerPool } from '../../../workers/types.js';
import type { Request } from 'express';

const log = createLogger('verify-types');

// Type verification tests - these should all compile without errors

// Verify WebSearchInput structure
const _testInput: WebSearchInput = {
  query: 'test',
  mode: 'normal',
  user_id: 'test',
  searchOptions: {
    maxResults: 10,
    language: 'de-DE',
    categories: 'general', // String, not array
  },
  aiWorkerPool: {} as unknown as AIWorkerPool,
  req: {} as unknown as Request,
};

// Verify NormalSearchOutput structure
const _testNormalOutput: NormalSearchOutput = {
  status: 'success',
  query: 'test',
  results: [] as SearchResult[],
  summary: 'test',
  citations: [] as Citation[],
  citationSources: [] as Source[], // Source[], not SearchResult[]
  metadata: {
    searchType: 'normal_web_search',
    duration: 100,
  },
};

// Verify DeepSearchOutput structure
const _testDeepOutput: DeepSearchOutput = {
  status: 'success',
  dossier: {
    query: 'test',
    executiveSummary: 'test',
    detailedAnalysis: 'test',
    methodology: 'test',
    sources: [] as SearchResult[],
  },
  researchQuestions: ['q1'],
  searchResults: [],
  sources: [] as SearchResult[],
  categorizedSources: {},
  grundsatzResults: null,
  citations: [] as Citation[],
  citationSources: [] as Source[], // Source[], not SearchResult[]
  metadata: {
    searchType: 'deep_research',
    duration: 100,
  },
};

// Verify CrawlMetadata has all required properties
const _testCrawlMetadata: CrawlMetadata = {
  totalUrls: 10,
  crawledUrls: 5,
  crawledCount: 5,
  totalResultsAnalyzed: 10,
  maxCrawlsAllowed: 5,
  selectedCount: 3,
  timeout: 3000,
  failed: false,
  noResultsToAnalyze: false,
  emptyResults: false,
  nothingToCrawl: false,
};

// Verify SearchOptions categories is string
const _testSearchOptions: SearchOptions = {
  categories: 'general,news', // String, not array
  maxResults: 10,
};

// Verify Citation and Source are imported from search services
const _testCitation: Citation = {
  index: '1',
  cited_text: 'text',
  document_title: 'title',
  document_id: 'id',
  source_url: 'url',
  similarity_score: 0.9,
  chunk_index: 0,
  filename: 'file',
  page_number: 1,
};

const _testSource: Source = {
  document_id: 'id',
  document_title: 'title',
  source_url: 'url',
  chunk_text: 'text',
  similarity_score: 0.9,
  citations: [],
};

// Verify ValidationResult structure
const _testValidationResult: ValidationResult = {
  cleanDraft: 'text',
  citations: [] as Citation[],
  sources: [] as Source[], // Has 'sources', not 'citationSources'
  errors: null,
};

// Verify ReferencesMap type
const _testReferencesMap: ReferencesMap = {
  '1': {
    title: 'title',
    snippets: [[]],
    description: null,
    date: '2024-01-01',
    source: 'web',
    document_id: 'id',
    source_url: 'url',
    filename: null,
    similarity_score: 0.9,
    chunk_index: 0,
    page_number: null,
  },
};

log.debug('All type definitions compile successfully!');
log.debug('\n📋 Type Verification Summary:');
log.debug('- WebSearchInput: ✅');
log.debug('- NormalSearchOutput: ✅');
log.debug('- DeepSearchOutput: ✅');
log.debug('- CrawlMetadata (extended): ✅');
log.debug('- SearchOptions (categories: string): ✅');
log.debug('- Citation (from search services): ✅');
log.debug('- Source (from search services): ✅');
log.debug('- ValidationResult (with sources): ✅');
log.debug('- ReferencesMap: ✅');
log.debug('\n🎉 All TypeScript fixes verified!');

export {};
