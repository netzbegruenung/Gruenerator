import { Popover, PopoverContent, PopoverTrigger } from '@gruenerator/ui';
import * as Slider from '@radix-ui/react-slider';
import React from 'react';
import { PiTextAa } from 'react-icons/pi';

interface FloatingOutlineControlProps {
  stroke?: string;
  strokeWidth?: number;
  onChange: (patch: { stroke?: string; strokeWidth?: number }) => void;
}

const OUTLINE_COLORS = ['#ffffff', '#000000', '#316049', '#e6007e'];
const DEFAULT_WIDTH = 2;

const ICON_BTN =
  'inline-flex items-center justify-center size-8 shrink-0 rounded-md border-none bg-transparent cursor-pointer text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)]';

export function FloatingOutlineControl({
  stroke,
  strokeWidth,
  onChange,
}: FloatingOutlineControlProps) {
  const enabled = !!stroke && (strokeWidth ?? 0) > 0;

  const toggle = () => {
    if (enabled) {
      onChange({ stroke: undefined, strokeWidth: 0 });
    } else {
      onChange({ stroke: '#ffffff', strokeWidth: DEFAULT_WIDTH });
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={ICON_BTN}
          title="Kontur"
          type="button"
          aria-label="Textkontur bearbeiten"
        >
          <PiTextAa
            size={17}
            className={enabled ? 'text-[var(--editor-accent)]' : 'text-[var(--editor-text-muted)]'}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent className="z-[10001] w-56 flex flex-col gap-2.5 p-3" align="center">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--editor-text)]">Kontur</span>
          <button
            className="text-[11px] font-medium text-[var(--editor-accent)] hover:underline"
            onClick={toggle}
            type="button"
          >
            {enabled ? 'Entfernen' : 'Aktivieren'}
          </button>
        </div>

        {enabled && (
          <>
            <div className="flex items-center gap-2">
              {OUTLINE_COLORS.map((c) => (
                <button
                  key={c}
                  className="size-6 rounded-full border border-black/10 hover:scale-110 transition-transform"
                  style={{
                    backgroundColor: c,
                    outline: stroke === c ? '2px solid var(--editor-accent)' : 'none',
                    outlineOffset: '2px',
                  }}
                  onClick={() => onChange({ stroke: c })}
                  title={c}
                  type="button"
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] w-12 text-[var(--editor-text-muted)]">Stärke</span>
              <Slider.Root
                className="relative flex items-center select-none touch-none grow h-4"
                value={[strokeWidth ?? DEFAULT_WIDTH]}
                onValueChange={(v) => onChange({ strokeWidth: v[0] })}
                min={0.5}
                max={12}
                step={0.5}
              >
                <Slider.Track className="relative grow rounded-full h-1 bg-[var(--editor-border-soft)]">
                  <Slider.Range className="absolute rounded-full h-full bg-[var(--editor-accent)]" />
                </Slider.Track>
                <Slider.Thumb
                  className="block size-3 bg-white rounded-full border-2 border-[var(--editor-accent)] shadow-[0_1px_3px_rgba(0,0,0,0.2)] cursor-grab focus:outline-none"
                  aria-label="Konturstärke"
                />
              </Slider.Root>
              <span className="text-[11px] w-8 text-right tabular-nums text-[var(--editor-text-muted)]">
                {strokeWidth ?? DEFAULT_WIDTH}
              </span>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
