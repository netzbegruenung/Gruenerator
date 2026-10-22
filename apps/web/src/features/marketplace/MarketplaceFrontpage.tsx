import { useUserLandesverbaende } from '@gruenerator/chat';
import { type MarketplaceFrontpageShelfId, type MarketplaceItem } from '@gruenerator/contracts';
import { getLandesverbandHubs, getLandesverbandHubsByIds } from '@gruenerator/shared/agents';
import {
  LANDESVERBAND_COVERS,
  MARKETPLACE_CATEGORIES,
  featureById,
  landesverbandHubHref,
  marketplaceHref,
  marketplaceOriginLabel,
  useMarketplaceFrontpage,
  type MarketplaceCategoryId,
  type MarketplaceFeature,
  type MarketplaceFilters,
} from '@gruenerator/shared/marketplace';
import { Button, SectionHeader, ShowcasePhotoCard, cn } from '@gruenerator/ui';
import { useMemo, type JSX } from 'react';
import { PiChatCircleText, PiHeart, PiImage, PiPlus, PiSparkle, PiCheck } from 'react-icons/pi';
import { Link, useNavigate } from 'react-router-dom';

import { GallerySkeleton } from '../../components/common/Gallery/parts';

import { chatPathOf, metaLine, viewOf } from './kindViews';
import { lvCardImage } from './landesverbandCovers';
import { MarketplaceCard } from './MarketplaceCard';
import { categoryTileImage } from './MarketplaceCategoryView';
import { CollectionCards } from './MarketplaceCollections';
import {
  DISPLAY_FONT,
  MarketplaceShowcaseCard,
  ScrollRow,
  SWIPE_ON_PHONE,
  MarketplaceVisualCard,
  SHOWCASE_GRID,
  showcaseToneAt,
  useBrokenPreviews,
} from './MarketplaceShowcaseCard';
import { type MarketplaceActions } from './useMarketplaceActions';

import { CURRENT_INSTANCE } from '@/config/instance';
import { useAuthStore } from '@/stores/authStore';

interface MarketplaceFrontpageProps {
  actions: MarketplaceActions;
  onSelect: (item: MarketplaceItem) => void;
  /** „Alle anzeigen" lands on the existing list with that filter. */
  onBrowse: (patch: Partial<MarketplaceFilters>) => void;
}

/**
 * „Start" on `/marktplatz`: one featured item, then shelves that each hide
 * below their minimum, so a small catalogue gives a short page. The server
 * composes all of it in one answer (`composeFrontpage`); this only renders.
 */
export function MarketplaceFrontpage({
  actions,
  onSelect,
  onBrowse,
}: MarketplaceFrontpageProps): JSX.Element {
  const { lvIds } = useUserLandesverbaende();
  const hasLv = (lvIds?.length ?? 0) > 0;
  // Exactly one Landesverband: „Alle anzeigen" opens its page instead of the filtered list.
  const lvHubs = getLandesverbandHubsByIds(lvIds ?? [], CURRENT_INSTANCE);
  const lvHub = lvIds?.length === 1 && lvHubs.length === 1 ? lvHubs[0] : null;

  const page = useMarketplaceFrontpage();
  const shelf = (id: MarketplaceFrontpageShelfId): MarketplaceItem[] =>
    page.data?.shelves.find((s) => s.shelfId === id)?.items ?? [];

  const focusItem = page.data?.featured ?? null;
  const feature = featureById(page.data?.featureId ?? null);
  const focusPending = page.isPending;

  const lvItems = hasLv ? shelf('landesverband') : [];
  const newItems = shelf('neu');
  const popularItems = shelf('beliebt');
  const visualShelfItems = useMemo(
    () => page.data?.shelves.find((s) => s.shelfId === 'gestalten')?.items ?? [],
    [page.data]
  );
  const brokenPreviews = useBrokenPreviews(visualShelfItems);
  // The server already applied the shelf minimum. Here a Vorlage whose preview
  // fails becomes a mock sheet, a sticker or background without one leaves.
  const visualItems = visualShelfItems.filter(
    (item) => item.kind === 'template' || !brokenPreviews.has(item.key)
  );

  return (
    <div className="flex flex-col gap-2xl">
      {focusPending ? (
        <GallerySkeleton count={1} className="h-[320px] rounded-2xl" />
      ) : (
        focusItem && (
          <FocusSlot
            item={focusItem}
            feature={feature}
            fontFamily={DISPLAY_FONT}
            actions={actions}
            onSelect={onSelect}
          />
        )
      )}

      <CollectionCards
        row="rest"
        collections={page.data?.collections ?? []}
        onOpen={(collection) => onBrowse({ collection })}
      />
      <CollectionCards
        title="Themen"
        row="themen"
        collections={page.data?.collections ?? []}
        onOpen={(collection) => onBrowse({ collection })}
      />

      {lvItems.length > 0 && (
        <section aria-label="Aus deinem Landesverband">
          <SectionHeader
            title={`Aus deinem Landesverband · ${marketplaceOriginLabel('landesverband', lvIds)}`}
            actions={
              lvHub ? (
                <Button asChild variant="ghost" size="sm">
                  <Link to={landesverbandHubHref(lvHub.slug)}>Alle anzeigen</Link>
                </Button>
              ) : (
                <BrowseButton onClick={() => onBrowse({ origin: 'landesverband' })} />
              )
            }
          />
          <div className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-3">
            {lvItems.map((item) => (
              <MarketplaceCard
                key={item.key}
                item={item}
                actions={actions}
                onSelect={() => onSelect(item)}
              />
            ))}
          </div>
        </section>
      )}

      {newItems.length > 0 && (
        <section aria-label="Neu im Marktplatz">
          <SectionHeader
            title="Neu im Marktplatz"
            actions={<BrowseButton onClick={() => onBrowse({ sort: 'neu' })} />}
          />
          <div className={cn(SHOWCASE_GRID, SWIPE_ON_PHONE)}>
            {newItems.map((item, index) => (
              <MarketplaceShowcaseCard
                key={item.key}
                item={item}
                tone={showcaseToneAt(index)}
                actions={actions}
                onSelect={() => onSelect(item)}
              />
            ))}
          </div>
        </section>
      )}
      <LandesverbandRow />
      {popularItems.length > 0 && (
        <section aria-label="Beliebt">
          <SectionHeader
            title="Beliebt"
            actions={<BrowseButton onClick={() => onBrowse({ sort: 'beliebt' })} />}
          />
          <PopularList items={popularItems} onSelect={onSelect} />
        </section>
      )}

      {visualItems.length > 0 && (
        <section aria-label="Zum Gestalten">
          <SectionHeader
            title="Zum Gestalten"
            actions={
              <BrowseButton
                label="Alle Vorlagen"
                onClick={() => onBrowse({ category: 'vorlagen' })}
              />
            }
          />
          <ScrollRow>
            {visualItems.map((item, index) => (
              <li key={item.key} className="w-60 shrink-0">
                <MarketplaceVisualCard
                  item={item}
                  tone={showcaseToneAt(index)}
                  broken={brokenPreviews.has(item.key)}
                  actions={actions}
                  onSelect={() => onSelect(item)}
                />
              </li>
            ))}
          </ScrollRow>
        </section>
      )}

      <CategoryTiles onOpen={(category) => onBrowse({ category })} />
    </div>
  );
}

/**
 * „Kategorien": the four ways into the Marktplatz, photo tiles with their
 * text on a dark gradient. They replace the tabs above the front page.
 */
function CategoryTiles({ onOpen }: { onOpen: (id: MarketplaceCategoryId) => void }): JSX.Element {
  return (
    <section aria-labelledby="marktplatz-kategorien" className="flex flex-col gap-md">
      <h2 id="marktplatz-kategorien" className="m-0 text-xl font-semibold text-foreground-heading">
        Kategorien
      </h2>
      <ul className="m-0 grid list-none grid-cols-1 gap-md p-0 md:grid-cols-2">
        {MARKETPLACE_CATEGORIES.map((category) => {
          const href = marketplaceHref({ category: category.id });
          return (
            <li key={category.id}>
              <ShowcasePhotoCard
                title={category.title}
                kicker={category.kicker}
                description={category.description}
                credit={{ ...category.cover.credit, source: 'Unsplash' }}
                href={href}
                onActivate={(event) => {
                  event.preventDefault();
                  onOpen(category.id);
                }}
                {...categoryTileImage(category)}
                titleFont={DISPLAY_FONT}
                className="aspect-video"
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * „Landesverbände": one photo card per Landesverband of the viewer's country,
 * their own first. Each opens the Landesverband's page in the Marktplatz.
 */
function LandesverbandRow(): JSX.Element | null {
  const navigate = useNavigate();
  const { lvIds } = useUserLandesverbaende();
  const locale = useAuthStore((s) => s.locale) === 'de-AT' ? 'de-AT' : 'de-DE';
  const own = new Set(lvIds ?? []);
  const hubs = [...getLandesverbandHubs(locale, CURRENT_INSTANCE)].sort(
    (a, b) => Number(own.has(b.lvId)) - Number(own.has(a.lvId))
  );
  if (hubs.length === 0) return null;
  return (
    <section aria-labelledby="marktplatz-landesverbaende" className="flex flex-col gap-md">
      <h2
        id="marktplatz-landesverbaende"
        className="m-0 text-xl font-semibold text-foreground-heading"
      >
        Landesverbände
      </h2>
      <ScrollRow>
        {hubs.map((hub) => {
          const href = landesverbandHubHref(hub.slug);
          return (
            <li key={hub.lvId} className="w-52 shrink-0">
              <ShowcasePhotoCard
                title={hub.title}
                badge={own.has(hub.lvId) ? 'Dein Landesverband' : null}
                href={href}
                onActivate={(event) => {
                  event.preventDefault();
                  void navigate(href);
                }}
                {...lvCardImage(LANDESVERBAND_COVERS[hub.lvId])}
                titleFont={DISPLAY_FONT}
              />
            </li>
          );
        })}
      </ScrollRow>
    </section>
  );
}

function BrowseButton({
  onClick,
  label = 'Alle anzeigen',
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      {label}
    </Button>
  );
}

function FocusSlot({
  item,
  feature,
  fontFamily,
  actions,
  onSelect,
}: {
  item: MarketplaceItem;
  /** `null` = the fallback item, which has no pitch or example of its own. */
  feature: MarketplaceFeature | null;
  fontFamily: string;
  actions: MarketplaceActions;
  onSelect: (item: MarketplaceItem) => void;
}) {
  const visual = viewOf(item).visual(item);
  const chatPath = chatPathOf(item);
  const example = feature?.example ?? null;
  return (
    <section
      aria-labelledby="marktplatz-fokus"
      className="grid overflow-hidden rounded-2xl bg-primary-600 text-white md:grid-cols-2 dark:bg-[#14271D] dark:text-[#DCEEE3]"
    >
      <div className="flex flex-col justify-between gap-lg p-lg md:p-xl">
        <div className="flex flex-col gap-sm">
          <span className="text-xs font-bold tracking-[0.08em] text-primary-100 uppercase dark:text-[#8FC9A9]">
            {feature?.kicker ?? 'Neu im Marktplatz'}
          </span>
          <h2
            id="marktplatz-fokus"
            className="m-0 text-[clamp(2.25rem,5vw,3.25rem)] leading-[1.05] font-bold text-balance text-white dark:text-[#B5DEC6]"
            style={{ fontFamily }}
          >
            {item.title}
          </h2>
          <p className="m-0 max-w-[30rem] text-base leading-relaxed text-primary-50 dark:text-[#C3DCCD]">
            {feature?.pitch ?? item.description}
          </p>
          <span className="text-sm text-primary-100 dark:text-[#7CA890]">{metaLine(item)}</span>
        </div>
        <div className="flex flex-wrap gap-xs">
          {chatPath ? (
            <Button
              asChild
              variant="outline"
              className="border-white bg-white text-primary-700 hover:bg-primary-50 dark:border-[#8FC9A9] dark:bg-[#8FC9A9] dark:text-[#0F1F17] dark:hover:bg-[#B5DEC6]"
            >
              <Link to={chatPath}>
                <PiChatCircleText aria-hidden />
                Im Chat ausprobieren
              </Link>
            </Button>
          ) : (
            <Button
              variant="outline"
              className="border-white bg-white text-primary-700 hover:bg-primary-50 dark:border-[#8FC9A9] dark:bg-[#8FC9A9] dark:text-[#0F1F17] dark:hover:bg-[#B5DEC6]"
              onClick={() => onSelect(item)}
            >
              Ansehen
            </Button>
          )}
          {!item.isOwn && (
            <Button
              variant="ghost"
              aria-pressed={item.saved}
              className="border border-primary-300 text-white hover:bg-primary-700 dark:border-[#3E6B52] dark:text-[#B5DEC6] dark:hover:bg-[#1C3628]"
              onClick={() => actions.toggleSave(item)}
            >
              {item.saved ? <PiCheck aria-hidden /> : <PiPlus aria-hidden />}
              {item.saved ? viewOf(item).saveLabel.added : viewOf(item).saveLabel.add}
            </Button>
          )}
        </div>
      </div>
      <div
        aria-hidden
        className="flex flex-col justify-center gap-sm bg-primary-700 p-lg md:p-xl dark:bg-[#0F1F17]"
      >
        {example ? (
          <>
            <p className="m-0 max-w-[20rem] self-end rounded-2xl rounded-br-sm bg-white px-md py-sm text-sm leading-relaxed text-grey-800 dark:bg-grey-800 dark:text-grey-100">
              {example.prompt}
            </p>
            <div className="flex max-w-[22rem] flex-col gap-xs rounded-2xl rounded-bl-sm bg-primary-50 px-md py-sm text-sm leading-relaxed whitespace-pre-line text-grey-800 dark:bg-[#1C3628] dark:text-[#DCEEE3]">
              <span className="flex items-center gap-xs font-semibold text-primary-600 dark:text-[#8FC9A9]">
                {visual.type === 'icon' && visual.icon}
                {item.title}
              </span>
              {example.answer}
            </div>
          </>
        ) : (
          <span className="flex size-28 items-center justify-center self-center rounded-3xl bg-primary-50 text-6xl text-primary-600 dark:bg-[#1C3628] dark:text-[#8FC9A9]">
            {visual.type === 'icon' ? visual.icon : <PiSparkle />}
          </span>
        )}
      </div>
    </section>
  );
}

function PopularList({
  items,
  onSelect,
}: {
  items: MarketplaceItem[];
  onSelect: (item: MarketplaceItem) => void;
}) {
  return (
    <ol className="m-0 list-none rounded-lg border border-grey-200 bg-card px-md py-xs dark:border-grey-700">
      {items.map((item, index) => {
        const visual = viewOf(item).visual(item);
        return (
          <li
            key={item.key}
            className="border-b border-grey-100 last:border-b-0 dark:border-grey-800"
          >
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="flex w-full cursor-pointer items-center gap-sm bg-transparent py-sm text-left"
            >
              <span className="w-4 shrink-0 text-right text-sm font-bold text-foreground-muted">
                {index + 1}
              </span>
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-background-alt text-lg text-foreground-heading"
              >
                {visual.type === 'icon' ? visual.icon : <PiImage />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-semibold text-foreground-heading">
                  {item.title}
                </span>
                <span className="text-[13px] text-foreground-muted">{metaLine(item)}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-[13px] text-foreground-muted">
                <PiHeart aria-hidden />
                <span className="sr-only">Gefällt</span>
                {item.likesCount}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
