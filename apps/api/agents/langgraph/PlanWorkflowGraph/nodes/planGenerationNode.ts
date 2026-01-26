/**
 * Plan Generation Node
 * Creates strategic plan using enriched context
 * Simple text generation - no tool-calling
 */

import type { PlanWorkflowState, PlanGenerationNodeOutput } from '../types.js';
import { assemblePromptGraphAsync } from '../../promptAssemblyGraph.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadPromptConfig(configName: string): Promise<any> {
  const configPath = path.join(__dirname, '../../../../prompts', `${configName}.json`);
  const configData = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(configData);
}

function extractPlanSummary(plan: string): string {
  const sentences = plan.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  return sentences.slice(0, 2).join('. ') + '.';
}

export async function planGenerationNode(
  state: PlanWorkflowState
): Promise<PlanGenerationNodeOutput> {
  const startTime = Date.now();
  console.log(`[PlanWorkflow] Generating strategic plan for ${state.generatorType}`);

  try {
    const { input, enrichedState, promptConfig } = state;

    if (!enrichedState) {
      throw new Error('Enrichment must run before plan generation');
    }

    const promptConfigData = await loadPromptConfig(promptConfig.planPrompt);

    const promptContext = {
      systemRole: promptConfigData.systemPrompt,
      taskInstructions: promptConfigData.generationPrompt,
      request: {
        inhalt: input.inhalt,
        gliederung: input.gliederung,
        requestType: input.subType || input.generatorType,
        locale: input.locale || 'de-DE',
      },
      documents: enrichedState.documents || [],
      knowledge: [
        ...(enrichedState.webSearchResults || []),
        ...(enrichedState.knowledgeBase || []),
      ],
      greenFraming: enrichedState.greenFraming || [],
      enrichmentMetadata: enrichedState.enrichmentMetadata,
    };

    const assembledPrompt = await assemblePromptGraphAsync(promptContext);

    const aiResponse = await input.aiWorkerPool.processRequest(
      {
        type: `${state.generatorType}_plan_generation`,
        provider: 'ionos',
        usePrivacyMode: input.usePrivacyMode || false,
        systemPrompt: assembledPrompt.system,
        messages: assembledPrompt.messages as never,
        options: {
          model: 'openai/gpt-oss-120b',
          max_tokens: promptConfigData.options?.max_tokens || 1500,
          temperature: promptConfigData.options?.temperature || 0.3,
        },
      },
      input.req
    );

    const planText = aiResponse.content ?? '';
    const planSummary = extractPlanSummary(planText);
    const planGenerationTimeMs = Date.now() - startTime;

    console.log(`[PlanWorkflow] Plan generated in ${planGenerationTimeMs}ms`);

    return {
      planData: {
        originalPlan: planText,
        planSummary,
        confidenceScore: 0.85,
        enrichmentMetadata: enrichedState.enrichmentMetadata,
      },
      planGenerationTimeMs,
      currentPhase: 'questions',
      phasesExecuted: [...state.phasesExecuted, 'plan'],
      totalAICalls: state.totalAICalls + 1,
    };
  } catch (error: any) {
    console.error('[PlanWorkflow] Plan generation error:', error);
    return {
      error: `Plan generation failed: ${error.message}`,
      currentPhase: 'error',
      success: false,
    };
  }
}
