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
    memory_enabled BOOLEAN DEFAULT FALSE,
    igel_modus BOOLEAN DEFAULT FALSE,
    beta_features JSONB DEFAULT '{}',
    presseabbinder TEXT,
    custom_antrag_gliederung TEXT,
    auth_source TEXT,
    bundestag_api_enabled BOOLEAN DEFAULT FALSE,
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
    you_generator BOOLEAN DEFAULT FALSE,
    collab BOOLEAN DEFAULT FALSE,
    qa BOOLEAN DEFAULT FALSE,
    sharepic BOOLEAN DEFAULT FALSE,
    anweisungen BOOLEAN DEFAULT FALSE,
    chat_color TEXT,
    memory BOOLEAN DEFAULT FALSE,
    content_management BOOLEAN DEFAULT FALSE,
    nextcloud_share_links JSONB DEFAULT '[]',
    -- Document mode preference
    document_mode TEXT DEFAULT 'manual' -- 'manual' or 'wolke'
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
    source_type TEXT DEFAULT 'manual', -- 'manual' or 'wolke'
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

-- Group instructions
CREATE TABLE IF NOT EXISTS group_instructions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    custom_antrag_prompt TEXT DEFAULT '',
    custom_social_prompt TEXT DEFAULT '',
    antrag_instructions_enabled BOOLEAN DEFAULT FALSE,
    social_instructions_enabled BOOLEAN DEFAULT FALSE,
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

-- QA Collections
CREATE TABLE IF NOT EXISTS qa_collections (
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

-- QA Collection Documents
CREATE TABLE IF NOT EXISTS qa_collection_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collection_id UUID REFERENCES qa_collections(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    added_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    UNIQUE(collection_id, document_id)
);

-- QA Public Access
CREATE TABLE IF NOT EXISTS qa_public_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collection_id UUID REFERENCES qa_collections(id) ON DELETE CASCADE,
    access_token TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE
);

-- QA Usage Logs
CREATE TABLE IF NOT EXISTS qa_usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collection_id UUID REFERENCES qa_collections(id) ON DELETE CASCADE,
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

-- Memories (for AI memory feature)
CREATE TABLE IF NOT EXISTS memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    memory_content TEXT NOT NULL,
    memory_type TEXT DEFAULT 'conversation',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    importance_score DECIMAL(3,2) DEFAULT 0.5,
    tags JSONB,
    metadata JSONB DEFAULT '{}'
);

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

CREATE INDEX IF NOT EXISTS idx_qa_collections_user_id ON qa_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_qa_collection_documents_collection_id ON qa_collection_documents(collection_id);

CREATE INDEX IF NOT EXISTS idx_yjs_document_updates_document_id ON yjs_document_updates(document_id);
CREATE INDEX IF NOT EXISTS idx_yjs_document_updates_created_at ON yjs_document_updates(created_at);

CREATE INDEX IF NOT EXISTS idx_collaborative_documents_created_by ON collaborative_documents(created_by);

CREATE INDEX IF NOT EXISTS idx_user_documents_user_id ON user_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_generators_user_id ON custom_generators(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_generators_slug ON custom_generators(slug);
CREATE INDEX IF NOT EXISTS idx_custom_generators_user_slug ON custom_generators(user_id, slug);
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

CREATE TRIGGER update_qa_collections_updated_at 
    BEFORE UPDATE ON qa_collections 
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