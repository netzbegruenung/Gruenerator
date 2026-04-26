import React from 'react';

export interface TopBarProps {
  visible: boolean;
  children: React.ReactNode;
}

export function TopBar({ visible, children }: TopBarProps) {
  if (!visible) return null;

  return (
    <div className="relative z-[110] w-full h-12 shrink-0 bg-white/70 dark:bg-[rgba(30,30,30,0.7)] backdrop-blur-[12px] text-foreground border-b border-black/[0.06] dark:border-white/[0.08] px-3 flex items-center gap-1 animate-canvas-slide-down-fade transition-all duration-300 max-canvas-mobile:h-11 max-canvas-mobile:px-2 max-canvas-mobile:gap-0.5">
      {children}
    </div>
  );
}
