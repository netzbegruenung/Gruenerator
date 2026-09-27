import { type QueryClient } from '@tanstack/react-query';

/**
 * Drop the chat composer's copy of the notebook list.
 *
 * The mention picker in `packages/chat` caches the same list under its own
 * `['file-mention', …]` prefix, and it has to: the package is host-agnostic, so
 * it knows neither `authStore`'s user id nor the web app's query-key layout, and
 * its own `configFetch` carries the desktop bearer logic. Web and chat do share
 * one QueryClient (App.tsx wraps the GlobalChatProvider), so invalidating the
 * prefix from here is enough.
 *
 * Every write that changes which notebooks a user has — or how many sources sit
 * in one — has to make this call. Without it a freshly created notebook was
 * missing from `@`-mentions for the picker's five-minute staleTime, and a
 * deleted one stayed selectable just as long. apps/mobile has invalidated this
 * exact prefix since its file browser landed; the web side was never added.
 */
export function invalidateFileMentions(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['file-mention'] });
}
