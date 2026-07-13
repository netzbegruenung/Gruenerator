import { Skeleton, cn } from '@gruenerator/ui';
import { FiExternalLink } from 'react-icons/fi';

import { formatRelativeDate } from '../../../utils/dateFormatter';
import { useLastAddedDocuments, type RecentDocumentCard } from '../hooks/useLastAddedDocuments';

interface LastAddedSectionProps {
  collectionIds: string[];
  title?: string;
  limit?: number;
  showSourceLabel?: boolean;
  /** Embedded in the Manuelle-Recherche sub-tab: drop the standalone heading. */
  embedded?: boolean;
}

// 2a content card: white, soft green-tinted border, 14px radius, hover lift.
const cardClass = cn(
  'group relative flex flex-col gap-2 min-h-[7rem] no-underline',
  'rounded-[14px] px-5 pb-[18px] pt-5',
  'bg-white dark:bg-[#1B2C24]',
  'border border-[rgba(82,144,122,0.18)] dark:border-[#2C4A3B]',
  'shadow-[0_4px_14px_rgba(31,63,51,0.05)]',
  'cursor-pointer transition-all duration-200 ease-out',
  'hover:-translate-y-0.5 hover:border-[#52907A] hover:shadow-[0_10px_24px_rgba(31,63,51,0.10)]'
);

function Card({ item, showSourceLabel }: { item: RecentDocumentCard; showSourceLabel: boolean }) {
  const dateLabel = item.publishedAt ? formatRelativeDate(item.publishedAt) : null;
  const href = item.url;

  const inner = (
    <>
      <div className="flex items-center gap-xs text-xs text-[#8B978F] dark:text-[#8FA79A]">
        {showSourceLabel && (
          <span className="truncate font-medium text-[#52907A]">{item.collectionName}</span>
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
      <h3 className="m-0 line-clamp-2 text-[15px] font-bold leading-[1.35] text-[#22382E] dark:text-[#E4EDE8]">
        {item.title}
      </h3>
      {item.snippet && (
        <p className="m-0 line-clamp-3 text-[13px] leading-[1.55] text-[#5C6B63] dark:text-[#A6B7AE]">
          {item.snippet}
        </p>
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
          className="flex min-h-[7rem] flex-col gap-xs rounded-[14px] border border-[rgba(82,144,122,0.18)] bg-white px-5 py-5 dark:border-[#2C4A3B] dark:bg-[#1B2C24]"
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
  limit = 3,
  showSourceLabel,
  embedded = false,
}: LastAddedSectionProps) {
  const { data, isLoading } = useLastAddedDocuments({ collectionIds, limit });
  const items = data ?? [];
  const shouldShowSourceLabel = showSourceLabel ?? collectionIds.length > 1;

  if (!isLoading && items.length === 0) {
    return null;
  }

  return (
    <section className="w-full">
      {!embedded && (
        <h2 className="mt-xl mb-md text-xl font-semibold text-foreground-heading">{title}</h2>
      )}
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
