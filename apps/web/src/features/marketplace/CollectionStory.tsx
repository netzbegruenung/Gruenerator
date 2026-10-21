import { type MarketplaceItem } from '@gruenerator/contracts';
import { isSampleItem, type ResolvedStoryBlock } from '@gruenerator/shared/marketplace';
import { cn } from '@gruenerator/ui';
import { type JSX } from 'react';
import { PiBookmarkSimple, PiBookmarkSimpleFill } from 'react-icons/pi';

import { viewOf } from './kindViews';
import { DISPLAY_FONT } from './MarketplaceShowcaseCard';
import { type MarketplaceActions } from './useMarketplaceActions';

/**
 * A collection's story (docs/CLAUDE-collections.md): two widths, one surface.
 * Text, claims and quotes stand in the reading column on the page itself —
 * never in a box, never on a photo; a gallery takes the full width. The only
 * pictures are the entries themselves.
 */

const COLUMN = 'w-full max-w-[42rem]';
const SMALL = 'text-sm leading-[1.45] text-foreground-muted';

interface ItemProps {
  actions: MarketplaceActions;
  onSelect: (item: MarketplaceItem) => void;
}

function SaveButton({
  item,
  actions,
  compact,
}: { item: MarketplaceItem; compact?: boolean } & Pick<ItemProps, 'actions'>) {
  // A sample exists only as a file: nobody can save it.
  if (isSampleItem(item)) return null;
  const label = viewOf(item).saveLabel;
  if (compact) {
    return (
      <button
        type="button"
        aria-pressed={item.saved}
        aria-label={`${item.title}: ${item.saved ? label.remove : label.add}`}
        onClick={() => actions.toggleSave(item)}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-50 text-primary-700 transition-transform duration-150 ease-out active:scale-95 dark:bg-grey-800 dark:text-primary-300"
      >
        {item.saved ? <PiBookmarkSimpleFill aria-hidden /> : <PiBookmarkSimple aria-hidden />}
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={item.saved}
      onClick={() => actions.toggleSave(item)}
      className="shrink-0 rounded-full bg-primary-50 px-4 py-2 max-sm:ml-16 text-[0.9375rem] font-bold text-primary-700 transition-transform duration-150 ease-out active:scale-[0.97] dark:bg-grey-800 dark:text-primary-300"
    >
      {item.saved ? label.added : label.add}
    </button>
  );
}

/** The seal: an entry's own icon on Tanne, the one green an entry carries. */
function Seal({ item }: { item: MarketplaceItem }) {
  const visual = viewOf(item).visual(item);
  return (
    <span
      aria-hidden
      className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-primary-700 text-2xl text-white sm:size-14"
    >
      {visual.type === 'image' && visual.src ? (
        <img src={visual.src} alt="" className="size-full object-cover" />
      ) : (
        visual.icon
      )}
    </span>
  );
}

function Rows({ items, actions, onSelect }: { items: readonly MarketplaceItem[] } & ItemProps) {
  return (
    <ul className="m-0 list-none p-0">
      {items.map((item) => (
        <li
          key={item.key}
          className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-grey-200 py-4 last:border-b dark:border-grey-800"
        >
          {/* Below ~600px the button wraps under the text, indented past the seal. */}
          <button
            type="button"
            onClick={() => onSelect(item)}
            className="flex min-w-0 flex-[1_1_20rem] items-center gap-4 rounded-lg text-left"
          >
            <Seal item={item} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <strong className="text-[1.0625rem] leading-[1.3] text-foreground-heading">
                {item.title}
              </strong>
              {item.description && (
                <span className={cn(SMALL, 'line-clamp-2')}>
                  {viewOf(item).label}. {item.description}
                </span>
              )}
            </span>
          </button>
          <SaveButton item={item} actions={actions} />
        </li>
      ))}
    </ul>
  );
}

/** Entries with a picture, in their own format, on one shared height. */
function Gallery({ items, actions, onSelect }: { items: readonly MarketplaceItem[] } & ItemProps) {
  return (
    <ul
      className="m-0 flex list-none snap-x snap-mandatory gap-5 overflow-x-auto p-0 pb-2"
      aria-label="Galerie"
    >
      {items.map((item) => {
        const visual = viewOf(item).visual(item);
        const src = visual.type === 'image' ? visual.src : null;
        const cutout = visual.type === 'image' && visual.cutout;
        return (
          <li key={item.key} className="flex shrink-0 snap-start flex-col gap-2.5">
            <button
              type="button"
              onClick={() => onSelect(item)}
              aria-label={item.title}
              className={cn(
                'block h-[250px] overflow-hidden transition-transform duration-200 ease-out active:scale-[0.985] sm:h-[300px]',
                cutout ? 'w-[165px] p-[7%] sm:w-[200px]' : 'rounded-[22px] bg-background-alt'
              )}
            >
              {src ? (
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  className={cn('h-full', cutout ? 'w-full object-contain' : 'w-auto max-w-none')}
                />
              ) : (
                <span className="grid h-full w-[200px] place-items-center text-4xl text-foreground-muted">
                  {visual.icon}
                </span>
              )}
            </button>
            <span className="flex items-center justify-between gap-3">
              <strong className="text-[0.9375rem] leading-[1.3] text-foreground-heading">
                {item.title}
              </strong>
              <SaveButton item={item} actions={actions} compact />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const LARGE = 'text-[clamp(1.5rem,1.15rem+1.3vw,2.15rem)] leading-[1.22] tracking-[-0.012em]';

function Block({ block, ...props }: { block: ResolvedStoryBlock } & ItemProps): JSX.Element {
  if (block.type === 'text') {
    return (
      <div className={cn(COLUMN, 'flex flex-col gap-[1.1em] text-[1.1875rem] leading-[1.6]')}>
        {block.paragraphs.map((p) => (
          <p key={p} className="m-0">
            {p}
          </p>
        ))}
      </div>
    );
  }
  if (block.type === 'claim') {
    return (
      <div className={cn(COLUMN, 'flex flex-col gap-4')}>
        <p
          className="m-0 text-[clamp(2.25rem,1.4rem+3.6vw,4rem)] leading-[1.02] font-extrabold tracking-[-0.03em] text-balance text-foreground-heading"
          style={{ fontFamily: DISPLAY_FONT }}
        >
          {block.text}
        </p>
        <p className={cn(SMALL, 'm-0 max-w-[34em]')}>
          {block.note}
          {block.source && (
            <>
              {' '}
              Quelle:{' '}
              <a
                href={block.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {block.source.label}
              </a>
            </>
          )}
        </p>
      </div>
    );
  }
  if (block.type === 'quote') {
    return (
      <figure className={cn(COLUMN, 'm-0 flex flex-col gap-4')}>
        <blockquote
          className={cn('m-0 font-medium italic text-foreground-heading', LARGE)}
          style={{ fontFamily: DISPLAY_FONT }}
        >
          „{block.text}“
        </blockquote>
        <figcaption className={SMALL}>{block.by}</figcaption>
      </figure>
    );
  }
  if (block.type === 'example') {
    return (
      <div className={cn(COLUMN, 'flex flex-col gap-6')}>
        <div className="flex flex-col gap-1.5">
          <span className={SMALL}>Du schreibst</span>
          <p className="m-0 text-[1.1875rem] leading-[1.6] text-foreground-muted">{block.prompt}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={SMALL}>{viewOf(block.item).label} antwortet</span>
          <p
            className={cn('m-0 font-semibold whitespace-pre-line text-foreground-heading', LARGE)}
            style={{ fontFamily: DISPLAY_FONT }}
          >
            {block.answer}
          </p>
        </div>
        <Rows items={[block.item]} {...props} />
      </div>
    );
  }
  const heading = block.heading && (
    <h2
      className={cn('m-0 font-semibold text-foreground-heading', LARGE)}
      style={{ fontFamily: DISPLAY_FONT }}
    >
      {block.heading}
    </h2>
  );
  return block.display === 'rows' ? (
    <div className={cn(COLUMN, 'flex flex-col gap-4')}>
      {heading}
      <Rows items={block.items} {...props} />
    </div>
  ) : (
    <div className="flex min-w-0 flex-col gap-4">
      {heading}
      <Gallery items={block.items} {...props} />
    </div>
  );
}

export function CollectionStory({
  blocks,
  ...props
}: { blocks: readonly ResolvedStoryBlock[] } & ItemProps): JSX.Element {
  return (
    <div className="flex flex-col gap-[clamp(2.5rem,1.5rem+3vw,4rem)] text-foreground">
      {blocks.map((block, index) => (
        // Blocks are a fixed list from the registry; their order is their identity.
        // eslint-disable-next-line react/no-array-index-key
        <Block key={index} block={block} {...props} />
      ))}
    </div>
  );
}
