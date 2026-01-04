/**
 * ColorSchemeSelector - Image studio color scheme control
 * Uses Zustand selector for performance, delegates to generic ColorOptionGrid
 */

import { useCallback, useMemo } from 'react';
import { ColorOptionGrid } from '../ui/controls';
import { useImageStudioStore } from '../../stores/imageStudioStore';
import {
  COLOR_SCHEME_PRESETS,
  MODIFICATION_LABELS,
  areColorSchemesEqual,
  type DreizeilenColorScheme,
} from '@gruenerator/shared/image-studio';

interface ColorSchemeSelectorProps {
  disabled?: boolean;
}

export function ColorSchemeSelector({ disabled = false }: ColorSchemeSelectorProps) {
  // Zustand selectors - only re-render when these specific values change
  const colorScheme = useImageStudioStore(
    (s) => (s.modifications as { colorScheme?: DreizeilenColorScheme } | null)?.colorScheme
  );
  const updateModification = useImageStudioStore((s) => s.updateModification);

  // Find active preset ID based on current color scheme
  const activePresetId = useMemo(() => {
    if (!colorScheme) return null;
    const match = COLOR_SCHEME_PRESETS.find((preset) =>
      areColorSchemesEqual(preset.colors, colorScheme)
    );
    return match?.id || null;
  }, [colorScheme]);

  const handleChange = useCallback(
    (presetId: string) => {
      const preset = COLOR_SCHEME_PRESETS.find((p) => p.id === presetId);
      if (preset) {
        updateModification('colorScheme', [...preset.colors] as DreizeilenColorScheme);
      }
    },
    [updateModification]
  );

  return (
    <ColorOptionGrid
      options={COLOR_SCHEME_PRESETS}
      value={activePresetId}
      onChange={handleChange}
      label={MODIFICATION_LABELS.COLOR_SCHEME}
      disabled={disabled}
    />
  );
}
