import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@gruenerator/ui';
import { Check } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';

import { cn } from '../../../../utils/cn';

const ROBOT_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const THUMB_SIZE = 200;

const thumbnailCache = new Map<number, string>();

function generateThumbnail(id: number): Promise<string> {
  const cached = thumbnailCache.get(id);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = THUMB_SIZE;
      canvas.height = THUMB_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('No canvas context'));
      ctx.drawImage(img, 0, 0, THUMB_SIZE, THUMB_SIZE);
      const dataUrl = canvas.toDataURL('image/webp', 0.85);
      thumbnailCache.set(id, dataUrl);
      resolve(dataUrl);
    };
    img.onerror = reject;
    img.src = `/images/profileimages/${id}.svg`;
  });
}

function preloadAllThumbnails(): void {
  ROBOT_IDS.reduce(
    (chain, id) => chain.then(() => generateThumbnail(id)).catch(() => {}),
    Promise.resolve() as Promise<unknown>
  );
}

if (typeof window !== 'undefined' && typeof requestIdleCallback !== 'undefined') {
  requestIdleCallback(() => preloadAllThumbnails());
}

interface AvatarSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAvatarId: number;
  onSelect: (robotId: number) => void;
}

const AvatarSelectionModal = ({
  isOpen,
  onClose,
  currentAvatarId,
  onSelect,
}: AvatarSelectionModalProps): React.ReactElement => {
  const [selectedId, setSelectedId] = useState(currentAvatarId);
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});

  useEffect(() => {
    setSelectedId(currentAvatarId);
  }, [currentAvatarId]);

  useEffect(() => {
    if (!isOpen) return;

    const existing: Record<number, string> = {};
    const toLoad: number[] = [];
    for (const id of ROBOT_IDS) {
      const cached = thumbnailCache.get(id);
      if (cached) existing[id] = cached;
      else toLoad.push(id);
    }
    if (Object.keys(existing).length > 0) {
      setThumbnails((prev) => ({ ...prev, ...existing }));
    }

    let cancelled = false;
    (async () => {
      for (const id of toLoad) {
        if (cancelled) break;
        try {
          const thumb = await generateThumbnail(id);
          if (!cancelled) {
            setThumbnails((prev) => ({ ...prev, [id]: thumb }));
          }
        } catch {
          // Thumbnail generation can fail silently for invalid SVGs
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleSelect = useCallback(
    (robotId: number) => {
      setSelectedId(robotId);
      onSelect(robotId);
      setTimeout(onClose, 250);
    },
    [onSelect, onClose]
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[28rem] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-lg pt-lg pb-md">
          <DialogTitle>Wähle deinen Avatar</DialogTitle>
          <DialogDescription className="sr-only">
            Wähle einen der 9 Roboter-Avatare als dein Profilbild aus.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-md px-lg pb-lg max-[480px]:grid-cols-2 max-[480px]:gap-sm max-[480px]:px-md max-[480px]:pb-md">
          {ROBOT_IDS.map((robotId) => {
            const thumb = thumbnails[robotId];
            const isSelected = selectedId === robotId;
            return (
              <button
                key={robotId}
                type="button"
                className={cn(
                  'relative aspect-square rounded-lg p-sm flex items-center justify-center transition-all duration-150',
                  'bg-background-alt hover:bg-background hover:shadow-md hover:scale-[1.02]',
                  'border-2 focus:outline-none focus:ring-2 focus:ring-primary-500/20',
                  isSelected ? 'border-primary-500 bg-background shadow-md' : 'border-transparent'
                )}
                onClick={() => handleSelect(robotId)}
                aria-label={`Roboter Avatar ${robotId} auswählen`}
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt={`Roboter Avatar ${robotId}`}
                    className="w-full h-full object-contain rounded-sm"
                  />
                ) : (
                  <div className="w-full h-full rounded-sm bg-grey-200 dark:bg-grey-700 animate-pulse" />
                )}
                {isSelected && (
                  <div className="absolute top-1 right-1 size-5 rounded-full bg-primary-500 text-white flex items-center justify-center shadow-sm">
                    <Check className="size-3" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AvatarSelectionModal;
