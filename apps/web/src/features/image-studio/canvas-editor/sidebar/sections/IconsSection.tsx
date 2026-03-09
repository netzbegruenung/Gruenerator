import { useCallback, useMemo, useRef, useEffect } from 'react';
import { FaCheck } from 'react-icons/fa';

import Spinner from '../../../../../components/common/Spinner';
import { usePaginatedIcons } from '../../hooks/usePaginatedIcons';
import { ALL_ICONS } from '../../utils/canvasIcons';
import {
  CARD_GRID,
  CARD_CHECK_SMALL,
  CARD_PREVIEW,
  SELECTABLE_CARD,
  SELECTABLE_CARD_DISABLED,
  SIDEBAR_SECTION,
} from '../primitives';

import { cn } from '@/utils/cn';

export interface IconsSectionProps {
  selectedIcons: string[];
  onIconToggle: (iconId: string, selected: boolean) => void;
  maxSelections?: number;
  isExpanded?: boolean;
}

const RECOMMENDED_ICON_IDS = ['pi-flowertulip', 'pi-heartfill', 'pi-sparklefill', 'pi-starfill'];

export function IconsSection({
  selectedIcons,
  onIconToggle,
  maxSelections = 3,
  isExpanded = false,
}: IconsSectionProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  const recommendedIcons = useMemo(
    () =>
      RECOMMENDED_ICON_IDS.map((id) => ALL_ICONS.find((icon) => icon.id === id)).filter(Boolean),
    []
  );

  const { visibleIcons, hasMore, loadMore, totalCount, loadedCount } =
    usePaginatedIcons(isExpanded);

  const icons = isExpanded ? visibleIcons : recommendedIcons;

  useEffect(() => {
    if (!isExpanded || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '300px', threshold: 0 }
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
      <div className={cn(CARD_GRID, 'grid-cols-[repeat(auto-fill,minmax(48px,1fr))]')}>
        {icons.map((icon) => {
          if (!icon) return null;
          const IconComponent = icon.component;
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
                <IconComponent size={24} />
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

      {isExpanded && (
        <>
          <div ref={sentinelRef} className="h-px w-full" />
          {hasMore && <Spinner size="small" />}
        </>
      )}
    </div>
  );
}
