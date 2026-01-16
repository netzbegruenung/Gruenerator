-- Grünerator Database Schema for PostgreSQL
-- Converted from SQLite schema with PostgreSQL-specific optimizations

-- Enable UUID extension for ID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    first_name TEXT,
    last_name TEXT,
    display_name TEXT,
    avatar_url TEXT,
    custom_antrag_prompt TEXT,
    custom_social_prompt TEXT,
    deutschlandmodus BOOLEAN DEFAULT FALSE,
    is_admin BOOLEAN DEFAULT FALSE,
    profile_image INTEGER DEFAULT 1,
    avatar_robot_id INTEGER DEFAULT 1,
    keycloak_id TEXT,
    username TEXT,
    last_login TIMESTAMPTZ,
    email TEXT,
    custom_universal_prompt TEXT,
    custom_gruenejugend_prompt TEXT,
    custom_rede_prompt TEXT,
    custom_buergeranfragen_prompt TEXT,
    custom_prompt TEXT,
    igel_modus BOOLEAN DEFAULT FALSE,
    beta_features JSONB DEFAULT '{}',
    presseabbinder TEXT,
    custom_antrag_gliederung TEXT,
    auth_source TEXT,
    locale TEXT DEFAULT 'de-DE' CHECK (locale IN ('de-DE', 'de-AT')),
    canva_access_token TEXT,
    canva_refresh_token TEXT,
    canva_token_expires_at TIMESTAMPTZ,
    canva_user_id TEXT,
    canva_display_name TEXT,
    canva_email TEXT,
    canva_scopes JSONB DEFAULT '[]',
    canva_team_id TEXT,
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
    canva BOOLEAN DEFAULT FALSE,
    labor_enabled BOOLEAN DEFAULT FALSE,
    sites BOOLEAN DEFAULT FALSE,
    chat BOOLEAN DEFAULT FALSE,
    website BOOLEAN DEFAULT FALSE,
    ai_sharepic BOOLEAN DEFAULT FALSE,
    vorlagen BOOLEAN DEFAULT FALSE,
    video_editor BOOLEAN DEFAULT FALSE,
    interactive_antrag_enabled BOOLEAN DEFAULT TRUE,
    nextcloud_share_links JSONB DEFAULT '[]',
    -- Document mode preference
    document_mode TEXT DEFAULT 'manual', -- 'manual' or 'wolke'
    -- Export auto-save preference
    auto_save_on_export BOOLEAN DEFAULT FALSE,
    -- User defaults for generator-specific preferences
    user_defaults JSONB DEFAULT '{}'
);

-- Groups table (moved before documents to fix foreign key constraint)
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
    -- Wolke integration for groups
    wolke_share_links JSONB DEFAULT '[]'
);

-- Documents table (updated for dual-mode support)
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
    -- New columns for dual-mode support
    source_type TEXT DEFAULT 'manual', -- 'manual', 'wolke', or 'url'
    wolke_share_link_id TEXT,
    wolke_file_path TEXT,
    wolke_etag TEXT,
    vector_count INTEGER DEFAULT 0,
    last_synced_at TIMESTAMPTZ,
    -- Group Wolke integration
    group_wolke_share_id TEXT -- Reference to group's wolke share link
);

-- Document daily versions for tracking
CREATE TABLE IF NOT EXISTS document_daily_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    version_date DATE NOT NULL,
    content_snapshot TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

-- Group memberships
CREATE TABLE IF NOT EXISTS group_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(group_id, user_id)
);

-- Group content shares
CREATE TABLE IF NOT EXISTS group_content_shares (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    shared_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    content_type TEXT NOT NULL,
    content_id UUID NOT NULL,
    permissions JSONB DEFAULT '{}',
    shared_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Group instructions (simplified - only unified custom_prompt)
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

-- Group knowledge base
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

-- Collaborative documents
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

-- Collaborative documents initialization data
CREATE TABLE IF NOT EXISTS collaborative_documents_init (
    document_id UUID REFERENCES collaborative_documents(id) ON DELETE CASCADE,
    init_data BYTEA,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(document_id)
);

-- Y.js document updates for collaborative editing
CREATE TABLE IF NOT EXISTS yjs_document_updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL,
    update_data BYTEA NOT NULL,
    client_id BIGINT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 0
);

-- Y.js document snapshots
CREATE TABLE IF NOT EXISTS yjs_document_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL,
    snapshot_data BYTEA NOT NULL,
    version INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id, version)
);

-- Notebook Collections
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

-- Notebook Collection Documents
CREATE TABLE IF NOT EXISTS notebook_collection_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collection_id UUID REFERENCES notebook_collections(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    added_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    UNIQUE(collection_id, document_id)
);

-- Notebook Public Access
CREATE TABLE IF NOT EXISTS notebook_public_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collection_id UUID REFERENCES notebook_collections(id) ON DELETE CASCADE,
    access_token TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE
);

-- Notebook Usage Logs
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

-- User Documents (custom user content)
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

-- User Document Metadata
CREATE TABLE IF NOT EXISTS user_document_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES user_documents(id) ON DELETE CASCADE,
    metadata_key TEXT NOT NULL,
    metadata_value TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- User Knowledge Base
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
    -- Vector embedding tracking for Qdrant integration
    embedding_id TEXT, -- Reference to Qdrant point ID
    embedding_hash TEXT, -- Hash of content to detect changes
    vector_indexed_at TIMESTAMPTZ -- When vectors were last updated
);

-- Custom Generators
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

-- Custom Generator Documents Junction Table
-- This creates the many-to-many relationship between custom generators and documents
CREATE TABLE IF NOT EXISTS custom_generator_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    custom_generator_id UUID NOT NULL REFERENCES custom_generators(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Ensure unique combination of generator + document
    UNIQUE(custom_generator_id, document_id)
);

-- Saved Generators Junction Table
-- Users can save other users' generators to their profile (read-only access)
CREATE TABLE IF NOT EXISTS saved_generators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    generator_id UUID NOT NULL REFERENCES custom_generators(id) ON DELETE CASCADE,
    saved_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Ensure user can only save a generator once
    UNIQUE(user_id, generator_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_generators_user_id ON saved_generators(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_generators_generator_id ON saved_generators(generator_id);

-- Template Likes (Users can like/favorite templates for ranking)
CREATE TABLE IF NOT EXISTS template_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    template_id TEXT NOT NULL,  -- Supports both UUID (user templates) and string IDs (system templates)
    template_type TEXT NOT NULL DEFAULT 'system',  -- 'user' | 'system' | 'file'
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Ensure user can only like a template once
    UNIQUE(user_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_template_likes_user_id ON template_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_template_likes_template_id ON template_likes(template_id);
CREATE INDEX IF NOT EXISTS idx_template_likes_popularity ON template_likes(template_id, created_at);

-- User Templates (Canva templates and other user templates)
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

-- General database table (for misc key-value storage)
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

-- Grundsatz Documents (political documents)
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_keycloak_id ON profiles(keycloak_id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_locale ON profiles(locale);

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
CREATE INDEX IF NOT EXISTS idx_documents_group_id ON documents(group_id);

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

CREATE INDEX IF NOT EXISTS idx_notebook_collections_user_id ON notebook_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_notebook_collection_documents_collection_id ON notebook_collection_documents(collection_id);

CREATE INDEX IF NOT EXISTS idx_yjs_document_updates_document_id ON yjs_document_updates(document_id);
CREATE INDEX IF NOT EXISTS idx_yjs_document_updates_created_at ON yjs_document_updates(created_at);

CREATE INDEX IF NOT EXISTS idx_collaborative_documents_created_by ON collaborative_documents(created_by);

CREATE INDEX IF NOT EXISTS idx_user_documents_user_id ON user_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_generators_user_id ON custom_generators(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_generators_slug ON custom_generators(slug);
CREATE INDEX IF NOT EXISTS idx_custom_generators_user_slug ON custom_generators(user_id, slug);
CREATE INDEX IF NOT EXISTS idx_custom_generator_documents_generator_id ON custom_generator_documents(custom_generator_id);
CREATE INDEX IF NOT EXISTS idx_custom_generator_documents_document_id ON custom_generator_documents(document_id);
CREATE INDEX IF NOT EXISTS idx_custom_generator_documents_created_at ON custom_generator_documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_user_templates_user_id ON user_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_user_templates_type ON user_templates(type);
CREATE INDEX IF NOT EXISTS idx_user_templates_is_example ON user_templates(is_example);
CREATE INDEX IF NOT EXISTS idx_user_templates_status ON user_templates(status);
CREATE INDEX IF NOT EXISTS idx_user_templates_user_example ON user_templates(user_id, is_example);

CREATE INDEX IF NOT EXISTS idx_database_table_key ON database(table_name, record_key);
CREATE INDEX IF NOT EXISTS idx_database_user_id ON database(user_id);

-- JSONB indexes for better JSON query performance
CREATE INDEX IF NOT EXISTS idx_profiles_beta_features ON profiles USING GIN (beta_features);
CREATE INDEX IF NOT EXISTS idx_documents_metadata ON documents USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_user_documents_tags ON user_documents USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_user_templates_metadata ON user_templates USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_user_templates_tags ON user_templates USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_user_templates_categories ON user_templates USING GIN (categories);
CREATE INDEX IF NOT EXISTS idx_custom_generators_form_schema ON custom_generators USING GIN (form_schema);
CREATE INDEX IF NOT EXISTS idx_custom_generators_settings ON custom_generators USING GIN (settings);

-- Create functions to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to update timestamps
CREATE TRIGGER update_profiles_updated_at 
    BEFORE UPDATE ON profiles 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at 
    BEFORE UPDATE ON documents 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_groups_updated_at 
    BEFORE UPDATE ON groups 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notebook_collections_updated_at
    BEFORE UPDATE ON notebook_collections
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

CREATE TRIGGER update_collaborative_documents_updated_at 
    BEFORE UPDATE ON collaborative_documents 
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

CREATE TRIGGER update_custom_generators_updated_at 
    BEFORE UPDATE ON custom_generators 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_database_updated_at 
    BEFORE UPDATE ON database 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_templates_updated_at 
    BEFORE UPDATE ON user_templates 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_grundsatz_documents_updated_at 
    BEFORE UPDATE ON grundsatz_documents 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Wolke sync tracking table
CREATE TABLE IF NOT EXISTS wolke_sync_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    share_link_id TEXT NOT NULL,
    folder_path TEXT NOT NULL,
    last_sync_at TIMESTAMPTZ,
    files_processed INTEGER DEFAULT 0,
    files_failed INTEGER DEFAULT 0,
    auto_sync_enabled BOOLEAN DEFAULT FALSE,
    sync_status TEXT DEFAULT 'idle', -- 'idle', 'syncing', 'completed', 'failed'
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    -- Context support for both personal and group sync
    context_type TEXT DEFAULT 'personal', -- 'personal' or 'group'
    context_id UUID, -- user_id for personal, group_id for group context
    synced_by_user_id UUID REFERENCES profiles(id), -- who initiated the sync
    UNIQUE(user_id, share_link_id, folder_path)
);

CREATE TRIGGER update_wolke_sync_status_updated_at 
    BEFORE UPDATE ON wolke_sync_status 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Performance indexes for dual-mode document management
CREATE INDEX IF NOT EXISTS idx_documents_user_source ON documents(user_id, source_type);
CREATE INDEX IF NOT EXISTS idx_documents_user_status ON documents(user_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_wolke_sync ON documents(user_id, wolke_share_link_id, last_synced_at);
CREATE INDEX IF NOT EXISTS idx_wolke_sync_user ON wolke_sync_status(user_id);
CREATE INDEX IF NOT EXISTS idx_wolke_sync_status ON wolke_sync_status(user_id, sync_status);
CREATE INDEX IF NOT EXISTS idx_wolke_sync_context ON wolke_sync_status(context_type, context_id);
CREATE INDEX IF NOT EXISTS idx_wolke_sync_context_status ON wolke_sync_status(context_type, context_id, sync_status);

-- Performance indexes for user knowledge
CREATE INDEX IF NOT EXISTS idx_user_knowledge_user_id ON user_knowledge(user_id);
CREATE INDEX IF NOT EXISTS idx_user_knowledge_user_active ON user_knowledge(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_knowledge_embedding ON user_knowledge(embedding_id) WHERE embedding_id IS NOT NULL;

-- Antraege table for proposals/applications
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

-- User sharepics table
CREATE TABLE IF NOT EXISTS user_sharepics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    image_url TEXT,
    title TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

-- User uploads table  
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

-- Indexes for new tables
CREATE INDEX IF NOT EXISTS idx_antraege_user_id ON antraege(user_id);
CREATE INDEX IF NOT EXISTS idx_antraege_status ON antraege(status);
CREATE INDEX IF NOT EXISTS idx_antraege_created_at ON antraege(created_at);

CREATE INDEX IF NOT EXISTS idx_user_sharepics_user_id ON user_sharepics(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sharepics_created_at ON user_sharepics(created_at);

CREATE INDEX IF NOT EXISTS idx_user_uploads_user_id ON user_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_user_uploads_status ON user_uploads(upload_status);
CREATE INDEX IF NOT EXISTS idx_user_uploads_created_at ON user_uploads(created_at);

-- Add triggers for new tables
CREATE TRIGGER update_antraege_updated_at
    BEFORE UPDATE ON antraege
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- User recent values table for storing last N form field inputs
CREATE TABLE IF NOT EXISTS user_recent_values (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    field_type TEXT NOT NULL,
    field_value TEXT NOT NULL,
    form_name TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    -- Prevent duplicate values for same user/field combination
    UNIQUE(user_id, field_type, field_value)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_recent_values_user_field ON user_recent_values(user_id, field_type);
CREATE INDEX IF NOT EXISTS idx_user_recent_values_created_at ON user_recent_values(created_at);

-- Function to maintain only last 5 values per user/field combination
CREATE OR REPLACE FUNCTION cleanup_recent_values()
RETURNS TRIGGER AS $$
BEGIN
    -- Keep only the 5 most recent values for this user/field combination
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

-- Trigger to automatically cleanup old values
CREATE TRIGGER cleanup_recent_values_trigger
    AFTER INSERT ON user_recent_values
    FOR EACH ROW
    EXECUTE FUNCTION cleanup_recent_values();

-- User sites table (Web-Visitenkarte)
CREATE TABLE IF NOT EXISTS user_sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    subdomain TEXT UNIQUE NOT NULL,
    is_published BOOLEAN DEFAULT FALSE,
    -- Basic Info
    site_title TEXT NOT NULL,
    tagline TEXT,
    bio TEXT,
    -- Contact Info
    contact_email TEXT,
    contact_phone TEXT,
    contact_website TEXT,
    -- Social Links
    social_links JSONB DEFAULT '{}',
    -- Visual Settings
    theme TEXT DEFAULT 'gruene',
    accent_color TEXT DEFAULT '#46962b',
    profile_image TEXT,
    background_image TEXT,
    -- Content Sections
    sections JSONB DEFAULT '[]',
    -- Meta
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_published TIMESTAMPTZ,
    visit_count INTEGER DEFAULT 0,
    -- SEO
    meta_description TEXT,
    meta_keywords TEXT[]
);

-- Create indexes for user_sites
CREATE INDEX IF NOT EXISTS idx_user_sites_user_id ON user_sites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sites_subdomain ON user_sites(subdomain);
CREATE INDEX IF NOT EXISTS idx_user_sites_published ON user_sites(is_published);

-- Add sites feature flag to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sites_enabled BOOLEAN DEFAULT TRUE;

-- Add trigger for user_sites updated_at
CREATE TRIGGER update_user_sites_updated_at
    BEFORE UPDATE ON user_sites
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Route usage statistics table
CREATE TABLE IF NOT EXISTS route_usage_stats (
    id SERIAL PRIMARY KEY,
    route_pattern TEXT NOT NULL,
    method TEXT NOT NULL,
    request_count BIGINT DEFAULT 0,
    last_accessed TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(route_pattern, method)
);

CREATE INDEX IF NOT EXISTS idx_route_usage_count ON route_usage_stats(request_count DESC);
CREATE INDEX IF NOT EXISTS idx_route_usage_pattern ON route_usage_stats(route_pattern);
CREATE INDEX IF NOT EXISTS idx_route_usage_last_accessed ON route_usage_stats(last_accessed DESC);

-- Generation logs table for tracking AI content generation
CREATE TABLE IF NOT EXISTS generation_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    generation_type TEXT NOT NULL,
    platform TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    tokens_used INTEGER,
    success BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_generation_logs_type ON generation_logs(generation_type);
CREATE INDEX IF NOT EXISTS idx_generation_logs_created ON generation_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_generation_logs_user ON generation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_logs_type_created ON generation_logs(generation_type, created_at);

-- Subtitler Projects table for persistent video subtitle projects
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

CREATE INDEX IF NOT EXISTS idx_subtitler_projects_user_id ON subtitler_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_subtitler_projects_user_edited ON subtitler_projects(user_id, last_edited_at DESC);
CREATE INDEX IF NOT EXISTS idx_subtitler_projects_status ON subtitler_projects(status);

-- Add trigger for subtitler_projects updated_at
CREATE TRIGGER update_subtitler_projects_updated_at
    BEFORE UPDATE ON subtitler_projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Subtitler Shared Videos table for sharing exported videos with others
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

CREATE INDEX IF NOT EXISTS idx_subtitler_shared_videos_token ON subtitler_shared_videos(share_token);
CREATE INDEX IF NOT EXISTS idx_subtitler_shared_videos_user ON subtitler_shared_videos(user_id);
CREATE INDEX IF NOT EXISTS idx_subtitler_shared_videos_expires ON subtitler_shared_videos(expires_at);

-- Subtitler Share Downloads table for tracking who downloaded shared videos
CREATE TABLE IF NOT EXISTS subtitler_share_downloads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shared_video_id UUID REFERENCES subtitler_shared_videos(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    downloaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_subtitler_share_downloads_video ON subtitler_share_downloads(shared_video_id);

-- ============================================
-- UNIFIED MEDIA SHARING SYSTEM
-- Replaces separate video/image sharing tables
-- ============================================

-- Unified shared media table for both images and videos
CREATE TABLE IF NOT EXISTS shared_media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    share_token VARCHAR(32) UNIQUE NOT NULL,

    -- Media type discrimination
    media_type VARCHAR(10) NOT NULL CHECK (media_type IN ('video', 'image')),

    -- Common fields
    title TEXT,
    file_path TEXT,
    file_name TEXT,
    thumbnail_path TEXT,
    file_size BIGINT,
    mime_type TEXT,

    -- Video-specific fields (NULL for images)
    duration DECIMAL,
    project_id UUID REFERENCES subtitler_projects(id) ON DELETE SET NULL,

    -- Image-specific fields (NULL for videos)
    image_type TEXT,
    image_metadata JSONB DEFAULT '{}',

    -- Processing status
    status VARCHAR(20) DEFAULT 'ready' CHECK (status IN ('processing', 'ready', 'failed')),

    -- Tracking
    download_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes for shared_media
CREATE INDEX IF NOT EXISTS idx_shared_media_token ON shared_media(share_token);
CREATE INDEX IF NOT EXISTS idx_shared_media_user ON shared_media(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_media_user_type ON shared_media(user_id, media_type);
CREATE INDEX IF NOT EXISTS idx_shared_media_user_created ON shared_media(user_id, created_at DESC);

-- Media Library extensions for unified gallery across all apps
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS is_library_item BOOLEAN DEFAULT TRUE;
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS alt_text TEXT;
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS upload_source TEXT DEFAULT 'upload';
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS original_filename TEXT;

-- Template feature columns for canvas editor
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT FALSE;
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS template_visibility TEXT DEFAULT 'private'
    CHECK (template_visibility IN ('private', 'unlisted', 'public'));
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS template_use_count INTEGER DEFAULT 0;
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS template_creator_name TEXT;
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS original_template_id UUID REFERENCES shared_media(id);

-- Media library indexes
CREATE INDEX IF NOT EXISTS idx_shared_media_library ON shared_media(user_id, is_library_item, created_at DESC);

-- Template indexes for efficient discovery
CREATE INDEX IF NOT EXISTS idx_shared_media_templates
    ON shared_media(is_template, template_visibility, created_at DESC)
    WHERE is_template = TRUE;

CREATE INDEX IF NOT EXISTS idx_shared_media_public_templates
    ON shared_media(is_template, template_visibility, image_type, created_at DESC)
    WHERE is_template = TRUE AND template_visibility = 'public';

-- Download tracking table for shared media
CREATE TABLE IF NOT EXISTS shared_media_downloads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shared_media_id UUID REFERENCES shared_media(id) ON DELETE CASCADE,
    downloader_email TEXT NOT NULL,
    downloaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_shared_media_downloads_media ON shared_media_downloads(shared_media_id);

-- ============================================
-- GOOGLE DOCS ALTERNATIVE - COLLABORATIVE DOCUMENTS EXTENSION
-- Extends existing collaborative_documents table for Google Docs-like functionality
-- ============================================

-- Extend existing collaborative_documents table with minimal additions
ALTER TABLE collaborative_documents ADD COLUMN IF NOT EXISTS folder_id UUID;
ALTER TABLE collaborative_documents ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE collaborative_documents ADD COLUMN IF NOT EXISTS document_subtype TEXT DEFAULT 'docs';

-- Create folders table for document organization
CREATE TABLE IF NOT EXISTS collaborative_document_folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    parent_id UUID REFERENCES collaborative_document_folders(id) ON DELETE CASCADE,
    created_by UUID REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE
);

-- Extend yjs_document_snapshots for named versions and version history
ALTER TABLE yjs_document_snapshots ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE yjs_document_snapshots ADD COLUMN IF NOT EXISTS is_auto_save BOOLEAN DEFAULT TRUE;
ALTER TABLE yjs_document_snapshots ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);

-- Add folder foreign key constraint
ALTER TABLE collaborative_documents
    ADD CONSTRAINT fk_folder
    FOREIGN KEY (folder_id) REFERENCES collaborative_document_folders(id)
    ON DELETE SET NULL;

-- Indexes for collaborative documents extension
CREATE INDEX IF NOT EXISTS idx_collaborative_documents_folder ON collaborative_documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_collaborative_documents_deleted ON collaborative_documents(is_deleted);
CREATE INDEX IF NOT EXISTS idx_collaborative_documents_subtype ON collaborative_documents(document_subtype);
CREATE INDEX IF NOT EXISTS idx_collaborative_document_folders_parent ON collaborative_document_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_collaborative_document_folders_created_by ON collaborative_document_folders(created_by);

-- Add trigger for collaborative_document_folders updated_at
CREATE TRIGGER update_collaborative_document_folders_updated_at
    BEFORE UPDATE ON collaborative_document_folders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();