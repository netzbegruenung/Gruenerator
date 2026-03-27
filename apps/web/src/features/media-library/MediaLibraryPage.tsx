import { useMediaLibrary, useMediaUpload, useMediaPicker } from '@gruenerator/shared/media-library';
import { Button } from '@gruenerator/ui';
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
import { cn } from '../../utils/cn';

import type { MediaItem, MediaType } from '@gruenerator/shared/media-library';

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
      className={cn(
        'relative bg-background border border-grey-200 dark:border-grey-700 rounded-lg overflow-hidden transition-all duration-200 cursor-pointer group',
        'hover:border-primary-600 hover:shadow-[0_2px_8px_rgba(0,0,0,0.1)]',
        isSelected && 'border-primary-600 shadow-[0_0_0_2px_var(--primary-600)]',
        isDeleting && 'opacity-50 pointer-events-none'
      )}
      onClick={() => selectionMode && onSelect?.(item)}
    >
      <div className="relative aspect-video bg-grey-100 dark:bg-grey-800 overflow-hidden">
        {item.mediaType === 'video' ? (
          <video src={thumbnailUrl} muted playsInline className="w-full h-full object-cover" />
        ) : (
          <img
            src={thumbnailUrl}
            alt={item.title || 'Media'}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        )}
        <span className="absolute top-sm left-sm px-sm py-xs bg-black/60 text-white rounded-lg text-xs">
          {item.mediaType === 'video' ? <FaVideo /> : <FaImage />}
        </span>
        {selectionMode && isSelected && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary-600/50 text-white text-3xl">
            <FaCheck />
          </div>
        )}
      </div>

      <div className="px-md py-sm">
        <h3 className="m-0 text-[0.9rem] font-medium text-foreground whitespace-nowrap overflow-hidden text-ellipsis">
          {item.title || 'Unbenannt'}
        </h3>
        <div className="flex gap-sm mt-xs text-[0.8rem] text-grey-400">
          <span>{formatDate(item.createdAt)}</span>
          <span>{formatFileSize(item.fileSize)}</span>
        </div>
      </div>

      {!selectionMode && (
        <div className="absolute top-sm right-sm flex gap-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {showDeleteConfirm ? (
            <div className="flex gap-xs">
              <button
                className="size-8 flex items-center justify-center border-none rounded-lg bg-[var(--success-color)] text-white cursor-pointer transition-all duration-200"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                <FaCheck />
              </button>
              <button
                className="size-8 flex items-center justify-center border-none rounded-lg bg-[#D32F2F] text-white cursor-pointer transition-all duration-200"
                onClick={() => setShowDeleteConfirm(false)}
              >
                <FaTimes />
              </button>
            </div>
          ) : (
            <>
              <button
                className="size-8 flex items-center justify-center border-none rounded-lg bg-white/90 text-foreground cursor-pointer transition-all duration-200 hover:bg-primary-600 hover:text-white"
                onClick={() => onEdit(item)}
                title="Bearbeiten"
              >
                <FaEdit />
              </button>
              <button
                className="size-8 flex items-center justify-center border-none rounded-lg bg-white/90 text-foreground cursor-pointer transition-all duration-200 hover:bg-[#D32F2F] hover:text-white"
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
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-lg"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-xl max-w-[500px] w-full max-h-[90vh] overflow-y-auto p-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="m-0 mb-md text-foreground">Medium bearbeiten</h2>
        <div className="mb-md rounded-lg overflow-hidden aspect-video bg-grey-100 dark:bg-grey-800">
          <img
            src={`${baseURL}/share/${item.shareToken}/preview`}
            alt=""
            className="w-full h-full object-contain"
          />
        </div>
        <div className="flex flex-col gap-md">
          <label className="flex flex-col gap-xs">
            <span className="font-medium text-foreground">Titel</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titel eingeben..."
              className="px-md py-sm border border-grey-200 dark:border-grey-700 rounded-lg bg-background text-foreground resize-y focus:outline-none focus:border-primary-600"
            />
          </label>
          <label className="flex flex-col gap-xs">
            <span className="font-medium text-foreground">Alt-Text (Barrierefreiheit)</span>
            <textarea
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              placeholder="Beschreibung für Screenreader..."
              rows={3}
              className="px-md py-sm border border-grey-200 dark:border-grey-700 rounded-lg bg-background text-foreground resize-y focus:outline-none focus:border-primary-600"
            />
          </label>
        </div>
        <div className="flex gap-md justify-end mt-lg">
          <Button variant="brand-outline" size="brand" onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="brand" size="brand" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Speichern...' : 'Speichern'}
          </Button>
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
    return (
      <div className="flex items-center justify-center min-h-[200px] text-grey-400">Laden...</div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-[1200px] mx-auto p-lg">
        <LoginRequired
          title="Mediathek"
          message="Melde dich an, um auf deine Mediathek zuzugreifen."
        />
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto p-lg">
      <header className="flex justify-between items-center mb-lg">
        <h1 className="m-0 text-foreground">Mediathek</h1>
        <p className="text-grey-400 text-[0.9rem]">{pagination.total} von 50 Medien</p>
      </header>

      <div className="flex gap-md mb-lg flex-wrap items-center max-md:flex-col max-md:items-stretch">
        <div className="flex gap-sm">
          <button
            className={cn(
              'flex items-center gap-xs px-md py-sm border rounded-lg bg-background text-foreground cursor-pointer transition-all duration-200 hover:border-primary-600',
              filters.type === 'all'
                ? 'bg-primary-600 text-white border-primary-600'
                : 'border-grey-200 dark:border-grey-700'
            )}
            onClick={() => handleTypeFilter('all')}
          >
            Alle
          </button>
          <button
            className={cn(
              'flex items-center gap-xs px-md py-sm border rounded-lg bg-background text-foreground cursor-pointer transition-all duration-200 hover:border-primary-600',
              filters.type === 'image'
                ? 'bg-primary-600 text-white border-primary-600'
                : 'border-grey-200 dark:border-grey-700'
            )}
            onClick={() => handleTypeFilter('image')}
          >
            <FaImage /> Bilder
          </button>
          <button
            className={cn(
              'flex items-center gap-xs px-md py-sm border rounded-lg bg-background text-foreground cursor-pointer transition-all duration-200 hover:border-primary-600',
              filters.type === 'video'
                ? 'bg-primary-600 text-white border-primary-600'
                : 'border-grey-200 dark:border-grey-700'
            )}
            onClick={() => handleTypeFilter('video')}
          >
            <FaVideo /> Videos
          </button>
        </div>

        <div className="flex flex-1 max-w-[300px] max-md:max-w-none">
          <input
            type="text"
            placeholder="Suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="flex-1 px-md py-sm border border-grey-200 dark:border-grey-700 border-r-0 rounded-l-lg bg-background text-foreground"
          />
          <button
            onClick={handleSearch}
            className="px-md py-sm border border-grey-200 dark:border-grey-700 rounded-r-lg bg-background text-foreground cursor-pointer hover:bg-primary-600 hover:text-white hover:border-primary-600"
          >
            <FaSearch />
          </button>
        </div>

        <Button variant="brand" size="brand" asChild>
          <label className="flex items-center gap-sm cursor-pointer ml-auto max-md:ml-0">
            <FaUpload /> Hochladen
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={(e) => handleFileUpload(e.target.files)}
              hidden
            />
          </label>
        </Button>
      </div>

      {isUploading && (
        <div className="relative h-8 bg-grey-100 dark:bg-grey-800 rounded-lg mb-md overflow-hidden">
          <div
            className="absolute top-0 left-0 h-full bg-primary-600 transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
          <span className="relative flex items-center justify-center h-full text-foreground text-[0.9rem] z-[1]">
            Hochladen... {progress}%
          </span>
        </div>
      )}

      {(error || uploadError) && (
        <div className="p-md bg-[rgba(220,38,38,0.1)] text-[#D32F2F] rounded-lg mb-md">
          {error || uploadError}
        </div>
      )}

      <div
        className={cn(
          'grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-md relative min-h-[200px] max-md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]',
          isDragging &&
            'bg-grey-100 dark:bg-grey-800 border-2 border-dashed border-primary-600 rounded-lg'
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {isLoading && items.length === 0 ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-video bg-[length:200%_100%] rounded-lg animate-[skeleton-loading_1.5s_infinite]"
              style={{
                backgroundImage:
                  'linear-gradient(90deg, var(--grey-100) 25%, var(--background-color) 50%, var(--grey-100) 75%)',
              }}
            />
          ))
        ) : items.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center p-2xl text-grey-400 text-center">
            <FaImage className="text-5xl mb-md opacity-50" />
            <h3 className="m-0 mb-sm text-foreground">Noch keine Medien</h3>
            <p>Lade Bilder oder Videos hoch oder erstelle sie mit dem Image Studio.</p>
          </div>
        ) : (
          items.map((item) => (
            <MediaCard key={item.id} item={item} onDelete={deleteItem} onEdit={setEditingItem} />
          ))
        )}

        {isDragging && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-md bg-primary-600/10 text-primary-600 text-xl z-10">
            <FaUpload className="text-5xl" />
            <span>Dateien hier ablegen</span>
          </div>
        )}
      </div>

      {pagination.hasMore && (
        <Button
          variant="brand-outline"
          size="brand"
          className="block w-full max-w-[300px] mx-auto mt-lg"
          onClick={loadMore}
          disabled={isLoading}
        >
          {isLoading ? 'Laden...' : 'Mehr laden'}
        </Button>
      )}

      {editingItem && (
        <EditModal item={editingItem} onSave={updateItem} onClose={() => setEditingItem(null)} />
      )}
    </div>
  );
};

export default MediaLibraryPage;
