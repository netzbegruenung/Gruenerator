// SPDX-License-Identifier: MPL-2.0
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { cn } from '@ggraphic/editor/utils/cn';
import { useRef, type KeyboardEvent } from 'react';

const SKIN_TONE_COLORS = ['#fcc21b', '#f7dece', '#f3d2a2', '#d5ab88', '#af7e57', '#7c533e'];

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
  const t = useMessages();
  const labels = t.sidebar.elements.skinTones;
  const groupRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = STEP[e.key];
    if (!step) return;
    e.preventDefault();
    const next = (tone + step + SKIN_TONE_COLORS.length) % SKIN_TONE_COLORS.length;
    onChange(next);
    groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={t.sidebar.elements.skinTone}
      className="flex items-center gap-1.5 pb-3"
    >
      {SKIN_TONE_COLORS.map((color, i) => (
        <button
          key={labels[i]}
          type="button"
          role="radio"
          aria-checked={tone === i}
          aria-label={labels[i]}
          title={labels[i]}
          tabIndex={tone === i ? 0 : -1}
          onClick={() => onChange(i)}
          onKeyDown={onKeyDown}
          className={cn(
            'size-6 rounded-full border-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]',
            tone === i ? 'border-[var(--editor-accent)]' : 'border-transparent'
          )}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}
