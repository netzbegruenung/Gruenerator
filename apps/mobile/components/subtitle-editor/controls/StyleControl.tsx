/**
 * StyleControl Component
 * Zustand-connected style preference selector for subtitle editor
 * Uses per-property selectors for performance optimization
 */

import { useMemo } from 'react';
import { OptionGrid, type OptionItem } from '../../common/editor-toolbar';
import { StylePreview } from '../StylePreview';
import { useSubtitleEditorStore } from '../../../stores/subtitleEditorStore';
import { SUBTITLE_STYLE_OPTIONS } from '@gruenerator/shared/subtitle-editor';
import type { SubtitleStylePreference } from '@gruenerator/shared/subtitle-editor';

interface StyleControlProps {
  disabled?: boolean;
}

export function StyleControl({ disabled = false }: StyleControlProps) {
  const stylePreference = useSubtitleEditorStore((s) => s.stylePreference);
  const setStylePreference = useSubtitleEditorStore((s) => s.setStylePreference);

  const options: OptionItem<SubtitleStylePreference>[] = useMemo(
    () =>
      SUBTITLE_STYLE_OPTIONS.map((opt) => ({
        id: opt.value,
        label: opt.label,
        recommended: opt.description === 'Empfohlen',
        renderPreview: () => <StylePreview style={opt.value} />,
      })),
    []
  );

  return (
    <OptionGrid
      options={options}
      value={stylePreference}
      onChange={setStylePreference}
      columns={4}
      compact
      disabled={disabled}
    />
  );
}
