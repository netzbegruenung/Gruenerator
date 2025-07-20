#!/usr/bin/env node

// Test script for Bundestag API
require('dotenv').config();
const axios = require('axios');

async function testBundestagAPI() {
  console.log('Testing Bundestag API...');
  console.log('BUNDESTAG_API_KEY from env:', process.env.BUNDESTAG_API_KEY ? 'Present' : 'Missing');
  
  if (!process.env.BUNDESTAG_API_KEY) {
    console.error('❌ BUNDESTAG_API_KEY environment variable is not set');
    process.exit(1);
  }

  // Try different authentication methods
  console.log('\n🔍 Testing with X-API-Key header...');
  const client1 = axios.create({
    baseURL: 'https://search.dip.bundestag.de/api/v1',
    headers: {
      'X-API-Key': process.env.BUNDESTAG_API_KEY,
      'Content-Type': 'application/json',
      'User-Agent': 'Gruenerator/1.0'
    },
    timeout: 10000
  });

  console.log('\n🔍 Testing with apikey query parameter...');
  const client2 = axios.create({
    baseURL: 'https://search.dip.bundestag.de/api/v1',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Gruenerator/1.0'
    },
    timeout: 10000
  });

  // Test 1: X-API-Key header
  try {
    const response = await client1.get('/drucksache-text', {
      params: {
        q: 'umwelt',
        limit: 3
      }
    });
    
    console.log('✅ X-API-Key method worked!');
    console.log('📊 Response Data:', JSON.stringify(response.data, null, 2));
    return;
    
  } catch (error) {
    console.log('❌ X-API-Key method failed:', error.response?.status, error.response?.data?.message);
  }

  // Test 2: Query parameter
  try {
    const response = await client2.get('/drucksache-text', {
      params: {
        q: 'umwelt',
        limit: 3,
        apikey: process.env.BUNDESTAG_API_KEY
      }
    });
    
    console.log('✅ Query parameter method worked!');
    console.log('📊 Response Data:', JSON.stringify(response.data, null, 2));
    return;
    
  } catch (error) {
    console.log('❌ Query parameter method failed:', error.response?.status, error.response?.data?.message);
  }

  console.log('❌ All authentication methods failed!');
}

testBundestagAPI();