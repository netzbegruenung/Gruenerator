import { shareCanvasPreviewUrl, shareThumbnailPreviewUrl } from '@gruenerator/shared/media-library';
import { MasonryGrid, MasonryItem, Switch } from '@gruenerator/ui';
import { useState, useEffect, useCallback, useRef, type ChangeEvent, type ReactNode } from 'react';
import { FaCheck } from 'react-icons/fa';
import { HiAdjustments, HiColorSwatch } from 'react-icons/hi';
import { HiArrowUpTray, HiMagnifyingGlass, HiPhoto, HiXMark } from 'react-icons/hi2';

import { useCanvasEditorServices } from '../../CanvasEditorProvider';
import UnsplashAttribution from '../../common/UnsplashAttribution';
import { useIsCanvasMobile } from '../../hooks/useIsCanvasMobile';
import { useUnsplashSearch } from '../../hooks/useUnsplashSearch';
import { cn } from '../../utils/cn';
import { downscaleImageForUpload } from '../../utils/userImageUtils';
import { MediaThumb } from '../components/MediaThumb';
import { SidebarSlider } from '../components/SidebarSlider';
import { persistImageSelection } from '../persistImageSelection';
import { SIDEBAR_SECTION } from '../sidebarStyles';
import { SubsectionTabBar, type Subsection } from '../SubsectionTabBar';
import { useUserUploads } from '../UserUploadsProvider';

import {
  BackgroundSwatchGrid,
  MOBILE_BLOCK_LABEL,
  MOBILE_IMAGE_TILE,
  MOBILE_SEARCH_FIELD,
  MOBILE_SLIDER_ROWS,
} from './BackgroundSection';

import type { StockImage, StockImageAttribution } from '../../common/imageSourceTypes';
import type { BackgroundColorOption } from '../types';
import type { MediaItem } from '@gruenerator/shared/media-library';

function buildUploadUrl(item: MediaItem): string | null {
  if (item.mediaUrl) return item.mediaUrl;
  if (item.shareToken) return `/api/share/${item.shareToken}/download`;
  return item.thumbnailUrl;
}

function PickPending() {
  return (
    <span className="absolute inset-0 flex items-center justify-center bg-black/30">
      <span className="size-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
    </span>
  );
}

export interface ImageBackgroundSectionProps {
  currentImageSrc?: string;
  onImageChange: (
    file: File | null,
    objectUrl?: string,
    attribution?: StockImageAttribution | null
  ) => void;

  // The background photo is draggable but not transformable — it has no
  // on-canvas handles — so this slider is the only way to zoom it.
  scale?: number;
  onScaleChange?: (scale: number) => void;

  // Gradient controls
  gradientOpacity?: number;
  onGradientOpacityChange?: (opacity: number) => void;

  // New Modular Lock Controls
  isLocked?: boolean;
  onToggleLock?: () => void;

  // Solid colour under the photo. Present on the photo-backed templates, which
  // draw a `background-color` plane at order -1: with no picture chosen the
  // plane is what the user sees, with one it is fully covered. Passing all
  // three adds the "Farbe" subsection.
  backgroundColor?: string;
  backgroundColors?: readonly BackgroundColorOption[];
  onBackgroundColorChange?: (color: string) => void;
  // Templates whose colour pick switches the photo off (freeform) instead of
  // sitting under it: the "image lies over the colour" hint would be wrong there.
  colorReplacesImage?: boolean;

  // Which subsection the phone sheet opens on. Read once on mount, so removing
  // the photo does not yank the sheet over to "Farbe" mid-interaction.
  initialSubsection?: 'image-search' | 'background-color';

  // Set when `currentImageSrc` is kept but not shown (freeform after a colour
  // pick): the pinned tile is then not marked as selected, and tapping it calls
  // this to bring the photo back.
  onActivateImage?: () => void;
}

/**
 * Unified Search Content - searches the user's upload library AND Unsplash
 * with one input. The currently active background pins to the front of the
 * library grid with an "active" marker. Selecting from either source
 * converges on onImageChange.
 */
function SearchContent({
  currentImageSrc,
  onImageChange,
  onActivateImage,
}: Pick<ImageBackgroundSectionProps, 'currentImageSrc' | 'onImageChange' | 'onActivateImage'>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [pickError, setPickError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Tracks which library item backs the current background, so we can dedupe it
  // from the grid. We cache the mapping locally (id → the src URL now applied)
  // while it's still active.
  // Picks resolve asynchronously; only the newest one may change the
  // background, and its tile shows a spinner until it has.
  const pickSeqRef = useRef(0);
  const [pendingPickId, setPendingPickId] = useState<string | null>(null);
  const beginPick = useCallback((id: string | null) => {
    pickSeqRef.current += 1;
    setPendingPickId(id);
    setPickError(null);
    return pickSeqRef.current;
  }, []);

  const {
    items: uploadItems,
    isLoading: isUploadsLoading,
    error: uploadsError,
    setSearch: setUploadSearch,
    hasMore: uploadsHasMore,
    loadMore: loadMoreUploads,
    upload,
  } = useUserUploads();

  const {
    searchResults: unsplashResults,
    totalResults: unsplashTotal,
    searchUnsplash,
    loadMoreResults: loadMoreUnsplash,
    isLoadingSearch: isUnsplashLoading,
    searchError: unsplashError,
    clearSearch: clearUnsplashSearch,
  } = useUnsplashSearch();

  const { fetchUnsplashImageAsFile, trackUnsplashDownloadLive, uploadImage } =
    useCanvasEditorServices();
  const isMobile = useIsCanvasMobile();

  useEffect(() => {
    setUploadSearch(searchQuery);
  }, [searchQuery, setUploadSearch]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (debouncedQuery.trim()) {
      void searchUnsplash(debouncedQuery);
    } else {
      clearUnsplashSearch();
    }
  }, [debouncedQuery, searchUnsplash, clearUnsplashSearch]);

  // The library URL is already durable — persist it directly instead of a
  // session-local blob: URL (which dies on reload in the collab editor).
  const applyLibraryImage = useCallback(
    (file: File, url: string) => onImageChange(file, url, null),
    [onImageChange]
  );

  const handlePickUpload = useCallback(
    async (item: MediaItem) => {
      const url = buildUploadUrl(item);
      if (!url) return;
      const seq = beginPick(item.id);
      const isCurrent = () => seq === pickSeqRef.current;
      try {
        // The canvas renders the 2160px preview tier anyway; the stored
        // original can be many MB and its /download awaits download tracking.
        const response = await fetch(shareCanvasPreviewUrl(url) ?? url);
        if (!response.ok) throw new Error('Bild konnte nicht geladen werden');
        const blob = await response.blob();
        const filename = item.originalFilename ?? item.title ?? `upload-${item.id}`;
        const rawFile = new File([blob], filename, { type: blob.type || 'image/jpeg' });
        // Same cap as persistImageSelection: this File backs the auto-save
        // `originalImage`, so it should be the working size, not the raw original.
        const file = await downscaleImageForUpload(rawFile);
        if (isCurrent()) applyLibraryImage(file, url);
      } catch (err) {
        if (!isCurrent()) return;
        const message = err instanceof Error ? err.message : 'Fehler beim Laden des Bildes';
        setPickError(message);
      } finally {
        if (isCurrent()) setPendingPickId(null);
      }
    },
    [applyLibraryImage, beginPick]
  );

  // A new file goes into the library first (like the Uploads tab), so the
  // background gets the library's durable URL and the image shows up under
  // "Deine Bilder" afterwards. No blob preview: a failed upload changes nothing.
  const handleUploadFile = useCallback(
    async (rawFile: File) => {
      beginPick(null);
      setIsUploading(true);
      try {
        const file = await downscaleImageForUpload(rawFile);
        const item = await upload(file);
        const url = item ? buildUploadUrl(item) : null;
        if (!item || !url) {
          setPickError('Bild konnte nicht hochgeladen werden. Bitte versuche es erneut.');
          return;
        }
        applyLibraryImage(file, url);
      } catch {
        setPickError('Bild konnte nicht hochgeladen werden. Bitte versuche es erneut.');
      } finally {
        setIsUploading(false);
      }
    },
    [upload, applyLibraryImage, beginPick]
  );

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void handleUploadFile(file);
  };

  const handlePickUnsplash = useCallback(
    async (image: StockImage) => {
      if (!fetchUnsplashImageAsFile) return;
      const seq = beginPick(image.filename);
      const isCurrent = () => seq === pickSeqRef.current;
      try {
        const file = await fetchUnsplashImageAsFile(image);
        if (!isCurrent()) return;
        if (image.attribution?.downloadLocation && trackUnsplashDownloadLive) {
          await trackUnsplashDownloadLive(image.attribution.downloadLocation);
        }
        // Optimistic blob preview, then swap to a durable URL so the chosen
        // image survives reload (the value gets written to the collab doc).
        const { persisted } = await persistImageSelection(
          file,
          image.attribution ?? null,
          (...args) => {
            if (!isCurrent()) return;
            setPendingPickId(null);
            onImageChange(...args);
          },
          uploadImage
        );
        if (!isCurrent()) return;
        if (!persisted && uploadImage) {
          setPickError(
            'Bild konnte nicht dauerhaft gespeichert werden und geht nach dem Neuladen verloren.'
          );
        }
      } catch (err) {
        if (!isCurrent()) return;
        setPendingPickId(null);
        const message = err instanceof Error ? err.message : 'Fehler beim Laden des Bildes';
        setPickError(message);
      }
    },
    [onImageChange, fetchUnsplashImageAsFile, trackUnsplashDownloadLive, uploadImage, beginPick]
  );

  // Tapping the earlier photo swaps its button for the selected tile; focus
  // follows to that tile instead of falling back to the page.
  const pinnedRef = useRef<HTMLDivElement>(null);
  const focusPinnedRef = useRef(false);
  const handleActivate = () => {
    beginPick(null);
    focusPinnedRef.current = true;
    onActivateImage?.();
  };
  useEffect(() => {
    if (focusPinnedRef.current && !onActivateImage) {
      focusPinnedRef.current = false;
      pinnedRef.current?.focus();
    }
  }, [onActivateImage]);

  const handleClearActive = useCallback(() => {
    beginPick(null);
    // An explicit null credit: the templates only touch it when one is passed.
    onImageChange(null, undefined, null);
  }, [onImageChange, beginPick]);

  const displayedError = pickError ?? uploadsError ?? unsplashError;
  const hasActive = !!currentImageSrc;
  const isPinnedInactive = !!onActivateImage;
  const pinnedTitle = isPinnedInactive ? 'Früheres Hintergrundbild' : 'Aktuelles Hintergrundbild';
  const removeLabel = isPinnedInactive ? 'Früheres Bild verwerfen' : 'Hintergrund entfernen';
  // The photo behind the background, inactive or not: a tap on an inactive
  // one brings it back with its offset, zoom and credit.
  const activeMedia = (media: ReactNode) => {
    if (!onActivateImage) return media;
    return (
      <button
        type="button"
        onClick={handleActivate}
        aria-label="Bild wieder als Hintergrund verwenden"
        className="block size-full p-0 border-none bg-transparent cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--editor-accent)]"
      >
        {media}
      </button>
    );
  };
  const pinnedPhoto = (src: string, className: string) => (
    <img
      src={shareThumbnailPreviewUrl(src, 400)}
      alt={isPinnedInactive ? '' : 'Aktuelles Hintergrundbild'}
      className={className}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
  // A library photo is marked where it sits in the grid. Moving it to a pinned
  // first tile reflowed the grid under the pointer: the next click landed on
  // whatever slid into place, often the photo just replaced.
  const activeLibraryId = currentImageSrc
    ? (uploadItems.find((item) => buildUploadUrl(item) === currentImageSrc)?.id ?? null)
    : null;
  const showPinned = hasActive && !activeLibraryId;
  const libraryThumb = (item: MediaItem, sizes?: string) =>
    item.thumbnailUrl ? (
      <MediaThumb item={item} alt={item.altText ?? item.title ?? ''} sizes={sizes} />
    ) : isMobile ? (
      <span className="size-full flex items-center justify-center text-[var(--editor-text-muted)]">
        <HiPhoto size={20} />
      </span>
    ) : (
      <div className="aspect-square flex items-center justify-center text-foreground-muted">
        <HiPhoto size={20} />
      </div>
    );
  const mobileActiveTile = (key: string, media: ReactNode) => (
    <div
      key={key}
      className={cn(
        MOBILE_IMAGE_TILE,
        '[&_div]:size-full [&_picture]:size-full [&_img]:size-full [&_img]:object-cover',
        !isPinnedInactive &&
          'shadow-[0_0_0_2px_var(--editor-surface),0_0_0_4px_var(--editor-accent)]'
      )}
      title={pinnedTitle}
      ref={pinnedRef}
      tabIndex={-1}
      role="group"
      aria-label={pinnedTitle}
    >
      {activeMedia(media)}
      <button
        type="button"
        onClick={handleClearActive}
        aria-label={removeLabel}
        className="absolute top-1 right-1 size-6 flex items-center justify-center bg-black/70 text-white border-none rounded-full cursor-pointer"
      >
        <HiXMark size={12} />
      </button>
    </div>
  );
  const desktopActiveTile = (key: string, media: ReactNode) => (
    <MasonryItem
      key={key}
      className={cn(
        'group relative overflow-hidden rounded-lg bg-[var(--card-background)]',
        isPinnedInactive
          ? 'border border-[var(--card-border)] hover:border-primary-500'
          : 'border-2 border-primary-600 ring-2 ring-primary-200'
      )}
      title={pinnedTitle}
      ref={pinnedRef}
      tabIndex={-1}
      role="group"
      aria-label={pinnedTitle}
    >
      {activeMedia(media)}
      {!isPinnedInactive && (
        <div className="absolute top-1 left-1 bg-primary-600 rounded-full size-5 flex items-center justify-center">
          <FaCheck size={10} color="white" />
        </div>
      )}
      <button
        type="button"
        onClick={handleClearActive}
        aria-label={removeLabel}
        className="absolute top-1 right-1 size-5 flex items-center justify-center bg-black/70 text-white border-none rounded-full cursor-pointer opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus:opacity-100"
      >
        <HiXMark size={10} />
      </button>
    </MasonryItem>
  );
  const hasLibrary = hasActive || uploadItems.length > 0;
  const hasUnsplash = unsplashResults.length > 0;
  const showEmpty =
    !isUploadsLoading && !isUnsplashLoading && !hasLibrary && !hasUnsplash && !displayedError;

  return (
    <div
      className={cn(
        SIDEBAR_SECTION,
        'gap-3 p-4 px-3 max-canvas-mobile:gap-4 max-canvas-mobile:p-0'
      )}
    >
      {/* Search Input */}
      <div
        className={
          isMobile
            ? MOBILE_SEARCH_FIELD
            : 'flex items-center gap-2 py-2 px-3 bg-background border border-[var(--font-color)] rounded-lg'
        }
      >
        <HiMagnifyingGlass
          size={18}
          className={cn(
            'shrink-0',
            isMobile ? 'text-[var(--editor-text-muted)]' : 'text-foreground-muted'
          )}
        />
        <input
          type="text"
          placeholder="Bilder durchsuchen (eigene + Unsplash)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-0 border-none outline-none bg-transparent text-foreground text-sm max-canvas-mobile:text-[var(--editor-text)] max-canvas-mobile:placeholder:text-[var(--editor-text-muted)]"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Suche leeren"
            className="bg-none border-none cursor-pointer p-0 flex items-center text-foreground-muted hover:text-foreground"
          >
            <HiXMark size={18} />
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        aria-busy={isUploading}
        className="flex w-full items-center justify-center gap-2 h-10 rounded-lg border-[1.5px] border-dashed border-[var(--editor-border-strong)] bg-transparent text-sm font-semibold text-[var(--editor-text-secondary)] cursor-pointer transition-colors duration-150 hover:border-[var(--editor-accent)] hover:text-[var(--editor-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)] disabled:opacity-60 disabled:cursor-not-allowed max-canvas-mobile:h-11 max-canvas-mobile:rounded-xl"
      >
        <HiArrowUpTray size={18} aria-hidden="true" />
        {isUploading ? 'Bild wird hochgeladen…' : 'Eigenes Bild hochladen'}
      </button>

      {displayedError && (
        <div
          role="alert"
          className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1"
        >
          {displayedError}
        </div>
      )}

      {/* Section: Active image + User Uploads */}
      {hasLibrary && (
        <section className="flex flex-col gap-2">
          <h3
            className={
              isMobile
                ? MOBILE_BLOCK_LABEL
                : 'm-0 text-xs font-semibold uppercase tracking-wide text-foreground-muted'
            }
          >
            Deine Bilder
          </h3>
          {isMobile ? (
            <div className="grid grid-cols-3 gap-2.5">
              {showPinned &&
                currentImageSrc &&
                mobileActiveTile('pinned', pinnedPhoto(currentImageSrc, 'size-full object-cover'))}
              {uploadItems.map((item) =>
                item.id === activeLibraryId ? (
                  mobileActiveTile(item.id, libraryThumb(item, '140px'))
                ) : (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void handlePickUpload(item)}
                    aria-busy={pendingPickId === item.id}
                    className={cn(
                      MOBILE_IMAGE_TILE,
                      '[&_div]:size-full [&_picture]:size-full [&_img]:size-full [&_img]:object-cover'
                    )}
                    title={item.title ?? item.originalFilename ?? ''}
                  >
                    {libraryThumb(item, '140px')}
                    {pendingPickId === item.id && <PickPending />}
                  </button>
                )
              )}
            </div>
          ) : (
            <MasonryGrid columns="2" gap="sm">
              {showPinned &&
                currentImageSrc &&
                desktopActiveTile('pinned', pinnedPhoto(currentImageSrc, 'w-full h-auto'))}
              {uploadItems.map((item) =>
                item.id === activeLibraryId ? (
                  desktopActiveTile(item.id, libraryThumb(item))
                ) : (
                  <MasonryItem key={item.id}>
                    <button
                      type="button"
                      onClick={() => void handlePickUpload(item)}
                      aria-busy={pendingPickId === item.id}
                      className={cn(
                        'group relative block w-full overflow-hidden rounded-lg border bg-[var(--card-background)] transition-colors duration-150 cursor-pointer p-0',
                        'border-[var(--card-border)] hover:border-primary-500'
                      )}
                      title={item.title ?? item.originalFilename ?? ''}
                    >
                      {libraryThumb(item)}
                      {pendingPickId === item.id && <PickPending />}
                    </button>
                  </MasonryItem>
                )
              )}
            </MasonryGrid>
          )}
          {uploadsHasMore && !isUploadsLoading && (
            <button
              type="button"
              onClick={() => void loadMoreUploads()}
              className="text-xs text-primary-600 hover:underline self-center cursor-pointer bg-transparent border-none"
            >
              Mehr eigene Bilder
            </button>
          )}
        </section>
      )}

      {/* Section: Unsplash */}
      {hasUnsplash && (
        <section className="flex flex-col gap-2">
          <h3
            className={
              isMobile
                ? MOBILE_BLOCK_LABEL
                : 'm-0 text-xs font-semibold uppercase tracking-wide text-foreground-muted'
            }
          >
            Unsplash
          </h3>
          <div className={isMobile ? 'grid grid-cols-3 gap-2.5' : 'grid grid-cols-1 gap-2'}>
            {unsplashResults.map((image) => {
              // A replaced photo stays in state but is not the background.
              const isSelected = !isPinnedInactive && currentImageSrc === image.url;
              return (
                <button
                  key={image.filename}
                  type="button"
                  onClick={() => void handlePickUnsplash(image)}
                  aria-pressed={isSelected}
                  className={
                    isMobile
                      ? cn(
                          MOBILE_IMAGE_TILE,
                          isSelected &&
                            'shadow-[0_0_0_2px_var(--editor-surface),0_0_0_4px_var(--editor-accent)]'
                        )
                      : cn(
                          'relative border border-[var(--editor-border)] rounded-lg overflow-hidden cursor-pointer p-0 bg-none aspect-[4/3] hover:border-primary-600',
                          isSelected && 'border-2 border-primary-600'
                        )
                  }
                >
                  <img
                    src={image.url}
                    alt={image.alt_text || 'Unsplash Bild'}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  {image.attribution && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-1">
                      <UnsplashAttribution
                        photographer={image.attribution.photographer}
                        profileUrl={image.attribution.profileUrl}
                        photoUrl={image.attribution.photoUrl}
                        compact={true}
                      />
                    </div>
                  )}
                  {pendingPickId === image.filename && <PickPending />}
                  {isSelected && !isMobile && (
                    <div className="absolute top-2 right-2 bg-primary-600 rounded-full w-6 h-6 flex items-center justify-center">
                      <FaCheck size={12} color="white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {unsplashResults.length < unsplashTotal && (
            <button
              type="button"
              onClick={() => void loadMoreUnsplash()}
              disabled={isUnsplashLoading}
              className="w-full py-2 bg-primary-600 text-white border-none rounded-lg cursor-pointer text-xs hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed max-canvas-mobile:h-11 max-canvas-mobile:py-0 max-canvas-mobile:rounded-xl max-canvas-mobile:text-sm max-canvas-mobile:font-semibold max-canvas-mobile:bg-[var(--editor-tile)] max-canvas-mobile:text-[var(--editor-text)]"
            >
              {isUnsplashLoading
                ? 'Lädt…'
                : `Mehr Unsplash-Bilder (${unsplashResults.length} von ${unsplashTotal})`}
            </button>
          )}
        </section>
      )}

      {/* Loading hints */}
      {(isUploadsLoading || isUnsplashLoading) && !hasLibrary && !hasUnsplash && (
        <div className="p-4 text-center text-foreground-muted text-sm">
          <p>Suche läuft…</p>
        </div>
      )}

      {showEmpty && (
        <div className="p-4 text-center text-foreground-muted text-sm">
          <HiPhoto size={28} className="mx-auto mb-2 opacity-50" />
          <p className="m-0">
            {searchQuery
              ? `Keine Treffer für „${searchQuery}".`
              : 'Tippe einen Suchbegriff ein, um Unsplash zu durchsuchen.'}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Adjustment Controls Content - zoom, lock, gradient.
 *
 * All three used to be accepted as props and none but the gradient was drawn,
 * so every template that passed `scale` (all of them) opened this panel on an
 * empty box. The bounds below match `backgroundPhotoElement()` in the sharepic
 * descriptor, so the slider and the chat edit agree on what a zoom is.
 */
function AdjustmentsContent({
  scale,
  onScaleChange,
  gradientOpacity,
  onGradientOpacityChange,
  isLocked,
  onToggleLock,
}: Pick<
  ImageBackgroundSectionProps,
  | 'scale'
  | 'onScaleChange'
  | 'gradientOpacity'
  | 'onGradientOpacityChange'
  | 'isLocked'
  | 'onToggleLock'
>) {
  return (
    <div
      className={cn(SIDEBAR_SECTION, 'gap-4 px-3 pb-4 max-canvas-mobile:p-0', MOBILE_SLIDER_ROWS)}
    >
      {scale !== undefined && onScaleChange !== undefined && (
        <SidebarSlider
          label="Zoom"
          value={scale}
          onValueChange={onScaleChange}
          min={0.5}
          max={3}
          step={0.01}
          unit="%"
        />
      )}

      {gradientOpacity !== undefined && onGradientOpacityChange !== undefined && (
        <SidebarSlider
          label="Overlay"
          value={gradientOpacity}
          onValueChange={onGradientOpacityChange}
          min={0}
          max={1}
          step={0.01}
          unit="%"
        />
      )}

      {onToggleLock !== undefined && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-foreground">Hintergrund fixieren</span>
          <Switch checked={!!isLocked} onCheckedChange={onToggleLock} />
        </div>
      )}
    </div>
  );
}

export function ImageBackgroundSection({
  currentImageSrc,
  onImageChange,
  scale,
  onScaleChange,
  gradientOpacity,
  onGradientOpacityChange,
  isLocked,
  onToggleLock,
  backgroundColor,
  backgroundColors,
  onBackgroundColorChange,
  colorReplacesImage,
  initialSubsection = 'image-search',
  onActivateImage,
}: ImageBackgroundSectionProps) {
  const [defaultSubsection] = useState(initialSubsection);
  const hasAdjustments =
    (scale !== undefined && onScaleChange !== undefined) ||
    (gradientOpacity !== undefined && onGradientOpacityChange !== undefined) ||
    onToggleLock !== undefined;

  const hasColor =
    backgroundColors !== undefined &&
    backgroundColors.length > 0 &&
    onBackgroundColorChange !== undefined;

  const subsections: Subsection[] = [
    {
      id: 'image-search',
      icon: HiMagnifyingGlass,
      label: 'Bilder',
      content: (
        <SearchContent
          currentImageSrc={currentImageSrc}
          onImageChange={onImageChange}
          onActivateImage={onActivateImage}
        />
      ),
    },
  ];

  if (hasColor) {
    subsections.push({
      id: 'background-color',
      icon: HiColorSwatch,
      label: 'Farbe',
      content: (
        <div
          className={cn(
            SIDEBAR_SECTION,
            'w-full gap-3 px-3 pb-4 max-canvas-mobile:gap-4 max-canvas-mobile:p-0'
          )}
        >
          <BackgroundSwatchGrid
            colors={backgroundColors}
            currentColor={backgroundColor ?? ''}
            onColorChange={onBackgroundColorChange}
          />
          {currentImageSrc && !colorReplacesImage ? (
            <p className="m-0 text-xs text-foreground-muted max-canvas-mobile:text-[13px] max-canvas-mobile:text-[var(--editor-text-muted)]">
              Das Bild liegt über der Farbe. Entferne es unter „Bilder", um die Farbe zu sehen.
            </p>
          ) : null}
        </div>
      ),
    });
  }

  if (hasAdjustments) {
    subsections.push({
      id: 'image-adjustments',
      icon: HiAdjustments,
      label: 'Anpassung',
      content: (
        <AdjustmentsContent
          scale={scale}
          onScaleChange={onScaleChange}
          gradientOpacity={gradientOpacity}
          onGradientOpacityChange={onGradientOpacityChange}
          isLocked={isLocked}
          onToggleLock={onToggleLock}
        />
      ),
    });
  }

  return <SubsectionTabBar subsections={subsections} defaultSubsection={defaultSubsection} />;
}
