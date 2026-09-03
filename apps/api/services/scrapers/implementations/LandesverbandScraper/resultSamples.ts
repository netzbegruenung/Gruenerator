/**
 * The two sample buckets a Landesverband run fills, and the rule that decides
 * which one a failed fetch belongs in.
 *
 * Their own module so the rule can be tested without loading the scraper —
 * importing `LandesverbandScraper.ts` pulls in Qdrant clients, the embedding
 * service and the whole source config at module load.
 */
import { type SourceResult } from './types.js';

/**
 * Fehlertexte sind eine Stichprobe, kein Protokoll: bei einem Totalausfall
 * würde eine Liste je Inhaltspfad sonst tausende Zeilen tragen und über den
 * Job-Status in Redis landen. Die Zahl `errors` bleibt ungedeckelt und exakt.
 */
export const MAX_ERROR_SAMPLES = 25;

export function addErrorSamples(target: { errorMessages: string[] }, ...messages: string[]): void {
  for (const message of messages) {
    if (target.errorMessages.length >= MAX_ERROR_SAMPLES) return;
    target.errorMessages.push(message);
  }
}

/**
 * Skip reasons are counts, not samples: they are summed unchanged from content
 * path to source to the full result, so the report can say how many of the
 * `skipped` were `too_old` versus `unchanged` — the split #3200 could not see.
 */
export function mergeSkipReasons(
  target: { skipReasons: Record<string, number> },
  from: Record<string, number>
): void {
  for (const [reason, count] of Object.entries(from)) {
    target.skipReasons[reason] = (target.skipReasons[reason] || 0) + count;
  }
}

export function addDeadLinkSamples(
  target: { deadLinkMessages: string[] },
  ...messages: string[]
): void {
  for (const message of messages) {
    if (target.deadLinkMessages.length >= MAX_ERROR_SAMPLES) return;
    target.deadLinkMessages.push(message);
  }
}

/**
 * The guard on the dead-link bucket. Splitting 403/404/410 out of `errors` is
 * safe exactly as long as the source demonstrably worked: if a host starts
 * refusing *every* article page — bot blocking, a moved CMS, an expired
 * certificate on the article vhost — each refusal looks identical to a page
 * that was taken down, and a Landesverband would scrape nothing while the
 * report showed zero errors. That failure mode is not hypothetical; it is why
 * `runScopedLandesverband` refuses to route LV failures into `fetchErrors`.
 *
 * So the split only survives a source that stored, updated or skipped at least
 * one document. Otherwise every dead link is folded back into `errors`, which
 * is what turns the run red and sends the email.
 *
 * Folds the `SourceResult` only, not the per-content-type buckets in
 * `contentTypes`, which keep their unfolded counts. Nothing reads those today
 * (the report and the emails all go through the source-level numbers), and the
 * source-level verdict would be wrong for them anyway: a single content path
 * can legitimately produce nothing while the source as a whole worked. If a
 * consumer for `contentTypes` ever appears, it needs its own decision here
 * rather than inheriting this one.
 */
export function foldDeadLinksIfNothingWorked(
  result: SourceResult,
  log: (message: string) => void = () => {}
): void {
  if (result.deadLinks === 0) return;
  if (result.stored + result.updated + result.skipped > 0) return;

  log(
    `${result.sourceId}: ${result.deadLinks} dead link(s) and not one document processed — ` +
      `counting them as errors, this looks like the whole source is unreachable`
  );
  result.errors += result.deadLinks;
  addErrorSamples(result, ...result.deadLinkMessages);
  result.deadLinks = 0;
  result.deadLinkMessages = [];
}
