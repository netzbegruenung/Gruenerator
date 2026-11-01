// SPDX-License-Identifier: MPL-2.0
import { Slider } from 'radix-ui';
import React from 'react';
import { PiCheckerboard } from 'react-icons/pi';

import { TILE, TileCaption, useBarTiles } from '@ggraphic/editor/components/TopBar/barTiles';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { Popover, PopoverContent, PopoverTrigger } from '@ggraphic/editor/ui/popover';

interface FloatingOpacityControlProps {
  opacity: number;
  onOpacityChange: (opacity: number) => void;
}

const TRIGGER_BTN =
  'inline-flex items-center justify-center size-8 max-canvas-mobile:size-11 shrink-0 rounded-md border-none bg-transparent cursor-pointer text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)] data-[state=open]:bg-[var(--editor-active-bg)] data-[state=open]:text-[var(--editor-active-fg)]';

/**
 * Deckkraft — wie bei Canva ein Knopf, der Regler liegt im Popover. Offen in
 * der Leiste war er ihr breitestes Stück.
 */
export function FloatingOpacityControl({ opacity, onOpacityChange }: FloatingOpacityControlProps) {
  const t = useMessages();
  const tiles = useBarTiles();
  const label = t.sidebar.imageAdjust.opacity;
  const percent = `${Math.round(opacity * 100)} %`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={tiles ? TILE : TRIGGER_BTN}
          title={label}
          aria-label={label}
          type="button"
        >
          <PiCheckerboard size={18} aria-hidden="true" />
          <TileCaption>{label}</TileCaption>
        </button>
      </PopoverTrigger>
      <PopoverContent className="z-[10001] w-64 flex flex-col gap-2 p-3" align="center">
        <span className="text-xs font-medium text-[var(--editor-text)]">{label}</span>
        <div className="flex items-center gap-3">
          <Slider.Root
            className="relative flex grow items-center select-none touch-none h-5 max-canvas-mobile:h-11"
            value={[opacity]}
            onValueChange={(values) => onOpacityChange(values[0])}
            min={0}
            max={1}
            step={0.01}
          >
            <Slider.Track className="relative grow rounded-full h-1 bg-[var(--editor-border-soft)]">
              <Slider.Range className="absolute rounded-full h-full bg-[var(--editor-accent)]" />
            </Slider.Track>
            <Slider.Thumb
              className="block size-3.5 max-canvas-mobile:size-5 bg-white rounded-full border-2 border-[var(--editor-accent)] shadow-[0_1px_3px_rgba(0,0,0,0.2)] cursor-grab focus:outline-none focus:shadow-[0_0_0_3px_rgba(82,144,122,0.35)]"
              aria-label={label}
              aria-valuetext={percent}
            />
          </Slider.Root>
          <span className="text-[12px] font-medium w-10 text-right tabular-nums text-[var(--editor-text-muted)]">
            {percent}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
