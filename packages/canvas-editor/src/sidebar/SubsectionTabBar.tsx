import { useId, useState, type ReactNode } from 'react';

import { useIsCanvasMobile } from '../hooks/useIsCanvasMobile';
import { useRovingToolbar } from '../hooks/useRovingToolbar';
import { cn } from '../utils/cn';

import { HIDDEN_SCROLLBAR } from './sidebarStyles';

import type { IconType } from 'react-icons';

export interface Subsection {
  id: string;
  icon: IconType;
  label: string;
  content: ReactNode;
}

export interface SubsectionTabBarProps {
  subsections: Subsection[];
  defaultSubsection?: string;
}

export function SubsectionTabBar({ subsections, defaultSubsection }: SubsectionTabBarProps) {
  const isMobile = useIsCanvasMobile();
  const [localActiveSubsection, setLocalActiveSubsection] = useState<string | null>(null);
  const baseId = useId();
  const roving = useRovingToolbar<HTMLDivElement>('[role="tab"]');

  if (!isMobile) {
    return (
      <div className="flex flex-col gap-6">
        {subsections.map((sub) => (
          <div key={sub.id}>{sub.content}</div>
        ))}
      </div>
    );
  }

  // Mobiles Sheet: Filter-Chips statt einer zweiten Tab-Reihe. Genau ein Chip
  // ist immer aktiv — ein leeres Sheet ist kein gültiger Zustand.
  const activeId =
    subsections.find((s) => s.id === localActiveSubsection)?.id ??
    subsections.find((s) => s.id === defaultSubsection)?.id ??
    subsections[0]?.id;
  const activeContent = subsections.find((s) => s.id === activeId)?.content;

  return (
    <div className="flex flex-col gap-4">
      {subsections.length > 1 && (
        <div
          {...roving}
          role="tablist"
          aria-label="Ansicht"
          className={cn('flex gap-2 overflow-x-auto -mx-5 px-5 py-1.5 -my-1.5', HIDDEN_SCROLLBAR)}
        >
          {subsections.map((sub) => {
            const isActive = activeId === sub.id;
            return (
              <button
                key={sub.id}
                type="button"
                role="tab"
                id={`${baseId}-tab-${sub.id}`}
                aria-selected={isActive}
                aria-controls={`${baseId}-panel`}
                className={cn(
                  'touch-target flex-none h-8 px-3.5 rounded-2xl border-none cursor-pointer text-sm whitespace-nowrap transition-colors duration-150',
                  isActive
                    ? 'bg-[var(--editor-active-bg)] text-[var(--editor-active-fg)] font-bold'
                    : 'bg-[var(--editor-tile)] text-[var(--editor-text-secondary)] font-semibold'
                )}
                onClick={() => setLocalActiveSubsection(sub.id)}
              >
                {sub.label}
              </button>
            );
          })}
        </div>
      )}
      {activeContent && (
        <div
          key={activeId}
          role="tabpanel"
          id={`${baseId}-panel`}
          aria-labelledby={`${baseId}-tab-${activeId}`}
          className="[&>*]:animate-subsection-fade-in"
        >
          {activeContent}
        </div>
      )}
    </div>
  );
}
