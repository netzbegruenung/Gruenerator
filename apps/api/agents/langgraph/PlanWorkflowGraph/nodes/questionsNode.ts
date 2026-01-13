/**
 * Questions Node
 * Analyzes plan and generates clarifying questions using AI
 */

import type { PlanWorkflowState, QuestionsNodeOutput, GeneratedQuestion } from '../types.js';
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

interface QuestionsResponse {
  needsClarification: boolean;
  confidenceReason: string;
  questions: Array<{
    id: string;
    questionText: string;
    questionType: string;
    options: string[];
    why?: string;
  }>;
}

function parseQuestionsResponse(content: string): QuestionsResponse {
  console.log('[questionsNode] Raw AI response:', content.substring(0, 500));

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.log('[questionsNode] No JSON found in response');
    return { needsClarification: false, confidenceReason: 'No JSON found', questions: [] };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    console.log('[questionsNode] Parsed response:', JSON.stringify(parsed, null, 2).substring(0, 500));
    return {
      needsClarification: parsed.needsClarification ?? false,
      confidenceReason: parsed.confidenceReason ?? '',
      questions: Array.isArray(parsed.questions) ? parsed.questions : []
    };
  } catch (e) {
    console.log('[questionsNode] JSON parse error:', e);
    return { needsClarification: false, confidenceReason: 'JSON parse error', questions: [] };
  }
}

function mapToGeneratedQuestions(questions: QuestionsResponse['questions']): GeneratedQuestion[] {
  return questions.map((q, index) => ({
    id: q.id || `q${index + 1}`,
    questionText: q.questionText,
    questionType: 'verstaendnis' as const,
    why: q.why || '',
    options: q.options || [],
    clarificationPurpose: q.why
  }));
}

function extractOptionsFromPlan(plan: string): GeneratedQuestion[] {
  const questions: GeneratedQuestion[] = [];
  const sections = plan.split(/###?\s+/);

  for (const section of sections) {
    const optionMatches = section.match(/Option\s+[A-D][:.]?\s*([^\n]+)/gi);
    if (optionMatches && optionMatches.length >= 2) {
      const sectionTitle = section.split('\n')[0].trim();
      const options = optionMatches.map(m => m.replace(/Option\s+[A-D][:.]?\s*/i, '').trim());

      questions.push({
        id: `q${questions.length + 1}`,
        questionText: `Welche Option bevorzugen Sie für "${sectionTitle}"?`,
        questionType: 'verstaendnis',
        why: `Plan enthält ${options.length} Alternativen`,
        options: options.slice(0, 4),
        clarificationPurpose: sectionTitle
      });
    }
  }

  return questions.slice(0, 5);
}

export async function questionsNode(state: PlanWorkflowState): Promise<QuestionsNodeOutput> {
  const startTime = Date.now();
  console.log(`[PlanWorkflow] Analyzing plan for questions (${state.generatorType})`);

  try {
    const { input, planData, promptConfig } = state;

    if (!planData) {
      throw new Error('Plan must be generated before questions');
    }

    if (!promptConfig.enableQuestions) {
      console.log('[PlanWorkflow] Questions disabled - skipping to production');
      return {
        skipQuestions: true,
        currentPhase: 'production',
        phasesExecuted: [...state.phasesExecuted, 'questions-skipped']
      };
    }

    const promptConfigData = await loadPromptConfig(promptConfig.questionsPrompt);

    const promptContext = {
      systemRole: promptConfigData.systemPrompt,
      request: {
        inhalt: input.inhalt,
        plan: planData.originalPlan
      }
    };

    const assembledPrompt = await assemblePromptGraphAsync(promptContext);

    const aiResponse = await input.aiWorkerPool.processRequest({
      type: `${state.generatorType}_question_generation`,
      usePrivacyMode: input.usePrivacyMode || false,
      systemPrompt: assembledPrompt.system,
      messages: assembledPrompt.messages as never,
      options: {
        max_tokens: promptConfigData.options?.max_tokens || 1000,
        temperature: promptConfigData.options?.temperature || 0.2
      }
    }, input.req);

    const questionsGenerationTimeMs = Date.now() - startTime;
    const parsed = parseQuestionsResponse(aiResponse.content);
    let questions = mapToGeneratedQuestions(parsed.questions);

    // Fallback: If AI didn't produce questions, extract from plan patterns
    if (questions.length === 0) {
      console.log('[questionsNode] AI produced no questions, trying pattern extraction...');
      questions = extractOptionsFromPlan(planData.originalPlan);
      console.log(`[questionsNode] Pattern extraction found ${questions.length} questions`);
    }

    const questionsData = {
      needsClarification: questions.length > 0,
      questions,
      questionRound: 1,
      confidenceReason: questions.length > 0
        ? `${questions.length} Entscheidungspunkte gefunden`
        : parsed.confidenceReason || 'Keine offenen Entscheidungen'
    };

    console.log(`[PlanWorkflow] Questions: needsClarification=${questionsData.needsClarification}, count=${questions.length}`);

    if (!questionsData.needsClarification) {
      return {
        questionsData,
        questionsGenerationTimeMs,
        skipQuestions: true,
        currentPhase: 'production',
        phasesExecuted: [...state.phasesExecuted, 'questions-not-needed'],
        totalAICalls: state.totalAICalls + 1
      };
    }

    return {
      questionsData,
      questionsGenerationTimeMs,
      skipQuestions: false,
      currentPhase: 'questions',
      phasesExecuted: [...state.phasesExecuted, 'questions-generated'],
      totalAICalls: state.totalAICalls + 1
    };
  } catch (error: any) {
    console.error('[PlanWorkflow] Questions generation error:', error);
    return {
      skipQuestions: true,
      currentPhase: 'production',
      phasesExecuted: [...state.phasesExecuted, 'questions-error'],
      totalAICalls: state.totalAICalls + 1
    };
  }
}
