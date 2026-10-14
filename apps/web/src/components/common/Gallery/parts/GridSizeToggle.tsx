import { Button } from '@gruenerator/ui';
import { useCallback, useState, type JSX } from 'react';
import { LuGrid2X2, LuGrid3X3 } from 'react-icons/lu';

import type { GridSize } from './GalleryGrid';

function readGridSize(storageKey: string, fallback: GridSize): GridSize {
  try {
    const stored = localStorage.getItem(storageKey);
    return stored === 'large' || stored === 'small' ? stored : fallback;
  } catch {
    return fallback;
  }
}

/** Small/large tiles, remembered per gallery in localStorage. */
export function useGridSize(
  storageKey: string,
  fallback: GridSize = 'small'
): [GridSize, () => void] {
  const [gridSize, setGridSize] = useState<GridSize>(() => readGridSize(storageKey, fallback));
  const toggle = useCallback(() => {
    setGridSize((prev) => {
      const next = prev === 'large' ? 'small' : 'large';
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        // Not remembered, still switched.
      }
      return next;
    });
  }, [storageKey]);
  return [gridSize, toggle];
}

export function GridSizeToggle({
  gridSize,
  onToggle,
}: {
  gridSize: GridSize;
  onToggle: () => void;
}): JSX.Element {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Große Kacheln"
      aria-pressed={gridSize === 'large'}
      title="Große Kacheln"
      onClick={onToggle}
    >
      {gridSize === 'large' ? (
        <LuGrid2X2 aria-hidden className="size-[18px]" />
      ) : (
        <LuGrid3X3 aria-hidden className="size-[18px]" />
      )}
    </Button>
  );
}
