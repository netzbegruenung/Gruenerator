import { SITE_IMAGE_FOCUS_STEPS, type SiteImageFocus } from '@gruenerator/contracts';
import { cn } from '@gruenerator/shared/utils';
import { useRef } from 'react';

const COLUMNS = ['links', 'halblinks', 'Mitte', 'halbrechts', 'rechts'] as const;
const ROWS = ['oben', 'halboben', 'Mitte', 'halbunten', 'unten'] as const;
const CENTRE: SiteImageFocus = { x: 50, y: 50 };
const LAST = SITE_IMAGE_FOCUS_STEPS.length - 1;

function cellLabel(column: number, row: number): string {
  if (column === 2 && row === 2) return 'Mitte';
  return `${COLUMNS[column]} ${ROWS[row]}`;
}

function stepOf(focus: SiteImageFocus): { column: number; row: number } {
  return {
    column: SITE_IMAGE_FOCUS_STEPS.indexOf(focus.x),
    row: SITE_IMAGE_FOCUS_STEPS.indexOf(focus.y),
  };
}

const MOVES: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

interface FocalPointPickerProps {
  src: string;
  value: SiteImageFocus | null | undefined;
  onChange: (focus: SiteImageFocus) => void;
  disabled?: boolean;
}

export function FocalPointPicker({
  src,
  value,
  onChange,
  disabled = false,
}: FocalPointPickerProps) {
  const focus = value ?? CENTRE;
  const { column: activeColumn, row: activeRow } = stepOf(focus);
  const cells = useRef<Array<HTMLButtonElement | null>>([]);

  const select = (column: number, row: number, moveFocus: boolean) => {
    const x = SITE_IMAGE_FOCUS_STEPS[column];
    const y = SITE_IMAGE_FOCUS_STEPS[row];
    if (x === undefined || y === undefined) return;
    onChange({ x, y });
    if (moveFocus) cells.current[row * COLUMNS.length + column]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const move = MOVES[event.key];
    if (!move || disabled) return;
    event.preventDefault();
    const column = Math.min(LAST, Math.max(0, activeColumn + move[0]));
    const row = Math.min(LAST, Math.max(0, activeRow + move[1]));
    select(column, row, true);
  };

  return (
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus -- keydown bubbles from the focused radio (roving tabindex); the group itself is not a tab stop
    <div
      role="radiogroup"
      aria-label="Bildausschnitt"
      aria-disabled={disabled || undefined}
      onKeyDown={handleKeyDown}
      className="relative mx-auto mt-1.5 grid aspect-square w-[120px] shrink-0 grid-cols-5 grid-rows-5 overflow-hidden rounded-lg border border-grey-300 bg-grey-100 dark:border-grey-700 dark:bg-grey-900"
    >
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full object-cover"
        style={{ objectPosition: `${focus.x}% ${focus.y}%` }}
      />
      {ROWS.map((_, row) =>
        COLUMNS.map((_, column) => {
          const checked = column === activeColumn && row === activeRow;
          return (
            <button
              key={`${column}-${row}`}
              ref={(el) => {
                cells.current[row * COLUMNS.length + column] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={cellLabel(column, row)}
              tabIndex={checked ? 0 : -1}
              disabled={disabled}
              onClick={() => select(column, row, false)}
              className="group relative flex min-h-6 min-w-6 items-center justify-center outline-none"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'size-3 rounded-full border-2 border-white bg-black/40 shadow transition-opacity group-focus-visible:ring-2 group-focus-visible:ring-primary-600 group-focus-visible:ring-offset-1',
                  checked ? 'bg-primary-600 opacity-100' : 'opacity-50 group-hover:opacity-100'
                )}
              />
            </button>
          );
        })
      )}
    </div>
  );
}
