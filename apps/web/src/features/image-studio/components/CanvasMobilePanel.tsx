import {
  useCanvasSidebarStore,
  useMobileSheet,
  SIDEBAR_FONT_SIZES,
} from '@gruenerator/canvas-editor';
import { memo, useCallback } from 'react';

import { cn } from '@/utils/cn';

export const CanvasMobilePanel = memo(function CanvasMobilePanel() {
  const { panelContent, activeTab, onTabClick, mobileSubsections } = useCanvasSidebarStore((s) => ({
    panelContent: s.panelContent,
    activeTab: s.activeTab,
    onTabClick: s.onTabClick,
    mobileSubsections: s.mobileSubsections,
  }));

  const isOpen = activeTab !== null && panelContent !== null;

  const handleClose = useCallback(() => {
    if (activeTab) onTabClick?.(activeTab);
  }, [activeTab, onTabClick]);

  const { handleRef, isDragging, translateY } = useMobileSheet({
    isOpen,
    onClose: handleClose,
    threshold: 100,
    velocityThreshold: 0.5,
  });

  if (!isOpen) return null;

  const subsectionBarOffset = mobileSubsections.length > 0 ? 40 : 0;

  const mobileStyle: React.CSSProperties = {};
  if (isDragging) {
    mobileStyle.transform = `translateY(${translateY}px)`;
    mobileStyle.transition = 'none';
  }
  if (subsectionBarOffset > 0) {
    mobileStyle.bottom = `calc(var(--mobile-tab-bar-height, 60px) + ${subsectionBarOffset}px)`;
  }

  return (
    <div
      className={cn(
        'fixed top-auto right-0 left-0 w-full bg-background overflow-hidden flex flex-col',
        'bottom-[var(--mobile-tab-bar-height,60px)]',
        'max-h-[calc(75vh-var(--mobile-tab-bar-height,60px))]',
        'pt-0 rounded-t-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.12)] z-[99]',
        'transition-[transform,opacity] duration-200 ease-out'
      )}
      style={Object.keys(mobileStyle).length > 0 ? mobileStyle : undefined}
    >
      <div
        ref={handleRef}
        className="flex justify-center items-center py-sm mb-xs cursor-grab active:cursor-grabbing"
      >
        <div className="w-10 h-1 bg-grey-400 dark:bg-grey-600 rounded-sm transition-[background-color,width] duration-200 active:w-[50px] active:bg-primary-600" />
      </div>

      <div
        className="flex-none min-h-0 overflow-y-auto p-0 pb-md flex flex-col gap-3 max-h-[calc(75vh-var(--mobile-tab-bar-height,60px)-60px)]"
        style={SIDEBAR_FONT_SIZES}
      >
        {panelContent}
      </div>
    </div>
  );
});
