import { HiLockClosed, HiLockOpen } from 'react-icons/hi';

import { cn } from '@/utils/cn';

export interface CanvasLockOverlayProps {
  isLocked: boolean;
  onToggleLock: () => void;
  label?: string;
  className?: string;
}

export function CanvasLockOverlay({
  isLocked,
  onToggleLock,
  label = 'Hintergrund',
  className,
}: CanvasLockOverlayProps) {
  return (
    <div
      className={cn(
        'relative bg-[rgba(15,23,42,0.9)] backdrop-blur-[8px] py-1.5 px-4 rounded-full flex items-center gap-2.5 text-white z-10 border border-white/10 shadow-[0_2px_4px_rgba(0,0,0,0.1)] pointer-events-auto transition-all duration-200 w-fit',
        className
      )}
    >
      <span className="text-[13px] font-semibold tracking-[0.3px] font-[Raleway,sans-serif]">
        {label}
      </span>
      <button
        type="button"
        className="flex items-center justify-center bg-transparent border-none text-white/90 cursor-pointer p-1 rounded-full size-6 transition-all duration-200 hover:bg-white/20 hover:text-white hover:scale-110 active:scale-95"
        onClick={onToggleLock}
        title={
          isLocked ? `${label} fixiert (Click zum Lösen)` : `${label} gelöst (Click zum Fixieren)`
        }
      >
        {isLocked ? <HiLockClosed size={16} /> : <HiLockOpen size={16} />}
      </button>
    </div>
  );
}
