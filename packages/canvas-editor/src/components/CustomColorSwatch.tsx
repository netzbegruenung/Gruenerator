/**
 * „Eigene Farbe" — der letzte Swatch jeder Farbpalette im Editor. Die
 * Markenfarben davor bleiben die Vorgabe; dieser Swatch öffnet den nativen
 * Farbwähler des Browsers für jede andere Farbe.
 *
 * Ist die aktuelle Farbe keine der Vorgaben, zeigt der Swatch sie gefüllt und
 * als gewählt; sonst einen Farbkreis.
 *
 * Übernommen wird beim nativen `change` (der Wähler schließt), nicht bei
 * jedem `input`: sonst schriebe jedes Ziehen im Wähler einen eigenen
 * Rückgängig-Schritt. Wer live vorschauen will, gibt `onPreview` mit.
 */
import { useEffect, useRef, type CSSProperties, type InputHTMLAttributes } from 'react';

import { cn } from '../utils/cn';

const HEX6 = /^#[0-9a-f]{6}$/i;
const COLOR_WHEEL =
  'conic-gradient(from 180deg, #ff4d4d, #ffd84d, #6ccd87, #0ba1dd, #8a4dff, #ff4dc4, #ff4d4d)';

interface CustomColorSwatchProps {
  /** Die aktuelle Farbe des Elements. */
  value: string | null | undefined;
  /** Die Farben der Palette; ist `value` keine davon, gilt sie als eigene Farbe. */
  presets: readonly string[];
  onPick: (color: string) => void;
  /** Live-Vorschau beim Ziehen im Wähler, ohne Rückgängig-Schritt. */
  onPreview?: (color: string) => void;
  /** Größe und Rand — die Swatches der Paletten sind verschieden groß. */
  className?: string;
  /** Abstand des Auswahlrings, wie bei den Nachbarn. */
  outlineOffset?: number;
  disabled?: boolean;
  inputProps?: InputHTMLAttributes<HTMLInputElement> & Record<`data-${string}`, string>;
}

export function CustomColorSwatch({
  value,
  presets,
  onPick,
  onPreview,
  className,
  outlineOffset = 2,
  disabled = false,
  inputProps,
}: CustomColorSwatchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hex = value && HEX6.test(value) ? value.toUpperCase() : null;
  const pickRef = useRef(onPick);
  useEffect(() => {
    pickRef.current = onPick;
  }, [onPick]);

  // React's onChange is the `input` event; the commit belongs on the native `change`.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const onChange = () => pickRef.current(input.value.toUpperCase());
    input.addEventListener('change', onChange);
    return () => input.removeEventListener('change', onChange);
  }, []);

  // Uncontrolled: a controlled value would snap the open picker back on every drag.
  useEffect(() => {
    if (inputRef.current && hex) inputRef.current.value = hex.toLowerCase();
  }, [hex]);

  const isCustom = hex !== null && !presets.some((preset) => preset.toUpperCase() === hex);
  const style: CSSProperties = {
    background: isCustom ? hex : COLOR_WHEEL,
    outline: isCustom ? '2px solid var(--editor-accent, #005538)' : 'none',
    outlineOffset: `${outlineOffset}px`,
  };

  return (
    <label
      title="Eigene Farbe"
      style={style}
      className={cn(
        'relative inline-block shrink-0 cursor-pointer rounded-full border border-black/10 transition-transform hover:scale-110',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
    >
      <input
        ref={inputRef}
        type="color"
        aria-label="Eigene Farbe"
        disabled={disabled}
        defaultValue={(hex ?? '#005538').toLowerCase()}
        onChange={(e) => onPreview?.(e.target.value.toUpperCase())}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
        {...inputProps}
      />
    </label>
  );
}
