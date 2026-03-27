import { getModel, isProviderConfigured } from '../../services/ai/providers.js';

import type { LanguageModel } from 'ai';

const PROVIDER = 'litellm';
const FALLBACK_PROVIDER = 'mistral';

export function getBriefingProvider(): string {
  if (isProviderConfigured(PROVIDER)) return PROVIDER;
  if (isProviderConfigured(FALLBACK_PROVIDER)) return FALLBACK_PROVIDER;
  throw new Error('No AI provider configured (LITELLM_API_KEY or MISTRAL_API_KEY required)');
}

export function getBriefingModel(): LanguageModel {
  return getModel(getBriefingProvider());
}
