-- Chat Memory System Migration
-- Adds comprehensive memory support for Grünerator Chat based on LangGraph patterns

-- Chat Threads table for short-term memory management
CREATE TABLE IF NOT EXISTS chat_threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    thread_id TEXT NOT NULL, -- External thread identifier for client
    title TEXT,
    status TEXT DEFAULT 'active', -- 'active', 'archived', 'deleted'
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    message_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    -- Memory management settings
    max_messages INTEGER DEFAULT 100,
    summarization_enabled BOOLEAN DEFAULT TRUE,
    summary_content TEXT,
    summary_updated_at TIMESTAMPTZ,
    UNIQUE(user_id, thread_id)
);

-- Chat Messages table for conversation history
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_uuid UUID REFERENCES chat_threads(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL, -- External message identifier
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    -- Message metadata
    token_count INTEGER,
    metadata JSONB DEFAULT '{}',
    -- Tool call information
    tool_calls JSONB,
    tool_call_id TEXT,
    -- Message ordering
    sequence_number INTEGER NOT NULL,
    -- Soft deletion for memory management
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    UNIQUE(thread_uuid, sequence_number)
);

-- Enhanced Memory Store for long-term memory with LangGraph patterns
CREATE TABLE IF NOT EXISTS memory_store (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    -- Namespace structure for memory organization
    namespace_path TEXT NOT NULL, -- e.g., 'user_123.preferences', 'user_123.facts'
    memory_key TEXT NOT NULL, -- Key within namespace
    -- Memory content
    content JSONB NOT NULL,
    memory_type TEXT DEFAULT 'semantic', -- 'semantic', 'episodic', 'procedural'
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    access_count INTEGER DEFAULT 0,
    -- Importance and relevance scoring
    importance_score DECIMAL(3,2) DEFAULT 0.5,
    confidence_score DECIMAL(3,2) DEFAULT 1.0,
    -- Semantic search support
    embedding_vector VECTOR(1536), -- OpenAI text-embedding-3-small dimensions
    embedding_model TEXT DEFAULT 'openai:text-embedding-3-small',
    embedding_updated_at TIMESTAMPTZ,
    -- Tags and metadata
    tags JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    UNIQUE(user_id, namespace_path, memory_key)
);

-- Memory interactions tracking (for episodic memory)
CREATE TABLE IF NOT EXISTS memory_interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    thread_uuid UUID REFERENCES chat_threads(id) ON DELETE SET NULL,
    interaction_type TEXT NOT NULL, -- 'chat', 'generation', 'correction', 'feedback'
    context_data JSONB NOT NULL,
    outcome TEXT, -- 'success', 'failure', 'partial'
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

-- Chat memory configuration per user
CREATE TABLE IF NOT EXISTS chat_memory_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
    -- Short-term memory settings
    max_context_tokens INTEGER DEFAULT 8000,
    message_retention_days INTEGER DEFAULT 30,
    auto_summarize_after INTEGER DEFAULT 50, -- messages
    -- Long-term memory settings
    semantic_memory_enabled BOOLEAN DEFAULT TRUE,
    episodic_memory_enabled BOOLEAN DEFAULT TRUE,
    procedural_memory_enabled BOOLEAN DEFAULT FALSE,
    -- Update frequency
    memory_update_mode TEXT DEFAULT 'hot_path', -- 'hot_path', 'background', 'manual'
    background_update_interval INTEGER DEFAULT 300, -- seconds
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Memory search queries for analytics and improvement
CREATE TABLE IF NOT EXISTS memory_search_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    query_text TEXT NOT NULL,
    namespace_filter TEXT,
    results_count INTEGER DEFAULT 0,
    response_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_threads_user_id ON chat_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_user_thread ON chat_threads(user_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_last_message ON chat_threads(user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_threads_status ON chat_threads(status);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_uuid);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sequence ON chat_messages(thread_uuid, sequence_number);
CREATE INDEX IF NOT EXISTS idx_chat_messages_role ON chat_messages(role);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_active ON chat_messages(thread_uuid, is_deleted) WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_memory_store_user ON memory_store(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_store_namespace ON memory_store(user_id, namespace_path);
CREATE INDEX IF NOT EXISTS idx_memory_store_user_key ON memory_store(user_id, namespace_path, memory_key);
CREATE INDEX IF NOT EXISTS idx_memory_store_type ON memory_store(memory_type);
CREATE INDEX IF NOT EXISTS idx_memory_store_importance ON memory_store(importance_score DESC);
CREATE INDEX IF NOT EXISTS idx_memory_store_access ON memory_store(last_accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_interactions_user ON memory_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_interactions_thread ON memory_interactions(thread_uuid);
CREATE INDEX IF NOT EXISTS idx_memory_interactions_type ON memory_interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_memory_interactions_created ON memory_interactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_search_logs_user ON memory_search_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_search_logs_created ON memory_search_logs(created_at DESC);

-- JSONB indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_chat_threads_metadata ON chat_threads USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_chat_messages_metadata ON chat_messages USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_chat_messages_tool_calls ON chat_messages USING GIN (tool_calls);
CREATE INDEX IF NOT EXISTS idx_memory_store_content ON memory_store USING GIN (content);
CREATE INDEX IF NOT EXISTS idx_memory_store_tags ON memory_store USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_memory_store_metadata ON memory_store USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_memory_interactions_context ON memory_interactions USING GIN (context_data);

-- Vector similarity index for semantic search (if pgvector is available)
-- CREATE INDEX IF NOT EXISTS idx_memory_store_embedding ON memory_store USING ivfflat (embedding_vector vector_cosine_ops);

-- Update triggers for timestamp management
CREATE TRIGGER update_chat_threads_updated_at
    BEFORE UPDATE ON chat_threads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_memory_store_updated_at
    BEFORE UPDATE ON memory_store
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_memory_config_updated_at
    BEFORE UPDATE ON chat_memory_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to update thread message count and last message time
CREATE OR REPLACE FUNCTION update_chat_thread_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE chat_threads
        SET
            message_count = message_count + 1,
            last_message_at = NEW.created_at,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.thread_uuid;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE chat_threads
        SET
            message_count = message_count - 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = OLD.thread_uuid;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to maintain chat thread statistics
CREATE TRIGGER chat_message_stats_trigger
    AFTER INSERT OR DELETE ON chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_thread_stats();

-- Function to update memory access tracking
CREATE OR REPLACE FUNCTION update_memory_access()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_accessed_at = CURRENT_TIMESTAMP;
    NEW.access_count = OLD.access_count + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for memory access tracking (when content is read)
-- This would be triggered by application code via a specific update
-- CREATE TRIGGER memory_access_trigger
--     BEFORE UPDATE OF last_accessed_at ON memory_store
--     FOR EACH ROW
--     EXECUTE FUNCTION update_memory_access();

-- Insert default memory configuration for existing users
INSERT INTO chat_memory_config (user_id)
SELECT id FROM profiles
WHERE id NOT IN (SELECT user_id FROM chat_memory_config WHERE user_id IS NOT NULL)
ON CONFLICT (user_id) DO NOTHING;