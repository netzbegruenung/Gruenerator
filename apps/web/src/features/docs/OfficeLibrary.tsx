import { officeFilterSchema } from '@gruenerator/contracts';
import { type useDocsAdapter } from '@gruenerator/docs';
import { isUnauthorizedError } from '@gruenerator/shared/api';
import { Button, Input } from '@gruenerator/ui';
import { HiOutlineFilter } from 'react-icons/hi';
import { LuArrowDownUp } from 'react-icons/lu';

import {
  FilterChip,
  FilterMenuButton,
  GalleryCountRow,
  GalleryEmptyState,
  GalleryGrid,
  GallerySkeleton,
} from '../../components/common/Gallery/parts';

import { BoardCard } from './BoardCard';
import { DocumentCard } from './DocumentCard';
import { type useOfficeLibrary } from './useOfficeLibrary';

const TYPES = [
  { id: 'all', label: 'Alle Inhalte' },
  { id: 'doc', label: 'Dokumente' },
  { id: 'sheet', label: 'Tabellen' },
  { id: 'pres', label: 'Präsentationen' },
  { id: 'board', label: 'Boards' },
];
const SORTS = [
  { id: 'newest', label: 'Neueste zuerst' },
  { id: 'oldest', label: 'Älteste zuerst' },
];
type DocProps = React.ComponentProps<typeof DocumentCard>;
type BoardProps = React.ComponentProps<typeof BoardCard>;

export function OfficeLibrary({
  office,
  adapter,
  onDeleteDoc,
  onRenameDoc,
  onShareDoc,
  onDeleteBoard,
  onRenameBoard,
  onShareBoard,
}: {
  office: ReturnType<typeof useOfficeLibrary>;
  adapter: ReturnType<typeof useDocsAdapter>;
  onDeleteDoc: DocProps['onDelete'];
  onRenameDoc: DocProps['onRename'];
  onShareDoc: DocProps['onShare'];
  onDeleteBoard: BoardProps['onDelete'];
  onRenameBoard: BoardProps['onRename'];
  onShareBoard: BoardProps['onShare'];
}) {
  const loading = office.isLoading || isUnauthorizedError(office.error);
  return (
    <section className="mt-xl flex flex-col gap-md">
      <div className="flex flex-wrap items-center gap-sm">
        <h2 className="mr-auto text-base font-extrabold text-foreground">Deine Inhalte</h2>
        <Input
          className="w-full sm:w-72"
          aria-label="Office durchsuchen"
          placeholder="Office durchsuchen …"
          type="search"
          maxLength={500}
          value={office.searchInput}
          onChange={(e) => office.setSearchInput(e.target.value)}
        />
        <FilterMenuButton
          label={
            office.typ === 'all'
              ? 'Filter'
              : `Filter: ${TYPES.find((t) => t.id === office.typ)?.label}`
          }
          menuLabel="Anzeigen"
          value={office.typ}
          options={TYPES}
          onChange={(value) => office.setType(officeFilterSchema.parse(value))}
          active={office.typ !== 'all'}
          icon={<HiOutlineFilter aria-hidden className="size-[18px]" />}
        />
        <FilterMenuButton
          label={office.sort === 'oldest' ? 'Sortierung: Älteste zuerst' : 'Sortierung'}
          menuLabel="Sortieren"
          value={office.sort}
          options={SORTS}
          onChange={office.setSort}
          active={office.sort === 'oldest'}
          icon={<LuArrowDownUp aria-hidden className="size-[18px]" />}
        />
      </div>
      {!loading && !office.error && (
        <GalleryCountRow
          count={`${office.total} ${office.total === 1 ? 'Inhalt' : 'Inhalte'}`}
          onReset={office.isFiltered ? office.reset : undefined}
        >
          {office.typ !== 'all' && (
            <FilterChip
              label={TYPES.find((t) => t.id === office.typ)?.label ?? office.typ}
              onRemove={() => office.setType('all')}
            />
          )}
          {office.sort === 'oldest' && (
            <FilterChip label="Älteste zuerst" onRemove={() => office.setSort('newest')} />
          )}
          {office.searchInput.trim() && (
            <FilterChip
              label={`„${office.searchInput.trim()}“`}
              onRemove={() => office.setSearchInput('')}
            />
          )}
        </GalleryCountRow>
      )}
      {office.error && !loading && (
        <div className="text-center text-error">
          <p>Office-Inhalte konnten nicht geladen werden.</p>
          <Button
            variant="outline"
            onClick={() =>
              void (office.isFetchNextPageError ? office.fetchNextPage() : office.refetch())
            }
          >
            Erneut versuchen
          </Button>
        </div>
      )}
      <GalleryGrid size="large">
        {loading ? (
          <GallerySkeleton className="h-[290px]" />
        ) : (
          office.items.map((item) =>
            item.document_subtype === 'boards' ? (
              <BoardCard
                key={item.id}
                board={item}
                onDelete={onDeleteBoard}
                onRename={onRenameBoard}
                onShare={onShareBoard}
              />
            ) : (
              <DocumentCard
                key={item.id}
                doc={item}
                adapter={adapter}
                onDelete={onDeleteDoc}
                onRename={onRenameDoc}
                onShare={onShareDoc}
              />
            )
          )
        )}
        {office.isFetchingNextPage && <GallerySkeleton count={4} className="h-[290px]" />}
      </GalleryGrid>
      {!loading && !office.error && office.items.length === 0 && (
        <GalleryEmptyState
          title="Keine Inhalte gefunden"
          hint={
            office.isFiltered
              ? 'Versuche einen anderen Suchbegriff oder Filter.'
              : 'Erstelle oben dein erstes Dokument, Board, deine erste Tabelle oder Präsentation.'
          }
          action={
            office.isFiltered ? (
              <Button variant="outline" onClick={office.reset}>
                Alle Inhalte anzeigen
              </Button>
            ) : null
          }
        />
      )}
      {office.hasNextPage && (
        <Button
          variant="outline"
          className="self-center"
          disabled={office.isFetching}
          onClick={() => void office.fetchNextPage()}
        >
          {office.isFetchingNextPage ? 'Lädt …' : 'Mehr laden'}
        </Button>
      )}
    </section>
  );
}
