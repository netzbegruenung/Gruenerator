import { type RecurringTask } from '@gruenerator/contracts';
import { agentKey, agentRef, matchesAgenturaType } from '@gruenerator/shared/agents';
import {
  Button,
  ConfirmDialogProvider,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  StatusBanner,
} from '@gruenerator/ui';
import { useMemo, useState } from 'react';
import {
  PiClockCounterClockwise,
  PiFileText,
  PiPlus,
  PiRepeat,
  PiStorefront,
} from 'react-icons/pi';
import { Link, useNavigate } from 'react-router-dom';

import { OwnAgentsConversionNotice } from '../agents/AgentDeprecationNotice';
import { MarketplaceDialog } from '../marketplace/MarketplaceDialog';
import { SubscribedCollectionSection } from '../marketplace/SubscribedCollectionSection';
import { useRecurringTasks } from '../recurring-tasks/api';

import { MarketSection } from './components/MarketSection';
import { useAgentIndex } from './hooks/useAgentIndex';
import { useAgenturaPools } from './hooks/useAgenturaPools';
import { useMarketCards } from './hooks/useMarketCards';
import { useMarketFilters } from './hooks/useMarketFilters';
import { useMyRecipes } from './hooks/useMyRecipes';
import { useStarImport } from './hooks/useStarImport';
import { useSystemCatalog } from './hooks/useSystemCatalog';
import { useUserLibrary } from './hooks/useUserLibrary';
import { AGENTURA_TYPE_LABELS, SORT_LABELS } from './lib/categories';
import {
  foreignEntry,
  marketItemText,
  matchesQuery,
  ownEntry,
  sortBy,
  type AgentEntry,
  type MarketItem,
  type RecipeEntry,
} from './lib/marketItems';

import {
  FilterChip,
  GalleryCountRow,
  GalleryEmptyState,
  GallerySkeleton,
  GridSizeToggle,
  useGridSize,
} from '@/components/common/Gallery/parts';
import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
import { PageHero, PageHeroSearch, PageShell } from '@/components/common/PageHero';

/** Reihenfolge der Abschnitte — dieselben Gattungen und Beschriftungen wie der Typ-Filter. */
const SECTION_KINDS: MarketItem['kind'][] = ['agent', 'recipe', 'task'];

const toTaskItem = (task: RecurringTask): MarketItem => ({
  kind: 'task' as const,
  isFavorite: false,
  task,
});

/** Im Popup über der Übersicht gibt es nur, was hier auch steht: Agents und Rezepte. */
const MARKET_KINDS = ['agent', 'recipe'] as const;

/**
 * Die Übersicht „Grüneratoren": womit die Person arbeitet — eigene Agents,
 * Rezepte und Aufgaben, was mit ihr geteilt wurde, und was sie aus dem
 * Marktplatz zu ihren Grüneratoren geholt hat. Der Marktplatz selbst öffnet
 * als Popup darüber, auf Agents und Rezepte beschränkt.
 */
function GrueneratorenPage() {
  const navigate = useNavigate();
  const filters = useMarketFilters();
  const { search, type, sort } = filters;
  // `null` = zu; sonst die Suche, mit der das Popup aufgeht.
  const [market, setMarket] = useState<{ q: string } | null>(null);
  const [gridSize, toggleGridSize] = useGridSize('grueneratoren-grid-size', 'large');

  const pools = useAgenturaPools();
  const { userAgents, sharedAgents, sharedForeignAgents } = pools;
  const catalog = useSystemCatalog(sharedAgents);
  const { sortAgentEntries } = useAgentIndex({
    ...pools,
    systemAgents: catalog.systemAgents,
  });
  const {
    data: recurringTasks = [],
    isSuccess: tasksLoaded,
    isError: tasksFailed,
  } = useRecurringTasks();

  const library = useUserLibrary();
  const myRecipes = useMyRecipes();
  const { toAgentItems, toRecipeItems, renderItem, asLibrary, shareDialog } = useMarketCards();

  // Was der Marktplatz an Agents anbietet, nach Verweis — dieselbe Sichtbarkeit
  // wie dort: Landesverbands-Agents nur mit Rolle (und erst nach deren
  // Hydratation), damit ein verwaister LV-Eintrag hier nicht am Rollen-Gatter
  // vorbei erscheint.
  const shopAgents = useMemo(() => {
    const lv = catalog.rolesLoaded ? catalog.lvSystemAgents : [];
    const map = new Map<string, AgentEntry>();
    for (const agent of [...catalog.generalSystemAgents, ...lv, ...pools.communityAgents])
      map.set(agentRef(agent, false), foreignEntry(agent));
    return map;
  }, [
    catalog.generalSystemAgents,
    catalog.lvSystemAgents,
    catalog.rolesLoaded,
    pools.communityAgents,
  ]);

  // Aus dem Marktplatz geholte Agents, die nicht ohnehin eigen oder geteilt sind.
  const addedAgents = useMemo(() => {
    const shown = new Set(
      [...userAgents, ...sharedForeignAgents.map((e) => e.agent)].map(agentKey)
    );
    const agents: AgentEntry[] = [];
    for (const item of library.items) {
      if (item.kind !== 'agent') continue;
      const entry = shopAgents.get(item.ref);
      if (entry && !shown.has(agentKey(entry.agent))) agents.push(entry);
    }
    return agents;
  }, [library.items, shopAgents, userAgents, sharedForeignAgents]);

  const ownAgentKeys = useMemo(() => new Set(userAgents.map(agentKey)), [userAgents]);
  useStarImport({
    ready: library.loaded && pools.ownLoaded && pools.publicLoaded && catalog.rolesLoaded,
    library,
    shopAgents,
    shopRecipes: myRecipes.shopRecipes,
    ownAgentKeys,
  });

  const sortRecipeEntries = (entries: RecipeEntry[]) => sortBy(entries, sort, (e) => e.title);

  const allItems: MarketItem[] = [
    ...toAgentItems(sortAgentEntries(userAgents.map(ownEntry), sort)),
    ...toRecipeItems(sortRecipeEntries(myRecipes.own)),
    ...recurringTasks.map(toTaskItem),
    // Geteiltes und Hinzugefügtes steht ohne eigene Überschrift mitten drin:
    // für die Person ist es Teil dessen, womit sie arbeitet. Woher es kommt,
    // sagt die Meta-Zeile der Kachel.
    ...toAgentItems(
      sortAgentEntries(
        sharedForeignAgents.map((e) => foreignEntry(e.agent)),
        sort
      )
    ),
    ...toRecipeItems(sortRecipeEntries(myRecipes.shared)),
    ...asLibrary(toAgentItems(sortAgentEntries(addedAgents, sort))),
    ...asLibrary(toRecipeItems(sortRecipeEntries(myRecipes.added))),
  ];

  const q = search.trim().toLowerCase();
  const searching = q.length > 0;
  const items = allItems.filter(
    (item) =>
      matchesAgenturaType(type, item) && (!searching || matchesQuery(marketItemText(item), q))
  );

  const typeActive = type !== 'all';
  // „Leer" erst, wenn alles geladen ist — vorher sind die Pools nur leere
  // Rückfälle, und „Noch nichts angelegt" wäre eine Behauptung ohne Grundlage.
  const settled = pools.ownLoaded && tasksLoaded && library.loaded;
  const failed = pools.ownFailed || tasksFailed || library.failed;
  const nothingYet = settled && allItems.length === 0;
  const sections = SECTION_KINDS.map((kind) => ({
    kind,
    items: items.filter((item) => item.kind === kind),
  })).filter((section) => section.items.length > 0);

  return (
    <PageShell wide>
      <PageHero
        title="Grüneratoren"
        description={
          <p className="m-0 text-sm leading-relaxed text-pretty text-grey-500 dark:text-grey-400">
            Deine Agents, Rezepte und wiederkehrenden Aufgaben. Offizielle und öffentliche findest
            du im Marktplatz.
          </p>
        }
        toolbar={
          <>
            <PageHeroSearch
              query={search}
              onQuery={filters.setSearch}
              placeholder="Grüneratoren durchsuchen…"
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Marktplatz"
              title="Marktplatz"
              onClick={() => setMarket({ q: '' })}
            >
              <PiStorefront aria-hidden className="size-[18px]" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Neu" title="Neu">
                  <PiPlus aria-hidden className="size-[18px]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate('/agentura/rezept/neu')}>
                  <PiFileText />
                  <span>Rezept</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/wiederkehrend/neu')}>
                  <PiRepeat />
                  <span>Wiederkehrende Aufgabe</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {/* Die Kachel zeigt den Takt, nicht den Betrieb — Verlauf,
                    Fehlertexte und Ergebnisse stehen auf /wiederkehrend. */}
                <DropdownMenuItem onClick={() => navigate('/wiederkehrend')}>
                  <PiClockCounterClockwise />
                  <span>Verlauf &amp; Steuerung</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {/* Die Seite läuft aus: Rezepte stehen jetzt unter /projekte und auf den
          Projektseiten. Bis alles umgezogen ist, bleibt sie erreichbar. */}
      <StatusBanner
        variant="warning"
        className="mb-md flex flex-wrap items-center justify-between gap-sm"
      >
        <span className="min-w-0 flex-1">
          <strong>Alles zieht zu den Projekten um.</strong> Deine Rezepte findest du jetzt unter
          „Projekte“, die Rezepte eines Projekts direkt auf seiner Seite. Diese Übersicht bleibt
          vorerst erreichbar.
        </span>
        <Button asChild size="sm" variant="outline">
          <Link to="/projekte">Zu den Projekten</Link>
        </Button>
      </StatusBanner>

      <OwnAgentsConversionNotice agents={userAgents} className="mb-md" />

      {/* Die Zahl steht nicht mehr sichtbar da, bleibt aber hörbar: ohne sie
          wechselt bei Suche oder Filter lautlos der Inhalt. */}
      <span role="status" aria-live="polite" className="sr-only">
        {`${items.length} ${items.length === 1 ? 'Eintrag' : 'Einträge'}`}
      </span>
      {filters.isFiltered && (
        <GalleryCountRow count={null} onReset={filters.reset}>
          {typeActive && (
            <FilterChip
              label={AGENTURA_TYPE_LABELS[type]}
              onRemove={() => filters.setType('all')}
            />
          )}
          {sort === 'az' && (
            <FilterChip label={SORT_LABELS[sort]} onRemove={() => filters.setSort('empfohlen')} />
          )}
          {searching && (
            <FilterChip label={`„${search.trim()}“`} onRemove={() => filters.setSearch('')} />
          )}
        </GalleryCountRow>
      )}

      <SubscribedCollectionSection show="agents" />

      {sections.length > 0 ? (
        <div className="flex flex-col gap-xl">
          {sections.map((section, index) => (
            <MarketSection
              key={section.kind}
              title={AGENTURA_TYPE_LABELS[section.kind]}
              gridSize={gridSize}
              aside={
                index === 0 ? (
                  <GridSizeToggle gridSize={gridSize} onToggle={toggleGridSize} />
                ) : undefined
              }
            >
              {section.items.map(renderItem)}
            </MarketSection>
          ))}
        </div>
      ) : failed ? (
        <GalleryEmptyState
          title="Deine Grüneratoren konnten nicht geladen werden"
          hint="Lade die Seite neu oder versuch es gleich noch einmal."
        />
      ) : !settled ? (
        <div className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-3">
          <GallerySkeleton count={6} className="h-[190px]" />
        </div>
      ) : nothingYet ? (
        <GalleryEmptyState
          title="Noch nichts angelegt"
          hint="Du hast noch keine eigenen Rezepte erstellt. Leg los oder stöbere im Marktplatz."
          action={
            <div className="flex flex-wrap items-center justify-center gap-sm">
              <Button asChild variant="brand" size="brand-sm">
                <Link to="/agentura/rezept/neu">
                  <PiFileText />
                  Rezept erstellen
                </Link>
              </Button>
              <Button variant="outline" size="brand-sm" onClick={() => setMarket({ q: '' })}>
                <PiStorefront />
                Zum Marktplatz
              </Button>
            </div>
          }
        />
      ) : (
        <GalleryEmptyState
          title={searching ? 'Keine Treffer' : 'Nichts gefunden'}
          hint={
            searching
              ? 'Bei deinen Grüneratoren ist nichts dabei — vielleicht im Marktplatz.'
              : 'Versuch einen anderen Filter.'
          }
          action={
            <div className="flex flex-wrap items-center justify-center gap-sm">
              {searching && (
                <Button variant="outline" size="sm" onClick={() => setMarket({ q: search.trim() })}>
                  Im Marktplatz suchen
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={filters.reset}>
                Filter zurücksetzen
              </Button>
            </div>
          }
        />
      )}

      <MarketplaceDialog
        open={market !== null}
        onOpenChange={(open) => !open && setMarket(null)}
        kinds={MARKET_KINDS}
        initialQuery={market?.q ?? ''}
      />
      {shareDialog}
    </PageShell>
  );
}

/** Gives the recipe-delete flow a real AlertDialog instead of `useConfirm`'s
 *  degraded `window.confirm` fallback — mirrors `RecipeDetailPage`'s dispatcher. */
function GrueneratorenRoute() {
  return (
    <ConfirmDialogProvider>
      <GrueneratorenPage />
    </ConfirmDialogProvider>
  );
}

export default withAuthRequired(GrueneratorenRoute, { title: 'Grüneratoren' });
