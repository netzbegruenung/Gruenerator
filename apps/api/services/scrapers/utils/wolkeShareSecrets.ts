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

/** The share link for `key`, or null when the file or the entry is missing. */
export function resolveWolkeShareLink(
  key: string,
  root: string = internContentRoot()
): string | null {
  let links: unknown;
  try {
    links = JSON.parse(readFileSync(resolve(root, SHARES_FILE), 'utf8'));
  } catch {
    return null;
  }
  if (!links || typeof links !== 'object') return null;
  const link = (links as Record<string, unknown>)[key];
  return typeof link === 'string' && link.length > 0 ? link : null;
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
