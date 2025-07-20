#!/usr/bin/env node

/**
 * Test script to verify Bundestag document flow exactly like frontend would use it
 */

require('dotenv').config();
const axios = require('axios');

console.log('🔍 Testing Bundestag document flow like frontend...\n');

async function testBundestagFlow() {
  try {
    // Step 1: Try different search terms to find documents with text
    console.log('📋 STEP 1: Search for documents with different terms');
    console.log('='.repeat(60));
    
    const searchTerms = ['klimaschutz', 'bundestag', 'verkehr', 'energie'];
    let searchResponse;
    let documentsFound = [];
    
    for (const term of searchTerms) {
      console.log(`\n🔍 Trying search term: "${term}"`);
      try {
        const response = await axios.post('http://localhost:3001/api/bundestag/search', {
          query: term,
          includeDrucksachen: true,
          includePlenarprotokolle: true,
          includeVorgaenge: false,
          maxDrucksachen: 3,
          maxPlenarprotokolle: 2
        });
        
        console.log(`  - Found ${response.data.totalResults} total documents`);
        console.log(`  - Drucksachen: ${response.data.results.drucksachen.length}`);
        console.log(`  - Plenarprotokolle: ${response.data.results.plenarprotokolle.length}`);
        
        // Collect all documents for testing
        documentsFound.push(...response.data.results.drucksachen);
        documentsFound.push(...response.data.results.plenarprotokolle);
        
        if (documentsFound.length >= 5) {
          searchResponse = response;
          break;
        }
      } catch (error) {
        console.log(`  - Search failed: ${error.message}`);
      }
    }
    
    if (!searchResponse || documentsFound.length === 0) {
      throw new Error('No documents found with any search terms');
    }
    
    console.log(`\n✅ Total documents collected: ${documentsFound.length}`);
    
    // Step 2: Test individual documents to find ones with text content
    console.log('\n📋 STEP 2: Test individual documents for text content');
    console.log('='.repeat(60));
    
    let documentWithText = null;
    
    for (let i = 0; i < Math.min(documentsFound.length, 5); i++) {
      const doc = documentsFound[i];
      console.log(`\n🔍 Testing document ${i + 1}/${Math.min(documentsFound.length, 5)}: ${doc.id}`);
      console.log(`- Title: ${doc.title}`);
      console.log(`- Type: ${doc.type}`);
      console.log(`- Date: ${doc.date}`);
      console.log(`- Wahlperiode: ${doc.wahlperiode}`);
      
      try {
        // Test direct individual document fetch
        const docResponse = await axios.get(`http://localhost:3001/api/bundestag/document/${doc.type}/${doc.id}`);
        
        if (docResponse.data.success && docResponse.data.document) {
          const fullDoc = docResponse.data.document;
          console.log(`- Has text: ${!!fullDoc.text}`);
          console.log(`- Text length: ${fullDoc.text ? fullDoc.text.length : 0}`);
          console.log(`- Fields: ${Object.keys(fullDoc).join(', ')}`);
          
          if (fullDoc.text && fullDoc.text.length > 100) {
            console.log(`✅ FOUND DOCUMENT WITH TEXT! Using this one.`);
            console.log(`- Text preview: ${fullDoc.text.substring(0, 200)}...`);
            documentWithText = {
              ...doc,
              text: fullDoc.text,
              titel: fullDoc.titel,
              dokumentnummer: fullDoc.dokumentnummer
            };
            break;
          }
        }
      } catch (error) {
        console.log(`- Fetch failed: ${error.message}`);
      }
    }
    
    if (!documentWithText) {
      console.log('\n❌ No documents with text content found. Testing with first document anyway...');
      documentWithText = documentsFound[0];
    }
      
      // Step 2: Simulate frontend selection 
      console.log('\n📋 STEP 2: Simulate frontend document selection');
      console.log('='.repeat(60));
      
      // Frontend would format documents like this for react-select
      const selectedDocument = {
        ...firstDoc,
        value: `drucksache_${firstDoc.id}`,
        label: firstDoc.title,
        subtitle: `${firstDoc.nummer || 'N/A'} • ${firstDoc.wahlperiode || 'N/A'}. WP • ${firstDoc.date || 'N/A'}`
      };
      
      console.log('✅ Document formatted for frontend selection:');
      console.log('- Value:', selectedDocument.value);
      console.log('- Label:', selectedDocument.label);
      console.log('- Subtitle:', selectedDocument.subtitle);
      
      // Step 3: Send to antrag generation (like frontend would)
      console.log('\n📋 STEP 3: Send to antrag generation with selected document');
      console.log('='.repeat(60));
      
      const antragPayload = {
        requestType: 'antrag',
        idee: 'Umweltschutz in der Gemeinde',
        details: 'Verbesserung der lokalen Umweltmaßnahmen',
        useBedrock: false, // Use regular Claude for testing
        useWebSearchTool: false,
        useBundestagApi: true,
        selectedBundestagDocuments: [selectedDocument] // This is what frontend sends
      };
      
      console.log('📤 Sending antrag request with payload:');
      console.log('- useBundestagApi:', antragPayload.useBundestagApi);
      console.log('- selectedBundestagDocuments count:', antragPayload.selectedBundestagDocuments.length);
      console.log('- Selected doc ID:', antragPayload.selectedBundestagDocuments[0].id);
      console.log('- Selected doc title:', antragPayload.selectedBundestagDocuments[0].title);
      console.log('- Selected doc nummer:', antragPayload.selectedBundestagDocuments[0].nummer);
      
      const antragResponse = await axios.post('http://localhost:3001/api/antraege/generate-simple', antragPayload, {
        timeout: 30000 // 30 second timeout for AI generation
      });
      
      console.log('\n✅ Antrag generation successful!');
      console.log('Response length:', antragResponse.data.content ? antragResponse.data.content.length : 0);
      console.log('Bundestag documents used:', antragResponse.data.metadata?.bundestagDocumentsUsed || 0);
      
      // Check if the document was actually used in the prompt
      if (antragResponse.data.content) {
        const hasDocumentReference = antragResponse.data.content.includes(firstDoc.title) || 
                                   antragResponse.data.content.includes(firstDoc.nummer) ||
                                   antragResponse.data.content.includes('21/695');
        console.log('Document seems to be referenced in response:', hasDocumentReference);
        
        // Show first 500 chars of response
        console.log('\n📄 Response preview:');
        console.log(antragResponse.data.content.substring(0, 500) + '...');
      }
      
    } else {
      console.log('❌ No Drucksachen found to test with');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Test completed!');
}

testBundestagFlow();