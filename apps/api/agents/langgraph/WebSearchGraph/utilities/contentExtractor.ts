/**
 * Content extraction utilities for WebSearchGraph
 *
 * The implementation moved to `services/search/lexicalPassageScore.ts`, where
 * it is also the distiller's fallback scorer. Re-exported here so this graph's
 * callers keep their import path.
 */

export { extractKeyParagraphs } from '../../../../services/search/lexicalPassageScore.js';
