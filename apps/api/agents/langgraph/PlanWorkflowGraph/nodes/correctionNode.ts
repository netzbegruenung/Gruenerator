/**
 * Correction Node
 * Applies free-form user corrections to the plan
 * Different from revision: optimized for direct edits vs. Q&A integration
 */

import type { PlanWorkflowState, CorrectionNodeOutput } from '../types.js';
import { assemblePromptGraphAsync } from '../../promptAssemblyGraph.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load prompt configuration from JSON file
 */
async function loadPromptConfig(configName: string): Promise<any> {
  const configPath = path.join(__dirname, '../../../../prompts', `${configName}.json`);
  const configData = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(configData);
}

/**
 * Extract a brief summary of what was corrected
 */
function extractCorrectionSummary(correctedPlan: string, originalPlan: string): string {
  const originalLength = originalPlan.length;
  const correctedLength = correctedPlan.length;
  const changePercentage = Math.round(Math.abs(correctedLength - originalLength) / originalLength * 100);

  const korrigiertMatches = (correctedPlan.match(/KORRIGIERT:/g) || []).length;

  if (korrigiertMatches > 0) {
    return `${korrigiertMatches} Korrektur${korrigiertMatches > 1 ? 'en' : ''} angewendet (${changePercentage}% Änderung)`;
  }

  return `Plan korrigiert (${changePercentage}% Änderung)`;
}

/**
 * Get the most recent plan version
 * Priority: correctedPlan > revisedPlan > originalPlan
 */
function getCurrentPlan(state: PlanWorkflowState): string {
  return state.correctedPlanData?.correctedPlan
    || state.revisedPlanData?.revisedPlan
    || state.planData?.originalPlan
    || '';
}

/**
 * Correction Node: Apply user's free-form corrections to the plan
 */
export async function correctionNode(state: PlanWorkflowState): Promise<CorrectionNodeOutput> {
  const startTime = Date.now();
  console.log(`[PlanWorkflow] Applying corrections for ${state.generatorType}`);

  try {
    const { input, userCorrections, promptConfig } = state;

    if (!userCorrections || userCorrections.trim().length === 0) {
      throw new Error('User corrections are required for correction phase');
    }

    const currentPlan = getCurrentPlan(state);
    if (!currentPlan) {
      throw new Error('No plan available to correct');
    }

    const promptConfigData = await loadPromptConfig(promptConfig.correctionPrompt);

    const promptContext = {
      systemRole: promptConfigData.systemPrompt,
      taskInstructions: promptConfigData.generationPrompt,
      request: {
        inhalt: input.inhalt,
        gliederung: input.gliederung,
        requestType: input.subType || input.generatorType,
        locale: input.locale || 'de-DE'
      },
      knowledge: [
        `## Aktueller Plan\n${currentPlan}`,
        `## Gewünschte Korrekturen\n${userCorrections}`
      ]
    };

    const assembledPrompt = await assemblePromptGraphAsync(promptContext);

    const aiResponse = await input.aiWorkerPool.processRequest({
      type: `${state.generatorType}_plan_correction`,
      usePrivacyMode: input.usePrivacyMode || false,
      systemPrompt: assembledPrompt.system,
      messages: assembledPrompt.messages as never,
      options: {
        max_tokens: promptConfigData.options?.max_tokens || 3000,
        temperature: promptConfigData.options?.temperature || 0.4
      }
    }, input.req);

    const correctedPlan = aiResponse.content;
    const correctionSummary = extractCorrectionSummary(correctedPlan, currentPlan);
    const correctionTimeMs = Date.now() - startTime;

    console.log(`[PlanWorkflow] Plan corrected in ${correctionTimeMs}ms: ${correctionSummary}`);

    return {
      correctedPlanData: {
        correctedPlan,
        correctionSummary,
        correctionTimeMs
      },
      currentPhase: 'plan' as const,
      phasesExecuted: [...state.phasesExecuted, 'correction'],
      totalAICalls: state.totalAICalls + 1,
      userCorrections: undefined
    };
  } catch (error: any) {
    console.error('[PlanWorkflow] Plan correction error:', error);
    return {
      error: `Plan correction failed: ${error.message}`,
      currentPhase: 'error',
      success: false
    };
  }
}
