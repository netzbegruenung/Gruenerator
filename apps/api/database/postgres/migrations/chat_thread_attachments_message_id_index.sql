CREATE INDEX IF NOT EXISTS idx_thread_attachments_message_id
  ON chat_thread_attachments(message_id);
