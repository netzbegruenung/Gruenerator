import { Button } from '@gruenerator/ui';
import { useCallback, useState, type JSX } from 'react';
import { LuGrid2X2, LuGrid3X3 } from 'react-icons/lu';

import type { GridSize } from './GalleryGrid';

function readGridSize(storageKey: string): GridSize {
  try {
    return localStorage.getItem(storageKey) === 'large' ? 'large' : 'small';
  } catch {
    return 'small';
  }
}

/** Small/large tiles, remembered per gallery in localStorage. */
export function useGridSize(storageKey: string): [GridSize, () => void] {
  const [gridSize, setGridSize] = useState<GridSize>(() => readGridSize(storageKey));
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
