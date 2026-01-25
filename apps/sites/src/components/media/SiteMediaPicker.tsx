/**
 * SiteMediaPicker
 * Modal picker for selecting images from the shared media library
 * Used in site editor for hero images, profile images, section images
 */

import {
  useMediaLibrary,
  useMediaUpload,
  useMediaPickerStore,
  type MediaItem,
} from '@gruenerator/shared/media-library';
import { useEffect, useRef, useState } from 'react';
import './SiteMediaPicker.css';

export function SiteMediaPicker() {
  const { isOpen, selectedItems, mediaTypeFilter, closePicker, selectItem, confirmSelection } =
    useMediaPickerStore();

  const { items, isLoading, error, refetch, setFilters } = useMediaLibrary({
    initialFilters: { type: mediaTypeFilter === 'all' ? 'image' : mediaTypeFilter },
  });

  const {
    upload,
    isUploading,
    progress,
    error: uploadError,
    reset: resetUpload,
  } = useMediaUpload({
    onSuccess: () => {
      void refetch();
      resetUpload();
    },
  });

  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      void refetch();
    }
  }, [isOpen, refetch]);

  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          closePicker();
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, closePicker]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    setFilters({ search: query || undefined });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await upload(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === modalRef.current) {
      closePicker();
    }
  };

  const isSelected = (item: MediaItem) => selectedItems.some((i) => i.id === item.id);

  const getMediaUrl = (item: MediaItem) => {
    if (item.thumbnailUrl) return item.thumbnailUrl;
    if (item.mediaUrl) return item.mediaUrl;
    return `/api/share/${item.shareToken}/preview`;
  };

  if (!isOpen) return null;

  return (
    <div className="site-media-picker-overlay" ref={modalRef} onClick={handleBackdropClick}>
      <div className="site-media-picker-modal">
        <div className="site-media-picker-header">
          <h2>Mediathek</h2>
          <button
            type="button"
            className="site-media-picker-close"
            onClick={closePicker}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>

        <div className="site-media-picker-toolbar">
          <div className="site-media-picker-search">
            <input
              type="text"
              placeholder="Suchen..."
              value={searchQuery}
              onChange={handleSearch}
            />
          </div>
          <div className="site-media-picker-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="site-media-picker-upload-btn"
              onClick={handleUploadClick}
              disabled={isUploading}
            >
              {isUploading ? `Hochladen... ${Math.round(progress)}%` : '+ Hochladen'}
            </button>
          </div>
        </div>

        {(error || uploadError) && (
          <div className="site-media-picker-error">{error || uploadError}</div>
        )}

        <div className="site-media-picker-content">
          {isLoading && items.length === 0 ? (
            <div className="site-media-picker-loading">
              <div className="site-media-picker-spinner" />
              <span>Laden...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="site-media-picker-empty">
              <p>Keine Medien gefunden</p>
              <p className="site-media-picker-empty-hint">
                Lade dein erstes Bild hoch, um loszulegen
              </p>
            </div>
          ) : (
            <div className="site-media-picker-grid">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`site-media-picker-item ${isSelected(item) ? 'site-media-picker-item--selected' : ''}`}
                  onClick={() => selectItem(item)}
                >
                  <img
                    src={getMediaUrl(item)}
                    alt={item.altText || item.title || 'Media'}
                    loading="lazy"
                  />
                  {isSelected(item) && <div className="site-media-picker-item-check">✓</div>}
                  {item.title && <div className="site-media-picker-item-title">{item.title}</div>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="site-media-picker-footer">
          <button type="button" className="site-media-picker-cancel" onClick={closePicker}>
            Abbrechen
          </button>
          <button
            type="button"
            className="site-media-picker-confirm"
            onClick={confirmSelection}
            disabled={selectedItems.length === 0}
          >
            Auswählen {selectedItems.length > 0 && `(${selectedItems.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SiteMediaPicker;
