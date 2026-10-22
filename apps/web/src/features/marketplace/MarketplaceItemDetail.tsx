import { type MarketplaceCollectionId, type MarketplaceItem } from '@gruenerator/contracts';
import {
  canReport,
  collectionCoverPath,
  relatedFromCollections,
  useMarketplaceFrontpage,
  type MarketplaceCollection,
} from '@gruenerator/shared/marketplace';
import { Button, cn } from '@gruenerator/ui';
import { type JSX, type ReactNode } from 'react';
import { PiCaretLeft, PiCheck, PiExport, PiFlag, PiHeart, PiHeartFill } from 'react-icons/pi';

import { VisualImage, metaLine, viewOf } from './kindViews';
import { copyLink, MarketplaceDiscussion } from './MarketplaceDiscussion';
import { DISPLAY_FONT, ScrollRow, SHOWCASE_TONES } from './MarketplaceShowcaseCard';
import { type MarketplaceActions } from './useMarketplaceActions';

/** How many neighbours „Passt dazu" shows after the collections. */
const RELATED_LIMIT = 8;

const TONE_TILE: Record<MarketplaceCollection['tone'], string> = {
  tanne: 'bg-primary-50 text-primary-600',
  klee: 'bg-primary-100/60 text-primary-700',
  sand: 'bg-background-sand text-[#7d6a45]',
};

/**
 * An item opened in the Marktplatz, for every kind — calm, after the App
 * Store's product page: one left edge and no boxes; the icon, what it is, one
 * filled button (save) with the kind's ways on as text beside it, like and
 * share as two quiet round buttons. Below, a Vorlage's pages or the picture,
 * the comments, and „Passt dazu": the collections holding the item, then their
 * other entries, as one row.
 */
export function MarketplaceItemDetail({
  item,
  actions,
  onBack,
  shareHref,
  headingLevel,
  backLabel = 'Marktplatz',
  onSelect,
  onOpenCollection,
}: {
  item: MarketplaceItem;
  actions: MarketplaceActions;
  onBack: () => void;
  /** Where the share button points: the Marktplatz with this item open. */
  shareHref: string;
  /** The title's level: 2 under the page's `h1`, 3 under a dialog's title. */
  headingLevel: 2 | 3;
  /** The back link's text: where it leads. */
  backLabel?: string;
  /** Opens a neighbour from „Passt dazu"; left out, the row stays away. */
  onSelect?: (item: MarketplaceItem) => void;
  /** Opens a collection; left out (the dialog), the row shows only entries. */
  onOpenCollection?: (id: MarketplaceCollectionId) => void;
}): JSX.Element {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const SubHeading = headingLevel === 3 ? 'h4' : 'h3';
  const view = viewOf(item);
  const visual = view.visual(item);
  const { PrimaryActions, DetailExtras } = view;

  return (
    <div className="flex max-w-[980px] flex-col gap-xl">
      <button
        type="button"
        onClick={onBack}
        className="-mb-sm inline-flex min-h-11 w-fit items-center gap-0.5 text-[15px] text-primary-700 transition-colors hover:text-primary-800 dark:text-primary-300 dark:hover:text-primary-200"
      >
        <PiCaretLeft aria-hidden className="h-[18px] w-[18px]" />
        {backLabel}
      </button>

      <div className="flex flex-col gap-md">
        <header className="flex items-start gap-4 sm:items-center sm:gap-8">
          {visual.type === 'icon' && (
            <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl bg-primary-50 text-5xl text-primary-700 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)] sm:h-32 sm:w-32 sm:rounded-[30px] sm:text-6xl dark:bg-grey-800 dark:text-primary-300">
              {visual.icon}
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm text-foreground-muted">{metaLine(item)}</span>
            <Heading
              className="m-0 text-2xl leading-[1.1] font-bold tracking-[-0.015em] break-words hyphens-auto text-foreground-heading sm:text-[2.5rem] sm:tracking-[-0.022em]"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              {item.title}
            </Heading>
            {item.description && (
              <p className="m-0 max-w-[62ch] text-sm leading-relaxed text-foreground-muted sm:text-[17px]">
                {item.description}
              </p>
            )}
          </div>
        </header>

        <div
          className={cn(
            // Phone: save full width beside like and share, the ways on as text below. Wider: one row.
            'flex flex-wrap items-center gap-x-sm gap-y-xs lg:gap-x-lg',
            visual.type === 'icon' && 'sm:pl-40'
          )}
        >
          {!item.isOwn && (
            <Button
              variant="brand"
              className="h-11 flex-1 px-6 lg:flex-none"
              aria-pressed={item.saved}
              onClick={() => actions.toggleSave(item)}
            >
              {item.saved && <PiCheck aria-hidden />}
              {item.saved ? view.saveLabel.added : view.saveLabel.add}
            </Button>
          )}
          <div className="order-3 flex w-full flex-wrap justify-center gap-x-lg empty:hidden lg:order-none lg:w-auto lg:justify-start">
            <PrimaryActions item={item} />
          </div>
          <span className="ml-auto flex gap-xs lg:order-last">
            <RoundButton
              label={`Gefällt mir (${item.likesCount})`}
              pressed={item.liked}
              onClick={() => actions.toggleLike(item)}
            >
              {item.liked ? <PiHeartFill aria-hidden /> : <PiHeart aria-hidden />}
              <span aria-hidden className="tabular-nums">
                {item.likesCount}
              </span>
            </RoundButton>
            <RoundButton label="Link kopieren" onClick={() => void copyLink(shareHref)}>
              <PiExport aria-hidden />
            </RoundButton>
            {canReport(item) && (
              <RoundButton label="Melden" onClick={() => actions.report(item)}>
                <PiFlag aria-hidden />
              </RoundButton>
            )}
          </span>
        </div>
      </div>

      {DetailExtras ? (
        <DetailExtras item={item} />
      ) : (
        visual.type === 'image' && <VisualImage visual={visual} className="max-w-md rounded-2xl" />
      )}

      <hr className="m-0 border-0 border-t border-grey-200 dark:border-grey-700" />

      <div className="max-w-[640px]">
        <MarketplaceDiscussion
          target={{ kind: item.kind, ref: item.ref }}
          item={null}
          canModerate={item.isOwn}
          headingLevel={headingLevel === 3 ? 4 : 3}
        />
      </div>

      {onSelect && (
        <Related
          item={item}
          heading={SubHeading}
          onSelect={onSelect}
          onOpenCollection={onOpenCollection}
        />
      )}
    </div>
  );
}

function RoundButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className="inline-flex h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-full border-0 bg-background-alt px-3 text-sm font-bold text-primary-700 transition-transform active:scale-95 dark:text-primary-300 [&>svg]:h-5 [&>svg]:w-5"
    >
      {children}
    </button>
  );
}

/** „Passt dazu": the item's collections first, then their other entries. */
function Related({
  item,
  heading: SubHeading,
  onSelect,
  onOpenCollection,
}: {
  item: MarketplaceItem;
  heading: 'h3' | 'h4';
  onSelect: (item: MarketplaceItem) => void;
  onOpenCollection?: (id: MarketplaceCollectionId) => void;
}) {
  const page = useMarketplaceFrontpage();
  const related = relatedFromCollections(
    page.data?.collections ?? [],
    { kind: item.kind, ref: item.ref },
    RELATED_LIMIT
  );
  const collections = onOpenCollection ? related.collections : [];
  if (collections.length === 0 && related.items.length === 0) return null;

  return (
    <>
      <hr className="m-0 border-0 border-t border-grey-200 dark:border-grey-700" />
      <section aria-label="Passt dazu" className="flex flex-col gap-md">
        <SubHeading className="m-0 text-lg font-bold text-foreground-heading">
          Passt dazu
        </SubHeading>
        <ScrollRow>
          {collections.map((collection) => (
            <li key={collection.id}>
              <Tile
                title={collection.title}
                meta="Kollektion"
                onClick={() => onOpenCollection?.(collection.id)}
                media={
                  collection.cover ? (
                    <img
                      src={collectionCoverPath(collection.cover, 640)}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : null
                }
                tone={collection.tone}
              />
            </li>
          ))}
          {related.items.map((entry, index) => {
            const entryVisual = viewOf(entry).visual(entry);
            return (
              <li key={entry.key}>
                <Tile
                  title={entry.title}
                  meta={viewOf(entry).label}
                  onClick={() => onSelect(entry)}
                  tone={SHOWCASE_TONES[(index + 1) % SHOWCASE_TONES.length]!}
                  media={
                    entryVisual.type === 'image' && entryVisual.src ? (
                      <img
                        src={entryVisual.src}
                        alt=""
                        loading="lazy"
                        className={cn(
                          'h-full w-full',
                          entryVisual.cutout ? 'object-contain p-[10%]' : 'object-cover'
                        )}
                      />
                    ) : (
                      <span aria-hidden className="text-[40px]">
                        {entryVisual.icon}
                      </span>
                    )
                  }
                />
              </li>
            );
          })}
        </ScrollRow>
      </section>
    </>
  );
}

function Tile({
  title,
  meta,
  media,
  tone,
  onClick,
}: {
  title: string;
  meta: string;
  media: ReactNode;
  tone: MarketplaceCollection['tone'];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-[150px] cursor-pointer flex-col gap-1.5 border-0 bg-transparent p-0 text-left sm:w-[200px]"
    >
      <span
        className={cn(
          'flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-xl transition-transform group-active:scale-[0.97] sm:rounded-2xl dark:bg-grey-800 dark:text-primary-300',
          TONE_TILE[tone]
        )}
      >
        {media}
      </span>
      <span className="flex flex-col">
        <span
          className="line-clamp-1 text-[15px] font-semibold text-foreground-heading sm:text-base"
          style={{ fontFamily: DISPLAY_FONT }}
        >
          {title}
        </span>
        <span className="text-xs text-foreground-muted sm:text-[13px]">{meta}</span>
      </span>
    </button>
  );
}
