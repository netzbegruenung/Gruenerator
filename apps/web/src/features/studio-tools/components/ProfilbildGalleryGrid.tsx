import { type StudioAssetKind } from '@gruenerator/contracts';
import {
  STUDIO_ASSET_PLURAL,
  useDiscoverStudioAssets,
  useOwnStudioAssets,
} from '@gruenerator/shared/studio-assets';
import { Button } from '@gruenerator/ui';
import { type ReactNode } from 'react';

import { type GalleryAsset } from '../utils/galleryAsset';

import { TOOL_HINT } from './ToolUi';

import { cn } from '@/utils/cn';

export interface ProfilbildGalleryGridProps {
  kind: StudioAssetKind;
  /** `own`: selbst erstellt und gemerkt; `shop`: was andere teilen (Entdecken). */
  source: 'own' | 'shop';
  q?: string;
  tileClassName: string;
  disabled?: boolean;
  /** The src of the item in use, marked pressed; null when the tiles only add. */
  selectedSrc?: string | null;
  onPick: (item: GalleryAsset) => void;
  /** Steht in derselben Kachelreihe vor den Einträgen — das eigene Hintergrundbild. */
  leading?: ReactNode;
  /** Der src von `leading`; ist er schon ein Eintrag, entfällt `leading`, statt doppelt zu stehen. */
  leadingSrc?: string | null;
  /** Steht in derselben Kachelreihe hinter den Einträgen — Hochladen, Entdecken. */
  trailing?: ReactNode;
  emptyHint?: string;
  /** Layout of the tile row; a flex row unless the caller sets a grid. */
  gridClassName?: string;
}

/** Galerie-Einträge als Auswahlkacheln. */
export function ProfilbildGalleryGrid(props: ProfilbildGalleryGridProps) {
  return props.source === 'own' ? <OwnGrid {...props} /> : <ShopGrid {...props} />;
}

function OwnGrid(props: ProfilbildGalleryGridProps) {
  const { data, error } = useOwnStudioAssets(props.kind, props.q ?? '');
  return <Tiles {...props} data={data} error={error} />;
}

function ShopGrid(props: ProfilbildGalleryGridProps) {
  const { data, error } = useDiscoverStudioAssets(props.kind, props.q ?? '', 'new');
  return <Tiles {...props} data={data} error={error} />;
}

function Tiles({
  kind,
  tileClassName,
  disabled = false,
  selectedSrc = null,
  onPick,
  leading,
  leadingSrc = null,
  trailing,
  emptyHint,
  gridClassName = 'flex flex-wrap items-center gap-sm',
  data,
  error,
}: ProfilbildGalleryGridProps & {
  data: ReturnType<typeof useOwnStudioAssets>['data'];
  error: Error | null;
}) {
  const hint = cn(TOOL_HINT, 'm-0 text-xs');
  const { items } = data;

  return (
    <div className="flex flex-col gap-sm">
      <div className={gridClassName}>
        {leadingSrc !== null && items.some((item) => item.src === leadingSrc) ? null : leading}
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
        {trailing}
      </div>
      {data.isLoading ? (
        <p className={hint}>Wird geladen …</p>
      ) : error && items.length === 0 ? (
        <div role="alert" className="flex flex-wrap items-center gap-sm">
          <p className={hint}>{STUDIO_ASSET_PLURAL[kind]} konnten nicht geladen werden.</p>
          <Button type="button" size="sm" variant="outline" onClick={data.retry}>
            Erneut versuchen
          </Button>
        </div>
      ) : items.length === 0 && emptyHint ? (
        <p className={hint}>{emptyHint}</p>
      ) : null}
      {data.hasNextPage ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="self-start"
          disabled={data.isFetchingNextPage}
          onClick={data.fetchNextPage}
        >
          {data.isFetchingNextPage ? 'Wird geladen …' : 'Mehr laden'}
        </Button>
      ) : null}
    </div>
  );
}
