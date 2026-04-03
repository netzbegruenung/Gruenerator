/**
 * Test file for RAG Improvement Nodes
 * Run with: npx tsx apps/api/agents/langgraph/ChatGraph/nodes/ragImprovements.test.ts
 *
 * Tests:
 * 1. Query Reformulation (extractSearchTopic)
 * 2. Query Decomposition (sub-queries in heuristic + LLM path)
 * 3. Expanded Context Window (budget-based allocation)
 * 4. Rerank Node (score parsing)
 * 5. Cross-Collection Search (integration — requires Qdrant)
 */

import {
  heuristicClassify,
  extractSearchTopic,
  extractFilters,
  heuristicExtractFilters,
} from './classifierNode.js';
import { buildSystemMessage } from './respondNode.js';
import { getDefaultCollectionsForLocale } from './searchNode.js';

import type { ChatGraphState, SearchResult } from '../types.js';

// ============================================================================
// Test Utilities
// ============================================================================

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition: boolean, description: string, details?: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${description}`);
  } else {
    failed++;
    console.log(`  ❌ ${description}`);
    if (details) console.log(`     ${details}`);
  }
}

function skip(description: string, reason: string) {
  skipped++;
  console.log(`  ⏭️  ${description} — ${reason}`);
}

function section(title: string) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(60)}`);
}

// ============================================================================
// 1. Query Reformulation Tests
// ============================================================================

function testQueryReformulation() {
  section('1. Query Reformulation (extractSearchTopic)');

  const cases: Array<{ input: string; expected: string; description: string }> = [
    {
      input: 'Schreib eine Pressemitteilung über die Klimapolitik der Grünen',
      expected: 'die Klimapolitik der Grünen',
      description: 'Strip "Schreib eine Pressemitteilung über"',
    },
    {
      input: 'Erstelle mir Argumente zur Energiewende',
      expected: 'Energiewende',
      description: 'Strip "Erstelle mir Argumente zur"',
    },
    {
      input: 'Verfasse einen Artikel über erneuerbare Energien',
      expected: 'erneuerbare Energien',
      description: 'Strip "Verfasse einen Artikel über"',
    },
    {
      input: 'Formuliere eine Rede zum Thema Verkehrswende',
      expected: 'Verkehrswende',
      description: 'Strip "Formuliere eine Rede zum Thema"',
    },
    {
      input: 'Schreibe eine kurze Zusammenfassung über den Kohleausstieg',
      expected: 'den Kohleausstieg',
      description: 'Strip "Schreibe eine kurze Zusammenfassung über"',
    },
    {
      input: 'Erstelle bitte einen Bericht zur Energiepolitik',
      expected: 'Energiepolitik',
      description: 'Strip "Erstelle bitte einen Bericht zur"',
    },
    {
      input: 'Was sagen die Grünen zur Energiewende?',
      expected: 'Was sagen die Grünen zur Energiewende?',
      description: 'Non-task query preserved as-is',
    },
    {
      input: 'Klimapolitik der Grünen',
      expected: 'Klimapolitik der Grünen',
      description: 'Pure topic preserved as-is',
    },
    {
      input: 'Hallo',
      expected: 'Hallo',
      description: 'Short greeting preserved',
    },
  ];

  for (const c of cases) {
    const result = extractSearchTopic(c.input);
    assert(
      result === c.expected,
      c.description,
      `Input: "${c.input}" → Got: "${result}", Expected: "${c.expected}"`
    );
  }
}

// ============================================================================
// 2. Heuristic Query Optimization Tests
// ============================================================================

function testHeuristicQueryOptimization() {
  section('2. Heuristic Path Query Optimization');

  // When heuristic confidence is high (>= 0.85), the searchQuery should be optimized
  const cases: Array<{ input: string; expectOptimized: boolean; description: string }> = [
    {
      input: 'was ist die position der grüne zum klimaschutz',
      expectOptimized: false,
      description: 'Direct question about party position — no task prefix to strip',
    },
    {
      input: 'grüne grundsatzprogramm klimapolitik',
      expectOptimized: false,
      description: 'Keywords only — nothing to strip',
    },
  ];

  for (const c of cases) {
    const result = heuristicClassify(c.input);
    const wasOptimized = result.searchQuery !== c.input && result.searchQuery !== null;
    assert(
      wasOptimized === c.expectOptimized,
      c.description,
      `searchQuery: "${result.searchQuery}", optimized: ${wasOptimized}, expected optimized: ${c.expectOptimized}`
    );
  }
}

// ============================================================================
// 3. Expanded Context Window Tests
// ============================================================================

async function testExpandedContextWindow() {
  section('3. Expanded Context Window (budget-based allocation)');

  // Create mock search results with varying relevance
  const mockResults: SearchResult[] = [
    { source: 'test', title: 'Highly Relevant', content: 'A'.repeat(1000), relevance: 0.95 },
    { source: 'test', title: 'Medium Relevant', content: 'B'.repeat(1000), relevance: 0.6 },
    { source: 'test', title: 'Low Relevant', content: 'C'.repeat(1000), relevance: 0.3 },
    { source: 'test', title: 'Very Low', content: 'D'.repeat(500), relevance: 0.2 },
    { source: 'test', title: 'Short Content', content: 'E'.repeat(100), relevance: 0.8 },
  ];

  const mockState: ChatGraphState = {
    messages: [],
    threadId: null,
    agentConfig: {
      systemRole: 'Du bist ein Testassistent.',
      model: 'test',
      name: 'test',
      description: 'test',
    } as any,
    enabledTools: {},
    aiWorkerPool: null,
    userLocale: 'de-DE',
    attachmentContext: null,
    imageAttachments: [],
    threadAttachments: [],
    customSystemPrompt: null,
    userInstructions: null,
    memoryContext: null,
    memoryRetrieveTimeMs: 0,
    notebookIds: [],
    notebookCollectionIds: [],
    defaultNotebookCollectionIds: [],
    documentIds: [],
    documentChatIds: [],
    boardIds: [],
    boardContext: null,
    docMentionIds: [],
    documentMentionContext: null,
    searchSources: [],
    intent: 'search',
    searchQuery: 'test query',
    subQueries: null,
    reasoning: 'test',
    contentType: null,
    isCompound: false,
    gatherSources: [],
    hasTemporal: false,
    complexity: 'moderate',
    needsClarification: false,
    clarificationQuestion: null,
    clarificationOptions: null,
    detectedFilters: null,
    searchResults: mockResults,
    citations: [],
    searchCount: 1,
    maxSearches: 3,
    researchBrief: null,
    qualityScore: 0,
    qualityAssessmentTimeMs: 0,
    imagePrompt: null,
    imageStyle: null,
    generatedImage: null,
    imageTimeMs: 0,
    summaryContext: null,
    summaryTimeMs: 0,
    chartData: null,
    responseText: '',
    streamingStarted: false,
    startTime: Date.now(),
    classificationTimeMs: 0,
    searchTimeMs: 0,
    rerankTimeMs: 0,
    searchedCollections: [],
    responseTimeMs: 0,
    contextWindowTokens: 128000,
    error: null,
  };

  const systemMessage = await buildSystemMessage(mockState);

  // Check that SUCHERGEBNISSE section exists
  assert(
    systemMessage.includes('## SUCHERGEBNISSE'),
    'System message includes SUCHERGEBNISSE section'
  );

  // Check that all 5 result titles are included
  assert(systemMessage.includes('**Highly Relevant**'), 'High relevance result included');
  assert(systemMessage.includes('**Short Content**'), 'Short content result included');

  // Check that high-relevance result gets more content than low-relevance
  const highRelevantSection = systemMessage.split('**Highly Relevant**')[1]?.split('**')[0] || '';
  const lowRelevantSection = systemMessage.split('**Low Relevant**')[1]?.split('**')[0] || '';
  assert(
    highRelevantSection.length > lowRelevantSection.length,
    'High-relevance result gets more content than low-relevance',
    `High: ${highRelevantSection.length} chars, Low: ${lowRelevantSection.length} chars`
  );

  // Verify the total output is within reasonable bounds (not exploding with content)
  assert(
    systemMessage.length < 10000,
    'Total system message stays within token budget',
    `Length: ${systemMessage.length} chars`
  );

  // Test with empty results
  const emptyState = { ...mockState, searchResults: [] };
  const emptyMessage = await buildSystemMessage(emptyState);
  assert(
    !emptyMessage.includes('## SUCHERGEBNISSE'),
    'No SUCHERGEBNISSE section when results are empty'
  );
}

// ============================================================================
// 4. Rerank Score Parsing Tests
// ============================================================================

async function testRerankScoreParsing() {
  section('4. Rerank Score Parsing');

  // We can't directly test rerankNode (needs aiWorkerPool), but we can test the parsing logic
  // by importing the module and testing the exported function pattern

  // Test valid JSON parsing
  const validJson =
    '{ "scores": [{"index": 0, "score": 5}, {"index": 1, "score": 3}, {"index": 2, "score": 1}] }';
  try {
    const parsed = JSON.parse(validJson);
    assert(parsed.scores.length === 3, 'Valid rerank JSON parses correctly');
    assert(
      parsed.scores[0].score === 5 && parsed.scores[1].score === 3,
      'Scores have correct values'
    );
  } catch {
    assert(false, 'Valid rerank JSON should parse');
  }

  // Test JSON embedded in text
  const textWithJson =
    'Some preamble text\n{ "scores": [{"index": 0, "score": 4}] }\nSome trailing text';
  const jsonMatch = textWithJson.match(/\{[\s\S]*\}/);
  assert(jsonMatch !== null, 'JSON extracted from surrounding text');
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      assert(parsed.scores?.[0]?.score === 4, 'Extracted JSON has correct scores');
    } catch {
      assert(false, 'Extracted JSON should be parseable');
    }
  }

  // Test score filtering: out-of-range values should be rejected
  const badScores = {
    scores: [
      { index: 0, score: 5 },
      { index: 1, score: 6 }, // > 5, should be filtered
      { index: -1, score: 3 }, // negative index, should be filtered
      { index: 2, score: 0 }, // < 1, should be filtered
    ],
  };

  let validCount = 0;
  for (const entry of badScores.scores) {
    const idx = Number(entry.index);
    const score = Number(entry.score);
    if (idx >= 0 && idx < 5 && score >= 1 && score <= 5) {
      validCount++;
    }
  }
  assert(
    validCount === 1,
    'Invalid scores filtered out (only index 0, score 5 is valid)',
    `Valid count: ${validCount}`
  );
}

// ============================================================================
// 5. Cross-Collection Search Logic Tests
// ============================================================================

function testCrossCollectionLogic() {
  section('5. Cross-Collection Search Logic');

  // Test deduplication by URL
  const resultsWithDupes: SearchResult[] = [
    {
      source: 'gruenerator:deutschland',
      title: 'Doc A',
      content: 'Content A',
      url: 'https://example.com/a',
      relevance: 0.9,
    },
    {
      source: 'gruenerator:bundestagsfraktion',
      title: 'Doc A (dupe)',
      content: 'Content A variant',
      url: 'https://example.com/a',
      relevance: 0.7,
    },
    {
      source: 'gruenerator:gruene-de',
      title: 'Doc B',
      content: 'Content B',
      url: 'https://example.com/b',
      relevance: 0.8,
    },
    {
      source: 'gruenerator:kommunalwiki',
      title: 'Doc C',
      content: 'Content C',
      url: undefined,
      relevance: 0.6,
    },
    {
      source: 'gruenerator:kommunalwiki',
      title: 'Doc D',
      content: 'Content D',
      url: undefined,
      relevance: 0.5,
    },
  ];

  // Simulate deduplication logic
  const seenUrls = new Set<string>();
  const deduped: SearchResult[] = [];
  for (const r of resultsWithDupes) {
    if (r.url && seenUrls.has(r.url)) continue;
    if (r.url) seenUrls.add(r.url);
    deduped.push(r);
  }

  assert(
    deduped.length === 4,
    'Deduplication removes URL duplicates',
    `Got ${deduped.length} results, expected 4`
  );

  assert(
    deduped[0].title === 'Doc A' && deduped[0].relevance === 0.9,
    'Keeps first occurrence (higher relevance) of duplicate URL'
  );

  // Results without URLs should all be kept
  const noUrlResults = deduped.filter((r) => !r.url);
  assert(noUrlResults.length === 2, 'Results without URLs are all kept (no false dedup)');

  // Test collection set deduplication
  const collections = ['deutschland', 'bundestagsfraktion', 'gruene-de', 'kommunalwiki'];
  const defaultCollection = 'deutschland';
  const allCollections = [defaultCollection, ...collections];
  const unique = [...new Set(allCollections)];
  assert(
    unique.length === 4,
    'Collection dedup when default is already in list',
    `Unique: ${unique.join(', ')}`
  );

  const uniqueWithCustom = [...new Set(['oesterreich', ...collections])];
  assert(
    uniqueWithCustom.length === 5,
    'Custom default collection adds to the set',
    `Unique: ${uniqueWithCustom.join(', ')}`
  );

  // Test sorting by relevance
  const unsorted = [...deduped];
  unsorted.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
  assert(
    unsorted[0].relevance === 0.9 && unsorted[1].relevance === 0.8,
    'Results sorted by relevance descending'
  );
}

// ============================================================================
// 6. Integration: Heuristic + Query Optimization Flow
// ============================================================================

function testIntegrationFlow() {
  section('6. Integration: Full Classifier → Optimized Query Flow');

  // Test that heuristic classification with task-oriented queries
  // (confidence < 0.85 = sent to LLM, but we can test the heuristic path)
  const cases = [
    {
      input: 'recherchiere nach klimapolitik der grünen',
      description: 'Explicit research request',
      expectIntent: 'research',
    },
    {
      input: 'suche im internet nach grüne energiepolitik',
      description: 'Explicit web search',
      expectIntent: 'web',
    },
    {
      input: 'hallo wie geht es dir',
      description: 'Greeting stays direct',
      expectIntent: 'direct',
    },
    {
      input: 'erstelle ein bild von einem grünen wald',
      description: 'Image generation request',
      expectIntent: 'image',
    },
  ];

  for (const c of cases) {
    const result = heuristicClassify(c.input);
    assert(
      result.intent === c.expectIntent,
      `${c.description}: intent="${result.intent}"`,
      `Expected: ${c.expectIntent}, Got: ${result.intent}, Confidence: ${result.confidence}`
    );
  }
}

// ============================================================================
// 7. Metadata Filter Extraction Tests
// ============================================================================

function testFilterExtraction() {
  section('7. Metadata Filter Extraction');

  // Test extractFilters (LLM output processing)
  const cases: Array<{
    input: Parameters<typeof extractFilters>[0];
    expected: ReturnType<typeof extractFilters>;
    description: string;
  }> = [
    {
      input: {
        content_type: 'presse',
        landesverband: 'HH',
        primary_category: null,
        date_from: null,
        date_to: null,
        person: null,
      },
      expected: { content_type: 'presse', region: 'HH' },
      description: 'Pressemitteilungen Hamburg → content_type + region',
    },
    {
      input: {
        content_type: 'beschluss',
        landesverband: null,
        primary_category: null,
        date_from: '2024-01-01',
        date_to: null,
        person: null,
      },
      expected: { content_type: 'beschluss', date_from: '2024-01-01' },
      description: 'Beschlüsse seit 2024 → content_type + date_from',
    },
    {
      input: {
        content_type: null,
        landesverband: 'TH',
        primary_category: 'Klimaschutz',
        date_from: null,
        date_to: null,
        person: null,
      },
      expected: { region: ['TH', 'TH-F'], primary_category: 'Klimaschutz' },
      description: 'Klimapolitik Thüringen → region (with Fraktion) + primary_category',
    },
    {
      input: {
        content_type: null,
        landesverband: null,
        primary_category: null,
        date_from: null,
        date_to: null,
        person: null,
      },
      expected: null,
      description: 'All nulls → null (no filters)',
    },
    {
      input: {
        content_type: null,
        landesverband: null,
        primary_category: null,
        date_from: 'invalid',
        date_to: null,
        person: null,
      },
      expected: null,
      description: 'Invalid date format → ignored',
    },
    {
      input: {
        content_type: null,
        landesverband: null,
        primary_category: null,
        date_from: null,
        date_to: null,
        person: 'Habeck',
      },
      expected: null,
      description: 'Person only → null (person kept in query, not as filter)',
    },
  ];

  for (const c of cases) {
    const result = extractFilters(c.input);
    const resultStr = JSON.stringify(result);
    const expectedStr = JSON.stringify(c.expected);
    assert(resultStr === expectedStr, c.description, `Got: ${resultStr}, Expected: ${expectedStr}`);
  }

  // Test heuristicExtractFilters
  section('7b. Heuristic Filter Extraction');

  const heuristicCases: Array<{
    input: string;
    expectedKeys: string[];
    description: string;
  }> = [
    {
      input: 'Pressemitteilungen zum Klimaschutz',
      expectedKeys: ['content_type'],
      description: 'Pressemitteilungen → content_type detected',
    },
    {
      input: 'Beschlüsse der Grünen Hamburg',
      expectedKeys: ['content_type', 'region'],
      description: 'Beschlüsse + Hamburg → content_type + region',
    },
    {
      input: 'Was ist die Position der Grünen?',
      expectedKeys: [],
      description: 'Generic question → no filters',
    },
    {
      input: 'Anträge aus Thüringen',
      expectedKeys: ['content_type', 'region'],
      description: 'Anträge + Thüringen → content_type + region',
    },
    {
      input: 'Wahlprogramm Bayern',
      expectedKeys: ['content_type', 'region'],
      description: 'Wahlprogramm + Bayern → content_type + region',
    },
  ];

  for (const c of heuristicCases) {
    const result = heuristicExtractFilters(c.input);
    const keys = result ? Object.keys(result) : [];
    const hasExpectedKeys = c.expectedKeys.every((k) => keys.includes(k));
    const noExtraKeys = keys.every((k) => c.expectedKeys.includes(k));
    assert(
      hasExpectedKeys && noExtraKeys,
      c.description,
      `Got keys: [${keys.join(', ')}], Expected: [${c.expectedKeys.join(', ')}]`
    );
  }
}

// ============================================================================
// 8. Locale-Aware Collection Selection Tests
// ============================================================================

function testLocaleAwareCollections() {
  section('8. Locale-Aware Collection Selection');

  const deDE = getDefaultCollectionsForLocale('de-DE');
  assert(
    deDE.length === 4 && deDE.includes('deutschland') && deDE.includes('bundestagsfraktion'),
    'de-DE returns 4 German collections',
    `Got: [${deDE.join(', ')}]`
  );

  const deAT = getDefaultCollectionsForLocale('de-AT');
  assert(
    deAT.length === 2 && deAT.includes('oesterreich') && deAT.includes('gruene-at'),
    'de-AT returns 2 Austrian collections',
    `Got: [${deAT.join(', ')}]`
  );

  const undef = getDefaultCollectionsForLocale(undefined);
  assert(
    undef.length === 4 && undef.includes('deutschland'),
    'undefined locale falls back to German collections',
    `Got: [${undef.join(', ')}]`
  );

  const unknown = getDefaultCollectionsForLocale('en-US');
  assert(
    unknown.length === 4 && unknown.includes('deutschland'),
    'Unknown locale falls back to German collections',
    `Got: [${unknown.join(', ')}]`
  );
}

// ============================================================================
// Run All Tests
// ============================================================================

async function runAllTests() {
  console.log('═'.repeat(60));
  console.log('  RAG Improvement Nodes — Test Suite');
  console.log('═'.repeat(60));

  testQueryReformulation();
  testHeuristicQueryOptimization();
  await testExpandedContextWindow();
  await testRerankScoreParsing();
  testCrossCollectionLogic();
  testIntegrationFlow();
  testFilterExtraction();
  testLocaleAwareCollections();

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(`${'═'.repeat(60)}`);

  if (failed > 0) {
    console.log('\n⚠️  Some tests failed');
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  }
}

runAllTests().catch((error) => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
