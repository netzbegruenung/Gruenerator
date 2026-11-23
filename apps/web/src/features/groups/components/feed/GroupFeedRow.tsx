import { groupFeedKindMeta, isPinned } from '@gruenerator/shared/groups';
import { useState } from 'react';
import { PiChatCircle, PiPushPinFill } from 'react-icons/pi';

import { FEED_KIND_ICONS } from '../../config/groupFeedPresentation';
import { formatRelativeDate } from '../SpaceChatsSection';

import { GroupFeedCard, type GroupFeedCardProps } from './GroupFeedCard';

/**
 * Ein Austausch-Eintrag als schlanke Zeile, im Stil der Chat-Zeilen der Übersicht
 * (Symbol, Titel, kleine Angaben rechts). Ein Klick klappt die volle Karte an
 * Ort und Stelle auf — mit Kommentaren, Reaktionen, Anheften, Menü, Bearbeiten
 * und Melden, nichts davon geht verloren. `defaultOpen` (Deep-Link
 * `?beitrag=<shareId>`, „Im Austausch besprechen") startet aufgeklappt.
 */
export function GroupFeedRow(props: GroupFeedCardProps) {
  const { item } = props;
  const [open, setOpen] = useState(props.defaultOpen ?? false);

  if (open) {
    return (
      <li className="my-xs">
        <GroupFeedCard {...props} onCollapse={() => setOpen(false)} />
      </li>
    );
  }

  const Icon = FEED_KIND_ICONS[item.kind];
  const share = item.share;
  const pinned = isPinned(item);
  const title =
    item.title || item.post?.body.split('\n')[0]?.trim() || groupFeedKindMeta(item.kind).label;

  return (
    <li {...(share && { id: `beitrag-${share.shareId}` })} className="scroll-mt-lg">
      <button
        type="button"
        aria-expanded={false}
        onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center gap-sm rounded-md border-none bg-transparent px-sm py-2 text-left text-foreground transition-colors hover:bg-background-alt"
      >
        <Icon aria-hidden className="size-[18px] shrink-0 text-grey-500" />
        <span className="min-w-0 flex-1 truncate text-[15px]">{title}</span>
        {item.sharedByName ? (
          <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted-foreground">
            <span
              aria-hidden
              className="flex size-5 items-center justify-center rounded-full bg-background-alt text-[11px] font-medium text-foreground"
            >
              {item.sharedByName.trim().charAt(0).toUpperCase()}
            </span>
            {item.sharedByName}
          </span>
        ) : null}
        {pinned ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
            <PiPushPinFill aria-hidden className="size-3" />
            Angeheftet
          </span>
        ) : null}
        {share && share.commentCount > 0 ? (
          <span
            className="flex shrink-0 items-center gap-1 text-[13px] text-muted-foreground"
            aria-label={`${share.commentCount} Kommentare`}
          >
            <PiChatCircle aria-hidden className="size-4" />
            {share.commentCount}
          </span>
        ) : null}
        <span className="shrink-0 text-[13px] text-muted-foreground">
          {item.sharedAt ? formatRelativeDate(item.sharedAt) : null}
        </span>
      </button>
    </li>
  );
}
