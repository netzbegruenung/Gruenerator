import {
  errMessage,
  formatFeedDate,
  groupFeedKindMeta,
  isPinned,
  personInitials,
  useUpdateGroupShare,
  type GroupFeedItem,
} from '@gruenerator/shared/groups';
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { useState } from 'react';
import {
  PiChatCircle,
  PiDotsThreeVertical,
  PiPushPin,
  PiPushPinFill,
  PiTrash,
} from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { FEED_KIND_ICONS, feedItemHref } from '../../config/groupFeedPresentation';

import { GroupCommentThread } from './GroupCommentThread';

export interface GroupFeedCardProps {
  item: GroupFeedItem;
  groupId: string;
  isAdmin: boolean;
  canComment: boolean;
  currentUserId: string | null;
  currentUserName: string | null;
  defaultOpen?: boolean;
  onUseTemplate: (id: string) => void;
  isCloning: boolean;
  onRemove: ((item: GroupFeedItem) => void) | null;
}

const BOARD_CELLS = [1, 1, 1, 1, 1, 0, 1].map((filled, i) => ({ id: `c${i}`, filled: !!filled }));

export function FeedPreview({ item, size }: { item: GroupFeedItem; size: 'feed' | 'tile' }) {
  const Icon = FEED_KIND_ICONS[item.kind];
  const isImage = item.kind === 'sharepic' || item.kind === 'sharepic-template';

  if (isImage && item.thumbnailUrl) {
    return (
      <img
        src={item.thumbnailUrl}
        alt=""
        loading="lazy"
        className={cn(
          'rounded-sm object-contain shadow-md',
          size === 'feed' ? 'max-h-[260px] max-w-[85%]' : 'size-full object-cover shadow-none'
        )}
      />
    );
  }
  if (item.kind === 'doc' || item.kind === 'text') {
    return (
      <div
        className={cn(
          'flex flex-col gap-2 bg-card text-left shadow-md',
          size === 'feed'
            ? 'mt-xl h-[240px] w-[360px] max-w-[80%] self-end rounded-t-sm px-lg py-md'
            : 'absolute inset-x-md bottom-0 top-md rounded-t-sm p-sm'
        )}
      >
        <span className="line-clamp-2 text-sm font-bold leading-snug">{item.title}</span>
        {item.excerpt ? (
          <span className="line-clamp-5 text-[13px] leading-relaxed text-muted-foreground">
            {item.excerpt}
          </span>
        ) : (
          <span aria-hidden className="flex flex-col gap-1.5 pt-1">
            {[92, 100, 84, 96, 60].map((w) => (
              <span
                key={w}
                className="h-2 rounded-full bg-grey-100 dark:bg-grey-700"
                style={{ width: `${w}%` }}
              />
            ))}
          </span>
        )}
      </div>
    );
  }
  if (item.kind === 'board') {
    return (
      <div
        aria-hidden
        className={cn(
          'grid grid-cols-3 gap-2.5 rounded-md bg-card p-md shadow-md',
          size === 'feed' ? 'w-[400px] max-w-[84%]' : 'w-[85%]'
        )}
      >
        {['Zu erledigen', 'In Arbeit', 'Erledigt'].map((col) => (
          <span
            key={col}
            className="truncate text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
          >
            {col}
          </span>
        ))}
        {BOARD_CELLS.map((cell) => (
          <span
            key={cell.id}
            className={cn('h-8 rounded-md', cell.filled && 'bg-grey-100 dark:bg-grey-700')}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-sm text-primary-600 dark:text-primary-400">
      <span className="flex size-[72px] items-center justify-center rounded-[18px] bg-card shadow-sm">
        <Icon className="size-8" aria-hidden />
      </span>
      {item.excerpt && size === 'feed' && (
        <span className="line-clamp-1 max-w-[80%] text-[13px] text-muted-foreground">
          {item.excerpt}
        </span>
      )}
    </div>
  );
}

export function GroupFeedCard({
  item,
  groupId,
  isAdmin,
  canComment,
  currentUserId,
  currentUserName,
  defaultOpen = false,
  onUseTemplate,
  isCloning,
  onRemove,
}: GroupFeedCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const updateShare = useUpdateGroupShare(groupId);
  const pinned = isPinned(item);
  const share = item.share;
  const href = feedItemHref(item);
  const kindLabel = groupFeedKindMeta(item.kind).label;
  const threadId = `kommentare-${item.key}`;
  const isTemplate = item.kind === 'sharepic-template';

  const preview = (
    <div className="relative flex h-[300px] items-center justify-center overflow-hidden rounded-[14px] bg-background-alt">
      <FeedPreview item={item} size="feed" />
    </div>
  );

  return (
    <article
      {...(share && { id: `beitrag-${share.shareId}` })}
      aria-label={item.title}
      className={cn(
        'flex scroll-mt-lg flex-col overflow-hidden rounded-[20px] bg-card',
        pinned ? 'border border-primary-200 dark:border-primary-800' : 'shadow-sm'
      )}
    >
      {pinned && (
        <div className="flex items-center gap-1.5 bg-primary-50 px-md py-2.5 text-[13px] font-bold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
          <PiPushPinFill aria-hidden className="size-4" />
          {share?.pinnedByName ? `Angeheftet von ${share.pinnedByName}` : 'Angeheftet'}
        </div>
      )}

      <header className="flex items-center gap-sm px-md pt-md">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary-100 text-sm font-bold text-secondary-800 dark:bg-secondary-800 dark:text-secondary-100"
        >
          {personInitials(item.sharedByName)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <strong className="truncate text-[15px]">{item.sharedByName ?? 'Jemand'}</strong>
          <span className="truncate text-[13px] text-muted-foreground">
            {[formatFeedDate(item.sharedAt), kindLabel].filter(Boolean).join(' · ')}
          </span>
        </div>
        {isAdmin && share && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={pinned ? 'Lösen' : 'Anheften'}
            aria-pressed={pinned}
            disabled={updateShare.isPending}
            onClick={() => updateShare.mutate({ shareId: share.shareId, pinned: !pinned })}
            className={cn(
              pinned &&
                'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
            )}
          >
            {pinned ? <PiPushPinFill /> : <PiPushPin />}
          </Button>
        )}
        {onRemove && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Aktionen für ${item.title}`}>
                <PiDotsThreeVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onClick={() => onRemove(item)}>
                <PiTrash className="mr-xs size-4" />
                Aus Gruppe entfernen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {share?.note && (
        <p className="mx-md mb-0 mt-sm whitespace-pre-wrap text-base leading-relaxed">
          {share.note}
        </p>
      )}
      {updateShare.isError && (
        <p className="mx-md mb-0 mt-xs text-sm text-red-600 dark:text-red-400">
          {errMessage(updateShare.error)}
        </p>
      )}

      <div className="mx-md mt-md">
        {href ? (
          <Link to={href} tabIndex={-1} aria-hidden className="block">
            {preview}
          </Link>
        ) : (
          preview
        )}
      </div>

      <footer className="flex items-center justify-between gap-sm px-md py-sm">
        <h3 className="m-0 min-w-0 truncate text-[17px] font-semibold">{item.title}</h3>
        <div className="flex shrink-0 items-center gap-1">
          {canComment && share && (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={open}
              aria-controls={threadId}
              aria-label={`Kommentare (${share.commentCount})`}
              onClick={() => setOpen((o) => !o)}
              className={cn(
                open &&
                  'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
              )}
            >
              <PiChatCircle aria-hidden />
              {share.commentCount}
            </Button>
          )}
          {isTemplate ? (
            <Button
              variant="brand"
              size="sm"
              disabled={isCloning}
              onClick={() => onUseTemplate(item.id)}
            >
              {isCloning ? 'Wird geöffnet …' : 'Verwenden'}
            </Button>
          ) : href ? (
            <Button variant="brand" size="sm" asChild>
              <Link to={href}>Öffnen</Link>
            </Button>
          ) : null}
        </div>
      </footer>

      {open && canComment && share && (
        <GroupCommentThread
          id={threadId}
          groupId={groupId}
          shareId={share.shareId}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          isAdmin={isAdmin}
        />
      )}
    </article>
  );
}
