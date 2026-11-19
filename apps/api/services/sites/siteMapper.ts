import { buildSiteSnapshot, publishedSiteSnapshotSchema, type Site } from '@gruenerator/contracts';

import { type UserSiteRow } from '../../database/schema/sites.js';

type SiteDraft = Omit<Site, 'has_unpublished_changes'>;

function toDraft(row: UserSiteRow): SiteDraft {
  return {
    id: row.id,
    user_id: row.user_id,
    subdomain: row.subdomain,
    is_published: row.is_published,
    site_title: row.site_title,
    tagline: row.tagline,
    contact_email: row.contact_email,
    contact_phone: row.contact_phone,
    contact_website: row.contact_website,
    theme: row.theme,
    accent_color: row.accent_color,
    profile_image: row.profile_image,
    background_image: row.background_image,
    created_at: row.created_at?.toISOString() ?? null,
    updated_at: row.updated_at?.toISOString() ?? null,
    last_published: row.last_published?.toISOString() ?? null,
    visit_count: row.visit_count,
    meta_description: row.meta_description,
    meta_keywords: row.meta_keywords,
    moderation: row.moderation as Site['moderation'],
    // Boundary cast: a stored draft is not parsed on read, because a row written
    // before the limits existed must still load.
    social_links: row.social_links as SiteDraft['social_links'],
    sections: row.sections as SiteDraft['sections'],
    legal: row.legal as SiteDraft['legal'],
  };
}

export function toSite(row: UserSiteRow): Site {
  return { ...toDraft(row), has_unpublished_changes: hasUnpublishedChanges(row) };
}

export function hasUnpublishedChanges(row: UserSiteRow): boolean {
  if (!row.published_snapshot) return false;
  const stored = publishedSiteSnapshotSchema.safeParse(row.published_snapshot);
  if (!stored.success) return true;
  const rebuilt = buildSiteSnapshot(toDraft(row), stored.data.locale);
  if (!rebuilt.ok) return true;
  return JSON.stringify(rebuilt.snapshot) !== JSON.stringify(stored.data);
}
