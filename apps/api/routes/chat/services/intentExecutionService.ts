/**
 * Intent Execution Service — the facade over `intentHandlers/`.
 *
 * The turn handlers that are NOT plain artifact creation live one directory
 * down, one module per intent family: share_doc, sharepic/social-post
 * generation and the search/image/summary pipeline.
 * Artifact-creating turns live in createTurn.ts (choreography) and
 * artifactKinds.ts (per-kind data); the thin handlers naming them sit in
 * intentHandlers/artifactTurns.ts.
 *
 * This module keeps only the names. Every consumer — the contract router, the
 * resume pipeline, the loop's fat tools, the MCP server factory and the board
 * agent flow — imports from here, and `domainTools.vitest.ts` mocks exactly
 * this specifier, so the export list is the seam and stays stable.
 */

// The generation cores live in artifactGeneration.ts (so the per-kind table
// can use them without an import cycle). Re-exported here because the loop's
// fat tools, the MCP server factory and the board agent flow all import them
// from this module — and because they are the seam both chat paths share.
export {
  pdfKindFromText,
  runBoardGeneration,
  runDocGeneration,
  runPdfGeneration,
} from './artifactGeneration.js';

export {
  generateAndCreateDocument,
  handleBoardCreation,
  handlePdfCreation,
  handlePresentationCreation,
  handleSheetCreation,
} from './intentHandlers/artifactTurns.js';
export { reportMcpWithoutLoop } from './intentHandlers/mcpWithoutLoop.js';
export { carryThreadSourcesIfNeeded, executeIntentPipeline } from './intentHandlers/pipeline.js';
export { handleShareDoc } from './intentHandlers/shareDoc.js';
export { runSharepicGeneration } from './intentHandlers/sharepic.js';
export { handleSheetEdit } from './intentHandlers/sheetEdit.js';
export { reportUnavailableSources } from './intentHandlers/unavailableSources.js';
