import { SectionHeader } from '@gruenerator/ui';
import { useState, type ComponentProps } from 'react';

import { useEntityFavorites } from '../../favorites/hooks/useEntityFavorites';
import { useEntityLikes } from '../../likes/hooks/useEntityLikes';

import type { GalleryTemplate } from '@gruenerator/contracts';

import VorlagenCard from '@/components/common/Gallery/VorlagenCard';
import TemplatePreviewModal from '@/components/common/TemplatePreviewModal';

const GRID_CLASS =
  'grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-5 max-md:grid-cols-[repeat(auto-fill,minmax(165px,1fr))] max-md:gap-3';

// The gallery card reads a tight subset of fields; map the loosely-typed
// gallery template onto it (boundary cast for the unknown-typed columns).
const toCardItem = (t: GalleryTemplate): ComponentProps<typeof VorlagenCard>['item'] => ({
  id: String(t.id),
  title: t.title || 'Unbenannte Vorlage',
  template_type: typeof t.template_type === 'string' ? t.template_type : undefined,
  tags: Array.isArray(t.tags) ? t.tags : undefined,
  thumbnail_url: t.thumbnail_url ?? undefined,
  external_url: t.external_url ?? undefined,
  content_data: (t.content_data ?? undefined) as Record<string, unknown> | undefined,
  likes_count: typeof t.likes_count === 'number' ? t.likes_count : undefined,
});

/**
 * "Favoriten" section on /vorlagen/meine. Lists the templates the user has
 * starred (system, community, or their own) and opens the same rich preview
 * popup used in the gallery, where like/favorite live.
 */
const FavoriteVorlagenSection = (): React.ReactNode => {
  const [preview, setPreview] = useState<GalleryTemplate | null>(null);

  const {
    favoriteTemplates,
    favoritedIds,
    toggleFavorite,
    isToggling: isFavoriteToggling,
    canFavorite,
  } = useEntityFavorites('template');
  const { likedIds, toggleLike, isToggling: isLikeToggling, canLike } = useEntityLikes('template');

  // Hide entirely until the user has favorites — keeps the page uncluttered.
  if (favoriteTemplates.length === 0) return null;

  const previewId = preview ? String(preview.id) : '';

  return (
    <section className="mb-xl">
      <SectionHeader title={`Favoriten (${favoriteTemplates.length})`} />
      <div className={GRID_CLASS}>
        {favoriteTemplates.map((t) => {
          const id = String(t.id);
          return (
            <VorlagenCard
              key={id}
              item={toCardItem(t)}
              onOpen={() => setPreview(t)}
              liked={likedIds.has(id)}
              onToggleLike={canLike ? () => toggleLike(id) : undefined}
              likeToggling={isLikeToggling(id)}
            />
          );
        })}
      </div>

      {preview && (
        <TemplatePreviewModal
          isOpen={!!preview}
          onClose={() => setPreview(null)}
          // Loose gallery object → modal's loose template shape (boundary cast).
          template={preview as ComponentProps<typeof TemplatePreviewModal>['template']}
          liked={likedIds.has(previewId)}
          likeCount={(preview.likes_count as number | undefined) ?? 0}
          onToggleLike={() => toggleLike(previewId)}
          likeToggling={isLikeToggling(previewId)}
          canLike={canLike}
          favorited={favoritedIds.has(previewId)}
          onToggleFavorite={() => toggleFavorite(previewId)}
          favoriteToggling={isFavoriteToggling(previewId)}
          canFavorite={canFavorite}
        />
      )}
    </section>
  );
};

export default FavoriteVorlagenSection;
