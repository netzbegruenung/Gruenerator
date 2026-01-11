/**
 * Plan Mode Orchestrator
 * Coordinates all 5 phases of Plan Mode workflow
 * Integrates enrichment, question generation, plan revision, and production
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import type { Request } from 'express';
import { planModeWorkflowService, type PlanModeWorkflow } from '../../services/WorkflowService/PlanModeWorkflowService.js';
import { enrichRequest } from '../../utils/requestEnrichment.js';
import { assemblePromptGraphAsync } from './promptAssemblyGraph.js';
import type AIWorkerPool from '../../workers/aiWorkerPool.js';
import type {
    PlanModeConfig,
    PlanModeRequest,
    PlanData,
    QuestionsData,
    PlanGenerationResult,
    PlanRevisionResult,
    ProductionResult,
    GeneratedQuestion
} from './types/planMode.js';

/**
 * Plan Mode Orchestrator
 * Manages stateful multi-phase workflow for strategic content generation
 */
export class PlanModeOrchestrator {
    constructor(
        private aiWorkerPool: AIWorkerPool
    ) {}

    /**
     * PHASE 1: Generate initial strategic plan with full enrichment
     *
     * Flow:
     * 1. Enrich request (documents, web search, knowledge base)
     * 2. Generate strategic plan via AI
     * 3. Optionally generate clarifying questions (AI decides)
     * 4. Return plan + questions (or skip to approval if confident)
     */
    async generatePlan(
        config: PlanModeConfig,
        request: PlanModeRequest,
        req: Request,
        userId: string
    ): Promise<PlanGenerationResult> {
        const startTime = Date.now();

        // 1. Enrich request with documents, web search, knowledge base
        const enrichedState = await enrichRequest(request, {
            type: config.generatorType === 'pr' ? 'social' : 'antrag',
            enableWebSearch: config.enableWebSearch,
            enableDocQnA: config.enableDocuments,
            enableKnowledgeBase: config.enableKnowledge,
            searchQuery: request.inhalt,
            selectedDocumentIds: request.selectedDocumentIds,
            selectedTextIds: request.selectedTextIds,
            req
        });

        // 2. Generate strategic plan
        const planData = await this.generateStrategicPlan(
            config,
            request,
            enrichedState,
            req
        );

        // 3. AI decides if clarification questions are needed
        let questionsData: QuestionsData | null = null;
        if (config.enableQuestions) {
            questionsData = await this.generateQuestionsIfNeeded(
                config,
                request,
                planData.originalPlan,
                req
            );
        }

        const executionTime = Date.now() - startTime;

        // Create workflow in Redis
        const workflowId = await planModeWorkflowService.createPlanModeWorkflow(
            config.generatorType === 'pr' ? 'plan_mode_pr' : 'plan_mode_antrag',
            userId,
            request
        );

        // Save plan and questions to workflow
        await planModeWorkflowService.savePlan(workflowId, planData, questionsData);

        return {
            workflowId,
            plan: planData,
            questions: questionsData,
            executionTimeMs: executionTime
        };
    }

    /**
     * Generate strategic plan using AI
     */
    private async generateStrategicPlan(
        config: PlanModeConfig,
        request: PlanModeRequest,
        enrichedState: any,
        req: Request
    ): Promise<PlanData> {
        // Load prompt configuration
        const promptConfig = await this.loadPromptConfig(config.planPromptConfig);

        // Build prompt context
        const promptContext = {
            systemRole: promptConfig.systemPrompt,
            request: {
                inhalt: request.inhalt,
                requestType: request.requestType,
                locale: request.locale || 'de-DE'
            },
            documents: enrichedState.documents || [],
            knowledge: [
                ...(enrichedState.webSearchResults || []),
                ...(enrichedState.knowledgeBase || [])
            ],
            enrichmentMetadata: enrichedState.enrichmentMetadata
        };

        // Assemble full prompt
        const assembledPrompt = await assemblePromptGraphAsync(promptContext);

        // Generate plan via AI worker pool
        const aiResponse = await this.aiWorkerPool.processRequest({
            type: config.generatorType === 'pr' ? 'pr_plan_generation' : 'antrag_plan_generation',
            usePrivacyMode: request.usePrivacyMode || false,
            systemPrompt: assembledPrompt.system,
            messages: assembledPrompt.messages as never,
            options: {
                max_tokens: promptConfig.options?.max_tokens || 1000,
                temperature: promptConfig.options?.temperature || 0.6
            }
        }, req);

        // Parse response into structured plan
        const planText = aiResponse.content;
        const planSummary = this.extractPlanSummary(planText);

        return {
            originalPlan: planText,
            planSummary,
            confidenceScore: 0.85, // Default - could be enhanced with AI confidence scoring
            researchedArguments: enrichedState.arguments || [],
            enrichmentMetadata: enrichedState.enrichmentMetadata
        };
    }

    /**
     * PHASE 2: AI decides if clarification questions are needed
     *
     * Pattern inspired by simpleInteractiveGenerator.ts
     */
    private async generateQuestionsIfNeeded(
        config: PlanModeConfig,
        request: PlanModeRequest,
        plan: string,
        req: Request
    ): Promise<QuestionsData> {
        // Load question generation prompt
        const promptConfig = await this.loadPromptConfig(config.questionsPromptConfig);

        // Build context including the generated plan
        const promptContext = {
            systemRole: promptConfig.systemPrompt,
            request: {
                inhalt: request.inhalt,
                plan: plan  // Include plan for context
            }
        };

        const assembledPrompt = await assemblePromptGraphAsync(promptContext);

        // Use tool-based AI call for structured decision-making
        const aiResponse = await this.aiWorkerPool.processRequest({
            type: 'plan_question_generation',
            usePrivacyMode: request.usePrivacyMode || false,
            systemPrompt: assembledPrompt.system,
            messages: assembledPrompt.messages as never,
            tools: promptConfig.toolSchema ? [promptConfig.toolSchema] : undefined,
            options: {
                max_tokens: promptConfig.options?.max_tokens || 1500,
                temperature: promptConfig.options?.temperature || 0.4,
                tool_choice: 'any'
            }
        }, req);

        // Parse AI decision from tool call
        if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
            const toolCall = aiResponse.tool_calls[0];
            const decision = (toolCall as any).input || (toolCall as any).function?.arguments || {};

            return {
                needsClarification: decision.needsClarification || false,
                questions: this.parseQuestions(decision.questions || []),
                questionRound: 1,
                confidenceReason: decision.confidenceReason || 'AI confident in plan completeness'
            };
        }

        // Fallback: No questions needed
        return {
            needsClarification: false,
            questions: [],
            questionRound: 0,
            confidenceReason: 'Plan is clear and comprehensive'
        };
    }

    /**
     * PHASE 3: Revise plan based on user answers
     */
    async revisePlan(
        workflowId: string,
        answers: Record<string, string | string[]>,
        req: Request
    ): Promise<PlanRevisionResult> {
        const startTime = Date.now();

        // Get workflow
        const workflow = await planModeWorkflowService.getPlanModeWorkflow(workflowId);
        if (!workflow || !workflow.plan_data || !workflow.questions_data) {
            throw new Error('Workflow not in correct state for revision');
        }

        // Save answers
        await planModeWorkflowService.saveAnswers(workflowId, answers, 1);

        // Format Q&A pairs for context
        const qaContext = this.formatQAPairs(workflow.questions_data.questions, answers);

        // Get config from workflow input
        const config = this.getConfigFromWorkflow(workflow);

        // Load revision prompt
        const promptConfig = await this.loadPromptConfig(config.revisionPromptConfig);

        // Build revision context
        const promptContext = {
            systemRole: promptConfig.systemPrompt,
            request: workflow.input_data,
            knowledge: [
                `## Ursprünglicher Plan\n${workflow.plan_data.originalPlan}`,
                `## Antworten aus dem Verständnisgespräch\n${qaContext}`
            ]
        };

        const assembledPrompt = await assemblePromptGraphAsync(promptContext);

        // Generate revised plan
        const aiResponse = await this.aiWorkerPool.processRequest({
            type: 'plan_revision',
            usePrivacyMode: workflow.input_data.usePrivacyMode || false,
            systemPrompt: assembledPrompt.system,
            messages: assembledPrompt.messages as never,
            options: {
                max_tokens: promptConfig.options?.max_tokens || 1200,
                temperature: promptConfig.options?.temperature || 0.6
            }
        }, req);

        const revisedPlan = aiResponse.content;
        const changes = this.diffPlans(workflow.plan_data.originalPlan, revisedPlan);

        // Save revised plan
        await planModeWorkflowService.saveRevisedPlan(workflowId, revisedPlan, changes);

        const executionTime = Date.now() - startTime;

        return {
            revisedPlan,
            changes,
            executionTimeMs: executionTime
        };
    }

    /**
     * PHASE 5: Generate production content based on approved plan
     */
    async generateProduction(
        workflowId: string,
        req: Request
    ): Promise<ProductionResult> {
        const startTime = Date.now();

        // Get workflow
        const workflow = await planModeWorkflowService.getPlanModeWorkflow(workflowId);
        if (!workflow || !workflow.approval_config) {
            throw new Error('Workflow not approved yet');
        }

        // Mark as generating
        await planModeWorkflowService.markGenerating(workflowId);

        // Get approved plan (original or revised)
        const approvedPlan = planModeWorkflowService.getApprovedPlan(workflow);

        // Get config
        const config = this.getConfigFromWorkflow(workflow);

        // Generate production content using approved plan as context
        const productionData = await this.executeProduction(
            config,
            workflow,
            approvedPlan,
            req
        );

        const executionTime = Date.now() - startTime;

        // Save production results
        await planModeWorkflowService.saveProduction(
            workflowId,
            productionData,
            executionTime,
            productionData.metadata?.aiCallsCount || 1
        );

        return {
            production_data: productionData,
            executionTimeMs: executionTime
        };
    }

    /**
     * Execute generator-specific production
     * Delegates to existing generators (PR Agent, Antrag)
     */
    private async executeProduction(
        config: PlanModeConfig,
        workflow: PlanModeWorkflow,
        approvedPlan: string,
        req: Request
    ): Promise<any> {
        // Load production prompt config
        const promptConfig = await this.loadPromptConfig(config.productionPromptConfig);

        // Build production context with approved plan
        const enrichedState = await enrichRequest(workflow.input_data, {
            type: config.generatorType === 'pr' ? 'social' : 'antrag',
            enableWebSearch: false, // Already enriched in plan phase
            enableDocQnA: workflow.input_data.selectedDocumentIds?.length > 0,
            selectedDocumentIds: workflow.input_data.selectedDocumentIds,
            selectedTextIds: workflow.input_data.selectedTextIds,
            req
        });

        const promptContext = {
            systemRole: promptConfig.systemPrompt,
            request: workflow.input_data,
            documents: enrichedState.documents || [],
            knowledge: [
                `## Genehmigter strategischer Plan\n${approvedPlan}`,
                ...(enrichedState.knowledge || [])
            ]
        };

        const assembledPrompt = await assemblePromptGraphAsync(promptContext);

        // Generate final content
        const aiResponse = await this.aiWorkerPool.processRequest({
            type: config.generatorType === 'pr' ? 'pr_production' : 'antrag_production',
            usePrivacyMode: workflow.input_data.usePrivacyMode || false,
            systemPrompt: assembledPrompt.system,
            messages: assembledPrompt.messages as never,
            options: {
                max_tokens: promptConfig.options?.max_tokens || 2000,
                temperature: promptConfig.options?.temperature || 0.7
            }
        }, req);

        return {
            content: aiResponse.content,
            metadata: {
                executionTimeMs: 0, // Will be set by caller
                aiCallsCount: 1,
                approvedPlanUsed: approvedPlan.substring(0, 100) + '...'
            }
        };
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    /**
     * Load prompt configuration from JSON file
     */
    private async loadPromptConfig(configName: string): Promise<any> {
        try {
            const configPath = path.join(__dirname, '../../prompts', `${configName}.json`);
            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);
            return config;
        } catch (error) {
            console.error(`[PlanMode] Failed to load prompt config: ${configName}`, error);
            throw new Error(`Prompt configuration "${configName}" not found`);
        }
    }

    /**
     * Extract plan summary (first 1-2 sentences)
     */
    private extractPlanSummary(plan: string): string {
        const sentences = plan.split(/[.!?]+/).filter(s => s.trim().length > 0);
        return sentences.slice(0, 2).join('. ') + '.';
    }

    /**
     * Parse questions from AI tool call response
     */
    private parseQuestions(rawQuestions: any[]): GeneratedQuestion[] {
        return rawQuestions.map((q, index) => ({
            id: `q${index + 1}`,
            questionText: q.questionText || q.text,
            questionType: q.questionType || 'multiple_choice',
            options: q.options || [],
            clarificationPurpose: q.clarificationPurpose
        }));
    }

    /**
     * Format Q&A pairs for prompt context
     */
    private formatQAPairs(
        questions: GeneratedQuestion[],
        answers: Record<string, string | string[]>
    ): string {
        return questions
            .map(q => {
                const answer = answers[q.id];
                const answerText = Array.isArray(answer) ? answer.join(', ') : answer;
                return `**${q.questionText}**\nAntwort: ${answerText}`;
            })
            .join('\n\n');
    }

    /**
     * Compare original and revised plans, highlight changes
     */
    private diffPlans(original: string, revised: string): string {
        // Simple diff - could be enhanced with proper diff library
        if (original === revised) {
            return 'Keine Änderungen am Plan';
        }

        // Extract key sections and compare
        const originalLength = original.length;
        const revisedLength = revised.length;
        const diffPercent = Math.abs(revisedLength - originalLength) / originalLength * 100;

        return `Der Plan wurde um ${diffPercent.toFixed(0)}% ${revisedLength > originalLength ? 'erweitert' : 'gekürzt'} basierend auf deinen Antworten.`;
    }

    /**
     * Extract config from workflow input data
     */
    private getConfigFromWorkflow(workflow: PlanModeWorkflow): PlanModeConfig {
        const generatorType = workflow.workflow_type === 'plan_mode_pr' ? 'pr' : 'antrag';

        return {
            generatorType,
            planPromptConfig: `plan_generation_${generatorType}`,
            questionsPromptConfig: `interactive_questions_${generatorType}`,
            revisionPromptConfig: `plan_revision_${generatorType}`,
            productionPromptConfig: generatorType === 'pr' ? 'pr_agent' : 'antrag_experimental',
            enableQuestions: true,
            enableWebSearch: true,
            enableDocuments: true,
            enableKnowledge: true
        };
    }
}

// Export singleton instance
export const createPlanModeOrchestrator = (aiWorkerPool: AIWorkerPool) =>
    new PlanModeOrchestrator(aiWorkerPool);
