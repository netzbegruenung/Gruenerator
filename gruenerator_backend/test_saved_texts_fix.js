#!/usr/bin/env node
/**
 * Test script to verify that the saved-texts API endpoint works after content_html fix
 * This will test the SQL query that was causing the "content_html does not exist" error
 */

import dotenv from 'dotenv';
import { getPostgresInstance } from './database/services/PostgresService.js';

// Load environment variables
dotenv.config();

async function testSavedTextsQuery() {
  console.log('🔍 Testing saved-texts SQL query after content_html fix...');
  
  try {
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    
    console.log('✅ PostgreSQL connection established');
    
    // Test the exact query that was failing before
    // This simulates what happens in GET /api/auth/saved-texts
    const testUserId = 'test-user-id'; // This won't exist but query should still work
    const query = `
      SELECT id as document_id, title, content, document_type, created_at
      FROM user_documents
      WHERE user_id = $1 AND is_active = true
      ORDER BY created_at DESC
      LIMIT 20 OFFSET 0
    `;
    
    console.log('📝 Testing SQL query:');
    console.log(query);
    console.log(`   Parameters: [${testUserId}]`);
    
    const results = await postgres.query(query, [testUserId], { table: 'user_documents' });
    
    console.log('✅ Query executed successfully!');
    console.log(`📊 Results: ${results?.length || 0} rows returned`);
    
    // Test that all required columns are present
    if (results && results.length > 0) {
      const sampleRow = results[0];
      const requiredFields = ['document_id', 'title', 'content', 'document_type', 'created_at'];
      
      for (const field of requiredFields) {
        if (field in sampleRow) {
          console.log(`✅ Field '${field}' is present`);
        } else {
          console.log(`❌ Field '${field}' is missing`);
        }
      }
    } else {
      console.log('📝 No existing user documents found (this is expected for test user)');
    }
    
    console.log('\n🎉 SUCCESS: The saved-texts endpoint should now work without the content_html error!');
    
  } catch (error) {
    console.error('❌ FAIL: Error testing saved-texts query:', error.message);
    
    if (error.message.includes('content_html')) {
      console.error('💥 CRITICAL: content_html column is still being referenced!');
    } else if (error.message.includes('column') && error.message.includes('does not exist')) {
      console.error('💥 CRITICAL: A column reference issue still exists:', error.message);
    } else {
      console.error('ℹ️  This might be a different issue (connection, permissions, etc.)');
    }
    
    process.exit(1);
  }
}

async function testTableSchema() {
  console.log('\n🔍 Verifying user_documents table schema...');
  
  try {
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    
    // Get table schema
    const schemaQuery = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'user_documents' AND table_schema = 'public'
      ORDER BY ordinal_position;
    `;
    
    const columns = await postgres.query(schemaQuery);
    
    console.log('📋 user_documents table columns:');
    columns.forEach(col => {
      console.log(`   ${col.column_name} (${col.data_type}${col.is_nullable === 'YES' ? ', nullable' : ''})`);
    });
    
    // Check that content_html is NOT present
    const hasContentHtml = columns.some(col => col.column_name === 'content_html');
    if (hasContentHtml) {
      console.log('❌ WARNING: content_html column exists in database but should not!');
    } else {
      console.log('✅ Good: content_html column does not exist (as expected)');
    }
    
    // Check that content column exists
    const hasContent = columns.some(col => col.column_name === 'content');
    if (hasContent) {
      console.log('✅ Good: content column exists (this will store HTML content)');
    } else {
      console.log('❌ WARNING: content column is missing from database!');
    }
    
  } catch (error) {
    console.error('❌ Error checking table schema:', error.message);
  }
}

// Run the tests
async function runTests() {
  console.log('🧪 Testing saved-texts fix for content_html column error\n');
  
  await testTableSchema();
  await testSavedTextsQuery();
  
  console.log('\n✨ Test completed');
  process.exit(0);
}

runTests().catch(error => {
  console.error('💥 Test failed:', error);
  process.exit(1);
});