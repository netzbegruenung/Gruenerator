import {
  formatFeedDate,
  groupFeedByKind,
  groupFeedKindMeta,
  isPinned,
  useUpdateGroupShare,
  type GroupFeedItem,
} from '@gruenerator/shared/groups';
import { cn } from '@gruenerator/ui';
import { type ReactNode } from 'react';
import { PiPushPin, PiPushPinFill, PiX } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { FEED_KIND_ICONS, feedItemHref } from '../../config/groupFeedPresentation';

import { FeedPreview } from './GroupFeedCard';

interface GroupAllViewProps {
  items: GroupFeedItem[];
  groupId: string;
  isAdmin: boolean;
  showPinned: boolean;
  onUseTemplate: (id: string) => void;
  /** Links und Chats der Gruppe — eigene Komponenten, hängen unten an. */
  children?: ReactNode;
}

/** Titel als einziges Bedienelement; `after:` spannt die Klickfläche über die Karte. */
function ItemAction({
  item,
  onUseTemplate,
  className,
}: {
  item: GroupFeedItem;
  onUseTemplate: (id: string) => void;
  className?: string;
}) {
  const cls = cn(
    'min-w-0 truncate text-left text-foreground no-underline after:absolute after:inset-0 after:content-[""]',
    className
  );
  if (item.kind === 'sharepic-template') {
    return (
      <button
        type="button"
        className={cn(cls, 'cursor-pointer border-none bg-transparent p-0 font-[inherit]')}
        onClick={() => onUseTemplate(item.id)}
      >
        {item.title}
      </button>
    );
  }
  const href = feedItemHref(item);
  return href ? (
    <Link to={href} className={cls}>
      {item.title}
    </Link>
  ) : (
    <span className={cn(cls, 'after:content-none')}>{item.title}</span>
  );
}

function PinToggle({
  groupId,
  item,
  variant,
}: {
  groupId: string;
  item: GroupFeedItem;
  variant: 'chip' | 'remove';
}) {
  const update = useUpdateGroupShare(groupId);
  const pinned = isPinned(item);
  if (!item.share) return null;
  const shareId = item.share.shareId;
  return (
    <button
      type="button"
      aria-label={pinned ? `${item.title} lösen` : `${item.title} anheften`}
      {...(variant === 'chip' && { 'aria-pressed': pinned })}
      disabled={update.isPending}
      onClick={() => update.mutate({ shareId, pinned: !pinned })}
      className={cn(
        'relative z-10 flex cursor-pointer items-center justify-center border-none p-0',
        variant === 'chip'
          ? cn(
              'size-8 rounded-full shadow-sm',
              pinned ? 'bg-primary-600 text-white' : 'bg-card text-muted-foreground'
            )
          : 'size-6 rounded-md bg-transparent text-muted-foreground hover:bg-background-alt'
      )}
    >
      {variant === 'remove' ? (
        <PiX className="size-3.5" />
      ) : pinned ? (
        <PiPushPinFill />
      ) : (
        <PiPushPin />
      )}
    </button>
  );
}

export function GroupAllView({
  items,
  groupId,
  isAdmin,
  showPinned,
  onUseTemplate,
  children,
}: GroupAllViewProps) {
  const pinned = items.filter(isPinned);
  const sections = groupFeedByKind(items);

  return (
    <div className="flex flex-col gap-2xl">
      {showPinned && pinned.length > 0 && (
        <section aria-labelledby="angeheftet-titel" className="flex flex-col gap-2.5">
          <h2
            id="angeheftet-titel"
            className="m-0 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary-700 dark:text-primary-300"
          >
            <PiPushPinFill aria-hidden /> Angeheftet
          </h2>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-sm p-0">
            {pinned.map((item) => {
              const Icon = FEED_KIND_ICONS[item.kind];
              return (
                <li
                  key={item.key}
                  className="relative flex min-w-0 items-center gap-sm rounded-[14px] bg-card p-2.5 shadow-sm hover:shadow-md"
                >
                  <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <Icon className="size-6" aria-hidden />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 pr-md">
                    <ItemAction
                      item={item}
                      onUseTemplate={onUseTemplate}
                      className="text-[15px] font-bold"
                    />
                    <span className="text-[13px] text-muted-foreground">
                      {groupFeedKindMeta(item.kind).label}
                    </span>
                  </span>
                  {isAdmin && (
                    <span className="absolute right-1.5 top-1.5">
                      <PinToggle groupId={groupId} item={item} variant="remove" />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {sections.map((section) => (
        <section
          key={section.id}
          id={`abschnitt-${section.id}`}
          aria-labelledby={`abschnitt-${section.id}-titel`}
          className="flex scroll-mt-lg flex-col gap-sm"
        >
          <div className="flex items-baseline gap-xs">
            <h2 id={`abschnitt-${section.id}-titel`} className="m-0 text-xl font-semibold">
              {section.plural}
            </h2>
            <span className="text-sm text-muted-foreground">{section.items.length}</span>
          </div>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-md p-0">
            {section.items.map((item) => (
              <li
                key={item.key}
                className="relative flex flex-col overflow-hidden rounded-2xl bg-card shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="relative flex h-[200px] items-center justify-center overflow-hidden bg-background-alt">
                  <FeedPreview item={item} size="tile" />
                  {isAdmin && (
                    <span className="absolute right-2.5 top-2.5">
                      <PinToggle groupId={groupId} item={item} variant="chip" />
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 px-md pb-md pt-sm">
                  <h3 className="m-0 truncate text-[17px] font-semibold">
                    <ItemAction item={item} onUseTemplate={onUseTemplate} />
                  </h3>
                  <span className="truncate text-sm text-muted-foreground">
                    {[item.sharedByName?.split(' ')[0], formatFeedDate(item.sharedAt, 'short')]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {children}
    </div>
  );
}
