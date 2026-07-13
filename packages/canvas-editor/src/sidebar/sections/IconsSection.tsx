import { useCallback, useMemo, useRef, useEffect } from 'react';
import { FaCheck } from 'react-icons/fa';
import { Icon } from '@iconify/react';

import { Skeleton } from '@gruenerator/ui';

import { useIconCatalog } from '../../hooks/useIconCatalog';
import { usePaginatedIcons } from '../../hooks/usePaginatedIcons';
import { type IconDef } from '../../utils/canvasIcons';
import {
  CARD_GRID,
  CARD_CHECK_SMALL,
  CARD_PREVIEW,
  SELECTABLE_CARD,
  SELECTABLE_CARD_DISABLED,
  SIDEBAR_SECTION,
} from '../sidebarStyles';

import { cn } from '../../utils/cn';

export interface IconsSectionProps {
  selectedIcons: string[];
  onIconToggle: (iconId: string, selected: boolean) => void;
  maxSelections?: number;
  isExpanded?: boolean;
  searchQuery?: string;
}

const RECOMMENDED_ICON_IDS = [
  'tabler:flower',
  'tabler:heart-filled',
  'tabler:sparkles',
  'tabler:star-filled',
];

export function IconsSection({
  selectedIcons,
  onIconToggle,
  maxSelections = 3,
  isExpanded = false,
  searchQuery = '',
}: IconsSectionProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Browsing shows the default set; search spans all bundled sets.
  const { data: allIcons = [], isLoading: iconsLoading } = useIconCatalog();

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

  return (
    <div className={cn(SIDEBAR_SECTION, 'w-full max-canvas-mobile:!p-0 max-canvas-mobile:!m-0')}>
      {iconsLoading ? (
        <div className={cn(CARD_GRID, 'grid-cols-[repeat(auto-fill,minmax(56px,1fr))]')}>
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : (
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
      )}

      {(isExpanded || hasSearch) && paginationLoading && (
        <div className={cn(CARD_GRID, 'grid-cols-[repeat(auto-fill,minmax(56px,1fr))]', 'mt-2')}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      )}

      {isExpanded && !hasSearch && (
        <>
          <div ref={sentinelRef} className="h-px w-full" />
          {hasMore && !paginationLoading && (
            <div
              className={cn(CARD_GRID, 'grid-cols-[repeat(auto-fill,minmax(56px,1fr))]', 'mt-2')}
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-lg" />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
