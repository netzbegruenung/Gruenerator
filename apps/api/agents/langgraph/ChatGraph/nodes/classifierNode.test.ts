/**
 * Test file for Classifier Node fuzzy matching
 * Run with: npx tsx apps/api/agents/langgraph/ChatGraph/nodes/classifierNode.test.ts
 *
 * Tests the typo-tolerant classification using Levenshtein-based fuzzy matching.
 */

import { heuristicClassify, fuzzyMatchIntent } from './classifierNode.js';

interface TestCase {
  input: string;
  expectedIntent: string;
  description: string;
}

const fuzzyMatchTests: TestCase[] = [
  // Research intent with typos
  { input: 'recgerchiere', expectedIntent: 'research', description: 'Typo: recgerchiere → recherchiere' },
  { input: 'recherchier', expectedIntent: 'research', description: 'Typo: recherchier → recherchiere' },
  { input: 'recherschiere', expectedIntent: 'research', description: 'Typo: recherschiere → recherchiere' },
  { input: 'untzersuche', expectedIntent: 'research', description: 'Typo: untzersuche → untersuche' },
  { input: 'analysere', expectedIntent: 'research', description: 'Typo: analysere → analysiere' },

  // Web intent with typos
  { input: 'interent', expectedIntent: 'web', description: 'Typo: interent → internet' },
  { input: 'nachrichten', expectedIntent: 'web', description: 'Correct: nachrichten → nachricht' },
  { input: 'aketuell', expectedIntent: 'web', description: 'Typo: aketuell → aktuell' },

  // Image intent with typos
  { input: 'visualesiere', expectedIntent: 'image', description: 'Typo: visualesiere → visualisiere' },
  { input: 'illustreire', expectedIntent: 'image', description: 'Typo: illustreire → illustriere' },

  // Search intent with typos
  // Note: "grüen" (5 chars) vs "grüne" (5 chars) has distance 2 → similarity 0.6 < 0.75 threshold
  // This is acceptable - very short words with multiple errors shouldn't match
  { input: 'positon', expectedIntent: 'search', description: 'Typo: positon → position' },
  { input: 'proramm', expectedIntent: 'search', description: 'Typo: proramm → programm' },
  { input: 'wahlproramm', expectedIntent: 'search', description: 'Typo: wahlproramm → wahlprogramm' },

  // Examples intent with typos
  { input: 'beispeil', expectedIntent: 'examples', description: 'Typo: beispeil → beispiel' },
  { input: 'instagarm', expectedIntent: 'examples', description: 'Typo: instagarm → instagram' },
];

const heuristicTests: TestCase[] = [
  // Full sentence with typos - should still classify correctly
  {
    input: 'recgerchiere nach guide deos hangelar skandal',
    expectedIntent: 'research',
    description: 'Research with typo in "recherchiere"',
  },
  {
    input: 'surch im netz nach klimawandel',
    expectedIntent: 'web',
    description: 'Web search with typo in "such" - fuzzy matches "netz"→web',
  },
  {
    input: 'visualesiere einen sonnenaufgang',
    expectedIntent: 'image',
    description: 'Image request with typo in "visualisiere"',
  },
  {
    input: 'was ist die positon der grüen zu klima',
    expectedIntent: 'search',
    description: 'Search with typos in "position" and "grüne"',
  },

  // Existing exact match patterns should still work
  { input: 'recherchiere nach klimapolitik', expectedIntent: 'research', description: 'Exact match: recherchiere' },
  { input: 'erstelle ein bild von einem baum', expectedIntent: 'image', description: 'Exact match: image generation' },
  { input: 'suche im netz nach nachrichten', expectedIntent: 'web', description: 'Exact match: web search' },
  { input: 'was ist das parteiprogramm der grüne', expectedIntent: 'search', description: 'Exact match: party program' },

  // Non-search queries should remain as direct
  { input: 'hallo wie geht es dir', expectedIntent: 'direct', description: 'Greeting should be direct' },
  { input: 'danke für die hilfe', expectedIntent: 'direct', description: 'Thanks should be direct' },
  { input: 'schreib mir einen tweet', expectedIntent: 'direct', description: 'Creative task without research' },
];

// NEW: Content-type awareness tests
// Fact-based content types with topics should trigger research
const contentTypeTests: TestCase[] = [
  // Fact-based content types that need research
  {
    input: 'erstelle eine pressemitteilung über klimapolitik',
    expectedIntent: 'research',
    description: 'Press release about topic needs research',
  },
  {
    input: 'schreib einen artikel über erneuerbare energien',
    expectedIntent: 'research',
    description: 'Article about topic needs research',
  },
  {
    input: 'verfasse eine rede zum thema mobilität',
    expectedIntent: 'research',
    description: 'Speech about topic needs research',
  },
  {
    input: 'erstelle eine argumentation zu windkraft',
    expectedIntent: 'research',
    description: 'Argumentation about topic needs research',
  },
  {
    input: 'schreib einen bericht über die energiewende',
    expectedIntent: 'research',
    description: 'Report about topic needs research',
  },
  {
    input: 'formuliere eine pressemeldung zur verkehrswende',
    expectedIntent: 'research',
    description: 'Press statement about topic needs research',
  },

  // Creative tasks without fact-based content type stay direct
  {
    input: 'erstelle einen tweet',
    expectedIntent: 'direct',
    description: 'Tweet without topic is creative',
  },
  {
    input: 'schreib mir einen slogan',
    expectedIntent: 'direct',
    description: 'Slogan is creative',
  },
  {
    input: 'formuliere einen witz',
    expectedIntent: 'direct',
    description: 'Joke is creative',
  },
  {
    input: 'schreib mir was nettes',
    expectedIntent: 'direct',
    description: 'Vague creative request stays direct',
  },

  // Edge cases
  {
    input: 'erstelle eine pressemitteilung',
    expectedIntent: 'direct',
    description: 'Press release WITHOUT topic is still direct (no topic marker)',
  },
  {
    input: 'was ist ein artikel',
    expectedIntent: 'direct',
    description: 'Question about article (not creating one) is direct',
  },
];

function runFuzzyMatchTests() {
  console.log('\n='.repeat(60));
  console.log('Testing fuzzyMatchIntent()');
  console.log('='.repeat(60));

  let passed = 0;
  let failed = 0;

  for (const test of fuzzyMatchTests) {
    const result = fuzzyMatchIntent(test.input);
    const success = result === test.expectedIntent;

    if (success) {
      passed++;
      console.log(`✅ ${test.description}`);
      console.log(`   Input: "${test.input}" → ${result}`);
    } else {
      failed++;
      console.log(`❌ ${test.description}`);
      console.log(`   Input: "${test.input}"`);
      console.log(`   Expected: ${test.expectedIntent}, Got: ${result}`);
    }
  }

  console.log(`\nFuzzy Match Results: ${passed}/${fuzzyMatchTests.length} passed`);
  return failed === 0;
}

function runHeuristicTests() {
  console.log('\n='.repeat(60));
  console.log('Testing heuristicClassify()');
  console.log('='.repeat(60));

  let passed = 0;
  let failed = 0;

  for (const test of heuristicTests) {
    const result = heuristicClassify(test.input);
    const success = result.intent === test.expectedIntent;

    if (success) {
      passed++;
      console.log(`✅ ${test.description}`);
      console.log(`   Input: "${test.input}"`);
      console.log(`   Intent: ${result.intent} (${result.reasoning})`);
    } else {
      failed++;
      console.log(`❌ ${test.description}`);
      console.log(`   Input: "${test.input}"`);
      console.log(`   Expected: ${test.expectedIntent}, Got: ${result.intent}`);
      console.log(`   Reasoning: ${result.reasoning}`);
    }
  }

  console.log(`\nHeuristic Results: ${passed}/${heuristicTests.length} passed`);
  return failed === 0;
}

function runContentTypeTests() {
  console.log('\n='.repeat(60));
  console.log('Testing Content-Type Awareness (heuristicClassify)');
  console.log('='.repeat(60));

  let passed = 0;
  let failed = 0;

  for (const test of contentTypeTests) {
    const result = heuristicClassify(test.input);
    const success = result.intent === test.expectedIntent;

    if (success) {
      passed++;
      console.log(`✅ ${test.description}`);
      console.log(`   Input: "${test.input}"`);
      console.log(`   Intent: ${result.intent} (${result.reasoning})`);
    } else {
      failed++;
      console.log(`❌ ${test.description}`);
      console.log(`   Input: "${test.input}"`);
      console.log(`   Expected: ${test.expectedIntent}, Got: ${result.intent}`);
      console.log(`   Reasoning: ${result.reasoning}`);
    }
  }

  console.log(`\nContent-Type Results: ${passed}/${contentTypeTests.length} passed`);
  return failed === 0;
}

async function runAllTests() {
  console.log('='.repeat(60));
  console.log('Classifier Node Tests - Typo Handling & Content Awareness');
  console.log('='.repeat(60));

  const fuzzyPassed = runFuzzyMatchTests();
  const heuristicPassed = runHeuristicTests();
  const contentTypePassed = runContentTypeTests();

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Fuzzy Match Tests: ${fuzzyPassed ? '✅ All passed' : '❌ Some failed'}`);
  console.log(`Heuristic Tests: ${heuristicPassed ? '✅ All passed' : '❌ Some failed'}`);
  console.log(`Content-Type Tests: ${contentTypePassed ? '✅ All passed' : '❌ Some failed'}`);

  if (fuzzyPassed && heuristicPassed && contentTypePassed) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch((error) => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
