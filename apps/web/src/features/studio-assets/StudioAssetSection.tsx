import { type StudioAssetItem } from '@gruenerator/contracts';
import {
  useStudioAssetToggles,
  type StudioAssetSectionData,
} from '@gruenerator/shared/studio-assets';
import { Button, SectionHeader } from '@gruenerator/ui';
import { type JSX, type ReactNode } from 'react';

import { GalleryGrid, GallerySkeleton } from '../../components/common/Gallery/parts';

import { StudioAssetCard } from './StudioAssetCard';
import { type StudioAssetHandlers } from './useStudioAssetActions';

function StudioAssetTile({
  item,
  handlers,
}: {
  item: StudioAssetItem;
  handlers: StudioAssetHandlers;
}): JSX.Element {
  const { toggleLike, toggleFavorite } = useStudioAssetToggles(item.id);
  return (
    <StudioAssetCard
      item={item}
      {...handlers}
      onToggleLike={toggleLike}
      onToggleFavorite={toggleFavorite}
    />
  );
}

/** Ein Abschnitt „Sticker“ bzw. „Hintergründe“ — dieselbe Überschrift wie auf `/grueneratoren`. */
export function StudioAssetSection({
  title,
  data,
  handlers,
  aside,
}: {
  title: string;
  data: StudioAssetSectionData;
  handlers: StudioAssetHandlers;
  aside?: ReactNode;
}): JSX.Element {
  return (
    <section aria-label={title} className="flex flex-col">
      <SectionHeader title={title} actions={aside} />
      <GalleryGrid size="small">
        {data.isLoading ? (
          <GallerySkeleton count={4} className="aspect-[4/5]" />
        ) : (
          data.items.map((item) => (
            <StudioAssetTile key={item.id} item={item} handlers={handlers} />
          ))
        )}
        {data.isFetchingNextPage && <GallerySkeleton count={4} className="aspect-[4/5]" />}
      </GalleryGrid>
      {data.error && data.items.length > 0 ? (
        <div className="mt-md flex flex-col items-center gap-xs">
          <p role="alert" className="m-0 text-center text-sm text-error">
            {data.error.message}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={data.retry}
            disabled={data.isFetchingNextPage}
          >
            Erneut versuchen
          </Button>
        </div>
      ) : (
        data.hasNextPage && (
          <Button
            variant="outline"
            size="sm"
            className="mt-md self-center"
            onClick={data.fetchNextPage}
            disabled={data.isFetchingNextPage}
          >
            {data.isFetchingNextPage ? 'Lädt …' : 'Mehr laden'}
          </Button>
        )
      )}
    </section>
  );
}
