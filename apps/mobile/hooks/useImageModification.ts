/**
 * useImageModification Hook
 * Extracts modification logic from components for cleaner separation of concerns
 * Provides all modification handlers and state in one place
 */

import { useCallback } from 'react';
import { useImageStudioStore } from '../stores/imageStudioStore';
import type {
  FormFieldValue,
  DreizeilenColorScheme,
  BalkenOffset,
  Offset2D,
  DreizeilenModificationParams,
} from '@gruenerator/shared/image-studio';

export interface UseImageModificationReturn {
  // State
  type: string | null;
  formData: Record<string, FormFieldValue>;
  modifications: DreizeilenModificationParams | null;
  isAdvancedMode: boolean;

  // Field handlers
  handleFieldChange: (key: string, value: FormFieldValue) => void;

  // Modification handlers
  handleFontSizeChange: (size: number) => void;
  handleColorSchemeChange: (scheme: DreizeilenColorScheme) => void;
  handleBalkenOffsetChange: (offset: BalkenOffset) => void;
  handleBalkenGruppeChange: (offset: Offset2D) => void;
  handleSunflowerChange: (offset: Offset2D) => void;
  handleCreditChange: (credit: string) => void;

  // Actions
  toggleAdvancedMode: () => void;
}

export function useImageModification(): UseImageModificationReturn {
  const {
    type,
    formData,
    modifications,
    isAdvancedMode,
    updateField,
    updateModification,
    toggleAdvancedMode,
  } = useImageStudioStore();

  // Cast modifications to DreizeilenModificationParams for type-safe access
  const dreizeilenMods = modifications as DreizeilenModificationParams | null;

  const handleFieldChange = useCallback(
    (key: string, value: FormFieldValue) => {
      updateField(key, value);
    },
    [updateField]
  );

  const handleFontSizeChange = useCallback(
    (size: number) => {
      updateModification('fontSize', size);
    },
    [updateModification]
  );

  const handleColorSchemeChange = useCallback(
    (scheme: DreizeilenColorScheme) => {
      updateModification('colorScheme', scheme);
    },
    [updateModification]
  );

  const handleBalkenOffsetChange = useCallback(
    (offset: BalkenOffset) => {
      updateModification('balkenOffset', offset);
    },
    [updateModification]
  );

  const handleBalkenGruppeChange = useCallback(
    (offset: Offset2D) => {
      updateModification('balkenGruppenOffset', offset);
    },
    [updateModification]
  );

  const handleSunflowerChange = useCallback(
    (offset: Offset2D) => {
      updateModification('sunflowerOffset', offset);
    },
    [updateModification]
  );

  const handleCreditChange = useCallback(
    (credit: string) => {
      updateModification('credit', credit);
    },
    [updateModification]
  );

  return {
    type,
    formData,
    modifications: dreizeilenMods,
    isAdvancedMode,
    handleFieldChange,
    handleFontSizeChange,
    handleColorSchemeChange,
    handleBalkenOffsetChange,
    handleBalkenGruppeChange,
    handleSunflowerChange,
    handleCreditChange,
    toggleAdvancedMode,
  };
}
