/**
 * PlanWorkflowGraph
 * Reusable LangGraph workflow for plan-based content generation
 * Supports: Anträge, PR posts, and other strategic content types
 */

import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import type {
  PlanWorkflowState,
  PlanWorkflowInput,
  PlanWorkflowOutput,
  PromptConfiguration
} from './types.js';
import {
  enrichmentNode,
  planGenerationNode,
  questionsNode,
  revisionNode,
  productionNode
} from './nodes/index.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * State Schema using Annotation
 */
const PlanWorkflowStateAnnotation = Annotation.Root({
  // Input parameters (immutable)
  input: Annotation<PlanWorkflowInput>,

  // Workflow control
  workflowId: Annotation<string>,
  generatorType: Annotation<string>,
  promptConfig: Annotation<PromptConfiguration>,

  // Current phase
  currentPhase: Annotation<PlanWorkflowState['currentPhase']>,

  // Phase data
  enrichedState: Annotation<PlanWorkflowState['enrichedState']>,
  enrichmentTimeMs: Annotation<number | undefined>,
  planData: Annotation<PlanWorkflowState['planData']>,
  planGenerationTimeMs: Annotation<number | undefined>,
  questionsData: Annotation<PlanWorkflowState['questionsData']>,
  questionsGenerationTimeMs: Annotation<number | undefined>,
  userAnswers: Annotation<PlanWorkflowState['userAnswers']>,
  skipQuestions: Annotation<boolean | undefined>,
  revisedPlanData: Annotation<PlanWorkflowState['revisedPlanData']>,
  productionData: Annotation<PlanWorkflowState['productionData']>,
  productionTimeMs: Annotation<number | undefined>,

  // Metadata
  startTime: Annotation<number>,
  phasesExecuted: Annotation<string[]>,
  totalAICalls: Annotation<number>,

  // Error handling
  error: Annotation<string | undefined>,
  success: Annotation<boolean>
});

/**
 * Conditional edge: After questions node
 * Routes to production (skip), revision (with answers), or waits for user input
 */
function routeAfterQuestions(state: typeof PlanWorkflowStateAnnotation.State) {
  // If user answers provided, go to revision
  if (state.userAnswers && Object.keys(state.userAnswers).length > 0) {
    console.log('[PlanWorkflow] Routing: questions → revision (answers provided)');
    return 'revision';
  }

  // If questions not needed, skip to production
  if (state.skipQuestions || !state.questionsData?.needsClarification) {
    console.log('[PlanWorkflow] Routing: questions → production (skip)');
    return 'production';
  }

  // Wait for user to provide answers via resume
  console.log('[PlanWorkflow] Routing: questions → WAIT (user input needed)');
  return END;
}

/**
 * Conditional edge: After revision or skip questions
 * Always routes to production
 */
function routeToProduction(state: typeof PlanWorkflowStateAnnotation.State) {
  console.log('[PlanWorkflow] Routing: revision → production');
  return 'production';
}

/**
 * Create PlanWorkflowGraph
 */
export function createPlanWorkflowGraph() {
  const graph = new StateGraph(PlanWorkflowStateAnnotation)
    // Add all nodes
    .addNode('enrichment', enrichmentNode)
    .addNode('plan', planGenerationNode)
    .addNode('questions', questionsNode)
    .addNode('revision', revisionNode, { ends: ['production'] })
    .addNode('production', productionNode)

    // Sequential edges
    .addEdge(START, 'enrichment')
    .addEdge('enrichment', 'plan')
    .addEdge('plan', 'questions')

    // Conditional edges from questions
    .addConditionalEdges('questions', routeAfterQuestions, {
      production: 'production',
      revision: 'revision',
      [END]: END
    })
    .addEdge('revision', 'production')
    .addEdge('production', END);

  return graph.compile();
}

/**
 * Initialize workflow with input
 */
export function initializePlanWorkflow(
  input: PlanWorkflowInput,
  promptConfig: PromptConfiguration
): typeof PlanWorkflowStateAnnotation.State {
  const workflowId = input.workflowId || uuidv4();

  return {
    input,
    workflowId,
    generatorType: input.generatorType,
    promptConfig,
    currentPhase: 'enrich' as const,
    enrichedState: undefined,
    enrichmentTimeMs: undefined,
    planData: undefined,
    planGenerationTimeMs: undefined,
    questionsData: undefined,
    questionsGenerationTimeMs: undefined,
    userAnswers: undefined,
    skipQuestions: undefined,
    revisedPlanData: undefined,
    productionData: undefined,
    productionTimeMs: undefined,
    startTime: Date.now(),
    phasesExecuted: [],
    totalAICalls: 0,
    error: undefined,
    success: false
  };
}

/**
 * Resume workflow with user answers
 */
export function resumeWithAnswers(
  previousState: typeof PlanWorkflowStateAnnotation.State,
  userAnswers: Record<string, string | string[]>
): typeof PlanWorkflowStateAnnotation.State {
  return {
    ...previousState,
    userAnswers,
    currentPhase: 'revision',
    phasesExecuted: [...previousState.phasesExecuted, 'answers-provided']
  };
}

/**
 * Execute workflow and return output
 */
export async function executePlanWorkflow(
  input: PlanWorkflowInput,
  promptConfig: PromptConfiguration
): Promise<PlanWorkflowOutput> {
  const graph = createPlanWorkflowGraph();
  const initialState = initializePlanWorkflow(input, promptConfig);

  try {
    const result = await graph.invoke(initialState);

    // Format output
    const executionTimeMs = Date.now() - result.startTime;

    return {
      success: result.success,
      workflowId: result.workflowId,
      plan: result.planData,
      questions: result.questionsData,
      revisedPlan: result.revisedPlanData?.revisedPlan,
      productionContent: result.productionData,
      metadata: {
        executionTimeMs,
        phasesExecuted: result.phasesExecuted,
        totalAICalls: result.totalAICalls,
        generatorType: result.generatorType
      },
      error: result.error
    };
  } catch (error: any) {
    console.error('[PlanWorkflow] Execution error:', error);
    return {
      success: false,
      workflowId: initialState.workflowId,
      metadata: {
        executionTimeMs: Date.now() - initialState.startTime,
        phasesExecuted: initialState.phasesExecuted,
        totalAICalls: initialState.totalAICalls,
        generatorType: initialState.generatorType
      },
      error: `Workflow execution failed: ${error.message}`
    };
  }
}

/**
 * Resume workflow with user answers and continue to production
 */
export async function resumePlanWorkflowWithAnswers(
  previousState: typeof PlanWorkflowStateAnnotation.State,
  userAnswers: Record<string, string | string[]>
): Promise<PlanWorkflowOutput> {
  const graph = createPlanWorkflowGraph();
  const resumedState = resumeWithAnswers(previousState, userAnswers);

  try {
    // Continue from revision node
    const result = await graph.invoke(resumedState, {
      recursionLimit: 10
    });

    const executionTimeMs = Date.now() - result.startTime;

    return {
      success: result.success,
      workflowId: result.workflowId,
      plan: result.planData,
      questions: result.questionsData,
      revisedPlan: result.revisedPlanData?.revisedPlan,
      productionContent: result.productionData,
      metadata: {
        executionTimeMs,
        phasesExecuted: result.phasesExecuted,
        totalAICalls: result.totalAICalls,
        generatorType: result.generatorType
      },
      error: result.error
    };
  } catch (error: any) {
    console.error('[PlanWorkflow] Resume execution error:', error);
    return {
      success: false,
      workflowId: resumedState.workflowId,
      metadata: {
        executionTimeMs: Date.now() - resumedState.startTime,
        phasesExecuted: resumedState.phasesExecuted,
        totalAICalls: resumedState.totalAICalls,
        generatorType: resumedState.generatorType
      },
      error: `Workflow resume failed: ${error.message}`
    };
  }
}
