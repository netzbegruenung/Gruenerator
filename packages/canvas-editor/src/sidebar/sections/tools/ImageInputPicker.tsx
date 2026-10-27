import { useMessages } from '@ggraphic/editor/i18n/messages';
import { useUserUploads } from '@ggraphic/editor/sidebar/UserUploadsProvider';
import { MasonryGrid, MasonryItem } from '@ggraphic/editor/ui/masonry-grid';
import { cn } from '@ggraphic/editor/utils/cn';
import { useEffect, useRef, useState } from 'react';
import { HiArrowUpTray, HiPhoto, HiXMark } from 'react-icons/hi2';

import { mediaItemToFile } from '../../../utils/mediaItemToFile';

import type { CanvasMediaItem } from '@ggraphic/editor/hostServices';

export interface ImageInputPickerProps {
  value: File | null;
  onChange: (file: File | null) => void;
  uploadsGridSize?: number;
  disabled?: boolean;
}

export function ImageInputPicker({
  value,
  onChange,
  uploadsGridSize = 9,
  disabled,
}: ImageInputPickerProps) {
  const t = useMessages();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { items, MediaThumb } = useUserUploads();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const handleFiles = (files: FileList | File[]) => {
    const file = Array.from(files).find((f) => f.type.startsWith('image/'));
    if (file) onChange(file);
  };

  const handlePickFromUploads = async (item: CanvasMediaItem) => {
    setPickError(null);
    try {
      const file = await mediaItemToFile(item);
      onChange(file);
    } catch (err) {
      const message = err instanceof Error ? err.message : t.sidebar.tools.loadError;
      setPickError(message);
    }
  };

  const recentItems = items.slice(0, uploadsGridSize);

  return (
    <div className="flex flex-col gap-2">
      {previewUrl ? (
        <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-[var(--background-alt)] border border-[var(--card-border)]">
          <img src={previewUrl} alt={t.ui.preview} className="w-full h-full object-contain" />
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            aria-label={t.sidebar.tools.removeImage}
            className="absolute top-2 right-2 size-7 flex items-center justify-center bg-black/60 text-white rounded-md border-none cursor-pointer hover:bg-black/80 disabled:opacity-50"
          >
            <HiXMark size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
          }}
          disabled={disabled}
          className={cn(
            'w-full py-6 px-3 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed cursor-pointer transition-colors',
            isDragOver
              ? 'border-primary-600 bg-editor-active-soft'
              : 'border-[var(--card-border)] bg-[var(--background-alt)] hover:border-primary-500',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <HiArrowUpTray size={20} className="text-foreground-muted" />
          <span className="text-xs text-foreground-muted text-center">
            {t.sidebar.tools.pickImage}
          </span>
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          if (e.target.files?.length) handleFiles(e.target.files);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
        className="hidden"
      />

      {recentItems.length > 0 ? (
        <>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted mt-1 flex items-center gap-1">
            <HiPhoto size={11} /> {t.sidebar.tools.pickFromUploads}
          </span>
          <MasonryGrid columns="2" gap="sm">
            {recentItems.map((item) => (
              <MasonryItem key={item.id}>
                <button
                  type="button"
                  onClick={() => void handlePickFromUploads(item)}
                  disabled={disabled}
                  className="relative block w-full overflow-hidden rounded-md border border-[var(--card-border)] bg-[var(--card-background)] cursor-pointer hover:border-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed p-0"
                  title={item.title ?? item.originalFilename ?? ''}
                >
                  {item.thumbnailUrl ? (
                    <MediaThumb item={item} alt={item.altText ?? item.title ?? ''} />
                  ) : null}
                </button>
              </MasonryItem>
            ))}
          </MasonryGrid>
        </>
      ) : null}

      {pickError ? <p className="m-0 text-[11px] text-editor-danger-fg">{pickError}</p> : null}
    </div>
  );
}
