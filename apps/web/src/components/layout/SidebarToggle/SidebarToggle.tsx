import { memo } from 'react';
import { FiSidebar } from 'react-icons/fi';

import useSidebarStore from '../../../stores/sidebarStore';

import { cn } from '@/utils/cn';

interface SidebarToggleProps {
  /** 'ghost' keeps the button fully transparent on mobile too (no frosted backdrop). */
  variant?: 'default' | 'ghost';
}

const SidebarToggle = memo(({ variant = 'default' }: SidebarToggleProps) => {
  const isOpen = useSidebarStore((state) => state.isOpen);
  const toggle = useSidebarStore((state) => state.toggle);

  return (
    <button
      className={cn(
        'flex items-center justify-center w-10 h-10 p-0 border-none cursor-pointer rounded-sm transition-colors duration-150 hover:bg-hover-alt bg-transparent',
        variant === 'default' &&
          'max-sm:bg-background/80 max-sm:backdrop-blur-sm max-sm:shadow-sm max-sm:rounded-lg'
      )}
      onClick={toggle}
      aria-label={isOpen ? 'Menü schließen' : 'Menü öffnen'}
      aria-expanded={isOpen}
    >
      <FiSidebar className="text-lg text-foreground-heading" aria-hidden="true" />
    </button>
  );
});

SidebarToggle.displayName = 'SidebarToggle';

export default SidebarToggle;
