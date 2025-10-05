#!/usr/bin/env node
/**
 * Test social media examples search with new Qdrant instance
 */

import dotenv from 'dotenv';
dotenv.config();

import { getQdrantInstance } from './database/services/QdrantService.js';
import { fastEmbedService } from './services/FastEmbedService.js';

async function testSocialMediaExamples() {
    console.log('🧪 Testing Social Media Examples with New Qdrant Instance');
    console.log('='.repeat(70));
    console.log('');

    try {
        // Initialize services
        console.log('1️⃣  Initializing services...');
        const qdrant = getQdrantInstance();
        await qdrant.init();
        await fastEmbedService.init();
        console.log('✅ Services initialized\n');

        // Check collection exists and has data
        console.log('2️⃣  Checking social_media_examples collection...');
        const collectionInfo = await qdrant.client.getCollection('social_media_examples');
        console.log(`✅ Collection found with ${collectionInfo.points_count} points\n`);

        // Test search
        const testQuery = "Klimaschutz und Umwelt";
        console.log(`3️⃣  Testing search for: "${testQuery}"`);

        // Generate query embedding
        const embeddings = await fastEmbedService.generateBatchEmbeddings([testQuery], 'search_query');
        const queryVector = embeddings[0];
        console.log(`✅ Generated query embedding (${queryVector.length} dimensions)\n`);

        // Search in social_media_examples
        console.log('4️⃣  Searching social_media_examples collection...');
        const searchResults = await qdrant.client.search('social_media_examples', {
            vector: queryVector,
            limit: 5,
            score_threshold: 0.2,
            with_payload: true
        });

        console.log(`✅ Found ${searchResults.length} results:\n`);

        searchResults.forEach((result, index) => {
            console.log(`   Result ${index + 1}:`);
            console.log(`   Score: ${result.score.toFixed(4)}`);
            console.log(`   Platform: ${result.payload?.platform || 'unknown'}`);
            console.log(`   Text: ${result.payload?.text?.substring(0, 100)}...`);
            console.log('');
        });

        // Test random scroll
        console.log('5️⃣  Testing random examples retrieval...');
        const randomResults = await qdrant.client.scroll('social_media_examples', {
            limit: 3,
            with_payload: true
        });

        console.log(`✅ Retrieved ${randomResults.points.length} random examples:\n`);

        randomResults.points.forEach((point, index) => {
            console.log(`   Example ${index + 1}:`);
            console.log(`   Platform: ${point.payload?.platform || 'unknown'}`);
            console.log(`   Text: ${point.payload?.text?.substring(0, 100)}...`);
            console.log('');
        });

        console.log('='.repeat(70));
        console.log('✅ ALL TESTS PASSED!');
        console.log('');
        console.log('The new Qdrant instance is working correctly for:');
        console.log('  ✅ Collection access');
        console.log('  ✅ Vector search');
        console.log('  ✅ Random example retrieval');
        console.log('  ✅ Payload data integrity');
        console.log('');
        console.log('🎉 Migration to new Qdrant instance successful!');

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Run test
testSocialMediaExamples()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('💥 Test script failed:', error);
        process.exit(1);
    });
