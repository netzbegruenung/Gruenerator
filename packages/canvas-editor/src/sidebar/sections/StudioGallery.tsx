import {
  type StudioAssetItem,
  type StudioAssetKind,
  type StudioAssetScope,
} from '@gruenerator/contracts';
import { shareThumbnailPreviewUrl } from '@gruenerator/contracts';
import {
  STUDIO_ASSET_PLURAL,
  STUDIO_ASSET_SCOPES,
  galleryScopeEmptyText,
  useStudioAssets,
} from '@gruenerator/shared/studio-assets';
import { useEffect, useRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '../../utils/cn';

export const GALLERY_SCOPES: readonly GalleryTab<StudioAssetScope>[] = STUDIO_ASSET_SCOPES.map(
  (s) => ({ id: s.value, label: s.label })
);

/** The API caps the search text at 80 characters. */
const MAX_QUERY = 80;

const HINT = 'm-0 py-4 text-center text-[13px] text-[var(--editor-text-muted)]';

const SECONDARY_BUTTON =
  'h-9 px-3.5 rounded-lg border-none cursor-pointer bg-[var(--editor-tile)] text-[13px] font-semibold text-[var(--editor-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)] disabled:opacity-60 disabled:cursor-not-allowed';

export interface GalleryTab<T extends string> {
  id: T;
  label: string;
}

/**
 * Chip row that switches between a card's lists (Grüne, Entdecken, Meine, Gemerkt).
 * Toggle buttons rather than tabs: the list below is no tabpanel and arrow keys add nothing.
 */
export function GalleryTabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: readonly GalleryTab<T>[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {tabs.map((tab) => {
        const isActive = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              'h-8 px-3 rounded-2xl border-none cursor-pointer text-[13px] whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]',
              isActive
                ? 'bg-[var(--editor-active-bg)] text-[var(--editor-active-fg)] font-bold'
                : 'bg-[var(--editor-tile)] text-[var(--editor-text-secondary)] font-semibold'
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** One gallery list (Entdecken, Meine or Gemerkt) of stickers or backgrounds as tiles. */
export function StudioGalleryGrid({
  kind,
  scope,
  query = '',
  pendingId = null,
  selectedSrc = null,
  refreshToken = 0,
  onPick,
  dragProps,
}: {
  kind: StudioAssetKind;
  scope: StudioAssetScope;
  query?: string;
  /** The item whose pick is still loading; its tile shows as busy. */
  pendingId?: string | null;
  /** The src in use, marked pressed; null when the tiles only add. */
  selectedSrc?: string | null;
  /** Bumping it refetches the list (the query cache would otherwise keep it for minutes). */
  refreshToken?: number;
  onPick: (item: StudioAssetItem) => void;
  /** Lets a tile be dragged onto a page; unset leaves the tiles click-only. */
  dragProps?: (
    item: StudioAssetItem
  ) => Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'draggable' | 'onDragStart' | 'onDragEnd'>;
}) {
  const q = query.trim().slice(0, MAX_QUERY);
  const { items, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } =
    useStudioAssets({ kind, scope, q, sort: 'new' });
  const noun = STUDIO_ASSET_PLURAL[kind];

  const seenToken = useRef(refreshToken);
  useEffect(() => {
    if (seenToken.current === refreshToken) return;
    seenToken.current = refreshToken;
    void refetch();
  }, [refreshToken, refetch]);

  if (isLoading) return <p className={HINT}>Wird geladen …</p>;
  if (isError && items.length === 0)
    return (
      <div role="alert" className="flex flex-col items-center gap-2 py-2">
        <p className={HINT}>{noun} konnten nicht geladen werden.</p>
        <button type="button" className={SECONDARY_BUTTON} onClick={() => void refetch()}>
          Erneut versuchen
        </button>
      </div>
    );
  if (items.length === 0)
    return (
      <p className={HINT}>{q ? `Keine ${noun} für „${q}“.` : galleryScopeEmptyText(kind, scope)}</p>
    );

  return (
    <div className="flex flex-col gap-2.5 w-full">
      <div className={cn('grid gap-2 w-full', kind === 'sticker' ? 'grid-cols-3' : 'grid-cols-2')}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            title={item.title}
            aria-label={`${item.title} ${kind === 'sticker' ? 'hinzufügen' : 'als Hintergrund verwenden'}`}
            aria-busy={pendingId === item.id}
            {...(selectedSrc === null ? {} : { 'aria-pressed': selectedSrc === item.src })}
            onClick={() => onPick(item)}
            {...dragProps?.(item)}
            className={cn(
              'relative flex items-center justify-center overflow-hidden rounded-lg border-none cursor-pointer bg-[var(--editor-tile)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]',
              dragProps && 'active:cursor-grabbing',
              kind === 'sticker' ? 'aspect-square p-2' : 'aspect-[4/3] p-0',
              selectedSrc === item.src &&
                'shadow-[0_0_0_2px_var(--editor-surface),0_0_0_4px_var(--editor-accent)]'
            )}
          >
            <img
              src={item.thumbUrl ?? shareThumbnailPreviewUrl(item.src, 200)}
              alt=""
              loading="lazy"
              className={kind === 'sticker' ? 'size-full object-contain' : 'size-full object-cover'}
            />
            {pendingId === item.id && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                <span className="size-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
              </span>
            )}
          </button>
        ))}
      </div>
      {hasNextPage ? (
        <button
          type="button"
          className={cn(SECONDARY_BUTTON, 'self-center')}
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? 'Wird geladen …' : 'Mehr laden'}
        </button>
      ) : null}
    </div>
  );
}
