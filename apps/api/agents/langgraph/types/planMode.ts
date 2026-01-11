/**
 * Type definitions for Plan Mode system
 * Shared types between backend orchestration and API routes
 */

// ============================================================================
// REQUEST TYPES
// ============================================================================

export interface PlanModeRequest {
    generatorType: 'pr' | 'antrag';
    inhalt: string;
    requestType?: string;  // For Antrag: 'antrag' | 'kleine_anfrage' | 'grosse_anfrage'
    locale?: 'de-DE' | 'de-AT';

    // Enrichment options
    useWebSearch?: boolean;
    usePrivacyMode?: boolean;
    selectedDocumentIds?: string[];
    selectedTextIds?: string[];

    // Generator-specific
    platforms?: string[];    // For PR mode (optional during initiation)
    gliederung?: string;    // For Antrag mode
}

// ============================================================================
// DATA STRUCTURES
// ============================================================================

export interface PlanData {
    originalPlan: string;                      // Markdown-formatted strategic plan
    planSummary: string;                      // Short overview for UI (1-2 sentences)
    confidenceScore: number;                  // 0-1, AI's confidence in plan completeness
    researchedArguments?: ArgumentSearchResult[]; // From knowledge base vector search
    enrichmentMetadata: EnrichmentMetadata;   // Sources, timing, counts
}

export interface ArgumentSearchResult {
    content: string;
    source: string;
    collection: string;  // 'grundsatz_documents', 'bundestag_content', etc.
    score: number;
}

export interface EnrichmentMetadata {
    documentCount: number;
    textCount: number;
    webSearchResultCount: number;
    knowledgeSourceCount: number;
    enrichmentTimeMs: number;
    sources: Array<{
        type: 'document' | 'text' | 'web' | 'knowledge';
        title?: string;
        url?: string;
    }>;
}

export interface QuestionsData {
    needsClarification: boolean;   // AI decision: true = ask questions, false = skip to approval
    questions: GeneratedQuestion[];
    questionRound: number;         // Support multi-round Q&A (future)
    confidenceReason: string;      // Why AI needs/doesn't need questions
}

export interface GeneratedQuestion {
    id: string;
    questionText: string;
    questionType: 'multiple_choice' | 'yes_no' | 'free_form';
    options?: Array<{
        text: string;
        emoji?: string;
    }>;
    clarificationPurpose?: string; // What this question clarifies
}

export type QuestionAnswers = Record<string, string | string[]>;

export interface RevisedPlanData {
    revisedPlan: string;          // Updated plan with Q&A context
    changesFromOriginal: string;  // Summary of what changed
    answers: QuestionAnswers;     // User's answers that informed revision
}

export interface ApprovalConfig {
    selectedPlatforms?: string[];  // For PR mode
    userFeedback?: string;        // Optional user modifications/notes
    approvedPlanVersion: 'original' | 'revised';
}

export interface ProductionData {
    content: Record<string, any>;  // Generator-specific content structure
    sharepics?: any[];            // For PR mode
    metadata: {
        executionTimeMs: number;
        aiCallsCount: number;
        platformsGenerated?: string[];
        [key: string]: any;
    };
}

// ============================================================================
// PHASE RESULT TYPES
// ============================================================================

export interface PlanGenerationResult {
    workflowId: string;
    plan: PlanData;
    questions: QuestionsData | null;  // null if AI skips questions
    executionTimeMs: number;
}

export interface PlanRevisionResult {
    revisedPlan: string;
    changes: string;
    executionTimeMs: number;
}

export interface ProductionResult {
    production_data: ProductionData;
    executionTimeMs: number;
}

// ============================================================================
// ORCHESTRATOR CONFIG
// ============================================================================

export interface PlanModeConfig {
    generatorType: 'pr' | 'antrag';

    // Prompt configuration keys
    planPromptConfig: string;         // e.g., 'plan_generation_pr'
    questionsPromptConfig: string;    // e.g., 'interactive_questions_pr'
    revisionPromptConfig: string;     // e.g., 'plan_revision_pr'
    productionPromptConfig: string;   // e.g., 'pr_agent' or 'antrag_experimental'

    // Feature flags
    enableQuestions: boolean;         // Whether to allow question phase
    enableWebSearch: boolean;         // Phase 1 enrichment
    enableDocuments: boolean;         // Phase 1 enrichment
    enableKnowledge: boolean;         // Phase 1 enrichment

    // Generator-specific
    availablePlatforms?: string[];    // For PR mode
    defaultPlatforms?: string[];
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface InitiateResponse {
    success: boolean;
    workflow_id: string;
    plan: string;                    // Markdown formatted
    planSummary: string;
    needsQuestions: boolean;
    questions?: GeneratedQuestion[]; // If needsQuestions=true
    metadata: {
        confidenceScore: number;
        executionTimeMs: number;
        enrichmentMetadata: EnrichmentMetadata;
    };
}

export interface AnswerQuestionsResponse {
    success: boolean;
    revised_plan: string;
    changes: string;
    ready_for_approval: boolean;
    metadata: {
        executionTimeMs: number;
    };
}

export interface ApproveResponse {
    success: boolean;
    status: 'generating';
    workflow_id: string;
}

export interface ProductionResponse {
    success: boolean;
    production_data: ProductionData;
    metadata: {
        executionTimeMs: number;
        aiCallsCount: number;
    };
}

export interface WorkflowStatusResponse {
    workflow_id: string;
    current_phase: string;
    status: string;
    plan?: string;
    questions?: GeneratedQuestion[];
    revised_plan?: string;
    approval_config?: ApprovalConfig;
    production_data?: Record<string, any>;  // Flexible type - varies by generator
    created_at: string;
    completed_at?: string;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export interface PlanModeError {
    error: string;
    code: 'WORKFLOW_NOT_FOUND' | 'INVALID_STATE' | 'AI_ERROR' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR';
    details?: any;
}
