/**
 * Shared URL utilities for domain extraction and favicon fetching.
 *
 * Consolidates the many per-component `extractDomain` implementations
 * into a single reusable helper.
 */

/**
 * Extract the hostname from a URL. Returns null on invalid input.
 * Use this when you need both domain display and favicon to avoid parsing twice.
 */
export function getHostname(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Extract the display domain from a URL, stripping the "www." prefix.
 * Returns undefined if the URL is invalid or empty.
 */
export function extractDomain(url: string | undefined | null): string | undefined {
  const hostname = getHostname(url);
  return hostname ? hostname.replace(/^www\./, '') : undefined;
}

/**
 * Get a Google favicon URL for a given page URL.
 * Returns an empty string if the URL is invalid.
 */
export function getFaviconUrl(url: string): string {
  const hostname = getHostname(url);
  return hostname ? `https://www.google.com/s2/favicons?domain=${hostname}&sz=32` : '';
}

/**
 * Build a favicon URL from a pre-parsed hostname (avoids re-parsing the URL).
 */
export function faviconFromHostname(hostname: string): string {
  return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
}
