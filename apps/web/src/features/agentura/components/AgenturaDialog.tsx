import { agentKey, matchesAgenturaType, showsSystemRecipes } from '@gruenerator/shared/agents';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@gruenerator/ui';
import { useState } from 'react';
import { PiX } from 'react-icons/pi';

import { useAgentIndex } from '../hooks/useAgentIndex';
import { useAgenturaPools } from '../hooks/useAgenturaPools';
import { useMarketCards } from '../hooks/useMarketCards';
import { SHOP_ORIGINS, useMarketFilters, type ShopOrigin } from '../hooks/useMarketFilters';
import { useSystemCatalog } from '../hooks/useSystemCatalog';
import {
  AGENTURA_TYPE_LABELS,
  SKILL_CATEGORY_ORDER,
  SORT_LABELS,
  type AgenturaType,
} from '../lib/categories';
import { landesverbandRegion } from '../lib/lookups';
import {
  foreignEntry,
  marketItemText,
  matchesQuery,
  ownEntry,
  recipeFromSkill,
  sortBy,
  type MarketItem,
  type RecipeEntry,
} from '../lib/marketItems';

import { MarketItemDetail } from './MarketItemDetail';
import { MarketSection } from './MarketSection';

import {
  FilterChip,
  GalleryCountRow,
  GalleryEmptyState,
  GridSizeToggle,
  useGridSize,
} from '@/components/common/Gallery/parts';
import { PageHeroSearch } from '@/components/common/PageHero';

/** Im Shop gibt es Agents und Rezepte — wiederkehrende Aufgaben sind immer eigene. */
const TYPE_OPTIONS: AgenturaType[] = ['all', 'agent', 'recipe'];

/**
 * Die Agentura — der Shop als Popup über der Übersicht. Drei Gänge: was der
 * Grünerator mitbringt, was der eigene Landesverband bereitstellt, und was
 * andere öffentlich geteilt haben. Eine Kachel öffnet ihre Details im Popup;
 * von dort holt „Zu meinen Grüneratoren" sie auf die Übersicht.
 *
 * Filter stehen in der Adresse (`/agentura?q=…&von=…`), damit ein geteilter
 * Link dieselbe Ansicht öffnet.
 */
export function AgenturaDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {/* Weichgezeichnet statt nur abgedunkelt: der Shop liegt über der eigenen
          Übersicht, und die soll als Kontext erkennbar bleiben, ohne zu lesen. */}
      <DialogContent
        showCloseButton={false}
        overlayProps={{ className: 'bg-black/30 backdrop-blur-md' }}
        className="flex h-[min(88dvh,960px)] w-full flex-col gap-0 overflow-hidden rounded-[20px] p-0 sm:max-w-[min(1200px,calc(100%-3rem))]"
      >
        {open && <AgenturaMarket />}
      </DialogContent>
    </Dialog>
  );
}

function AgenturaMarket() {
  const filters = useMarketFilters(SHOP_ORIGINS);
  const { search, sort } = filters;
  const type: AgenturaType = TYPE_OPTIONS.includes(filters.type) ? filters.type : 'all';
  const [gridSize, toggleGridSize] = useGridSize('agentura-grid-size', 'large');
  const [opened, setOpened] = useState<(MarketItem & { kind: 'agent' | 'recipe' }) | null>(null);

  const pools = useAgenturaPools();
  const catalog = useSystemCatalog(pools.sharedAgents);
  const { sortAgentEntries } = useAgentIndex({ ...pools, systemAgents: catalog.systemAgents });
  const { toAgentItems, toRecipeItems, renderItem } = useMarketCards({
    onOpen: (item) => {
      if (item.kind !== 'task') setOpened(item);
    },
  });

  const sortRecipeEntries = (entries: RecipeEntry[]) => sortBy(entries, sort, (e) => e.title);
  // Nach Region statt nach Nutzung: bei mehreren Zuteilungen sollen die Sachen
  // eines Verbands beieinanderstehen.
  const byRegion = <T,>(items: T[], identifier: (t: T) => string): T[] =>
    [...items].sort((a, b) =>
      landesverbandRegion(identifier(a)).localeCompare(landesverbandRegion(identifier(b)))
    );

  const aisles: { origin: ShopOrigin; title: string; items: MarketItem[] }[] = [
    {
      origin: 'offiziell',
      title: 'Offizielle Grüneratoren',
      items: [
        ...toAgentItems(sortAgentEntries(catalog.generalSystemAgents.map(foreignEntry), sort)),
        ...toRecipeItems(
          SKILL_CATEGORY_ORDER.flatMap((cat) =>
            sortBy(catalog.skillsByCategory.get(cat) ?? [], sort, (s) => s.title).map(
              recipeFromSkill
            )
          )
        ),
      ],
    },
    {
      origin: 'landesverband',
      // Erst nach der Hydratation der Profilrollen: vorher lässt `lvIds === null`
      // jeden Verband durch, und der Gang hieße kurz „Dein Landesverband" mit
      // fremden Inhalten, bevor er auf „Grüne Hessen" umspringt.
      title: catalog.lvShelfLabel,
      items: catalog.rolesLoaded
        ? [
            ...toAgentItems(
              byRegion(catalog.lvSystemAgents, (a) => a.identifier).map(foreignEntry)
            ),
            ...toRecipeItems(byRegion(catalog.lvSkills, (s) => s.identifier).map(recipeFromSkill)),
          ]
        : [],
    },
    {
      origin: 'oeffentlich',
      title: 'Öffentlich',
      items: [
        // Die eigene öffentliche Listung ist die eigene — mit Bearbeiten statt
        // „Zu meinen Grüneratoren".
        ...toAgentItems(
          sortAgentEntries(
            pools.communityAgents.map((agent) => {
              const own = pools.userAgents.find((a) => agentKey(a) === agentKey(agent));
              return own ? ownEntry(own) : foreignEntry(agent);
            }),
            sort
          )
        ),
        ...toRecipeItems(sortRecipeEntries(pools.communityRecipeEntries)),
      ],
    },
  ];

  const q = search.trim().toLowerCase();
  const searching = q.length > 0;
  // System-Rezepte erkennt man an der fehlenden Zeilen-id.
  const showSystemRecipes = showsSystemRecipes(type, searching);
  const isSystemRecipe = (item: MarketItem) => item.kind === 'recipe' && item.entry.id === null;
  const shelvedAisles = aisles.map((aisle) => ({
    ...aisle,
    items: showSystemRecipes ? aisle.items : aisle.items.filter((i) => !isSystemRecipe(i)),
  }));

  // Ein Gang ohne Inhalt fehlt auch im Herkunfts-Menü — beim Landesverband ist
  // das die Zuteilung selbst: ohne Rolle kein Gang.
  const availableAisles = shelvedAisles.filter((aisle) => aisle.items.length > 0);
  const origin = availableAisles.some((a) => a.origin === filters.origin) ? filters.origin : null;
  const originLabel = availableAisles.find((a) => a.origin === origin)?.title ?? '';
  const sections = availableAisles
    .filter((aisle) => origin === null || aisle.origin === origin)
    .map((aisle) => ({
      ...aisle,
      items: aisle.items.filter(
        (item) =>
          matchesAgenturaType(type, item) && (!searching || matchesQuery(marketItemText(item), q))
      ),
    }))
    .filter((aisle) => aisle.items.length > 0);
  const total = sections.reduce((sum, aisle) => sum + aisle.items.length, 0);

  const typeActive = type !== 'all';

  return (
    <>
      <div className="flex flex-col gap-sm border-b border-grey-200 px-lg pt-lg pb-md dark:border-grey-700">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-md">
          <DialogTitle className="m-0 text-[clamp(1.375rem,3vw,1.75rem)] leading-tight font-bold text-foreground-heading">
            Agentura
          </DialogTitle>
          {/* Schließen steht in derselben Leiste wie die Suche, nicht in der
              Ecke darüber — eine Reihe Bedienelemente statt zwei Ebenen. */}
          <div className="relative flex shrink-0 items-center gap-1 text-grey-500">
            {!opened && (
              <PageHeroSearch
                query={search}
                onQuery={filters.setSearch}
                placeholder="Agentura durchsuchen…"
              />
            )}
            <DialogClose asChild>
              <Button variant="ghost" size="icon" aria-label="Schließen" title="Schließen">
                <PiX aria-hidden className="size-[18px]" />
              </Button>
            </DialogClose>
          </div>
        </div>
        <DialogDescription className="m-0 max-w-[40rem] text-sm leading-relaxed text-pretty text-grey-500 dark:text-grey-400">
          Offizielle Agents, die deines Landesverbands und was andere öffentlich teilen. Öffne eine
          Kachel und hol sie zu deinen Grüneratoren. System-Rezepte wie „Pressemitteilung“ wendet
          der Grünerator von selbst an — die Suche findet sie trotzdem.
        </DialogDescription>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-lg py-lg">
        {opened ? (
          <MarketItemDetail item={opened} onBack={() => setOpened(null)} />
        ) : (
          <div className="flex flex-col gap-md">
            <span role="status" aria-live="polite" className="sr-only">
              {`${total} ${total === 1 ? 'Eintrag' : 'Einträge'}`}
            </span>
            {filters.isFiltered && (
              <GalleryCountRow count={null} onReset={filters.reset}>
                {typeActive && (
                  <FilterChip
                    label={AGENTURA_TYPE_LABELS[type]}
                    onRemove={() => filters.setType('all')}
                  />
                )}
                {origin && (
                  <FilterChip label={originLabel} onRemove={() => filters.setOrigin(null)} />
                )}
                {sort === 'az' && (
                  <FilterChip
                    label={SORT_LABELS[sort]}
                    onRemove={() => filters.setSort('empfohlen')}
                  />
                )}
                {searching && (
                  <FilterChip label={`„${search.trim()}“`} onRemove={() => filters.setSearch('')} />
                )}
              </GalleryCountRow>
            )}

            {sections.length > 0 ? (
              <div className="flex flex-col gap-xl">
                {sections.map((aisle, index) => (
                  <MarketSection
                    key={aisle.origin}
                    title={aisle.title}
                    gridSize={gridSize}
                    aside={
                      index === 0 ? (
                        <GridSizeToggle gridSize={gridSize} onToggle={toggleGridSize} />
                      ) : undefined
                    }
                  >
                    {aisle.items.map(renderItem)}
                  </MarketSection>
                ))}
              </div>
            ) : (
              <GalleryEmptyState
                title={filters.isFiltered ? 'Nichts gefunden' : 'Hier ist gerade nichts'}
                hint={
                  filters.isFiltered
                    ? 'Versuch ein anderes Stichwort oder einen anderen Filter.'
                    : 'Sobald es offizielle oder öffentliche Grüneratoren gibt, stehen sie hier.'
                }
                action={
                  filters.isFiltered ? (
                    <Button variant="outline" size="sm" onClick={filters.reset}>
                      Zurücksetzen
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}
