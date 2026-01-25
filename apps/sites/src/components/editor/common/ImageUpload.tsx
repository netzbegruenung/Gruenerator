import { useMediaPicker, useMediaUpload, type MediaItem } from '@gruenerator/shared/media-library';
import { useRef } from 'react';
import '../../../styles/components/image-upload.css';

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  aspectRatio?: string;
  placeholder?: string;
  size?: 'small' | 'medium' | 'large' | 'fill';
  circular?: boolean;
  disabled?: boolean;
}

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

  const sizeClass = `image-upload--${size}`;
  const circularClass = circular ? 'image-upload--circular' : '';
  const disabledClass = disabled ? 'image-upload--disabled' : '';

  return (
    <div className={`image-upload ${sizeClass} ${circularClass} ${disabledClass}`.trim()}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <div
        className={`image-upload-preview ${!value ? 'image-upload-preview--empty' : ''}`}
        style={aspectRatio ? { aspectRatio: circular ? '1/1' : aspectRatio } : undefined}
        onClick={value ? handleLibraryClick : handleUploadClick}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => e.key === 'Enter' && (value ? handleLibraryClick() : handleUploadClick())}
      >
        {isUploading ? (
          <div className="image-upload-progress">
            <div className="image-upload-progress-bar" style={{ width: `${progress}%` }} />
            <span>Hochladen... {Math.round(progress)}%</span>
          </div>
        ) : value ? (
          <>
            <img src={value} alt="Vorschau" />
            <button
              type="button"
              className="image-upload-remove"
              onClick={handleRemove}
              aria-label="Bild entfernen"
            >
              ×
            </button>
          </>
        ) : (
          <span className="image-upload-placeholder">+ {placeholder}</span>
        )}
      </div>
      {!value && !isUploading && (
        <button type="button" className="image-upload-library-link" onClick={handleLibraryClick}>
          Aus Mediathek
        </button>
      )}
    </div>
  );
}
