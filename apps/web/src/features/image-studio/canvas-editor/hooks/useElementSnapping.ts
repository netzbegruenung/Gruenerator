/**
 * useElementSnapping - Reusable hook for managing element-to-element snapping
 * Tracks element positions and provides snap targets for each element
 */

import { useState, useCallback } from 'react';
import type { SnapTarget, SnapLine } from '../utils/snapping';

export interface UseElementSnappingResult {
  positions: Record<string, SnapTarget>;
  snapLines: SnapLine[];
  setSnapLines: (lines: SnapLine[]) => void;
  handlePositionChange: (id: string, x: number, y: number, width: number, height: number) => void;
  getSnapTargets: (excludeId: string) => SnapTarget[];
}

export function useElementSnapping(): UseElementSnappingResult {
  const [positions, setPositions] = useState<Record<string, SnapTarget>>({});
  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);

  const handlePositionChange = useCallback(
    (id: string, x: number, y: number, width: number, height: number) => {
      setPositions((prev) => ({
        ...prev,
        [id]: { id, x, y, width, height },
      }));
    },
    []
  );

  const getSnapTargets = useCallback(
    (excludeId: string): SnapTarget[] => {
      return Object.values(positions).filter((p) => p.id !== excludeId);
    },
    [positions]
  );

  return {
    positions,
    snapLines,
    setSnapLines,
    handlePositionChange,
    getSnapTargets,
  };
}
