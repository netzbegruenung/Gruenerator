import { type MarketplaceItem, type MarketplaceKind } from '@gruenerator/contracts';
import {
  DEFAULT_MARKETPLACE_SORT,
  categoryById,
  getMarketplaceTab,
  tabForKind,
  useMarketplaceKind,
  type MarketplaceCategory,
  type MarketplaceCategoryId,
} from '@gruenerator/shared/marketplace';
import { Button, SectionHeader } from '@gruenerator/ui';
import { type JSX } from 'react';

import { GalleryEmptyState, GallerySkeleton } from '../../components/common/Gallery/parts';

import { MarketplaceCard } from './MarketplaceCard';
import {
  DISPLAY_FONT,
  MarketplaceShowcaseCard,
  MarketplaceVisualCard,
  SHOWCASE_GRID,
  showcaseToneAt,
  useBrokenPreviews,
} from './MarketplaceShowcaseCard';
import { type MarketplaceActions } from './useMarketplaceActions';

const DIR = '/images/marketplace/kategorien';

/** The front page tile: 16:9, about half the content width. */
export const categoryTileImage = (category: MarketplaceCategory) => ({
  src: `${DIR}/${category.cover.file}-640.webp`,
  srcSet: `${DIR}/${category.cover.file}-640.webp 640w, ${DIR}/${category.cover.file}-1200.webp 1200w`,
  sizes: '(min-width: 768px) 50vw, 100vw',
});

/**
 * One category opened (`?kategorie=<id>`), in the Landesverband page's
 * layout but without a photo: the title, then every kind of the category as
 * its own aisle of cards. The photo belongs to the tile on the front page.
 */
export function MarketplaceCategoryView({
  id,
  actions,
  onSelect,
}: {
  id: MarketplaceCategoryId;
  actions: MarketplaceActions;
  onSelect: (item: MarketplaceItem) => void;
}): JSX.Element | null {
  const category = categoryById(id);
  if (!category) return null;
  return (
    <div className="flex flex-col gap-2xl">
      <header className="flex max-w-[42rem] flex-col gap-xs">
        <span className="text-sm font-semibold tracking-[0.06em] text-primary-700 uppercase dark:text-primary-300">
          {category.kicker}
        </span>
        <h1
          className="m-0 text-[clamp(2rem,4.5vw,3rem)] leading-[1.05] font-bold tracking-[-0.02em] text-balance text-foreground-heading"
          style={{ fontFamily: DISPLAY_FONT }}
        >
          {category.title}
        </h1>
        <p className="m-0 text-base leading-relaxed text-foreground-muted sm:text-lg">
          {category.description}
        </p>
      </header>
      {category.kinds.map((kind) => (
        <KindAisle
          key={kind}
          kind={kind}
          // One kind needs no heading of its own: the page title already says it.
          titled={category.kinds.length > 1}
          actions={actions}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

const isVisual = (item: MarketplaceItem) =>
  item.kind === 'template' || item.kind === 'sticker' || item.kind === 'background';

function KindAisle({
  kind,
  titled,
  actions,
  onSelect,
}: {
  kind: MarketplaceKind;
  titled: boolean;
  actions: MarketplaceActions;
  onSelect: (item: MarketplaceItem) => void;
}): JSX.Element | null {
  const tab = tabForKind(kind);
  const query = useMarketplaceKind({
    kind,
    origin: null,
    q: '',
    sort: DEFAULT_MARKETPLACE_SORT,
    scope: 'shop',
    platform: 'web',
  });
  const broken = useBrokenPreviews(query.items);
  // A sticker or background without a working preview has nothing to show; a Vorlage becomes a sheet.
  const items = query.items.filter((i) => i.kind === 'template' || !broken.has(i.key));

  let body: JSX.Element;
  if (items.length > 0) {
    body = (
      <div className="flex flex-col gap-md">
        <div className={SHOWCASE_GRID}>
          {items.map((item, index) =>
            item.kind === 'agent' || item.kind === 'recipe' ? (
              <MarketplaceShowcaseCard
                key={item.key}
                item={item}
                tone={showcaseToneAt(index)}
                actions={actions}
                onSelect={() => onSelect(item)}
              />
            ) : isVisual(item) ? (
              <MarketplaceVisualCard
                key={item.key}
                item={item}
                tone={showcaseToneAt(index)}
                broken={broken.has(item.key)}
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
        {query.hasNextPage && (
          <Button
            variant="outline"
            className="self-center"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? 'Lädt …' : 'Mehr anzeigen'}
          </Button>
        )}
      </div>
    );
  } else if (query.isError) {
    body = (
      <GalleryEmptyState
        title={`${tab.label} konnten nicht geladen werden`}
        action={
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Erneut versuchen
          </Button>
        }
      />
    );
  } else if (query.isPending) {
    body = (
      <div className={SHOWCASE_GRID}>
        <GallerySkeleton count={4} className="h-[190px]" />
      </div>
    );
  } else {
    body = <GalleryEmptyState title={getMarketplaceTab(tab.slug).emptyText} />;
  }

  return (
    <section aria-label={tab.label}>
      {titled && <SectionHeader title={tab.label} />}
      {body}
    </section>
  );
}
