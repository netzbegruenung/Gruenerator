import { useMediaLibrary, useMediaUpload, useMediaPicker } from '@gruenerator/shared/media-library';
import React, { useEffect } from 'react';
import { FaImage, FaVideo, FaCheck, FaTimes, FaUpload } from 'react-icons/fa';

import type { MediaItem, MediaType } from '@gruenerator/shared/media-library';
import './MediaPickerModal.css';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

const MediaPickerModal: React.FC = () => {
  const {
    isOpen,
    selectedItems,
    allowMultiple,
    mediaTypeFilter,
    closePicker,
    selectItem,
    confirmSelection,
  } = useMediaPicker();

  const { items, pagination, isLoading, setFilters, refetch, loadMore } = useMediaLibrary({
    initialFilters: { type: mediaTypeFilter },
  });

  const { upload, isUploading, progress } = useMediaUpload({
    onSuccess: () => refetch(),
  });

  useEffect(() => {
    if (isOpen) {
      setFilters({ type: mediaTypeFilter });
      refetch();
    }
  }, [isOpen, mediaTypeFilter]);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      await upload(files[i]);
    }
  };

  const isSelected = (item: MediaItem) => selectedItems.some((i) => i.id === item.id);

  if (!isOpen) return null;

  return (
    <div className="media-picker-overlay" onClick={closePicker}>
      <div className="media-picker-modal" onClick={(e) => e.stopPropagation()}>
        <header className="media-picker-header">
          <h2>
            {mediaTypeFilter === 'video'
              ? 'Video auswählen'
              : mediaTypeFilter === 'image'
                ? 'Bild auswählen'
                : 'Medium auswählen'}
          </h2>
          <button className="close-btn" onClick={closePicker}>
            <FaTimes />
          </button>
        </header>

        <div className="media-picker-toolbar">
          {mediaTypeFilter === 'all' && (
            <div className="media-picker-filters">
              <button className="filter-btn active" onClick={() => setFilters({ type: 'all' })}>
                Alle
              </button>
              <button className="filter-btn" onClick={() => setFilters({ type: 'image' })}>
                <FaImage /> Bilder
              </button>
              <button className="filter-btn" onClick={() => setFilters({ type: 'video' })}>
                <FaVideo /> Videos
              </button>
            </div>
          )}

          <label className="upload-btn-small">
            <FaUpload /> Hochladen
            <input
              type="file"
              accept={
                mediaTypeFilter === 'image'
                  ? 'image/*'
                  : mediaTypeFilter === 'video'
                    ? 'video/*'
                    : 'image/*,video/*'
              }
              multiple={allowMultiple}
              onChange={(e) => handleFileUpload(e.target.files)}
              hidden
            />
          </label>
        </div>

        {isUploading && (
          <div className="upload-progress-bar">
            <div className="progress" style={{ width: `${progress}%` }} />
          </div>
        )}

        <div className="media-picker-grid">
          {isLoading && items.length === 0 ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="media-picker-skeleton" />
            ))
          ) : items.length === 0 ? (
            <div className="media-picker-empty">
              <FaImage />
              <p>Keine Medien gefunden</p>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className={`media-picker-item ${isSelected(item) ? 'selected' : ''}`}
                onClick={() => selectItem(item)}
              >
                <div className="media-picker-thumbnail">
                  {item.mediaType === 'video' ? (
                    <video src={`${baseURL}/share/${item.shareToken}/preview`} muted playsInline />
                  ) : (
                    <img
                      src={`${baseURL}/share/${item.shareToken}/preview`}
                      alt={item.title || 'Media'}
                      loading="lazy"
                    />
                  )}
                  <span className={`type-badge ${item.mediaType}`}>
                    {item.mediaType === 'video' ? <FaVideo /> : <FaImage />}
                  </span>
                  {isSelected(item) && (
                    <div className="selected-overlay">
                      <FaCheck />
                    </div>
                  )}
                </div>
                <span className="media-picker-title">{item.title || 'Unbenannt'}</span>
              </div>
            ))
          )}
        </div>

        {pagination.hasMore && (
          <button className="load-more-btn" onClick={loadMore} disabled={isLoading}>
            {isLoading ? 'Laden...' : 'Mehr laden'}
          </button>
        )}

        <footer className="media-picker-footer">
          <span className="selection-count">{selectedItems.length} ausgewählt</span>
          <div className="footer-actions">
            <button className="btn-secondary" onClick={closePicker}>
              Abbrechen
            </button>
            <button
              className="btn-primary"
              onClick={confirmSelection}
              disabled={selectedItems.length === 0}
            >
              Auswählen
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default MediaPickerModal;
