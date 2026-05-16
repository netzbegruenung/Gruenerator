import { Skeleton, SectionHeader } from '@gruenerator/ui';
import { memo, useMemo, useState } from 'react';
import { HiBookOpen } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';

import { LikeButton } from '../../../components/common/LikeButton';
import { useEntityLikes } from '../../likes/hooks/useEntityLikes';
import { usePublicNotebookCollections } from '../hooks/usePublicNotebookCollections';

import type { NotebookCollection } from '../../../types/notebook';

interface VonDerBasisCardProps {
  collection: NotebookCollection;
  liked: boolean;
  toggling: boolean;
  canLike: boolean;
  onToggleLike: (id: string) => void;
}

const VonDerBasisCard = memo(function VonDerBasisCard({
  collection,
  liked,
  toggling,
  canLike,
  onToggleLike,
}: VonDerBasisCardProps) {
  const navigate = useNavigate();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => void navigate(`/notebook/${collection.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void navigate(`/notebook/${collection.id}`);
        }
      }}
      className="group flex min-h-[4rem] cursor-pointer items-center gap-sm rounded-md border border-grey-200 bg-background px-md py-md transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md dark:border-grey-700"
    >
      <HiBookOpen className="shrink-0 text-base text-secondary-600" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground-heading">
          {collection.name}
        </div>
        {collection.description ? (
          <div className="truncate text-xs text-grey-500 dark:text-grey-400">
            {collection.description}
          </div>
        ) : null}
      </div>
      <LikeButton
        liked={liked}
        count={collection.likes_count ?? 0}
        loading={toggling}
        disabled={!canLike}
        disabledReason={canLike ? undefined : 'Melde dich an, um zu liken'}
        onToggle={() => onToggleLike(collection.id)}
      />
    </div>
  );
});

export function VonDerBasisSection() {
  const { data, isLoading } = usePublicNotebookCollections({ enabled: true });
  const { likedIds, toggleLike, isToggling, canLike } = useEntityLikes('notebook');
  const [query, setQuery] = useState('');

  const collections = data ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return collections;
    return collections.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q)
    );
  }, [collections, query]);

  return (
    <section className="mt-xl">
      <SectionHeader
        title="Von der Basis"
        searchQuery={query}
        onSearchChange={setQuery}
        searchPlaceholder="Notizbücher durchsuchen…"
      />

      {isLoading ? (
        <div className="grid grid-cols-3 gap-sm max-lg:grid-cols-2 max-sm:grid-cols-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex min-h-[4rem] items-center gap-sm rounded-md border border-grey-200 px-md py-md dark:border-grey-700"
            >
              <Skeleton className="size-5 shrink-0 rounded" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      ) : collections.length === 0 ? (
        <p className="rounded-md border border-dashed border-grey-300 px-md py-lg text-center text-sm text-grey-500 dark:border-grey-700 dark:text-grey-400">
          Noch keine öffentlichen Notebooks. Sei der oder die Erste — veröffentliche eines deiner
          Notebooks im Editor.
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-md border border-dashed border-grey-300 px-md py-lg text-center text-sm text-grey-500 dark:border-grey-700 dark:text-grey-400">
          Keine Treffer für „{query}".
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-sm max-lg:grid-cols-2 max-sm:grid-cols-1">
          {filtered.map((c) => (
            <VonDerBasisCard
              key={c.id}
              collection={c}
              liked={likedIds.has(c.id)}
              toggling={isToggling(c.id)}
              canLike={canLike}
              onToggleLike={toggleLike}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default VonDerBasisSection;
