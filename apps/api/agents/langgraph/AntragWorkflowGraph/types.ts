/**
 * AntragWorkflowGraph Types
 * Type definitions for the LangGraph-based Antrag workflow
 */

import type { Request } from 'express';
import type AIWorkerPool from '../../../workers/aiWorkerPool.js';

// ============================================================================
// Input & Output Types
// ============================================================================

export interface AntragWorkflowInput {
  // Required
  inhalt: string;
  requestType: 'antrag' | 'kleine_anfrage' | 'grosse_anfrage';
  userId: string;

  // Optional
  gliederung?: string;
  locale?: 'de-DE' | 'de-AT';
  useWebSearch?: boolean;
  usePrivacyMode?: boolean;
  selectedDocumentIds?: string[];
  selectedTextIds?: string[];

  // Context
  aiWorkerPool: AIWorkerPool;
  req: Request;
  workflowId?: string;
}

export interface AntragWorkflowOutput {
  success: boolean;
  workflowId: string;

  // Phase outputs
  plan?: PlanData;
  questions?: QuestionsData;
  revisedPlan?: string;
  productionContent?: ProductionData;

  // Metadata
  metadata: {
    executionTimeMs: number;
    phasesExecuted: string[];
    totalAICalls: number;
  };

  error?: string;
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
    documents?: any[];
    webSearchResults?: any[];
    knowledgeBase?: any[];
    greenFraming?: string[];
    enrichmentMetadata?: any;
  };

  // Phase 1: Plan Generation
  planData?: PlanData;
  planGenerationTimeMs?: number;

  // Phase 2: Questions
  questionsData?: QuestionsData;
  questionsGenerationTimeMs?: number;
  userAnswers?: Record<string, string | string[]>;
  skipQuestions?: boolean;

  // Phase 3: Revision
  revisedPlanData?: {
    revisedPlan: string;
    changes: string;
    revisionTimeMs: number;
  };

  // Phase 4: Production
  productionData?: ProductionData;
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
// Data Structures
// ============================================================================

export interface PlanData {
  originalPlan: string;
  planSummary: string;
  confidenceScore: number;
  enrichmentMetadata?: any;
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
  clarificationPurpose?: string;
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
  toolSchema?: any;
  options?: {
    max_tokens?: number;
    temperature?: number;
    tool_choice?: any;
  };
}
