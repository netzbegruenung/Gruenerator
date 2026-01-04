/**
 * FontSizeControl - Image studio font size control
 * Uses Zustand selector for performance, delegates to generic SliderWithPresets
 */

import { useCallback } from 'react';
import { SliderWithPresets } from '../ui/controls';
import { useImageStudioStore } from '../../stores/imageStudioStore';
import {
  FONT_SIZE_OPTIONS,
  ZITAT_FONT_SIZE_OPTIONS,
  MODIFICATION_CONTROLS_CONFIG,
  MODIFICATION_LABELS,
} from '@gruenerator/shared/image-studio';

interface FontSizeControlProps {
  disabled?: boolean;
}

export function FontSizeControl({ disabled = false }: FontSizeControlProps) {
  // Zustand selectors - only re-render when these specific values change
  const type = useImageStudioStore((s) => s.type);
  const fontSize = useImageStudioStore(
    (s) => (s.modifications as { fontSize?: number } | null)?.fontSize ?? 48
  );
  const updateModification = useImageStudioStore((s) => s.updateModification);

  const isZitatType = type === 'zitat' || type === 'zitat-pure';
  const options = isZitatType ? ZITAT_FONT_SIZE_OPTIONS : FONT_SIZE_OPTIONS;
  const config = isZitatType
    ? MODIFICATION_CONTROLS_CONFIG.fontSize.zitat
    : MODIFICATION_CONTROLS_CONFIG.fontSize.standard;

  const handleChange = useCallback(
    (size: number) => {
      updateModification('fontSize', size);
    },
    [updateModification]
  );

  return (
    <SliderWithPresets
      value={fontSize}
      onChange={handleChange}
      presets={options}
      min={config.min}
      max={config.max}
      step={config.step}
      label={MODIFICATION_LABELS.FONT_SIZE}
      disabled={disabled}
    />
  );
}
