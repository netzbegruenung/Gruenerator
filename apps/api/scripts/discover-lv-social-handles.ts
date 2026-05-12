/**
 * Discover per-Landesverband Instagram + Facebook handles from each LV
 * website's footer.
 *
 * Iterates the `landesverband`-typed sources in `LANDESVERBAENDE_CONFIG`,
 * fetches each baseUrl, parses the HTML with cheerio, and extracts any
 * `<a href>` matching `instagram.com/...` or `facebook.com/...`. Prints
 * a markdown table for operator review.
 *
 * **This is a discovery tool, not a verification tool.** A surfaced
 * handle is a *candidate* — the operator must open the IG/FB URL in a
 * browser and confirm the account is the official LV account (branding,
 * recent posts, blue check) before adding it to
 * `apps/api/config/landesverbaendeSocialAccounts.ts`.
 *
 * Usage:
 *   pnpm --filter @gruenerator/api tsx scripts/discover-lv-social-handles.ts
 *
 * Output: stdout only. No file writes, no Qdrant calls.
 */

import * as cheerio from 'cheerio';

import { LANDESVERBAENDE_CONFIG } from '../config/landesverbaendeConfig.js';

import type { LandesverbandSource } from '../config/landesverbaendeConfig.js';

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = 'GrueneratorBot/1.0 (+https://gruenerator.eu; discover-lv-social-handles)';

interface DiscoveredHandles {
  lv: string;
  /** All baseUrls checked for this LV (merged across multiple landesverband sources). */
  baseUrls: string[];
  instagram: string[];
  facebook: string[];
}

async function fetchHtml(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
    });
    if (!res.ok) {
      console.error(`  ✗ HTTP ${res.status} ${res.statusText}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ fetch error: ${msg}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeInstagramHandle(href: string): string | null {
  // Matches instagram.com/{handle} and instagram.com/{handle}/ (with optional ?query)
  const m = href.match(/instagram\.com\/([^/?#]+)/i);
  if (!m) return null;
  const handle = m[1].replace(/^@/, '').trim();
  // Skip non-account paths (posts, reels, explore, etc.)
  const skip = new Set(['p', 'reel', 'reels', 'tv', 'explore', 'stories', 'accounts']);
  if (!handle || skip.has(handle.toLowerCase())) return null;
  return handle;
}

function normalizeFacebookHandle(href: string): string | null {
  // Matches facebook.com/{handle} and www.facebook.com/{handle}/
  const m = href.match(/facebook\.com\/([^/?#]+)/i);
  if (!m) return null;
  const handle = m[1].replace(/^@/, '').trim();
  // Skip non-page paths
  const skip = new Set(['sharer', 'sharer.php', 'plugins', 'tr', 'login', 'pages']);
  if (!handle || skip.has(handle.toLowerCase())) return null;
  return handle;
}

function extractHandles(html: string): { instagram: string[]; facebook: string[] } {
  const $ = cheerio.load(html);
  const ig = new Set<string>();
  const fb = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const igHandle = normalizeInstagramHandle(href);
    if (igHandle) ig.add(igHandle);
    const fbHandle = normalizeFacebookHandle(href);
    if (fbHandle) fb.add(fbHandle);
  });
  return { instagram: [...ig], facebook: [...fb] };
}

/**
 * Group all `landesverband`-typed sources by shortName. An LV may have
 * multiple sources (e.g. Hamburg has both `www.gruene-hamburg.de` and
 * `beschluss.gruene-hamburg.de`). We check all of them and merge handles
 * — different subdomains often have different footer layouts, so casting
 * a wider net improves recall. Fraktion sources are excluded.
 */
function landesverbandSourcesByLv(
  sources: LandesverbandSource[]
): Map<string, LandesverbandSource[]> {
  const byLv = new Map<string, LandesverbandSource[]>();
  for (const src of sources) {
    if (src.type !== 'landesverband') continue;
    const existing = byLv.get(src.shortName);
    if (existing) {
      existing.push(src);
    } else {
      byLv.set(src.shortName, [src]);
    }
  }
  return byLv;
}

async function main(): Promise<void> {
  const byLv = landesverbandSourcesByLv(LANDESVERBAENDE_CONFIG.sources);
  console.error(`Discovering social handles across ${byLv.size} Landesverbände...\n`);

  const rows: DiscoveredHandles[] = [];

  for (const [shortName, sources] of byLv) {
    console.error(`→ ${shortName}`);
    const ig = new Set<string>();
    const fb = new Set<string>();
    const checkedUrls: string[] = [];

    for (const src of sources) {
      console.error(`  · ${src.baseUrl}`);
      checkedUrls.push(src.baseUrl);
      const html = await fetchHtml(src.baseUrl);
      if (!html) continue;
      const handles = extractHandles(html);
      handles.instagram.forEach((h) => ig.add(h));
      handles.facebook.forEach((h) => fb.add(h));
    }

    rows.push({
      lv: shortName,
      baseUrls: checkedUrls,
      instagram: [...ig],
      facebook: [...fb],
    });
    console.error(
      `  IG: ${[...ig].join(', ') || '(none)'} | FB: ${[...fb].join(', ') || '(none)'}`
    );
  }

  console.log('\n## Discovered handles per Landesverband\n');
  console.log('Open each IG/FB URL in a browser and verify it is the official LV');
  console.log('account before adding to `landesverbaendeSocialAccounts.ts`.\n');
  console.log('| LV | IG handle(s) | FB handle(s) | Sources checked |');
  console.log('|----|--------------|--------------|-----------------|');
  for (const row of rows) {
    const ig = row.instagram.length > 0 ? row.instagram.join(', ') : '*(none found)*';
    const fb = row.facebook.length > 0 ? row.facebook.join(', ') : '*(none found)*';
    console.log(`| ${row.lv} | ${ig} | ${fb} | ${row.baseUrls.join(', ')} |`);
  }
  console.log('');
}

main().catch((err) => {
  const msg = err instanceof Error ? err.stack || err.message : String(err);
  console.error(`Fatal: ${msg}`);
  process.exit(1);
});
