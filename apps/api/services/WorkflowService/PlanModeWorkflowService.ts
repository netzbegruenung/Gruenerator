/**
 * Plan Mode Workflow Service
 * Extends base WorkflowService to handle Plan Mode 5-phase state machine
 * Phase Flow: draft → plan_generated → questions_asked → plan_revised → approved → generating → completed
 */

import { WorkflowService, type Workflow, type WorkflowType, type WorkflowStatus } from './index.js';
import { redisClient } from '../../utils/redis/client.js';

// Plan Mode specific workflow types (already defined in base WorkflowService)
export type PlanModeWorkflowType = 'plan_mode_pr' | 'plan_mode_antrag';

// Plan Mode specific data structures
export interface PlanData {
    originalPlan: string;                      // Markdown-formatted strategic plan
    planSummary: string;                      // Short overview for UI
    confidenceScore: number;                  // 0-1, AI confidence
    researchedArguments?: any[];              // From vector search
    enrichmentMetadata: Record<string, any>; // Sources, timing, etc.
}

export interface QuestionsData {
    questions: Array<{
        id: string;
        questionText: string;
        questionType: 'multiple_choice' | 'yes_no' | 'free_form';
        options?: Array<{ text: string; emoji?: string }>;
    }>;
    questionRound: number;         // Support multi-round Q&A
    needsClarification: boolean;   // AI decision flag
    confidenceReason: string;      // Why AI needs/doesn't need questions
}

export interface RevisedPlanData {
    revisedPlan: string;          // Updated plan with Q&A context
    answers: Record<string, string | string[]>; // User's answers
    changesFromOriginal: string;  // What changed from original
}

export interface ApprovalConfig {
    selectedPlatforms?: string[];  // For PR mode
    userFeedback?: string;        // Optional modifications
    approvedPlanVersion: 'original' | 'revised';
}

// Extend base Workflow with Plan Mode specific fields
export interface PlanModeWorkflow extends Workflow {
    workflow_type: WorkflowType;  // Use base type for compatibility
    status: WorkflowStatus;

    // Phase 1: Initial plan
    plan_data: PlanData | null;

    // Phase 2: Questions (optional - AI decides)
    questions_data: QuestionsData | null;

    // Phase 3: Revised plan (if questions asked)
    revised_plan_data: RevisedPlanData | null;

    // Phase 4: Approval config
    approval_config: ApprovalConfig | null;

    // Phase 5: Production
    production_data: Record<string, any> | null;

    // Timestamps for each phase
    plan_generated_at: string | null;
    questions_asked_at: string | null;
    plan_revised_at: string | null;
}

const PLAN_MODE_WORKFLOW_TTL = 86400; // 24 hours (user can leave after Feierabend and return next morning)

/**
 * Plan Mode Workflow Service
 * Manages state transitions through 5-phase Plan Mode workflow
 */
export class PlanModeWorkflowService extends WorkflowService {
    /**
     * Create Plan Mode workflow
     */
    async createPlanModeWorkflow(
        workflowType: PlanModeWorkflowType,
        userId: string,
        inputData: Record<string, any>
    ): Promise<string> {
        const workflowId = await this.createWorkflow(
            workflowType as any, // Cast to base type
            userId,
            inputData,
            ['plan_mode', workflowType === 'plan_mode_pr' ? 'pr' : 'antrag']
        );

        return workflowId;
    }

    /**
     * PHASE 1: Save plan generation results
     */
    async savePlan(
        workflowId: string,
        planData: PlanData,
        questionsData: QuestionsData | null
    ): Promise<void> {
        const workflow = await this.getWorkflow(workflowId) as PlanModeWorkflow;
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }

        // Update workflow with plan data
        const updatedWorkflow: PlanModeWorkflow = {
            ...workflow,
            plan_data: planData,
            questions_data: questionsData,
            plan_generated_at: new Date().toISOString(),
            status: questionsData?.needsClarification ? 'plan_generated' : 'approved'
        };

        await redisClient.setEx(
            this.getKey(workflowId),
            PLAN_MODE_WORKFLOW_TTL,
            JSON.stringify(updatedWorkflow)
        );
    }

    /**
     * PHASE 2: Save user answers to questions
     */
    async saveAnswers(
        workflowId: string,
        answers: Record<string, string | string[]>,
        questionRound: number
    ): Promise<void> {
        const workflow = await this.getWorkflow(workflowId) as PlanModeWorkflow;
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }

        // Update status to indicate questions were answered
        const updatedWorkflow: PlanModeWorkflow = {
            ...workflow,
            status: 'questions_asked',
            questions_asked_at: new Date().toISOString(),
            // Store answers temporarily in enrichment_metadata until revision
            enrichment_metadata: {
                ...workflow.enrichment_metadata,
                temp_answers: answers,
                question_round: questionRound
            }
        };

        await redisClient.setEx(
            this.getKey(workflowId),
            PLAN_MODE_WORKFLOW_TTL,
            JSON.stringify(updatedWorkflow)
        );
    }

    /**
     * PHASE 3: Save revised plan after incorporating answers
     */
    async saveRevisedPlan(
        workflowId: string,
        revisedPlan: string,
        changesFromOriginal: string
    ): Promise<void> {
        const workflow = await this.getWorkflow(workflowId) as PlanModeWorkflow;
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }

        // Extract answers from temp storage
        const answers = workflow.enrichment_metadata?.temp_answers || {};

        const updatedWorkflow: PlanModeWorkflow = {
            ...workflow,
            revised_plan_data: {
                revisedPlan,
                answers,
                changesFromOriginal
            },
            plan_revised_at: new Date().toISOString(),
            status: 'plan_revised',
            // Clean up temp storage
            enrichment_metadata: {
                ...workflow.enrichment_metadata,
                temp_answers: undefined
            }
        };

        await redisClient.setEx(
            this.getKey(workflowId),
            PLAN_MODE_WORKFLOW_TTL,
            JSON.stringify(updatedWorkflow)
        );
    }

    /**
     * PHASE 4: Approve plan and configure production
     */
    async approvePlan(
        workflowId: string,
        approvalConfig: ApprovalConfig
    ): Promise<void> {
        const workflow = await this.getWorkflow(workflowId) as PlanModeWorkflow;
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }

        const updatedWorkflow: PlanModeWorkflow = {
            ...workflow,
            approval_config: approvalConfig,
            status: 'approved',
            approved_at: new Date().toISOString()
        };

        await redisClient.setEx(
            this.getKey(workflowId),
            PLAN_MODE_WORKFLOW_TTL,
            JSON.stringify(updatedWorkflow)
        );
    }

    /**
     * Mark workflow as generating (Phase 5 started)
     */
    async markGenerating(workflowId: string): Promise<void> {
        const workflow = await this.getWorkflow(workflowId) as PlanModeWorkflow;
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }

        const updatedWorkflow: PlanModeWorkflow = {
            ...workflow,
            status: 'generating'
        };

        await redisClient.setEx(
            this.getKey(workflowId),
            PLAN_MODE_WORKFLOW_TTL,
            JSON.stringify(updatedWorkflow)
        );
    }

    /**
     * PHASE 5: Save production results
     */
    async saveProduction(
        workflowId: string,
        productionData: Record<string, any>,
        executionTimeMs: number,
        totalAICalls: number
    ): Promise<void> {
        const workflow = await this.getWorkflow(workflowId) as PlanModeWorkflow;
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }

        const updatedWorkflow: PlanModeWorkflow = {
            ...workflow,
            production_data: productionData,
            execution_time_production_ms: executionTimeMs,
            total_ai_calls: totalAICalls,
            completed_at: new Date().toISOString(),
            status: 'completed'
        };

        // Keep completed workflow for 5 minutes for result retrieval
        await redisClient.setEx(
            this.getKey(workflowId),
            300,
            JSON.stringify(updatedWorkflow)
        );
    }

    /**
     * Get Plan Mode workflow with type safety
     */
    async getPlanModeWorkflow(
        workflowId: string,
        userId?: string
    ): Promise<PlanModeWorkflow | null> {
        return this.getWorkflow(workflowId, userId) as Promise<PlanModeWorkflow | null>;
    }

    /**
     * Get approved plan (original or revised based on user choice)
     */
    getApprovedPlan(workflow: PlanModeWorkflow): string {
        if (!workflow.approval_config) {
            throw new Error('Workflow not yet approved');
        }

        if (workflow.approval_config.approvedPlanVersion === 'revised') {
            if (!workflow.revised_plan_data) {
                throw new Error('Revised plan not available');
            }
            return workflow.revised_plan_data.revisedPlan;
        }

        if (!workflow.plan_data) {
            throw new Error('Original plan not available');
        }
        return workflow.plan_data.originalPlan;
    }

    /**
     * Helper to get private key method from parent
     */
    protected getKey(workflowId: string): string {
        return `workflow:${workflowId}`;
    }
}

// Singleton export
export const planModeWorkflowService = new PlanModeWorkflowService();

// Type-specific wrappers for cleaner API (like prAgentWorkflow pattern)
export const prPlanModeWorkflow = {
    create: (userId: string, inputData: Record<string, any>) =>
        planModeWorkflowService.createPlanModeWorkflow('plan_mode_pr', userId, inputData),

    savePlan: (workflowId: string, plan: PlanData, questions: QuestionsData | null) =>
        planModeWorkflowService.savePlan(workflowId, plan, questions),

    saveAnswers: (workflowId: string, answers: Record<string, string | string[]>, round: number) =>
        planModeWorkflowService.saveAnswers(workflowId, answers, round),

    saveRevisedPlan: (workflowId: string, revisedPlan: string, changes: string) =>
        planModeWorkflowService.saveRevisedPlan(workflowId, revisedPlan, changes),

    approvePlan: (workflowId: string, config: ApprovalConfig) =>
        planModeWorkflowService.approvePlan(workflowId, config),

    saveProduction: (workflowId: string, data: Record<string, any>, timeMs: number, calls: number) =>
        planModeWorkflowService.saveProduction(workflowId, data, timeMs, calls),

    getWorkflow: (workflowId: string, userId?: string) =>
        planModeWorkflowService.getPlanModeWorkflow(workflowId, userId)
};

export const antragPlanModeWorkflow = {
    create: (userId: string, inputData: Record<string, any>) =>
        planModeWorkflowService.createPlanModeWorkflow('plan_mode_antrag', userId, inputData),

    savePlan: (workflowId: string, plan: PlanData, questions: QuestionsData | null) =>
        planModeWorkflowService.savePlan(workflowId, plan, questions),

    saveAnswers: (workflowId: string, answers: Record<string, string | string[]>, round: number) =>
        planModeWorkflowService.saveAnswers(workflowId, answers, round),

    saveRevisedPlan: (workflowId: string, revisedPlan: string, changes: string) =>
        planModeWorkflowService.saveRevisedPlan(workflowId, revisedPlan, changes),

    approvePlan: (workflowId: string, config: ApprovalConfig) =>
        planModeWorkflowService.approvePlan(workflowId, config),

    saveProduction: (workflowId: string, data: Record<string, any>, timeMs: number, calls: number) =>
        planModeWorkflowService.saveProduction(workflowId, data, timeMs, calls),

    getWorkflow: (workflowId: string, userId?: string) =>
        planModeWorkflowService.getPlanModeWorkflow(workflowId, userId)
};
