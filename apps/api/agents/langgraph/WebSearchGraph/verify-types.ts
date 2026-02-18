/**
 * TypeScript Type Verification Test
 * This file exists solely to verify that all types compile correctly
 */

import { runWebSearch } from './WebSearchGraph.js';

import type {
  WebSearchState,
  WebSearchInput,
  WebSearchOutput,
  NormalSearchOutput,
  DeepSearchOutput,
  SearchResult,
  Citation,
  Source,
  ValidationResult,
  ReferencesMap,
  CrawlMetadata,
  SearchOptions,
} from './types.js';

// Type verification tests - these should all compile without errors

// Verify WebSearchInput structure
const testInput: WebSearchInput = {
  query: 'test',
  mode: 'normal',
  user_id: 'test',
  searchOptions: {
    maxResults: 10,
    language: 'de-DE',
    categories: 'general', // String, not array
  },
  aiWorkerPool: {} as any,
  req: {} as any,
};

// Verify NormalSearchOutput structure
const testNormalOutput: NormalSearchOutput = {
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
const testDeepOutput: DeepSearchOutput = {
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
const testCrawlMetadata: CrawlMetadata = {
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
const testSearchOptions: SearchOptions = {
  categories: 'general,news', // String, not array
  maxResults: 10,
};

// Verify Citation and Source are imported from search services
const testCitation: Citation = {
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

const testSource: Source = {
  document_id: 'id',
  document_title: 'title',
  source_url: 'url',
  chunk_text: 'text',
  similarity_score: 0.9,
  citations: [],
};

// Verify ValidationResult structure
const testValidationResult: ValidationResult = {
  cleanDraft: 'text',
  citations: [] as Citation[],
  sources: [] as Source[], // Has 'sources', not 'citationSources'
  errors: null,
};

// Verify ReferencesMap type
const testReferencesMap: ReferencesMap = {
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

console.log('✅ All type definitions compile successfully!');
console.log('\n📋 Type Verification Summary:');
console.log('- WebSearchInput: ✅');
console.log('- NormalSearchOutput: ✅');
console.log('- DeepSearchOutput: ✅');
console.log('- CrawlMetadata (extended): ✅');
console.log('- SearchOptions (categories: string): ✅');
console.log('- Citation (from search services): ✅');
console.log('- Source (from search services): ✅');
console.log('- ValidationResult (with sources): ✅');
console.log('- ReferencesMap: ✅');
console.log('\n🎉 All TypeScript fixes verified!');

export {};
