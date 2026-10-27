// SPDX-License-Identifier: MPL-2.0
import { cn } from '@ggraphic/editor/utils/cn';
import { useRef, type KeyboardEvent } from 'react';

const SKIN_TONES = [
  { label: 'Standard', color: '#fcc21b' },
  { label: 'Heller Hautton', color: '#f7dece' },
  { label: 'Mittelheller Hautton', color: '#f3d2a2' },
  { label: 'Mittlerer Hautton', color: '#d5ab88' },
  { label: 'Mitteldunkler Hautton', color: '#af7e57' },
  { label: 'Dunkler Hautton', color: '#7c533e' },
];

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Skin tone of the emoji tiles: 0 default, 1–5 light → dark. A radio group:
 * one tab stop, the arrow keys move and select, wrapping at both ends.
 */
export function EmojiTonePicker({
  tone,
  onChange,
}: {
  tone: number;
  onChange: (tone: number) => void;
}) {
  const groupRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = STEP[e.key];
    if (!step) return;
    e.preventDefault();
    const next = (tone + step + SKIN_TONES.length) % SKIN_TONES.length;
    onChange(next);
    groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Hautton"
      className="flex items-center gap-1.5 pb-3"
    >
      {SKIN_TONES.map((t, i) => (
        <button
          key={t.label}
          type="button"
          role="radio"
          aria-checked={tone === i}
          aria-label={t.label}
          title={t.label}
          tabIndex={tone === i ? 0 : -1}
          onClick={() => onChange(i)}
          onKeyDown={onKeyDown}
          className={cn(
            'size-6 rounded-full border-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]',
            tone === i ? 'border-[var(--editor-accent)]' : 'border-transparent'
          )}
          style={{ backgroundColor: t.color }}
        />
      ))}
    </div>
  );
}
