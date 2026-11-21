import {
  buildSiteSnapshot,
  siteDraftToSnapshotSource,
  snapshotDiffers,
  type Site,
  type SiteDraft,
  type SitePublishIssue,
  type SupportedLocale,
} from '@gruenerator/contracts';

export type PublishStatus = 'unpublished' | 'live' | 'changed';

export function publishState(i: { draft: SiteDraft; site: Site; locale: SupportedLocale }): {
  status: PublishStatus;
  issues: SitePublishIssue[];
} {
  const source = siteDraftToSnapshotSource(i.draft, i.site.legal);
  const built = buildSiteSnapshot(source, i.locale);
  const issues = built.ok ? [] : built.issues;
  if (!i.site.is_published) return { status: 'unpublished', issues };
  const published = i.site.published_snapshot;
  const changed = published === null || snapshotDiffers(source, published);
  return { status: changed ? 'changed' : 'live', issues };
}
