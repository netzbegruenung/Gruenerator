import { StateGraph, Annotation } from '@langchain/langgraph';

import { createLogger } from '../../../utils/logger.js';

import { formatNode } from './nodes/formatNode.js';
import { generateNode } from './nodes/generateNode.js';
import { researchNode } from './nodes/researchNode.js';
import { strategizeNode } from './nodes/strategizeNode.js';

import type {
  AntragAgentState,
  AntragAgentInput,
  AntragAgentOutput,
  AntragRequestType,
} from './types.js';
import type { EnrichedState } from '../../../utils/types/requestEnrichment.js';
import type { ArgumentResult } from '../PRAgent/generators/argumentsGenerator.js';

const log = createLogger('AntragAgentGraph');

const AntragAgentAnnotation = Annotation.Root({
  // Input (immutable after initialization)
  inhalt: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),
  requestType: Annotation<AntragRequestType>({
    reducer: (x, y) => y ?? x,
  }),
  gliederung: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),
  features: Annotation<AntragAgentState['features']>({
    reducer: (x, y) => y ?? x,
  }),
  selectedDocumentIds: Annotation<string[]>({
    reducer: (x, y) => y ?? x,
  }),
  selectedTextIds: Annotation<string[]>({
    reducer: (x, y) => y ?? x,
  }),
  attachments: Annotation<unknown[]>({
    reducer: (x, y) => y ?? x,
  }),
  searchQuery: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),
  req: Annotation<any>({
    reducer: (x, y) => y ?? x,
  }),

  // Research output
  enrichedState: Annotation<EnrichedState | null>({
    reducer: (x, y) => y ?? x,
  }),
  arguments: Annotation<ArgumentResult[]>({
    reducer: (x, y) => (y && y.length > 0 ? y : x || []),
  }),
  argumentsSummary: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
  researchContext: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),

  // Strategy output
  strategy: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),

  // Generation output
  generatedContent: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),

  // Final output
  formattedOutput: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),

  // Timing
  startTime: Annotation<number>({
    reducer: (x, y) => y ?? x,
  }),
  researchTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),
  strategyTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),
  generationTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),
  error: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
});

function createAntragAgentGraph() {
  const graph = new StateGraph(AntragAgentAnnotation)
    .addNode('research', researchNode as any)
    .addNode('strategize', strategizeNode as any)
    .addNode('generate', generateNode as any)
    .addNode('format', formatNode as any)

    .addEdge('__start__', 'research')
    .addEdge('research', 'strategize')
    .addEdge('strategize', 'generate')
    .addEdge('generate', 'format')
    .addEdge('format', '__end__');

  return graph.compile();
}

export const antragAgentGraph = createAntragAgentGraph();

export function initializeAntragAgentState(input: AntragAgentInput): AntragAgentState {
  return {
    inhalt: input.inhalt,
    requestType: input.requestType,
    gliederung: input.gliederung,
    features: input.features,
    selectedDocumentIds: input.selectedDocumentIds,
    selectedTextIds: input.selectedTextIds,
    attachments: input.attachments,
    searchQuery: input.searchQuery,
    req: input.req,

    enrichedState: null,
    arguments: [],
    argumentsSummary: null,
    researchContext: null,

    strategy: null,

    generatedContent: '',

    formattedOutput: '',

    startTime: Date.now(),
    researchTimeMs: 0,
    strategyTimeMs: 0,
    generationTimeMs: 0,
    error: null,
  };
}

export async function runAntragAgentGraph(input: AntragAgentInput): Promise<AntragAgentOutput> {
  try {
    const initialState = initializeAntragAgentState(input);
    const result = await antragAgentGraph.invoke(initialState);
    const totalTimeMs = Date.now() - result.startTime;

    if (result.error) {
      return {
        success: false,
        content: result.formattedOutput || '',
        metadata: {
          strategy: result.strategy,
          requestType: result.requestType,
          researchTimeMs: result.researchTimeMs,
          strategyTimeMs: result.strategyTimeMs,
          generationTimeMs: result.generationTimeMs,
          totalTimeMs,
          enrichmentMetadata: result.enrichedState?.enrichmentMetadata,
          argumentsFound: result.arguments.length,
        },
        error: result.error,
      };
    }

    return {
      success: true,
      content: result.formattedOutput,
      metadata: {
        strategy: result.strategy,
        requestType: result.requestType,
        researchTimeMs: result.researchTimeMs,
        strategyTimeMs: result.strategyTimeMs,
        generationTimeMs: result.generationTimeMs,
        totalTimeMs,
        enrichmentMetadata: result.enrichedState?.enrichmentMetadata,
        argumentsFound: result.arguments.length,
      },
    };
  } catch (error: any) {
    log.error('[runAntragAgentGraph] Fatal error:', error);
    return {
      success: false,
      content: '',
      metadata: {
        strategy: null,
        requestType: input.requestType,
        researchTimeMs: 0,
        strategyTimeMs: 0,
        generationTimeMs: 0,
        totalTimeMs: 0,
        argumentsFound: 0,
      },
      error: error.message,
    };
  }
}
