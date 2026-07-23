-- Websites a user has connected to their account.
--
-- Until now a WordPress site lived inside notebook_collections.settings, i.e.
-- it belonged to ONE notebook. Once the same site is used by several notebooks
-- — and once "Texte anlernen" wants to read from it without any notebook being
-- involved at all — that is the wrong level. This table is the catalogue: the
-- site's identity plus the last discovery snapshot.
--
-- What stays on the notebook is the SELECTION (which categories/pages that
-- notebook imports, which documents it got, when it last synced). The notebook
-- ref points here via website_id instead of repeating site_url/site_name.
--
-- Deliberately NOT stored here: how many documents were imported. That is
-- derivable from documents.metadata->>'wp_site' and a denormalised counter
-- would only drift.

CREATE TABLE IF NOT EXISTS user_websites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Normalised by normalizeSiteUrl() before insert, so the unique constraint
    -- actually catches "example.de" vs "https://example.de/".
    site_url TEXT NOT NULL,
    site_name TEXT NOT NULL,

    -- Room for sitemap/RSS-based sources later; only 'wordpress' exists today.
    platform TEXT NOT NULL DEFAULT 'wordpress',

    -- Last discovery snapshot: [{ id, name, count }]. Lets the profile and the
    -- notebook picker render categories without re-probing the site.
    categories JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_posts INTEGER NOT NULL DEFAULT 0,
    total_pages INTEGER NOT NULL DEFAULT 0,
    discovered_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (user_id, site_url)
);

CREATE INDEX IF NOT EXISTS idx_user_websites_user_id ON user_websites(user_id);
