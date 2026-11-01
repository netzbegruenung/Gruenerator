// SPDX-License-Identifier: MPL-2.0
import React from 'react';

import { useDocumentBrand } from '@ggraphic/editor/brand/documentBrand';
import { CustomColorSwatch } from '@ggraphic/editor/components/CustomColorSwatch';
import { TILE, useBarTiles } from '@ggraphic/editor/components/TopBar/barTiles';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { cn } from '@ggraphic/editor/utils/cn';
import { brandColors, type ColorOption } from '@ggraphic/editor/utils/colorOptions';

interface FloatingColorPickerProps {
  currentColor: string;
  onColorSelect: (color: string) => void;
  isExpanded?: boolean;
  onExpandChange?: (expanded: boolean) => void;
  colors?: ColorOption[];
  /** 'font' renders an "A" glyph with a colored underline (text elements); 'swatch' a filled chip. */
  variant?: 'font' | 'swatch';
  /** False limits the choice to `colors`. */
  allowCustom?: boolean;
}

/* ::after gehört schon dem Auswahlring, darum ein ::before als 44px-Trefferfläche.
   26px + 2 x 9px = 44px: die Reihe braucht mobil gap >= 18px, sonst liegt die Fläche
   über dem Nachbarn und fängt dessen Tipper ab. */
const HIT_44 =
  "max-canvas-mobile:before:content-[''] max-canvas-mobile:before:absolute max-canvas-mobile:before:inset-[-9px]";

const colorBtn = `size-8 max-canvas-mobile:size-[26px] rounded-full border border-black/10 cursor-pointer p-0 relative transition-transform duration-150 shrink-0 hover:-translate-y-0.5 active:scale-90 ${HIT_44}`;

export function FloatingColorPicker({
  currentColor,
  onColorSelect,
  isExpanded: externalExpanded,
  onExpandChange,
  colors,
  variant = 'swatch',
  allowCustom = true,
}: FloatingColorPickerProps) {
  const t = useMessages();
  const tiles = useBarTiles();
  const brand = useDocumentBrand();
  const colorOptions = colors ?? brandColors(brand);
  const [internalExpanded, setInternalExpanded] = React.useState(false);
  const isExpanded = externalExpanded !== undefined ? externalExpanded : internalExpanded;
  const setIsExpanded = onExpandChange || setInternalExpanded;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const wasExpanded = React.useRef(isExpanded);

  // The trigger and the swatch row replace each other, so focus would be lost
  // on every toggle: move it into the row on open, back to the trigger on close.
  React.useEffect(() => {
    if (wasExpanded.current === isExpanded) return;
    wasExpanded.current = isExpanded;
    const container = containerRef.current;
    if (!container) return;
    if (isExpanded) {
      const target =
        container.querySelector<HTMLElement>('button[aria-pressed="true"]') ??
        container.querySelector<HTMLElement>('button, input');
      target?.focus();
    } else if (!document.activeElement || document.activeElement === document.body) {
      container.querySelector<HTMLElement>('button')?.focus();
    }
  }, [isExpanded]);

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

  if (!isExpanded && tiles) {
    // Als Kachel: Farbe oben, „Farbe“ darunter; der sichtbare Name ist der Name.
    return (
      <div className="flex items-center shrink-0" ref={containerRef}>
        <button
          className={TILE}
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(true);
          }}
          title={variant === 'font' ? t.topBar.changeTextColor : t.topBar.changeColor}
          type="button"
          aria-expanded={false}
        >
          {variant === 'font' ? (
            <span className="flex flex-col items-center" aria-hidden>
              <span className="text-[15px] font-bold leading-none">A</span>
              <span
                className="mt-[2px] h-[3px] w-[15px] rounded-[1px]"
                style={{ backgroundColor: currentColor }}
              />
            </span>
          ) : (
            <span
              className="size-[18px] rounded-md border border-[var(--editor-border-strong)]"
              style={{ backgroundColor: currentColor }}
              aria-hidden
            />
          )}
          {t.topBar.tiles.color}
        </button>
      </div>
    );
  }

  if (!isExpanded) {
    return (
      <div className="flex items-center shrink-0" ref={containerRef}>
        {variant === 'font' ? (
          <button
            className="inline-flex flex-col items-center justify-center size-8 max-canvas-mobile:size-11 shrink-0 rounded-md border-none bg-transparent cursor-pointer text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)]"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(true);
            }}
            title={t.topBar.changeTextColor}
            type="button"
            aria-expanded={false}
            aria-label={t.topBar.openPalette}
          >
            <span className="text-[15px] font-bold leading-none">A</span>
            <span
              className="mt-[2px] h-[3px] w-[15px] rounded-[1px]"
              style={{ backgroundColor: currentColor }}
            />
          </button>
        ) : (
          <button
            className={`size-8 max-canvas-mobile:size-[26px] shrink-0 rounded-md border border-[var(--editor-border-strong)] cursor-pointer p-0 transition-transform duration-150 hover:-translate-y-0.5 active:scale-90 relative ${HIT_44}`}
            style={{ backgroundColor: currentColor }}
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(true);
            }}
            title={t.topBar.changeColor}
            type="button"
            aria-expanded={false}
            aria-label={t.topBar.openPalette}
          />
        )}
      </div>
    );
  }

  return (
    // Escape bubbles up from the focused swatch; the group itself is not a widget.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className="flex items-center gap-2 px-1 animate-canvas-expand-width max-canvas-mobile:gap-[18px] max-canvas-mobile:px-[9px]"
      ref={containerRef}
      role="group"
      aria-label={t.topBar.palette}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        // Close the row only; the canvas must not also deselect.
        e.stopPropagation();
        setIsExpanded(false);
      }}
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
          aria-label={color.name}
          aria-pressed={currentColor === color.value}
          type="button"
        />
      ))}
      {allowCustom && (
        <CustomColorSwatch
          value={currentColor}
          presets={colorOptions.map((color) => color.value)}
          onPick={onColorSelect}
          className={`size-8 max-canvas-mobile:size-[26px] ${HIT_44}`}
          outlineOffset={3}
        />
      )}
    </div>
  );
}
