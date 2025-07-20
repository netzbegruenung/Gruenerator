/**
 * Test Redis OAuth State Manager functionality
 */

require('dotenv').config(); // Load environment variables

const redisOAuthStateManager = require('./utils/redisOAuthStateManager.js');
const crypto = require('crypto');

async function testRedisOAuthStateManager() {
  console.log('🔄 Testing Redis OAuth State Manager');
  console.log('=' .repeat(50));
  
  try {
    // Wait a bit for Redis connection to establish
    console.log('\n0. Waiting for Redis connection...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 1: Check Redis availability
    console.log('\n1. Testing Redis connection...');
    console.log('REDIS_URL from env:', process.env.REDIS_URL ? 'Set' : 'Not set');
    const stats = await redisOAuthStateManager.getStats();
    console.log('Redis stats:', stats);
    
    if (!stats.available) {
      console.log('❌ Redis not available, testing will be limited');
      return;
    }
    
    // Test 2: Store and retrieve OAuth state
    console.log('\n2. Testing OAuth state storage and retrieval...');
    
    const testState = crypto.randomBytes(96).toString('base64url');
    const testData = {
      userId: 'test-user-123',
      codeVerifier: crypto.randomBytes(96).toString('base64url'),
      sessionId: 'test-session-456'
    };
    
    console.log('Storing test OAuth state...');
    const storeSuccess = await redisOAuthStateManager.storeState(testState, testData, 60); // 1 minute TTL
    console.log(`Store result: ${storeSuccess ? '✅' : '❌'}`);
    
    if (storeSuccess) {
      console.log('Retrieving test OAuth state...');
      const retrievedData = await redisOAuthStateManager.retrieveState(testState);
      
      if (retrievedData) {
        console.log('✅ Retrieved data successfully');
        console.log('Data matches:', {
          userId: retrievedData.userId === testData.userId,
          codeVerifier: retrievedData.codeVerifier === testData.codeVerifier,
          sessionId: retrievedData.sessionId === testData.sessionId,
          hasTimestamps: !!(retrievedData.createdAt && retrievedData.expiresAt)
        });
      } else {
        console.log('❌ Failed to retrieve data');
      }
      
      // Test 3: Verify data is deleted after retrieval (one-time use)
      console.log('\n3. Testing one-time use behavior...');
      const secondRetrieval = await redisOAuthStateManager.retrieveState(testState);
      console.log(`Second retrieval (should be null): ${secondRetrieval === null ? '✅' : '❌'}`);
    }
    
    // Test 4: Test expired state
    console.log('\n4. Testing state expiration...');
    const expiredState = crypto.randomBytes(96).toString('base64url');
    const expiredData = {
      userId: 'expired-user',
      codeVerifier: 'expired-verifier'
    };
    
    // Store with very short TTL
    const expiredStoreSuccess = await redisOAuthStateManager.storeState(expiredState, expiredData, 1); // 1 second TTL
    
    if (expiredStoreSuccess) {
      console.log('Waiting for expiration...');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      const expiredRetrievedData = await redisOAuthStateManager.retrieveState(expiredState);
      console.log(`Expired data retrieval (should be null): ${expiredRetrievedData === null ? '✅' : '❌'}`);
    }
    
    // Test 5: Test cleanup
    console.log('\n5. Testing manual cleanup...');
    const cleanupCount = await redisOAuthStateManager.cleanupExpiredStates();
    console.log(`Cleanup removed ${cleanupCount} expired states`);
    
    // Test 6: Final stats
    console.log('\n6. Final Redis stats...');
    const finalStats = await redisOAuthStateManager.getStats();
    console.log('Final stats:', finalStats);
    
    console.log('\n' + '=' .repeat(50));
    console.log('🎉 Redis OAuth State Manager Test Complete!');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  testRedisOAuthStateManager()
    .then(() => {
      console.log('\n✅ All tests completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Tests failed:', error);
      process.exit(1);
    });
}

module.exports = {
  testRedisOAuthStateManager
};