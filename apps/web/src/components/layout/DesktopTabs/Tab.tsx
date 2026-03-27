import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { cn } from '../../../utils/cn';
import { useDesktopTabsStore, type Tab as TabType } from '../../../stores/desktopTabsStore';

interface TabProps {
  tab: TabType;
  index: number;
  isActive: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, tabId: string, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
}

const Tab: React.FC<TabProps> = ({
  tab,
  index,
  isActive,
  isDragging,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) => {
  const tabRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { setActiveTab, closeTab, tabs } = useDesktopTabsStore();

  const handleClick = () => {
    setActiveTab(tab.id);
    void navigate(tab.route);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length > 1) {
      const currentIndex = tabs.findIndex((t) => t.id === tab.id);
      const wasActive = isActive;

      closeTab(tab.id);

      if (wasActive) {
        const remainingTabs = tabs.filter((t) => t.id !== tab.id);
        const newActiveIndex = Math.min(currentIndex, remainingTabs.length - 1);
        if (remainingTabs[newActiveIndex]) {
          void navigate(remainingTabs[newActiveIndex].route);
        }
      }
    }
  };

  const handleMiddleClick = (e: React.MouseEvent) => {
    if (e.button === 1 && tabs.length > 1) {
      e.preventDefault();
      handleClose(e);
    }
  };

  return (
    <div
      ref={tabRef}
      className={cn(
        'desktop-tab group flex items-center gap-2 h-9 min-w-[80px] max-w-[280px] w-[200px] px-3 pl-3.5 bg-transparent border-none rounded-[10px] cursor-pointer transition-all duration-[0.18s] ease-in-out relative select-none shrink',
        'hover:bg-grey-100 dark:hover:bg-grey-800',
        isActive && 'bg-background dark:bg-grey-900 rounded-b-none -mb-px pb-px',
        isDragging && 'opacity-60 scale-[0.98]',
      )}
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      draggable
      onClick={handleClick}
      onMouseDown={handleMiddleClick}
      onDragStart={(e: React.DragEvent) => onDragStart(e, tab.id, index)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(e, index);
      }}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
    >
      {tab.isLoading && (
        <span className="w-3.5 h-3.5 border-2 border-grey-200 dark:border-grey-700 border-t-primary-500 dark:border-t-primary-400 rounded-full animate-spin shrink-0" />
      )}

      {tab.isDirty && !tab.isLoading && (
        <span
          className="w-2 h-2 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 shrink-0 shadow-[0_0_0_2px_var(--background-color)] dark:shadow-[0_0_0_2px_var(--grey-900)]"
          aria-label="Ungespeicherte Änderungen"
        />
      )}

      <span
        className={cn(
          'flex-1 text-[13px] font-medium text-grey-600 dark:text-grey-400 whitespace-nowrap overflow-hidden text-ellipsis min-w-0 tracking-[-0.01em]',
          isActive && 'text-foreground dark:text-grey-100 font-semibold'
        )}
      >
        {tab.title}
      </span>

      {tabs.length > 1 && (
        <button
          className={cn(
            'flex items-center justify-center w-5 h-5 border-none bg-transparent rounded-md cursor-pointer opacity-0 transition-all duration-150 ease-in-out text-grey-400 dark:text-grey-500 shrink-0 p-0 -ml-1',
            'hover:bg-grey-200 hover:text-grey-700 dark:hover:bg-grey-700 dark:hover:text-grey-200 active:scale-[0.92]',
            'group-hover:opacity-100',
            (isActive) && 'opacity-100'
          )}
          onClick={handleClose}
          aria-label={`Tab "${tab.title}" schließen`}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line
              x1="1"
              y1="1"
              x2="9"
              y2="9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <line
              x1="9"
              y1="1"
              x2="1"
              y2="9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
};

export default Tab;
