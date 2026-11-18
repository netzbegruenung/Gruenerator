-- chat_messages: Indizes für Thread-Liste und Nachrichtenverlauf nachtragen.
--
-- schema.sql deklariert diese drei Indizes seit 98e45db73f (2026-02-06), aber
-- keine Migration hat sie je angelegt, und schema.sql läuft nur auf einer
-- frischen Instanz. Jede ältere Datenbank (oder ein Dump davon) hat sie nicht:
-- die LATERAL-Abfrage "letzte Nachricht je Thread" in
-- routes/chat/threadsContractRouter.ts liest dort chat_messages einmal pro
-- Thread komplett (lokal ~7 s bei 4.906 Threads). Kein CONCURRENTLY, weil der
-- Runner jede Datei in einer Transaktion ausführt.

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_id ON chat_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created ON chat_messages(thread_id, created_at);
