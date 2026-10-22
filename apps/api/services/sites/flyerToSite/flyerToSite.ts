import { createLogger } from '../../../utils/logger.js';

import { analyzeNode } from './nodes/analyzeNode.js';
import { extractNode } from './nodes/extractNode.js';
import { generateNode } from './nodes/generateNode.js';
import { selectImagesNode } from './nodes/selectImagesNode.js';

import type { FlyerToSiteInput, FlyerToSiteOutput, FlyerToSiteState } from './types.js';

const log = createLogger('FlyerToSite');

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

async function runPipeline(input: FlyerToSiteInput): Promise<FlyerToSiteState> {
  let state = initializeState(input);
  state = { ...state, ...(await extractNode(state)) };
  if (!state.extractedText) {
    log.warn('No text extracted, ending pipeline early');
    return state;
  }
  for (const step of [analyzeNode, generateNode, selectImagesNode]) {
    state = { ...state, ...(await step(state)) };
  }
  return state;
}

export async function runFlyerToSite(input: FlyerToSiteInput): Promise<FlyerToSiteOutput> {
  const startTime = Date.now();

  try {
    log.debug('Starting FlyerToSite pipeline', {
      filename: input.originalFilename,
      bufferSize: input.pdfBuffer.length,
    });

    const result = await runPipeline(input);
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
