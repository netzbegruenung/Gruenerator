/**
 * Request-scoped context for consumption tracking.
 *
 * Carries the owning user and the feature a request belongs to down to the AI
 * call sites without threading parameters through ~60 call sites. Installed
 * once as an Express middleware; the AsyncLocalStorage store survives await
 * chains and `.then()` continuations, so background work kicked off from a
 * request (subtitler jobs, detached agent runs) stays attributed.
 *
 * The store holds a reference to `req`, not the user id: `req.user` is only set
 * later by requireAuth, so the id must be read lazily at record time.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface UsageContext {
  req: { user?: { id?: string } | undefined };
  feature: string;
}

const store = new AsyncLocalStorage<UsageContext>();

export function runWithUsageContext<T>(context: UsageContext, fn: () => T): T {
  return store.run(context, fn);
}

/** Current feature slug, or null outside a request (cron, scrapers, workers). */
export function getUsageFeature(): string | null {
  return store.getStore()?.feature ?? null;
}

/** Current user id, or null when unauthenticated or outside a request. */
export function getUsageUserId(): string | null {
  return store.getStore()?.req.user?.id ?? null;
}

/**
 * Feature slugs are a closed set — they are the grouping dimension of the usage
 * tab, so a typo would silently create a phantom category.
 */
export const USAGE_FEATURES = [
  'chat',
  'docs',
  'sheets',
  'presentations',
  'boards',
  'sharepic',
  'subtitler',
  'search',
  'monitor',
  'sites',
  'texte',
  'notebook',
  'other',
] as const;

export type UsageFeature = (typeof USAGE_FEATURES)[number];

/**
 * Path prefix → feature, matched longest-first so `/api/search-graph` can't be
 * shadowed by a shorter neighbour. Anything unmapped lands in `other` — new
 * routes therefore degrade to a bucket rather than disappearing.
 */
const FEATURE_BY_PREFIX: ReadonlyArray<readonly [string, UsageFeature]> = (
  [
    ['/api/chat-service', 'chat'],
    ['/api/chat-graph', 'chat'],
    ['/api/threads', 'chat'],
    ['/api/memory', 'chat'],

    ['/api/docs', 'docs'],
    ['/api/documents', 'docs'],
    ['/api/markdown', 'docs'],
    ['/api/etherpad', 'docs'],

    ['/api/sheets', 'sheets'],
    ['/api/presentations', 'presentations'],

    ['/api/boards', 'boards'],
    ['/api/board-activity', 'boards'],
    ['/api/board-attachments', 'boards'],
    ['/api/board-card-documents', 'boards'],
    ['/api/board-comments', 'boards'],
    ['/api/board-schedules', 'boards'],
    ['/api/board-subscriptions', 'boards'],

    ['/api/sharepic', 'sharepic'],
    ['/api/canvas', 'sharepic'],
    ['/api/canva', 'sharepic'],
    ['/api/flux', 'sharepic'],
    ['/api/imagine', 'sharepic'],
    ['/api/image-edit', 'sharepic'],
    ['/api/image-generation', 'sharepic'],
    ['/api/image-picker', 'sharepic'],
    ['/api/imageupload', 'sharepic'],
    ['/api/ai-image-modification', 'sharepic'],
    ['/api/background-removal', 'sharepic'],
    ['/api/unsplash', 'sharepic'],
    ['/api/campaign_canvas', 'sharepic'],

    ['/api/subtitler', 'subtitler'],
    ['/api/video', 'subtitler'],
    // Read-aloud and the voice agent are chat surfaces, so speech synthesis is
    // booked under chat. This wins over the '/api/voice' line below because the
    // list is matched longest-first. The rest of /api/voice is transcription and
    // stays with the subtitler; /api/voice/realtime is a chat surface too, but
    // it upgrades to a WebSocket that this middleware never sees.
    ['/api/voice/tts', 'chat'],
    ['/api/voice', 'subtitler'],
    ['/api/protokoll', 'subtitler'],
    ['/api/process', 'subtitler'],

    ['/api/search-graph', 'search'],
    ['/api/search-image', 'search'],
    ['/api/global-search', 'search'],
    ['/api/research', 'search'],
    ['/api/crawl-url', 'search'],

    ['/api/monitor', 'monitor'],

    ['/api/sites', 'sites'],
    ['/api/gruen-o-mat', 'sites'],

    ['/api/texte', 'texte'],
    ['/api/antraege', 'texte'],
    ['/api/claude', 'texte'],
    ['/api/campaign_generate', 'texte'],
    ['/api/generate-content-title', 'texte'],
    ['/api/text-forms', 'texte'],
    ['/api/vision', 'texte'],
    ['/api/scanner', 'texte'],
    ['/api/email', 'texte'],
    ['/api/reisekosten', 'texte'],

    ['/api/notebook', 'notebook'],
    ['/api/auth/notebook', 'notebook'],
    ['/api/v1/notebooks', 'notebook'],
    ['/api/v1/collections', 'notebook'],
  ] as ReadonlyArray<readonly [string, UsageFeature]>
)
  .slice()
  .sort((a, b) => b[0].length - a[0].length);

/** The sharepic generators each mount their own `<name>_canvas` prefix. */
const CANVAS_ROUTE = /^\/api\/[a-z0-9_]+_canvas(\/|$)/;

/** Map a request path to a stable feature slug for the usage breakdown. */
export function featureFromPath(path: string): UsageFeature {
  for (const [prefix, feature] of FEATURE_BY_PREFIX) {
    if (path.startsWith(prefix)) return feature;
  }
  if (CANVAS_ROUTE.test(path)) return 'sharepic';
  return 'other';
}
