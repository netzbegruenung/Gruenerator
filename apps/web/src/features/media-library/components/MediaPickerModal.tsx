import { useMediaLibrary, useMediaUpload, useMediaPicker } from '@gruenerator/shared/media-library';
import React, { useEffect } from 'react';
import { FaImage, FaVideo, FaCheck, FaTimes, FaUpload } from 'react-icons/fa';

import { btn } from '../../../utils/buttonStyles';
import { cn } from '../../../utils/cn';

import type { MediaItem, MediaType } from '@gruenerator/shared/media-library';

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
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-lg"
      onClick={closePicker}
    >
      <div
        className="bg-background rounded-xl w-full max-w-[800px] max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center py-md px-lg border-b border-grey-200 dark:border-grey-700">
          <h2 className="m-0 text-[1.2rem] text-foreground">
            {mediaTypeFilter === 'video'
              ? 'Video auswählen'
              : mediaTypeFilter === 'image'
                ? 'Bild auswählen'
                : 'Medium auswählen'}
          </h2>
          <button
            className="w-9 h-9 flex items-center justify-center border-none rounded-full bg-transparent text-foreground cursor-pointer transition-colors duration-200 hover:bg-hover-alt"
            onClick={closePicker}
          >
            <FaTimes />
          </button>
        </header>

        <div className="flex justify-between items-center py-md px-lg gap-md max-[600px]:flex-col max-[600px]:items-stretch">
          {mediaTypeFilter === 'all' && (
            <div className="flex gap-sm">
              <button
                className="flex items-center gap-xs py-xs px-sm border border-grey-200 dark:border-grey-700 rounded-lg bg-[var(--tanne)] text-white text-[0.85rem] cursor-pointer transition-all duration-200"
                onClick={() => setFilters({ type: 'all' })}
              >
                Alle
              </button>
              <button
                className="flex items-center gap-xs py-xs px-sm border border-grey-200 dark:border-grey-700 rounded-lg bg-background text-foreground text-[0.85rem] cursor-pointer transition-all duration-200 hover:bg-[var(--tanne)] hover:text-white hover:border-[var(--tanne)]"
                onClick={() => setFilters({ type: 'image' })}
              >
                <FaImage /> Bilder
              </button>
              <button
                className="flex items-center gap-xs py-xs px-sm border border-grey-200 dark:border-grey-700 rounded-lg bg-background text-foreground text-[0.85rem] cursor-pointer transition-all duration-200 hover:bg-[var(--tanne)] hover:text-white hover:border-[var(--tanne)]"
                onClick={() => setFilters({ type: 'video' })}
              >
                <FaVideo /> Videos
              </button>
            </div>
          )}

          <label className="flex items-center gap-xs py-xs px-sm bg-[var(--tanne)] text-white rounded-lg text-[0.85rem] cursor-pointer transition-opacity duration-200 hover:opacity-90 max-[600px]:justify-center">
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
          <div className="h-[3px] bg-grey-100 dark:bg-grey-800">
            <div
              className="h-full bg-[var(--tanne)] transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-md px-lg grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-md max-[600px]:grid-cols-[repeat(auto-fill,minmax(100px,1fr))]">
          {isLoading && items.length === 0 ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square bg-gradient-to-r from-grey-100 via-grey-50 to-grey-100 dark:from-grey-800 dark:via-grey-700 dark:to-grey-800 bg-[length:200%_100%] animate-[skeleton-loading_1.5s_infinite] rounded-lg"
              />
            ))
          ) : items.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center p-xl text-grey-400 [&_svg]:text-[2rem] [&_svg]:mb-sm [&_svg]:opacity-50">
              <FaImage />
              <p>Keine Medien gefunden</p>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="cursor-pointer transition-transform duration-200 hover:scale-[1.02]"
                onClick={() => selectItem(item)}
              >
                <div
                  className={cn(
                    'relative aspect-square rounded-lg overflow-hidden bg-grey-100 dark:bg-grey-800 border-2 border-transparent transition-colors duration-200',
                    isSelected(item) && 'border-[var(--tanne)]'
                  )}
                >
                  {item.mediaType === 'video' ? (
                    <video
                      src={`${baseURL}/share/${item.shareToken}/preview`}
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={`${baseURL}/share/${item.shareToken}/preview`}
                      alt={item.title || 'Media'}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  )}
                  <span className="absolute top-xs left-xs py-[2px] px-[6px] bg-black/60 text-white rounded-lg text-[0.7rem]">
                    {item.mediaType === 'video' ? <FaVideo /> : <FaImage />}
                  </span>
                  {isSelected(item) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[var(--tanne)]/50 text-white text-[1.5rem]">
                      <FaCheck />
                    </div>
                  )}
                </div>
                <span className="block mt-xs text-[0.8rem] text-foreground whitespace-nowrap overflow-hidden text-ellipsis text-center">
                  {item.title || 'Unbenannt'}
                </span>
              </div>
            ))
          )}
        </div>

        {pagination.hasMore && (
          <button
            className="block w-[calc(100%-var(--spacing-xl))] mx-lg mb-md p-sm border border-grey-200 dark:border-grey-700 rounded-lg bg-transparent text-foreground cursor-pointer transition-all duration-200 hover:enabled:bg-hover-alt"
            onClick={loadMore}
            disabled={isLoading}
          >
            {isLoading ? 'Laden...' : 'Mehr laden'}
          </button>
        )}

        <footer className="flex justify-between items-center py-md px-lg border-t border-grey-200 dark:border-grey-700">
          <span className="text-grey-400 text-[0.9rem]">{selectedItems.length} ausgewählt</span>
          <div className="flex gap-md">
            <button className={btn.secondary} onClick={closePicker}>
              Abbrechen
            </button>
            <button
              className={btn.primary}
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
