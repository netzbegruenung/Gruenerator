import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The thread id a chat link names. Links from the backend (Tagesbriefing,
 * Meldungen) carry the web's Notion-style slug (`dein-tag-19-nov-ab12cd`), not
 * the row id — handed to the history adapter as-is, the slug loads no messages
 * and the chat opens empty. A slug resolves through `resolveShared`, which
 * answers for the owner as well; a bare UUID passes through without a request.
 *
 * `undefined` while resolving, `null` when the thread is gone or not ours — the
 * caller then opens a fresh chat, like the web's `onThreadGone`.
 */
export function useLinkedThreadId(threadId: string | null): string | null | undefined {
  const isSlug = Boolean(threadId) && !UUID_RE.test(threadId!);
  const { data, isPending } = useQuery({
    queryKey: ['chat-thread-slug', threadId],
    enabled: isSlug,
    staleTime: Infinity,
    retry: 1,
    queryFn: async () => {
      const result = await getContractsClient().chatThreadSharing.resolveShared({
        params: { slugOrId: threadId! },
      });
      return result.status === 200 ? result.body.id : null;
    },
  });
  if (!isSlug) return threadId;
  if (isPending) return undefined;
  return data ?? null;
}
