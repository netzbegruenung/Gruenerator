/**
 * Plan Mode API Routes
 * Generic routes for Plan Mode workflow across all generators
 */

import { Router, type Request, type Response } from 'express';
import { createPlanModeOrchestrator } from '../../agents/langgraph/PlanModeOrchestrator.js';
import { planModeWorkflowService } from '../../services/WorkflowService/PlanModeWorkflowService.js';
import type { AuthenticatedRequest } from '../../middleware/types.js';
import type {
    PlanModeRequest,
    PlanModeConfig,
    InitiateResponse,
    AnswerQuestionsResponse,
    ApproveResponse,
    ProductionResponse,
    ProductionData,
    WorkflowStatusResponse,
    PlanModeError
} from '../../agents/langgraph/types/planMode.js';

const router = Router();

// Get AI worker pool (assumes it's available in request context or import)
let aiWorkerPool: any;
export const setPlanModeWorkerPool = (pool: any) => {
    aiWorkerPool = pool;
};

/**
 * POST /api/plan-mode/initiate
 * Phase 1: Generate initial plan with optional questions
 */
router.post('/initiate', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const requestData: PlanModeRequest = req.body;

        // Validate required fields
        if (!requestData.generatorType || !requestData.inhalt) {
            return res.status(400).json({
                error: 'Missing required fields: generatorType, inhalt'
            });
        }

        // Build config based on generator type
        const config: PlanModeConfig = {
            generatorType: requestData.generatorType,
            planPromptConfig: `plan_generation_${requestData.generatorType}`,
            questionsPromptConfig: `interactive_questions_${requestData.generatorType}`,
            revisionPromptConfig: `plan_revision_${requestData.generatorType}`,
            productionPromptConfig: requestData.generatorType === 'pr' ? 'pr_agent' : 'antrag_experimental',
            enableQuestions: true,
            enableWebSearch: requestData.useWebSearch !== false,
            enableDocuments: (requestData.selectedDocumentIds?.length || 0) > 0,
            enableKnowledge: true,
            availablePlatforms: requestData.platforms
        };

        // Create orchestrator and generate plan
        const orchestrator = createPlanModeOrchestrator(aiWorkerPool);
        const result = await orchestrator.generatePlan(config, requestData, req, userId);

        // Format response
        const response: InitiateResponse = {
            success: true,
            workflow_id: result.workflowId,
            plan: result.plan.originalPlan,
            planSummary: result.plan.planSummary,
            needsQuestions: result.questions?.needsClarification || false,
            questions: result.questions?.questions,
            metadata: {
                confidenceScore: result.plan.confidenceScore,
                executionTimeMs: result.executionTimeMs,
                enrichmentMetadata: result.plan.enrichmentMetadata
            }
        };

        res.json(response);
    } catch (error: any) {
        console.error('[Plan Mode] Initiate error:', error);
        const errorResponse: PlanModeError = {
            error: error.message || 'Failed to generate plan',
            code: 'AI_ERROR',
            details: error
        };
        res.status(500).json(errorResponse);
    }
});

/**
 * POST /api/plan-mode/answer-questions
 * Phase 2 → 3: Submit answers and get revised plan
 */
router.post('/answer-questions', async (req: Request, res: Response) => {
    try {
        const { workflow_id, answers } = req.body;

        if (!workflow_id || !answers) {
            return res.status(400).json({
                error: 'Missing required fields: workflow_id, answers'
            });
        }

        // Create orchestrator and revise plan
        const orchestrator = createPlanModeOrchestrator(aiWorkerPool);
        const result = await orchestrator.revisePlan(workflow_id, answers, req);

        const response: AnswerQuestionsResponse = {
            success: true,
            revised_plan: result.revisedPlan,
            changes: result.changes,
            ready_for_approval: true,
            metadata: {
                executionTimeMs: result.executionTimeMs
            }
        };

        res.json(response);
    } catch (error: any) {
        console.error('[Plan Mode] Answer questions error:', error);
        const errorResponse: PlanModeError = {
            error: error.message || 'Failed to revise plan',
            code: 'AI_ERROR',
            details: error
        };
        res.status(500).json(errorResponse);
    }
});

/**
 * POST /api/plan-mode/approve
 * Phase 4: Approve plan and configure production
 */
router.post('/approve', async (req: Request, res: Response) => {
    try {
        const { workflow_id, approval_config } = req.body;

        if (!workflow_id || !approval_config) {
            return res.status(400).json({
                error: 'Missing required fields: workflow_id, approval_config'
            });
        }

        // Save approval
        await planModeWorkflowService.approvePlan(workflow_id, approval_config);

        const response: ApproveResponse = {
            success: true,
            status: 'generating',
            workflow_id
        };

        res.json(response);
    } catch (error: any) {
        console.error('[Plan Mode] Approve error:', error);
        const errorResponse: PlanModeError = {
            error: error.message || 'Failed to approve plan',
            code: 'INVALID_STATE',
            details: error
        };
        res.status(500).json(errorResponse);
    }
});

/**
 * POST /api/plan-mode/generate-production
 * Phase 5: Generate final production content
 */
router.post('/generate-production', async (req: Request, res: Response) => {
    try {
        const { workflow_id } = req.body;

        if (!workflow_id) {
            return res.status(400).json({
                error: 'Missing required field: workflow_id'
            });
        }

        // Create orchestrator and generate production
        const orchestrator = createPlanModeOrchestrator(aiWorkerPool);
        const result = await orchestrator.generateProduction(workflow_id, req);

        // Construct properly typed ProductionData
        const productionData: ProductionData = {
            content: result.production_data?.content || {},
            sharepics: result.production_data?.sharepics,
            metadata: {
                executionTimeMs: result.executionTimeMs,
                aiCallsCount: result.production_data?.metadata?.aiCallsCount || 1,
                ...(result.production_data?.metadata || {})
            }
        };

        const response: ProductionResponse = {
            success: true,
            production_data: productionData,
            metadata: {
                executionTimeMs: result.executionTimeMs,
                aiCallsCount: productionData.metadata.aiCallsCount
            }
        };

        res.json(response);
    } catch (error: any) {
        console.error('[Plan Mode] Production error:', error);
        const errorResponse: PlanModeError = {
            error: error.message || 'Failed to generate production content',
            code: 'AI_ERROR',
            details: error
        };
        res.status(500).json(errorResponse);
    }
});

/**
 * GET /api/plan-mode/workflow/:workflowId
 * Get workflow status and data
 */
router.get('/workflow/:workflowId', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { workflowId } = req.params;
        const userId = req.user?.id;

        const workflow = await planModeWorkflowService.getPlanModeWorkflow(workflowId, userId);

        if (!workflow) {
            const errorResponse: PlanModeError = {
                error: 'Workflow not found or expired',
                code: 'WORKFLOW_NOT_FOUND'
            };
            return res.status(404).json(errorResponse);
        }

        const response: WorkflowStatusResponse = {
            workflow_id: workflow.id,
            current_phase: workflow.status,
            status: workflow.status,
            plan: workflow.plan_data?.originalPlan,
            questions: workflow.questions_data?.questions,
            revised_plan: workflow.revised_plan_data?.revisedPlan,
            approval_config: workflow.approval_config,
            production_data: workflow.production_data,
            created_at: workflow.created_at,
            completed_at: workflow.completed_at
        };

        res.json(response);
    } catch (error: any) {
        console.error('[Plan Mode] Get workflow error:', error);
        const errorResponse: PlanModeError = {
            error: error.message || 'Failed to fetch workflow',
            code: 'INTERNAL_ERROR',
            details: error
        };
        res.status(500).json(errorResponse);
    }
});

export default router;
