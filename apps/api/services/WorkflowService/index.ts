/**
 * Redis-based Workflow Service
 * Manages ephemeral multi-step generation workflows with automatic TTL cleanup
 * No permanent storage - workflows auto-expire after 1 hour of inactivity
 */

import { redisClient } from '../../utils/redis/client.js';
import { v4 as uuidv4 } from 'uuid';

export type WorkflowType = 'pr_agent' | 'text_generator' | 'image_studio' | 'speech_generator' | 'plan_mode_pr' | 'plan_mode_antrag';
export type WorkflowStatus =
    | 'draft'
    | 'awaiting_approval'
    | 'changes_requested'
    | 'approved'
    | 'completed'
    | 'cancelled'
    | 'plan_generated'
    | 'questions_asked'
    | 'plan_revised'
    | 'generating';

export interface Workflow {
    id: string;
    user_id: string;
    workflow_type: WorkflowType;
    input_data: Record<string, any>;
    strategy_data: Record<string, any> | null;
    enrichment_metadata: Record<string, any> | null;
    status: WorkflowStatus;
    user_feedback: string | null;
    approval_config: Record<string, any> | null;
    production_data: Record<string, any> | null;
    created_at: string;
    strategy_generated_at: string | null;
    approved_at: string | null;
    completed_at: string | null;
    execution_time_strategy_ms: number | null;
    execution_time_production_ms: number | null;
    total_ai_calls: number;
    tags: string[];
}

const WORKFLOW_TTL = 3600; // 1 hour - workflows auto-expire

/**
 * Generic Workflow Service - DRY principle for all step-based generators
 * Uses Redis for ephemeral storage with automatic TTL cleanup
 */
export class WorkflowService {
    protected getKey(workflowId: string): string {
        return `workflow:${workflowId}`;
    }

    /**
     * Create new workflow with initial input
     */
    async createWorkflow(
        workflowType: WorkflowType,
        userId: string,
        inputData: Record<string, any>,
        tags: string[] = []
    ): Promise<string> {
        const workflowId = uuidv4();
        const workflow: Workflow = {
            id: workflowId,
            user_id: userId,
            workflow_type: workflowType,
            input_data: inputData,
            strategy_data: null,
            enrichment_metadata: null,
            status: 'draft',
            user_feedback: null,
            approval_config: null,
            production_data: null,
            created_at: new Date().toISOString(),
            strategy_generated_at: null,
            approved_at: null,
            completed_at: null,
            execution_time_strategy_ms: null,
            execution_time_production_ms: null,
            total_ai_calls: 0,
            tags
        };

        await redisClient.setEx(
            this.getKey(workflowId),
            WORKFLOW_TTL,
            JSON.stringify(workflow)
        );

        return workflowId;
    }

    /**
     * Save strategy results (Phase 1)
     */
    async saveStrategy(
        workflowId: string,
        strategyData: Record<string, any>,
        enrichmentMetadata: Record<string, any>,
        executionTimeMs: number
    ): Promise<void> {
        const workflow = await this.getWorkflow(workflowId);
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }

        workflow.strategy_data = strategyData;
        workflow.enrichment_metadata = enrichmentMetadata;
        workflow.execution_time_strategy_ms = executionTimeMs;
        workflow.strategy_generated_at = new Date().toISOString();
        workflow.status = 'awaiting_approval';

        await redisClient.setEx(
            this.getKey(workflowId),
            WORKFLOW_TTL,
            JSON.stringify(workflow)
        );
    }

    /**
     * Update workflow with user approval
     */
    async approveWorkflow(
        workflowId: string,
        approvalConfig: Record<string, any>,
        userFeedback?: string
    ): Promise<void> {
        const workflow = await this.getWorkflow(workflowId);
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }

        workflow.approval_config = approvalConfig;
        workflow.user_feedback = userFeedback || null;
        workflow.status = userFeedback ? 'changes_requested' : 'approved';
        workflow.approved_at = new Date().toISOString();

        await redisClient.setEx(
            this.getKey(workflowId),
            WORKFLOW_TTL,
            JSON.stringify(workflow)
        );
    }

    /**
     * Save production results (Phase 2)
     */
    async saveProduction(
        workflowId: string,
        productionData: Record<string, any>,
        executionTimeMs: number,
        totalAICalls: number
    ): Promise<void> {
        const workflow = await this.getWorkflow(workflowId);
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }

        workflow.production_data = productionData;
        workflow.execution_time_production_ms = executionTimeMs;
        workflow.total_ai_calls = totalAICalls;
        workflow.completed_at = new Date().toISOString();
        workflow.status = 'completed';

        // Keep completed workflow for 5 more minutes for result retrieval
        await redisClient.setEx(
            this.getKey(workflowId),
            300,
            JSON.stringify(workflow)
        );
    }

    /**
     * Get workflow by ID
     */
    async getWorkflow(workflowId: string, userId?: string): Promise<Workflow | null> {
        const data = await redisClient.get(this.getKey(workflowId));
        if (!data || typeof data !== 'string') return null;

        const workflow: Workflow = JSON.parse(data as string);

        // Optional user validation
        if (userId && workflow.user_id !== userId) {
            return null;
        }

        return workflow;
    }

    /**
     * Delete workflow (cleanup after result retrieval)
     */
    async deleteWorkflow(workflowId: string): Promise<void> {
        await redisClient.del(this.getKey(workflowId));
    }

    /**
     * Cancel workflow
     */
    async cancelWorkflow(workflowId: string): Promise<void> {
        const workflow = await this.getWorkflow(workflowId);
        if (!workflow) return;

        workflow.status = 'cancelled';

        // Keep cancelled workflows for 5 minutes for cleanup/logging
        await redisClient.setEx(
            this.getKey(workflowId),
            300,
            JSON.stringify(workflow)
        );
    }
}

// Singleton export
export const workflowService = new WorkflowService();

// Type-specific wrapper for PR Agent (optional - for cleaner API)
export const prAgentWorkflow = {
    create: (userId: string, inputData: Record<string, any>) =>
        workflowService.createWorkflow('pr_agent', userId, inputData, ['pr', 'social']),

    saveStrategy: (workflowId: string, framing: string, args: any[], enrichmentMetadata: any, executionTimeMs: number) =>
        workflowService.saveStrategy(workflowId, { framing, argumentsList: args }, enrichmentMetadata, executionTimeMs),

    approve: (workflowId: string, platforms: string[], feedback?: string) =>
        workflowService.approveWorkflow(workflowId, { selected_platforms: platforms }, feedback),

    saveProduction: (workflowId: string, content: any, sharepics: any[], riskAnalysis: string, visualBriefing: string, executionTimeMs: number, totalAICalls: number) =>
        workflowService.saveProduction(workflowId, { content, sharepics, risk_analysis: riskAnalysis, visual_briefing: visualBriefing }, executionTimeMs, totalAICalls),

    getWorkflow: (workflowId: string, userId?: string) =>
        workflowService.getWorkflow(workflowId, userId)
};
