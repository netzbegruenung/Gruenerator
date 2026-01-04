/**
 * CrossControl components - Image studio 2D offset controls
 * Uses Zustand selectors for performance, delegates to generic CrossPad
 */

import { useCallback } from 'react';
import { CrossPad, type Offset2D } from '../ui/controls';
import { useImageStudioStore } from '../../stores/imageStudioStore';
import {
  BALKEN_GRUPPE_STEP,
  SUNFLOWER_STEP,
  MODIFICATION_LABELS,
} from '@gruenerator/shared/image-studio';

interface BalkenGruppeControlProps {
  disabled?: boolean;
}

export function BalkenGruppeControl({ disabled = false }: BalkenGruppeControlProps) {
  // Zustand selectors - only re-render when these specific values change
  const offset = useImageStudioStore(
    (s) => (s.modifications as { balkenGruppenOffset?: Offset2D } | null)?.balkenGruppenOffset ?? ([0, 0] as Offset2D)
  );
  const updateModification = useImageStudioStore((s) => s.updateModification);

  const handleChange = useCallback(
    (newOffset: Offset2D) => {
      updateModification('balkenGruppenOffset', newOffset);
    },
    [updateModification]
  );

  return (
    <CrossPad
      offset={offset}
      onChange={handleChange}
      step={BALKEN_GRUPPE_STEP}
      label={MODIFICATION_LABELS.BALKEN_GRUPPE}
      description={MODIFICATION_LABELS.BALKEN_GRUPPE_DESC}
      disabled={disabled}
    />
  );
}

interface SonnenblumenControlProps {
  disabled?: boolean;
}

export function SonnenblumenControl({ disabled = false }: SonnenblumenControlProps) {
  // Zustand selectors - only re-render when these specific values change
  const offset = useImageStudioStore(
    (s) => (s.modifications as { sunflowerOffset?: Offset2D } | null)?.sunflowerOffset ?? ([0, 0] as Offset2D)
  );
  const updateModification = useImageStudioStore((s) => s.updateModification);

  const handleChange = useCallback(
    (newOffset: Offset2D) => {
      updateModification('sunflowerOffset', newOffset);
    },
    [updateModification]
  );

  return (
    <CrossPad
      offset={offset}
      onChange={handleChange}
      step={SUNFLOWER_STEP}
      label={MODIFICATION_LABELS.SUNFLOWER}
      description={MODIFICATION_LABELS.SUNFLOWER_DESC}
      disabled={disabled}
    />
  );
}

// Re-export CrossPad as CrossControl for backwards compatibility if needed
export { CrossPad as CrossControl } from '../ui/controls';
