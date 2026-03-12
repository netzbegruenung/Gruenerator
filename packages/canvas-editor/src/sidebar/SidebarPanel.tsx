import { useEffect, useState } from 'react';

import { useMobileSheet } from '../hooks/useMobileSheet';

import type { SidebarPanelProps } from './types';

import { cn } from '../utils/cn';

interface ExtendedSidebarPanelProps extends SidebarPanelProps {
  onClose?: () => void;
  /** Extra bottom offset in px when subsection bar is visible (mobile only) */
  bottomOffset?: number;
}

export function SidebarPanel({
  isOpen,
  children,
  onClose,
  bottomOffset = 0,
}: ExtendedSidebarPanelProps) {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' && window.innerWidth >= 900
  );

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 900);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const { handleRef, isDragging, translateY } = useMobileSheet({
    isOpen: isOpen && !isDesktop,
    onClose: onClose || (() => {}),
    threshold: 100,
    velocityThreshold: 0.5,
  });

  const handleBackdropClick = () => {
    if (!isDesktop && onClose) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const mobileStyle: React.CSSProperties = {};
  if (!isDesktop && isDragging) {
    mobileStyle.transform = `translateY(${translateY}px)`;
    mobileStyle.transition = 'none';
  }
  if (!isDesktop && bottomOffset > 0) {
    mobileStyle.bottom = `calc(var(--mobile-tab-bar-height, 60px) + ${bottomOffset}px)`;
  }

  return (
    <>
      {!isDesktop && <div className="hidden" onClick={handleBackdropClick} />}

      <div
        className={cn(
          'sidebar-panel fixed bg-background overflow-hidden flex flex-col',
          'transition-[transform,opacity] duration-200 ease-out z-[101]',
          /* Desktop: left side panel next to tab bar */
          'canvas-mobile:top-0 canvas-mobile:bottom-0 canvas-mobile:right-auto canvas-mobile:w-auto canvas-mobile:min-w-[120px] canvas-mobile:max-w-[320px] canvas-mobile:rounded-br-xl canvas-mobile:shadow-[8px_0_24px_rgba(0,0,0,0.1)]',
          'canvas-mobile:left-[var(--image-studio-tab-bar-width,64px)]',
          /* Mobile: bottom sheet — sits above the 60px tab bar */
          'max-canvas-mobile:top-auto max-canvas-mobile:right-0 max-canvas-mobile:bottom-[var(--mobile-tab-bar-height,60px)] max-canvas-mobile:left-0 max-canvas-mobile:w-full max-canvas-mobile:max-w-full max-canvas-mobile:min-w-0 max-canvas-mobile:max-h-[calc(75vh-var(--mobile-tab-bar-height,60px))] max-canvas-mobile:pt-0 max-canvas-mobile:rounded-t-2xl max-canvas-mobile:shadow-[0_-4px_24px_rgba(0,0,0,0.12)] max-canvas-mobile:z-[99]',
          'max-canvas-mobile:translate-y-0'
        )}
        style={Object.keys(mobileStyle).length > 0 ? mobileStyle : undefined}
      >
        {!isDesktop && (
          <div
            ref={handleRef}
            className="sidebar-panel__drag-handle flex justify-center items-center py-sm mb-xs cursor-grab active:cursor-grabbing"
          >
            <div className="sidebar-panel__drag-indicator w-10 h-1 bg-grey-400 dark:bg-grey-600 rounded-sm transition-[background-color,width] duration-200 active:w-[50px] active:bg-primary-600" />
          </div>
        )}

        <div className="sidebar-panel__content flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3 max-canvas-mobile:max-h-[calc(75vh-var(--mobile-tab-bar-height,60px)-60px)] max-canvas-mobile:p-0 max-canvas-mobile:pb-md">
          {children}
        </div>
      </div>
    </>
  );
}
