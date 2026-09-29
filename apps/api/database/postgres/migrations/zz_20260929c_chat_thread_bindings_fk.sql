-- chat_thread_canvases / chat_thread_reels were created without a foreign key
-- on thread_id, so deleting a thread left its bindings behind (#3847). Drop the
-- orphans first: ADD CONSTRAINT fails on an instance that already has some.
DELETE FROM chat_thread_canvases b
WHERE NOT EXISTS (SELECT 1 FROM chat_threads t WHERE t.id = b.thread_id);

DELETE FROM chat_thread_reels b
WHERE NOT EXISTS (SELECT 1 FROM chat_threads t WHERE t.id = b.thread_id);

ALTER TABLE chat_thread_canvases DROP CONSTRAINT IF EXISTS chat_thread_canvases_thread_fk;
ALTER TABLE chat_thread_canvases
  ADD CONSTRAINT chat_thread_canvases_thread_fk
  FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE;

ALTER TABLE chat_thread_reels DROP CONSTRAINT IF EXISTS chat_thread_reels_thread_fk;
ALTER TABLE chat_thread_reels
  ADD CONSTRAINT chat_thread_reels_thread_fk
  FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE;
