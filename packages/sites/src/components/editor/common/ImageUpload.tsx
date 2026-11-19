import { Button } from '@gruenerator/ui';
import { useMediaPicker, useMediaUpload, type MediaItem } from '@gruenerator/shared/media-library';
import { cn } from '@gruenerator/shared/utils';
import { useRef } from 'react';

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  aspectRatio?: string;
  placeholder?: string;
  size?: 'small' | 'medium' | 'large' | 'fill';
  circular?: boolean;
  disabled?: boolean;
  /** Forwarded to the "Hochladen" button so a `<label htmlFor>` can target it. */
  id?: string;
}

const sizeClasses: Record<NonNullable<ImageUploadProps['size']>, string> = {
  small: 'w-20 max-[480px]:w-16',
  medium: 'w-[120px] max-[480px]:w-[100px]',
  large: 'w-[180px] max-[480px]:w-[140px]',
  fill: 'w-full',
};

export function ImageUpload({
  value,
  onChange,
  aspectRatio,
  placeholder = 'Bild hinzufügen',
  size = 'fill',
  circular = false,
  disabled = false,
  id,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { openImagePicker } = useMediaPicker();
  const { upload, isUploading, progress } = useMediaUpload({
    onSuccess: (result) => {
      onChange(`/api/share/${result.shareToken}/preview`);
    },
  });

  const handleUploadClick = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const handleLibraryClick = () => {
    if (disabled) return;
    openImagePicker((items: MediaItem[]) => {
      const item = items[0];
      if (item) {
        const url = item.mediaUrl || `/api/share/${item.shareToken}/preview`;
        onChange(url);
      }
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await upload(file);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  const handleRemove = () => {
    if (disabled) return;
    onChange('');
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) {
      await upload(file);
    }
  };

  return (
    <div
      className={cn(
        'relative w-full',
        sizeClasses[size],
        disabled && 'opacity-60 pointer-events-none'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      <div
        className={cn(
          'relative border-2 border-dashed border-grey-300 dark:border-grey-700 rounded-lg overflow-hidden flex items-center justify-center bg-grey-50 dark:bg-grey-900',
          circular && 'rounded-full'
        )}
        style={aspectRatio ? { aspectRatio: circular ? '1/1' : aspectRatio } : undefined}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {isUploading ? (
          <div className="flex flex-col items-center justify-center gap-2 w-full p-5">
            <div
              role="progressbar"
              aria-label="Upload-Fortschritt"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              className="w-full h-1 rounded bg-grey-200 dark:bg-grey-700 overflow-hidden"
            >
              <div
                className="h-full bg-primary-500 rounded transition-[width_0.2s_ease]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[13px] text-grey-600 dark:text-grey-400">
              Hochladen... {Math.round(progress)}%
            </span>
          </div>
        ) : value ? (
          <img
            src={value}
            alt=""
            className={cn('w-full h-full object-cover', circular && 'rounded-full')}
          />
        ) : (
          <span
            className={cn(
              'text-grey-600 dark:text-grey-400 text-[13px] text-center p-2',
              circular && 'text-xs p-2.5'
            )}
          >
            {placeholder}
          </span>
        )}
      </div>
      {!isUploading && (
        <div className="mt-1.5 flex flex-wrap justify-center gap-1">
          <Button
            id={id}
            type="button"
            variant="outline"
            size="sm"
            onClick={handleUploadClick}
            disabled={disabled}
          >
            Hochladen
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleLibraryClick}
            disabled={disabled}
          >
            Aus Mediathek
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={disabled}
            >
              Entfernen
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
