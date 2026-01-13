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
    subType?: string;      // Alias for requestType (used by LangGraph)
    locale?: 'de-DE' | 'de-AT';

    // Enrichment options
    useWebSearch?: boolean;
    usePrivacyMode?: boolean;
    useProMode?: boolean;
    selectedDocumentIds?: string[];
    selectedTextIds?: string[];
    customPrompt?: string;

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
    questionType: 'verstaendnis' | 'rueckfrage' | 'multiple_choice' | 'yes_no' | 'free_form'; // Support both old and new types
    why?: string; // Justification for this question (new format)
    options?: string[] | Array<{
        text: string;
        emoji?: string;
    }>; // Support both formats
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

// ============================================================================
// FORMATTED PLAN TYPES (McKinsey-Style)
// ============================================================================

/**
 * Structured representation of a McKinsey-style strategic plan
 * Extracted from raw markdown for enhanced frontend rendering
 */
export interface FormattedPlan {
    executiveSummary: SCQAStructure;
    mainDocument: MainDocumentStructure;
    appendices: AppendixReferences;
    metadata: PlanMetadata;
}

/**
 * SCQA Framework (Situation-Complication-Question-Answer)
 * Core consulting communication structure
 */
export interface SCQAStructure {
    situation: string;        // Current state with key metrics
    complication: string;     // Problem/urgency
    question: string;         // Strategic question
    answer: ThreePillarSummary;
}

export interface ThreePillarSummary {
    pillar1: string;  // Quick Wins summary (1 sentence)
    pillar2: string;  // Structural Change summary (1 sentence)
    pillar3: string;  // Cultural Change summary (1 sentence)
}

/**
 * Main document sections following McKinsey structure
 */
export interface MainDocumentStructure {
    context: StrategicContext;
    solution: ThreePillarModel;
    implementation: ImplementationArchitecture;
    impact: ExpectedImpact;
}

export interface StrategicContext {
    dataSnapshot: KeyMetric[];
    urgencyReasons: string[];  // 3 reasons for urgency
}

export interface KeyMetric {
    label: string;
    currentValue: string | number;
    targetValue?: string | number;
    source?: string;
}

export interface ThreePillarModel {
    pillar1: PillarDetails;  // Quick Wins (2026-2027)
    pillar2: PillarDetails;  // Structural Change (2028-2030)
    pillar3: PillarDetails;  // Cultural Change (ongoing)
}

export interface PillarDetails {
    title: string;
    goal: string;
    measures: string[];  // 3-4 concrete measures
    resources: ResourceAllocation;
    impact: string;      // Measurable impact
}

export interface ResourceAllocation {
    budget?: string;
    personnel?: string;
    funding?: string[];
}

export interface ImplementationArchitecture {
    governance: string;
    resourceDistribution: {
        year: string;
        amount: string;
        purpose: string;
    }[];
    topRisks: RiskWithMitigation[];
}

export interface RiskWithMitigation {
    risk: string;
    mitigation: string;
}

export interface ExpectedImpact {
    quantifiedOutcomes: string[];
    successMetrics: {
        shortTerm: string[];   // 6 months
        mediumTerm: string[];  // 2 years
        longTerm: string[];    // 5 years
    };
    quickWins: string[];  // Visible in 6 months
}

export interface AppendixReferences {
    detailedProjectList?: string;
    financingModel?: string;
    internationalCases?: string;
    draftMotionText?: string;
}

export interface PlanMetadata {
    wordCount: number;
    readingTimeMinutes: number;
    keyMetrics: KeyMetric[];  // Extracted for dashboard
    structureValid: boolean;  // Does it follow McKinsey format?
    validationErrors?: string[];
}
