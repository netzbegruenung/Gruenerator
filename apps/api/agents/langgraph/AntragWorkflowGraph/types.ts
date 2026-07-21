/**
 * AntragWorkflowGraph Types
 * Type definitions for the LangGraph-based Antrag workflow
 */

import type AIWorkerPool from '../../../workers/aiWorkerPool.js';
import type { Request } from 'express';

// ============================================================================
// Input & Output Types
// ============================================================================

export interface AntragWorkflowInput {
  // Required
  inhalt: string;
  requestType: 'antrag' | 'kleine_anfrage' | 'grosse_anfrage';
  userId: string;

  // Optional
  gliederung?: string | undefined;
  locale?: 'de-DE' | 'de-AT' | undefined;
  useWebSearch?: boolean | undefined;
  selectedDocumentIds?: string[] | undefined;
  selectedTextIds?: string[] | undefined;

  // Context
  aiWorkerPool: AIWorkerPool;
  req: Request;
  workflowId?: string | undefined;
}

export interface AntragWorkflowOutput {
  success: boolean;
  workflowId: string;

  // Phase outputs
  plan?: PlanData | undefined;
  questions?: QuestionsData | undefined;
  revisedPlan?: string | undefined;
  productionContent?: ProductionData | undefined;

  // Metadata
  metadata: {
    executionTimeMs: number;
    phasesExecuted: string[];
    totalAICalls: number;
  };

  error?: string | undefined;
}

// ============================================================================
// State Schema
// ============================================================================

export interface AntragWorkflowState {
  // Input parameters (immutable during workflow)
  input: AntragWorkflowInput;

  // Workflow control
  workflowId: string;
  currentPhase: 'plan' | 'questions' | 'revision' | 'production' | 'completed' | 'error';

  // Enrichment results (cached from Phase 1)
  enrichedState?: {
    documents?: Record<string, unknown>[] | undefined;
    webSearchResults?: Record<string, unknown>[] | undefined;
    knowledgeBase?: Record<string, unknown>[] | undefined;
    greenFraming?: string[] | undefined;
    enrichmentMetadata?: Record<string, unknown> | undefined;
  };

  // Phase 1: Plan Generation
  planData?: PlanData | undefined;
  planGenerationTimeMs?: number | undefined;

  // Phase 2: Questions
  questionsData?: QuestionsData | undefined;
  questionsGenerationTimeMs?: number | undefined;
  userAnswers?: Record<string, string | string[]> | undefined;
  skipQuestions?: boolean | undefined;

  // Phase 3: Revision
  revisedPlanData?: {
    revisedPlan: string;
    changes: string;
    revisionTimeMs: number;
  };

  // Phase 4: Production
  productionData?: ProductionData | undefined;
  productionTimeMs?: number | undefined;

  // Metadata & tracking
  startTime: number;
  phasesExecuted: string[];
  totalAICalls: number;

  // Error handling
  error?: string | undefined;
  success: boolean;
}

// ============================================================================
// Data Structures
// ============================================================================

export interface PlanData {
  originalPlan: string;
  planSummary: string;
  confidenceScore: number;
  enrichmentMetadata?: Record<string, unknown> | undefined;
}

export interface QuestionsData {
  needsClarification: boolean;
  questions: GeneratedQuestion[];
  questionRound: number;
  confidenceReason: string;
}

export interface GeneratedQuestion {
  id: string;
  questionText: string;
  questionType: 'verstaendnis' | 'rueckfrage';
  why: string;
  options: string[];
  clarificationPurpose?: string | undefined;
}

export interface ProductionData {
  content: string;
  metadata: {
    executionTimeMs: number;
    aiCallsCount: number;
    approvedPlanUsed: string;
  };
}

// ============================================================================
// Node Return Types
// ============================================================================

export type PlanGenerationNodeOutput = Partial<AntragWorkflowState>;
export type QuestionsNodeOutput = Partial<AntragWorkflowState>;
export type RevisionNodeOutput = Partial<AntragWorkflowState>;
export type ProductionNodeOutput = Partial<AntragWorkflowState>;

// ============================================================================
// Prompt Configurations
// ============================================================================

export interface PromptConfig {
  systemPrompt: string;
  generationPrompt: string;
  toolSchema?: Record<string, unknown> | undefined;
  options?: {
    max_tokens?: number | undefined;
    temperature?: number | undefined;
    tool_choice?: string | Record<string, unknown> | undefined;
  };
}
