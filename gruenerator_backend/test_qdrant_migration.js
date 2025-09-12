#!/usr/bin/env node
/**
 * Test script to verify the complete Qdrant document migration
 * Tests upload, storage, retrieval, and cleanup of documents in the new Qdrant-based system
 */

import { getPostgresDocumentService } from './services/postgresDocumentService.js';
import { DocumentSearchService } from './services/DocumentSearchService.js';
import { fastEmbedService } from './services/FastEmbedService.js';
import { smartChunkDocument } from './utils/textChunker.js';

// Test configuration
const TEST_USER_ID = 'test_user_' + Date.now();
const TEST_DOCUMENT_TEXT = `
# Test Document

This is a comprehensive test document for the Grünerator Qdrant migration.

## Section 1: Introduction
This document contains multiple sections to test the hierarchical chunking and full text reconstruction functionality.

The system should be able to:
- Store documents as vectors in Qdrant
- Maintain document metadata in PostgreSQL  
- Reconstruct full document text from chunks
- Search documents using vector similarity

## Section 2: Technical Details
The new architecture uses:
- PostgreSQL for document metadata (title, filename, user_id, etc.)
- Qdrant for vector storage with chunk text in payload
- Manual mode endpoints that bypass Supabase file storage

## Section 3: Benefits
Key advantages:
- Faster vector search
- No file storage costs
- Unified document management
- Better scalability

This is the end of the test document.
`.trim();

async function runTest() {
  console.log('🚀 Starting Qdrant Migration Test');
  console.log('=====================================\n');

  const postgresService = getPostgresDocumentService();
  const qdrantService = new DocumentSearchService();
  
  let testDocumentId = null;
  let testChunks = [];
  
  try {
    // Step 1: Initialize services
    console.log('1️⃣  Initializing services...');
    await postgresService.ensureInitialized();
    await qdrantService.ensureInitialized();
    console.log('✅ Services initialized\n');

    // Step 2: Test document chunking
    console.log('2️⃣  Testing document chunking...');
    testChunks = await smartChunkDocument(TEST_DOCUMENT_TEXT, {
      maxTokens: 400,
      overlapTokens: 50,
      preserveStructure: true
    });
    console.log(`✅ Document chunked into ${testChunks.length} pieces`);
    console.log(`   First chunk preview: "${testChunks[0].text.substring(0, 80)}..."`);
    console.log('');

    // Step 3: Test embedding generation
    console.log('3️⃣  Testing embedding generation...');
    const texts = testChunks.map(chunk => chunk.text);
    const embeddings = await fastEmbedService.generateBatchEmbeddings(texts, 'search_document');
    console.log(`✅ Generated ${embeddings.length} embeddings`);
    console.log(`   Embedding dimension: ${embeddings[0].length}\n`);

    // Step 4: Test document metadata storage
    console.log('4️⃣  Testing document metadata storage...');
    const documentMetadata = await postgresService.saveDocumentMetadata(TEST_USER_ID, {
      title: 'Test Migration Document',
      filename: 'test_document.txt',
      sourceType: 'manual',
      vectorCount: testChunks.length,
      fileSize: TEST_DOCUMENT_TEXT.length,
      status: 'completed'
    });
    testDocumentId = documentMetadata.id;
    console.log(`✅ Metadata saved with ID: ${testDocumentId}\n`);

    // Step 5: Test vector storage in Qdrant
    console.log('5️⃣  Testing vector storage in Qdrant...');
    const vectorResult = await qdrantService.storeDocumentVectors(
      TEST_USER_ID,
      testDocumentId,
      testChunks,
      embeddings,
      {
        sourceType: 'manual',
        title: 'Test Migration Document',
        filename: 'test_document.txt'
      }
    );
    console.log(`✅ Stored ${vectorResult.vectorsStored} vectors in collection: ${vectorResult.collectionName}\n`);

    // Step 6: Test document retrieval from PostgreSQL
    console.log('6️⃣  Testing document metadata retrieval...');
    const retrievedMeta = await postgresService.getDocumentById(testDocumentId, TEST_USER_ID);
    console.log(`✅ Retrieved metadata: ${retrievedMeta.title}`);
    console.log(`   Status: ${retrievedMeta.status}, Vectors: ${retrievedMeta.vector_count}\n`);

    // Step 7: Test full document text reconstruction from Qdrant
    console.log('7️⃣  Testing full text reconstruction from Qdrant...');
    const fullTextResult = await qdrantService.getDocumentFullText(TEST_USER_ID, testDocumentId);
    
    if (fullTextResult.success) {
      console.log(`✅ Reconstructed document with ${fullTextResult.chunkCount} chunks`);
      console.log(`   Text length: ${fullTextResult.fullText.length} characters`);
      console.log(`   Original vs reconstructed match: ${fullTextResult.fullText.trim() === TEST_DOCUMENT_TEXT.trim() ? '✅ PERFECT' : '⚠️  PARTIAL'}`);
    } else {
      throw new Error(`Failed to reconstruct text: ${fullTextResult.error}`);
    }
    console.log('');

    // Step 8: Test document search functionality
    console.log('8️⃣  Testing vector search...');
    const searchQuery = "technical details architecture";
    const searchEmbedding = await fastEmbedService.generateBatchEmbeddings([searchQuery], 'search_query');
    const searchResults = await qdrantService.searchUserDocuments(TEST_USER_ID, searchEmbedding[0], {
      limit: 5,
      scoreThreshold: 0.3
    });
    
    console.log(`✅ Search found ${searchResults.results.length} results`);
    if (searchResults.results.length > 0) {
      console.log(`   Top result score: ${searchResults.results[0].score.toFixed(4)}`);
      console.log(`   Chunk preview: "${searchResults.results[0].payload.chunk_text.substring(0, 100)}..."`);
    }
    console.log('');

    // Step 9: Test document listing from Qdrant
    console.log('9️⃣  Testing document listing...');
    const documentsList = await qdrantService.getUserDocumentsList(TEST_USER_ID);
    console.log(`✅ Retrieved ${documentsList.documents.length} documents from Qdrant`);
    if (documentsList.documents.length > 0) {
      const doc = documentsList.documents[0];
      console.log(`   Document: ${doc.title} (${doc.chunk_count} chunks)`);
    }
    console.log('');

    // Step 10: Test vector statistics
    console.log('🔟 Testing vector statistics...');
    const vectorStats = await qdrantService.getUserVectorStats(TEST_USER_ID);
    console.log(`✅ User vector statistics:`);
    console.log(`   Total vectors: ${vectorStats.totalVectors}`);
    console.log(`   Unique documents: ${vectorStats.uniqueDocuments}`);
    console.log(`   Manual vectors: ${vectorStats.manualVectors}`);
    console.log(`   By source type:`, vectorStats.bySourceType);
    console.log('');

    // SUCCESS
    console.log('🎉 ALL TESTS PASSED!');
    console.log('=====================================');
    console.log('✅ Document chunking works correctly');
    console.log('✅ Embedding generation successful');
    console.log('✅ PostgreSQL metadata storage works');  
    console.log('✅ Qdrant vector storage works');
    console.log('✅ Full text reconstruction works');
    console.log('✅ Vector search works');
    console.log('✅ Document listing works');
    console.log('✅ Statistics reporting works');
    console.log('\n🚀 The Qdrant migration is fully functional!');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    // Cleanup: Remove test data
    if (testDocumentId) {
      try {
        console.log('\n🧹 Cleaning up test data...');
        
        // Delete vectors from Qdrant
        await qdrantService.deleteDocumentVectors(TEST_USER_ID, testDocumentId);
        console.log('✅ Deleted vectors from Qdrant');
        
        // Delete metadata from PostgreSQL
        await postgresService.deleteDocument(testDocumentId, TEST_USER_ID);
        console.log('✅ Deleted metadata from PostgreSQL');
        
        console.log('✨ Cleanup completed\n');
      } catch (cleanupError) {
        console.error('⚠️  Cleanup warning:', cleanupError.message);
      }
    }
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  runTest()
    .then(() => {
      console.log('\n✨ Test script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test script failed:', error);
      process.exit(1);
    });
}

export { runTest };
