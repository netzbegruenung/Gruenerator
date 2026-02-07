/**
 * Test file for Direct Search functionality
 * Run with: npx tsx routes/chat/agents/directSearch.test.ts
 */

import {
  executeDirectSearch,
  // executeDirectPersonSearch, // DISABLED: Person search not production ready
  executeDirectExamplesSearch,
  executeDirectWebSearch,
} from './directSearch.js';

async function runTests() {
  console.log('='.repeat(60));
  console.log('Testing Direct Search Functionality');
  console.log('='.repeat(60));

  // Test 1: Document Search
  console.log('\n--- Test 1: Document Search (Klimaschutz) ---');
  try {
    const searchResult = await executeDirectSearch({
      query: 'Klimaschutz',
      collection: 'deutschland',
      limit: 3,
    });
    console.log('Success:', searchResult.resultsCount > 0 ? '✅' : '❌');
    console.log('Results count:', searchResult.resultsCount);
    if (searchResult.results.length > 0) {
      console.log('First result:', searchResult.results[0].source);
      console.log('Excerpt:', searchResult.results[0].excerpt.substring(0, 100) + '...');
    }
    if (searchResult.error) {
      console.log('Error:', searchResult.message);
    }
  } catch (error: any) {
    console.log('Test failed:', error.message);
  }

  // DISABLED: Person search not production ready
  // // Test 2: Person Search
  // console.log('\n--- Test 2: Person Search (Annalena Baerbock) ---');
  // try {
  //   const personResult = await executeDirectPersonSearch({
  //     query: 'Annalena Baerbock',
  //   });
  //   console.log('Is person query:', personResult.isPersonQuery ? '✅' : '❌');
  //   if (personResult.person) {
  //     console.log('Person found:', personResult.person.name);
  //     console.log('Fraktion:', personResult.person.fraktion || 'N/A');
  //   }
  //   console.log('Results count:', personResult.results.length);
  //   if (personResult.error) {
  //     console.log('Error:', personResult.message);
  //   }
  // } catch (error: any) {
  //   console.log('Test failed:', error.message);
  // }

  // Test 3: Examples Search
  console.log('\n--- Test 3: Examples Search (Klimaschutz) ---');
  try {
    const examplesResult = await executeDirectExamplesSearch({
      query: 'Klimaschutz',
    });
    console.log('Success:', !examplesResult.error ? '✅' : '❌');
    console.log('Examples count:', examplesResult.resultsCount);
    if (examplesResult.examples.length > 0) {
      console.log('First example platform:', examplesResult.examples[0].platform);
    }
    if (examplesResult.error) {
      console.log('Error:', examplesResult.message);
    }
  } catch (error: any) {
    console.log('Test failed:', error.message);
  }

  // Test 4: Web Search
  console.log('\n--- Test 4: Web Search (Grüne aktuell) ---');
  try {
    const webResult = await executeDirectWebSearch({
      query: 'Grüne Partei Deutschland aktuell',
      searchType: 'news',
      maxResults: 3,
    });
    console.log('Success:', !webResult.error ? '✅' : '❌');
    console.log('Results count:', webResult.resultsCount);
    if (webResult.results.length > 0) {
      console.log('First result:', webResult.results[0].title);
      console.log('Domain:', webResult.results[0].domain);
    }
    if (webResult.suggestions && webResult.suggestions.length > 0) {
      console.log('Suggestions:', webResult.suggestions.join(', '));
    }
    if (webResult.error) {
      console.log('Error:', webResult.message);
    }
  } catch (error: any) {
    console.log('Test failed:', error.message);
  }

  // Test 5: Different collections
  console.log('\n--- Test 5: Different Collections ---');
  const collections = ['deutschland', 'bundestagsfraktion', 'kommunalwiki'];
  for (const collection of collections) {
    try {
      const result = await executeDirectSearch({
        query: 'Umwelt',
        collection,
        limit: 1,
      });
      console.log(`${collection}: ${result.resultsCount > 0 ? '✅' : '❌'} (${result.resultsCount} results)`);
    } catch (error: any) {
      console.log(`${collection}: ❌ (${error.message})`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Tests completed');
  console.log('='.repeat(60));
}

// Run tests
runTests().catch(console.error);
