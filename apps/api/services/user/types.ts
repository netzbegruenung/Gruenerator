/**
 * Shared type definitions for user services
 */

// ============================================================================
// ProfileService Types
// ============================================================================

export interface UserProfile {
  id: string;
  keycloak_id?: string;
  email: string;
  username?: string;
  display_name?: string;
  avatar_robot_id: number;
  chat_color?: string;
  beta_features: Record<string, boolean>;
  user_defaults: Record<string, Record<string, any>>;
  locale?: 'de-DE' | 'de-AT';

  // Feature flags
  igel_modus: boolean;
  groups_enabled: boolean;
  custom_generators: boolean;
  database_access: boolean;
  collab: boolean;
  notebook: boolean;
  sharepic: boolean;
  anweisungen: boolean;
  canva: boolean;
  labor_enabled: boolean;
  sites_enabled: boolean;
  chat: boolean;
  interactive_antrag_enabled: boolean;
  auto_save_on_export: boolean;
  vorlagen: boolean;
  video_editor: boolean;
  scanner?: boolean;
  prompts?: boolean;
  bundestag_api_enabled?: boolean;
  memory_enabled?: boolean;
  canva_user_id?: string;

  // Timestamps
  created_at: Date | string;
  updated_at: Date | string;
  last_login?: Date | string;
}

export interface ProfileCreateData {
  keycloak_id?: string;
  email: string;
  username?: string;
  display_name?: string;
  avatar_robot_id?: number;
  chat_color?: string;
  beta_features?: Record<string, boolean>;
  user_defaults?: Record<string, Record<string, any>>;
  igel_modus?: boolean;
  groups_enabled?: boolean;
  custom_generators?: boolean;
  database_access?: boolean;
  collab?: boolean;
  notebook?: boolean;
  sharepic?: boolean;
  anweisungen?: boolean;
  canva?: boolean;
  interactive_antrag_enabled?: boolean;
}

export interface ProfileUpdateData {
  email?: string;
  username?: string;
  display_name?: string;
  avatar_robot_id?: number;
  chat_color?: string;
  beta_features?: Record<string, boolean>;
  user_defaults?: Record<string, Record<string, any>>;
  [key: string]: any;
}

export interface BetaFeatures {
  igel_modus: boolean;
  groups: boolean;
  customGenerators: boolean;
  database: boolean;
  collab: boolean;
  notebook: boolean;
  sharepic: boolean;
  anweisungen: boolean;
  canva: boolean;
  labor: boolean;
  sites: boolean;
  chat: boolean;
  interactiveAntrag: boolean;
  autoSaveOnExport: boolean;
  vorlagen: boolean;
  videoEditor: boolean;
  prompts: boolean;
  scanner: boolean;
}

export interface ProfileStats {
  total_profiles: number;
  igel_users: number;
  bundestag_users: number;
  memory_users: number;
  active_users: number;
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  database: string;
  profileCount?: number;
  error?: string;
}

// ============================================================================
// KnowledgeService Types
// ============================================================================

export interface UserKnowledgeEntry {
  id: string;
  user_id?: string;
  title: string;
  content: string;
  knowledge_type: string;
  tags: string[] | null;
  is_active?: boolean;
  embedding_id?: string;
  embedding_hash?: string;
  vector_indexed_at?: Date | string | null;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface KnowledgeSaveData {
  id?: string;
  title: string;
  content: string;
  knowledge_type?: string;
  tags?: string[] | null;
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
  };
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
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
  chunkSize?: number;
  chunkOverlap?: number;
  respectSentences?: boolean;
}

export interface DocumentChunk {
  text: string;
  tokens: number;
  start?: number;
  end?: number;
}
