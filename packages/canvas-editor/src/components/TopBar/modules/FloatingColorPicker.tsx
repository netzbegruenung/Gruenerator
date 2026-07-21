import React from 'react';

import { BRAND_COLORS } from '../../../utils/shapes';

import { cn } from '../../../utils/cn';

interface FloatingColorPickerProps {
  currentColor: string;
  onColorSelect: (color: string) => void;
  isExpanded?: boolean;
  onExpandChange?: (expanded: boolean) => void;
  colors?: typeof BRAND_COLORS;
  /** 'font' renders an "A" glyph with a colored underline (text elements); 'swatch' a filled chip. */
  variant?: 'font' | 'swatch';
}

const colorBtn =
  'size-8 max-canvas-mobile:size-[26px] rounded-full border border-black/10 cursor-pointer p-0 relative transition-transform duration-150 shrink-0 hover:-translate-y-0.5 active:scale-90';

export function FloatingColorPicker({
  currentColor,
  onColorSelect,
  isExpanded: externalExpanded,
  onExpandChange,
  colors,
  variant = 'swatch',
}: FloatingColorPickerProps) {
  const colorOptions = colors ?? BRAND_COLORS;
  const [internalExpanded, setInternalExpanded] = React.useState(false);
  const isExpanded = externalExpanded !== undefined ? externalExpanded : internalExpanded;
  const setIsExpanded = onExpandChange || setInternalExpanded;
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isExpanded) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsExpanded(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isExpanded]);

  if (!isExpanded) {
    return (
      <div className="flex items-center shrink-0" ref={containerRef}>
        {variant === 'font' ? (
          <button
            className="inline-flex flex-col items-center justify-center size-8 shrink-0 rounded-md border-none bg-transparent cursor-pointer text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)]"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(true);
            }}
            title="Textfarbe ändern"
            type="button"
            aria-expanded="false"
            aria-label="Farbpalette öffnen"
          >
            <span className="text-[15px] font-bold leading-none">A</span>
            <span
              className="mt-[2px] h-[3px] w-[15px] rounded-[1px]"
              style={{ backgroundColor: currentColor }}
            />
          </button>
        ) : (
          <button
            className="size-8 max-canvas-mobile:size-[26px] shrink-0 rounded-md border border-[var(--editor-border-strong)] cursor-pointer p-0 transition-transform duration-150 hover:-translate-y-0.5 active:scale-90"
            style={{ backgroundColor: currentColor }}
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(true);
            }}
            title="Farbe ändern"
            type="button"
            aria-expanded="false"
            aria-label="Farbpalette öffnen"
          />
        )}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 px-1 animate-canvas-expand-width max-canvas-mobile:gap-1 max-canvas-mobile:px-0.5"
      ref={containerRef}
    >
      {colorOptions.map((color) => (
        <button
          key={color.id}
          className={cn(
            colorBtn,
            currentColor === color.value &&
              'scale-110 border-primary-600 z-[1] after:content-[""] after:absolute after:-inset-1 after:border-2 after:border-primary-600 after:rounded-full after:animate-[scaleIn_0.2s_ease-out]'
          )}
          style={{ backgroundColor: color.value }}
          onClick={(e) => {
            e.stopPropagation();
            onColorSelect(color.value);
          }}
          title={color.name}
          type="button"
        />
      ))}
    </div>
  );
}
