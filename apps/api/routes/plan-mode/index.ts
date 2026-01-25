/**
 * Plan Mode API Routes
 * LangGraph-based workflow for plan-based content generation
 */

import { Router, type Request, type Response } from 'express';
import {
  getPromptConfig,
  createPlanWorkflowGraph,
  initializePlanWorkflow,
  resumeWithAnswers,
  resumeWithCorrections,
  type PlanWorkflowInput,
  type PlanWorkflowOutput,
} from '../../agents/langgraph/PlanWorkflowGraph/index.js';
import {
  saveWorkflowState,
  getWorkflowState,
} from '../../agents/langgraph/PlanWorkflowGraph/persistence.js';
import type { AuthenticatedRequest } from '../../middleware/types.js';
import type {
  PlanModeRequest,
  InitiateResponse,
  PlanModeError,
} from '../../agents/langgraph/types/planMode.js';

const router = Router();

let aiWorkerPool: any;
export const setPlanModeWorkerPool = (pool: any) => {
  aiWorkerPool = pool;
};

/**
 * Inject runtime objects into state for graph execution
 */
function injectRuntime(state: any, req: Request): any {
  return {
    ...state,
    input: { ...state.input, aiWorkerPool, req },
  };
}

/**
 * POST /api/plan-mode/initiate
 */
router.post('/initiate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const requestData: PlanModeRequest = req.body;

    if (!requestData.generatorType || !requestData.inhalt) {
      return res.status(400).json({
        error: 'Missing required fields: generatorType, inhalt',
      });
    }

    const workflowInput: PlanWorkflowInput = {
      inhalt: requestData.inhalt,
      gliederung: requestData.gliederung,
      generatorType: requestData.generatorType,
      subType: requestData.subType,
      locale: requestData.locale || 'de-DE',
      useWebSearch: requestData.useWebSearch !== false,
      usePrivacyMode: requestData.usePrivacyMode || false,
      useProMode: requestData.useProMode || false,
      selectedDocumentIds: requestData.selectedDocumentIds,
      selectedTextIds: requestData.selectedTextIds,
      customPrompt: requestData.customPrompt,
      platforms: requestData.platforms,
      aiWorkerPool,
      req,
      userId,
    };

    const promptConfig = getPromptConfig(requestData.generatorType);
    const graph = createPlanWorkflowGraph();
    const initialState = initializePlanWorkflow(workflowInput, promptConfig);

    const finalState = await graph.invoke(initialState);

    // Always save to Redis for correction and resume support
    await saveWorkflowState(finalState.workflowId, finalState);

    const executionTimeMs = Date.now() - finalState.startTime;

    if (!finalState.success && finalState.error) {
      return res.status(500).json({
        error: finalState.error,
        code: 'AI_ERROR',
      } as PlanModeError);
    }

    const response: InitiateResponse = {
      success: true,
      workflow_id: finalState.workflowId,
      plan: finalState.planData?.originalPlan || '',
      planSummary: finalState.planData?.planSummary || '',
      needsQuestions: finalState.questionsData?.needsClarification || false,
      questions: finalState.questionsData?.questions,
      metadata: {
        confidenceScore: finalState.planData?.confidenceScore || 0,
        executionTimeMs,
        enrichmentMetadata: finalState.planData?.enrichmentMetadata,
      },
    };

    return res.json(response);
  } catch (error: any) {
    console.error('[PlanMode] Initiate error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to execute workflow',
      code: 'AI_ERROR',
    } as PlanModeError);
  }
});

/**
 * POST /api/plan-mode/resume
 */
router.post('/resume', async (req: Request, res: Response) => {
  try {
    const { workflow_id, answers } = req.body;

    if (!workflow_id || !answers) {
      return res.status(400).json({
        error: 'Missing required fields: workflow_id, answers',
      });
    }

    const savedState = await getWorkflowState(workflow_id);
    if (!savedState) {
      return res.status(404).json({
        error: `Workflow ${workflow_id} not found or expired`,
      });
    }

    const graph = createPlanWorkflowGraph();
    const stateWithRuntime = injectRuntime(savedState, req);
    const resumedState = resumeWithAnswers(stateWithRuntime, answers);
    const finalState = await graph.invoke(resumedState, { recursionLimit: 10 });

    const executionTimeMs = Date.now() - finalState.startTime;

    if (!finalState.success) {
      return res.status(500).json({
        error: finalState.error || 'Failed to resume workflow',
        code: 'AI_ERROR',
      } as PlanModeError);
    }

    return res.json({
      success: true,
      workflow_id: finalState.workflowId,
      revised_plan: finalState.revisedPlanData?.revisedPlan,
      production_data: finalState.productionData,
      metadata: {
        executionTimeMs,
        phasesExecuted: finalState.phasesExecuted,
        totalAICalls: finalState.totalAICalls,
      },
    });
  } catch (error: any) {
    console.error('[PlanMode] Resume error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to resume workflow',
      code: 'AI_ERROR',
    } as PlanModeError);
  }
});

/**
 * POST /api/plan-mode/correct
 * Apply free-form corrections to the plan
 */
router.post('/correct', async (req: Request, res: Response) => {
  try {
    const { workflow_id, corrections } = req.body;

    if (!workflow_id || !corrections || typeof corrections !== 'string') {
      return res.status(400).json({
        error: 'Missing required fields: workflow_id, corrections (string)',
      });
    }

    if (corrections.trim().length === 0) {
      return res.status(400).json({
        error: 'Corrections cannot be empty',
      });
    }

    const savedState = await getWorkflowState(workflow_id);
    if (!savedState) {
      return res.status(404).json({
        error: `Workflow ${workflow_id} not found or expired`,
      });
    }

    const graph = createPlanWorkflowGraph();
    const stateWithRuntime = injectRuntime(savedState, req);
    const correctionState = resumeWithCorrections(stateWithRuntime, corrections);
    const finalState = await graph.invoke(correctionState, { recursionLimit: 10 });

    // Save updated state for further corrections or production
    await saveWorkflowState(finalState.workflowId, finalState);

    const executionTimeMs = Date.now() - finalState.startTime;

    if (!finalState.success && finalState.error) {
      return res.status(500).json({
        error: finalState.error,
        code: 'AI_ERROR',
      } as PlanModeError);
    }

    return res.json({
      success: true,
      workflow_id: finalState.workflowId,
      corrected_plan: finalState.correctedPlanData?.correctedPlan,
      correction_summary: finalState.correctedPlanData?.correctionSummary,
      metadata: {
        executionTimeMs,
        correctionTimeMs: finalState.correctedPlanData?.correctionTimeMs,
        phasesExecuted: finalState.phasesExecuted,
        totalAICalls: finalState.totalAICalls,
      },
    });
  } catch (error: any) {
    console.error('[PlanMode] Correct error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to apply corrections',
      code: 'AI_ERROR',
    } as PlanModeError);
  }
});

/**
 * POST /api/plan-mode/generate-production
 */
router.post('/generate-production', async (req: Request, res: Response) => {
  try {
    const { workflow_id } = req.body;

    if (!workflow_id) {
      return res.status(400).json({
        error: 'Missing required field: workflow_id',
      });
    }

    const savedState = await getWorkflowState(workflow_id);
    if (!savedState) {
      return res.status(404).json({
        error: `Workflow ${workflow_id} not found or expired`,
      });
    }

    const graph = createPlanWorkflowGraph();
    const stateWithRuntime = injectRuntime(savedState, req);
    const stateForProduction = {
      ...stateWithRuntime,
      skipQuestions: true,
      currentPhase: 'production' as const,
      phasesExecuted: [...savedState.phasesExecuted, 'skip-to-production'],
    };

    const finalState = await graph.invoke(stateForProduction, { recursionLimit: 10 });
    const executionTimeMs = Date.now() - finalState.startTime;

    if (!finalState.success) {
      return res.status(500).json({
        error: finalState.error || 'Production generation failed',
        code: 'AI_ERROR',
      } as PlanModeError);
    }

    return res.json({
      success: true,
      workflow_id: finalState.workflowId,
      production_data: finalState.productionData,
      metadata: {
        executionTimeMs,
        phasesExecuted: finalState.phasesExecuted,
        totalAICalls: finalState.totalAICalls,
      },
    });
  } catch (error: any) {
    console.error('[PlanMode] Generate production error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to generate production',
      code: 'AI_ERROR',
    } as PlanModeError);
  }
});

/**
 * GET /api/plan-mode/workflow/:workflowId
 */
router.get('/workflow/:workflowId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { workflowId } = req.params;
    const state = await getWorkflowState(workflowId);

    if (!state) {
      return res.status(404).json({
        error: 'Workflow not found or expired',
        code: 'WORKFLOW_NOT_FOUND',
      } as PlanModeError);
    }

    return res.json({
      workflow_id: workflowId,
      current_phase: state.currentPhase,
      phases_executed: state.phasesExecuted,
      plan: state.planData?.originalPlan,
      questions: state.questionsData?.questions,
      revised_plan: state.revisedPlanData?.revisedPlan,
      corrected_plan: state.correctedPlanData?.correctedPlan,
      correction_summary: state.correctedPlanData?.correctionSummary,
      production_data: state.productionData,
      success: state.success,
      error: state.error,
    });
  } catch (error: any) {
    console.error('[PlanMode] Get workflow error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to get workflow status',
      code: 'INTERNAL_ERROR',
    } as PlanModeError);
  }
});

export default router;
