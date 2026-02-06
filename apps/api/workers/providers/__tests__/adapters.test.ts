/**
 * Integration Test for AI Provider Adapters (Vercel SDK Migration)
 * Run with: cd apps/api && npx tsx workers/providers/__tests__/adapters.test.ts
 *
 * This test verifies that Mistral, IONOS, and LiteLLM adapters work correctly
 * with the new Vercel AI SDK implementation.
 */

import { getGenerationConfig } from '../../../services/ai/config.js';
import { getModel, isProviderConfigured, getDefaultModel } from '../../../services/ai/providers.js';
import * as providers from '../index.js';

console.log('='.repeat(60));
console.log('Testing AI Provider Adapters (Vercel SDK Migration)');
console.log('='.repeat(60));

// Test 1: Generation Config
console.log('\n--- Test 1: Generation Config ---');
try {
  // Sharepic should have low temperature
  const sharepicConfig = getGenerationConfig({ type: 'sharepic_zitat' });
  console.log('Sharepic temp (expected 0.1):', sharepicConfig.temperature === 0.1 ? '✅' : '❌', sharepicConfig.temperature);

  // Press release should have professional temperature
  const presseConfig = getGenerationConfig({ type: 'presse' });
  console.log('Presse temp (expected 0.3):', presseConfig.temperature === 0.3 ? '✅' : '❌', presseConfig.temperature);

  // Social media with Twitter
  const twitterConfig = getGenerationConfig({ type: 'social', platforms: ['twitter'] });
  console.log('Twitter temp (expected 0.5):', twitterConfig.temperature === 0.5 ? '✅' : '❌', twitterConfig.temperature);
  console.log('Twitter maxTokens (expected 120):', twitterConfig.maxTokens === 120 ? '✅' : '❌', twitterConfig.maxTokens);
} catch (error: any) {
  console.log('Test 1 failed:', error.message);
}

// Test 2: Provider Configuration Check
console.log('\n--- Test 2: Provider Configuration ---');
try {
  console.log('Mistral configured:', isProviderConfigured('mistral') ? '✅' : '⚠️ Not configured');
  console.log('LiteLLM configured:', isProviderConfigured('litellm') ? '✅' : '⚠️ Not configured');
  console.log('IONOS configured:', isProviderConfigured('ionos') ? '✅' : '⚠️ Not configured');
} catch (error: any) {
  console.log('Test 2 failed:', error.message);
}

// Test 3: Default Models
console.log('\n--- Test 3: Default Models ---');
try {
  console.log('Mistral default:', getDefaultModel('mistral'));
  console.log('LiteLLM default:', getDefaultModel('litellm'));
  console.log('IONOS default:', getDefaultModel('ionos'));
} catch (error: any) {
  console.log('Test 3 failed:', error.message);
}

// Test 4: Provider Exports
console.log('\n--- Test 4: Provider Exports ---');
try {
  console.log('mistral adapter exported:', providers.mistral ? '✅' : '❌');
  console.log('litellm adapter exported:', providers.litellm ? '✅' : '❌');
  console.log('ionos adapter exported:', providers.ionos ? '✅' : '❌');
  console.log('executeProvider function:', providers.executeProvider ? '✅' : '❌');
  console.log('claude adapter (should be undefined):', (providers as any).claude === undefined ? '✅' : '❌');
  console.log('telekom adapter (should be undefined):', (providers as any).telekom === undefined ? '✅' : '❌');
} catch (error: any) {
  console.log('Test 4 failed:', error.message);
}

// Test 5: Model Instance Creation (only if configured)
console.log('\n--- Test 5: Model Instance Creation ---');
try {
  if (isProviderConfigured('mistral')) {
    const model = getModel('mistral');
    console.log('Mistral model instance:', model ? '✅ Created' : '❌ Failed');
  } else {
    console.log('Mistral model instance: ⚠️ Skipped (not configured)');
  }

  if (isProviderConfigured('litellm')) {
    const model = getModel('litellm');
    console.log('LiteLLM model instance:', model ? '✅ Created' : '❌ Failed');
  } else {
    console.log('LiteLLM model instance: ⚠️ Skipped (not configured)');
  }

  if (isProviderConfigured('ionos')) {
    const model = getModel('ionos');
    console.log('IONOS model instance:', model ? '✅ Created' : '❌ Failed');
  } else {
    console.log('IONOS model instance: ⚠️ Skipped (not configured)');
  }
} catch (error: any) {
  console.log('Test 5 failed:', error.message);
}

// Test 6: Live Mistral Request (if configured)
console.log('\n--- Test 6: Live Mistral Request ---');
if (isProviderConfigured('mistral')) {
  try {
    const result = await providers.executeProvider('mistral', 'test-001', {
      messages: [{ role: 'user', content: 'Sag einfach nur "Hallo"' }],
      systemPrompt: 'Du antwortest immer kurz und prägnant.',
      type: 'chat',
      options: { max_tokens: 50 },
      metadata: {},
    });

    console.log('Response received:', result.success ? '✅' : '❌');
    console.log('Provider:', result.metadata?.provider);
    console.log('Content:', result.content?.substring(0, 100) || '(no content)');
    console.log('Stop reason:', result.stop_reason);
  } catch (error: any) {
    console.log('Test 6 failed:', error.message);
  }
} else {
  console.log('⚠️ Skipped (MISTRAL_API_KEY not configured)');
}

// Test 7: Live LiteLLM Request (if configured)
console.log('\n--- Test 7: Live LiteLLM Request ---');
if (isProviderConfigured('litellm')) {
  try {
    const result = await providers.executeProvider('litellm', 'test-002', {
      messages: [{ role: 'user', content: 'Sag einfach nur "Hallo"' }],
      systemPrompt: 'Du antwortest immer kurz und prägnant.',
      type: 'chat',
      options: { max_tokens: 50 },
      metadata: {},
    });

    console.log('Response received:', result.success ? '✅' : '❌');
    console.log('Provider:', result.metadata?.provider);
    console.log('Content:', result.content?.substring(0, 100) || '(no content)');
    console.log('Stop reason:', result.stop_reason);
  } catch (error: any) {
    console.log('Test 7 failed:', error.message);
  }
} else {
  console.log('⚠️ Skipped (LITELLM_BASE_URL/LITELLM_API_KEY not configured)');
}

console.log('\n' + '='.repeat(60));
console.log('Tests completed!');
console.log('='.repeat(60));
