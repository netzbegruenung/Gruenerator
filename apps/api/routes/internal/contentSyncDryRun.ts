/**
 * Which content-sync sources actually have a dry-run branch — one that reports
 * what *would* be stored without storing it.
 *
 * The workflow's `dry_run` input ("Preview without storing") used to be
 * forwarded to two sources and dropped for the other nine, which then wrote to
 * Qdrant for real while the report was headed "Content Sync — Dry Run" (#2970).
 * Forwarding the flag to the nine does not fix that: their `fullCrawl`
 * signatures take no `dryRun` at all, so it would be ignored one layer deeper,
 * where nothing shows it. Until each scraper grows the branch, a dry run
 * against those sources is refused with a 400 — a flag that lies is worse than
 * a flag that is missing.
 *
 * Its own module (rather than a const in the router) so the table can be read
 * in a test without loading the scrapers, the email service and Redis with it.
 */
import { contentSyncSourceSchema, type ContentSyncSource } from '@gruenerator/contracts';

/**
 * `Record<ContentSyncSource, boolean>` and not a Set: adding a source to the
 * enum then fails to compile until someone has answered this question for it.
 */
const DRY_RUN_SUPPORT: Record<ContentSyncSource, boolean> = {
  // LandesverbandScraper: resolves each discovered URL against Qdrant and
  // reports new-vs-existing instead of fetching (LandesverbandScraper.ts).
  landesverbaende: true,
  // AbgeordnetenwatchScraper: flushDocs() returns before the upsert.
  abgeordnetenwatch: true,
  gruenblog: false,
  'gruene-at': false,
  kommunalwiki: false,
  'boell-stiftung': false,
  bundestag: false,
  'social-media': false,
  grundsatz: false,
  oesterreich: false,
  'gruene-de': false,
};

export function supportsDryRun(sourceId: ContentSyncSource): boolean {
  return DRY_RUN_SUPPORT[sourceId];
}

export function dryRunCapableSources(): ContentSyncSource[] {
  return contentSyncSourceSchema.options.filter((id) => DRY_RUN_SUPPORT[id]);
}
