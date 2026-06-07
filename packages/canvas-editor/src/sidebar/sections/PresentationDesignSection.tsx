/**
 * Presentation Design Section
 *
 * Sidebar section for presentation-specific controls:
 * - Color mode toggle (light/dark green)
 * - Footer: date, custom text, slide number toggle
 */

import { memo } from 'react';

import { PRES_COLORS, type PresentationColorMode } from '../../utils/presentationTokens';

// ============================================================================
// PROPS
// ============================================================================

export interface PresentationDesignSectionProps {
  colorMode: PresentationColorMode;
  onColorModeChange: (mode: PresentationColorMode) => void;
  footerDate: string;
  onFooterDateChange: (val: string) => void;
  footerCustomText: string;
  onFooterCustomTextChange: (val: string) => void;
  showSlideNumber: boolean;
  onShowSlideNumberChange: (val: boolean) => void;
}

// ============================================================================
// COLOR MODE OPTIONS
// ============================================================================

const COLOR_MODES: { id: PresentationColorMode; label: string; color: string }[] = [
  { id: 'light', label: 'Grün', color: PRES_COLORS.accent1 },
  { id: 'dark', label: 'Dunkelgrün', color: PRES_COLORS.dk2 },
];

// ============================================================================
// COMPONENT
// ============================================================================

export const PresentationDesignSection = memo(function PresentationDesignSection({
  colorMode,
  onColorModeChange,
  footerDate,
  onFooterDateChange,
  footerCustomText,
  onFooterCustomTextChange,
  showSlideNumber,
  onShowSlideNumberChange,
}: PresentationDesignSectionProps) {
  return (
    <div className="flex flex-col gap-lg p-md">
      {/* Color Mode */}
      <div>
        <label className="mb-xs block text-sm font-medium text-foreground">Farbschema</label>
        <div className="flex gap-sm">
          {COLOR_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => onColorModeChange(mode.id)}
              className={`flex items-center gap-xs rounded-md px-md py-sm text-sm transition-all ${
                colorMode === mode.id
                  ? 'ring-2 ring-primary-500 ring-offset-2 ring-offset-background'
                  : 'opacity-60 hover:opacity-100'
              }`}
            >
              <span
                className="inline-block h-6 w-6 rounded-full border border-grey-300 dark:border-grey-600"
                style={{ backgroundColor: mode.color }}
              />
              <span className="text-foreground">{mode.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Footer Controls */}
      <div>
        <label className="mb-xs block text-sm font-medium text-foreground">Fußzeile</label>
        <div className="flex flex-col gap-sm">
          <input
            type="text"
            value={footerDate}
            onChange={(e) => onFooterDateChange(e.target.value)}
            placeholder="Datum, z.B. 06.04.2026"
            className="w-full rounded-md border border-grey-200 bg-background px-sm py-xs text-sm text-foreground placeholder:text-grey-400 dark:border-grey-700"
          />
          <input
            type="text"
            value={footerCustomText}
            onChange={(e) => onFooterCustomTextChange(e.target.value)}
            placeholder="Fußzeilentext"
            className="w-full rounded-md border border-grey-200 bg-background px-sm py-xs text-sm text-foreground placeholder:text-grey-400 dark:border-grey-700"
          />
          <label className="flex items-center gap-xs text-sm text-foreground">
            <input
              type="checkbox"
              checked={showSlideNumber}
              onChange={(e) => onShowSlideNumberChange(e.target.checked)}
              className="rounded border-grey-300 text-primary-500 focus:ring-primary-500 dark:border-grey-600"
            />
            Foliennummer anzeigen
          </label>
        </div>
      </div>
    </div>
  );
});
