import { getContractsClient } from '@gruenerator/shared/api';
import { projectChatThreads } from '@gruenerator/shared/groups';
import { buildChatThreadSlug } from '@gruenerator/shared/utils';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { PiCaretRight, PiChatCircle } from 'react-icons/pi';
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
/** Aufgeklappt stehen zuerst so viele Chats da; der Rest auf Wunsch. */
const CHATS_SHOWN = 5;

export function SpaceChatsSection({
  groupId,
  aside = null,
}: {
  groupId: string;
  /** Steht rechts in der Zeile mit „Bisherige Chats“ (der Teilen-Schalter des Composers). */
  aside?: ReactNode;
}) {
  // Bisherige Chats sind eingeklappt: oben steht der neue Chat, nicht die Liste.
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const {
    data: threads = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['space-chats', groupId],
    queryFn: async () => {
      const res = await getContractsClient().threads.list({ query: {} });
      if (res.status !== 200) return [];
      return projectChatThreads(res.body, groupId);
    },
  });

  // Refresh when a chat is filed into / removed from a Space (event from the
  // chat-side MoveToSpaceDialog, which has no access to this query client).
  useEffect(() => {
    const onChanged = () => void refetch();
    window.addEventListener('gruenerator:space-threads-changed', onChanged);
    return () => window.removeEventListener('gruenerator:space-threads-changed', onChanged);
  }, [refetch]);

  return (
    <section aria-labelledby="projekt-chats-titel" className="flex flex-col gap-xs">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <h2 id="projekt-chats-titel" className="m-0">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex cursor-pointer items-center gap-xs rounded-md border-none bg-transparent px-sm py-1 font-[inherit] text-[15px] font-semibold text-foreground hover:bg-muted"
          >
            <PiCaretRight
              aria-hidden
              className={`size-4 transition-transform ${open ? 'rotate-90' : ''}`}
            />
            Bisherige Chats
            <span className="font-normal text-muted-foreground">{threads.length}</span>
          </button>
        </h2>
        {aside}
      </div>
      {!open ? null : threads.length === 0 ? (
        <p className="m-0 px-sm text-[15px] text-muted-foreground">
          Noch keine Chats. Starte oben den ersten.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {(showAll ? threads : threads.slice(0, CHATS_SHOWN)).map((t) => {
            const slug = t.slugSuffix ? buildChatThreadSlug(t.title, t.slugSuffix) : t.id;
            const isTeam = t.teamShared === true || t.accessType === 'group';
            const isOwn = !t.accessType || t.accessType === 'owner';
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
                  {isTeam && t.ownerName ? (
                    <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted-foreground">
                      <span
                        aria-hidden
                        className="flex size-5 items-center justify-center rounded-full bg-background-alt text-[11px] font-medium text-foreground"
                      >
                        {t.ownerName.trim().charAt(0).toUpperCase()}
                      </span>
                      {t.ownerName}
                    </span>
                  ) : null}
                  {isTeam ? (
                    <span className="shrink-0 rounded-full bg-background-alt px-2 py-0.5 text-xs font-medium text-foreground">
                      Team
                    </span>
                  ) : isOwn ? (
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      Privat
                    </span>
                  ) : null}
                  <span className="shrink-0 text-[13px] text-muted-foreground">
                    {formatRelativeDate(t.updatedAt)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {open && threads.length > CHATS_SHOWN && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="self-start cursor-pointer rounded-md border-none bg-transparent px-sm py-1 font-[inherit] text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {showAll ? 'Weniger anzeigen' : `Alle ${threads.length} Chats anzeigen`}
        </button>
      )}
    </section>
  );
}
