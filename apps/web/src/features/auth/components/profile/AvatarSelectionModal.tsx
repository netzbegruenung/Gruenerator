import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  ScrollArea,
} from '@gruenerator/ui';
import { useShareLinks } from '@gruenerator/wolke';
import { Check, Cloud, Lock } from 'lucide-react';
import { useState, useEffect, useCallback, type ReactElement } from 'react';

import { cn } from '../../../../utils/cn';

const ROBOT_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const WOLKI_ID = 10;

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
}: AvatarSelectionModalProps): ReactElement => {
  const [selectedId, setSelectedId] = useState(currentAvatarId);
  const { data: shareLinks = [] } = useShareLinks(undefined, undefined, { enabled: isOpen });
  const wolkiUnlocked = shareLinks.length > 0;

  useEffect(() => {
    setSelectedId(currentAvatarId);
  }, [currentAvatarId]);

  const handleSelect = useCallback(
    (robotId: number) => {
      if (robotId === WOLKI_ID && !wolkiUnlocked) return;
      setSelectedId(robotId);
      onSelect(robotId);
      setTimeout(onClose, 250);
    },
    [onSelect, onClose, wolkiUnlocked]
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[22rem] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-md pt-md pb-sm">
          <DialogTitle className="text-sm">Wähle deinen Avatar</DialogTitle>
          <DialogDescription className="sr-only">
            Wähle einen Avatar als dein Profilbild aus.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[280px]">
          <div className="grid grid-cols-4 gap-sm px-md pb-md">
            {ROBOT_IDS.map((robotId) => {
              const isSelected = selectedId === robotId;
              const isWolki = robotId === WOLKI_ID;
              const isLocked = isWolki && !wolkiUnlocked;

              return (
                <div key={robotId} className="flex flex-col items-center">
                  <button
                    type="button"
                    className={cn(
                      'relative aspect-square rounded-lg flex items-center justify-center transition-all duration-150 w-full',
                      'border-2 focus:outline-none focus:ring-2 focus:ring-primary-500/20',
                      isLocked
                        ? 'bg-grey-100 dark:bg-grey-800 border-transparent cursor-not-allowed opacity-40'
                        : 'hover:bg-background-alt hover:scale-105',
                      isSelected && !isLocked
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20'
                        : 'border-transparent'
                    )}
                    onClick={() => handleSelect(robotId)}
                    disabled={isLocked}
                    aria-label={
                      isWolki
                        ? isLocked
                          ? 'Wolki — Verbinde deine Wolke zum Freischalten'
                          : 'Wolki auswählen'
                        : `Avatar ${robotId} auswählen`
                    }
                    title={isLocked ? 'Verbinde deine Wolke, um Wolki freizuschalten' : undefined}
                  >
                    <img
                      src={`/images/profileimages/${robotId}.svg`}
                      alt={isWolki ? 'Wolki' : `Avatar ${robotId}`}
                      className={cn('w-full h-full object-contain', isLocked && 'grayscale')}
                      loading="lazy"
                    />
                    {isSelected && !isLocked && (
                      <div className="absolute -top-0.5 -right-0.5 size-4 rounded-full bg-primary-500 text-white flex items-center justify-center">
                        <Check className="size-2.5" />
                      </div>
                    )}
                    {isLocked && (
                      <div className="absolute -top-0.5 -right-0.5 size-4 rounded-full bg-grey-400 dark:bg-grey-600 text-white flex items-center justify-center">
                        <Lock className="size-2.5" />
                      </div>
                    )}
                    {isWolki && wolkiUnlocked && !isSelected && (
                      <div className="absolute -top-0.5 -right-0.5 size-4 rounded-full bg-sky-400 text-white flex items-center justify-center">
                        <Cloud className="size-2.5" />
                      </div>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default AvatarSelectionModal;
