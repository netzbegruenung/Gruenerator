import { useMediaLibrary, useMediaUpload, useMediaPicker } from '@gruenerator/shared/media-library';
import React, { useEffect, useState, useCallback } from 'react';
import {
  FaImage,
  FaVideo,
  FaUpload,
  FaTrash,
  FaEdit,
  FaCheck,
  FaTimes,
  FaSearch,
} from 'react-icons/fa';

import LoginRequired from '../../components/common/LoginRequired/LoginRequired';
import { useOptimizedAuth } from '../../hooks/useAuth';

import type { MediaItem, MediaType } from '@gruenerator/shared/media-library';

import './MediaLibraryPage.css';
import '../../assets/styles/components/ui/button.css';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Heute';
  if (days === 1) return 'Gestern';
  if (days < 7) return `vor ${days} Tagen`;
  return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface MediaCardProps {
  item: MediaItem;
  onDelete: (id: string) => Promise<boolean>;
  onEdit: (item: MediaItem) => void;
  isSelected?: boolean;
  onSelect?: (item: MediaItem) => void;
  selectionMode?: boolean;
}

const MediaCard: React.FC<MediaCardProps> = ({
  item,
  onDelete,
  onEdit,
  isSelected,
  onSelect,
  selectionMode,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    await onDelete(item.id);
    setIsDeleting(false);
    setShowDeleteConfirm(false);
  };

  const thumbnailUrl = item.thumbnailUrl || `${baseURL}/share/${item.shareToken}/preview`;

  return (
    <div
      className={`media-library-card ${isSelected ? 'selected' : ''} ${isDeleting ? 'deleting' : ''}`}
      onClick={() => selectionMode && onSelect?.(item)}
    >
      <div className="media-library-thumbnail">
        {item.mediaType === 'video' ? (
          <video src={thumbnailUrl} muted playsInline />
        ) : (
          <img src={thumbnailUrl} alt={item.title || 'Media'} loading="lazy" />
        )}
        <span className={`media-type-badge ${item.mediaType}`}>
          {item.mediaType === 'video' ? <FaVideo /> : <FaImage />}
        </span>
        {selectionMode && isSelected && (
          <div className="selection-overlay">
            <FaCheck />
          </div>
        )}
      </div>

      <div className="media-library-info">
        <h3 className="media-title">{item.title || 'Unbenannt'}</h3>
        <div className="media-meta">
          <span>{formatDate(item.createdAt)}</span>
          <span>{formatFileSize(item.fileSize)}</span>
        </div>
      </div>

      {!selectionMode && (
        <div className="media-library-actions">
          {showDeleteConfirm ? (
            <div className="delete-confirm">
              <button className="btn-icon confirm" onClick={handleDelete} disabled={isDeleting}>
                <FaCheck />
              </button>
              <button className="btn-icon cancel" onClick={() => setShowDeleteConfirm(false)}>
                <FaTimes />
              </button>
            </div>
          ) : (
            <>
              <button className="btn-icon" onClick={() => onEdit(item)} title="Bearbeiten">
                <FaEdit />
              </button>
              <button
                className="btn-icon delete"
                onClick={() => setShowDeleteConfirm(true)}
                title="Löschen"
              >
                <FaTrash />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

interface EditModalProps {
  item: MediaItem;
  onSave: (id: string, updates: { title?: string; altText?: string }) => Promise<boolean>;
  onClose: () => void;
}

const EditModal: React.FC<EditModalProps> = ({ item, onSave, onClose }) => {
  const [title, setTitle] = useState(item.title || '');
  const [altText, setAltText] = useState(item.altText || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    await onSave(item.id, { title, altText });
    setIsSaving(false);
    onClose();
  };

  return (
    <div className="media-edit-modal-overlay" onClick={onClose}>
      <div className="media-edit-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Medium bearbeiten</h2>
        <div className="media-edit-preview">
          <img src={`${baseURL}/share/${item.shareToken}/preview`} alt="" />
        </div>
        <div className="media-edit-form">
          <label>
            <span>Titel</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titel eingeben..."
            />
          </label>
          <label>
            <span>Alt-Text (Barrierefreiheit)</span>
            <textarea
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              placeholder="Beschreibung für Screenreader..."
              rows={3}
            />
          </label>
        </div>
        <div className="media-edit-actions">
          <button className="btn-secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
};

const MediaLibraryPage: React.FC = () => {
  const { isAuthenticated, loading: authLoading } = useOptimizedAuth();
  const {
    items,
    pagination,
    filters,
    isLoading,
    error,
    setFilters,
    refetch,
    loadMore,
    deleteItem,
    updateItem,
  } = useMediaLibrary();

  const {
    upload,
    isUploading,
    progress,
    error: uploadError,
    reset: resetUpload,
  } = useMediaUpload({
    onSuccess: () => refetch(),
  });

  const [editingItem, setEditingItem] = useState<MediaItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      refetch();
    }
  }, [isAuthenticated]);

  const handleTypeFilter = (type: MediaType | 'all') => {
    setFilters({ type });
  };

  const handleSearch = useCallback(() => {
    setFilters({ search: searchQuery || undefined });
  }, [searchQuery, setFilters]);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      await upload(files[i]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  if (authLoading) {
    return <div className="media-library-loading">Laden...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="media-library-page">
        <LoginRequired
          title="Mediathek"
          message="Melde dich an, um auf deine Mediathek zuzugreifen."
        />
      </div>
    );
  }

  return (
    <div className="media-library-page">
      <header className="media-library-header">
        <h1>Mediathek</h1>
        <p className="media-library-count">{pagination.total} von 50 Medien</p>
      </header>

      <div className="media-library-toolbar">
        <div className="media-library-filters">
          <button
            className={`filter-btn ${filters.type === 'all' ? 'active' : ''}`}
            onClick={() => handleTypeFilter('all')}
          >
            Alle
          </button>
          <button
            className={`filter-btn ${filters.type === 'image' ? 'active' : ''}`}
            onClick={() => handleTypeFilter('image')}
          >
            <FaImage /> Bilder
          </button>
          <button
            className={`filter-btn ${filters.type === 'video' ? 'active' : ''}`}
            onClick={() => handleTypeFilter('video')}
          >
            <FaVideo /> Videos
          </button>
        </div>

        <div className="media-library-search">
          <input
            type="text"
            placeholder="Suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button onClick={handleSearch}>
            <FaSearch />
          </button>
        </div>

        <label className="upload-btn btn-primary">
          <FaUpload /> Hochladen
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={(e) => handleFileUpload(e.target.files)}
            hidden
          />
        </label>
      </div>

      {isUploading && (
        <div className="upload-progress">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
          <span>Hochladen... {progress}%</span>
        </div>
      )}

      {(error || uploadError) && <div className="media-library-error">{error || uploadError}</div>}

      <div
        className={`media-library-grid ${isDragging ? 'drag-active' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {isLoading && items.length === 0 ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="media-library-skeleton" />
          ))
        ) : items.length === 0 ? (
          <div className="media-library-empty">
            <FaImage />
            <h3>Noch keine Medien</h3>
            <p>Lade Bilder oder Videos hoch oder erstelle sie mit dem Image Studio.</p>
          </div>
        ) : (
          items.map((item) => (
            <MediaCard key={item.id} item={item} onDelete={deleteItem} onEdit={setEditingItem} />
          ))
        )}

        {isDragging && (
          <div className="drop-overlay">
            <FaUpload />
            <span>Dateien hier ablegen</span>
          </div>
        )}
      </div>

      {pagination.hasMore && (
        <button className="load-more-btn btn-secondary" onClick={loadMore} disabled={isLoading}>
          {isLoading ? 'Laden...' : 'Mehr laden'}
        </button>
      )}

      {editingItem && (
        <EditModal item={editingItem} onSave={updateItem} onClose={() => setEditingItem(null)} />
      )}
    </div>
  );
};

export default MediaLibraryPage;
