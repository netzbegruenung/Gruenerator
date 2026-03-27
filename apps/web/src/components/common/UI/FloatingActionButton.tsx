import type { JSX, ReactNode } from 'react';

import { cn } from '../../../utils/cn';

interface FloatingActionButtonProps {
  icon: ReactNode;
  onClick: (event: React.MouseEvent) => void;
  visible?: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  className?: string;
}

const positionStyles: Record<string, string> = {
  'top-left': 'top-4 left-4',
  'top-right': 'top-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'bottom-right': 'bottom-4 right-4',
};

const FloatingActionButton = ({
  icon,
  onClick,
  visible = true,
  position = 'top-left',
  className = '',
}: FloatingActionButtonProps): JSX.Element | null => {
  if (!visible) return null;

  return (
    <button
      className={cn(
        'fixed z-[1000] size-12 rounded-full border-none',
        'bg-secondary-600 dark:bg-primary-600 text-white',
        'flex items-center justify-center cursor-pointer',
        'shadow-[0_4px_12px_rgba(0,0,0,0.2)]',
        'transition-[transform,box-shadow] duration-200 ease-in-out',
        'hover:scale-105 hover:shadow-[0_6px_16px_rgba(0,0,0,0.25)]',
        'dark:hover:bg-[var(--klee)]',
        'active:scale-95',
        '[&_svg]:text-xl',
        positionStyles[position],
        className
      )}
      onClick={onClick}
      type="button"
    >
      {icon}
    </button>
  );
};

export default FloatingActionButton;
