import { SectionHeader } from '@gruenerator/ui';
import { useMemo, useState, type ComponentProps } from 'react';

import { useEntityFavorites } from '../../favorites/hooks/useEntityFavorites';
import { useSharepicVorlagen } from '../hooks/useSharepicVorlagen';
import { useVorlageInteractions } from '../hooks/useVorlageInteractions';

import { SharepicVorlageDialog } from './SharepicVorlageDialog';
import { catalogCardProps } from './SharepicVorlagenSection';

import type { GalleryTemplate, SharepicVorlage } from '@gruenerator/contracts';

import VorlagenCard from '@/components/common/Gallery/VorlagenCard';
import TemplatePreviewModal from '@/components/common/TemplatePreviewModal';

const GRID_CLASS =
  'grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-5 max-md:grid-cols-[repeat(auto-fill,minmax(165px,1fr))] max-md:gap-3';

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
 * "Favoriten" section on /vorlagen/meine. Lists the Vorlagen the user has
 * bookmarked — Grünerator-Vorlagen from the catalogue and gallery templates
 * (system, community, or their own) — with the same previews as the gallery.
 */
const FavoriteVorlagenSection = (): React.ReactNode => {
  const [preview, setPreview] = useState<GalleryTemplate | null>(null);
  const [openCatalog, setOpenCatalog] = useState<SharepicVorlage | null>(null);

  const { favoriteTemplates, favoritedIds } = useEntityFavorites('template');
  const { data: catalogue } = useSharepicVorlagen();
  const favoriteCatalogue = useMemo(
    () => (catalogue ?? []).filter((v) => favoritedIds.has(v.id)),
    [catalogue, favoritedIds]
  );
  const ids = useMemo(
    () => [...favoriteCatalogue.map((v) => v.id), ...favoriteTemplates.map((t) => String(t.id))],
    [favoriteCatalogue, favoriteTemplates]
  );
  const { cardProps, likesCount } = useVorlageInteractions(ids);

  // Hide entirely until the user has favorites — keeps the page uncluttered.
  if (ids.length === 0) return null;

  const previewId = preview ? String(preview.id) : '';
  const previewProps = cardProps(previewId);

  return (
    <section className="mb-xl">
      <SectionHeader title={`Favoriten (${ids.length})`} />
      <div className={GRID_CLASS}>
        {favoriteCatalogue.map((v) => (
          <VorlagenCard
            key={v.id}
            {...catalogCardProps(v, likesCount(v.id))}
            onOpen={() => setOpenCatalog(v)}
            {...cardProps(v.id)}
          />
        ))}
        {favoriteTemplates.map((t) => {
          const id = String(t.id);
          return (
            <VorlagenCard
              key={id}
              item={{ ...toCardItem(t), likes_count: likesCount(id, t.likes_count as number) }}
              onOpen={() => setPreview(t)}
              {...cardProps(id)}
            />
          );
        })}
      </div>

      {openCatalog && (
        <SharepicVorlageDialog vorlage={openCatalog} onClose={() => setOpenCatalog(null)} />
      )}
      {preview && (
        <TemplatePreviewModal
          isOpen={!!preview}
          onClose={() => setPreview(null)}
          // Loose gallery object → modal's loose template shape (boundary cast).
          template={preview as ComponentProps<typeof TemplatePreviewModal>['template']}
          liked={previewProps.liked}
          likeCount={likesCount(previewId, preview.likes_count as number)}
          onToggleLike={() => previewProps.onToggleLike?.()}
          likeToggling={previewProps.likeToggling}
          canLike={Boolean(previewProps.onToggleLike)}
          favorited={previewProps.favorited}
          onToggleFavorite={() => previewProps.onToggleFavorite?.()}
          favoriteToggling={previewProps.favoriteToggling}
          canFavorite={Boolean(previewProps.onToggleFavorite)}
        />
      )}
    </section>
  );
};

export default FavoriteVorlagenSection;
