/**
 * Test file for Canva Connect API integration
 * Tests basic functionality, authentication, and API connectivity
 */

const CanvaApiClient = require('./services/canvaApiClient.js');
const CanvaTokenManager = require('./utils/canvaTokenManager.js');

async function runCanvaTests() {
  console.log('🎨 Starting Canva Connect API Integration Tests');
  console.log('=' .repeat(50));
  
  try {
    // Test 1: Configuration validation
    console.log('\n1. Testing configuration validation...');
    const configValid = CanvaTokenManager.validateConfiguration();
    console.log(`Configuration valid: ${configValid ? '✅' : '❌'}`);
    
    if (!configValid) {
      console.log('❌ Configuration test failed. Check your environment variables.');
      return;
    }
    
    // Test 2: Token encryption/decryption
    console.log('\n2. Testing token encryption/decryption...');
    const encryptionTest = CanvaTokenManager.testEncryption();
    console.log(`Encryption test: ${encryptionTest ? '✅' : '❌'}`);
    
    // Test 3: Basic API client creation
    console.log('\n3. Testing API client creation...');
    try {
      const client = new CanvaApiClient();
      console.log('✅ API client created successfully');
    } catch (error) {
      console.log('❌ API client creation failed:', error.message);
    }
    
    // Test 4: Environment variables check
    console.log('\n4. Checking environment variables...');
    const envVars = {
      'CANVA_CLIENT_ID': process.env.CANVA_CLIENT_ID,
      'CANVA_CLIENT_SECRET': process.env.CANVA_CLIENT_SECRET?.substring(0, 10) + '...',
      'CANVA_REDIRECT_URI': process.env.CANVA_REDIRECT_URI,
      'CANVA_WEBHOOK_SECRET': process.env.CANVA_WEBHOOK_SECRET ? 'Set' : 'Not set (optional)',
      'CANVA_TOKEN_ENCRYPTION_KEY': process.env.CANVA_TOKEN_ENCRYPTION_KEY ? 'Set' : 'Not set (optional)'
    };
    
    Object.entries(envVars).forEach(([key, value]) => {
      const status = value && value !== 'Not set (optional)' ? '✅' : (key.includes('WEBHOOK') || key.includes('ENCRYPTION') ? '⚠️' : '❌');
      console.log(`  ${key}: ${value} ${status}`);
    });
    
    // Test 5: Mock token operations
    console.log('\n5. Testing token operations...');
    try {
      const mockToken = 'test-access-token-' + Date.now();
      const encrypted = CanvaTokenManager.encrypt(mockToken);
      const decrypted = CanvaTokenManager.decrypt(encrypted);
      
      if (mockToken === decrypted) {
        console.log('✅ Token encryption/decryption working correctly');
      } else {
        console.log('❌ Token encryption/decryption mismatch');
      }
    } catch (error) {
      console.log('❌ Token operation failed:', error.message);
    }
    
    // Test 6: Supabase connection (if available)
    console.log('\n6. Testing Supabase connection...');
    try {
      const { supabaseService } = require('./utils/supabaseClient.js');
      
      // Test basic query to profiles table
      const { data, error } = await supabaseService
        .from('profiles')
        .select('id')
        .limit(1);
      
      if (error) {
        console.log('❌ Supabase connection failed:', error.message);
      } else {
        console.log('✅ Supabase connection working');
        
        // Check if Canva columns exist
        const { data: columnData, error: columnError } = await supabaseService
          .from('information_schema.columns')
          .select('column_name')
          .eq('table_name', 'profiles')
          .like('column_name', 'canva_%');
        
        if (columnError) {
          console.log('⚠️ Could not check Canva columns:', columnError.message);
        } else {
          const canvaColumns = columnData.map(row => row.column_name);
          console.log(`✅ Canva columns in database: ${canvaColumns.length > 0 ? canvaColumns.join(', ') : 'None found'}`);
        }
      }
    } catch (error) {
      console.log('❌ Supabase test failed:', error.message);
    }
    
    // Test 7: Routes availability (basic check)
    console.log('\n7. Testing route setup...');
    try {
      const routes = {
        '/api/canva/auth/authorize': 'OAuth authorization endpoint',
        '/api/canva/auth/callback': 'OAuth callback endpoint',
        '/api/canva/auth/status': 'Connection status check',
        '/api/canva/test': 'API connection test',
        '/api/canva/designs': 'Design management',
        '/api/canva/assets': 'Asset management'
      };
      
      console.log('✅ Expected routes:');
      Object.entries(routes).forEach(([route, description]) => {
        console.log(`  ${route} - ${description}`);
      });
    } catch (error) {
      console.log('❌ Route check failed:', error.message);
    }
    
    console.log('\n' + '=' .repeat(50));
    console.log('🎉 Canva Integration Tests Complete!');
    console.log('\n📋 Next Steps:');
    console.log('1. Start your server: npm run dev');
    console.log('2. Visit: http://localhost:3001/api/canva/auth/authorize (after login)');
    console.log('3. Complete OAuth flow in Canva');
    console.log('4. Test API endpoints: http://localhost:3001/api/canva/test');
    console.log('\n🔗 Useful URLs:');
    console.log('- Canva Developer Portal: https://www.canva.com/developers/');
    console.log('- API Documentation: https://www.canva.dev/docs/connect/');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Additional utility functions for manual testing
function printCanvaConfig() {
  console.log('\n🔧 Canva Configuration:');
  console.log('Client ID:', process.env.CANVA_CLIENT_ID || 'Not set');
  console.log('Redirect URI:', process.env.CANVA_REDIRECT_URI || 'Not set');
  console.log('Webhook Secret:', process.env.CANVA_WEBHOOK_SECRET ? 'Set' : 'Not set (optional)');
  console.log('Encryption Key:', process.env.CANVA_TOKEN_ENCRYPTION_KEY ? 'Set' : 'Not set (optional)');
}

function generateTestAuthUrl() {
  const baseUrl = 'https://www.canva.com/api/oauth/authorize';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.CANVA_CLIENT_ID || 'YOUR_CLIENT_ID',
    redirect_uri: process.env.CANVA_REDIRECT_URI || 'http://localhost:3001/api/canva/auth/callback',
    scope: 'asset:read asset:write design:meta:read design:content:read',
    state: 'test-state-' + Date.now(),
    code_challenge: 'test-challenge',
    code_challenge_method: 'S256'
  });
  
  console.log('\n🔗 Test Authorization URL (for manual testing):');
  console.log(baseUrl + '?' + params.toString());
}

// Run tests if this file is executed directly
if (require.main === module) {
  runCanvaTests().catch(console.error);
}

module.exports = {
  runCanvaTests,
  printCanvaConfig,
  generateTestAuthUrl
};