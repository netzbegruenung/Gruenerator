/**
 * Low-value domain list for web search.
 *
 * This list belongs BEFORE the paid Linkup call, wired as `excludeDomains` on
 * the search request — not only as a filter applied to results that already
 * cost money. Filtering low-value domains out of the response we pay for,
 * rather than out of the query we send, is exactly the mistake Open WebUI and
 * LobeChat each built independently (see
 * `websearch-orchestration-lobehub-openwebui` memory): neither has a
 * classifier ahead of the call, and both discard unwanted domains only after
 * the request already happened.
 *
 * `isLowValueDomain` stays exported as a client-side
 * net for results that arrive by a path that never saw `excludeDomains` — the
 * SearXNG fallback in particular — not as the primary mechanism. Once a
 * source hands the exclude list to the paid call, this check should rarely
 * fire.
 */

/** Domains that rarely provide useful search context. */
export const LOW_VALUE_DOMAINS: readonly string[] = [
  'tripadvisor.de',
  'tripadvisor.com',
  'booking.com',
  'expedia.de',
  'kurz-mal-weg.de',
  'holidaycheck.de',
  'verbraucherzentrale.de',
  'ebay.de',
  'amazon.de',
];

/** Set form of {@link LOW_VALUE_DOMAINS} for the post-call membership check.
 *  Module-private: callers want the predicate below, not the raw set. */
const LOW_VALUE_DOMAIN_SET: ReadonlySet<string> = new Set(LOW_VALUE_DOMAINS);

/**
 * Whether a result URL's host is on the low-value domain list.
 *
 * Matches only the exact host after stripping a leading `www.` — it does not
 * widen to arbitrary subdomains (`shop.amazon.de` is not treated as
 * `amazon.de`). The list is a small, curated set of known offenders; matching
 * by suffix would silently pull in subdomains nobody vetted. Widen the list
 * itself if a specific subdomain turns out to need it.
 *
 * A missing or unparsable URL returns `false` — a source without a parsable
 * URL is not automatically low-value.
 */
export function isLowValueDomain(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return LOW_VALUE_DOMAIN_SET.has(hostname);
  } catch {
    return false;
  }
}

/**
 * Whatever a caller offers as a "domain", reduced to the bare host the API wants.
 *
 * Both suppliers of these lists get it wrong in the same predictable ways: the
 * model writes back what the user typed (`https://zeit.de/politik`, `www.zeit.de`,
 * `Zeit.de `), and the heuristic scope extractor can pass through a trailing dot.
 * A scheme or path left in place matches nothing at Linkup, and the failure
 * surfaces as "the site had no results" — indistinguishable from a real empty
 * result, which is why this normalises rather than validates.
 *
 * Entries that survive nothing (empty strings, a bare `https://`) are dropped
 * instead of being sent as garbage: one unusable entry in `includeDomains` would
 * narrow a search to a host that cannot exist.
 */
export function normalizeDomainList(domains: readonly string[] | undefined): string[] {
  if (!domains?.length) return [];
  const out = new Set<string>();
  for (const raw of domains) {
    const host = raw
      .trim()
      .toLowerCase()
      .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
      .replace(/^www\./, '')
      .replace(/[/?#].*$/, '')
      .replace(/:\d+$/, '')
      .replace(/\.+$/, '');
    // A host must have a dot: a single label ("zeit", "localhost") is either a
    // mis-parse or unreachable, and either way not what the user named.
    if (host.length > 0 && host.includes('.')) out.add(host);
  }
  return [...out];
}
