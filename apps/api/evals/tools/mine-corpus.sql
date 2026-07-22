-- Corpus mining: candidate real-user prompts for the chat eval corpus.
-- Run on test/prod (host Postgres, NOT compose):
--   sudo -u postgres psql -d gruenerator -f mine-corpus.sql -A -F $'\t' -o /tmp/mined.tsv
--
-- PROTOCOL (see evals/README.md): never commit verbatim user text. Paraphrase,
-- strip names/places/emails, keep only the structural shape that made the
-- prompt interesting (prefix, umlaut-first, pasted material, follow-up form).

-- 1) Shapes that historically broke the classifier.
SELECT 'shape' AS bucket, t.id AS thread_id, left(m.content, 400) AS content, m.created_at
FROM chat_messages m
JOIN chat_threads t ON t.id = m.thread_id
WHERE m.role = 'user'
  AND m.created_at > now() - interval '14 days'
  AND (
    char_length(m.content) > 400                              -- pasted material
    OR m.content ~* '^\s*(hier|hilfe|hallo|moin|servus|hi\M)' -- greeting-prefix traps
    OR m.content ~* '^\s*[äöüÄÖÜ]'                            -- umlaut-first tokens
    OR m.content ~* '^\s*(und|dann|jetzt|mach|noch|mehr|warum|wieso)\M' -- follow-up openers
  )
ORDER BY random()
LIMIT 150;

-- 2) Frustration signal: same user re-sent a near-identical prompt within
--    2 minutes (likely a failed/unsatisfying first answer).
SELECT 'retry' AS bucket, m1.thread_id, left(m1.content, 400) AS content, m1.created_at
FROM chat_messages m1
JOIN chat_messages m2
  ON m2.thread_id = m1.thread_id
 AND m2.role = 'user'
 AND m2.id <> m1.id
 AND m2.created_at BETWEEN m1.created_at AND m1.created_at + interval '2 minutes'
 AND similarity(left(m1.content, 200), left(m2.content, 200)) > 0.6
WHERE m1.role = 'user'
  AND m1.created_at > now() - interval '14 days'
ORDER BY m1.created_at DESC
LIMIT 50;

-- 3) Deep-thread probes: user turns that arrived at position >= 10 in their
--    thread (the "longer threads" failure zone — what do people actually ask
--    deep into a conversation?).
WITH numbered AS (
  SELECT m.thread_id, m.content, m.created_at,
         row_number() OVER (PARTITION BY m.thread_id ORDER BY m.created_at) AS pos
  FROM chat_messages m
  WHERE m.role = 'user' AND m.created_at > now() - interval '14 days'
)
SELECT 'deep-thread' AS bucket, thread_id, left(content, 400) AS content, created_at
FROM numbered
WHERE pos >= 10
ORDER BY random()
LIMIT 80;

-- Note: query 2 needs the pg_trgm extension (similarity()). If unavailable:
--   CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- or drop the similarity clause and review duplicates manually.
