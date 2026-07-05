/**
 * @gruenerator/query — pure-TS search primitives shared by the API and MCP:
 * Qdrant filter building, vector/hybrid search infrastructure, and German query
 * text normalization. No React/DOM/zustand deps, so consumers (e.g. the MCP
 * server) can build it without pulling in all of @gruenerator/shared.
 */

// Filter builder utilities + types
export * from './filters/index.js';

// German query text normalization (normalizeQuery, tokenizeQuery, …)
export * from './text/index.js';

// Vector/hybrid search infrastructure (namespaced — shares type names like
// QdrantFilter with ./filters, so keep it behind `vector.`)
export * as vector from './vector/index.js';
