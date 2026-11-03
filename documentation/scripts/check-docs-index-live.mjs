/**
 * Requests every page of the chat's docs index from the LIVE docs site and
 * fails if one is missing (#5013).
 *
 * The index (`apps/api/services/docs/docsIndex.generated.ts`) ships with the
 * API image, the site with the separately rolled-out `gruenerator-doku` image.
 * When the doku rollout lags, the chat cites pages the live site does not have.
 * `docs:index:check` cannot see that — it only proves the index matches the
 * repo. This script compares the index against what is actually deployed.
 *
 * It relies on `documentation/nginx.conf` answering unknown paths with 404:
 * under the old SPA fallback every missing page came back 200 (start page) and
 * this check would have been blind.
 *
 * Scope: page URLs only. `#anchor`s are resolved in the browser, a renamed
 * heading is not visible to an HTTP check.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX_FILE = path.resolve(
  HERE,
  '..',
  '..',
  'apps',
  'api',
  'services',
  'docs',
  'docsIndex.generated.ts'
);

const source = readFileSync(INDEX_FILE, 'utf8');
const siteUrl = source.match(/export const DOCS_SITE_URL = "([^"]+)"/)?.[1];
const urls = [...new Set([...source.matchAll(/^\s*"url": "([^"]+)",$/gm)].map((m) => m[1]))];

if (!siteUrl || urls.length === 0) {
  console.error(`Could not read DOCS_SITE_URL or page URLs from ${INDEX_FILE}`);
  process.exit(1);
}

async function probe(url) {
  try {
    // nginx answers `/docs/x` with a 301 to `/docs/x/`; fetch follows it.
    const res = await fetch(siteUrl + url, { signal: AbortSignal.timeout(15_000) });
    return res.status;
  } catch (err) {
    return `error: ${err.cause?.code ?? err.message}`;
  }
}

const results = [];
// A handful at a time — the doku container is small and this is not a load test.
for (let i = 0; i < urls.length; i += 8) {
  const batch = urls.slice(i, i + 8);
  const statuses = await Promise.all(batch.map(probe));
  batch.forEach((url, j) => results.push({ url, status: statuses[j] }));
}

const missing = results.filter((r) => r.status !== 200);
if (missing.length > 0) {
  console.error(
    `${missing.length} of ${urls.length} indexed docs pages are not served by ${siteUrl}:`
  );
  for (const r of missing) console.error(`  ${r.status}  ${r.url}`);
  console.error(
    '\nThe chat cites these pages. Roll out the current gruenerator-doku image, ' +
      'or — if the API runs an older index than master — wait for its deploy.'
  );
  process.exit(1);
}

console.log(`All ${urls.length} indexed docs pages are served by ${siteUrl}.`);
