/**
 * PlanWorkflowGraph Configuration
 * Generator-specific prompt configurations and feature flags
 */

import type { PromptConfiguration, GeneratorType } from './types.js';

/**
 * Prompt configurations by generator type
 */
export const GENERATOR_CONFIGS: Record<string, PromptConfiguration> = {
  // Anträge (Municipal Motions)
  antrag: {
    planPrompt: 'plan_generation_antrag',
    questionsPrompt: 'interactive_questions_antrag',
    revisionPrompt: 'plan_revision_antrag',
    correctionPrompt: 'plan_correction_antrag',
    productionPrompt: 'antrag_experimental',

    enableQuestions: true,
    enableWebSearch: true,
    enableDocuments: true,
    enableKnowledge: true,
    enableGreenFraming: true,
  },

  // PR / Social Media Posts
  pr: {
    planPrompt: 'plan_generation_pr',
    questionsPrompt: 'interactive_questions_pr',
    revisionPrompt: 'plan_revision_pr',
    correctionPrompt: 'plan_correction_pr',
    productionPrompt: 'pr_experimental',

    enableQuestions: true,
    enableWebSearch: true,
    enableDocuments: true,
    enableKnowledge: true,
    enableGreenFraming: true,
    enableExamples: true,
  },

  // Future: Wahlprogramm, Rede, etc.
  // wahlprogramm: { ... },
  // rede: { ... }
};

/**
 * Get prompt configuration for generator type
 */
export function getPromptConfig(generatorType: GeneratorType): PromptConfiguration {
  const config = GENERATOR_CONFIGS[generatorType];

  if (!config) {
    throw new Error(
      `Unknown generator type: ${generatorType}. Available: ${Object.keys(GENERATOR_CONFIGS).join(', ')}`
    );
  }

  return config;
}

/**
 * Check if generator supports questions phase
 */
export function supportsQuestions(generatorType: GeneratorType): boolean {
  const config = GENERATOR_CONFIGS[generatorType];
  return config?.enableQuestions ?? false;
}

/**
 * Check if generator supports green framing
 */
export function supportsGreenFraming(generatorType: GeneratorType): boolean {
  const config = GENERATOR_CONFIGS[generatorType];
  return config?.enableGreenFraming ?? false;
}

/**
 * Validate generator type
 */
export function isValidGeneratorType(type: string): type is GeneratorType {
  return type in GENERATOR_CONFIGS;
}

/**
 * Get all available generator types
 */
export function getAvailableGeneratorTypes(): GeneratorType[] {
  return Object.keys(GENERATOR_CONFIGS) as GeneratorType[];
}
