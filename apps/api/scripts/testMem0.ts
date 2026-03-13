/**
 * Test script for mem0 integration.
 * Run with: npx tsx scripts/testMem0.ts
 */

import 'dotenv/config';
import { getMem0Instance } from '../services/mem0/index.js';

// Use a valid UUID format for testing (random but valid UUID)
const TEST_USER_ID = crypto.randomUUID();

async function main() {
  console.log('🧠 Testing mem0 integration...\n');

  // Get mem0 instance
  const mem0 = getMem0Instance();

  if (!mem0) {
    console.error('❌ mem0 not available. Check environment variables:');
    console.error('   - LITELLM_API_KEY');
    console.error('   - MISTRAL_API_KEY');
    console.error('   - QDRANT_URL');
    process.exit(1);
  }

  console.log('✅ mem0 instance created\n');

  try {
    // Test 1: Add memories from a conversation
    console.log('📝 Test 1: Adding memories from conversation...');
    const messages = [
      {
        role: 'user' as const,
        content: 'Ich bevorzuge formelle Anrede und bin Mitglied im Ortsverband München-Süd.',
      },
      {
        role: 'assistant' as const,
        content:
          'Verstanden! Ich werde Sie ab jetzt formell ansprechen. Schön, dass Sie im OV München-Süd aktiv sind.',
      },
    ];

    const added = await mem0.addMemories(messages, TEST_USER_ID, {
      threadId: 'test-thread-1',
      source: 'test-script',
    });

    console.log(`   Added ${added.length} memories:`);
    added.forEach((m, i) => console.log(`   ${i + 1}. "${m.memory}"`));
    console.log();

    // Test 2: Search for memories
    console.log('🔍 Test 2: Searching memories...');
    const searchResults = await mem0.searchMemories(
      'Wie soll ich den Nutzer ansprechen?',
      TEST_USER_ID,
      5
    );

    console.log(`   Found ${searchResults.length} relevant memories:`);
    searchResults.forEach((m, i) =>
      console.log(`   ${i + 1}. "${m.memory}" (score: ${m.score?.toFixed(3) || 'N/A'})`)
    );
    console.log();

    // Test 3: Get all memories
    console.log('📋 Test 3: Getting all memories...');
    const allMemories = await mem0.getAllMemories(TEST_USER_ID);

    console.log(`   Total memories for user: ${allMemories.length}`);
    allMemories.forEach((m, i) => console.log(`   ${i + 1}. "${m.memory}"`));
    console.log();

    // Test 4: Delete all test memories (cleanup)
    console.log('🧹 Test 4: Cleaning up test memories...');
    const deleted = await mem0.deleteAllUserMemories(TEST_USER_ID);
    console.log(`   Cleanup ${deleted ? 'successful' : 'failed'}`);
    console.log();

    console.log('✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main();
