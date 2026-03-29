/**
 * SlidesGraph — LangGraph pipeline for AI presentation generation
 *
 * Flow:
 *   START → outline → content → validate ──(all pass)──→ finalize → END
 *                                  │                        ↑
 *                                  └──(failures, retries<2)─→ correct ─┘
 */

import { StateGraph } from '@langchain/langgraph';

import {
  outlineNode,
  contentNode,
  validateNode,
  correctNode,
  finalizeNode,
} from './nodes/index.js';
import {
  SlidesStateAnnotation,
  type SlidesGraphState,
  type GenerateOptions,
  type GeneratedSlide,
} from './types.js';

function routeAfterOutline(state: SlidesGraphState): 'gen_content' | '__end__' {
  if (state.error || !state.outline) return '__end__';
  return 'gen_content';
}

function routeAfterValidate(state: SlidesGraphState): 'gen_correct' | 'gen_finalize' {
  if (state.validationErrors.length > 0 && state.retryCount < state.maxRetries) {
    console.log(
      `[slides-graph] Routing to correct: ${state.validationErrors.length} errors, retry ${state.retryCount + 1}/${state.maxRetries}`
    );
    return 'gen_correct';
  }
  if (state.validationErrors.length > 0) {
    console.log(
      `[slides-graph] Max retries reached (${state.maxRetries}), proceeding to finalize with ${state.validationErrors.length} remaining errors`
    );
  }
  return 'gen_finalize';
}

function createSlidesGraph() {
  const graph = new StateGraph(SlidesStateAnnotation)
    .addNode('gen_outline', outlineNode as any)
    .addNode('gen_content', contentNode as any)
    .addNode('gen_validate', validateNode as any)
    .addNode('gen_correct', correctNode as any)
    .addNode('gen_finalize', finalizeNode as any)

    .addEdge('__start__', 'gen_outline')
    .addConditionalEdges('gen_outline', routeAfterOutline, {
      gen_content: 'gen_content',
      __end__: '__end__',
    })
    .addEdge('gen_content', 'gen_validate')
    .addConditionalEdges('gen_validate', routeAfterValidate, {
      gen_correct: 'gen_correct',
      gen_finalize: 'gen_finalize',
    })
    .addEdge('gen_correct', 'gen_validate')
    .addEdge('gen_finalize', '__end__');

  return graph.compile();
}

export const slidesGraph = createSlidesGraph();

export interface SlidesGraphInput {
  options: GenerateOptions;
}

export interface SlidesGraphOutput {
  success: boolean;
  title: string;
  slides: GeneratedSlide[];
  error: string | null;
  metadata: {
    outlineTimeMs: number;
    contentTimeMs: number;
    validateTimeMs: number;
    correctTimeMs: number;
    finalizeTimeMs: number;
    totalTimeMs: number;
    retryCount: number;
    validationErrorCount: number;
  };
}

export async function runSlidesGraph(input: SlidesGraphInput): Promise<SlidesGraphOutput> {
  const startTime = Date.now();

  console.log('[slides-graph] Starting SlidesGraph pipeline:', {
    topic: input.options.content.slice(0, 200),
    nSlides: input.options.nSlides,
    tone: input.options.tone,
  });

  const initialState: SlidesGraphState = {
    options: input.options,
    outline: null,
    slides: [],
    validationErrors: [],
    retryCount: 0,
    maxRetries: 2,
    presentationTitle: '',
    finalSlides: [],
    error: null,
    startTime,
    outlineTimeMs: 0,
    contentTimeMs: 0,
    validateTimeMs: 0,
    correctTimeMs: 0,
    finalizeTimeMs: 0,
  };

  const result = await slidesGraph.invoke(initialState);

  const totalTimeMs = Date.now() - startTime;

  console.log('[slides-graph] Pipeline complete:', {
    success: !result.error,
    title: result.presentationTitle,
    slideCount: result.finalSlides.length,
    retryCount: result.retryCount,
    remainingErrors: result.validationErrors.length,
    totalTimeMs,
  });

  return {
    success: !result.error,
    title: result.presentationTitle,
    slides: result.finalSlides,
    error: result.error,
    metadata: {
      outlineTimeMs: result.outlineTimeMs,
      contentTimeMs: result.contentTimeMs,
      validateTimeMs: result.validateTimeMs,
      correctTimeMs: result.correctTimeMs,
      finalizeTimeMs: result.finalizeTimeMs,
      totalTimeMs,
      retryCount: result.retryCount,
      validationErrorCount: result.validationErrors.length,
    },
  };
}
