/**
 * PositionControl Component
 * Zustand-connected height preference selector for subtitle editor
 * Uses per-property selectors for performance optimization
 */

import { useMemo } from 'react';
import { OptionGrid, type OptionItem } from '../../common/editor-toolbar';
import { HeightPreview } from '../HeightPreview';
import { useSubtitleEditorStore } from '../../../stores/subtitleEditorStore';
import { SUBTITLE_HEIGHT_OPTIONS } from '@gruenerator/shared/subtitle-editor';
import type { SubtitleHeightPreference } from '@gruenerator/shared/subtitle-editor';

interface PositionControlProps {
  disabled?: boolean;
}

export function PositionControl({ disabled = false }: PositionControlProps) {
  const heightPreference = useSubtitleEditorStore((s) => s.heightPreference);
  const setHeightPreference = useSubtitleEditorStore((s) => s.setHeightPreference);

  const options: OptionItem<SubtitleHeightPreference>[] = useMemo(
    () =>
      SUBTITLE_HEIGHT_OPTIONS.map((opt) => ({
        id: opt.value,
        label: opt.label,
        renderPreview: () => <HeightPreview position={opt.value} />,
      })),
    []
  );

  return (
    <OptionGrid
      options={options}
      value={heightPreference}
      onChange={setHeightPreference}
      columns={2}
      disabled={disabled}
    />
  );
}
