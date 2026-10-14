import { type StudioAssetKind, type StudioAssetScope } from '@gruenerator/contracts';
import { useStudioAssets } from '@gruenerator/shared/studio-assets';
import { Button } from '@gruenerator/ui';

import { type GalleryAsset } from '../utils/galleryAsset';

import { TOOL_HINT } from './ToolUi';

import { cn } from '@/utils/cn';

const NOUN: Record<StudioAssetKind, string> = { sticker: 'Sticker', background: 'Hintergründe' };

const EMPTY: Record<StudioAssetScope, (noun: string) => string> = {
  shop: (noun) => `Unter „Entdecken“ gibt es noch keine ${noun}.`,
  mine: (noun) => `Du hast noch keine eigenen ${noun}.`,
  saved: (noun) => `Du hast dir noch keine ${noun} gemerkt.`,
};

export interface ProfilbildGalleryGridProps {
  kind: StudioAssetKind;
  scope: StudioAssetScope;
  tileClassName: string;
  disabled?: boolean;
  /** The src of the item in use, marked pressed; null when the tiles only add. */
  selectedSrc?: string | null;
  onPick: (item: GalleryAsset) => void;
}

/** One gallery list (Entdecken, Meine or Gemerkt) as picker tiles. */
export function ProfilbildGalleryGrid({
  kind,
  scope,
  tileClassName,
  disabled = false,
  selectedSrc = null,
  onPick,
}: ProfilbildGalleryGridProps) {
  const { items, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } =
    useStudioAssets({ kind, scope, q: '', sort: 'new' });
  const hint = cn(TOOL_HINT, 'm-0 text-xs');

  if (isLoading) return <p className={hint}>Wird geladen …</p>;
  if (isError && items.length === 0)
    return (
      <div role="alert" className="flex flex-wrap items-center gap-sm">
        <p className={hint}>{NOUN[kind]} konnten nicht geladen werden.</p>
        <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
          Erneut versuchen
        </Button>
      </div>
    );
  if (items.length === 0) return <p className={hint}>{EMPTY[scope](NOUN[kind])}</p>;

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex flex-wrap gap-sm">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            title={item.title}
            disabled={disabled}
            {...(selectedSrc === null ? {} : { 'aria-pressed': selectedSrc === item.src })}
            onClick={() => onPick(item)}
            className={tileClassName}
          >
            <img
              src={item.thumbUrl ?? item.src}
              alt={item.title}
              className={kind === 'sticker' ? 'max-h-full max-w-full' : 'size-full object-cover'}
            />
          </button>
        ))}
      </div>
      {hasNextPage ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="self-start"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? 'Wird geladen …' : 'Mehr laden'}
        </Button>
      ) : null}
    </div>
  );
}
