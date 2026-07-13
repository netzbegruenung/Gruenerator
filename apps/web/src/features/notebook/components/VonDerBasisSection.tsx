import { buildNotebookSlug } from '@gruenerator/shared/utils';
import { Skeleton, SectionHeader } from '@gruenerator/ui';
import { memo, useMemo, useState } from 'react';
import { FiUser } from 'react-icons/fi';
import { HiBookOpen } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';

import { LikeButton } from '../../../components/common/LikeButton';
import { useEntityLikes } from '../../likes/hooks/useEntityLikes';
import { usePublicNotebookCollections } from '../hooks/usePublicNotebookCollections';

import NotebookGalleryCard from './NotebookGalleryCard';

import type { NotebookCollection } from '../../../types/notebook';

// Mirrors the grid used by the system and "Eigene" sections so the whole
// /notebooks gallery reads as one system of tall cards.
const NOTEBOOK_GRID_CLASS =
  'grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-md max-sm:grid-cols-2';

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
  // Route prefix is `/notebooks/` (plural); the legacy `/notebook/:id` singular
  // path only existed to redirect, so building the URL correctly the first time
  // avoids an extra hop. Use the pretty slug when the row has one, falling back
  // to the UUID for legacy pre-backfill collections.
  const href = `/notebooks/${
    collection.slug_suffix
      ? buildNotebookSlug(collection.name, collection.slug_suffix)
      : collection.id
  }`;
  // "Von der Basis" is the community gallery, so author attribution is the
  // distinguishing meta; fall back to the description when no creator is set.
  const meta = collection.creator_name
    ? `von ${collection.creator_name}`
    : (collection.description ?? undefined);

  return (
    <NotebookGalleryCard
      title={collection.name}
      meta={meta}
      icon={HiBookOpen}
      metaIcon={collection.creator_name ? FiUser : undefined}
      accent="pink"
      onActivate={() => void navigate(href)}
      action={
        <LikeButton
          liked={liked}
          count={collection.likes_count ?? 0}
          loading={toggling}
          disabled={!canLike}
          disabledReason={canLike ? undefined : 'Melde dich an, um zu liken'}
          onToggle={() => onToggleLike(collection.id)}
        />
      }
    />
  );
});

const SKELETON_KEYS = ['skeleton-0', 'skeleton-1', 'skeleton-2'];

export function VonDerBasisSection() {
  const { data, isLoading } = usePublicNotebookCollections({ enabled: true });
  const { likedIds, toggleLike, isToggling, canLike } = useEntityLikes('notebook');
  const [query, setQuery] = useState('');

  const collections = useMemo(() => data ?? [], [data]);
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
        <div className={NOTEBOOK_GRID_CLASS}>
          {SKELETON_KEYS.map((key) => (
            <div
              key={key}
              className="overflow-hidden rounded-xl border border-grey-200/80 dark:border-grey-700/60"
            >
              <Skeleton className="aspect-[5/4] rounded-none" />
              <div className="px-3 py-2.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="mt-1.5 h-3 w-1/2" />
              </div>
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
          Keine Treffer für „{query}“.
        </p>
      ) : (
        <div className={NOTEBOOK_GRID_CLASS}>
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
