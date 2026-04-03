import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { FaCheck } from 'react-icons/fa';
import { Icon } from '@iconify/react';

import Spinner from '../../common/Spinner';
import { usePaginatedIcons } from '../../hooks/usePaginatedIcons';
import { loadAllIcons, getIconsSync, type IconDef } from '../../utils/canvasIcons';
import {
  CARD_GRID,
  CARD_CHECK_SMALL,
  CARD_PREVIEW,
  SELECTABLE_CARD,
  SELECTABLE_CARD_DISABLED,
  SIDEBAR_SECTION,
} from '../primitives';

import { cn } from '../../utils/cn';

export interface IconsSectionProps {
  selectedIcons: string[];
  onIconToggle: (iconId: string, selected: boolean) => void;
  maxSelections?: number;
  isExpanded?: boolean;
  searchQuery?: string;
}

const RECOMMENDED_ICON_IDS = [
  'ph:flower-tulip',
  'ph:heart-fill',
  'ph:sparkle-fill',
  'ph:star-fill',
];

export function IconsSection({
  selectedIcons,
  onIconToggle,
  maxSelections = 3,
  isExpanded = false,
  searchQuery = '',
}: IconsSectionProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [allIcons, setAllIcons] = useState<IconDef[]>(() => getIconsSync() ?? []);
  const [iconsLoading, setIconsLoading] = useState(!getIconsSync());

  useEffect(() => {
    if (getIconsSync()) return;
    let cancelled = false;
    loadAllIcons().then((icons) => {
      if (!cancelled) {
        setAllIcons(icons);
        setIconsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const recommendedIcons = useMemo(
    () =>
      RECOMMENDED_ICON_IDS.map((id) => allIcons.find((icon) => icon.id === id)).filter(
        Boolean
      ) as IconDef[],
    [allIcons]
  );

  const {
    visibleIcons,
    hasMore,
    loadMore,
    isLoading: paginationLoading,
  } = usePaginatedIcons(isExpanded, searchQuery);

  const hasSearch = searchQuery.trim().length > 0;

  const icons = hasSearch ? visibleIcons : isExpanded ? visibleIcons : recommendedIcons;

  useEffect(() => {
    if (!isExpanded || !hasMore) return;

    const scrollRoot = sentinelRef.current?.closest(
      '.sidebar-panel__content'
    ) as HTMLElement | null;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { root: scrollRoot ?? null, rootMargin: '300px', threshold: 0 }
    );

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }

    return () => observer.disconnect();
  }, [isExpanded, hasMore, loadMore]);

  const handleIconClick = useCallback(
    (iconId: string) => {
      const isSelected = selectedIcons.includes(iconId);
      if (isSelected) {
        onIconToggle(iconId, false);
      } else if (selectedIcons.length < maxSelections) {
        onIconToggle(iconId, true);
      }
    },
    [selectedIcons, onIconToggle, maxSelections]
  );

  if (iconsLoading) {
    return (
      <div
        className={cn(
          SIDEBAR_SECTION,
          'w-full max-canvas-mobile:!p-0 max-canvas-mobile:!m-0 flex items-center justify-center min-h-[100px]'
        )}
      >
        <Spinner size="small" />
      </div>
    );
  }

  return (
    <div className={cn(SIDEBAR_SECTION, 'w-full max-canvas-mobile:!p-0 max-canvas-mobile:!m-0')}>
      <div className={cn(CARD_GRID, 'grid-cols-[repeat(auto-fill,minmax(56px,1fr))]')}>
        {icons.map((icon) => {
          if (!icon) return null;
          const isSelected = selectedIcons.includes(icon.id);
          const isDisabled = !isSelected && selectedIcons.length >= maxSelections;

          return (
            <button
              key={icon.id}
              type="button"
              className={cn(SELECTABLE_CARD, isDisabled && SELECTABLE_CARD_DISABLED)}
              onClick={() => handleIconClick(icon.id)}
              title={icon.name}
              disabled={isDisabled}
            >
              <div className={cn(CARD_PREVIEW, 'text-[var(--font-color)]')}>
                <Icon icon={icon.id} width={30} height={30} />
                {isSelected && (
                  <span className={CARD_CHECK_SMALL}>
                    <FaCheck size={8} />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {(isExpanded || hasSearch) && paginationLoading && <Spinner size="small" />}

      {isExpanded && !hasSearch && (
        <>
          <div ref={sentinelRef} className="h-px w-full" />
          {hasMore && !paginationLoading && <Spinner size="small" />}
        </>
      )}
    </div>
  );
}
