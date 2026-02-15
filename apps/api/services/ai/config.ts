/**
 * AI Generation Configuration
 * Content-type and platform-specific generation parameters
 *
 * This module centralizes all the temperature, max_tokens, and top_p logic
 * that was previously scattered across adapters. These settings are critical
 * for achieving appropriate output quality for different content types.
 */

export interface GenerationConfig {
  temperature: number;
  maxTokens: number;
  topP: number;
}

export interface GenerationOptions {
  type?: string;
  systemPrompt?: string;
  platforms?: string[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  useProMode?: boolean;
}

/**
 * Temperature defaults by content type
 * Lower = more deterministic, higher = more creative
 *
 * - Sharepics (0.1): Very consistent, structured output
 * - Press releases (0.3): Professional, consistent tone
 * - LinkedIn (0.4): Professional but slightly varied
 * - Twitter (0.5): Punchy, some variety
 * - Facebook/Instagram (0.6-0.7): More creative, engaging
 */
const TYPE_TEMPERATURE_DEFAULTS: Record<string, number> = {
  // Formal/structured content
  presse: 0.3,
  antrag: 0.2,
  antrag_simple: 0.2,
  kleine_anfrage: 0.2,
  grosse_anfrage: 0.2,
  generator_config: 0.1,
  crawler_agent: 0.1,
  web_search_summary: 0.2,
  leichte_sprache: 0.3,
  image_picker: 0.2,
  qa_tools: 0.3,

  // Creative content
  antrag_question_generation: 0.7,
};

/**
 * Platform-specific temperature for social media
 */
const PLATFORM_TEMPERATURE: Record<string, number> = {
  pressemitteilung: 0.3,
  linkedin: 0.4,
  twitter: 0.5,
  facebook: 0.6,
  instagram: 0.7,
  reelScript: 0.6,
};

/**
 * Platform-specific max tokens for social media
 * Based on platform character limits and typical content length
 */
const PLATFORM_MAX_TOKENS: Record<string, number> = {
  pressemitteilung: 700,
  twitter: 120,
  linkedin: 250,
  facebook: 250,
  instagram: 250,
  reelScript: 550,
  actionIdeas: 400,
};

/**
 * Platform-specific top_p values
 * Higher values = more diverse token selection
 */
const PLATFORM_TOP_P: Record<string, number> = {
  pressemitteilung: 0.7,
  linkedin: 0.75,
  twitter: 0.95,
  facebook: 0.9,
  instagram: 0.9,
  reelScript: 0.95,
  actionIdeas: 0.95,
};

/**
 * Keywords that indicate formal/professional tone in system prompts
 */
const FORMAL_KEYWORDS = [
  'pressemitteilung',
  'förmlich',
  'sachlich',
  'presseverteiler',
  'journalistisch',
];

/**
 * Determine temperature based on content type and platform
 */
export function determineTemperature(options: GenerationOptions): number {
  const { type, systemPrompt, platforms, temperature } = options;

  // Explicit temperature takes precedence
  if (typeof temperature === 'number') {
    return temperature;
  }

  // Social media type with platform-specific settings
  if (type === 'social') {
    // Check for press release platform
    if (platforms?.includes('pressemitteilung')) {
      return 0.3;
    }

    // Check system prompt for formal keywords
    if (systemPrompt) {
      const promptLower = systemPrompt.toLowerCase();
      if (FORMAL_KEYWORDS.some((keyword) => promptLower.includes(keyword))) {
        return 0.3;
      }
    }

    // Platform-specific temperatures
    if (platforms?.length) {
      for (const platform of platforms) {
        if (PLATFORM_TEMPERATURE[platform] !== undefined) {
          return PLATFORM_TEMPERATURE[platform];
        }
      }
    }

    // Default social media temperature
    return 0.6;
  }

  // Sharepic types are very structured
  if (type?.startsWith('sharepic_')) {
    return 0.1;
  }

  // Type-specific defaults
  if (type && TYPE_TEMPERATURE_DEFAULTS[type] !== undefined) {
    return TYPE_TEMPERATURE_DEFAULTS[type];
  }

  // General default
  return 0.35;
}

/**
 * Determine max tokens based on content type and platform
 */
export function determineMaxTokens(options: GenerationOptions): number {
  const { type, platforms, maxTokens } = options;

  // Explicit max tokens takes precedence
  if (typeof maxTokens === 'number') {
    return maxTokens;
  }

  // Social media with single platform
  if (type === 'social' && platforms?.length === 1) {
    const platform = platforms[0];
    if (PLATFORM_MAX_TOKENS[platform] !== undefined) {
      return PLATFORM_MAX_TOKENS[platform];
    }
  }

  // Social media with multiple platforms - use larger buffer
  if (type === 'social' && platforms?.length) {
    return 800;
  }

  // Image picker needs limited output
  if (type === 'image_picker') {
    return 300;
  }

  // Default
  return 4096;
}

/**
 * Determine top_p based on content type and platform
 */
export function determineTopP(options: GenerationOptions): number {
  const { type, platforms, topP, temperature } = options;

  // Explicit top_p takes precedence
  if (typeof topP === 'number') {
    return topP;
  }

  // Platform-specific top_p
  if (type === 'social' && platforms?.length) {
    for (const platform of platforms) {
      if (PLATFORM_TOP_P[platform] !== undefined) {
        return PLATFORM_TOP_P[platform];
      }
    }
  }

  // Sharepic types
  if (type?.startsWith('sharepic_')) {
    return 0.7;
  }

  // Image picker
  if (type === 'image_picker') {
    return 0.8;
  }

  // Temperature-based defaults
  const effectiveTemp = temperature ?? determineTemperature(options);
  // Greedy sampling (temp=0) requires top_p=1 on Mistral
  if (effectiveTemp === 0) return 1.0;
  if (effectiveTemp <= 0.3) return 0.85;
  if (effectiveTemp <= 0.5) return 0.9;

  return 1.0;
}

/**
 * Get complete generation config for a request
 */
export function getGenerationConfig(options: GenerationOptions): GenerationConfig {
  return {
    temperature: determineTemperature(options),
    maxTokens: determineMaxTokens(options),
    topP: determineTopP(options),
  };
}

/**
 * Apply Pro Mode adjustments to generation config
 * Pro Mode uses reasoning-enabled models with higher token limits
 */
export function applyProModeConfig(
  config: GenerationConfig,
  model: string
): GenerationConfig & { promptMode?: string } {
  if (model.includes('magistral')) {
    return {
      ...config,
      maxTokens: Math.max(config.maxTokens, 6000),
      promptMode: 'reasoning',
    };
  }
  return config;
}
