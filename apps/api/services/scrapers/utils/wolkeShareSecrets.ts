/**
 * A public Wolke share link is a credential: whoever holds the token reads the
 * whole share. This repo is public, so it carries only a key per share; the
 * link itself lives in the private content checkout as
 * `<INTERN_CONTENT_DIR>/wolke-shares.json` — `{"<shareKey>": "<share link>"}`.
 *
 * Its own module, apart from `wolkeShareHandler.ts`, because the content sync
 * router needs the redaction and must not pull the OCR service in at load.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { internContentRoot } from '../../skills/internalPrompts.js';

const SHARES_FILE = 'wolke-shares.json';

/** `{shareKey: link}` with the non-string/empty entries dropped; `{}` when the file is unreadable. */
export function readWolkeShares(root: string = internContentRoot()): Record<string, string> {
  let links: unknown;
  try {
    links = JSON.parse(readFileSync(resolve(root, SHARES_FILE), 'utf8'));
  } catch {
    return {};
  }
  if (!links || typeof links !== 'object') return {};
  return Object.fromEntries(
    Object.entries(links as Record<string, unknown>).filter(
      (e): e is [string, string] => typeof e[1] === 'string' && e[1].length > 0
    )
  );
}

/** The share link for `key`, or null when the file or the entry is missing. */
export function resolveWolkeShareLink(
  key: string,
  root: string = internContentRoot()
): string | null {
  return readWolkeShares(root)[key] ?? null;
}

const WOLKE_SCHEME = 'wolke://';

/**
 * The stored `source_url` of a share file: `wolke://<shareKey>/<rel>`, token-free.
 * `rel` is the decoded path inside the share, kept raw (not URL-encoded) — the
 * same string that follows `#/` in the share link form, so the resolver below
 * is a plain prefix swap.
 */
export function buildWolkeFileUrl(shareKey: string, rel: string): string {
  return `${WOLKE_SCHEME}${shareKey}/${rel}`;
}

/**
 * The clickable form of a stored url for a user: `<share link>#/<rel>`. Any
 * other url, and a `wolke://` url whose key is not (or no longer) registered,
 * comes back unchanged.
 */
export function resolveWolkeDisplayUrl(url: string, root: string = internContentRoot()): string {
  if (!url.startsWith(WOLKE_SCHEME)) return url;
  const rest = url.slice(WOLKE_SCHEME.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return url;
  const link = resolveWolkeShareLink(rest.slice(0, slash), root);
  return link ? `${link}#/${rest.slice(slash + 1)}` : url;
}

/**
 * Inverse of `resolveWolkeDisplayUrl`: a resolved link of a registered share
 * back to the stored `wolke://` form, for lookups keyed on the payload. Anything
 * else comes back unchanged.
 */
export function toStoredWolkeUrl(url: string, root: string = internContentRoot()): string {
  const hash = url.indexOf('#/');
  if (hash < 0 || !url.includes('wolke.netzbegruenung.de/')) return url;
  const link = url.slice(0, hash);
  const key = Object.entries(readWolkeShares(root)).find(([, l]) => l === link)?.[0];
  return key ? buildWolkeFileUrl(key, url.slice(hash + 2)) : url;
}

const SHARE_TOKEN = /(wolke\.netzbegruenung\.de\/(?:index\.php\/)?s\/)[A-Za-z0-9]+/g;

/**
 * Masks share tokens in text that leaves for a public place. Sync error samples
 * carry stored `source_url`s (`<share link>#/<file>`) and are printed verbatim
 * in the GitHub Actions log and step summary.
 */
export function redactShareTokens(text: string): string {
  return text.replace(SHARE_TOKEN, '$1<redacted>');
}
