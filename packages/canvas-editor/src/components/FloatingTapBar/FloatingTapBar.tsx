import React from 'react';

export interface FloatingTapBarProps {
  visible: boolean;
  children: React.ReactNode;
}

export function FloatingTapBar({ visible, children }: FloatingTapBarProps) {
  if (!visible) return null;

  return (
    <div className="z-[100] flex justify-center w-full py-2 shrink-0 max-canvas-mobile:py-1 max-canvas-mobile:px-2">
      <div className="bg-background text-foreground border border-grey-200 dark:border-grey-700 rounded-full p-1.5 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] flex items-center gap-1 animate-canvas-slide-down-fade transition-all duration-300 max-canvas-mobile:rounded-xl max-canvas-mobile:px-1.5 max-canvas-mobile:py-1 max-canvas-mobile:gap-0.5">
        {children}
      </div>
    </div>
  );
}
