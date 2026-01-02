/**
 * User Services - Barrel Export
 *
 * Centralized exports for all user-related services:
 * - ProfileService: User profile CRUD operations with PostgreSQL
 * - KnowledgeService: User knowledge management with vectorization
 */

// Main service exports
export { ProfileService, getProfileService, default as ProfileServiceClass } from './ProfileService.js';
export { KnowledgeService, getKnowledgeService, default as KnowledgeServiceClass } from './KnowledgeService.js';

// Type exports
export type {
  // ProfileService types
  UserProfile,
  ProfileCreateData,
  ProfileUpdateData,
  BetaFeatures,
  ProfileStats,
  HealthCheckResult,

  // KnowledgeService types
  UserKnowledgeEntry,
  KnowledgeSaveData,
  VectorizationResult,
  EmbeddingChunk,
  QdrantPoint,
  SearchOptions,
  SearchResult,
  SearchResponse,
  ChunkingOptions,
  DocumentChunk
} from './types.js';
