import { type MarketplaceCollectionId, type MarketplaceItem } from '@gruenerator/contracts';
import {
  collectionById,
  isSampleItem,
  resolveStory,
  sampleImageOf,
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
import { type JSX } from 'react';
import { PiCheck } from 'react-icons/pi';

import { GalleryEmptyState, GallerySkeleton } from '../../components/common/Gallery/parts';

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
import { type MarketplaceActions } from './useMarketplaceActions';

import { useAuthStore } from '@/stores/authStore';

const COVER_DIR = '/images/marketplace/collections';

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
  const stem = `${COVER_DIR}/${cover.file}${banner ? '-banner' : ''}`;
  const widths = banner ? [640, 1200, 1920, 2400] : [640, 1200];
  return (
    <ShowcaseCardImage
      src={`${stem}-640.webp`}
      srcSet={widths.map((w) => `${stem}-${w}.webp ${w}w`).join(', ')}
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

/** A description without its `**` marks, for the card. */
const plainText = (text: string) => text.replaceAll('**', '');

/** A description with its `**…**` terms in bold. */
function Emphasized({ text }: { text: string }) {
  return text.split('**').map((part, i) =>
    i % 2 ? (
      // The parts are a fixed split of a registry string; their order is their identity.
      // eslint-disable-next-line react/no-array-index-key
      <strong key={i} className="font-semibold text-foreground">
        {part}
      </strong>
    ) : (
      part
    )
  );
}

const countLabel = (n: number) => `${n} ${n === 1 ? 'Eintrag' : 'Einträge'}`;

/** The collection row on the front page: one quiet card per collection, App-Store style. */
export function CollectionCards({
  collections,
  onOpen,
  title = 'Kollektionen',
}: {
  collections: { collectionId: MarketplaceCollectionId; items: MarketplaceItem[] }[];
  onOpen: (id: MarketplaceCollectionId) => void;
  title?: string;
}): JSX.Element | null {
  const cards = collections.flatMap((c) => {
    const def = collectionById(c.collectionId);
    // An unlisted collection is shared by its link only.
    return def && def.listed !== false ? [{ def, items: c.items }] : [];
  });
  if (cards.length === 0) return null;
  return (
    <section aria-labelledby="marktplatz-kollektionen" className="flex flex-col gap-md">
      <h2
        id="marktplatz-kollektionen"
        className="m-0 text-xl font-semibold text-foreground-heading"
      >
        {title}
      </h2>
      <ul
        className={cn('m-0 grid list-none grid-cols-1 gap-md p-0 md:grid-cols-3', SWIPE_BELOW_MD)}
      >
        {cards.map(({ def, items }) => (
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
              meta={`${def.kicker} · ${countLabel(items.length)}`}
              title={def.title}
              description={plainText(def.description)}
              titleFont={DISPLAY_FONT}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A sample entry has no detail page; it shows its picture in a new tab. */
function openSample(item: MarketplaceItem) {
  const src = sampleImageOf(item);
  if (src) window.open(src, '_blank', 'noopener');
}

/** Agents and Rezepte land in „Meine Grüneratoren"; everything else is only „Merken". */
const isAddable = (item: MarketplaceItem) => item.kind === 'agent' || item.kind === 'recipe';

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
  const addable = items.filter(isAddable);
  const missing = addable.filter((item) => !item.saved);

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
            <span className="text-sm text-foreground-muted">{countLabel(items.length)}</span>
          )}
        </div>
        {addable.length > 0 &&
          (missing.length > 0 ? (
            <Button
              size="lg"
              className="rounded-full dark:bg-primary-700 dark:hover:bg-primary-800"
              onClick={() => missing.forEach((item) => actions.toggleSave(item))}
            >
              {missing.length === addable.length
                ? `Alle ${addable.length} hinzufügen`
                : `${missing.length} weitere hinzufügen`}
            </Button>
          ) : (
            <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground-muted">
              <PiCheck aria-hidden />
              Alle bei deinen Grüneratoren
            </span>
          ))}
      </header>
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
