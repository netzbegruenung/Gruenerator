import { type JSX } from 'react';
import { HiFilter, HiOutlineFilter } from 'react-icons/hi';
import { LuArrowDownUp } from 'react-icons/lu';

import {
  FilterMenuButton,
  GridSizeToggle,
  type GridSize,
} from '../../../components/common/Gallery/parts';

import type { MediaLibraryFilters, MediaTypeFilter } from '../hooks/useMediaLibraryFilters';
import type { SortOrder } from '@gruenerator/shared/media-library';

/** The type filter of „Deine Inhalte". Videos include the Reels. */
export const STUDIO_FILTERS: { id: MediaTypeFilter; label: string }[] = [
  { id: 'all', label: 'Alle' },
  { id: 'video', label: 'Videos' },
  { id: 'sharepic', label: 'Sharepics' },
  { id: 'ki', label: 'KI-Bilder' },
  { id: 'upload', label: 'Uploads' },
  { id: 'audio', label: 'Audio' },
];

const SORT_OPTIONS: { id: SortOrder; label: string }[] = [
  { id: 'newest', label: 'Neueste zuerst' },
  { id: 'oldest', label: 'Älteste zuerst' },
];

/** Label of a `?typ=` value; older links (reel, image) have no menu entry. */
function studioFilterLabel(type: MediaTypeFilter): string {
  return STUDIO_FILTERS.find((f) => f.id === type)?.label ?? type;
}

/** Filter, sort and tile size — the icon row beside „Deine Inhalte" (as on /vorlagen). */
export function MediaToolbar({
  filters,
  gridSize,
  onToggleGridSize,
}: {
  filters: MediaLibraryFilters;
  gridSize: GridSize;
  onToggleGridSize: () => void;
}): JSX.Element {
  const typeFiltered = filters.type !== 'all';
  return (
    <div className="flex items-center gap-1">
      <FilterMenuButton
        label={typeFiltered ? `Filter: ${studioFilterLabel(filters.type)}` : 'Filter'}
        menuLabel="Anzeigen"
        value={filters.type}
        options={STUDIO_FILTERS}
        onChange={(value) => filters.setType(value as MediaTypeFilter)}
        active={typeFiltered}
        icon={
          typeFiltered ? (
            <HiFilter aria-hidden className="size-[18px]" />
          ) : (
            <HiOutlineFilter aria-hidden className="size-[18px]" />
          )
        }
      />
      <FilterMenuButton
        label={filters.sort === 'oldest' ? 'Sortierung: Älteste zuerst' : 'Sortierung'}
        menuLabel="Sortieren"
        value={filters.sort}
        options={SORT_OPTIONS}
        onChange={(value) => filters.setSort(value as SortOrder)}
        active={filters.sort !== 'newest'}
        icon={<LuArrowDownUp aria-hidden className="size-[18px]" />}
      />
      <GridSizeToggle gridSize={gridSize} onToggle={onToggleGridSize} />
    </div>
  );
}
