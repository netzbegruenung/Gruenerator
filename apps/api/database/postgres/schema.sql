-- ════════════════════════════════════════════════════════════════════════════
-- GRÜNERATOR DATABASE SCHEMA FOR POSTGRESQL
-- Organized into logical sections for maintainability
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 1: EXTENSIONS & UTILITY FUNCTIONS
-- PostgreSQL extensions and reusable functions
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE FUNCTION cleanup_recent_values()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM user_recent_values
    WHERE user_id = NEW.user_id
    AND field_type = NEW.field_type
    AND id NOT IN (
        SELECT id FROM user_recent_values
        WHERE user_id = NEW.user_id AND field_type = NEW.field_type
        ORDER BY created_at DESC
        LIMIT 5
    );
    RETURN NEW;
END;
$$ language 'plpgsql';


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2: CORE USER TABLES
-- Primary user authentication and profile data
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    first_name TEXT,
    last_name TEXT,
    display_name TEXT,
    avatar_url TEXT,
    deutschlandmodus BOOLEAN DEFAULT FALSE,
    is_admin BOOLEAN DEFAULT FALSE,
    profile_image INTEGER DEFAULT 1,
    avatar_robot_id INTEGER DEFAULT 1,
    keycloak_id TEXT,
    username TEXT,
    last_login TIMESTAMPTZ,
    email TEXT,
    custom_prompt TEXT,
    igel_modus BOOLEAN DEFAULT FALSE,
    beta_features JSONB DEFAULT '{}',
    presseabbinder TEXT,
    custom_antrag_gliederung TEXT,
    auth_source TEXT,
    locale TEXT DEFAULT 'de-DE' CHECK (locale IN ('de-DE', 'de-AT')),
    groups_enabled BOOLEAN DEFAULT FALSE,
    groups BOOLEAN DEFAULT FALSE,
    custom_generators BOOLEAN DEFAULT FALSE,
    database_access BOOLEAN DEFAULT FALSE,
    collab BOOLEAN DEFAULT FALSE,
    notebook BOOLEAN DEFAULT FALSE,
    sharepic BOOLEAN DEFAULT FALSE,
    anweisungen BOOLEAN DEFAULT FALSE,
    chat_color TEXT,
    content_management BOOLEAN DEFAULT FALSE,
    labor_enabled BOOLEAN DEFAULT FALSE,
    sites BOOLEAN DEFAULT FALSE,
    chat BOOLEAN DEFAULT FALSE,
    website BOOLEAN DEFAULT FALSE,
    ai_sharepic BOOLEAN DEFAULT FALSE,
    vorlagen BOOLEAN DEFAULT FALSE,
    video_editor BOOLEAN DEFAULT FALSE,
    scanner BOOLEAN DEFAULT FALSE,
    prompts BOOLEAN DEFAULT FALSE,
    interactive_antrag_enabled BOOLEAN DEFAULT TRUE,
    nextcloud_share_links JSONB DEFAULT '[]',
    document_mode TEXT DEFAULT 'manual',
    auto_save_on_export BOOLEAN DEFAULT FALSE,
    user_defaults JSONB DEFAULT '{}',
    docs BOOLEAN DEFAULT FALSE
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sites_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS scanner BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS prompts BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS docs BOOLEAN DEFAULT FALSE;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2B: MOBILE/DESKTOP APP AUTHENTICATION
-- Refresh tokens for native app authentication (mobile & desktop)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS app_refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,
    device_name VARCHAR(255),
    device_type VARCHAR(50) DEFAULT 'unknown',
    issued_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    UNIQUE(token_hash)
);

CREATE INDEX IF NOT EXISTS idx_app_refresh_tokens_user ON app_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_app_refresh_tokens_hash ON app_refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_app_refresh_tokens_expires ON app_refresh_tokens(expires_at) WHERE revoked_at IS NULL;

-- Push notification tokens (Expo Push) for mobile devices
ALTER TABLE app_refresh_tokens ADD COLUMN IF NOT EXISTS push_token TEXT;
ALTER TABLE app_refresh_tokens ADD COLUMN IF NOT EXISTS push_token_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_app_refresh_tokens_push
  ON app_refresh_tokens(user_id)
  WHERE push_token IS NOT NULL AND revoked_at IS NULL;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 3: GROUPS & MEMBERSHIPS
-- Group management, memberships, and group-specific settings
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    join_token TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    group_type TEXT DEFAULT 'standard',
    settings JSONB DEFAULT '{}',
    wolke_share_links JSONB DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS group_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_content_shares (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    shared_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    content_type TEXT NOT NULL,
    content_id UUID NOT NULL,
    permissions JSONB DEFAULT '{}',
    shared_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS group_instructions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    custom_prompt TEXT DEFAULT '',
    instructions_enabled BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id)
);

CREATE TABLE IF NOT EXISTS group_knowledge (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags JSONB,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 4: DOCUMENTS & KNOWLEDGE BASE
-- User documents, knowledge entries, and political documents
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    filename TEXT,
    file_path TEXT,
    file_size BIGINT DEFAULT 0,
    page_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    ocr_text TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ocr_method TEXT DEFAULT 'tesseract',
    source_url TEXT,
    document_type TEXT DEFAULT 'upload',
    metadata JSONB,
    markdown_content TEXT,
    group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
    source_type TEXT DEFAULT 'manual',
    wolke_share_link_id TEXT,
    wolke_file_path TEXT,
    wolke_etag TEXT,
    vector_count INTEGER DEFAULT 0,
    last_synced_at TIMESTAMPTZ,
    group_wolke_share_id TEXT
);

CREATE TABLE IF NOT EXISTS document_daily_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    version_date DATE NOT NULL,
    content_snapshot TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

CREATE TABLE IF NOT EXISTS user_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    document_type TEXT DEFAULT 'text',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    tags JSONB,
    metadata JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS user_document_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES user_documents(id) ON DELETE CASCADE,
    metadata_key TEXT NOT NULL,
    metadata_value TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_knowledge (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    knowledge_type TEXT DEFAULT 'general',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    tags JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    embedding_id TEXT,
    embedding_hash TEXT,
    vector_indexed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS grundsatz_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_path TEXT,
    file_size BIGINT NOT NULL,
    page_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    document_type TEXT NOT NULL,
    description TEXT,
    publication_date DATE,
    ocr_text TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 5: COLLABORATIVE EDITING
-- Y.js real-time collaboration, document sync, and folders
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS collaborative_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    content TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_edited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    is_public BOOLEAN DEFAULT FALSE,
    permissions JSONB DEFAULT '{}'
);

ALTER TABLE collaborative_documents ADD COLUMN IF NOT EXISTS folder_id UUID;
ALTER TABLE collaborative_documents ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE collaborative_documents ADD COLUMN IF NOT EXISTS document_subtype TEXT DEFAULT 'docs';
ALTER TABLE collaborative_documents ADD COLUMN IF NOT EXISTS share_permission TEXT DEFAULT 'editor'
  CHECK (share_permission IN ('viewer', 'editor'));

CREATE TABLE IF NOT EXISTS collaborative_documents_init (
    document_id UUID REFERENCES collaborative_documents(id) ON DELETE CASCADE,
    init_data BYTEA,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(document_id)
);

CREATE TABLE IF NOT EXISTS collaborative_document_folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    parent_id UUID REFERENCES collaborative_document_folders(id) ON DELETE CASCADE,
    created_by UUID REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE collaborative_documents
    ADD CONSTRAINT fk_folder
    FOREIGN KEY (folder_id) REFERENCES collaborative_document_folders(id)
    ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS yjs_document_updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL,
    update_data BYTEA NOT NULL,
    client_id BIGINT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS yjs_document_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL,
    snapshot_data BYTEA NOT NULL,
    version INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id, version)
);

ALTER TABLE yjs_document_snapshots ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE yjs_document_snapshots ADD COLUMN IF NOT EXISTS is_auto_save BOOLEAN DEFAULT TRUE;
ALTER TABLE yjs_document_snapshots ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 6: NOTEBOOKS
-- Notebook collections, public access, and usage logging
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notebook_collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    settings JSONB DEFAULT '{}',
    document_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS notebook_collection_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collection_id UUID REFERENCES notebook_collections(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    added_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    UNIQUE(collection_id, document_id)
);

CREATE TABLE IF NOT EXISTS notebook_public_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collection_id UUID REFERENCES notebook_collections(id) ON DELETE CASCADE,
    access_token TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS notebook_usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collection_id UUID REFERENCES notebook_collections(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    question TEXT NOT NULL,
    answer_length INTEGER,
    response_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT
);


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 7: GENERATORS & PROMPTS
-- Custom generators, custom prompts, and saved items
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS custom_generators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    title TEXT,
    contact_email TEXT,
    prompt TEXT NOT NULL,
    form_schema JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    usage_count INTEGER DEFAULT 0,
    settings JSONB DEFAULT '{}',
    UNIQUE(slug),
    UNIQUE(user_id, slug)
);

CREATE TABLE IF NOT EXISTS custom_generator_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    custom_generator_id UUID NOT NULL REFERENCES custom_generators(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(custom_generator_id, document_id)
);

CREATE TABLE IF NOT EXISTS saved_generators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    generator_id UUID NOT NULL REFERENCES custom_generators(id) ON DELETE CASCADE,
    saved_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, generator_id)
);

CREATE TABLE IF NOT EXISTS custom_prompts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    prompt TEXT NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    embedding_id TEXT,
    embedding_hash TEXT,
    vector_indexed_at TIMESTAMPTZ,
    UNIQUE(slug),
    UNIQUE(user_id, slug)
);

CREATE TABLE IF NOT EXISTS saved_prompts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    prompt_id UUID NOT NULL REFERENCES custom_prompts(id) ON DELETE CASCADE,
    saved_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, prompt_id)
);

-- System prompts: Run `npx ts-node scripts/seedSystemPrompts.ts` to seed prompts into Postgres + Qdrant


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 8: TEMPLATES & LIKES
-- User templates and template likes/favorites
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT DEFAULT 'template',
    title TEXT NOT NULL,
    description TEXT,
    template_type TEXT DEFAULT 'canva',
    external_url TEXT,
    thumbnail_url TEXT,
    images JSONB DEFAULT '[]',
    categories JSONB DEFAULT '[]',
    tags JSONB DEFAULT '[]',
    content_data JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    is_private BOOLEAN DEFAULT TRUE,
    is_example BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'published',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_template_status CHECK (status IN ('published', 'draft', 'archived', 'private', 'public', 'enabled', 'active'))
);

CREATE TABLE IF NOT EXISTS template_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    template_id TEXT NOT NULL,
    template_type TEXT NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, template_id)
);


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 9: MEDIA & SHARING
-- Unified media sharing, sharepics, and user uploads
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_sharepics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    image_url TEXT,
    title TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS user_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT,
    file_path TEXT,
    file_size BIGINT,
    mime_type TEXT,
    upload_status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 10: FEATURE TABLES
-- Feature-specific tables: sites, subtitler, antraege, etc.
-- ════════════════════════════════════════════════════════════════════════════

-- Web-Visitenkarte (user sites)
CREATE TABLE IF NOT EXISTS user_sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    subdomain TEXT UNIQUE NOT NULL,
    is_published BOOLEAN DEFAULT FALSE,
    site_title TEXT NOT NULL,
    tagline TEXT,
    bio TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    contact_website TEXT,
    social_links JSONB DEFAULT '{}',
    theme TEXT DEFAULT 'gruene',
    accent_color TEXT DEFAULT '#46962b',
    profile_image TEXT,
    background_image TEXT,
    sections JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_published TIMESTAMPTZ,
    visit_count INTEGER DEFAULT 0,
    meta_description TEXT,
    meta_keywords TEXT[]
);

-- Subtitler projects
CREATE TABLE IF NOT EXISTS subtitler_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'saved' CHECK (status IN ('draft', 'saved', 'exported')),
    video_path TEXT NOT NULL,
    video_filename TEXT NOT NULL,
    video_size BIGINT NOT NULL,
    video_metadata JSONB DEFAULT '{}',
    thumbnail_path TEXT,
    subtitled_video_path TEXT,
    subtitles TEXT,
    style_preference TEXT DEFAULT 'standard',
    height_preference TEXT DEFAULT 'standard',
    mode_preference TEXT DEFAULT 'manual',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_edited_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    export_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subtitler_shared_videos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES subtitler_projects(id) ON DELETE SET NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    share_token VARCHAR(32) UNIQUE NOT NULL,
    video_path TEXT,
    video_filename TEXT,
    title TEXT,
    thumbnail_path TEXT,
    duration DECIMAL,
    expires_at TIMESTAMPTZ NOT NULL,
    download_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'ready' CHECK (status IN ('rendering', 'ready', 'failed')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subtitler_share_downloads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shared_video_id UUID REFERENCES subtitler_shared_videos(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    downloaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT
);

-- Unified media sharing system
CREATE TABLE IF NOT EXISTS shared_media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    share_token VARCHAR(32) UNIQUE NOT NULL,
    media_type VARCHAR(10) NOT NULL CHECK (media_type IN ('video', 'image')),
    title TEXT,
    file_path TEXT,
    file_name TEXT,
    thumbnail_path TEXT,
    file_size BIGINT,
    mime_type TEXT,
    duration DECIMAL,
    project_id UUID REFERENCES subtitler_projects(id) ON DELETE SET NULL,
    image_type TEXT,
    image_metadata JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'ready' CHECK (status IN ('processing', 'ready', 'failed')),
    download_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS is_library_item BOOLEAN DEFAULT TRUE;
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS alt_text TEXT;
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS upload_source TEXT DEFAULT 'upload';
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS original_filename TEXT;
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT FALSE;
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS template_visibility TEXT DEFAULT 'private'
    CHECK (template_visibility IN ('private', 'unlisted', 'public'));
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS template_use_count INTEGER DEFAULT 0;
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS template_creator_name TEXT;
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS original_template_id UUID REFERENCES shared_media(id);

CREATE TABLE IF NOT EXISTS shared_media_downloads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shared_media_id UUID REFERENCES shared_media(id) ON DELETE CASCADE,
    downloader_email TEXT NOT NULL,
    downloaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT
);

-- Antraege (proposals/applications)
CREATE TABLE IF NOT EXISTS antraege (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT,
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

-- User recent form values
CREATE TABLE IF NOT EXISTS user_recent_values (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    field_type TEXT NOT NULL,
    field_value TEXT NOT NULL,
    form_name TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, field_type, field_value)
);


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 11: SYSTEM TABLES
-- Key-value storage, sync tracking, usage stats, generation logs
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS database (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name TEXT NOT NULL,
    record_key TEXT NOT NULL,
    record_value JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT TRUE,
    tags JSONB,
    category TEXT,
    subcategory TEXT,
    priority INTEGER DEFAULT 0,
    expires_at TIMESTAMPTZ,
    access_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    data_type TEXT DEFAULT 'json',
    version INTEGER DEFAULT 1,
    UNIQUE(table_name, record_key, user_id)
);

CREATE TABLE IF NOT EXISTS wolke_sync_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    share_link_id TEXT NOT NULL,
    folder_path TEXT NOT NULL,
    last_sync_at TIMESTAMPTZ,
    files_processed INTEGER DEFAULT 0,
    files_failed INTEGER DEFAULT 0,
    auto_sync_enabled BOOLEAN DEFAULT FALSE,
    sync_status TEXT DEFAULT 'idle',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    context_type TEXT DEFAULT 'personal',
    context_id UUID,
    synced_by_user_id UUID REFERENCES profiles(id),
    UNIQUE(user_id, share_link_id, folder_path)
);

CREATE TABLE IF NOT EXISTS route_usage_stats (
    id SERIAL PRIMARY KEY,
    route_pattern TEXT NOT NULL,
    method TEXT NOT NULL,
    request_count BIGINT DEFAULT 0,
    last_accessed TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(route_pattern, method)
);

CREATE TABLE IF NOT EXISTS generation_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    generation_type TEXT NOT NULL,
    platform TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    tokens_used INTEGER,
    success BOOLEAN DEFAULT TRUE
);


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 12: INDEXES
-- All indexes grouped by domain for maintainability
-- ════════════════════════════════════════════════════════════════════════════

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_keycloak_id ON profiles(keycloak_id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_locale ON profiles(locale);
CREATE INDEX IF NOT EXISTS idx_profiles_beta_features ON profiles USING GIN (beta_features);

-- Groups indexes
CREATE INDEX IF NOT EXISTS idx_groups_created_by ON groups(created_by);
CREATE INDEX IF NOT EXISTS idx_groups_join_token ON groups(join_token) WHERE join_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_group_memberships_user_id ON group_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_group_memberships_group_id ON group_memberships(group_id);
CREATE INDEX IF NOT EXISTS idx_group_content_shares_group_content ON group_content_shares(group_id, content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_group_content_shares_shared_by ON group_content_shares(shared_by_user_id);
CREATE INDEX IF NOT EXISTS idx_group_instructions_group_id ON group_instructions(group_id);
CREATE INDEX IF NOT EXISTS idx_group_instructions_is_active ON group_instructions(is_active);
CREATE INDEX IF NOT EXISTS idx_group_instructions_group_active ON group_instructions(group_id, is_active);
CREATE INDEX IF NOT EXISTS idx_group_knowledge_group_id ON group_knowledge(group_id);

-- Documents indexes
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
CREATE INDEX IF NOT EXISTS idx_documents_group_id ON documents(group_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_source ON documents(user_id, source_type);
CREATE INDEX IF NOT EXISTS idx_documents_user_status ON documents(user_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_wolke_sync ON documents(user_id, wolke_share_link_id, last_synced_at);
CREATE INDEX IF NOT EXISTS idx_documents_metadata ON documents USING GIN (metadata);

-- User documents indexes
CREATE INDEX IF NOT EXISTS idx_user_documents_user_id ON user_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_documents_tags ON user_documents USING GIN (tags);

-- User knowledge indexes
CREATE INDEX IF NOT EXISTS idx_user_knowledge_user_id ON user_knowledge(user_id);
CREATE INDEX IF NOT EXISTS idx_user_knowledge_user_active ON user_knowledge(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_knowledge_embedding ON user_knowledge(embedding_id) WHERE embedding_id IS NOT NULL;

-- Collaborative documents indexes
CREATE INDEX IF NOT EXISTS idx_collaborative_documents_created_by ON collaborative_documents(created_by);
CREATE INDEX IF NOT EXISTS idx_collaborative_documents_folder ON collaborative_documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_collaborative_documents_deleted ON collaborative_documents(is_deleted);
CREATE INDEX IF NOT EXISTS idx_collaborative_documents_subtype ON collaborative_documents(document_subtype);
CREATE INDEX IF NOT EXISTS idx_collaborative_document_folders_parent ON collaborative_document_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_collaborative_document_folders_created_by ON collaborative_document_folders(created_by);

-- Y.js indexes
CREATE INDEX IF NOT EXISTS idx_yjs_document_updates_document_id ON yjs_document_updates(document_id);
CREATE INDEX IF NOT EXISTS idx_yjs_document_updates_created_at ON yjs_document_updates(created_at);

-- Notebook indexes
CREATE INDEX IF NOT EXISTS idx_notebook_collections_user_id ON notebook_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_notebook_collection_documents_collection_id ON notebook_collection_documents(collection_id);

-- Custom generators indexes
CREATE INDEX IF NOT EXISTS idx_custom_generators_user_id ON custom_generators(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_generators_slug ON custom_generators(slug);
CREATE INDEX IF NOT EXISTS idx_custom_generators_user_slug ON custom_generators(user_id, slug);
CREATE INDEX IF NOT EXISTS idx_custom_generators_form_schema ON custom_generators USING GIN (form_schema);
CREATE INDEX IF NOT EXISTS idx_custom_generators_settings ON custom_generators USING GIN (settings);
CREATE INDEX IF NOT EXISTS idx_custom_generator_documents_generator_id ON custom_generator_documents(custom_generator_id);
CREATE INDEX IF NOT EXISTS idx_custom_generator_documents_document_id ON custom_generator_documents(document_id);
CREATE INDEX IF NOT EXISTS idx_custom_generator_documents_created_at ON custom_generator_documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_generators_user_id ON saved_generators(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_generators_generator_id ON saved_generators(generator_id);

-- Custom prompts indexes
CREATE INDEX IF NOT EXISTS idx_custom_prompts_user_id ON custom_prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_prompts_slug ON custom_prompts(slug);
CREATE INDEX IF NOT EXISTS idx_custom_prompts_user_slug ON custom_prompts(user_id, slug);
CREATE INDEX IF NOT EXISTS idx_custom_prompts_public ON custom_prompts(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_custom_prompts_embedding ON custom_prompts(embedding_id) WHERE embedding_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_saved_prompts_user_id ON saved_prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_prompts_prompt_id ON saved_prompts(prompt_id);

-- Templates indexes
CREATE INDEX IF NOT EXISTS idx_user_templates_user_id ON user_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_user_templates_type ON user_templates(type);
CREATE INDEX IF NOT EXISTS idx_user_templates_is_example ON user_templates(is_example);
CREATE INDEX IF NOT EXISTS idx_user_templates_status ON user_templates(status);
CREATE INDEX IF NOT EXISTS idx_user_templates_user_example ON user_templates(user_id, is_example);
CREATE INDEX IF NOT EXISTS idx_user_templates_metadata ON user_templates USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_user_templates_tags ON user_templates USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_user_templates_categories ON user_templates USING GIN (categories);
CREATE INDEX IF NOT EXISTS idx_template_likes_user_id ON template_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_template_likes_template_id ON template_likes(template_id);
CREATE INDEX IF NOT EXISTS idx_template_likes_popularity ON template_likes(template_id, created_at);

-- Media indexes
CREATE INDEX IF NOT EXISTS idx_user_sharepics_user_id ON user_sharepics(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sharepics_created_at ON user_sharepics(created_at);
CREATE INDEX IF NOT EXISTS idx_user_uploads_user_id ON user_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_user_uploads_status ON user_uploads(upload_status);
CREATE INDEX IF NOT EXISTS idx_user_uploads_created_at ON user_uploads(created_at);
CREATE INDEX IF NOT EXISTS idx_shared_media_token ON shared_media(share_token);
CREATE INDEX IF NOT EXISTS idx_shared_media_user ON shared_media(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_media_user_type ON shared_media(user_id, media_type);
CREATE INDEX IF NOT EXISTS idx_shared_media_user_created ON shared_media(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_media_library ON shared_media(user_id, is_library_item, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_media_templates
    ON shared_media(is_template, template_visibility, created_at DESC)
    WHERE is_template = TRUE;
CREATE INDEX IF NOT EXISTS idx_shared_media_public_templates
    ON shared_media(is_template, template_visibility, image_type, created_at DESC)
    WHERE is_template = TRUE AND template_visibility = 'public';
CREATE INDEX IF NOT EXISTS idx_shared_media_downloads_media ON shared_media_downloads(shared_media_id);

-- Feature tables indexes
CREATE INDEX IF NOT EXISTS idx_user_sites_user_id ON user_sites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sites_subdomain ON user_sites(subdomain);
CREATE INDEX IF NOT EXISTS idx_user_sites_published ON user_sites(is_published);
CREATE INDEX IF NOT EXISTS idx_subtitler_projects_user_id ON subtitler_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_subtitler_projects_user_edited ON subtitler_projects(user_id, last_edited_at DESC);
CREATE INDEX IF NOT EXISTS idx_subtitler_projects_status ON subtitler_projects(status);
CREATE INDEX IF NOT EXISTS idx_subtitler_shared_videos_token ON subtitler_shared_videos(share_token);
CREATE INDEX IF NOT EXISTS idx_subtitler_shared_videos_user ON subtitler_shared_videos(user_id);
CREATE INDEX IF NOT EXISTS idx_subtitler_shared_videos_expires ON subtitler_shared_videos(expires_at);
CREATE INDEX IF NOT EXISTS idx_subtitler_share_downloads_video ON subtitler_share_downloads(shared_video_id);
CREATE INDEX IF NOT EXISTS idx_antraege_user_id ON antraege(user_id);
CREATE INDEX IF NOT EXISTS idx_antraege_status ON antraege(status);
CREATE INDEX IF NOT EXISTS idx_antraege_created_at ON antraege(created_at);
CREATE INDEX IF NOT EXISTS idx_user_recent_values_user_field ON user_recent_values(user_id, field_type);
CREATE INDEX IF NOT EXISTS idx_user_recent_values_created_at ON user_recent_values(created_at);

-- System tables indexes
CREATE INDEX IF NOT EXISTS idx_database_table_key ON database(table_name, record_key);
CREATE INDEX IF NOT EXISTS idx_database_user_id ON database(user_id);
CREATE INDEX IF NOT EXISTS idx_wolke_sync_user ON wolke_sync_status(user_id);
CREATE INDEX IF NOT EXISTS idx_wolke_sync_status ON wolke_sync_status(user_id, sync_status);
CREATE INDEX IF NOT EXISTS idx_wolke_sync_context ON wolke_sync_status(context_type, context_id);
CREATE INDEX IF NOT EXISTS idx_wolke_sync_context_status ON wolke_sync_status(context_type, context_id, sync_status);
CREATE INDEX IF NOT EXISTS idx_route_usage_count ON route_usage_stats(request_count DESC);
CREATE INDEX IF NOT EXISTS idx_route_usage_pattern ON route_usage_stats(route_pattern);
CREATE INDEX IF NOT EXISTS idx_route_usage_last_accessed ON route_usage_stats(last_accessed DESC);
CREATE INDEX IF NOT EXISTS idx_generation_logs_type ON generation_logs(generation_type);
CREATE INDEX IF NOT EXISTS idx_generation_logs_created ON generation_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_generation_logs_user ON generation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_logs_type_created ON generation_logs(generation_type, created_at);


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 13: TRIGGERS
-- All triggers for automatic timestamp updates and cleanup
-- ════════════════════════════════════════════════════════════════════════════

-- Core tables triggers
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Groups triggers
CREATE TRIGGER update_groups_updated_at
    BEFORE UPDATE ON groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_group_instructions_updated_at
    BEFORE UPDATE ON group_instructions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_group_knowledge_updated_at
    BEFORE UPDATE ON group_knowledge
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Documents triggers
CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_documents_updated_at
    BEFORE UPDATE ON user_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_knowledge_updated_at
    BEFORE UPDATE ON user_knowledge
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_grundsatz_documents_updated_at
    BEFORE UPDATE ON grundsatz_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Collaborative editing triggers
CREATE TRIGGER update_collaborative_documents_updated_at
    BEFORE UPDATE ON collaborative_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_collaborative_document_folders_updated_at
    BEFORE UPDATE ON collaborative_document_folders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Notebooks triggers
CREATE TRIGGER update_notebook_collections_updated_at
    BEFORE UPDATE ON notebook_collections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Generators triggers
CREATE TRIGGER update_custom_generators_updated_at
    BEFORE UPDATE ON custom_generators
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_custom_prompts_updated_at
    BEFORE UPDATE ON custom_prompts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Templates triggers
CREATE TRIGGER update_user_templates_updated_at
    BEFORE UPDATE ON user_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Feature tables triggers
CREATE TRIGGER update_user_sites_updated_at
    BEFORE UPDATE ON user_sites
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subtitler_projects_updated_at
    BEFORE UPDATE ON subtitler_projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_antraege_updated_at
    BEFORE UPDATE ON antraege
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER cleanup_recent_values_trigger
    AFTER INSERT ON user_recent_values
    FOR EACH ROW
    EXECUTE FUNCTION cleanup_recent_values();

-- System tables triggers
CREATE TRIGGER update_database_updated_at
    BEFORE UPDATE ON database
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wolke_sync_status_updated_at
    BEFORE UPDATE ON wolke_sync_status
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 14: CHAT SERVICE TABLES
-- Chat threads and messages for the AI chat service
-- ════════════════════════════════════════════════════════════════════════════

-- Chat threads for conversation sessions
CREATE TABLE IF NOT EXISTS chat_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    agent_id VARCHAR(100) NOT NULL DEFAULT 'gruenerator-universal',
    title VARCHAR(255),
    status VARCHAR(20) DEFAULT 'regular',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    -- Auto-compaction fields for managing long conversations
    compaction_summary TEXT,
    compacted_up_to_message_id UUID,
    compaction_updated_at TIMESTAMPTZ
);

-- Add compaction columns if they don't exist (for existing installations)
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS compaction_summary TEXT;
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS compacted_up_to_message_id UUID;
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS compaction_updated_at TIMESTAMPTZ;

-- Add status column for archive support
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'regular';

-- Add foreign key for compacted_up_to_message_id (deferred to avoid circular dependency during creation)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_chat_threads_compacted_message'
    ) THEN
        ALTER TABLE chat_threads
            ADD CONSTRAINT fk_chat_threads_compacted_message
            FOREIGN KEY (compacted_up_to_message_id) REFERENCES chat_messages(id)
            ON DELETE SET NULL;
    END IF;
END $$;

-- Chat messages within threads
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID REFERENCES chat_threads(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT,
    tool_calls JSONB,
    tool_results JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Chat indexes
CREATE INDEX IF NOT EXISTS idx_chat_threads_user_id ON chat_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_updated_at ON chat_threads(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_threads_user_updated ON chat_threads(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_threads_compaction ON chat_threads(id) WHERE compaction_summary IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_threads_status ON chat_threads(user_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_id ON chat_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created ON chat_messages(thread_id, created_at);

-- Chat thread attachments for persistent document context across messages
CREATE TABLE IF NOT EXISTS chat_thread_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID REFERENCES chat_threads(id) ON DELETE CASCADE,
    message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

    -- Metadata
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    is_image BOOLEAN DEFAULT FALSE,

    -- Extracted content
    extracted_text TEXT,          -- Full OCR text (for re-processing)
    summary TEXT,                 -- LLM summary (~200-400 tokens)

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Chat thread attachments indexes
CREATE INDEX IF NOT EXISTS idx_thread_attachments_thread ON chat_thread_attachments(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_attachments_created ON chat_thread_attachments(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thread_attachments_user ON chat_thread_attachments(user_id);

-- Chat triggers
CREATE TRIGGER update_chat_threads_updated_at
    BEFORE UPDATE ON chat_threads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION: MEM0 MEMORY HISTORY (GDPR Compliance & Audit)
-- Tracks all memory operations for user data rights and debugging
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS mem0_memory_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    memory_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('add', 'update', 'delete', 'delete_all')),
    memory_text TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    thread_id UUID REFERENCES chat_threads(id) ON DELETE SET NULL,
    message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL
);

-- Indexes for mem0 memory history
CREATE INDEX IF NOT EXISTS idx_mem0_history_user ON mem0_memory_history(user_id);
CREATE INDEX IF NOT EXISTS idx_mem0_history_memory ON mem0_memory_history(memory_id);
CREATE INDEX IF NOT EXISTS idx_mem0_history_created ON mem0_memory_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mem0_history_operation ON mem0_memory_history(operation);
