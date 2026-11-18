import { type MarketplaceCollectionId, type MarketplaceItem } from '@gruenerator/contracts';
import {
  collectionById,
  collectionContents,
  collectionCardsFor,
  collectionCoverPath,
  collectionMetaLine,
  emphasisParts,
  isLibraryKind,
  isSampleItem,
  marketplaceCountLabel,
  plainEmphasis,
  resolveStory,
  sampleImageOf,
  useCollectionSubscriptions,
  useMarketplaceFrontpage,
  type MarketplaceCollection,
} from '@gruenerator/shared/marketplace';
import {
  Button,
  ShowcaseCard,
  ShowcaseCardIcons,
  ShowcaseCardImage,
  ShowcaseMedia,
  cn,
} from '@gruenerator/ui';
import { type JSX, type PointerEvent, type ReactNode, useId, useRef } from 'react';

import { GalleryEmptyState, GallerySkeleton } from '../../components/common/Gallery/parts';

import { CollectionLaunchpad } from './CollectionLaunchpad';
import { CollectionStory } from './CollectionStory';
import { viewOf } from './kindViews';
import { MarketplaceCard } from './MarketplaceCard';
import {
  DISPLAY_FONT,
  MarketplaceShowcaseCard,
  MarketplaceVisualCard,
  SHOWCASE_GRID,
  SWIPE_BELOW_MD,
  showcaseToneAt,
} from './MarketplaceShowcaseCard';
import { SubscribeButton } from './SubscribeButton';
import { type MarketplaceActions } from './useMarketplaceActions';

import { useAuthStore } from '@/stores/authStore';

/**
 * A cover in the cut its slot shows: 16:9 for a card (640 / 1200), a 3:1 strip
 * for the page banner, up to 2400 so a wide Retina screen stays sharp. The
 * browser picks the width by the slot in `sizes`.
 */
function CollectionCover({
  collection,
  sizes,
  decorative,
  banner,
}: {
  collection: MarketplaceCollection;
  sizes: string;
  /** On a card the title next to it says the same, so the picture stays silent. */
  decorative: boolean;
  /** The page's opening picture: its own cut, loaded first. */
  banner: boolean;
}) {
  const cover = collection.cover;
  if (!cover) return null;
  const widths = banner ? ([640, 1200, 1920, 2400] as const) : ([640, 1200] as const);
  return (
    <ShowcaseCardImage
      src={collectionCoverPath(cover, 640, banner)}
      srcSet={widths.map((w) => `${collectionCoverPath(cover, w, banner)} ${w}w`).join(', ')}
      sizes={sizes}
      alt={decorative ? '' : cover.alt}
      credit={cover.credit && { ...cover.credit, source: 'Unsplash' }}
      {...(banner && { loading: 'eager', fetchPriority: 'high' })}
    />
  );
}

/** The cover, or the first items as icon tiles when a collection has none. */
function CollectionMedia({
  collection,
  items,
  sizes,
  decorative,
  banner = false,
}: {
  collection: MarketplaceCollection;
  items: MarketplaceItem[];
  sizes: string;
  decorative: boolean;
  banner?: boolean;
}) {
  return collection.cover ? (
    <CollectionCover
      collection={collection}
      sizes={sizes}
      decorative={decorative}
      banner={banner}
    />
  ) : (
    <ShowcaseCardIcons
      tone={collection.tone}
      icons={items.map((item) => ({ key: item.key, icon: viewOf(item).visual(item).icon }))}
    />
  );
}

/** A description with its `**…**` terms in bold. */
function Emphasized({ text }: { text: string }) {
  return emphasisParts(text).map((part, i) =>
    part.strong ? (
      // The parts are a fixed split of a registry string; their order is their identity.
      // eslint-disable-next-line react/no-array-index-key
      <strong key={i} className="font-semibold text-foreground">
        {part.text}
      </strong>
    ) : (
      part.text
    )
  );
}

/**
 * A sideways row: 82 % of a phone, about two cards on a tablet, three and a
 * peek on a desktop. The thin scrollbar stays so a mouse can reach the rest.
 * The 4 px of padding on top and (from md) at the sides keep a focused card's
 * ring inside the scroll box, which clips everything outside its padding.
 */
const COLLECTION_SCROLL_ROW =
  'm-0 flex list-none snap-x snap-mandatory gap-md overflow-x-auto p-0 -mt-1 pt-1 pb-3 [scrollbar-width:thin] max-md:-mx-4 max-md:scroll-px-4 max-md:px-4 md:-mx-1 md:scroll-px-1 md:px-1 [&>*]:shrink-0 [&>*]:snap-start [&>*]:w-[82%] sm:[&>*]:w-[46%] lg:[&>*]:w-[31%]';

/**
 * Where the row comes to rest after a drag: the card start nearest to the
 * release point, as `snap-start` with the row's scroll padding would pick it.
 */
function nearestCardStart(el: HTMLElement): number {
  const start =
    el.getBoundingClientRect().left +
    el.clientLeft +
    (parseFloat(getComputedStyle(el).scrollPaddingLeft) || 0);
  const max = el.scrollWidth - el.clientWidth;
  return Array.from(el.children, (card) =>
    Math.min(max, Math.max(0, el.scrollLeft + card.getBoundingClientRect().left - start))
  ).reduce((a, b) => (Math.abs(b - el.scrollLeft) < Math.abs(a - el.scrollLeft) ? b : a));
}

/**
 * The sideways row. A finger swipes natively; a mouse drags it: held down and
 * pulled, the row follows, and on release it glides to the nearest card. A
 * click that ends a drag does not open the card under the pointer.
 */
function ScrollRow({ children }: { children: ReactNode }) {
  const row = useRef<HTMLUListElement>(null);
  const drag = useRef<{ id: number; x: number; left: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);

  const endDrag = (released: boolean, wrapper: HTMLDivElement) => {
    const state = drag.current;
    const el = row.current;
    drag.current = null;
    if (!state?.moved || !el) return;
    delete wrapper.dataset.dragging;
    // Restoring the snap alone jumps to the nearest card in one frame; gliding
    // there first, still unsnapped, means the restored snap finds the row at rest.
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: nearestCardStart(el), behavior: reduce ? 'auto' : 'smooth' });
    el.style.scrollSnapType = '';
    if (!released) return;
    // A click can only follow in the same task as this pointerup; a later one
    // (Enter on a focused card) is a real activation and must get through.
    swallowClick.current = true;
    setTimeout(() => {
      swallowClick.current = false;
    });
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = row.current;
    if (e.pointerType !== 'mouse' || e.button !== 0 || !el) return;
    // A press on the row's own scrollbar belongs to the scrollbar.
    if (e.clientY > el.getBoundingClientRect().top + el.clientTop + el.clientHeight) return;
    drag.current = { id: e.pointerId, x: e.clientX, left: el.scrollLeft, moved: false };
    swallowClick.current = false;
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    const el = row.current;
    if (!state || !el || e.pointerId !== state.id) return;
    // Released outside the row before the drag began: no pointerup reached us.
    if ((e.buttons & 1) === 0) {
      endDrag(false, e.currentTarget);
      return;
    }
    const dx = e.clientX - state.x;
    if (!state.moved && Math.abs(dx) < 5) return;
    if (!state.moved) {
      state.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.dataset.dragging = '';
      // Snapping fights every pixel of the drag; it comes back on release.
      el.style.scrollSnapType = 'none';
    }
    el.scrollLeft = state.left - dx;
  };

  return (
    // Mouse dragging only adds to what fingers and keyboard already do natively.
    <div
      role="presentation"
      // The cards' own pointer cursor would win over the wrapper's while dragging.
      className="cursor-grab select-none data-dragging:cursor-grabbing data-dragging:**:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endDrag(true, e.currentTarget)}
      // No click follows a cancel; a capture lost any other way ends the drag too.
      onPointerCancel={(e) => endDrag(false, e.currentTarget)}
      onLostPointerCapture={(e) => endDrag(false, e.currentTarget)}
      onClickCapture={(e) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      // Pictures and links would start the browser's own drag instead.
      onDragStart={(e) => e.preventDefault()}
    >
      <ul ref={row} className={COLLECTION_SCROLL_ROW}>
        {children}
      </ul>
    </div>
  );
}

/** The collection row on the front page: one quiet card per collection, App-Store style. */
export function CollectionCards({
  collections,
  onOpen,
  title = 'Kollektionen',
  row,
  scroll = false,
}: {
  collections: { collectionId: MarketplaceCollectionId; items: MarketplaceItem[] }[];
  onOpen: (id: MarketplaceCollectionId) => void;
  /** `null`: the surrounding section already carries the heading. */
  title?: string | null;
  /** Only the collections of this front page row (`rest`: those without one); all when left out. */
  row?: NonNullable<MarketplaceCollection['row']> | 'rest';
  /** One row that scrolls sideways at every width, the next card peeking in. */
  scroll?: boolean;
}): JSX.Element | null {
  const headingId = useId();
  const cards = collectionCardsFor(collections, row);
  if (cards.length === 0) return null;
  const list = cards.map(({ def, items }) => (
    <li key={def.id}>
      <ShowcaseCard
        label={def.title}
        onActivate={() => onOpen(def.id)}
        tone={def.tone}
        media={
          <CollectionMedia
            collection={def}
            items={items}
            sizes="(min-width: 768px) 33vw, 100vw"
            decorative
          />
        }
        meta={collectionMetaLine(def, items.length)}
        title={def.title}
        description={plainEmphasis(def.description)}
        titleFont={DISPLAY_FONT}
      />
    </li>
  ));
  const content = scroll ? (
    <ScrollRow>{list}</ScrollRow>
  ) : (
    <ul
      className={cn(
        'm-0 grid list-none grid-cols-1 gap-md p-0',
        // Two or four cards stand in pairs; three columns would leave one or two alone.
        cards.length % 2 === 0 && cards.length < 6 ? 'md:grid-cols-2' : 'md:grid-cols-3',
        SWIPE_BELOW_MD
      )}
    >
      {list}
    </ul>
  );
  // Without a title the surrounding section is the landmark; a second one
  // inside it would only announce the same content twice.
  if (title === null) return content;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-md">
      <h2 id={headingId} className="m-0 text-xl font-semibold text-foreground-heading">
        {title}
      </h2>
      {content}
    </section>
  );
}

/** A sample entry has no detail page; it shows its picture in a new tab. */
function openSample(item: MarketplaceItem) {
  const src = sampleImageOf(item);
  if (src) window.open(src, '_blank', 'noopener');
}

const isAddable = (item: MarketplaceItem) => isLibraryKind(item.kind);

function ItemGrid({
  items,
  actions,
  onSelect,
}: {
  items: readonly MarketplaceItem[];
  actions: MarketplaceActions;
  onSelect: (item: MarketplaceItem) => void;
}) {
  return (
    <div className={SHOWCASE_GRID}>
      {items.map((item, index) =>
        isSampleItem(item) ? (
          <MarketplaceVisualCard
            key={item.key}
            item={item}
            tone={showcaseToneAt(index)}
            broken={false}
            actions={null}
            onSelect={() => openSample(item)}
          />
        ) : isAddable(item) ? (
          <MarketplaceShowcaseCard
            key={item.key}
            item={item}
            tone={showcaseToneAt(index)}
            actions={actions}
            onSelect={() => onSelect(item)}
          />
        ) : (
          <MarketplaceCard
            key={item.key}
            item={item}
            actions={actions}
            onSelect={() => onSelect(item)}
          />
        )
      )}
    </div>
  );
}

/**
 * One collection opened (`?kollektion=<id>`), App-Store-story style: the cover
 * as a wide banner, the title with „Alle hinzufügen", then every item as a
 * card and the other collections below. The items come from the front page
 * answer, so likes and saves stay in sync with it.
 */
export function MarketplaceCollectionView({
  id,
  actions,
  onSelect,
  onBack,
  onOpen,
}: {
  id: MarketplaceCollectionId;
  actions: MarketplaceActions;
  onSelect: (item: MarketplaceItem) => void;
  onBack: () => void;
  onOpen: (id: MarketplaceCollectionId) => void;
}): JSX.Element {
  const page = useMarketplaceFrontpage();
  const locale = useAuthStore((s) => s.locale);
  const def = collectionById(id);
  const { isSubscribed } = useCollectionSubscriptions();
  const launchpad = isSubscribed(id)
    ? collectionContents(id, locale === 'de-AT' ? 'de-AT' : 'de-DE')
    : null;
  const collections = page.data?.collections ?? [];
  // A collection below its `min` is not in the response; one of only Vorlagen (min 0) is, empty.
  const collection = collections.find((c) => c.collectionId === id);
  const items = collection?.items ?? [];
  if (page.isPending) {
    return (
      <GallerySkeleton
        count={1}
        className="aspect-[2/1] sm:aspect-[3/1] h-auto rounded-2xl md:-mt-4"
      />
    );
  }
  if (!def || !collection) {
    return (
      <GalleryEmptyState
        title="Diese Kollektion ist nicht verfügbar"
        hint="Vielleicht gibt es sie nicht mehr, oder ihre Inhalte sind für dich nicht sichtbar."
        action={
          <Button variant="outline" size="sm" onClick={onBack}>
            Zum Marktplatz
          </Button>
        }
      />
    );
  }

  const story = def.story?.length ? resolveStory(def.story, items, locale) : null;
  const select = (item: MarketplaceItem) =>
    isSampleItem(item) ? openSample(item) : onSelect(item);

  return (
    <div className="flex flex-col gap-xl">
      {/* Without a breadcrumb the photo opens the page: its top edge sits as far
          from the top as the page edge from the side. */}
      <ShowcaseMedia
        tone={def.tone}
        className="aspect-[2/1] sm:aspect-[3/1] w-full rounded-2xl md:-mt-4"
      >
        <CollectionMedia
          collection={def}
          items={items}
          sizes="(min-width: 1280px) 1200px, 100vw"
          decorative={false}
          banner
        />
      </ShowcaseMedia>
      <header className="flex flex-wrap items-end justify-between gap-lg">
        <div className="flex min-w-0 flex-[999_1_28rem] flex-col gap-xs">
          <span className="text-sm font-semibold tracking-[0.06em] text-primary-700 uppercase dark:text-primary-300">
            {def.kicker}
          </span>
          <h1
            className="m-0 text-[clamp(2rem,4.5vw,3rem)] leading-[1.05] font-bold tracking-[-0.02em] text-balance text-foreground-heading"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            {def.title}
          </h1>
          <p className="m-0 text-base leading-relaxed text-foreground-muted sm:text-lg">
            <Emphasized text={def.description} />
          </p>
          {items.length > 0 && (
            <span className="text-sm text-foreground-muted">
              {marketplaceCountLabel(items.length)}
            </span>
          )}
        </div>
        <SubscribeButton collectionId={id} />
      </header>
      {launchpad && <CollectionLaunchpad contents={launchpad} items={items} />}
      {story ? (
        <>
          <CollectionStory blocks={story.blocks} actions={actions} onSelect={select} />
          {story.rest.length > 0 && (
            <section aria-labelledby="kollektion-mehr" className="flex flex-col gap-md">
              <h2
                id="kollektion-mehr"
                className="m-0 text-xl font-semibold text-foreground-heading"
              >
                Mehr aus der Kollektion
              </h2>
              <ItemGrid items={story.rest} actions={actions} onSelect={onSelect} />
            </section>
          )}
        </>
      ) : (
        <section aria-labelledby="kollektion-inhalte" className="flex flex-col gap-md">
          <h2 id="kollektion-inhalte" className="sr-only">
            Enthalten
          </h2>
          <ItemGrid items={items} actions={actions} onSelect={onSelect} />
        </section>
      )}
      <CollectionCards
        title="Weitere Kollektionen"
        collections={collections.filter((c) => c.collectionId !== id)}
        onOpen={onOpen}
      />
    </div>
  );
}
