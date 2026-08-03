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

/*
 * There used to be two favicon builders here, both returning
 * `https://www.google.com/s2/favicons?domain=…`. That meant the browser of
 * every user called Google once per DISPLAYED SOURCE, handing over their IP and
 * the domain they were about to read — on a product that advertises EU hosting.
 * The icon was never worth that, so sources now carry a monogram we draw
 * ourselves: same scannability at a glance, zero third-party requests.
 *
 * The two helpers below are the whole replacement. Deliberately pure and in
 * this file rather than inside a component: three separate places used to build
 * that Google URL (two of them bypassing this module), and one shared source of
 * truth is what stops a fourth from appearing.
 */

/** The letter shown in a source's monogram. Empty when there is no domain. */
export function domainInitial(domain: string | undefined | null): string {
  const clean = (domain ?? '').replace(/^www\./, '').trim();
  // Take the first LETTER OR DIGIT, not the first character: a stray leading
  // dot or bullet would otherwise be rendered as the source's brand mark.
  const match = clean.match(/[\p{L}\p{N}]/u);
  return match ? match[0].toUpperCase() : '';
}

/**
 * A stable hue for a domain, so the same source keeps the same colour across
 * turns, reloads and devices — that consistency is what makes a monogram
 * readable at a glance instead of decorative noise.
 *
 * FNV-1a over the hostname. Any cheap hash would do; what matters is that it is
 * deterministic and depends on nothing but the string.
 */
export function domainHue(domain: string | undefined | null): number {
  const clean = (domain ?? '')
    .replace(/^www\./, '')
    .trim()
    .toLowerCase();
  let hash = 0x811c9dc5;
  for (let i = 0; i < clean.length; i++) {
    hash ^= clean.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 360;
}
