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

import { cn } from '@/utils/cn';

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
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000] p-5"
      ref={modalRef}
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-xl w-full max-w-[800px] max-h-[80vh] flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.15)]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-grey-200">
          <h2 className="m-0 text-lg font-semibold text-grey-800">Mediathek</h2>
          <button
            type="button"
            className="bg-transparent border-none text-2xl text-grey-500 cursor-pointer px-2 py-1 leading-none transition-colors hover:text-grey-700"
            onClick={closePicker}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-grey-100 max-[600px]:flex-col max-[600px]:items-stretch">
          <div className="flex-1 max-w-[300px] max-[600px]:max-w-none">
            <input
              type="text"
              placeholder="Suchen..."
              value={searchQuery}
              onChange={handleSearch}
              className="w-full py-2 px-3 border border-grey-300 rounded-md text-sm focus:outline-none focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/10"
            />
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="py-2 px-4 bg-primary-500 text-white border-none rounded-md text-sm font-medium cursor-pointer transition-colors hover:bg-primary-600 disabled:opacity-70 disabled:cursor-not-allowed"
              onClick={handleUploadClick}
              disabled={isUploading}
            >
              {isUploading ? `Hochladen... ${Math.round(progress)}%` : '+ Hochladen'}
            </button>
          </div>
        </div>

        {(error || uploadError) && (
          <div className="px-5 py-3 bg-red-50 text-red-700 text-sm border-b border-red-200">
            {error || uploadError}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-[200px]">
          {isLoading && items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-grey-500 text-sm">
              <div className="w-8 h-8 border-[3px] border-grey-200 border-t-primary-500 rounded-full animate-[spin_0.8s_linear_infinite] mb-3" />
              <span>Laden...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-grey-500 text-sm">
              <p>Keine Medien gefunden</p>
              <p className="mt-1 text-grey-400 text-[13px]">
                Lade dein erstes Bild hoch, um loszulegen
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 max-[600px]:grid-cols-[repeat(auto-fill,minmax(100px,1fr))]">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    'relative aspect-square bg-grey-100 border-2 border-transparent rounded-lg overflow-hidden cursor-pointer p-0 transition-[border-color,transform] hover:border-grey-300',
                    isSelected(item) && 'border-primary-500 hover:border-primary-600'
                  )}
                  onClick={() => selectItem(item)}
                >
                  <img
                    src={getMediaUrl(item)}
                    alt={item.altText || item.title || 'Media'}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  {isSelected(item) && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-primary-500 text-white rounded-full flex items-center justify-center text-sm font-semibold shadow-sm">
                      ✓
                    </div>
                  )}
                  {item.title && (
                    <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/60 to-transparent text-white text-[11px] whitespace-nowrap overflow-hidden text-ellipsis">
                      {item.title}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-grey-200">
          <button
            type="button"
            className="py-2.5 px-5 rounded-md text-sm font-medium cursor-pointer transition-colors bg-white border border-grey-300 text-grey-700 hover:bg-grey-50 hover:border-grey-400"
            onClick={closePicker}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="py-2.5 px-5 rounded-md text-sm font-medium cursor-pointer transition-colors bg-primary-500 border-none text-white hover:bg-primary-600 disabled:bg-grey-300 disabled:cursor-not-allowed"
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
