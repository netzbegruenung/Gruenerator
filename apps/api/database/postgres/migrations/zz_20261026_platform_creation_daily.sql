-- Anonymous per-day tally of created content, for the instance-admin statistics
-- view (services/usage/adminContentStats.ts, source `counter`).
--
-- Why a counter next to the content tables: counting the tables only sees rows
-- that still exist. Purged trash, hard-deleted rows and deleted accounts drop
-- out of every past month. This table is written at insert time and nothing
-- here ever deletes from it.
--
-- No user id, by design: the row is (day, kind, subtype, country, count). The
-- owner is read once, only to resolve the country, and is not stored.
--
-- Written by triggers rather than by the app, so that no create path — route,
-- MCP tool, import script — can forget it. Notebooks live in Qdrant and call
-- count_platform_creation() from NotebookQdrantHelper.storeNotebookCollection.
--
-- A failing tally must never fail the insert it rides on: every function below
-- swallows its own errors with a WARNING.

CREATE TABLE IF NOT EXISTS platform_creation_daily (
    day DATE NOT NULL,
    kind TEXT NOT NULL,
    subtype TEXT NOT NULL DEFAULT '',
    -- 'de' | 'at' | 'unknown', from profiles.locale at creation time.
    locale TEXT NOT NULL DEFAULT 'unknown',
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, kind, subtype, locale)
);

-- The one writer. p_delta is -1 only for a chat thread that is hard-deleted
-- without ever getting a message (see trg_count_chat_thread_delete).
CREATE OR REPLACE FUNCTION count_platform_creation(
    p_kind TEXT,
    p_subtype TEXT,
    p_owner TEXT,
    p_delta INTEGER DEFAULT 1,
    p_day DATE DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_locale TEXT;
BEGIN
    BEGIN
        SELECT CASE locale WHEN 'de-DE' THEN 'de' WHEN 'de-AT' THEN 'at' ELSE 'unknown' END
          INTO v_locale
          FROM profiles
         WHERE id = p_owner::uuid;
    EXCEPTION WHEN others THEN
        -- deep_research_runs.user_id is TEXT; a value that is not a uuid lands here.
        v_locale := NULL;
    END;

    INSERT INTO platform_creation_daily AS t (day, kind, subtype, locale, count)
    VALUES (
        coalesce(p_day, (now() AT TIME ZONE 'Europe/Berlin')::date),
        p_kind,
        coalesce(p_subtype, ''),
        coalesce(v_locale, 'unknown'),
        greatest(p_delta, 0)
    )
    ON CONFLICT (day, kind, subtype, locale)
    DO UPDATE SET count = greatest(t.count + p_delta, 0);
EXCEPTION WHEN others THEN
    RAISE WARNING 'platform_creation_daily (%): %', p_kind, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Generic AFTER INSERT trigger. Arguments: kind, owner column, subtype column
-- ('' = none), subtype default for a NULL value. Columns are read with dynamic
-- SQL instead of to_jsonb(NEW), which would serialise whole rows (message and
-- document bodies) on every insert.
CREATE OR REPLACE FUNCTION trg_count_platform_creation() RETURNS TRIGGER AS $$
DECLARE
    v_owner TEXT;
    v_subtype TEXT := '';
BEGIN
    BEGIN
        EXECUTE format('SELECT ($1).%I::text', TG_ARGV[1]) INTO v_owner USING NEW;
        IF TG_ARGV[2] <> '' THEN
            EXECUTE format('SELECT ($1).%I::text', TG_ARGV[2]) INTO v_subtype USING NEW;
            v_subtype := coalesce(v_subtype, TG_ARGV[3]);
        END IF;
        PERFORM count_platform_creation(TG_ARGV[0], v_subtype, v_owner);
    EXCEPTION WHEN others THEN
        RAISE WARNING 'platform_creation_daily trigger on %: %', TG_TABLE_NAME, SQLERRM;
    END;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Designs: the template sits on the 1:1 sidecar, the owner on the document.
CREATE OR REPLACE FUNCTION trg_count_canvas_creation() RETURNS TRIGGER AS $$
BEGIN
    BEGIN
        PERFORM count_platform_creation(
            'designs',
            NEW.template_type,
            (SELECT created_by::text FROM collaborative_documents WHERE id = NEW.document_id)
        );
    EXCEPTION WHEN others THEN
        RAISE WARNING 'platform_creation_daily trigger on canvas_documents: %', SQLERRM;
    END;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Chats: the client creates a thread before the first message and hard-deletes
-- it again when the person never writes one. Counting the insert alone would
-- count those; counting the first message would count again when that message
-- is edited (edit-and-resubmit deletes and rewrites it). So: +1 on insert, and
-- -1 on the day of creation when a thread goes without a user message.
CREATE OR REPLACE FUNCTION trg_count_chat_thread_delete() RETURNS TRIGGER AS $$
BEGIN
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM chat_messages WHERE thread_id = OLD.id AND role = 'user'
        ) THEN
            PERFORM count_platform_creation(
                'chats',
                coalesce(OLD.thread_type, 'chat'),
                OLD.user_id::text,
                -1,
                (coalesce(OLD.created_at, now()) AT TIME ZONE 'Europe/Berlin')::date
            );
        END IF;
    EXCEPTION WHEN others THEN
        RAISE WARNING 'platform_creation_daily trigger on chat_threads delete: %', SQLERRM;
    END;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- CREATE TRIGGER kennt kein IF NOT EXISTS — vgl. add_canvas_documents.sql.
DROP TRIGGER IF EXISTS count_creation ON profiles;
CREATE TRIGGER count_creation AFTER INSERT ON profiles
    FOR EACH ROW EXECUTE FUNCTION trg_count_platform_creation('signups', 'id', '', '');

DROP TRIGGER IF EXISTS count_creation ON chat_threads;
CREATE TRIGGER count_creation AFTER INSERT ON chat_threads
    FOR EACH ROW EXECUTE FUNCTION trg_count_platform_creation('chats', 'user_id', 'thread_type', 'chat');

DROP TRIGGER IF EXISTS count_creation_delete ON chat_threads;
CREATE TRIGGER count_creation_delete BEFORE DELETE ON chat_threads
    FOR EACH ROW EXECUTE FUNCTION trg_count_chat_thread_delete();

DROP TRIGGER IF EXISTS count_creation ON chat_messages;
CREATE TRIGGER count_creation AFTER INSERT ON chat_messages
    FOR EACH ROW WHEN (NEW.role = 'user')
    EXECUTE FUNCTION trg_count_platform_creation('chat_messages', 'user_id', '', '');

DROP TRIGGER IF EXISTS count_creation ON collaborative_documents;
CREATE TRIGGER count_creation AFTER INSERT ON collaborative_documents
    FOR EACH ROW WHEN (coalesce(NEW.document_subtype, 'docs') <> 'canvas')
    EXECUTE FUNCTION trg_count_platform_creation('documents', 'created_by', 'document_subtype', 'docs');

DROP TRIGGER IF EXISTS count_creation ON canvas_documents;
CREATE TRIGGER count_creation AFTER INSERT ON canvas_documents
    FOR EACH ROW EXECUTE FUNCTION trg_count_canvas_creation();

DROP TRIGGER IF EXISTS count_creation ON shared_media;
CREATE TRIGGER count_creation AFTER INSERT ON shared_media
    FOR EACH ROW WHEN (NEW.media_type = 'image' AND NEW.content_origin = 'ki')
    EXECUTE FUNCTION trg_count_platform_creation('ai_images', 'user_id', '', '');

DROP TRIGGER IF EXISTS count_creation ON generation_logs;
CREATE TRIGGER count_creation AFTER INSERT ON generation_logs
    FOR EACH ROW EXECUTE FUNCTION trg_count_platform_creation('text_generations', 'user_id', 'generation_type', 'unbekannt');

DROP TRIGGER IF EXISTS count_creation ON subtitler_projects;
CREATE TRIGGER count_creation AFTER INSERT ON subtitler_projects
    FOR EACH ROW EXECUTE FUNCTION trg_count_platform_creation('reels', 'user_id', '', '');

DROP TRIGGER IF EXISTS count_creation ON podcasts;
CREATE TRIGGER count_creation AFTER INSERT ON podcasts
    FOR EACH ROW EXECUTE FUNCTION trg_count_platform_creation('podcasts', 'user_id', '', '');

DROP TRIGGER IF EXISTS count_creation ON explainables;
CREATE TRIGGER count_creation AFTER INSERT ON explainables
    FOR EACH ROW EXECUTE FUNCTION trg_count_platform_creation('explainables', 'user_id', '', '');

DROP TRIGGER IF EXISTS count_creation ON deep_research_runs;
CREATE TRIGGER count_creation AFTER INSERT ON deep_research_runs
    FOR EACH ROW EXECUTE FUNCTION trg_count_platform_creation('deep_research', 'user_id', '', '');

DROP TRIGGER IF EXISTS count_creation ON user_agents;
CREATE TRIGGER count_creation AFTER INSERT ON user_agents
    FOR EACH ROW EXECUTE FUNCTION trg_count_platform_creation('agents', 'user_id', '', '');

DROP TRIGGER IF EXISTS count_creation ON user_text_forms;
CREATE TRIGGER count_creation AFTER INSERT ON user_text_forms
    FOR EACH ROW EXECUTE FUNCTION trg_count_platform_creation('recipes', 'user_id', 'kind', 'custom');

DROP TRIGGER IF EXISTS count_creation ON user_templates;
CREATE TRIGGER count_creation AFTER INSERT ON user_templates
    FOR EACH ROW EXECUTE FUNCTION trg_count_platform_creation('templates', 'user_id', 'type', 'unbekannt');

DROP TRIGGER IF EXISTS count_creation ON groups;
CREATE TRIGGER count_creation AFTER INSERT ON groups
    FOR EACH ROW WHEN (NOT coalesce(NEW.is_system, false))
    EXECUTE FUNCTION trg_count_platform_creation('projects', 'created_by', '', '');

DROP TRIGGER IF EXISTS count_creation ON group_posts;
CREATE TRIGGER count_creation AFTER INSERT ON group_posts
    FOR EACH ROW EXECUTE FUNCTION trg_count_platform_creation('project_posts', 'author_id', '', '');
