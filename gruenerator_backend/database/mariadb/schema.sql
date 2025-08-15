-- Grünerator Database Schema for MariaDB
-- Converted from PostgreSQL schema with MariaDB-specific optimizations

-- Profiles table (users)
CREATE TABLE IF NOT EXISTS profiles (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
    last_login TIMESTAMP NULL,
    email TEXT,
    custom_universal_prompt TEXT,
    custom_gruenejugend_prompt TEXT,
    memory_enabled BOOLEAN DEFAULT FALSE,
    igel_modus BOOLEAN DEFAULT FALSE,
    beta_features JSON DEFAULT ('{}'),
    presseabbinder TEXT,
    custom_antrag_gliederung TEXT,
    auth_source TEXT,
    bundestag_api_enabled BOOLEAN DEFAULT FALSE,
    canva_access_token TEXT,
    canva_refresh_token TEXT,
    canva_token_expires_at TIMESTAMP NULL,
    canva_user_id TEXT,
    canva_display_name TEXT,
    canva_email TEXT,
    canva_scopes JSON DEFAULT ('[]'),
    canva_team_id TEXT,
    groups_enabled BOOLEAN DEFAULT FALSE,
    custom_generators BOOLEAN DEFAULT FALSE,
    database_access BOOLEAN DEFAULT FALSE,
    you_generator BOOLEAN DEFAULT FALSE,
    collab BOOLEAN DEFAULT FALSE,
    qa BOOLEAN DEFAULT FALSE,
    sharepic BOOLEAN DEFAULT FALSE,
    anweisungen BOOLEAN DEFAULT FALSE,
    chat_color TEXT,
    memory BOOLEAN DEFAULT FALSE,
    nextcloud_share_links JSON DEFAULT ('[]')
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36),
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_path TEXT,
    file_size BIGINT NOT NULL,
    page_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    ocr_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    ocr_method TEXT DEFAULT 'tesseract',
    source_url TEXT,
    document_type TEXT DEFAULT 'upload',
    metadata JSON,
    markdown_content TEXT,
    group_id CHAR(36),
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL
);

-- Document daily versions for tracking
CREATE TABLE IF NOT EXISTS document_daily_versions (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    document_id CHAR(36),
    version_date DATE NOT NULL,
    content_snapshot TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSON,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Groups table
CREATE TABLE IF NOT EXISTS groups (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name TEXT NOT NULL,
    description TEXT,
    created_by CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    group_type TEXT DEFAULT 'standard',
    settings JSON DEFAULT ('{}'),
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
);

-- Group memberships
CREATE TABLE IF NOT EXISTS group_memberships (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    group_id CHAR(36),
    user_id CHAR(36),
    role TEXT DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    UNIQUE KEY unique_group_user (group_id, user_id)
);

-- Group content shares
CREATE TABLE IF NOT EXISTS group_content_shares (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    group_id CHAR(36),
    shared_by CHAR(36),
    content_type TEXT NOT NULL,
    content_id CHAR(36) NOT NULL,
    share_permissions JSON DEFAULT ('{}'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (shared_by) REFERENCES profiles(id) ON DELETE SET NULL
);

-- Group instructions
CREATE TABLE IF NOT EXISTS group_instructions (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    group_id CHAR(36),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_by CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
);

-- Group knowledge base
CREATE TABLE IF NOT EXISTS group_knowledge (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    group_id CHAR(36),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags JSON,
    created_by CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
);

-- Collaborative documents
CREATE TABLE IF NOT EXISTS collaborative_documents (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    title TEXT NOT NULL,
    content TEXT,
    created_by CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_edited_by CHAR(36),
    is_public BOOLEAN DEFAULT FALSE,
    permissions JSON DEFAULT ('{}'),
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL,
    FOREIGN KEY (last_edited_by) REFERENCES profiles(id) ON DELETE SET NULL
);

-- Collaborative documents initialization data
CREATE TABLE IF NOT EXISTS collaborative_documents_init (
    document_id CHAR(36) PRIMARY KEY,
    init_data BLOB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES collaborative_documents(id) ON DELETE CASCADE
);

-- Y.js document updates for collaborative editing
CREATE TABLE IF NOT EXISTS yjs_document_updates (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    document_id CHAR(36) NOT NULL,
    update_data BLOB NOT NULL,
    client_id BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 0
);

-- Y.js document snapshots
CREATE TABLE IF NOT EXISTS yjs_document_snapshots (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    document_id CHAR(36) NOT NULL,
    snapshot_data BLOB NOT NULL,
    version INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_document_version (document_id, version)
);

-- QA Collections
CREATE TABLE IF NOT EXISTS qa_collections (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    settings JSON DEFAULT ('{}'),
    document_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- QA Collection Documents
CREATE TABLE IF NOT EXISTS qa_collection_documents (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    collection_id CHAR(36),
    document_id CHAR(36),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    added_by CHAR(36),
    FOREIGN KEY (collection_id) REFERENCES qa_collections(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (added_by) REFERENCES profiles(id) ON DELETE SET NULL,
    UNIQUE KEY unique_collection_document (collection_id, document_id)
);

-- QA Public Access
CREATE TABLE IF NOT EXISTS qa_public_access (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    collection_id CHAR(36),
    access_token TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    created_by CHAR(36),
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (collection_id) REFERENCES qa_collections(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
);

-- QA Usage Logs
CREATE TABLE IF NOT EXISTS qa_usage_logs (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    collection_id CHAR(36),
    user_id CHAR(36),
    question TEXT NOT NULL,
    answer_length INTEGER,
    response_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    FOREIGN KEY (collection_id) REFERENCES qa_collections(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL
);

-- User Documents (custom user content)
CREATE TABLE IF NOT EXISTS user_documents (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    document_type TEXT DEFAULT 'text',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    tags JSON,
    metadata JSON DEFAULT ('{}'),
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- User Document Metadata
CREATE TABLE IF NOT EXISTS user_document_metadata (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    document_id CHAR(36),
    metadata_key TEXT NOT NULL,
    metadata_value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES user_documents(id) ON DELETE CASCADE
);

-- User Knowledge Base
CREATE TABLE IF NOT EXISTS user_knowledge (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    knowledge_type TEXT DEFAULT 'general',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    tags JSON,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- Custom Generators
CREATE TABLE IF NOT EXISTS custom_generators (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36),
    name TEXT NOT NULL,
    description TEXT,
    prompt_template TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    usage_count INTEGER DEFAULT 0,
    settings JSON DEFAULT ('{}'),
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- Memories (for AI memory feature)
CREATE TABLE IF NOT EXISTS memories (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36),
    memory_content TEXT NOT NULL,
    memory_type TEXT DEFAULT 'conversation',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    importance_score DECIMAL(3,2) DEFAULT 0.5,
    tags JSON,
    metadata JSON DEFAULT ('{}'),
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- General database table (for misc key-value storage)
CREATE TABLE IF NOT EXISTS `database` (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    table_name TEXT NOT NULL,
    record_key TEXT NOT NULL,
    record_value JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    metadata JSON,
    user_id CHAR(36),
    is_active BOOLEAN DEFAULT TRUE,
    tags JSON,
    category TEXT,
    subcategory TEXT,
    priority INTEGER DEFAULT 0,
    expires_at TIMESTAMP NULL,
    access_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP NULL,
    created_by CHAR(36),
    data_type TEXT DEFAULT 'json',
    version INTEGER DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL,
    UNIQUE KEY unique_table_key_user (table_name(100), record_key(100), user_id)
);

-- Grundsatz Documents (political documents)
CREATE TABLE IF NOT EXISTS grundsatz_documents (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email(100));
CREATE INDEX IF NOT EXISTS idx_profiles_keycloak_id ON profiles(keycloak_id(100));
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username(100));

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status(20));
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
CREATE INDEX IF NOT EXISTS idx_documents_group_id ON documents(group_id);

CREATE INDEX IF NOT EXISTS idx_group_memberships_user_id ON group_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_group_memberships_group_id ON group_memberships(group_id);

CREATE INDEX IF NOT EXISTS idx_qa_collections_user_id ON qa_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_qa_collection_documents_collection_id ON qa_collection_documents(collection_id);

CREATE INDEX IF NOT EXISTS idx_yjs_document_updates_document_id ON yjs_document_updates(document_id);
CREATE INDEX IF NOT EXISTS idx_yjs_document_updates_created_at ON yjs_document_updates(created_at);

CREATE INDEX IF NOT EXISTS idx_collaborative_documents_created_by ON collaborative_documents(created_by);

CREATE INDEX IF NOT EXISTS idx_user_documents_user_id ON user_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_generators_user_id ON custom_generators(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);

CREATE INDEX IF NOT EXISTS idx_database_table_key ON `database`(table_name(100), record_key(100));
CREATE INDEX IF NOT EXISTS idx_database_user_id ON `database`(user_id);