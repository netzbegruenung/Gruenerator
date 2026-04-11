/**
 * ImageSelectionGraph - AI-powered background image selection for sharepics
 * Single-step process:
 * 1. Load image catalog
 * 2. AI selects best image directly from all descriptions
 */

import { StateGraph, Annotation } from '@langchain/langgraph';

import { type AIWorkerPool } from '../../../workers/types.js';

import { loadCatalogNode } from './nodes/LoadCatalogNode.js';
import { selectImageNode } from './nodes/SelectImageNode.js';

import type {
  ImageSelectionState,
  ImageSelectionInput,
  ImageSelectionOutput,
  CatalogImage,
  ImageCatalog,
  SelectionMetadata,
} from './types.js';
import type { Request } from 'express';

// State schema for the image selection graph
const ImageSelectionStateAnnotation = Annotation.Root({
  // Input
  text: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),
  sharepicType: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),
  aiWorkerPool: Annotation<AIWorkerPool>({
    reducer: (x, y) => y ?? x,
  }),
  req: Annotation<Request>({
    reducer: (x, y) => y ?? x,
  }),

  // Core data
  imageCatalog: Annotation<ImageCatalog | null>({
    reducer: (x, y) => y ?? x,
  }),

  // Output
  selectedImage: Annotation<CatalogImage | null>({
    reducer: (x, y) => y ?? x,
  }),
  confidence: Annotation<number | null>({
    reducer: (x, y) => y ?? x,
  }),
  reasoning: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
  alternatives: Annotation<CatalogImage[] | null>({
    reducer: (x, y) => y ?? x,
  }),
  metadata: Annotation<SelectionMetadata>({
    reducer: (x, y) => ({ ...x, ...y }),
  }),
  error: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
});

/**
 * Create and configure the graph
 */
type ImageSelectionGraphState = typeof ImageSelectionStateAnnotation.State;

function createImageSelectionGraph() {
  const workflow = new StateGraph(ImageSelectionStateAnnotation)
    .addNode(
      'loadCatalog',
      loadCatalogNode as (
        state: ImageSelectionGraphState
      ) => Promise<Partial<ImageSelectionGraphState>>
    )
    .addNode(
      'selectImage',
      selectImageNode as (
        state: ImageSelectionGraphState
      ) => Promise<Partial<ImageSelectionGraphState>>
    )
    .addEdge('__start__', 'loadCatalog')
    .addEdge('loadCatalog', 'selectImage')
    .addEdge('selectImage', '__end__');

  return workflow.compile();
}

// Export the compiled graph
export const imageSelectionGraph = createImageSelectionGraph();

/**
 * Execute image selection using the graph
 */
export async function runImageSelection(input: ImageSelectionInput): Promise<ImageSelectionOutput> {
  const { text, sharepicType, aiWorkerPool, req } = input;

  console.log(`[ImageSelectionGraph] Starting image selection for: "${text.substring(0, 50)}..."`);

  try {
    const initialState = {
      text,
      sharepicType,
      aiWorkerPool,
      req,
      metadata: {} as SelectionMetadata,
    };

    const result = await imageSelectionGraph.invoke(
      initialState as unknown as typeof ImageSelectionStateAnnotation.State
    );

    // Format final output
    if (result.error && !result.selectedImage) {
      return {
        status: 'error',
        error: result.error,
        metadata: result.metadata,
      };
    }

    return {
      status: 'success',
      selectedImage: result.selectedImage,
      confidence: result.confidence,
      reasoning: result.reasoning,
      alternatives: result.alternatives,
      metadata: result.metadata,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[ImageSelectionGraph] Execution error:', errorMessage);

    return {
      status: 'error',
      error: errorMessage,
      metadata: {
        selectionMethod: 'error_fallback',
      },
    };
  }
}
