/**
 * Cached category/page discovery for the notebook WordPress source.
 *
 * Discovery walks several WP REST endpoints and takes seconds, which used to
 * be paid again on every "Auswahl ändern" click. Results are cached per site
 * URL so re-opening a site is instant, and the pencil button prefetches on
 * hover so even the first open usually finds a warm cache.
 */
import { wpErrorResponseSchema, type WpDiscoverResponse } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

const STALE_TIME = 10 * 60 * 1000;
const GC_TIME = 30 * 60 * 1000;

export const WP_ERROR_MESSAGES = {
  invalid_url: 'Bitte gib eine gültige Website-Adresse ein.',
  no_scopes: 'Wähle mindestens eine Kategorie aus.',
  not_wordpress:
    'Unter dieser Adresse ist keine WordPress-REST-API erreichbar. Ist es eine WordPress-Website?',
  rest_disabled:
    'Die WordPress-REST-API dieser Website ist deaktiviert oder geschützt. Viele Websites schalten sie aus Sicherheitsgründen ab.',
  fetch_failed: 'Die Website ist nicht erreichbar. Prüfe die Adresse und versuche es erneut.',
  internal: 'Import fehlgeschlagen. Bitte versuche es später erneut.',
} as const;

/**
 * ts-rest types the body of unlisted status codes as `unknown`, so the error
 * body is parsed with its contract schema rather than cast — the parse is the
 * assertion, and `code` stays exhaustively typed against WP_ERROR_MESSAGES.
 */
export function wpErrorMessage(body: unknown): string {
  const parsed = wpErrorResponseSchema.safeParse(body);
  if (!parsed.success) return WP_ERROR_MESSAGES.internal;
  if (parsed.data.code) return WP_ERROR_MESSAGES[parsed.data.code];
  return parsed.data.error || WP_ERROR_MESSAGES.internal;
}

function discoveryKey(siteUrl: string) {
  return ['notebook', 'wordpress-discovery', siteUrl] as const;
}

function discoveryOptions(siteUrl: string, queryClient: QueryClient) {
  return {
    queryKey: discoveryKey(siteUrl),
    queryFn: async (): Promise<WpDiscoverResponse> => {
      const result = await getContractsClient().notebookWordpress.discoverSite({
        body: { site_url: siteUrl },
      });
      if (result.status !== 200) throw new Error(wpErrorMessage(result.body));
      // The server normalises the URL (scheme, trailing slash). Seeding the
      // canonical key too lets a later open by stored siteUrl hit this entry
      // even though discovery ran on whatever the user typed.
      if (result.body.site.url !== siteUrl) {
        queryClient.setQueryData(discoveryKey(result.body.site.url), result.body);
      }
      return result.body;
    },
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    retry: false,
  };
}

export function useWordpressDiscovery(siteUrl: string | null) {
  const queryClient = useQueryClient();
  return useQuery({
    ...discoveryOptions(siteUrl ?? '', queryClient),
    enabled: Boolean(siteUrl),
  });
}

/** Warm the cache from a hover/focus, so opening the panel feels instant. */
export function useWordpressDiscoveryPrefetch() {
  const queryClient = useQueryClient();
  return useCallback(
    (siteUrl: string) => {
      void queryClient.prefetchQuery(discoveryOptions(siteUrl, queryClient));
    },
    [queryClient]
  );
}
