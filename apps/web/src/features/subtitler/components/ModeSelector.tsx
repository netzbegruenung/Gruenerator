import React from 'react';
import { MdSubtitles, MdAutoAwesome } from 'react-icons/md';

import { cn } from '@/utils/cn';

import type { IconType } from 'react-icons';

interface Mode {
  id: 'auto' | 'subtitle';
  title: string;
  description: string;
  Icon: IconType;
  enabled: boolean;
}

interface ModeSelectorProps {
  onSelect: (modeId: Mode['id']) => void;
  videoFile: File;
}

const modes: Mode[] = [
  {
    id: 'auto',
    title: 'Automatisch',
    description: 'Ein Klick: Stille entfernen, Untertitel hinzufügen',
    Icon: MdAutoAwesome,
    enabled: true,
  },
  {
    id: 'subtitle',
    title: 'Manuell',
    description: 'Schnell Untertitel zu deinem Video hinzufügen',
    Icon: MdSubtitles,
    enabled: true,
  },
];

const ModeSelector: React.FC<ModeSelectorProps> = ({ onSelect, videoFile }) => {
  const handleCardClick = (mode: Mode) => {
    if (mode.enabled) {
      onSelect(mode.id);
    }
  };

  return (
    <div className="flex flex-col items-center p-md max-w-[800px] mx-auto">
      <div className="flex w-full gap-md max-sm:flex-col">
        {modes.map((mode) => (
          <button
            key={mode.id}
            className={cn(
              'flex flex-1 flex-col items-center gap-sm rounded-lg border-2 p-lg pb-xl text-center transition-all',
              'border-grey-200 bg-background dark:border-grey-700 dark:bg-background-alt',
              'max-sm:flex-row max-sm:gap-md max-sm:p-md max-sm:text-left',
              mode.enabled
                ? 'cursor-pointer hover:-translate-y-0.5 hover:border-primary-600 hover:shadow-md dark:hover:border-primary-500'
                : 'cursor-not-allowed opacity-50'
            )}
            onClick={() => handleCardClick(mode)}
            disabled={!mode.enabled}
            type="button"
          >
            <div
              className={cn(
                'flex size-14 shrink-0 items-center justify-center rounded-lg bg-background-alt text-[28px] text-primary-600 dark:bg-grey-800',
                'max-sm:size-10 max-sm:text-xl'
              )}
            >
              <mode.Icon />
            </div>
            <div className="flex flex-col items-center max-sm:min-w-0 max-sm:flex-1 max-sm:items-start">
              <h3 className="mb-xxs text-[0.9375rem] font-semibold text-foreground">
                {mode.title}
              </h3>
              <p className="m-0 text-[0.8125rem] leading-relaxed text-grey-500">
                {mode.description}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ModeSelector;
