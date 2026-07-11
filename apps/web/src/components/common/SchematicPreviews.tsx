import { cn } from '@gruenerator/ui';
import React, { memo } from 'react';

import { parseTablePreview } from '../../utils/parseTablePreview';

// Schematic card previews shared by the Workplace "Zuletzt" section and the
// Office overview. Boards, Univer sheets and presentations keep their real
// data in Yjs (loaded only inside the editors), so list cards render a
// type-faithful schematic instead of a live excerpt; legacy 'tabelle' docs
// carry an HTML <table> in `content` and get their real leading cells.

// Stylised placeholder for content-less documents: one eucalyptus "title" bar
// over greyed body bars — reads as a document outline instead of an empty plate.
// Widths are deliberately uneven so it looks like real prose.
export const PlaceholderBars = memo(() => (
  <div className="flex flex-col gap-2" aria-hidden>
    <div className="h-2 w-3/5 rounded-full bg-secondary-300 dark:bg-secondary-600" />
    <div className="h-1.5 w-[92%] rounded-full bg-grey-200 dark:bg-grey-700/60" />
    <div className="h-1.5 w-[85%] rounded-full bg-grey-200 dark:bg-grey-700/60" />
    <div className="h-1.5 w-[94%] rounded-full bg-grey-200 dark:bg-grey-700/60" />
    <div className="h-1.5 w-[70%] rounded-full bg-grey-200 dark:bg-grey-700/60" />
  </div>
));
PlaceholderBars.displayName = 'PlaceholderBars';

// Board overview for the preview plate: a three-column Kanban (eucalyptus
// header bar over solid card blocks) or a grid of whiteboard sticky notes.
const KANBAN_COLUMNS = [
  { id: 'kanban-1', cards: 2 },
  { id: 'kanban-2', cards: 1 },
  { id: 'kanban-3', cards: 2 },
];

const WHITEBOARD_NOTES = [
  { id: 'wb-a', tint: 'bg-secondary-100 dark:bg-secondary-900/40' },
  { id: 'wb-b', tint: 'bg-primary-100 dark:bg-primary-900/40' },
  { id: 'wb-c', tint: 'bg-grey-100 dark:bg-grey-700/50' },
  { id: 'wb-d', tint: 'bg-secondary-50 dark:bg-secondary-900/30' },
  { id: 'wb-e', tint: 'bg-grey-100 dark:bg-grey-700/50' },
  { id: 'wb-f', tint: 'bg-primary-50 dark:bg-primary-900/30' },
];

export const BoardPreviewBody = memo(({ boardType }: { boardType?: 'kanban' | 'whiteboard' }) => {
  if (boardType === 'whiteboard') {
    return (
      <div className="grid h-full grid-cols-3 grid-rows-2 gap-2" aria-hidden>
        {WHITEBOARD_NOTES.map((note) => (
          <div key={note.id} className={cn('rounded-[5px]', note.tint)} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2.5" aria-hidden>
      {KANBAN_COLUMNS.map((col) => (
        <div key={col.id} className="flex flex-1 flex-col gap-1.5">
          <div className="h-2 rounded-[3px] bg-secondary-300 dark:bg-secondary-600" />
          {Array.from({ length: col.cards }, (_, i) => (
            <div
              key={`${col.id}-${i}`}
              className="h-6 rounded-[5px] bg-grey-100 dark:bg-grey-700/50"
            />
          ))}
        </div>
      ))}
    </div>
  );
});
BoardPreviewBody.displayName = 'BoardPreviewBody';

// Spreadsheet preview: a schematic grid (A/B/C column headers + numbered row
// gutter) filled with the table's real leading cells when the content carries
// an HTML <table>, else faint placeholder bars. Univer sheets have no HTML
// content, so they always show the schematic — which still reads as a
// spreadsheet at a glance, distinct from the prose plate a plain doc shows.
const COLUMN_LETTERS = ['A', 'B', 'C', 'D'];
const TABLE_PLACEHOLDER_ROWS = 4;

export const TablePreviewBody = memo(({ content }: { content?: string }) => {
  const rows = content ? parseTablePreview(content) : [];
  const colCount = Math.min(
    COLUMN_LETTERS.length,
    Math.max(2, rows.reduce((max, row) => Math.max(max, row.length), 0) || 3)
  );
  const bodyRows: string[][] =
    rows.length > 0 ? rows : Array.from({ length: TABLE_PLACEHOLDER_ROWS }, () => []);
  const cols = COLUMN_LETTERS.slice(0, colCount);

  const cellBase =
    'flex items-center overflow-hidden px-2 text-[10.5px] leading-none border-r border-b';
  const gutterCell =
    'flex items-center justify-center text-[10px] leading-none border-r border-b bg-grey-50 text-grey-400 dark:bg-grey-800/60 dark:text-grey-500';

  return (
    <div
      className="grid text-left"
      style={{ gridTemplateColumns: `26px repeat(${colCount}, minmax(0, 1fr))` }}
      aria-hidden
    >
      {/* Column header strip */}
      <div className="h-5 border-r border-b border-grey-200 bg-grey-100 dark:border-grey-700/60 dark:bg-grey-700/40" />
      {cols.map((letter) => (
        <div
          key={`h-${letter}`}
          className="flex h-5 items-center px-2 border-r border-b border-grey-200 bg-grey-100 text-[10px] font-bold text-grey-500 dark:border-grey-700/60 dark:bg-grey-700/40 dark:text-grey-400"
        >
          {letter}
        </div>
      ))}

      {bodyRows.map((row, rowIdx) => {
        const isHeaderRow = rowIdx === 0;
        return (
          <React.Fragment key={`row-${rowIdx}`}>
            <div className={cn(gutterCell, 'h-7')}>{rowIdx + 1}</div>
            {cols.map((letter, colIdx) => {
              const value = row[colIdx];
              return (
                <div
                  key={`c-${rowIdx}-${letter}`}
                  className={cn(
                    cellBase,
                    'h-7',
                    isHeaderRow
                      ? 'border-secondary-200 bg-secondary-50 font-semibold text-secondary-700 dark:border-secondary-800/60 dark:bg-secondary-900/30 dark:text-secondary-200'
                      : 'border-grey-100 text-grey-700 dark:border-grey-700/40 dark:text-grey-300'
                  )}
                >
                  {value ? (
                    <span className="truncate">{value}</span>
                  ) : (
                    <span
                      className={cn(
                        'h-1.5 w-3/4 rounded-full',
                        isHeaderRow
                          ? 'bg-secondary-300 dark:bg-secondary-600'
                          : 'bg-grey-200 dark:bg-grey-700/50'
                      )}
                    />
                  )}
                </div>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
});
TablePreviewBody.displayName = 'TablePreviewBody';

// Presentation preview: a large title slide over a filmstrip of three slide
// thumbnails. Slide data lives in the Y.Doc (reveal deck), so this is always a
// schematic — same visual language as the board/table schematics.
const FILMSTRIP_SLIDES = ['slide-1', 'slide-2', 'slide-3'];

export const SlidesPreviewBody = memo(() => (
  <div className="flex h-full flex-col gap-2" aria-hidden>
    <div className="flex flex-1 flex-col justify-center gap-2 rounded-md border border-grey-200 bg-white px-4 dark:border-grey-700/60 dark:bg-grey-900/40">
      <div className="h-2.5 w-1/2 rounded-full bg-secondary-300 dark:bg-secondary-600" />
      <div className="h-1.5 w-4/5 rounded-full bg-grey-200 dark:bg-grey-700/60" />
      <div className="h-1.5 w-2/3 rounded-full bg-grey-200 dark:bg-grey-700/60" />
    </div>
    <div className="flex gap-2">
      {FILMSTRIP_SLIDES.map((id) => (
        <div
          key={id}
          className="flex h-9 flex-1 flex-col justify-center gap-1 rounded-[5px] border border-grey-200 bg-white px-2 dark:border-grey-700/60 dark:bg-grey-900/40"
        >
          <div className="h-1 w-2/3 rounded-full bg-secondary-200 dark:bg-secondary-700" />
          <div className="h-1 w-full rounded-full bg-grey-100 dark:bg-grey-700/50" />
        </div>
      ))}
    </div>
  </div>
));
SlidesPreviewBody.displayName = 'SlidesPreviewBody';
