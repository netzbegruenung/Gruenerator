import { cn } from '@ggraphic/editor/utils/cn';
import { downscaleImageForUpload } from '@ggraphic/editor/utils/userImageUtils';
import { Popover, PopoverContent, PopoverTrigger } from '@gruenerator/ui';
import { Slider } from 'radix-ui';
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import {
  HiArrowUpTray,
  HiMagnifyingGlass,
  HiMagnifyingGlassPlus,
  HiOutlinePhoto,
  HiOutlineTrash,
} from 'react-icons/hi2';

import { useCanvasEditorServices } from '../../../CanvasEditorProvider';
import { plainImageUrls } from '../../../hostServices';
import { MOBILE_INPUT_TEXT } from '../../../sidebar/sidebarStyles';
import { useUserUploads } from '../../../sidebar/UserUploadsProvider';
import { fetchShareImageFile } from '../../../utils/mediaPlacement';

import type { BackgroundControls } from '../../../configs/types';
import type { CanvasMediaItem } from '../../../hostServices';
import type { StockImageAttribution } from '@ggraphic/editor/common/imageSourceTypes';

const ICON_BTN =
  'inline-flex items-center justify-center size-8 shrink-0 rounded-md border-none bg-transparent cursor-pointer text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)]';

const TEXT_BTN =
  'inline-flex items-center gap-1.5 h-8 px-2 shrink-0 rounded-md border-none bg-transparent cursor-pointer text-[13px] font-medium text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)]';

type ImageChange = NonNullable<BackgroundControls['onImageChange']>;

/**
 * Picks the background photo from the user's uploads, or uploads a new one into
 * the library first so the background gets its durable URL.
 */
export function BackgroundImagePicker({
  label,
  currentImageSrc,
  onImageChange,
  openRequest = 0,
}: {
  label: string;
  currentImageSrc?: string;
  onImageChange: ImageChange;
  /** Each new value opens the picker — the context menu's "Bild ersetzen …". */
  openRequest?: number;
}) {
  const { imageUrls = plainImageUrls } = useCanvasEditorServices();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (openRequest > 0) setOpen(true);
  }, [openRequest]);
  const { items, isLoading, error, search, setSearch, upload, hasMore, loadMore, MediaThumb } =
    useUserUploads();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  // Only the newest pick may change the background.
  const seqRef = useRef(0);

  const apply = async (id: string, load: () => Promise<{ file: File; url: string } | null>) => {
    const seq = ++seqRef.current;
    setPickError(null);
    setPendingId(id);
    try {
      const picked = await load();
      if (seq !== seqRef.current) return;
      if (!picked) {
        setPickError('Bild konnte nicht hochgeladen werden. Bitte versuche es erneut.');
        return;
      }
      onImageChange(picked.file, picked.url, null);
      setOpen(false);
    } catch (err) {
      if (seq !== seqRef.current) return;
      setPickError(err instanceof Error ? err.message : 'Fehler beim Laden des Bildes');
    } finally {
      if (seq === seqRef.current) setPendingId(null);
    }
  };

  const pickUpload = (item: CanvasMediaItem) => {
    const url = imageUrls.placementUrl(item);
    if (!url) return;
    void apply(item.id, async () => ({
      file: await fetchShareImageFile(
        url,
        item.originalFilename ?? item.title ?? 'hintergrund',
        imageUrls
      ),
      url,
    }));
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files?.[0];
    e.target.value = '';
    if (!raw) return;
    void apply('upload', async () => {
      const file = await downscaleImageForUpload(raw);
      const item = await upload(file);
      const url = item ? imageUrls.placementUrl(item) : null;
      return url ? { file, url } : null;
    });
  };

  const displayedError = pickError ?? error;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={TEXT_BTN} aria-label={`Hintergrundbild: ${label}`}>
          <HiOutlinePhoto size={17} aria-hidden="true" />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[10001] w-80 flex flex-col gap-3 p-3"
        align="start"
        aria-label="Hintergrundbild wählen"
      >
        <div className="flex items-center gap-2 h-9 px-2.5 rounded-lg bg-[var(--editor-tile)]">
          <HiMagnifyingGlass
            size={16}
            className="shrink-0 text-[var(--editor-text-muted)]"
            aria-hidden="true"
          />
          <input
            type="search"
            enterKeyHint="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Eigene Bilder durchsuchen"
            aria-label="Eigene Bilder durchsuchen"
            className={`flex-1 min-w-0 border-none outline-none bg-transparent text-sm ${MOBILE_INPUT_TEXT} text-[var(--editor-text)] placeholder:text-[var(--editor-text-muted)]`}
          />
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
          disabled={pendingId === 'upload'}
          aria-busy={pendingId === 'upload'}
          className="flex w-full items-center justify-center gap-2 h-9 rounded-lg border-[1.5px] border-dashed border-[var(--editor-border-strong)] bg-transparent text-sm font-semibold text-[var(--editor-text-secondary)] cursor-pointer transition-colors duration-150 hover:border-[var(--editor-accent)] hover:text-[var(--editor-text)] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <HiArrowUpTray size={16} aria-hidden="true" />
          {pendingId === 'upload' ? 'Bild wird hochgeladen…' : 'Bild hochladen'}
        </button>

        {displayedError && (
          <p role="alert" className="m-0 text-xs text-[var(--editor-danger-fg)]">
            {displayedError}
          </p>
        )}

        <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto">
          {items.map((item) => {
            const isActive = !!currentImageSrc && imageUrls.placementUrl(item) === currentImageSrc;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => pickUpload(item)}
                aria-pressed={isActive}
                aria-busy={pendingId === item.id}
                title={item.title ?? item.originalFilename ?? ''}
                className={cn(
                  'relative aspect-square overflow-hidden rounded-lg bg-[var(--editor-tile)] p-0 border-none cursor-pointer [&_picture]:size-full [&_img]:size-full [&_img]:object-cover',
                  isActive &&
                    'shadow-[0_0_0_2px_var(--editor-surface),0_0_0_4px_var(--editor-accent)]',
                  pendingId === item.id && 'opacity-60'
                )}
              >
                <MediaThumb item={item} alt={item.altText ?? item.title ?? ''} sizes="96px" />
              </button>
            );
          })}
        </div>

        {hasMore && !isLoading && (
          <button
            type="button"
            onClick={() => void loadMore()}
            className="self-center text-xs font-semibold text-[var(--editor-active-fg)] bg-transparent border-none cursor-pointer"
          >
            Mehr anzeigen
          </button>
        )}
        {!isLoading && items.length === 0 && !displayedError && (
          <p className="m-0 text-xs text-[var(--editor-text-muted)]">
            {search ? `Keine Treffer für „${search}“.` : 'Noch keine eigenen Bilder.'}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Zoom of the background photo. It has no on-canvas handles, so this is the only way. */
export function BackgroundZoomControl({
  scale,
  onScaleChange,
}: {
  scale: number;
  onScaleChange: (scale: number) => void;
}) {
  const titleId = useId();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={ICON_BTN} title="Zoom" aria-label="Bild zoomen">
          <HiMagnifyingGlassPlus size={17} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[10001] w-60 flex items-center gap-2 p-3"
        align="center"
        aria-labelledby={titleId}
      >
        <span id={titleId} className="text-[11px] w-10 text-[var(--editor-text-muted)]">
          Zoom
        </span>
        {/* Bounds match `backgroundPhotoElement()` in the sharepic descriptor. */}
        <Slider.Root
          className="relative flex items-center select-none touch-none grow h-4 max-canvas-mobile:h-11"
          value={[scale]}
          onValueChange={(v) => onScaleChange(v[0])}
          min={1}
          max={3}
          step={0.01}
        >
          <Slider.Track className="relative grow rounded-full h-1 bg-[var(--editor-border-soft)]">
            <Slider.Range className="absolute rounded-full h-full bg-[var(--editor-accent)]" />
          </Slider.Track>
          <Slider.Thumb
            className="block size-3 max-canvas-mobile:size-5 bg-white rounded-full border-2 border-[var(--editor-accent)] shadow-[0_1px_3px_rgba(0,0,0,0.2)] cursor-grab focus:outline-none"
            aria-label="Zoom"
          />
        </Slider.Root>
        <span className="text-[11px] w-10 text-right tabular-nums text-[var(--editor-text-muted)]">
          {Math.round(scale * 100)}%
        </span>
      </PopoverContent>
    </Popover>
  );
}

export function BackgroundRestoreImageButton({ onRestore }: { onRestore: () => void }) {
  return (
    <button
      type="button"
      className={TEXT_BTN}
      onClick={onRestore}
      title="Das zuletzt verwendete Foto wieder als Hintergrund zeigen"
    >
      Foto zurück
    </button>
  );
}

export function BackgroundRemoveImageButton({ onRemove }: { onRemove: () => void }) {
  return (
    <button
      type="button"
      className={ICON_BTN}
      onClick={onRemove}
      title="Hintergrundbild entfernen"
      aria-label="Hintergrundbild entfernen"
    >
      <HiOutlineTrash size={17} aria-hidden="true" />
    </button>
  );
}

/**
 * Makes the selected own image the background photo and removes it as an
 * element. Only for durable URLs: a `blob:` preview would die on reload.
 */
export function SetAsBackgroundButton({
  src,
  fileName,
  attribution,
  onImageChange,
  onRemoveElement,
}: {
  src: string;
  fileName: string;
  /** Stock credit of the photo; the background keeps it. */
  attribution?: StockImageAttribution;
  onImageChange: ImageChange;
  onRemoveElement: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const { imageUrls = plainImageUrls } = useCanvasEditorServices();

  const handleClick = async () => {
    setPending(true);
    setFailed(false);
    try {
      const file = await fetchShareImageFile(src, fileName, imageUrls);
      onImageChange(file, src, attribution ?? null);
      onRemoveElement();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      className={TEXT_BTN}
      onClick={() => void handleClick()}
      disabled={pending}
      aria-busy={pending}
      title={failed ? 'Bild konnte nicht geladen werden' : 'Bild als Hintergrund verwenden'}
    >
      <HiOutlinePhoto size={17} aria-hidden="true" />
      Als Hintergrund
    </button>
  );
}
