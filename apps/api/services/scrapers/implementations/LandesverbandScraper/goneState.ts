/**
 * Gone detection for Landesverband HTML article pages (#3566), as pure
 * functions — the scraper only executes the verdict.
 *
 * A page is gone on HTTP 404/410 or on a redirect to a different path. Stored
 * points of a gone URL are first marked (`lv_gone_since`) and deleted only on
 * a later sighting at least GONE_CONFIRM_AFTER_MS after the mark: a single
 * failed fetch is not proof (#2971 saw persistent 403/500 on live pages), so
 * 403, 5xx, timeouts and network errors never count.
 */

export const GONE_CONFIRM_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * - `live`: answered without moving (a changed trailing slash, query, `www.` or
 *   scheme is not a move);
 * - `moved`: redirected to another path on the same host — store under the
 *   final URL, the requested one is gone;
 * - `gone`: 404/410, or redirected to another host, the site root or a listing
 *   page — nothing there to store;
 * - `transient`: anything else, including network errors (`status: null`).
 */
export type FetchOutcome = 'live' | 'moved' | 'gone' | 'transient';

export type GoneVerdict = 'mark' | 'delete' | 'clear' | 'none';

interface FetchResult {
  requestedUrl: string;
  /** Final status after following redirects; null when no response arrived. */
  status: number | null;
  /** `response.url` after following redirects; null when unknown. */
  finalUrl: string | null;
  /** Listing paths of the source (`contentPaths[].path`). */
  listingPaths: string[];
}

function pathKey(path: string): string {
  return path.replace(/\/+$/, '');
}

function hostKey(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

export function classifyFetch(result: FetchResult): FetchOutcome {
  const { status } = result;
  if (status === 404 || status === 410) return 'gone';
  if (status === null || status < 200 || status >= 300) return 'transient';
  if (!result.finalUrl) return 'live';

  let requested: URL;
  let final: URL;
  try {
    requested = new URL(result.requestedUrl);
    final = new URL(result.finalUrl);
  } catch {
    return 'transient';
  }
  if (hostKey(requested.hostname) !== hostKey(final.hostname)) return 'gone';

  const finalPath = pathKey(final.pathname);
  if (finalPath === pathKey(requested.pathname)) return 'live';
  if (finalPath === '' || result.listingPaths.some((p) => pathKey(p) === finalPath)) return 'gone';
  return 'moved';
}

/**
 * What to do with the stored points of the requested URL. `stored` is the
 * payload of one stored chunk, null when the URL has no points — then there
 * is nothing to mark or delete.
 */
export function goneVerdict(
  outcome: FetchOutcome,
  stored: Record<string, unknown> | null,
  now: number
): GoneVerdict {
  if (!stored || outcome === 'transient') return 'none';
  const since =
    typeof stored.lv_gone_since === 'string' ? new Date(stored.lv_gone_since).getTime() : NaN;
  const marked = Number.isFinite(since);

  if (outcome === 'live') return stored.lv_gone_since != null ? 'clear' : 'none';
  if (!marked) return 'mark';
  return now - since >= GONE_CONFIRM_AFTER_MS ? 'delete' : 'none';
}
