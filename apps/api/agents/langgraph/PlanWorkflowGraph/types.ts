/**
 * PlanWorkflowGraph Types
 * Generic types for reusable plan-based workflows (Anträge, PR, etc.)
 */

import type { Request } from 'express';
import type AIWorkerPool from '../../../workers/aiWorkerPool.js';

// ============================================================================
// Input & Output Types (Generic)
// ============================================================================

export interface PlanWorkflowInput {
  // Core content
  inhalt: string;
  gliederung?: string;

  // Generator configuration
  generatorType: 'antrag' | 'pr' | string; // Extensible for future types
  subType?: string; // e.g., 'antrag' -> 'kleine_anfrage', 'grosse_anfrage'
  locale?: 'de-DE' | 'de-AT';

  // Features
  useWebSearch?: boolean;
  usePrivacyMode?: boolean;
  useProMode?: boolean;

  // Knowledge & documents
  selectedDocumentIds?: string[];
  selectedTextIds?: string[];
  customPrompt?: string;

  // Platform selection (for PR)
  platforms?: string[];

  // Context (required for execution)
  aiWorkerPool: AIWorkerPool;
  req: Request;
  userId: string;

  // Optional: Resume existing workflow
  workflowId?: string;
  userAnswers?: Record<string, string | string[]>;
}

export interface PlanWorkflowOutput {
  success: boolean;
  workflowId: string;

  // Phase outputs
  plan?: PlanData;
  questions?: QuestionsData;
  revisedPlan?: string;
  productionContent?: any; // Flexible content structure

  // Metadata
  metadata: {
    executionTimeMs: number;
    phasesExecuted: string[];
    totalAICalls: number;
    generatorType: string;
  };

  error?: string;
}

// ============================================================================
// State Schema (Generic)
// ============================================================================

export interface PlanWorkflowState {
  // Input parameters (immutable during workflow)
  input: PlanWorkflowInput;

  // Workflow configuration
  workflowId: string;
  generatorType: string;
  promptConfig: PromptConfiguration;

  // Current workflow phase
  currentPhase: 'enrich' | 'plan' | 'questions' | 'revision' | 'correction' | 'production' | 'completed' | 'error';

  // Phase 0: Enrichment (shared across phases)
  enrichedState?: EnrichedState;
  enrichmentTimeMs?: number;

  // Phase 1: Plan Generation
  planData?: PlanData;
  planGenerationTimeMs?: number;

  // Phase 2: Interactive Questions
  questionsData?: QuestionsData;
  questionsGenerationTimeMs?: number;
  userAnswers?: Record<string, string | string[]>;
  skipQuestions?: boolean;

  // Phase 3: Plan Revision
  revisedPlanData?: {
    revisedPlan: string;
    changes: string;
    revisionTimeMs: number;
  };

  // Phase 3b: User Corrections (free-form plan modifications)
  userCorrections?: string;
  correctedPlanData?: {
    correctedPlan: string;
    correctionSummary: string;
    correctionTimeMs: number;
  };

  // Phase 4: Production
  productionData?: any; // Flexible structure based on generator type
  productionTimeMs?: number;

  // Metadata & tracking
  startTime: number;
  phasesExecuted: string[];
  totalAICalls: number;

  // Error handling
  error?: string;
  success: boolean;
}

// ============================================================================
// Enriched State (Cached Data)
// ============================================================================

export interface EnrichedState {
  documents?: any[];
  webSearchResults?: string[];
  knowledgeBase?: string[];
  greenFraming?: string[]; // For political content
  examples?: any[]; // For social media
  enrichmentMetadata?: {
    documentCount: number;
    textCount: number;
    webSearchResultCount: number;
    knowledgeSourceCount: number;
    enrichmentTimeMs: number;
    sources: Array<{ type: string; title?: string; url?: string }>;
  };
}

// ============================================================================
// Prompt Configuration
// ============================================================================

export interface PromptConfiguration {
  planPrompt: string; // e.g., 'plan_generation_antrag'
  questionsPrompt: string; // e.g., 'interactive_questions_antrag'
  revisionPrompt: string; // e.g., 'plan_revision_antrag'
  correctionPrompt: string; // e.g., 'plan_correction_antrag'
  productionPrompt: string; // e.g., 'antrag_experimental'

  // Feature flags
  enableQuestions: boolean;
  enableWebSearch: boolean;
  enableDocuments: boolean;
  enableKnowledge: boolean;
  enableGreenFraming?: boolean; // For political generators
  enableExamples?: boolean; // For social media generators
}

// ============================================================================
// Plan Data (Generic)
// ============================================================================

export interface PlanData {
  originalPlan: string;
  planSummary: string;
  confidenceScore: number;
  enrichmentMetadata?: any;
}

// ============================================================================
// Questions Data
// ============================================================================

export interface QuestionsData {
  needsClarification: boolean;
  questions: GeneratedQuestion[];
  questionRound: number;
  confidenceReason: string;
}

export interface GeneratedQuestion {
  id: string;
  questionText: string;
  questionType: 'verstaendnis' | 'rueckfrage'; // Understanding vs. Decision
  why: string; // Justification for this question
  options: string[];
  clarificationPurpose?: string;
}

// ============================================================================
// Node Return Types
// ============================================================================

export type EnrichmentNodeOutput = Partial<PlanWorkflowState>;
export type PlanGenerationNodeOutput = Partial<PlanWorkflowState>;
export type QuestionsNodeOutput = Partial<PlanWorkflowState>;
export type RevisionNodeOutput = Partial<PlanWorkflowState>;
export type CorrectionNodeOutput = Partial<PlanWorkflowState>;
export type ProductionNodeOutput = Partial<PlanWorkflowState>;

// ============================================================================
// Generator-Specific Configurations
// ============================================================================

export interface GeneratorConfig {
  type: string;
  prompts: PromptConfiguration;
  features: {
    supportsQuestions: boolean;
    supportsRevision: boolean;
    requiresPlatformSelection?: boolean;
  };
}

// ============================================================================
// Utility Types
// ============================================================================

export type WorkflowPhase = PlanWorkflowState['currentPhase'];
export type GeneratorType = PlanWorkflowInput['generatorType'];
