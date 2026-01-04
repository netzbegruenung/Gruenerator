/**
 * CreditInput - Image studio credit/attribution input
 * Uses Zustand selector for performance, delegates to generic LabeledTextInput
 */

import { useCallback } from 'react';
import { LabeledTextInput } from '../ui/controls';
import { useImageStudioStore } from '../../stores/imageStudioStore';
import { MODIFICATION_LABELS } from '@gruenerator/shared/image-studio';

interface CreditInputProps {
  disabled?: boolean;
}

export function CreditInput({ disabled = false }: CreditInputProps) {
  // Zustand selectors - only re-render when these specific values change
  const credit = useImageStudioStore(
    (s) => (s.modifications as { credit?: string } | null)?.credit ?? ''
  );
  const updateModification = useImageStudioStore((s) => s.updateModification);

  const handleChange = useCallback(
    (value: string) => {
      updateModification('credit', value);
    },
    [updateModification]
  );

  return (
    <LabeledTextInput
      value={credit}
      onChange={handleChange}
      label={MODIFICATION_LABELS.CREDIT}
      placeholder={MODIFICATION_LABELS.CREDIT_PLACEHOLDER}
      keyboardType="url"
      maxLength={50}
      disabled={disabled}
    />
  );
}
