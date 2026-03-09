import { useState, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import type { IconType } from 'react-icons';

import { cn } from '@/utils/cn';

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
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 900
  );

  const [activeSubsection, setActiveSubsection] = useState<string | null>(() => {
    return isMobile ? null : defaultSubsection || subsections[0]?.id || null;
  });
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 900);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPortalContainer(null);
      return;
    }

    let container = document.getElementById('subsection-bar-portal');
    if (!container) {
      container = document.createElement('div');
      container.id = 'subsection-bar-portal';
      document.body.appendChild(container);
    }

    setPortalContainer(container);

    return () => {
      const existing = document.getElementById('subsection-bar-portal');
      if (existing && existing.childNodes.length === 0) {
        existing.remove();
      }
    };
  }, [isMobile]);

  const activeContent = subsections.find((s) => s.id === activeSubsection)?.content;

  if (!isMobile) {
    return (
      <div className="flex flex-col gap-6">
        {subsections.map((sub) => (
          <div key={sub.id}>{sub.content}</div>
        ))}
      </div>
    );
  }

  const bar = (
    <div className="subsection-bar-fixed fixed bottom-[var(--mobile-tab-bar-height)] left-0 right-0 h-[var(--mobile-tab-bar-height)] flex items-center justify-center gap-0 bg-background border-t border-t-grey-200 dark:border-t-grey-700 z-[99] p-0 supports-[padding-bottom:env(safe-area-inset-bottom)]:bottom-[calc(var(--mobile-tab-bar-height)+env(safe-area-inset-bottom))]">
      {subsections.map((sub) => {
        const Icon = sub.icon;
        const isActive = activeSubsection === sub.id;
        return (
          <button
            key={sub.id}
            type="button"
            className={cn(
              'flex-1 max-w-[100px] h-14 flex flex-col items-center justify-center gap-0.5 bg-transparent border-none rounded-lg text-grey-400 cursor-pointer transition-all duration-200 relative py-1 px-2 hover:text-grey-600',
              isActive &&
                'text-primary-600 bg-primary-100 before:content-[""] before:absolute before:top-0 before:left-1/2 before:-translate-x-1/2 before:w-5 before:h-0.5 before:bg-primary-600 before:rounded-b'
            )}
            onClick={() => setActiveSubsection(activeSubsection === sub.id ? null : sub.id)}
            aria-label={sub.label}
          >
            <Icon size={20} />
            <span className="text-[8px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
              {sub.label}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      {portalContainer && createPortal(bar, portalContainer)}

      {activeSubsection && activeContent && (
        <div className="pb-6 pt-md px-md [&>*]:animate-subsection-fade-in supports-[padding-bottom:env(safe-area-inset-bottom)]:pb-[calc(var(--mobile-tab-bar-height)+12px+env(safe-area-inset-bottom))]">
          {activeContent}
        </div>
      )}
    </>
  );
}
