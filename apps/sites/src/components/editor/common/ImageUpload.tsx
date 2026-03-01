import { useMediaPicker, useMediaUpload, type MediaItem } from '@gruenerator/shared/media-library';
import { useRef } from 'react';

import { cn } from '@/utils/cn';

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  aspectRatio?: string;
  placeholder?: string;
  size?: 'small' | 'medium' | 'large' | 'fill';
  circular?: boolean;
  disabled?: boolean;
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
      if (items.length > 0) {
        const item = items[0];
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

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
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
        style={{ display: 'none' }}
      />
      <div
        className={cn(
          'group relative border-2 border-dashed border-grey-300 rounded-lg cursor-pointer overflow-hidden flex items-center justify-center bg-grey-50 transition-colors hover:border-primary-500 hover:bg-primary-50 focus:outline-none focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15',
          circular && 'rounded-full'
        )}
        style={aspectRatio ? { aspectRatio: circular ? '1/1' : aspectRatio } : undefined}
        onClick={value ? handleLibraryClick : handleUploadClick}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => e.key === 'Enter' && (value ? handleLibraryClick() : handleUploadClick())}
      >
        {isUploading ? (
          <div className="flex flex-col items-center justify-center gap-2 w-full p-5">
            <div
              className="h-1 bg-primary-500 rounded transition-[width_0.2s_ease]"
              style={{ width: `${progress}%` }}
            />
            <span className="text-[13px] text-grey-600">Hochladen... {Math.round(progress)}%</span>
          </div>
        ) : value ? (
          <>
            <img
              src={value}
              alt="Vorschau"
              className={cn('w-full h-full object-cover', circular && 'rounded-full')}
            />
            <button
              type="button"
              className={cn(
                'absolute top-2 right-2 w-7 h-7 border-none rounded-full bg-black/60 text-white text-lg cursor-pointer flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600/90',
                circular && 'top-1 right-1 w-6 h-6 text-sm'
              )}
              onClick={handleRemove}
              aria-label="Bild entfernen"
            >
              ×
            </button>
          </>
        ) : (
          <span
            className={cn('text-grey-400 text-[13px] text-center p-2', circular && 'text-xs p-2.5')}
          >
            + {placeholder}
          </span>
        )}
      </div>
      {!value && !isUploading && (
        <button
          type="button"
          className={cn(
            'block mt-1.5 p-0 border-none bg-transparent text-primary-600 text-[13px] cursor-pointer text-center w-full hover:underline',
            (circular || size === 'small') && 'text-[11px] mt-1'
          )}
          onClick={handleLibraryClick}
        >
          Aus Mediathek
        </button>
      )}
    </div>
  );
}
