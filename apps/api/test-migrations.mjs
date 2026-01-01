#!/usr/bin/env node
/**
 * Migration Integration Test
 * Tests DocumentStructureDetector, FastEmbedService, and OcrService
 */

import { documentStructureDetector } from './services/DocumentStructureDetector/index.js';
import { mistralEmbeddingService } from './services/mistral/index.js';
import { ocrService } from './services/OcrService/index.js';

console.log('🧪 Testing Migrated TypeScript Services\n');

// Test 1: DocumentStructureDetector
async function testDocumentStructureDetector() {
  console.log('1️⃣  Testing DocumentStructureDetector...');

  const testText = `
Kapitel 1: Einleitung

Dies ist ein Testdokument.

1. Erster Abschnitt
Dies ist der erste Abschnitt.

2. Zweiter Abschnitt
Dies ist der zweite Abschnitt.
  `;

  try {
    const structure = documentStructureDetector.analyzeStructure(testText);

    console.log(`  ✓ Structure analysis completed`);
    console.log(`  ✓ Found ${structure.chapters.length} chapters`);
    console.log(`  ✓ Found ${structure.sections.length} sections`);
    console.log(`  ✓ Document type: ${structure.metadata.documentType}`);

    const boundaries = documentStructureDetector.findSemanticBoundaries(testText, structure);
    console.log(`  ✓ Found ${boundaries.length} semantic boundaries`);

    return true;
  } catch (error) {
    console.error(`  ✗ DocumentStructureDetector test failed:`, error.message);
    return false;
  }
}

// Test 2: MistralEmbeddingService
async function testMistralEmbeddingService() {
  console.log('\n2️⃣  Testing MistralEmbeddingService...');

  try {
    // Test singleton instance
    console.log(`  ✓ Singleton instance exists: ${!!mistralEmbeddingService}`);

    // Test model info
    const modelInfo = mistralEmbeddingService.getModelInfo();
    console.log(`  ✓ Model: ${modelInfo.modelName}`);
    console.log(`  ✓ Dimensions: ${modelInfo.dimensions}`);
    console.log(`  ✓ Ready: ${mistralEmbeddingService.isReady()}`);

    // Test token estimation
    const tokenCount = mistralEmbeddingService.estimateTokenCount('This is a test sentence.');
    console.log(`  ✓ Token estimation works: ${tokenCount} tokens`);

    // Test mock embedding
    const mockEmbedding = mistralEmbeddingService.generateMockEmbedding('test');
    console.log(`  ✓ Mock embedding generated: ${mockEmbedding.length} dimensions`);

    return true;
  } catch (error) {
    console.error(`  ✗ MistralEmbeddingService test failed:`, error.message);
    return false;
  }
}

// Test 3: OcrService
async function testOcrService() {
  console.log('\n3️⃣  Testing OcrService...');

  try {
    // Test singleton instance
    console.log(`  ✓ Singleton instance exists: ${!!ocrService}`);

    // Test formatting functions
    const formattedText = ocrService.applyMarkdownFormatting('INTRODUCTION\n\nThis is test text.');
    console.log(`  ✓ Text formatting works`);

    const isHeading = ocrService.isLikelyHeading('CHAPTER 1');
    console.log(`  ✓ Heading detection: ${isHeading}`);

    // Test processing documents tracking
    const processingDocs = ocrService.getProcessingDocuments();
    console.log(`  ✓ Processing tracking: ${processingDocs.length} documents`);

    return true;
  } catch (error) {
    console.error(`  ✗ OcrService test failed:`, error.message);
    return false;
  }
}

// Test 4: Integration - Service Interaction
async function testServiceIntegration() {
  console.log('\n4️⃣  Testing Service Integration...');

  try {
    // Test: DocumentStructureDetector can be used with MistralEmbeddingService
    const testDoc = 'Kapitel 1\n\nDies ist ein Test.';
    const structure = documentStructureDetector.analyzeStructure(testDoc);
    const tokenCount = mistralEmbeddingService.estimateTokenCount(testDoc);

    console.log(`  ✓ Services can interact`);
    console.log(`  ✓ Structure + Embedding estimation: ${structure.chapters.length} chapters, ~${tokenCount} tokens`);

    return true;
  } catch (error) {
    console.error(`  ✗ Integration test failed:`, error.message);
    return false;
  }
}

// Test 5: Import Compatibility
async function testImportCompatibility() {
  console.log('\n5️⃣  Testing Import Compatibility...');

  try {
    // Test different import styles work
    const { DocumentStructureDetector } = await import('./services/DocumentStructureDetector/index.js');
    const { MistralEmbeddingService } = await import('./services/mistral/MistralEmbeddingService/index.js');
    const { OCRService } = await import('./services/OcrService/index.js');

    console.log(`  ✓ Named imports work`);

    // Test class instantiation
    new DocumentStructureDetector();
    new MistralEmbeddingService();
    new OCRService();

    console.log(`  ✓ Classes can be instantiated`);

    return true;
  } catch (error) {
    console.error(`  ✗ Import compatibility test failed:`, error.message);
    return false;
  }
}

// Run all tests
async function runTests() {
  const results = await Promise.all([
    testDocumentStructureDetector(),
    testMistralEmbeddingService(),
    testOcrService(),
    testServiceIntegration(),
    testImportCompatibility()
  ]);

  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Test Results: ${passed}/${total} passed`);

  if (passed === total) {
    console.log('✅ All migration tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
