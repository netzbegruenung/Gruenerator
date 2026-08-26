-- Trägt fk_chat_threads_compacted_message für gewachsene Datenbanken nach.
--
-- In schema.sql stand der Constraint jahrelang VOR `CREATE TABLE chat_messages`
-- und ist deshalb auf jeder frisch aufgesetzten Instanz mit
-- `relation "chat_messages" does not exist` gescheitert (siehe #2894). Die
-- Reihenfolge in schema.sql ist repariert — das hilft aber nur Neuinstallationen:
-- der DO-Block prüft auf den Constraint-Namen und ist auf einer Alt-DB, in der er
-- fehlt, kein zweites Mal im Bootpfad. Diese Migration schliesst die Lücke.
--
-- Der Dateiname beginnt mit `zz_`, weil der Läufer die Migrationen rein
-- lexikographisch sortiert (PostgresService/migrations.ts:50-53). Der Constraint
-- setzt chat_messages voraus, also muss diese Datei ans Ende der Liste.
--
-- Idempotent: dieselbe Existenzprüfung wie in schema.sql, zusätzlich abgesichert
-- gegen fehlende Tabellen (auf einer Instanz ohne geladenes Basisschema soll die
-- Migration ein No-op sein und nicht scheitern).
--
-- Die Transaktion verwaltet der Migrations-Läufer — kein BEGIN/COMMIT.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'chat_messages'
    ) THEN
        RAISE NOTICE 'chat_messages fehlt — fk_chat_threads_compacted_message wird übersprungen';
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'chat_threads'
          AND column_name = 'compacted_up_to_message_id'
    ) THEN
        RAISE NOTICE 'chat_threads.compacted_up_to_message_id fehlt — Constraint wird übersprungen';
        RETURN;
    END IF;

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
