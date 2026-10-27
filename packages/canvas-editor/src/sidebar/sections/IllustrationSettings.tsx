import { cn } from '@ggraphic/editor/utils/cn';
import { FaTrash, FaCopy } from 'react-icons/fa';

import { CustomColorSwatch } from '../../components/CustomColorSwatch';
import { ILLUSTRATION_COLORS } from '../../utils/illustrations/types';
import { SidebarSlider } from '../components/SidebarSlider';
import { ACTION_BTN, ACTION_BTN_DANGER, SECTION_HEADER, SECTION_TITLE } from '../sidebarStyles';

import type {
  IllustrationInstance,
  KawaiiMood,
  KawaiiInstance,
} from '../../utils/illustrations/types';

const MOOD_OPTIONS: { id: KawaiiMood; label: string }[] = [
  { id: 'happy', label: '😊' },
  { id: 'blissful', label: '😌' },
  { id: 'lovestruck', label: '😍' },
  { id: 'shocked', label: '😲' },
  { id: 'sad', label: '😢' },
];

export interface IllustrationSettingsProps {
  selectedIllustration: IllustrationInstance;
  onUpdateIllustration: (id: string, partial: Partial<IllustrationInstance>) => void;
  onRemoveIllustration: (id: string) => void;
  onDuplicateIllustration?: (id: string) => void;
}

/** Mood, colour and opacity of the illustration selected on the canvas. */
export function IllustrationSettings({
  selectedIllustration,
  onUpdateIllustration,
  onRemoveIllustration,
  onDuplicateIllustration,
}: IllustrationSettingsProps) {
  const isKawaiiSelected = selectedIllustration.source === 'kawaii';
  const kawaiiInstance = isKawaiiSelected ? (selectedIllustration as KawaiiInstance) : null;

  return (
    <div className="flex flex-col gap-[var(--spacing-small)] p-[var(--spacing-small)] bg-background-alt rounded-[var(--border-radius-md)] mt-auto">
      <div className={SECTION_HEADER}>
        <span className={SECTION_TITLE}>
          {isKawaiiSelected ? 'Charakter bearbeiten' : 'Illustration bearbeiten'}
        </span>
        {onDuplicateIllustration && (
          <button
            className={ACTION_BTN}
            onClick={() => onDuplicateIllustration(selectedIllustration.id)}
            title="Duplizieren"
          >
            <FaCopy size={12} />
          </button>
        )}
        <button
          className={ACTION_BTN_DANGER}
          onClick={() => onRemoveIllustration(selectedIllustration.id)}
          title="Entfernen"
        >
          <FaTrash size={12} />
        </button>
      </div>

      {/* Mood selector (only Kawaii) */}
      {kawaiiInstance && (
        <div className="flex flex-col gap-xs">
          <span className="text-[length:var(--font-size-sm)] text-foreground-muted mb-xs">
            Stimmung
          </span>
          <div className="flex gap-xs flex-wrap">
            {MOOD_OPTIONS.map((mood) => (
              <button
                key={mood.id}
                className={cn(
                  'w-8 h-8 rounded-[var(--border-radius-md)] border border-[var(--border-default,rgba(0,0,0,0.1))] bg-background cursor-pointer text-lg flex items-center justify-center transition-all duration-150 p-0 hover:border-primary-600',
                  kawaiiInstance.mood === mood.id &&
                    'border-primary-600 bg-[var(--primary-50,#e8f5e9)]'
                )}
                onClick={() => onUpdateIllustration(kawaiiInstance.id, { mood: mood.id })}
                title={mood.id}
              >
                {mood.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Color grid (All) */}
      {selectedIllustration && (
        <div className="flex flex-col gap-xs">
          <span className="text-[length:var(--font-size-sm)] text-foreground-muted mb-xs">
            Farbe
          </span>
          <div className="flex gap-[var(--spacing-small)] flex-wrap">
            {ILLUSTRATION_COLORS.map((color) => (
              <button
                key={color.id}
                className={cn(
                  'w-7 h-7 rounded-full border border-black/10 cursor-pointer transition-transform duration-150 relative p-0 hover:border-[var(--border-default,rgba(0,0,0,0.2))]',
                  selectedIllustration.color === color.color &&
                    'after:content-[""] after:absolute after:-top-1 after:-left-1 after:-right-1 after:-bottom-1 after:border-2 after:border-primary-600 after:rounded-full'
                )}
                style={{ backgroundColor: color.color }}
                onClick={() =>
                  onUpdateIllustration(selectedIllustration.id, { color: color.color })
                }
                title={color.label}
              />
            ))}
            <CustomColorSwatch
              value={selectedIllustration.color}
              presets={ILLUSTRATION_COLORS.map((color) => color.color)}
              onPick={(color) => onUpdateIllustration(selectedIllustration.id, { color })}
              className="size-7"
              outlineOffset={3}
            />
          </div>
        </div>
      )}

      {/* Opacity slider (Both) */}
      <div className="flex flex-col gap-xs">
        <SidebarSlider
          value={selectedIllustration.opacity}
          onValueChange={(opacity) => onUpdateIllustration(selectedIllustration.id, { opacity })}
          min={0.1}
          max={1}
          step={0.05}
          label="Transparenz"
          unit="%"
        />
      </div>
    </div>
  );
}
