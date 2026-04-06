/**
 * UploadsSection - User-uploaded image management for the canvas editor.
 *
 * Provides a file upload button and displays uploaded images in a grid.
 * Each image can be clicked to select it on canvas, or deleted via hover button.
 */

import { useRef } from 'react';
import { FaTrash } from 'react-icons/fa';
import { HiArrowUpTray } from 'react-icons/hi2';

import { cn } from '../../utils/cn';
import { SidebarHint } from '../components/SidebarHint';
import { SIDEBAR_SECTION } from '../primitives';

import type { UserImageInstance } from '../../utils/userImageUtils';

export interface UploadsSectionProps {
  userImages: UserImageInstance[];
  onAddImage: (file: File, objectUrl: string) => void;
  onRemoveImage: (id: string) => void;
  onSelectImage: (id: string) => void;
}

export function UploadsSection({
  userImages,
  onAddImage,
  onRemoveImage,
  onSelectImage,
}: UploadsSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      const objectUrl = URL.createObjectURL(file);
      onAddImage(file, objectUrl);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={cn(SIDEBAR_SECTION, 'gap-md p-md max-canvas-mobile:p-sm')}>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center justify-center gap-xs py-sm px-md bg-primary-600 text-white border-none rounded-lg cursor-pointer text-sm font-semibold transition-colors duration-150 hover:bg-primary-700"
      >
        <HiArrowUpTray size={16} />
        Bild hochladen
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      {userImages.length > 0 && (
        <div className="flex flex-col gap-xs">
          <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
            Hochgeladene Bilder
          </span>
          <div className="grid grid-cols-2 gap-xs">
            {userImages.map((img) => (
              <div
                key={img.id}
                className="group relative aspect-square overflow-hidden rounded-lg border border-[var(--card-border)] bg-[var(--card-background)] cursor-pointer transition-colors duration-150 hover:border-primary-500"
                onClick={() => onSelectImage(img.id)}
              >
                <img
                  src={img.src}
                  alt={img.fileName}
                  className="size-full object-cover"
                  draggable={false}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveImage(img.id);
                  }}
                  className="absolute top-1 right-1 size-6 flex items-center justify-center bg-black/60 text-white border-none rounded-md cursor-pointer opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                  aria-label="Bild entfernen"
                >
                  <FaTrash size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {userImages.length === 0 && (
        <SidebarHint>
          Lade eigene Bilder hoch, um sie auf der Leinwand zu platzieren. Du kannst sie dann per Drag
          & Drop positionieren und skalieren.
        </SidebarHint>
      )}
    </div>
  );
}
