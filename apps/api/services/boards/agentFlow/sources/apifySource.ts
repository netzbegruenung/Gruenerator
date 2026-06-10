/**
 * Source: recent social-media posts via Apify (Instagram / Facebook). The account
 * handle comes from a card field (resolved client-side into ctx.handle) or falls
 * back to the card title. Requires APIFY_TOKEN; otherwise the flow fails with a
 * clear message (the UI also greys the source out when Apify is unconfigured).
 */
import { type BoardFlowCardContext, type BoardFlowSource } from '@gruenerator/contracts';

import {
  getRecentFacebookPosts,
  getRecentInstagramPosts,
  isConfigured,
} from '../../../monitor/ApifyService.js';

const MAX_POSTS = 12;

export async function apifySource(
  source: Extract<BoardFlowSource, { type: 'apify_social' }>,
  ctx: BoardFlowCardContext
): Promise<string> {
  if (!isConfigured()) {
    throw new Error('Social-Media-Recherche ist nicht konfiguriert (APIFY_TOKEN fehlt).');
  }

  const handle = (ctx.handle ?? ctx.title ?? '').trim().replace(/^@/, '');
  if (!handle) {
    throw new Error('Kein Account-Handle auf der Karte gefunden (Quelle „Social-Media").');
  }

  const posts =
    source.platform === 'instagram'
      ? await getRecentInstagramPosts(handle, MAX_POSTS)
      : await getRecentFacebookPosts(handle, MAX_POSTS);

  if (posts.length === 0) {
    throw new Error(`Keine Posts für ${source.platform} @${handle} gefunden.`);
  }

  const formatted = posts
    .map((p, i) => {
      const date = p.publishedAt ? ` (${p.publishedAt})` : '';
      return `${i + 1}.${date} ${p.excerpt}`;
    })
    .join('\n\n');

  return `Letzte ${posts.length} ${source.platform}-Posts von @${handle}:\n\n${formatted}`;
}
