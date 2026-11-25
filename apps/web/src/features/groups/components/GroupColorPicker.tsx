import { type GroupColor } from '@gruenerator/contracts';
import {
  GROUP_COLOR_KEYS,
  GROUP_COLOR_STYLES,
  resolveGroupColor,
} from '@gruenerator/shared/groups';
import { HiCheck } from 'react-icons/hi';

interface GroupColorPickerProps {
  value: string | null | undefined;
  onChange: (color: GroupColor | null) => void;
  disabled?: boolean;
}

/**
 * Tile colour of a project: a fixed palette plus "Standard" (no colour). The
 * selection is shown by a check mark and a ring, not by colour alone; the
 * swatches carry their name as accessible label.
 */
export function GroupColorPicker({ value, onChange, disabled = false }: GroupColorPickerProps) {
  const current = resolveGroupColor(value);
  const swatch =
    'relative flex size-7 items-center justify-center rounded-full border border-grey-300 dark:border-grey-600 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:opacity-50';
  return (
    <div
      role="radiogroup"
      aria-label="Farbe des Projekts"
      className="flex flex-wrap items-center gap-xs"
    >
      <button
        type="button"
        role="radio"
        aria-checked={current === null}
        aria-label="Standard"
        title="Standard"
        disabled={disabled}
        onClick={() => onChange(null)}
        className={`${swatch} bg-[#D6EBE8] dark:bg-[#112423] ${current === null ? 'ring-2 ring-primary-600 ring-offset-1' : ''}`}
      >
        {current === null && (
          <HiCheck aria-hidden className="size-4 text-[#12504A] dark:text-[#9AD6CF]" />
        )}
      </button>
      {GROUP_COLOR_KEYS.map((key) => {
        const { label, light, dark } = GROUP_COLOR_STYLES[key];
        const selected = current === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={() => onChange(key)}
            style={
              {
                '--swatch-bg': light.bg,
                '--swatch-bg-dark': dark.bg,
                '--swatch-fg': light.title,
                '--swatch-fg-dark': dark.title,
              } as React.CSSProperties
            }
            className={`${swatch} bg-(--swatch-bg) dark:bg-(--swatch-bg-dark) ${selected ? 'ring-2 ring-primary-600 ring-offset-1' : ''}`}
          >
            {selected && (
              <HiCheck
                aria-hidden
                className="size-4 text-(--swatch-fg) dark:text-(--swatch-fg-dark)"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
