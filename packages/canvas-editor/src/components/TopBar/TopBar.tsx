import React from 'react';

export interface TopBarProps {
  visible: boolean;
  children: React.ReactNode;
}

export function TopBar({ visible, children }: TopBarProps) {
  if (!visible) return null;

  return (
    <div className="relative z-[110] w-full h-[var(--editor-topbar-height)] shrink-0 bg-[image:var(--editor-menubar-gradient)] text-white px-4 flex items-center gap-1 animate-canvas-slide-down-fade transition-all duration-300 max-canvas-mobile:h-[52px] max-canvas-mobile:px-2.5 max-canvas-mobile:gap-1">
      {children}
    </div>
  );
}
