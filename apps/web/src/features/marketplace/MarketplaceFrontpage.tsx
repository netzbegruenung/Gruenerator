import { useUserLandesverbaende } from '@gruenerator/chat';
import {
  type MarketplaceItem,
  type MarketplaceKind,
  type MarketplaceOrigin,
  type MarketplaceSort,
} from '@gruenerator/contracts';
import {
  FRONTPAGE_SHELVES,
  FRONTPAGE_TEXT_KINDS,
  FRONTPAGE_VISUAL_KINDS,
  fallbackFeature,
  featureFor,
  landesverbandShelf,
  marketplaceOriginLabel,
  newestShelf,
  popularShelf,
  useMarketplaceItem,
  useMarketplaceSections,
  visualShelf,
  type MarketplaceFeature,
  type MarketplaceFilters,
  type MarketplaceTabSlug,
} from '@gruenerator/shared/marketplace';
import { Button, SectionHeader } from '@gruenerator/ui';
import { type JSX, type ReactNode } from 'react';
import {
  PiBookOpenText,
  PiCaretRight,
  PiChatCircleText,
  PiHeart,
  PiImage,
  PiLayout,
  PiPlus,
  PiSparkle,
  PiSticker,
  PiCheck,
} from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { GallerySkeleton } from '../../components/common/Gallery/parts';

import { chatPathOf, metaLine, viewOf } from './kindViews';
import { MarketplaceCard } from './MarketplaceCard';
import { type MarketplaceActions } from './useMarketplaceActions';

import { useAuthStore } from '@/stores/authStore';

/** Headline face of the brand per country, as in the sharepic themes. */
const DISPLAY_FONT = {
  'de-DE': "'GrueneType', 'PT Sans', sans-serif",
  'de-AT': "'GothamNarrow-Ultra', 'PT Sans', sans-serif",
} as const;

const KIND_TILES: { slug: MarketplaceTabSlug; label: string; hint: string; icon: ReactNode }[] = [
  {
    slug: 'agents',
    label: 'Agents',
    hint: 'Mit eigener Rolle und eigenem Wissen',
    icon: <PiSparkle />,
  },
  {
    slug: 'rezepte',
    label: 'Rezepte',
    hint: 'Fertige Anleitungen für eine Textsorte',
    icon: <PiBookOpenText />,
  },
  {
    slug: 'vorlagen',
    label: 'Vorlagen',
    hint: 'Sharepics und Layouts zum Anpassen',
    icon: <PiLayout />,
  },
  {
    slug: 'sticker',
    label: 'Sticker',
    hint: 'Freigestellte Motive für deine Bilder',
    icon: <PiSticker />,
  },
  {
    slug: 'hintergruende',
    label: 'Hintergründe',
    hint: 'Flächen und Fotos für Sharepics',
    icon: <PiImage />,
  },
];

const BASE = { q: '', scope: 'shop', platform: 'web' } as const;

function useShelf(
  kinds: readonly MarketplaceKind[],
  sort: MarketplaceSort,
  sectionLimit: number,
  origin: MarketplaceOrigin | null = null,
  enabled = true
) {
  return useMarketplaceSections({ ...BASE, kinds, sort, origin, sectionLimit, enabled });
}

interface MarketplaceFrontpageProps {
  actions: MarketplaceActions;
  onSelect: (item: MarketplaceItem) => void;
  /** „Alle anzeigen" lands on the existing list with that filter. */
  onBrowse: (patch: Partial<MarketplaceFilters>) => void;
}

/**
 * „Start" on `/marktplatz`: one featured item, then shelves that each hide
 * below their minimum (`FRONTPAGE_SHELVES`), so a small catalogue gives a
 * short page. Every shelf is its own `sections` query.
 */
export function MarketplaceFrontpage({
  actions,
  onSelect,
  onBrowse,
}: MarketplaceFrontpageProps): JSX.Element {
  const locale = useAuthStore((s) => s.locale) === 'de-AT' ? 'de-AT' : 'de-DE';
  const { lvIds } = useUserLandesverbaende();
  const hasLv = (lvIds?.length ?? 0) > 0;

  const newest = useShelf(FRONTPAGE_TEXT_KINDS, 'neu', FRONTPAGE_SHELVES.neu.show);
  const popular = useShelf(FRONTPAGE_TEXT_KINDS, 'beliebt', FRONTPAGE_SHELVES.beliebt.show);
  const visuals = useShelf(FRONTPAGE_VISUAL_KINDS, 'empfohlen', FRONTPAGE_SHELVES.gestalten.show);
  const lv = useShelf(
    FRONTPAGE_TEXT_KINDS,
    'empfohlen',
    FRONTPAGE_SHELVES.landesverband.show,
    'landesverband',
    hasLv
  );

  const feature = featureFor(locale);
  const featured = useMarketplaceItem(feature);
  // A curated item the viewer cannot see (gone, other country) gives way to the newest official one.
  const fallback = featured.isError || !feature ? fallbackFeature(newest.sections) : null;
  const focusItem = featured.data ?? fallback;
  const focusPending = feature !== null && featured.isPending;

  const lvItems = hasLv ? landesverbandShelf(lv.sections) : [];
  const newItems = newestShelf(newest.sections).filter((i) => i.key !== focusItem?.key);
  const popularItems = popularShelf(popular.sections);
  const visualItems = visualShelf(visuals.sections);

  return (
    <div className="flex flex-col gap-2xl">
      {focusPending ? (
        <GallerySkeleton count={1} className="h-[320px] rounded-2xl" />
      ) : (
        focusItem && (
          <FocusSlot
            item={focusItem}
            feature={featured.data ? feature : null}
            fontFamily={DISPLAY_FONT[locale]}
            actions={actions}
            onSelect={onSelect}
          />
        )
      )}

      {lvItems.length > 0 && (
        <section aria-label="Aus deinem Landesverband">
          <SectionHeader
            title={`Aus deinem Landesverband · ${marketplaceOriginLabel('landesverband', lvIds)}`}
            actions={<BrowseButton onClick={() => onBrowse({ origin: 'landesverband' })} />}
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

      {(newItems.length > 0 || popularItems.length > 0) && (
        <div className="flex flex-wrap items-start gap-xl">
          {newItems.length > 0 && (
            <section aria-label="Neu im Marktplatz" className="min-w-0 flex-[999_1_34rem]">
              <SectionHeader
                title="Neu im Marktplatz"
                actions={<BrowseButton onClick={() => onBrowse({ sort: 'neu' })} />}
              />
              <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
                {newItems.map((item) => (
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
          {popularItems.length > 0 && (
            <section aria-label="Beliebt" className="min-w-0 flex-[1_1_18rem]">
              <SectionHeader
                title="Beliebt"
                actions={<BrowseButton onClick={() => onBrowse({ sort: 'beliebt' })} />}
              />
              <PopularList items={popularItems} onSelect={onSelect} />
            </section>
          )}
        </div>
      )}

      {visualItems.length > 0 && (
        <section aria-label="Zum Gestalten">
          <SectionHeader
            title="Zum Gestalten"
            actions={
              <BrowseButton label="Alle Vorlagen" onClick={() => onBrowse({ tab: 'vorlagen' })} />
            }
          />
          <ul className="m-0 -mx-1 flex list-none snap-x gap-md overflow-x-auto px-1 pb-1">
            {visualItems.map((item) => (
              <li key={item.key} className="w-56 shrink-0 snap-start">
                <MarketplaceCard item={item} actions={actions} onSelect={() => onSelect(item)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Nach Art stöbern">
        <SectionHeader title="Nach Art stöbern" />
        <ul className="m-0 grid list-none grid-cols-1 gap-sm p-0 sm:grid-cols-2 lg:grid-cols-5">
          {KIND_TILES.map((tile) => (
            <li key={tile.slug}>
              <button
                type="button"
                onClick={() => onBrowse({ tab: tile.slug })}
                className="flex w-full cursor-pointer items-center gap-sm rounded-lg border border-grey-200 bg-card p-md text-left transition-colors hover:border-primary dark:border-grey-700"
              >
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-background-alt text-xl text-primary-600 dark:text-primary-300"
                >
                  {tile.icon}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-base font-semibold text-foreground-heading">
                    {tile.label}
                  </span>
                  <span className="text-[13px] leading-snug text-foreground-muted">
                    {tile.hint}
                  </span>
                </span>
                <PiCaretRight aria-hidden className="shrink-0 text-grey-400" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="marktplatz-mitmachen"
        className="flex flex-wrap items-center justify-between gap-md rounded-xl bg-background-sand px-lg py-lg dark:bg-grey-800"
      >
        <div className="flex max-w-[40rem] flex-col gap-1">
          <h2
            id="marktplatz-mitmachen"
            className="m-0 text-lg font-semibold text-foreground-heading"
          >
            Du hast ein Rezept, das funktioniert?
          </h2>
          <p className="m-0 text-sm leading-relaxed text-foreground-muted">
            Teile es öffentlich — dann taucht es hier unter „Neu“ auf, und andere Kreis- und
            Ortsverbände können es mit einem Klick übernehmen.
          </p>
        </div>
        <div className="flex flex-wrap gap-xs">
          <Button asChild>
            <Link to="/agentura/rezept/neu">Rezept erstellen</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/grueneratoren">Eigenes teilen</Link>
          </Button>
        </div>
      </section>
    </div>
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
            className="m-0 text-[clamp(2.25rem,5vw,3.25rem)] leading-[0.95] font-normal text-balance text-white dark:text-[#B5DEC6]"
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
