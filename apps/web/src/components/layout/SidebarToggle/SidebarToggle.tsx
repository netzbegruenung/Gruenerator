import { memo } from 'react';
import { PiX } from 'react-icons/pi';

import useSidebarStore from '../../../stores/sidebarStore';

import { cn } from '@/utils/cn';

const SidebarToggle = memo(() => {
  const isOpen = useSidebarStore((state) => state.isOpen);
  const toggle = useSidebarStore((state) => state.toggle);

  return (
    <button
      className={cn(
        'flex items-center justify-center w-10 h-10 p-0 border-none cursor-pointer rounded-sm transition-colors duration-150 hover:bg-hover-alt md:max-[767px]:w-[38px] md:max-[767px]:h-[38px] min-[1920px]:w-11 min-[1920px]:h-11',
        'bg-transparent max-sm:bg-background/80 max-sm:backdrop-blur-sm max-sm:shadow-sm max-sm:rounded-lg'
      )}
      onClick={toggle}
      aria-label={isOpen ? 'Menü schließen' : 'Menü öffnen'}
      aria-expanded={isOpen}
    >
      {isOpen ? (
        <PiX className="text-[1.4rem] text-foreground-heading" aria-hidden="true" />
      ) : (
        <div className="flex flex-col justify-center items-center gap-1" aria-hidden="true">
          <span className="block w-[18px] h-0.5 bg-foreground-heading rounded-[2px] max-[767px]:w-4 min-[1920px]:w-5" />
          <span className="block w-[18px] h-0.5 bg-foreground-heading rounded-[2px] max-[767px]:w-4 min-[1920px]:w-5" />
          <span className="block w-[18px] h-0.5 bg-foreground-heading rounded-[2px] max-[767px]:w-4 min-[1920px]:w-5" />
        </div>
      )}
    </button>
  );
});

SidebarToggle.displayName = 'SidebarToggle';

export default SidebarToggle;
