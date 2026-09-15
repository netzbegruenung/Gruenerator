import { FaCheck } from 'react-icons/fa';

import {
  CARD_CHECK_SMALL,
  CARD_PREVIEW,
  SELECTABLE_CARD,
  SELECTABLE_CARD_ACTIVE,
} from '../sidebarStyles';

import type { BackgroundColorOption } from '../types';

import { cn } from '../../utils/cn';

interface ColorSwatchGridProps {
  colors: readonly BackgroundColorOption[];
  currentColor: string;
  onColorChange: (color: string) => void;
}

/**
 * The round colour swatches, shared by the colour-backed templates
 * (`BackgroundSection`) and the photo-backed ones (`ImageBackgroundSection`),
 * which now offer a colour underneath the photo.
 *
 * `aria-pressed` rather than the plain `title` the inline copy carried: a
 * swatch is a toggle, and screen readers otherwise announce seven identically
 * shaped buttons with no indication of which one is in effect.
 */
export function ColorSwatchGrid({ colors, currentColor, onColorChange }: ColorSwatchGridProps) {
  return (
    <div className="flex flex-row flex-wrap justify-start gap-[8px]">
      {colors.map((option) => {
        const isActive = currentColor === option.color;
        return (
          <button
            key={option.id}
            className={cn(
              SELECTABLE_CARD,
              '!w-[48px] !h-[48px] !p-0 !rounded-full overflow-hidden',
              isActive && SELECTABLE_CARD_ACTIVE,
              isActive && '!border-primary-600 !shadow-[0_0_0_2px_var(--primary-100)]'
            )}
            onClick={() => onColorChange(option.color)}
            type="button"
            title={option.label}
            aria-label={option.label}
            aria-pressed={isActive}
          >
            <div className={cn(CARD_PREVIEW, '!w-full !h-full')}>
              <span
                className="w-full h-full rounded-full border-[var(--border-subtle)] block"
                style={{ backgroundColor: option.color }}
              />
              {isActive && (
                <span className={CARD_CHECK_SMALL}>
                  <FaCheck size={8} />
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
