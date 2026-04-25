import { Skeleton, cn } from '@gruenerator/ui';
import { FiExternalLink } from 'react-icons/fi';

import { formatRelativeDate } from '../../../utils/dateFormatter';
import { useLastAddedDocuments, type RecentDocumentCard } from '../hooks/useLastAddedDocuments';

interface LastAddedSectionProps {
  collectionIds: string[];
  title?: string;
  limit?: number;
  showSourceLabel?: boolean;
}

const cardClass = cn(
  'group relative flex flex-col gap-xs bg-background border border-grey-200 dark:border-grey-700',
  'rounded-md px-md py-md min-h-[7rem]',
  'cursor-pointer transition-all duration-300 ease-out',
  'hover:-translate-y-0.5 hover:shadow-md',
  'no-underline text-foreground'
);

function Card({ item, showSourceLabel }: { item: RecentDocumentCard; showSourceLabel: boolean }) {
  const dateLabel = item.publishedAt ? formatRelativeDate(item.publishedAt) : null;
  const href = item.url;

  const inner = (
    <>
      <div className="flex items-center gap-xs text-xs text-grey-500 dark:text-grey-400">
        {showSourceLabel && (
          <span className="truncate font-medium text-secondary-600">{item.collectionName}</span>
        )}
        {showSourceLabel && dateLabel && <span aria-hidden>·</span>}
        {dateLabel && <span className="truncate">{dateLabel}</span>}
        {href && (
          <FiExternalLink
            className="ml-auto shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            size={12}
          />
        )}
      </div>
      <h3 className="m-0 line-clamp-2 text-sm font-semibold leading-snug text-foreground-heading">
        {item.title}
      </h3>
      {item.snippet && (
        <p className="m-0 line-clamp-3 text-sm text-grey-500 dark:text-grey-400">{item.snippet}</p>
      )}
    </>
  );

  if (href) {
    return (
      <a className={cardClass} href={href} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }
  return <div className={cardClass}>{inner}</div>;
}

const gridClass = 'grid gap-sm grid-cols-3 max-lg:grid-cols-2 max-sm:grid-cols-1';

function Loading({ count }: { count: number }) {
  return (
    <div className={gridClass}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex min-h-[7rem] flex-col gap-xs rounded-md border border-grey-200 px-md py-md dark:border-grey-700"
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function LastAddedSection({
  collectionIds,
  title = 'Zuletzt hinzugefügt',
  limit = 6,
  showSourceLabel,
}: LastAddedSectionProps) {
  const { data, isLoading } = useLastAddedDocuments({ collectionIds, limit });
  const items = data ?? [];
  const shouldShowSourceLabel = showSourceLabel ?? collectionIds.length > 1;

  if (!isLoading && items.length === 0) {
    return null;
  }

  return (
    <section className="w-full">
      <h2 className="mt-xl mb-md text-xl font-semibold text-foreground-heading">{title}</h2>
      {isLoading ? (
        <Loading count={limit} />
      ) : (
        <div className={gridClass}>
          {items.map((item) => (
            <Card key={item.id} item={item} showSourceLabel={shouldShowSourceLabel} />
          ))}
        </div>
      )}
    </section>
  );
}
