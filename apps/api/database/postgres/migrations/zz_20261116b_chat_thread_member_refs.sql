-- Thread-pinned refs per member of a team chat (#5675). The owner keeps using
-- the columns on chat_threads (cloud_file_refs, notebook_source_refs,
-- mention_refs, last_mcp_server_id); every other writer of the thread gets
-- its own row here, so a member's Wolke file, notebook source, @mention or
-- connector carries over to their next turn without touching the owner's.
CREATE TABLE IF NOT EXISTS chat_thread_member_refs (
    thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    cloud_file_refs JSONB,
    notebook_source_refs JSONB,
    mention_refs JSONB,
    last_mcp_server_id TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (thread_id, user_id)
);
