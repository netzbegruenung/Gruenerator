import { Badge, SectionHeader } from '@gruenerator/ui';
import { useState, type ComponentProps } from 'react';

import { useEntityFavorites } from '../../favorites/hooks/useEntityFavorites';
import { useEntityLikes } from '../../likes/hooks/useEntityLikes';

import type { GalleryTemplate } from '@gruenerator/contracts';

import IndexCard from '@/components/common/IndexCard';
import TemplatePreviewModal from '@/components/common/TemplatePreviewModal';

const GRID_CLASS =
  'grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-lg max-md:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]';

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
          const templateType =
            typeof t.template_type === 'string' && t.template_type
              ? t.template_type.charAt(0).toUpperCase() + t.template_type.slice(1)
              : 'Vorlage';
          return (
            <IndexCard
              key={String(t.id)}
              id={String(t.id)}
              title={t.title || 'Unbenannte Vorlage'}
              description={t.description || ''}
              thumbnailUrl={t.thumbnail_url || ''}
              tags={Array.isArray(t.tags) ? t.tags.slice(0, 5) : []}
              onClick={() => setPreview(t)}
              meta={<Badge variant="secondary">{templateType}</Badge>}
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
