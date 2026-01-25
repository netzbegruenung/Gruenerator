/**
 * ImageSelectionGraph - AI-powered background image selection for sharepics
 * Single-step process:
 * 1. Load image catalog
 * 2. AI selects best image directly from all descriptions
 */

import { StateGraph, Annotation } from '@langchain/langgraph';
import type { ImageSelectionState, ImageSelectionInput, ImageSelectionOutput } from './types.js';
import { loadCatalogNode } from './nodes/LoadCatalogNode.js';
import { selectImageNode } from './nodes/SelectImageNode.js';

// State schema for the image selection graph
const ImageSelectionStateAnnotation = Annotation.Root({
  // Input
  text: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
  sharepicType: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
  aiWorkerPool: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
  req: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),

  // Core data
  imageCatalog: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),

  // Output
  selectedImage: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
  confidence: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
  reasoning: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
  alternatives: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
  metadata: Annotation({
    reducer: (x: any, y: any) => ({ ...x, ...y }),
  }),
  error: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
});

/**
 * Create and configure the graph
 */
function createImageSelectionGraph() {
  const workflow = new StateGraph(ImageSelectionStateAnnotation)
    .addNode('loadCatalog', loadCatalogNode as any)
    .addNode('selectImage', selectImageNode as any)
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
    const initialState: Partial<ImageSelectionState> = {
      text,
      sharepicType,
      aiWorkerPool,
      req,
      metadata: {},
    };

    const result = await imageSelectionGraph.invoke(initialState);

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
