/**
 * Shared type definitions for user services
 */

// ============================================================================
// ProfileService Types
// ============================================================================

export interface UserProfile {
  id: string;
  keycloak_id?: string | undefined;
  email: string;
  username?: string | undefined;
  display_name?: string | undefined;
  avatar_robot_id: number;
  chat_color?: string | undefined;
  beta_features: Record<string, boolean>;
  user_defaults: Record<string, Record<string, unknown>>;
  locale?: 'de-DE' | 'de-AT' | undefined;

  // Feature flags
  groups_enabled: boolean;
  custom_generators: boolean;
  database_access: boolean;
  collab: boolean;
  notebook: boolean;
  sharepic: boolean;
  anweisungen: boolean;
  labor_enabled: boolean;
  sites_enabled: boolean;
  chat: boolean;
  interactive_antrag_enabled: boolean;
  vorlagen: boolean;
  video_editor: boolean;
  scanner?: boolean | undefined;
  prompts?: boolean | undefined;
  docs?: boolean | undefined;
  boards?: boolean | undefined;
  bundestag_api_enabled?: boolean | undefined;
  memory_enabled?: boolean | undefined;
  wordpress_enabled?: boolean | undefined;
  custom_prompt?: string | undefined;

  // Timestamps
  created_at: Date | string;
  updated_at: Date | string;
  last_login?: Date | string | undefined;
}

export interface ProfileCreateData {
  id?: string | undefined;
  keycloak_id?: string | undefined;
  email?: string | undefined;
  username?: string | undefined;
  display_name?: string | undefined;
  avatar_robot_id?: number | undefined;
  chat_color?: string | undefined;
  beta_features?: Record<string, boolean> | undefined;
  user_defaults?: Record<string, Record<string, unknown>> | undefined;
  locale?: string | undefined;
  last_login?: string | undefined;
  groups_enabled?: boolean | undefined;
  custom_generators?: boolean | undefined;
  database_access?: boolean | undefined;
  collab?: boolean | undefined;
  notebook?: boolean | undefined;
  sharepic?: boolean | undefined;
  anweisungen?: boolean | undefined;
  interactive_antrag_enabled?: boolean | undefined;
}

export interface ProfileUpdateData {
  email?: string | undefined;
  username?: string | undefined;
  display_name?: string | undefined;
  avatar_robot_id?: number | undefined;
  chat_color?: string | undefined;
  beta_features?: Record<string, boolean> | undefined;
  user_defaults?: Record<string, Record<string, unknown>> | undefined;
  [key: string]: unknown;
}

export interface BetaFeatures {
  groups: boolean;
  customGenerators: boolean;
  database: boolean;
  collab: boolean;
  notebook: boolean;
  sharepic: boolean;
  anweisungen: boolean;
  labor: boolean;
  sites: boolean;
  chat: boolean;
  interactiveAntrag: boolean;
  vorlagen: boolean;
  videoEditor: boolean;
  prompts: boolean;
  scanner: boolean;
  docs: boolean;
  boards: boolean;
  memories: boolean;
  [key: string]: boolean;
}

export interface ProfileStats {
  total_profiles: number;
  bundestag_users: number;
  memory_users: number;
  active_users: number;
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  database: string;
  profileCount?: number | undefined;
  error?: string | undefined;
}

// ============================================================================
// KnowledgeService Types
// ============================================================================

export interface UserKnowledgeEntry {
  id: string;
  user_id?: string | undefined;
  title: string;
  content: string;
  knowledge_type: string;
  tags: string[] | null;
  is_active?: boolean | undefined;
  embedding_id?: string | undefined;
  embedding_hash?: string | undefined;
  vector_indexed_at?: Date | string | null | undefined;
  created_at?: Date | string | undefined;
  updated_at?: Date | string | undefined;
}

export interface KnowledgeSaveData {
  id?: string | undefined;
  title: string;
  content: string;
  knowledge_type?: string | undefined;
  tags?: string[] | null | undefined;
}

export interface VectorizationResult {
  embeddingId: string | null;
  chunksCount: number;
}

export interface EmbeddingChunk {
  text: string;
  embedding: number[];
  tokens: number;
}

export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: {
    knowledge_id: string;
    user_id: string;
    title: string;
    content: string;
    chunk_index: number;
    chunk_tokens: number;
    knowledge_type: string;
    created_at: string;
    [key: string]: unknown;
  };
}

export interface SearchOptions {
  limit?: number | undefined;
  threshold?: number | undefined;
}

export interface SearchResult {
  knowledge_id: string;
  title: string;
  content: string;
  similarity_score: number;
  knowledge_type: string;
}

export interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  total: number;
  search_type: 'vector' | 'text';
}

export interface ChunkingOptions {
  chunkSize?: number | undefined;
  chunkOverlap?: number | undefined;
  respectSentences?: boolean | undefined;
}

export interface DocumentChunk {
  text: string;
  tokens: number;
  start?: number | undefined;
  end?: number | undefined;
}
