import { SUPPORTED_AUDIO_TYPES, acceptForMediaType } from '@gruenerator/shared/media-library';
import { Button } from '@gruenerator/ui';
import { useRef, type JSX } from 'react';
import { HiPlus } from 'react-icons/hi';
import { LuArrowDownUp } from 'react-icons/lu';

import {
  FilterMenuButton,
  GridSizeToggle,
  type GridSize,
} from '../../../components/common/Gallery/parts';
import { PageHeroSearch } from '../../../components/common/PageHero';

import type { MediaLibraryFilters, MediaTypeFilter } from '../hooks/useMediaLibraryFilters';
import type { SortOrder } from '@gruenerator/shared/media-library';

/** The tabs above „Deine Inhalte" (Studio design). Videos include the Reels. */
export const STUDIO_TABS: { id: MediaTypeFilter; label: string }[] = [
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

/** Search, upload, sort and tile size — the Studio hero's icon row (the type is a tab row). */
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

  return (
    <>
      <PageHeroSearch
        query={filters.searchInput}
        onQuery={filters.setSearchInput}
        placeholder="Studio durchsuchen…"
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
        accept={[acceptForMediaType('all'), ...SUPPORTED_AUDIO_TYPES].join(',')}
        multiple
        hidden
        aria-label="Dateien auswählen"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = '';
        }}
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
