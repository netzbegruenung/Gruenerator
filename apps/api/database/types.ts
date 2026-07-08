/**
 * Kysely Database type definitions generated from schema.sql + migrations.
 *
 * Column names use snake_case to match PostgreSQL.
 * Nullable columns are typed as `T | null`.
 * Columns with server-side defaults (uuid_generate_v4(), CURRENT_TIMESTAMP, etc.)
 * are typed with their base type — callers should omit them on INSERT and Kysely's
 * `Generated<T>` wrapper can be added once Kysely is installed as a dependency.
 */

// ---------------------------------------------------------------------------
// SECTION 2: CORE USER TABLES
// ---------------------------------------------------------------------------

export interface ProfileRow {
  id: string;
  created_at: Date;
  updated_at: Date;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  deutschlandmodus: boolean;
  is_admin: boolean;
  profile_image: number;
  avatar_robot_id: number;
  keycloak_id: string | null;
  username: string | null;
  last_login: Date | null;
  email: string | null;
  email_verified: boolean;
  custom_prompt: string | null;
  beta_features: Record<string, unknown>;
  presseabbinder: string | null;
  custom_antrag_gliederung: string | null;
  auth_source: string | null;
  locale: string;
  groups_enabled: boolean;
  groups: boolean;
  custom_generators: boolean;
  database_access: boolean;
  collab: boolean;
  notebook: boolean;
  sharepic: boolean;
  anweisungen: boolean;
  chat_color: string | null;
  content_management: boolean;
  labor_enabled: boolean;
  sites: boolean;
  sites_enabled: boolean;
  chat: boolean;
  website: boolean;
  ai_sharepic: boolean;
  vorlagen: boolean;
  video_editor: boolean;
  scanner: boolean;
  prompts: boolean;
  interactive_antrag_enabled: boolean;
  nextcloud_share_links: Record<string, unknown>[];
  wordpress_sites: Record<string, unknown>[];
  wordpress_enabled: boolean;
  document_mode: string;
  user_defaults: Record<string, unknown>;
  docs: boolean;
  boards: boolean;
  bundestag_api_enabled: boolean;
  memory_enabled: boolean;
}

// ---------------------------------------------------------------------------
// SECTION 3: GROUPS & MEMBERSHIPS
// ---------------------------------------------------------------------------

export interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  join_token: string | null;
  is_active: boolean;
  group_type: string;
  settings: Record<string, unknown>;
  wolke_share_links: Record<string, unknown>[];
  avatar_url: string | null;
  links: Record<string, unknown>[];
}

export interface GroupMembershipRow {
  id: string;
  group_id: string;
  user_id: string;
  role: string;
  joined_at: Date;
  is_active: boolean;
}

export interface GroupContentShareRow {
  id: string;
  group_id: string;
  shared_by_user_id: string | null;
  content_type: string;
  content_id: string;
  permissions: Record<string, unknown>;
  shared_at: Date;
}

export interface GroupInstructionRow {
  id: string;
  group_id: string;
  custom_prompt: string;
  instructions_enabled: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// SECTION 4: DOCUMENTS & KNOWLEDGE BASE
// ---------------------------------------------------------------------------

export interface DocumentRow {
  id: string;
  user_id: string | null;
  title: string;
  filename: string | null;
  file_path: string | null;
  file_size: number;
  page_count: number;
  status: string;
  ocr_text: string | null;
  created_at: Date;
  updated_at: Date;
  ocr_method: string;
  source_url: string | null;
  document_type: string;
  metadata: Record<string, unknown> | null;
  markdown_content: string | null;
  group_id: string | null;
  source_type: string;
  wolke_share_link_id: string | null;
  wolke_file_path: string | null;
  wolke_etag: string | null;
  vector_count: number;
  last_synced_at: Date | null;
  group_wolke_share_id: string | null;
}

export interface DocumentDailyVersionRow {
  id: string;
  document_id: string;
  version_date: string; // DATE stored as ISO string
  content_snapshot: string | null;
  created_at: Date;
  metadata: Record<string, unknown> | null;
}

export interface UserDocumentRow {
  id: string;
  user_id: string | null;
  title: string;
  content: string;
  document_type: string;
  created_at: Date;
  updated_at: Date;
  is_active: boolean;
  tags: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

export interface UserDocumentMetadataRow {
  id: string;
  document_id: string;
  metadata_key: string;
  metadata_value: string | null;
  created_at: Date;
}

export interface UserKnowledgeRow {
  id: string;
  user_id: string | null;
  title: string;
  content: string;
  knowledge_type: string;
  created_at: Date;
  updated_at: Date;
  tags: Record<string, unknown> | null;
  is_active: boolean;
  embedding_id: string | null;
  embedding_hash: string | null;
  vector_indexed_at: Date | null;
}

export interface GrundsatzDocumentRow {
  id: string;
  title: string;
  filename: string;
  file_path: string | null;
  file_size: number;
  page_count: number;
  status: string;
  document_type: string;
  description: string | null;
  publication_date: string | null; // DATE
  ocr_text: string | null;
  created_at: Date;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// SECTION 5: COLLABORATIVE EDITING
// ---------------------------------------------------------------------------

// CollaborativeDocumentRow removed — use CollaborativeDocument from schema/collaborative.ts

export interface CollaborativeDocumentInitRow {
  document_id: string;
  init_data: Buffer | null;
  created_at: Date;
}

export interface CollaborativeDocumentFolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  created_by: string;
  created_at: Date;
  is_deleted: boolean;
}

export interface YjsDocumentUpdateRow {
  id: string;
  document_id: string;
  update_data: Buffer;
  client_id: number | null;
  created_at: Date;
  version: number;
}

// ---------------------------------------------------------------------------
// SECTION 6: NOTEBOOKS
// ---------------------------------------------------------------------------

export interface NotebookCollectionRow {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
  is_active: boolean;
  settings: Record<string, unknown>;
  document_count: number;
  last_used_at: Date | null;
}

export interface NotebookCollectionDocumentRow {
  id: string;
  collection_id: string;
  document_id: string;
  added_at: Date;
  added_by: string | null;
}

export interface NotebookUsageLogRow {
  id: string;
  collection_id: string | null;
  user_id: string | null;
  question: string;
  answer_length: number | null;
  response_time_ms: number | null;
  created_at: Date;
  ip_address: string | null;
  user_agent: string | null;
}

// ---------------------------------------------------------------------------
// SECTION 7: GENERATORS & PROMPTS
// ---------------------------------------------------------------------------

export interface CustomGeneratorRow {
  id: string;
  user_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  title: string | null;
  contact_email: string | null;
  prompt: string;
  form_schema: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  is_active: boolean;
  usage_count: number;
  settings: Record<string, unknown>;
}

export interface CustomGeneratorDocumentRow {
  id: string;
  custom_generator_id: string;
  document_id: string;
  created_at: Date;
}

export interface SavedGeneratorRow {
  id: string;
  user_id: string;
  generator_id: string;
  saved_at: Date;
}

export interface CustomPromptRow {
  id: string;
  user_id: string | null;
  name: string;
  slug: string;
  prompt: string;
  description: string | null;
  is_public: boolean;
  is_active: boolean;
  usage_count: number;
  created_at: Date;
  updated_at: Date;
  embedding_id: string | null;
  embedding_hash: string | null;
  vector_indexed_at: Date | null;
}

export interface SavedPromptRow {
  id: string;
  user_id: string;
  prompt_id: string;
  saved_at: Date;
}

// ---------------------------------------------------------------------------
// SECTION 8: TEMPLATES & LIKES
// ---------------------------------------------------------------------------

export interface UserTemplateRow {
  id: string;
  user_id: string | null;
  type: string;
  title: string;
  description: string | null;
  template_type: string;
  external_url: string | null;
  thumbnail_url: string | null;
  images: Record<string, unknown>[];
  categories: Record<string, unknown>[];
  tags: Record<string, unknown>[];
  content_data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  is_private: boolean;
  is_example: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface TemplateLikeRow {
  id: string;
  user_id: string;
  template_id: string;
  template_type: string;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// SECTION 9: MEDIA & SHARING
// ---------------------------------------------------------------------------

export interface UserSharepicRow {
  id: string;
  user_id: string | null;
  image_url: string | null;
  title: string | null;
  description: string | null;
  created_at: Date;
  metadata: Record<string, unknown>;
}

export interface UserUploadRow {
  id: string;
  user_id: string | null;
  file_name: string;
  file_url: string | null;
  file_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  upload_status: string;
  created_at: Date;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// SECTION 10: FEATURE TABLES
// ---------------------------------------------------------------------------

export interface SubtitlerProjectRow {
  id: string;
  user_id: string | null;
  title: string;
  status: string;
  video_path: string;
  video_filename: string;
  video_size: number;
  video_metadata: Record<string, unknown>;
  thumbnail_path: string | null;
  subtitled_video_path: string | null;
  subtitles: string | null;
  style_preference: string;
  height_preference: string;
  mode_preference: string;
  style_settings: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  last_edited_at: Date;
  export_count: number;
}

export interface SubtitlerSharedVideoRow {
  id: string;
  project_id: string | null;
  user_id: string | null;
  share_token: string;
  video_path: string | null;
  video_filename: string | null;
  title: string | null;
  thumbnail_path: string | null;
  duration: number | null;
  expires_at: Date;
  download_count: number;
  status: string;
  created_at: Date;
}

export interface SubtitlerShareDownloadRow {
  id: string;
  shared_video_id: string | null;
  email: string;
  downloaded_at: Date;
  ip_address: string | null;
}

export interface SharedMediaRow {
  id: string;
  user_id: string | null;
  share_token: string;
  media_type: string;
  title: string | null;
  file_path: string | null;
  file_name: string | null;
  thumbnail_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  duration: number | null;
  project_id: string | null;
  image_type: string | null;
  image_metadata: Record<string, unknown>;
  status: string;
  download_count: number;
  view_count: number;
  created_at: Date;
  is_library_item: boolean;
  alt_text: string | null;
  upload_source: string;
  original_filename: string | null;
  is_template: boolean;
  template_visibility: string;
  template_use_count: number;
  template_creator_name: string | null;
  original_template_id: string | null;
  wolke_share_link_id: string | null;
  wolke_file_path: string | null;
  expires_at: Date | null;
  password_hash: string | null;
  transfer_files: Record<string, unknown>[];
  transfer_message: string | null;
}

export interface SharedMediaDownloadRow {
  id: string;
  shared_media_id: string | null;
  downloader_email: string | null;
  downloaded_at: Date;
  ip_address: string | null;
}

export interface AntragRow {
  id: string;
  user_id: string | null;
  title: string;
  content: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
  metadata: Record<string, unknown>;
}

export interface UserRecentValueRow {
  id: string;
  user_id: string | null;
  field_type: string;
  field_value: string;
  form_name: string | null;
  created_at: Date;
}

export interface UserItemUsageRow {
  id: string;
  user_id: string;
  item_type: string;
  item_id: string;
  use_count: number;
  last_used_at: Date;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// SECTION 11: SYSTEM TABLES
// ---------------------------------------------------------------------------

export interface DatabaseRow {
  id: string;
  table_name: string;
  record_key: string;
  record_value: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
  metadata: Record<string, unknown> | null;
  user_id: string | null;
  is_active: boolean;
  tags: Record<string, unknown> | null;
  category: string | null;
  subcategory: string | null;
  priority: number;
  expires_at: Date | null;
  access_count: number;
  last_accessed_at: Date | null;
  created_by: string | null;
  data_type: string;
  version: number;
}

// WolkeSyncStatusRow removed — use InferSelectModel<typeof wolkeSyncStatus> from schema/system.ts

export interface RouteUsageStatRow {
  id: number;
  route_pattern: string;
  method: string;
  request_count: number;
  last_accessed: Date;
  created_at: Date;
}

export interface GenerationLogRow {
  id: string;
  user_id: string | null;
  generation_type: string;
  platform: string | null;
  created_at: Date;
  tokens_used: number | null;
  success: boolean;
}

// ---------------------------------------------------------------------------
// SECTION 14: CHAT SERVICE TABLES
// ---------------------------------------------------------------------------

export interface ChatThreadRow {
  id: string;
  user_id: string | null;
  agent_id: string;
  title: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
  permissions: Record<string, unknown>;
  is_public: boolean;
  compaction_summary: string | null;
  compacted_up_to_message_id: string | null;
  compaction_updated_at: Date | null;
  thread_type: string;
  custom_system_prompt: string | null;
  custom_enabled_tools: Record<string, unknown> | null;
  notebook_collection_id: string | null;
  notebook_collection_ids: Record<string, unknown> | null;
}

export interface ChatMessageRow {
  id: string;
  thread_id: string | null;
  role: string;
  user_id: string | null;
  content: string | null;
  tool_calls: Record<string, unknown> | null;
  tool_results: Record<string, unknown> | null;
  created_at: Date;
}

export interface ChatThreadAttachmentRow {
  id: string;
  thread_id: string | null;
  message_id: string | null;
  user_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  is_image: boolean;
  extracted_text: string | null;
  summary: string | null;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// SECTION: MEM0 MEMORY HISTORY
// ---------------------------------------------------------------------------

export interface Mem0MemoryHistoryRow {
  id: string;
  user_id: string | null;
  memory_id: string;
  operation: string;
  memory_text: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  thread_id: string | null;
  message_id: string | null;
}

// ---------------------------------------------------------------------------
// SECTION: BRIEFING AGENTS
// ---------------------------------------------------------------------------

export interface BriefingAgentRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  config: Record<string, unknown>;
  schedule_type: string;
  schedule_hour: number;
  schedule_timezone: string;
  delivery_email: string | null;
  created_at: Date;
  updated_at: Date;
  last_executed_at: Date | null;
  execution_count: number;
  consecutive_empty_count: number;
}

export interface BriefingExecutionRow {
  id: string;
  agent_id: string;
  status: string;
  results_count: number;
  results_summary: string | null;
  results_raw: Record<string, unknown> | null;
  started_at: Date;
  completed_at: Date | null;
  duration_ms: number | null;
  error_message: string | null;
}

// ---------------------------------------------------------------------------
// SECTION: NOTIFICATIONS
// ---------------------------------------------------------------------------

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  metadata: Record<string, unknown>;
  action_url: string | null;
  group_key: string | null;
  is_read: boolean;
  read_at: Date | null;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// SECTION: MONITOR
// ---------------------------------------------------------------------------

export interface MonitorSnapshotRow {
  id: string;
  created_at: Date;
  total_articles: number;
  sources: string[];
  topic_scores: Record<string, unknown>;
  articles: Record<string, unknown>;
  keywords: Record<string, unknown>[];
}

export interface MonitorArticleRow {
  id: string;
  url: string;
  title: string;
  excerpt: string;
  source: string;
  locale: string;
  published_at: Date | null;
  primary_topic: string | null;
  topic_scores: Record<string, unknown>;
  first_seen_at: Date;
  last_seen_at: Date;
}

// ---------------------------------------------------------------------------
// SECTION: BOARD COMMENTS & REACTIONS
// ---------------------------------------------------------------------------

export interface BoardCommentRow {
  id: string;
  board_id: string;
  card_id: string;
  parent_id: string | null;
  user_id: string;
  content: string | null;
  blocks: Record<string, unknown>[];
  mentioned_user_ids: string[];
  is_edited: boolean;
  edited_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface BoardCommentReactionRow {
  id: string;
  comment_id: string;
  user_id: string;
  emoji: string;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// SECTION: BETTER AUTH TABLES — moved to `database/schema/auth.ts` (Drizzle)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// DATABASE INTERFACE — maps table names to row types
// ---------------------------------------------------------------------------

export interface Database {
  profiles: ProfileRow;
  groups: GroupRow;
  group_memberships: GroupMembershipRow;
  group_content_shares: GroupContentShareRow;
  group_instructions: GroupInstructionRow;
  documents: DocumentRow;
  document_daily_versions: DocumentDailyVersionRow;
  user_documents: UserDocumentRow;
  user_document_metadata: UserDocumentMetadataRow;
  user_knowledge: UserKnowledgeRow;
  grundsatz_documents: GrundsatzDocumentRow;
  collaborative_documents_init: CollaborativeDocumentInitRow;
  collaborative_document_folders: CollaborativeDocumentFolderRow;
  yjs_document_updates: YjsDocumentUpdateRow;
  notebook_collections: NotebookCollectionRow;
  notebook_collection_documents: NotebookCollectionDocumentRow;
  notebook_usage_logs: NotebookUsageLogRow;
  custom_generators: CustomGeneratorRow;
  custom_generator_documents: CustomGeneratorDocumentRow;
  saved_generators: SavedGeneratorRow;
  custom_prompts: CustomPromptRow;
  saved_prompts: SavedPromptRow;
  user_templates: UserTemplateRow;
  template_likes: TemplateLikeRow;
  user_sharepics: UserSharepicRow;
  user_uploads: UserUploadRow;
  subtitler_projects: SubtitlerProjectRow;
  subtitler_shared_videos: SubtitlerSharedVideoRow;
  subtitler_share_downloads: SubtitlerShareDownloadRow;
  shared_media: SharedMediaRow;
  shared_media_downloads: SharedMediaDownloadRow;
  antraege: AntragRow;
  user_recent_values: UserRecentValueRow;
  user_item_usage: UserItemUsageRow;
  database: DatabaseRow;
  route_usage_stats: RouteUsageStatRow;
  generation_logs: GenerationLogRow;
  chat_threads: ChatThreadRow;
  chat_messages: ChatMessageRow;
  chat_thread_attachments: ChatThreadAttachmentRow;
  mem0_memory_history: Mem0MemoryHistoryRow;
  briefing_agents: BriefingAgentRow;
  briefing_executions: BriefingExecutionRow;
  notifications: NotificationRow;
  monitor_snapshots: MonitorSnapshotRow;
  monitor_articles: MonitorArticleRow;
  board_comments: BoardCommentRow;
  board_comment_reactions: BoardCommentReactionRow;
}
