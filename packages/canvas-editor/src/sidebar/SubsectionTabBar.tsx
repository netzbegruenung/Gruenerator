import { useState, useEffect, useRef, type ReactNode } from 'react';

import type { IconType } from 'react-icons';

import { useMobileSubsectionBridge } from './MobileSubsectionBridgeContext';
import { cn } from '../utils/cn';

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
  const bridge = useMobileSubsectionBridge();

  // Report subsection metadata to native when in bridge mode
  const prevSerializedRef = useRef('');
  useEffect(() => {
    if (!bridge.active) return;
    const meta = subsections.map((s) => ({ id: s.id, label: s.label }));
    const serialized = JSON.stringify(meta);
    if (serialized !== prevSerializedRef.current) {
      prevSerializedRef.current = serialized;
      bridge.onSubsectionsChange(meta);
    }
  }, [bridge, subsections]);

  // Standard web state (always called to satisfy hooks rules)
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 900
  );

  const [localActiveSubsection, setLocalActiveSubsection] = useState<string | null>(() => {
    return isMobile ? null : defaultSubsection || subsections[0]?.id || null;
  });

  useEffect(() => {
    if (bridge.active) return;
    const handleResize = () => {
      setIsMobile(window.innerWidth < 900);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [bridge.active]);

  // In bridge mode: render only the active subsection's content (no pills)
  if (bridge.active) {
    const activeContent = subsections.find((s) => s.id === bridge.activeSubsection)?.content;
    if (!activeContent) return null;
    return <div className="pb-6 pt-md px-md [&>*]:animate-subsection-fade-in">{activeContent}</div>;
  }

  // --- Standard web rendering below ---

  const activeContent = subsections.find((s) => s.id === localActiveSubsection)?.content;

  if (!isMobile) {
    return (
      <div className="flex flex-col gap-6">
        {subsections.map((sub) => (
          <div key={sub.id}>{sub.content}</div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [-webkit-overflow-scrolling:touch] border-b border-b-grey-200 dark:border-b-grey-700">
        {subsections.map((sub) => {
          const isActive = localActiveSubsection === sub.id;
          return (
            <button
              key={sub.id}
              type="button"
              className={cn(
                'shrink-0 h-7 px-2.5 py-0.5 border-none rounded-full cursor-pointer text-[11px] font-semibold whitespace-nowrap transition-all duration-200',
                isActive
                  ? 'bg-primary-100 text-primary-600 dark:bg-primary-900 dark:text-primary-200'
                  : 'bg-grey-100 text-grey-500 dark:bg-grey-800 dark:text-grey-400 hover:bg-grey-200 dark:hover:bg-grey-700'
              )}
              onClick={() =>
                setLocalActiveSubsection(localActiveSubsection === sub.id ? null : sub.id)
              }
              aria-label={sub.label}
            >
              {sub.label}
            </button>
          );
        })}
      </div>

      {localActiveSubsection && activeContent && (
        <div className="pb-6 pt-md px-md [&>*]:animate-subsection-fade-in">{activeContent}</div>
      )}
    </div>
  );
}
