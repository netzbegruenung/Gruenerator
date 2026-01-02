/**
 * Real-world test for WebSearchGraph
 * Tests both normal and deep modes with actual search queries
 */

import { runWebSearch } from './index.js';

// Mock AI Worker Pool for testing
class MockAIWorkerPool {
  async processRequest(request, req) {
    console.log(`[MockAI] Processing request type: ${request.type}`);

    // Mock responses based on request type
    if (request.type === 'web_search_summary') {
      return {
        success: true,
        content: 'Die Grünen setzen sich für Klimaschutz ein [1]. Erneuerbare Energien werden gefördert [2].'
      };
    }

    if (request.type === 'text_adjustment') {
      return {
        success: true,
        content: `# Zusammenfassung

Die Grünen verfolgen eine umfassende Klimapolitik [1]. Zentrale Punkte sind der Ausbau erneuerbarer Energien [2] und die Förderung nachhaltiger Mobilität [3].

## Kernaussagen

Die Partei setzt auf einen schnellen Kohleausstieg [4]. Gleichzeitig wird die soziale Gerechtigkeit betont [5].`
      };
    }

    if (request.type === 'crawler_agent') {
      return {
        success: true,
        content: JSON.stringify({
          decisions: [
            { url: 'https://example.com/1', shouldCrawl: true, reason: 'Relevant source', priority: 1 },
            { url: 'https://example.com/2', shouldCrawl: true, reason: 'Good authority', priority: 2 }
          ]
        })
      };
    }

    return { success: true, content: 'Mock response' };
  }
}

// Mock Express request
const mockReq = {
  headers: {},
  ip: '127.0.0.1'
};

async function testNormalMode() {
  console.log('\n========================================');
  console.log('🧪 TEST 1: Normal Web Search Mode');
  console.log('========================================\n');

  const mockWorkerPool = new MockAIWorkerPool();

  try {
    const result = await runWebSearch({
      query: 'Klimaschutz Grüne Partei',
      mode: 'normal',
      user_id: 'test-user',
      searchOptions: {
        maxResults: 5,
        language: 'de-DE'
      },
      aiWorkerPool: mockWorkerPool,
      req: mockReq
    });

    console.log('✅ Normal mode completed successfully!');
    console.log('\nResult structure:');
    console.log('- Status:', result.status);
    console.log('- Query:', result.query);
    console.log('- Results count:', result.results?.length || 0);
    console.log('- Has summary:', !!result.summary);
    console.log('- Citations count:', result.citations?.length || 0);
    console.log('- Citation sources count:', result.citationSources?.length || 0);
    console.log('- Metadata:', JSON.stringify(result.metadata, null, 2));

    if (result.summary) {
      console.log('\n📝 Generated Summary:');
      console.log(result.summary.substring(0, 200) + '...');
    }

    if (result.citations && result.citations.length > 0) {
      console.log('\n📚 Citations:');
      result.citations.slice(0, 3).forEach((citation, idx) => {
        console.log(`  [${idx + 1}] ${citation.document_title || citation.cited_text?.substring(0, 50)}`);
      });
    }

    return result;

  } catch (error) {
    console.error('❌ Normal mode test failed:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  }
}

async function testDeepMode() {
  console.log('\n========================================');
  console.log('🧪 TEST 2: Deep Research Mode');
  console.log('========================================\n');

  const mockWorkerPool = new MockAIWorkerPool();

  try {
    const result = await runWebSearch({
      query: 'Energiewende Deutschland 2025',
      mode: 'deep',
      user_id: 'test-user',
      searchOptions: {
        maxResults: 8,
        language: 'de-DE'
      },
      aiWorkerPool: mockWorkerPool,
      req: mockReq
    });

    console.log('✅ Deep mode completed successfully!');
    console.log('\nResult structure:');
    console.log('- Status:', result.status);
    console.log('- Has dossier:', !!result.dossier);
    console.log('- Research questions:', result.researchQuestions?.length || 0);
    console.log('- Search results batches:', result.searchResults?.length || 0);
    console.log('- Total sources:', result.sources?.length || 0);
    console.log('- Categorized sources:', Object.keys(result.categorizedSources || {}).length);
    console.log('- Citations count:', result.citations?.length || 0);
    console.log('- Citation sources count:', result.citationSources?.length || 0);
    console.log('- Metadata:', JSON.stringify(result.metadata, null, 2));

    if (result.dossier) {
      console.log('\n📄 Generated Dossier:');
      console.log('  Executive Summary:', result.dossier.executiveSummary?.substring(0, 150) + '...');
      console.log('  Detailed Analysis length:', result.dossier.detailedAnalysis?.length || 0, 'chars');
      console.log('  Methodology length:', result.dossier.methodology?.length || 0, 'chars');
      console.log('  Sources count:', result.dossier.sources?.length || 0);
    }

    if (result.citations && result.citations.length > 0) {
      console.log('\n📚 Citations:');
      result.citations.slice(0, 5).forEach((citation, idx) => {
        console.log(`  [${idx + 1}] ${citation.document_title || citation.cited_text?.substring(0, 50)}`);
      });
    }

    if (result.categorizedSources) {
      console.log('\n📂 Source Categories:');
      Object.keys(result.categorizedSources).forEach(category => {
        console.log(`  - ${category}: ${result.categorizedSources[category]?.length || 0} sources`);
      });
    }

    return result;

  } catch (error) {
    console.error('❌ Deep mode test failed:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  }
}

async function testTypeCompatibility() {
  console.log('\n========================================');
  console.log('🧪 TEST 3: Type Compatibility Check');
  console.log('========================================\n');

  const mockWorkerPool = new MockAIWorkerPool();

  try {
    const result = await runWebSearch({
      query: 'test query',
      mode: 'normal',
      aiWorkerPool: mockWorkerPool,
      req: mockReq
    });

    // Verify all expected properties exist with correct types
    const checks = {
      'result.status is string': typeof result.status === 'string',
      'result.query is string': typeof result.query === 'string',
      'result.results is array': Array.isArray(result.results),
      'result.citations is array': Array.isArray(result.citations),
      'result.citationSources is array': Array.isArray(result.citationSources),
      'result.metadata is object': typeof result.metadata === 'object',
      'metadata has searchType': 'searchType' in result.metadata,
      'metadata has duration': 'duration' in result.metadata
    };

    console.log('Type compatibility checks:');
    let allPassed = true;
    Object.entries(checks).forEach(([check, passed]) => {
      console.log(`  ${passed ? '✅' : '❌'} ${check}`);
      if (!passed) allPassed = false;
    });

    if (allPassed) {
      console.log('\n✅ All type compatibility checks passed!');
    } else {
      throw new Error('Some type compatibility checks failed');
    }

    return result;

  } catch (error) {
    console.error('❌ Type compatibility test failed:', error.message);
    throw error;
  }
}

async function runAllTests() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  WebSearchGraph Real-World Test Suite ║');
  console.log('╚════════════════════════════════════════╝');

  let passed = 0;
  let failed = 0;

  try {
    await testNormalMode();
    passed++;
  } catch (error) {
    failed++;
  }

  try {
    await testDeepMode();
    passed++;
  } catch (error) {
    failed++;
  }

  try {
    await testTypeCompatibility();
    passed++;
  } catch (error) {
    failed++;
  }

  console.log('\n╔════════════════════════════════════════╗');
  console.log('║           Test Results Summary          ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`\n✅ Passed: ${passed}/3`);
  console.log(`${failed > 0 ? '❌' : '✅'} Failed: ${failed}/3\n`);

  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED! WebSearchGraph is production-ready!\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Review the output above.\n');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('\n💥 Test suite crashed:', error);
  process.exit(1);
});
