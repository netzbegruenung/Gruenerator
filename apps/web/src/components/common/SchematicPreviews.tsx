import { type BoardPreview } from '@gruenerator/contracts';
import { cn } from '@gruenerator/ui';
import { memo } from 'react';

import { parseSlidesPreview } from '../../utils/parseSlidesPreview';
import { parseTablePreview } from '../../utils/parseTablePreview';

// Card preview bodies shared by the Workplace "Zuletzt" section and the
// Office overview. Each renders real data when available — table cells and
// slide titles from the server-maintained `content` preview, board columns /
// note texts from the board's content metadata — and falls back to a
// type-faithful schematic while no preview has been written yet.

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

export const BoardPreviewBody = memo(
  ({
    boardType,
    preview,
  }: {
    boardType?: 'kanban' | 'whiteboard';
    preview?: BoardPreview | null;
  }) => {
    if (boardType === 'whiteboard') {
      const notes = preview?.notes ?? [];
      return (
        <div className="grid h-full grid-cols-3 grid-rows-2 gap-2" aria-hidden>
          {WHITEBOARD_NOTES.map((note, idx) => (
            <div key={note.id} className={cn('overflow-hidden rounded-[5px] p-1.5', note.tint)}>
              {notes[idx] ? (
                <span className="line-clamp-3 block text-[9px] leading-tight text-grey-700 dark:text-grey-200">
                  {notes[idx]}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      );
    }

    const columns = preview?.columns?.length ? preview.columns : null;
    if (columns) {
      return (
        <div className="flex h-full gap-3" aria-hidden>
          {columns.map((col, idx) => (
            <div key={`${col.name}-${idx}`} className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-grey-500 dark:text-grey-400">
                {col.name}
              </span>
              {Array.from({ length: Math.min(col.count, 3) }, (_, i) => (
                <div
                  key={`${col.name}-${idx}-${i}`}
                  className="h-7 rounded-md bg-grey-100 dark:bg-grey-700/50"
                />
              ))}
            </div>
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
  }
);
BoardPreviewBody.displayName = 'BoardPreviewBody';

// Spreadsheet preview (minimal): the table's leading data rows as calm
// `Label · Wert` pairs — first cell as the label, last as the value — with a
// hairline divider between them. The header row is dropped so the numbers read
// first; faint placeholder bars stand in until a preview exists.
const TABLE_PREVIEW_ROWS = 4;

const EMPTY_TABLE_ROWS = 3;

export const TablePreviewBody = memo(({ content }: { content?: string }) => {
  const rows = content ? parseTablePreview(content) : [];
  const dataRows = rows.slice(1).filter((row) => row.some((cell) => cell.length > 0));

  // Empty table: keep the calm row rhythm, but with faint Label · Wert bars —
  // reads as an empty spreadsheet rather than a blank document.
  if (dataRows.length === 0) {
    return (
      <div className="flex h-full flex-col justify-center px-6" aria-hidden>
        {Array.from({ length: EMPTY_TABLE_ROWS }, (_, idx) => (
          <div
            key={`tempty-${idx}`}
            className={cn(
              'flex items-center justify-between gap-3 py-[7px]',
              idx > 0 && 'border-t border-grey-100 dark:border-grey-700/50'
            )}
          >
            <span className="h-2 w-24 rounded-full bg-grey-200 dark:bg-grey-700/50" />
            <span className="h-2 w-10 rounded-full bg-grey-200 dark:bg-grey-700/50" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-center px-6" aria-hidden>
      {dataRows.slice(0, TABLE_PREVIEW_ROWS).map((row, idx) => {
        const label = row[0] ?? '';
        const value = row.length > 1 ? row[row.length - 1] : '';
        return (
          <div
            key={`trow-${idx}`}
            className={cn(
              'flex items-center justify-between gap-3 py-[7px] text-[13px]',
              idx > 0 && 'border-t border-grey-100 dark:border-grey-700/50'
            )}
          >
            <span className="truncate text-grey-500 dark:text-grey-400">{label}</span>
            <span className="shrink-0 font-semibold text-grey-700 dark:text-grey-200">{value}</span>
          </div>
        );
      })}
    </div>
  );
});
TablePreviewBody.displayName = 'TablePreviewBody';

// Presentation preview (minimal): just the deck's first slide title, large and
// calm, with the slide count beneath — no title-slide box, no filmstrip. Falls
// back to a single title bar until the server has written the preview list.
export const SlidesPreviewBody = memo(({ content }: { content?: string }) => {
  const { titles, total } = content
    ? parseSlidesPreview(content)
    : { titles: [] as string[], total: 0 };
  const deckTitle = titles[0];

  return (
    <div className="flex h-full flex-col justify-center gap-2.5" aria-hidden>
      {deckTitle ? (
        <p className="m-0 line-clamp-3 text-[17px] font-bold leading-snug text-foreground-heading">
          {deckTitle}
        </p>
      ) : (
        <div className="h-2.5 w-1/2 rounded-full bg-secondary-300 dark:bg-secondary-600" />
      )}
      {total > 0 && (
        <p className="m-0 text-[13px] text-grey-400 dark:text-grey-500">{total} Folien</p>
      )}
    </div>
  );
});
SlidesPreviewBody.displayName = 'SlidesPreviewBody';
