/**
 * Search Module
 * Platform-agnostic search functionality for web, deep research, and vector search
 */

// Web search types and hooks
export * from './types.js';
export * from './hooks/index.js';
export * from './utils/index.js';

// Vector search infrastructure (for API and MCP)
export * as vector from './vector/index.js';

// Collection configurations
export * as collections from './collections/index.js';

// Filter builder utilities
export * as filters from './filters/index.js';
