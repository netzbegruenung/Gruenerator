/**
 * Revision Node
 * Revises the plan based on user answers to questions
 * Reusable across all generator types
 */

import type { PlanWorkflowState, RevisionNodeOutput } from '../types.js';
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
 * Format Q&A pairs for context
 */
function formatQAPairs(
  questions: any[],
  answers: Record<string, string | string[]>
): string {
  return questions
    .map((q) => {
      const answer = answers[q.id];
      const answerText = Array.isArray(answer) ? answer.join(', ') : answer;
      return `**${q.questionText}**\nAntwort: ${answerText}\n`;
    })
    .join('\n');
}

/**
 * Calculate diff between original and revised plan
 */
function calculateDiff(originalPlan: string, revisedPlan: string): string {
  // Simple diff - count changed sections
  const originalSections = originalPlan.split('\n\n').filter(s => s.trim());
  const revisedSections = revisedPlan.split('\n\n').filter(s => s.trim());

  const addedSections = revisedSections.length - originalSections.length;
  const changePercentage = Math.round((Math.abs(revisedPlan.length - originalPlan.length) / originalPlan.length) * 100);

  return `Plan wurde angepasst: ${changePercentage}% Änderungen, ${addedSections > 0 ? `${addedSections} neue Abschnitte` : 'keine neuen Abschnitte'}`;
}

/**
 * Revision Node: Revise plan based on user answers
 */
export async function revisionNode(state: PlanWorkflowState): Promise<RevisionNodeOutput> {
  const startTime = Date.now();
  console.log(`[PlanWorkflow] Revising plan for ${state.generatorType}`);

  try {
    const { input, planData, questionsData, userAnswers, promptConfig } = state;

    // Validation
    if (!planData) {
      throw new Error('Plan must be generated before revision');
    }

    if (!questionsData || !userAnswers) {
      throw new Error('Questions and answers required for revision');
    }

    // Load revision prompt configuration
    const promptConfigData = await loadPromptConfig(promptConfig.revisionPrompt);

    // Format Q&A pairs for context
    const qaContext = formatQAPairs(questionsData.questions, userAnswers);

    // Build prompt context
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
        `## Ursprünglicher Plan\n${planData.originalPlan}`,
        `## Beantwortete Fragen\n${qaContext}`
      ]
    };

    // Assemble full prompt
    const assembledPrompt = await assemblePromptGraphAsync(promptContext);

    // Generate revised plan via AI worker pool
    const aiResponse = await input.aiWorkerPool.processRequest({
      type: `${state.generatorType}_plan_revision`,
      usePrivacyMode: input.usePrivacyMode || false,
      systemPrompt: assembledPrompt.system,
      messages: assembledPrompt.messages as never,
      options: {
        max_tokens: promptConfigData.options?.max_tokens || 4000,
        temperature: promptConfigData.options?.temperature || 0.6
      }
    }, input.req);

    const revisedPlan = aiResponse.content;
    const changes = calculateDiff(planData.originalPlan, revisedPlan);
    const revisionTimeMs = Date.now() - startTime;

    console.log(`[PlanWorkflow] Plan revised in ${revisionTimeMs}ms`);

    return {
      revisedPlanData: {
        revisedPlan,
        changes,
        revisionTimeMs
      },
      currentPhase: 'production',
      phasesExecuted: [...state.phasesExecuted, 'revision'],
      totalAICalls: state.totalAICalls + 1
    };
  } catch (error: any) {
    console.error('[PlanWorkflow] Plan revision error:', error);
    return {
      error: `Plan revision failed: ${error.message}`,
      currentPhase: 'error',
      success: false
    };
  }
}
