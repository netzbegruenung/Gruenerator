import { acceptForMediaType } from '@gruenerator/shared/media-library';
import { Button } from '@gruenerator/ui';
import { useRef, type JSX } from 'react';
import { HiFilter, HiOutlineFilter, HiPlus } from 'react-icons/hi';
import { LuArrowDownUp } from 'react-icons/lu';

import {
  FilterMenuButton,
  GridSizeToggle,
  type GridSize,
} from '../../../components/common/Gallery/parts';
import { PageHeroSearch } from '../../../components/common/PageHero';

import type { MediaLibraryFilters, MediaTypeFilter } from '../hooks/useMediaLibraryFilters';
import type { SortOrder } from '@gruenerator/shared/media-library';

export const TYPE_OPTIONS: { id: MediaTypeFilter; label: string }[] = [
  { id: 'all', label: 'Alle Medien' },
  { id: 'sharepic', label: 'Sharepics' },
  { id: 'ki', label: 'KI-Bilder' },
  { id: 'reel', label: 'Reels' },
  { id: 'upload', label: 'Uploads' },
  { id: 'image', label: 'Bilder' },
  { id: 'video', label: 'Videos' },
  { id: 'audio', label: 'Audio' },
];

const SORT_OPTIONS: { id: SortOrder; label: string }[] = [
  { id: 'newest', label: 'Neueste zuerst' },
  { id: 'oldest', label: 'Älteste zuerst' },
];

export function typeLabel(type: MediaTypeFilter): string {
  return TYPE_OPTIONS.find((option) => option.id === type)?.label ?? type;
}

/** Search, upload, type filter, sort and tile size — the Mediathek hero's icon row. */
export function MediaToolbar({
  filters,
  gridSize,
  onToggleGridSize,
  onFiles,
}: {
  filters: MediaLibraryFilters;
  gridSize: GridSize;
  onToggleGridSize: () => void;
  onFiles: (files: FileList) => void;
}): JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null);
  const typeActive = filters.type !== 'all';

  return (
    <>
      <PageHeroSearch
        query={filters.searchInput}
        onQuery={filters.setSearchInput}
        placeholder="Mediathek durchsuchen…"
      />
      <Button
        variant="ghost"
        size="icon"
        aria-label="Dateien hochladen"
        title="Dateien hochladen"
        onClick={() => fileRef.current?.click()}
      >
        <HiPlus aria-hidden className="size-[18px]" />
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept={acceptForMediaType('all')}
        multiple
        hidden
        aria-label="Dateien auswählen"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <FilterMenuButton
        label={typeActive ? `Filter: ${typeLabel(filters.type)}` : 'Filter'}
        menuLabel="Anzeigen"
        value={filters.type}
        options={TYPE_OPTIONS}
        onChange={(value) => filters.setType(value as MediaTypeFilter)}
        active={typeActive}
        icon={
          typeActive ? (
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
    </>
  );
}
