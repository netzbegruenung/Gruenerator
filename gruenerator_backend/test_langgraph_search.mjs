/**
 * Test script for the new LangGraph-based search system
 * Run with: node test_langgraph_search.mjs
 */

import dotenv from 'dotenv';
dotenv.config();

async function testSearchSystem() {
  console.log('🧪 Testing LangGraph Search System\n');

  try {
    // Import the search function
    const { runWebSearch } = await import('./agents/langgraph/webSearchGraph.mjs');
    console.log('✅ Successfully imported runWebSearch');

    // Mock AI worker pool for testing
    const mockAIWorkerPool = {
      processRequest: async (request, req) => {
        console.log(`🤖 Mock AI request: ${request.type}`);

        if (request.type === 'text_adjustment' && request.messages[0].content.includes('research_questions')) {
          return {
            success: true,
            content: '{"research_questions":["Test Klimaschutz Hintergrund","Test Klimaschutz aktuelle Entwicklungen","Test Klimaschutz Auswirkungen","Test Klimaschutz Perspektiven"]}'
          };
        }

        if (request.type === 'web_search_summary') {
          return {
            success: true,
            content: 'Test summary: This is a mock AI-generated summary of the search results.'
          };
        }

        if (request.type === 'text_adjustment') {
          return {
            success: true,
            content: '# Test Deep Research Dossier\n\nThis is a mock dossier generated for testing purposes.\n\n## Executive Summary\nMock research findings based on the query.\n\n## Position von Bündnis 90/Die Grünen\nMock official position from Grundsatz documents.\n\n## Faktenlage\nMock analysis of available information.'
          };
        }

        return {
          success: false,
          error: 'Unknown request type in mock'
        };
      }
    };

    // Test 1: Normal Web Search
    console.log('\n📝 Test 1: Normal Web Search');
    console.log('Query: "Klimaschutz Deutschland"');

    const normalResult = await runWebSearch({
      query: 'Klimaschutz Deutschland',
      mode: 'normal',
      user_id: 'test-user',
      searchOptions: {
        maxResults: 3,
        language: 'de-DE',
        includeSummary: true
      },
      aiWorkerPool: mockAIWorkerPool,
      req: null
    });

    if (normalResult.status === 'success') {
      console.log('✅ Normal search completed successfully');
      console.log(`   Results: ${normalResult.results?.length || 0} sources found`);
      console.log(`   Summary: ${normalResult.summary?.generated ? 'Generated' : 'Not generated'}`);
      console.log(`   Duration: ${normalResult.metadata?.duration || 0}ms`);
    } else {
      console.log('❌ Normal search failed:', normalResult.error);
    }

    // Test 2: Deep Research Mode
    console.log('\n📚 Test 2: Deep Research Mode');
    console.log('Query: "Verkehrswende in Deutschland"');

    const deepResult = await runWebSearch({
      query: 'Verkehrswende in Deutschland',
      mode: 'deep',
      user_id: 'test-user',
      searchOptions: {
        maxResults: 8,
        language: 'de-DE'
      },
      aiWorkerPool: mockAIWorkerPool,
      req: null
    });

    if (deepResult.status === 'success') {
      console.log('✅ Deep research completed successfully');
      console.log(`   Research Questions: ${deepResult.researchQuestions?.length || 0} generated`);
      console.log(`   Web Sources: ${deepResult.sources?.length || 0} found`);
      console.log(`   Official Docs: ${deepResult.grundsatzResults?.results?.length || 0} found`);
      console.log(`   Categories: ${Object.keys(deepResult.categorizedSources || {}).length} categories`);
      console.log(`   Dossier: ${deepResult.dossier ? 'Generated' : 'Not generated'}`);
      console.log(`   Duration: ${deepResult.metadata?.duration || 0}ms`);

      if (deepResult.researchQuestions?.length > 0) {
        console.log('   Sample questions:');
        deepResult.researchQuestions.slice(0, 2).forEach((q, i) => {
          console.log(`     ${i + 1}. ${q.substring(0, 60)}...`);
        });
      }
    } else {
      console.log('❌ Deep research failed:', deepResult.error);
    }

    console.log('\n🎉 Test completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Test the unified controller endpoints');
    console.log('2. Test with real AI worker pool');
    console.log('3. Remove old search controllers');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testSearchSystem();