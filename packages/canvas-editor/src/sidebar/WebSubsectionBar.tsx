import { memo, useCallback } from 'react';

import { cn } from '../utils/cn';

export interface WebSubsection {
  id: string;
  label: string;
}

interface WebSubsectionBarProps {
  subsections: WebSubsection[];
  activeSubsection: string | null;
  onSubsectionClick: (id: string) => void;
}

export const WebSubsectionBar = memo(function WebSubsectionBar({
  subsections,
  activeSubsection,
  onSubsectionClick,
}: WebSubsectionBarProps) {
  if (subsections.length === 0) return null;

  return (
    <div className="fixed bottom-[var(--mobile-tab-bar-height,60px)] left-0 right-0 bg-background border-t border-t-grey-200 dark:border-t-grey-700 z-[100]">
      <div className="flex items-center gap-1 px-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [-webkit-overflow-scrolling:touch]">
        {subsections.map((sub) => (
          <SubsectionItem
            key={sub.id}
            id={sub.id}
            label={sub.label}
            isActive={activeSubsection === sub.id}
            onClick={onSubsectionClick}
          />
        ))}
      </div>
    </div>
  );
});

interface SubsectionItemProps {
  id: string;
  label: string;
  isActive: boolean;
  onClick: (id: string) => void;
}

const SubsectionItem = memo(function SubsectionItem({
  id,
  label,
  isActive,
  onClick,
}: SubsectionItemProps) {
  const handleClick = useCallback(() => onClick(id), [onClick, id]);

  return (
    <button
      type="button"
      className={cn(
        'relative flex flex-col items-center justify-center py-1.5 px-2.5 min-w-[48px] h-[40px] border-none bg-transparent cursor-pointer',
        isActive ? 'text-[#005538] dark:text-primary-200' : 'text-grey-400 dark:text-grey-500'
      )}
      onClick={handleClick}
      role="tab"
      aria-selected={isActive}
      aria-label={label}
    >
      <span className="text-[10px] font-semibold whitespace-nowrap">{label}</span>
      {isActive && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 rounded-sm bg-[#005538] dark:bg-primary-200" />
      )}
    </button>
  );
});
