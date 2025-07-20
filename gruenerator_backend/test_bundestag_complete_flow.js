#!/usr/bin/env node

/**
 * Comprehensive Test Script for Bundestag Document to Claude API Flow
 * 
 * This test combines and extends the functionality from test_bundestag_flow.js and test_bundestag_api.js
 * to provide complete end-to-end testing of the Bundestag document integration pipeline.
 * 
 * Tests covered:
 * 1. Bundestag API authentication and connection
 * 2. Document search functionality  
 * 3. Document enhancement with full text retrieval
 * 4. Frontend document selection simulation
 * 5. Antrag generation with Bundestag documents
 * 6. AI Worker integration and Claude API processing
 * 7. End-to-end validation of document influence on generated content
 */

require('dotenv').config();
const axios = require('axios');
const bundestagApiClient = require('./services/bundestagApiClient');
const { processBundestagDocuments } = require('./utils/bundestagUtils');

// Test configuration
const TEST_CONFIG = {
  backendUrl: 'http://localhost:3001',
  searchTerms: ['klimaschutz', 'umwelt', 'verkehr', 'energie', 'bundestag'],
  maxDocumentsToTest: 5,
  timeout: 60000, // 60 second timeout for AI generation
  testAntragData: {
    idee: 'Klimaschutz und nachhaltige Mobilität in der Gemeinde',
    details: 'Förderung von Elektromobilität und Ausbau des ÖPNV',
    requestType: 'antrag'
  }
};

console.log('🧪 COMPREHENSIVE BUNDESTAG TO CLAUDE API FLOW TEST');
console.log('='.repeat(80));
console.log(`Backend URL: ${TEST_CONFIG.backendUrl}`);
console.log(`Test timeout: ${TEST_CONFIG.timeout/1000}s`);
console.log('');

async function runComprehensiveTest() {
  const testResults = {
    apiConnection: false,
    documentSearch: false,
    documentEnhancement: false,
    antragGeneration: false,
    documentInfluence: false,
    documentsWithText: [],
    generatedContent: null,
    errors: []
  };

  try {
    // =========================================================================
    // STEP 1: Test Bundestag API Connection and Authentication
    // =========================================================================
    console.log('📋 STEP 1: Testing Bundestag API Connection and Authentication');
    console.log('='.repeat(60));

    if (!process.env.BUNDESTAG_API_KEY) {
      throw new Error('❌ BUNDESTAG_API_KEY environment variable is not set');
    }

    console.log('✅ API Key found in environment');
    
    try {
      const connectionTest = await bundestagApiClient.testConnection();
      if (connectionTest) {
        console.log('✅ Bundestag API connection successful');
        testResults.apiConnection = true;
      } else {
        throw new Error('API connection test returned false');
      }
    } catch (error) {
      console.log(`❌ Bundestag API connection failed: ${error.message}`);
      testResults.errors.push(`API Connection: ${error.message}`);
    }

    // =========================================================================
    // STEP 2: Test Document Search Functionality
    // =========================================================================
    console.log('\n📋 STEP 2: Testing Document Search Functionality');
    console.log('='.repeat(60));

    let searchResults = null;
    let allDocuments = [];

    for (const term of TEST_CONFIG.searchTerms) {
      console.log(`\n🔍 Testing search term: "${term}"`);
      
      try {
        const searchResponse = await axios.post(`${TEST_CONFIG.backendUrl}/api/bundestag/search`, {
          query: term,
          includeDrucksachen: true,
          includePlenarprotokolle: true,
          includeVorgaenge: false,
          maxDrucksachen: 3,
          maxPlenarprotokolle: 2
        });

        if (searchResponse.data.success && searchResponse.data.totalResults > 0) {
          console.log(`  ✅ Found ${searchResponse.data.totalResults} documents`);
          console.log(`  - Drucksachen: ${searchResponse.data.results.drucksachen.length}`);
          console.log(`  - Plenarprotokolle: ${searchResponse.data.results.plenarprotokolle.length}`);
          
          // Collect all documents
          allDocuments.push(...searchResponse.data.results.drucksachen);
          allDocuments.push(...searchResponse.data.results.plenarprotokolle);
          
          if (!searchResults) {
            searchResults = searchResponse.data;
            testResults.documentSearch = true;
          }
          
          // Stop if we have enough documents
          if (allDocuments.length >= TEST_CONFIG.maxDocumentsToTest) {
            break;
          }
        } else {
          console.log(`  ⚠️  No documents found for "${term}"`);
        }
      } catch (error) {
        console.log(`  ❌ Search failed for "${term}": ${error.message}`);
        testResults.errors.push(`Search ${term}: ${error.message}`);
      }
    }

    if (!searchResults || allDocuments.length === 0) {
      throw new Error('No documents found with any search terms');
    }

    console.log(`\n✅ Document search completed. Total documents found: ${allDocuments.length}`);

    // =========================================================================
    // STEP 3: Test Document Enhancement with Full Text Retrieval
    // =========================================================================
    console.log('\n📋 STEP 3: Testing Document Enhancement with Full Text');
    console.log('='.repeat(60));

    const documentsToTest = allDocuments.slice(0, TEST_CONFIG.maxDocumentsToTest);
    let documentsWithText = [];

    for (let i = 0; i < documentsToTest.length; i++) {
      const doc = documentsToTest[i];
      console.log(`\n🔍 Testing document ${i + 1}/${documentsToTest.length}: ${doc.id}`);
      console.log(`  - Title: ${doc.title}`);
      console.log(`  - Type: ${doc.type}`);
      console.log(`  - Date: ${doc.date || 'N/A'}`);

      try {
        // Test direct Bundestag API client (bypassing Express auth)
        const fullDoc = await bundestagApiClient.getDocumentById(doc.id, doc.type);
        
        if (fullDoc) {
          console.log(`  - Has text: ${!!fullDoc.text}`);
          console.log(`  - Text length: ${fullDoc.text ? fullDoc.text.length : 0}`);
          
          if (fullDoc.text && fullDoc.text.length > 100) {
            console.log(`  ✅ Document has substantial text content`);
            console.log(`  - Text preview: ${fullDoc.text.substring(0, 150)}...`);
            
            documentsWithText.push({
              ...doc,
              text: fullDoc.text,
              titel: fullDoc.titel || doc.title,
              dokumentnummer: fullDoc.dokumentnummer || doc.nummer
            });
          } else {
            console.log(`  ⚠️  Document has minimal or no text content`);
          }
        }
      } catch (error) {
        console.log(`  ❌ Failed to fetch document: ${error.message}`);
        testResults.errors.push(`Document fetch ${doc.id}: ${error.message}`);
      }
    }

    if (documentsWithText.length > 0) {
      console.log(`\n✅ Document enhancement completed. ${documentsWithText.length} documents with text found`);
      testResults.documentEnhancement = true;
      testResults.documentsWithText = documentsWithText;
    } else {
      console.log(`\n⚠️  No documents with substantial text content found`);
      // Use first document anyway for testing
      documentsWithText = documentsToTest.slice(0, 1);
      testResults.documentsWithText = documentsWithText;
    }

    // =========================================================================
    // STEP 4: Test Frontend Document Selection Simulation
    // =========================================================================
    console.log('\n📋 STEP 4: Simulating Frontend Document Selection');
    console.log('='.repeat(60));

    // Select the best document with text (or first available)
    const selectedDocument = documentsWithText[0];
    
    // Format like the frontend would for react-select
    const frontendFormattedDocument = {
      ...selectedDocument,
      value: `${selectedDocument.type}_${selectedDocument.id}`,
      label: selectedDocument.title || selectedDocument.titel,
      subtitle: `${selectedDocument.nummer || selectedDocument.dokumentnummer || 'N/A'} • ${selectedDocument.wahlperiode || 'N/A'}. WP • ${selectedDocument.date || 'N/A'}`
    };

    console.log('✅ Document formatted for frontend selection:');
    console.log(`  - ID: ${frontendFormattedDocument.id}`);
    console.log(`  - Value: ${frontendFormattedDocument.value}`);
    console.log(`  - Label: ${frontendFormattedDocument.label}`);
    console.log(`  - Subtitle: ${frontendFormattedDocument.subtitle}`);
    console.log(`  - Has text: ${!!frontendFormattedDocument.text}`);
    console.log(`  - Text length: ${frontendFormattedDocument.text ? frontendFormattedDocument.text.length : 0}`);

    // =========================================================================
    // STEP 5: Test Bundestag Utils Processing
    // =========================================================================
    console.log('\n📋 STEP 5: Testing Bundestag Utils Document Processing');
    console.log('='.repeat(60));

    try {
      const processedResult = await processBundestagDocuments([frontendFormattedDocument]);
      
      if (processedResult && processedResult.enhancedDocuments) {
        console.log('✅ Document processing successful:');
        console.log(`  - Total results: ${processedResult.enhancedDocuments.totalResults}`);
        console.log(`  - Drucksachen: ${processedResult.enhancedDocuments.results.drucksachen.length}`);
        console.log(`  - Plenarprotokolle: ${processedResult.enhancedDocuments.results.plenarprotokolle.length}`);
        console.log(`  - Formatted text length: ${processedResult.formattedText ? processedResult.formattedText.length : 0}`);
        
        if (processedResult.formattedText) {
          console.log(`  - Formatted text preview: ${processedResult.formattedText.substring(0, 200)}...`);
        }
      } else {
        throw new Error('Document processing returned empty result');
      }
    } catch (error) {
      console.log(`❌ Document processing failed: ${error.message}`);
      testResults.errors.push(`Document processing: ${error.message}`);
    }

    // =========================================================================
    // STEP 6: Test Antrag Generation with Bundestag Documents
    // =========================================================================
    console.log('\n📋 STEP 6: Testing Antrag Generation with Bundestag Documents');
    console.log('='.repeat(60));

    const antragPayload = {
      requestType: TEST_CONFIG.testAntragData.requestType,
      idee: TEST_CONFIG.testAntragData.idee,
      details: TEST_CONFIG.testAntragData.details,
      useBedrock: true, // Use Bedrock for testing
      useWebSearchTool: false,
      useBundestagApi: true,
      selectedBundestagDocuments: [frontendFormattedDocument]
    };

    console.log('📤 Sending antrag request with payload:');
    console.log(`  - Request type: ${antragPayload.requestType}`);
    console.log(`  - Idee: ${antragPayload.idee}`);
    console.log(`  - Use Bundestag API: ${antragPayload.useBundestagApi}`);
    console.log(`  - Selected documents: ${antragPayload.selectedBundestagDocuments.length}`);
    console.log(`  - Document ID: ${antragPayload.selectedBundestagDocuments[0].id}`);
    console.log(`  - Document title: ${antragPayload.selectedBundestagDocuments[0].title}`);

    try {
      const antragResponse = await axios.post(
        `${TEST_CONFIG.backendUrl}/api/antraege/generate-simple`, 
        antragPayload,
        { timeout: TEST_CONFIG.timeout }
      );

      if (antragResponse.data && antragResponse.data.content) {
        console.log('\n✅ Antrag generation successful!');
        console.log(`  - Response length: ${antragResponse.data.content.length}`);
        console.log(`  - Bundestag documents used: ${antragResponse.data.metadata?.bundestagDocumentsUsed || 0}`);
        console.log(`  - Provider: ${antragResponse.data.metadata?.provider || 'unknown'}`);
        console.log(`  - Model: ${antragResponse.data.metadata?.modelUsed || antragResponse.data.metadata?.model || 'unknown'}`);
        
        testResults.antragGeneration = true;
        testResults.generatedContent = antragResponse.data.content;
      } else {
        throw new Error('Antrag generation returned empty content');
      }
    } catch (error) {
      console.log(`❌ Antrag generation failed: ${error.message}`);
      testResults.errors.push(`Antrag generation: ${error.message}`);
      
      if (error.response) {
        console.log(`  - Response status: ${error.response.status}`);
        console.log(`  - Response data: ${JSON.stringify(error.response.data, null, 2)}`);
      }
    }

    // =========================================================================
    // STEP 7: Validate Document Influence on Generated Content
    // =========================================================================
    console.log('\n📋 STEP 7: Validating Document Influence on Generated Content');
    console.log('='.repeat(60));

    if (testResults.generatedContent && frontendFormattedDocument) {
      const content = testResults.generatedContent.toLowerCase();
      const documentTitle = (frontendFormattedDocument.title || frontendFormattedDocument.titel || '').toLowerCase();
      const documentNumber = frontendFormattedDocument.nummer || frontendFormattedDocument.dokumentnummer || '';
      
      // Check for various forms of document reference
      const checks = [
        { name: 'Document title', text: documentTitle, found: documentTitle && content.includes(documentTitle) },
        { name: 'Document number', text: documentNumber, found: documentNumber && content.includes(documentNumber) },
        { name: 'Bundestag reference', text: 'bundestag', found: content.includes('bundestag') },
        { name: 'Drucksache reference', text: 'drucksache', found: content.includes('drucksache') },
        { name: 'Parliamentary reference', text: 'parlament', found: content.includes('parlament') }
      ];

      let influenceFound = false;
      console.log('🔍 Checking for document influence in generated content:');
      
      checks.forEach(check => {
        if (check.found) {
          console.log(`  ✅ ${check.name}: Found reference`);
          influenceFound = true;
        } else if (check.text) {
          console.log(`  ❌ ${check.name}: Not found (searched for: "${check.text}")`);
        } else {
          console.log(`  ⚠️  ${check.name}: No search text available`);
        }
      });

      testResults.documentInfluence = influenceFound;

      if (influenceFound) {
        console.log('\n✅ Document influence detected in generated content');
      } else {
        console.log('\n⚠️  No clear document influence detected in generated content');
      }

      // Show content preview
      console.log('\n📄 Generated content preview (first 500 characters):');
      console.log('-'.repeat(60));
      console.log(testResults.generatedContent.substring(0, 500) + '...');
      console.log('-'.repeat(60));
    }

  } catch (error) {
    console.error('\n❌ Comprehensive test failed:', error.message);
    testResults.errors.push(`General error: ${error.message}`);
  }

  // =========================================================================
  // FINAL TEST RESULTS SUMMARY
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('📊 COMPREHENSIVE TEST RESULTS SUMMARY');
  console.log('='.repeat(80));

  const results = [
    { name: 'API Connection', passed: testResults.apiConnection },
    { name: 'Document Search', passed: testResults.documentSearch },
    { name: 'Document Enhancement', passed: testResults.documentEnhancement },
    { name: 'Antrag Generation', passed: testResults.antragGeneration },
    { name: 'Document Influence', passed: testResults.documentInfluence }
  ];

  results.forEach(result => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} - ${result.name}`);
  });

  const passedTests = results.filter(r => r.passed).length;
  const totalTests = results.length;
  
  console.log(`\n📈 Overall Score: ${passedTests}/${totalTests} tests passed`);
  console.log(`📄 Documents with text found: ${testResults.documentsWithText.length}`);
  console.log(`📝 Generated content length: ${testResults.generatedContent ? testResults.generatedContent.length : 0}`);

  if (testResults.errors.length > 0) {
    console.log('\n⚠️  ERRORS ENCOUNTERED:');
    testResults.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error}`);
    });
  }

  const overallSuccess = passedTests >= 3; // At least 3 out of 5 tests should pass
  console.log(`\n${overallSuccess ? '🎉 OVERALL RESULT: SUCCESS' : '💥 OVERALL RESULT: NEEDS ATTENTION'}`);
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Comprehensive test completed!');
  
  // Exit with appropriate code
  process.exit(overallSuccess ? 0 : 1);
}

// Run the comprehensive test
runComprehensiveTest().catch(error => {
  console.error('\n💥 FATAL ERROR:', error.message);
  process.exit(1);
});