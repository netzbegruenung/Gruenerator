/**
 * Production Node
 * Generates final content based on approved plan
 * Reusable across all generator types
 */

import type { PlanWorkflowState, ProductionNodeOutput } from '../types.js';
import { assemblePromptGraphAsync } from '../../promptAssemblyGraph.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load prompt configuration from JSON file
 * Works both in source (ts) and compiled (dist/js) contexts
 */
async function loadPromptConfig(configName: string): Promise<any> {
  const configPath = path.join(__dirname, '../../../../prompts', `${configName}.json`);
  const configData = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(configData);
}

/**
 * Production Node: Generate final content
 */
export async function productionNode(state: PlanWorkflowState): Promise<ProductionNodeOutput> {
  const startTime = Date.now();
  console.log(`[PlanWorkflow] Generating production content for ${state.generatorType}`);

  try {
    const { input, planData, revisedPlanData, enrichedState, promptConfig } = state;

    if (!planData) {
      throw new Error('Plan must be generated before production');
    }

    // Auto-determine approved plan (revised or original)
    const approvedPlan = revisedPlanData?.revisedPlan || planData.originalPlan;

    console.log(`[PlanWorkflow] Using ${revisedPlanData ? 'revised' : 'original'} plan for production`);

    // Load production prompt configuration
    const promptConfigData = await loadPromptConfig(promptConfig.productionPrompt);

    // Build prompt context with approved plan
    const promptContext = {
      systemRole: promptConfigData.systemRole,
      request: {
        inhalt: input.inhalt,
        gliederung: input.gliederung,
        requestType: input.subType || input.generatorType,
        locale: input.locale || 'de-DE',
        platforms: input.platforms // For PR generator
      },
      knowledge: [
        `## Genehmigter Strategieplan\n${approvedPlan}`,
        ...(enrichedState?.webSearchResults || []),
        ...(enrichedState?.knowledgeBase || []),
        ...(enrichedState?.greenFraming || [])
      ],
      documents: enrichedState?.documents || [],
      enrichmentMetadata: enrichedState?.enrichmentMetadata
    };

    // Assemble full prompt
    const assembledPrompt = await assemblePromptGraphAsync(promptContext);

    // Generate production content via AI worker pool
    const aiResponse = await input.aiWorkerPool.processRequest({
      type: `${state.generatorType}_production`,
      usePrivacyMode: input.usePrivacyMode || false,
      systemPrompt: assembledPrompt.system,
      messages: assembledPrompt.messages as never,
      options: {
        max_tokens: promptConfigData.options?.max_tokens || 8000,
        temperature: promptConfigData.options?.temperature || 0.7
      }
    }, input.req);

    const productionTimeMs = Date.now() - startTime;

    console.log(`[PlanWorkflow] Production content generated in ${productionTimeMs}ms`);

    // Flexible production data structure based on generator type
    const productionData = {
      content: aiResponse.content,
      metadata: {
        executionTimeMs: productionTimeMs,
        aiCallsCount: 1,
        approvedPlanUsed: revisedPlanData ? 'revised' : 'original',
        generatorType: state.generatorType
      }
    };

    return {
      productionData,
      productionTimeMs,
      currentPhase: 'completed',
      phasesExecuted: [...state.phasesExecuted, 'production'],
      totalAICalls: state.totalAICalls + 1,
      success: true
    };
  } catch (error: any) {
    console.error('[PlanWorkflow] Production generation error:', error);
    return {
      error: `Production generation failed: ${error.message}`,
      currentPhase: 'error',
      success: false
    };
  }
}
