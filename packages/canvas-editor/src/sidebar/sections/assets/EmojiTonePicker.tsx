import { cn } from '../../../utils/cn';

const SKIN_TONES = [
  { label: 'Standard', color: '#fcc21b' },
  { label: 'Heller Hautton', color: '#f7dece' },
  { label: 'Mittelheller Hautton', color: '#f3d2a2' },
  { label: 'Mittlerer Hautton', color: '#d5ab88' },
  { label: 'Mitteldunkler Hautton', color: '#af7e57' },
  { label: 'Dunkler Hautton', color: '#7c533e' },
];

/** Skin tone of the emoji tiles: 0 default, 1–5 light → dark. */
export function EmojiTonePicker({
  tone,
  onChange,
}: {
  tone: number;
  onChange: (tone: number) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Hautton" className="flex items-center gap-1.5 pb-3">
      {SKIN_TONES.map((t, i) => (
        <button
          key={t.label}
          type="button"
          role="radio"
          aria-checked={tone === i}
          aria-label={t.label}
          title={t.label}
          onClick={() => onChange(i)}
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
