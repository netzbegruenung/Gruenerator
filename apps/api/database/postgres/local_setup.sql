-- Local PostgreSQL setup for Grünerator dual-mode document management
-- Run this after creating the gruenerator database

-- Enable UUID extension for ID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (users) with document_mode column
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
    canva_access_token TEXT,
    canva_refresh_token TEXT,
    canva_token_expires_at TIMESTAMPTZ,
    canva_user_id TEXT,
    canva_display_name TEXT,
    canva_email TEXT,
    canva_scopes JSONB DEFAULT '[]',
    canva_team_id TEXT,
    groups_enabled BOOLEAN DEFAULT FALSE,
    custom_generators BOOLEAN DEFAULT FALSE,
    database_access BOOLEAN DEFAULT FALSE,
    collab BOOLEAN DEFAULT FALSE,
    qa BOOLEAN DEFAULT FALSE,
    sharepic BOOLEAN DEFAULT FALSE,
    anweisungen BOOLEAN DEFAULT FALSE,
    chat_color TEXT,
    nextcloud_share_links JSONB DEFAULT '[]',
    document_mode TEXT DEFAULT 'manual'
);

-- Documents table with dual-mode support (vectors-only, no file storage)
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
    -- New columns for dual-mode support
    source_type TEXT DEFAULT 'manual',
    wolke_share_link_id TEXT,
    wolke_file_path TEXT,
    wolke_etag TEXT,
    vector_count INTEGER DEFAULT 0,
    last_synced_at TIMESTAMPTZ
);

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
    UNIQUE(user_id, share_link_id, folder_path)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_keycloak_id ON profiles(keycloak_id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);

-- Performance indexes for dual-mode document management
CREATE INDEX IF NOT EXISTS idx_documents_user_source ON documents(user_id, source_type);
CREATE INDEX IF NOT EXISTS idx_documents_user_status ON documents(user_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_wolke_sync ON documents(user_id, wolke_share_link_id, last_synced_at);
CREATE INDEX IF NOT EXISTS idx_wolke_sync_user ON wolke_sync_status(user_id);
CREATE INDEX IF NOT EXISTS idx_wolke_sync_status ON wolke_sync_status(user_id, sync_status);

-- JSONB indexes for better JSON query performance
CREATE INDEX IF NOT EXISTS idx_profiles_beta_features ON profiles USING GIN (beta_features);
CREATE INDEX IF NOT EXISTS idx_documents_metadata ON documents USING GIN (metadata);

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

CREATE TRIGGER update_wolke_sync_status_updated_at 
    BEFORE UPDATE ON wolke_sync_status 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Success message
SELECT 'Local PostgreSQL setup complete! Tables created for dual-mode document management.' AS status;