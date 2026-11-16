import { getContractsClient } from '@gruenerator/shared/api';
import { buildChatThreadSlug } from '@gruenerator/shared/utils';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { PiChatCircle } from 'react-icons/pi';
import { Link } from 'react-router-dom';

const MINUTE = 60_000;
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 24 * 60 * MINUTE],
  ['hour', 60 * MINUTE],
  ['minute', MINUTE],
];

/** „vor 2 Stunden", „gestern" — grob genug für eine Chat-Liste. */
export function formatRelativeDate(iso: string, now: number = Date.now()): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '';
  const diff = time - now;
  const rtf = new Intl.RelativeTimeFormat('de', { numeric: 'auto' });
  if (Math.abs(diff) < MINUTE) return 'gerade eben';
  if (Math.abs(diff) >= 7 * 24 * 60 * MINUTE) {
    return new Date(time).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  }
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return '';
}

/**
 * Chats filed into this project (chat_threads.group_id), newest first, as a
 * slim list: title and relative date. Client-side filter over the thread list —
 * no dedicated endpoint needed.
 */
export function SpaceChatsSection({ groupId }: { groupId: string }) {
  const {
    data: threads = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['space-chats', groupId],
    queryFn: async () => {
      const res = await getContractsClient().threads.list({ query: {} });
      if (res.status !== 200) return [];
      return res.body
        .filter((t) => t.groupId === groupId && t.status !== 'archived')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
  });

  // Refresh when a chat is filed into / removed from a Space (event from the
  // chat-side MoveToSpaceDialog, which has no access to this query client).
  useEffect(() => {
    const onChanged = () => void refetch();
    window.addEventListener('gruenerator:space-threads-changed', onChanged);
    return () => window.removeEventListener('gruenerator:space-threads-changed', onChanged);
  }, [refetch]);

  if (isLoading) return null;

  return (
    <section aria-labelledby="projekt-chats-titel" className="flex flex-col gap-xs">
      <h2 id="projekt-chats-titel" className="sr-only">
        Chats in diesem Projekt
      </h2>
      {threads.length === 0 ? (
        <p className="m-0 px-sm text-[15px] text-muted-foreground">
          Noch keine Chats. Starte oben den ersten.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {threads.map((t) => {
            const slug = t.slugSuffix ? buildChatThreadSlug(t.title, t.slugSuffix) : t.id;
            return (
              <li key={t.id}>
                <Link
                  to={`/chat/${slug}`}
                  className="flex w-full items-center gap-sm rounded-md px-sm py-2 text-foreground no-underline transition-colors hover:bg-background-alt"
                >
                  <PiChatCircle aria-hidden className="size-[18px] shrink-0 text-grey-500" />
                  <span className="min-w-0 flex-1 truncate text-[15px]">
                    {t.title || 'Neue Unterhaltung'}
                  </span>
                  <span className="shrink-0 text-[13px] text-muted-foreground">
                    {formatRelativeDate(t.updatedAt)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
