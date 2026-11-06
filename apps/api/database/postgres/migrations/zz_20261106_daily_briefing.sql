-- Tagesbriefing: die proaktive Nachricht beim ersten Besuch des Tages.
--
-- `profiles.proactive_briefing_enabled` ist der Schalter in den Einstellungen
-- (Standard an). `daily_briefings` ist der Ledger: eine Zeile je Person und
-- Kalendertag (Europe/Berlin). Der Primärschlüssel ist der Claim — der erste
-- INSERT gewinnt, auch über Tabs, Geräte und Cluster-Worker hinweg. Die Zeile
-- überlebt das Löschen des Threads (ON DELETE SET NULL), damit am selben Tag
-- kein zweites Briefing entsteht. Kein Papierkorb: die Zeile ist kein Inhalt.
--
-- `monitor_lagebilder` hält das stündlich im Monitor-Refresh erzeugte, geteilte
-- Lagebild je Locale, damit ein Redis-Neustart keinen Modellaufruf kostet.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS proactive_briefing_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS daily_briefings (
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    thread_id UUID REFERENCES chat_threads(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'created', 'skipped', 'failed')),
    opened_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_daily_briefings_thread ON daily_briefings(thread_id) WHERE thread_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS monitor_lagebilder (
    id BIGSERIAL PRIMARY KEY,
    locale TEXT NOT NULL CHECK (locale IN ('de', 'at')),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_monitor_lagebilder_locale_generated ON monitor_lagebilder(locale, generated_at DESC);
