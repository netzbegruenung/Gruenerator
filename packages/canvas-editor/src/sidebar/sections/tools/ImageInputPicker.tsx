import { useEffect, useRef, useState } from 'react';
import { HiArrowUpTray, HiPhoto, HiXMark } from 'react-icons/hi2';

import { cn } from '../../../utils/cn';
import { mediaItemToFile } from '../../../utils/mediaItemToFile';
import { useUserUploads } from '../../UserUploadsProvider';

import type { MediaItem } from '@gruenerator/shared/media-library';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { items } = useUserUploads();
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

  const handlePickFromUploads = async (item: MediaItem) => {
    setPickError(null);
    try {
      const file = await mediaItemToFile(item);
      onChange(file);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fehler beim Laden';
      setPickError(message);
    }
  };

  const recentItems = items.slice(0, uploadsGridSize);

  return (
    <div className="flex flex-col gap-2">
      {previewUrl ? (
        <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-[var(--background-alt)] border border-[var(--card-border)]">
          <img src={previewUrl} alt="Vorschau" className="w-full h-full object-contain" />
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            aria-label="Bild entfernen"
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
              ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
              : 'border-[var(--card-border)] bg-[var(--background-alt)] hover:border-primary-500',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <HiArrowUpTray size={20} className="text-foreground-muted" />
          <span className="text-xs text-foreground-muted text-center">
            Bild auswählen oder hierher ziehen
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
            <HiPhoto size={11} /> Aus Uploads wählen
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {recentItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void handlePickFromUploads(item)}
                disabled={disabled}
                className="relative aspect-square overflow-hidden rounded-md border border-[var(--card-border)] bg-[var(--card-background)] cursor-pointer hover:border-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed p-0"
                title={item.title ?? item.originalFilename ?? ''}
              >
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt={item.altText ?? item.title ?? ''}
                    className="size-full object-cover"
                    draggable={false}
                  />
                ) : null}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {pickError ? (
        <p className="m-0 text-[11px] text-red-600 dark:text-red-400">{pickError}</p>
      ) : null}
    </div>
  );
}
