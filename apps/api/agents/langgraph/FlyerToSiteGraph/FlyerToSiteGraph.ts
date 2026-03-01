import { StateGraph, Annotation, END } from '@langchain/langgraph';

import { createLogger } from '../../../utils/logger.js';

import { analyzeNode } from './nodes/analyzeNode.js';
import { extractNode } from './nodes/extractNode.js';
import { generateNode } from './nodes/generateNode.js';
import { selectImagesNode } from './nodes/selectImagesNode.js';

import type {
  FlyerAnalysis,
  FlyerToSiteInput,
  FlyerToSiteOutput,
  FlyerToSiteState,
} from './types.js';
import type { ExtractionResult } from '../../../services/OcrService/types.js';
import type { WebsiteContent } from '../../../types/routes.js';

const log = createLogger('FlyerToSiteGraph');

const FlyerToSiteAnnotation = Annotation.Root({
  // Input
  pdfBuffer: Annotation<Buffer>({ reducer: (x, y) => y ?? x }),
  originalFilename: Annotation<string>({ reducer: (x, y) => y ?? x }),
  email: Annotation<string>({ reducer: (x, y) => y ?? x }),
  req: Annotation<any>({ reducer: (x, y) => y ?? x }),

  // extractNode output
  extractedText: Annotation<string | null>({ reducer: (x, y) => y ?? x }),
  extractionResult: Annotation<ExtractionResult | null>({ reducer: (x, y) => y ?? x }),
  extractTimeMs: Annotation<number>({ reducer: (x, y) => y ?? x ?? 0 }),

  // analyzeNode output
  flyerAnalysis: Annotation<FlyerAnalysis | null>({ reducer: (x, y) => y ?? x }),
  analyzeTimeMs: Annotation<number>({ reducer: (x, y) => y ?? x ?? 0 }),

  // generateNode output
  websiteContent: Annotation<WebsiteContent | null>({ reducer: (x, y) => y ?? x }),
  generateTimeMs: Annotation<number>({ reducer: (x, y) => y ?? x ?? 0 }),

  // selectImagesNode output
  websiteContentWithImages: Annotation<WebsiteContent | null>({ reducer: (x, y) => y ?? x }),
  imageTimeMs: Annotation<number>({ reducer: (x, y) => y ?? x ?? 0 }),

  // Timing & errors
  startTime: Annotation<number>({ reducer: (x, y) => y ?? x }),
  error: Annotation<string | null>({ reducer: (x, y) => y ?? x }),
});

function routeAfterExtraction(state: FlyerToSiteState): string {
  if (!state.extractedText) {
    log.warn('No text extracted, ending graph early');
    return END;
  }
  return 'analyze';
}

function createFlyerToSiteGraph() {
  const graph = new StateGraph(FlyerToSiteAnnotation)
    .addNode('extract', extractNode as any)
    .addNode('analyze', analyzeNode as any)
    .addNode('generate', generateNode as any)
    .addNode('selectImages', selectImagesNode as any)
    .addEdge('__start__', 'extract')
    .addConditionalEdges('extract', routeAfterExtraction as any, {
      analyze: 'analyze',
      [END]: END,
    })
    .addEdge('analyze', 'generate')
    .addEdge('generate', 'selectImages')
    .addEdge('selectImages', '__end__');

  return graph.compile();
}

const flyerToSiteGraph = createFlyerToSiteGraph();

function initializeState(input: FlyerToSiteInput): FlyerToSiteState {
  return {
    pdfBuffer: input.pdfBuffer,
    originalFilename: input.originalFilename,
    email: input.email || '',
    req: input.req,

    extractedText: null,
    extractionResult: null,
    extractTimeMs: 0,

    flyerAnalysis: null,
    analyzeTimeMs: 0,

    websiteContent: null,
    generateTimeMs: 0,

    websiteContentWithImages: null,
    imageTimeMs: 0,

    startTime: Date.now(),
    error: null,
  };
}

export async function runFlyerToSiteGraph(input: FlyerToSiteInput): Promise<FlyerToSiteOutput> {
  const startTime = Date.now();

  try {
    log.debug('Starting FlyerToSite pipeline', {
      filename: input.originalFilename,
      bufferSize: input.pdfBuffer.length,
    });

    const initialState = initializeState(input);
    const result = (await flyerToSiteGraph.invoke(initialState)) as FlyerToSiteState;
    const totalTimeMs = Date.now() - startTime;

    const finalContent = result.websiteContentWithImages || result.websiteContent;

    if (!finalContent) {
      return {
        success: false,
        json: null,
        metadata: {
          filename: input.originalFilename,
          extractTimeMs: result.extractTimeMs,
          analyzeTimeMs: result.analyzeTimeMs,
          generateTimeMs: result.generateTimeMs,
          imageTimeMs: result.imageTimeMs,
          totalTimeMs,
          ocrMethod: result.extractionResult?.method || 'none',
          extractedTextLength: result.extractedText?.length || 0,
        },
        error: result.error || 'Website-Generierung fehlgeschlagen',
      };
    }

    log.debug('Pipeline complete', {
      totalTimeMs,
      ocrMethod: result.extractionResult?.method,
      textLength: result.extractedText?.length,
    });

    return {
      success: true,
      json: finalContent,
      metadata: {
        filename: input.originalFilename,
        extractTimeMs: result.extractTimeMs,
        analyzeTimeMs: result.analyzeTimeMs,
        generateTimeMs: result.generateTimeMs,
        imageTimeMs: result.imageTimeMs,
        totalTimeMs,
        ocrMethod: result.extractionResult?.method || 'unknown',
        extractedTextLength: result.extractedText?.length || 0,
      },
    };
  } catch (err) {
    log.error('Pipeline error', { error: (err as Error).message });
    return {
      success: false,
      json: null,
      metadata: {
        filename: input.originalFilename,
        extractTimeMs: 0,
        analyzeTimeMs: 0,
        generateTimeMs: 0,
        imageTimeMs: 0,
        totalTimeMs: Date.now() - startTime,
        ocrMethod: 'none',
        extractedTextLength: 0,
      },
      error: (err as Error).message,
    };
  }
}
