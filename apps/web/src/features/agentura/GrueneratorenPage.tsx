import { type RecurringTask, type TextForm } from '@gruenerator/contracts';
import { agentKey, agentRef, matchesAgenturaType } from '@gruenerator/shared/agents';
import { useDeleteRecipe } from '@gruenerator/shared/grueneratoren';
import {
  Button,
  ConfirmDialogProvider,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useConfirm,
} from '@gruenerator/ui';
import { useMemo } from 'react';
import {
  PiClockCounterClockwise,
  PiFileText,
  PiPlus,
  PiRepeat,
  PiSparkle,
  PiStorefront,
} from 'react-icons/pi';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useRecurringTasks } from '../recurring-tasks/api';
import { useTrashUndoToast } from '../trash/trashUndoToast';

import { AgenturaDialog } from './components/AgenturaDialog';
import { MarketSection } from './components/MarketSection';
import { useAgentIndex } from './hooks/useAgentIndex';
import { useAgenturaPools } from './hooks/useAgenturaPools';
import { useMarketCards } from './hooks/useMarketCards';
import { AGENTURA_PATH, GRUENERATOREN_PATH, useMarketFilters } from './hooks/useMarketFilters';
import { useStarImport } from './hooks/useStarImport';
import { useSystemCatalog } from './hooks/useSystemCatalog';
import { useUserLibrary } from './hooks/useUserLibrary';
import {
  AGENTURA_TYPE_LABELS,
  SORT_LABELS,
  type AgenturaSort,
  type AgenturaType,
} from './lib/categories';
import { isLandesverbandIdentifier } from './lib/lookups';
import {
  foreignEntry,
  marketItemText,
  matchesQuery,
  ownEntry,
  recipeFromForm,
  recipeFromSkill,
  sortBy,
  type AgentEntry,
  type MarketItem,
  type RecipeEntry,
} from './lib/marketItems';
import { recipeOriginLine } from './recipes/recipeMeta';

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

/**
 * Ein Link in die Agentura merkt sich, dass er von hier kam — dann führt
 * Schließen per `navigate(-1)` zurück, statt einen neuen Eintrag anzuhängen, über
 * den „Zurück" das Popup wieder öffnen würde.
 */
const FROM_OVERVIEW = { fromOverview: true } as const;

/** Was die Übersicht unter dem offenen Popup zeigt — die Adresse gehört dann dem Shop. */
const UNFILTERED: { search: string; type: AgenturaType; sort: AgenturaSort } = {
  search: '',
  type: 'all',
  sort: 'empfohlen',
};

/**
 * Die Übersicht „Grüneratoren": womit die Person arbeitet — eigene Agents,
 * Rezepte und Aufgaben, was mit ihr geteilt wurde, und was sie aus der Agentura
 * zu ihren Grüneratoren geholt hat. Die Agentura selbst ist ein Popup darüber
 * (`marketOpen`, Adresse `/agentura`).
 */
function GrueneratorenPage({ marketOpen }: { marketOpen: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const filters = useMarketFilters();
  const { search, type, sort } = marketOpen ? UNFILTERED : filters;
  const [gridSize, toggleGridSize] = useGridSize('grueneratoren-grid-size', 'large');

  const pools = useAgenturaPools();
  const { userAgents, sharedAgents, sharedForeignAgents, ownRecipes, sharedRecipes } = pools;
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

  const deleteRecipe = useDeleteRecipe();
  const confirmDialog = useConfirm();
  const showTrashUndo = useTrashUndoToast();
  const library = useUserLibrary();
  const { toAgentItems, toRecipeItems, renderItem, asLibrary } = useMarketCards();

  const handleDeleteRecipe = async (form: TextForm) => {
    const confirmed = await confirmDialog({
      title: 'Rezept löschen?',
      description: `„${form.title}“ wird in den Papierkorb verschoben und kann 30 Tage lang wiederhergestellt werden.`,
    });
    if (!confirmed) return;
    // DELETE takes the mention; the trash addresses the row id.
    deleteRecipe.mutate(form.mention, {
      onSuccess: () => showTrashUndo({ kind: 'user_text_form', id: form.id, title: form.title }),
    });
  };

  const ownRecipeEntries = useMemo<RecipeEntry[]>(
    () =>
      ownRecipes.map((f) =>
        recipeFromForm(f, {
          editable: true,
          shareLabel: null,
          onDelete: () => {
            void handleDeleteRecipe(f);
          },
        })
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `handleDeleteRecipe` is recreated every render but only closes over `confirmDialog`/`deleteRecipe.mutate`/`showTrashUndo`, all stable, so omitting it changes nothing
    [ownRecipes]
  );
  const sharedRecipeEntries = useMemo<RecipeEntry[]>(
    () =>
      sharedRecipes.map((f) =>
        recipeFromForm(f, { editable: false, shareLabel: recipeOriginLine(f, 'shared') })
      ),
    [sharedRecipes]
  );

  // Was die Agentura anbietet, nach Verweis — dieselbe Sichtbarkeit wie dort:
  // Landesverbands-Inhalte nur mit Rolle (und erst nach deren Hydratation), damit
  // ein direkt über die Detailseite hinzugefügter oder nach Rollenverlust
  // verwaister LV-Eintrag hier nicht am Rollen-Gatter vorbei erscheint.
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
  const shopRecipes = useMemo(() => {
    const lv = catalog.rolesLoaded ? catalog.lvSkills : [];
    const general = catalog.allSkills.filter((s) => !isLandesverbandIdentifier(s.identifier));
    const map = new Map<string, RecipeEntry>();
    for (const skill of [...general, ...lv]) map.set(skill.mention, recipeFromSkill(skill));
    // Nutzer-Rezepte über die Zeilen-id: ihre Mention ist nur pro Besitzer eindeutig.
    for (const entry of pools.communityRecipeEntries) if (entry.id) map.set(entry.id, entry);
    return map;
  }, [catalog.allSkills, catalog.lvSkills, catalog.rolesLoaded, pools.communityRecipeEntries]);

  // Aus der Agentura geholt, aber nicht ohnehin schon eigen oder geteilt. Ein
  // Verweis, der auf nichts Sichtbares mehr zeigt (Agent gelöscht, nicht mehr
  // öffentlich, Rolle weg), fällt still heraus und bleibt in der Liste liegen —
  // wird er wieder sichtbar, ist er wieder da.
  const { addedAgents, addedRecipes } = useMemo(() => {
    const shownAgentKeys = new Set(
      [...userAgents, ...sharedForeignAgents.map((e) => e.agent)].map(agentKey)
    );
    const shownMentions = new Set(
      [...ownRecipeEntries, ...sharedRecipeEntries].map((e) => e.mention.toLowerCase())
    );
    const agents: AgentEntry[] = [];
    const recipes: RecipeEntry[] = [];
    for (const item of library.items) {
      if (item.kind === 'agent') {
        const entry = shopAgents.get(item.ref);
        if (entry && !shownAgentKeys.has(agentKey(entry.agent))) agents.push(entry);
      } else {
        const entry = shopRecipes.get(item.ref);
        if (entry && !shownMentions.has(entry.mention.toLowerCase())) recipes.push(entry);
      }
    }
    return { addedAgents: agents, addedRecipes: recipes };
  }, [
    library.items,
    shopAgents,
    shopRecipes,
    userAgents,
    sharedForeignAgents,
    ownRecipeEntries,
    sharedRecipeEntries,
  ]);

  const ownAgentKeys = useMemo(() => new Set(userAgents.map(agentKey)), [userAgents]);
  useStarImport({
    ready: library.loaded && pools.ownLoaded && pools.publicLoaded && catalog.rolesLoaded,
    library,
    shopAgents,
    shopRecipes,
    ownAgentKeys,
  });

  const sortRecipeEntries = (entries: RecipeEntry[]) => sortBy(entries, sort, (e) => e.title);

  const allItems: MarketItem[] = [
    ...toAgentItems(sortAgentEntries(userAgents.map(ownEntry), sort)),
    ...toRecipeItems(sortRecipeEntries(ownRecipeEntries)),
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
    ...toRecipeItems(sortRecipeEntries(sharedRecipeEntries)),
    ...asLibrary(toAgentItems(sortAgentEntries(addedAgents, sort))),
    ...asLibrary(toRecipeItems(sortRecipeEntries(addedRecipes))),
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
  const closeMarket = () => {
    const state = location.state as { fromOverview?: boolean } | null;
    if (state?.fromOverview) void navigate(-1);
    else void navigate(GRUENERATOREN_PATH, { replace: true });
  };
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
            du in der Agentura.
          </p>
        }
        toolbar={
          <>
            <PageHeroSearch
              query={search}
              onQuery={filters.setSearch}
              placeholder="Grüneratoren durchsuchen…"
            />
            <Button asChild variant="ghost" size="icon">
              <Link to={AGENTURA_PATH} state={FROM_OVERVIEW} aria-label="Agentura" title="Agentura">
                <PiStorefront aria-hidden className="size-[18px]" />
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Neu" title="Neu">
                  <PiPlus aria-hidden className="size-[18px]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate('/agents/new')}>
                  <PiSparkle />
                  <span>Agent</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/agentura/rezept/neu')}>
                  <PiFileText />
                  <span>Rezept</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/agents/new?mode=recurring')}>
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

      {/* Die Zahl steht nicht mehr sichtbar da, bleibt aber hörbar: ohne sie
          wechselt bei Suche oder Filter lautlos der Inhalt. */}
      <span role="status" aria-live="polite" className="sr-only">
        {`${items.length} ${items.length === 1 ? 'Eintrag' : 'Einträge'}`}
      </span>
      {!marketOpen && filters.isFiltered && (
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
          hint="Du hast noch keine eigenen Agents oder Rezepte erstellt. Leg los oder stöbere in der Agentura."
          action={
            <div className="flex flex-wrap items-center justify-center gap-sm">
              <Button asChild variant="brand" size="brand-sm">
                <Link to="/agents/new">
                  <PiPlus />
                  Agent erstellen
                </Link>
              </Button>
              <Button asChild variant="outline" size="brand-sm">
                <Link to="/agentura/rezept/neu">
                  <PiFileText />
                  Rezept erstellen
                </Link>
              </Button>
              <Button asChild variant="outline" size="brand-sm">
                <Link to={AGENTURA_PATH} state={FROM_OVERVIEW}>
                  <PiStorefront />
                  Zur Agentura
                </Link>
              </Button>
            </div>
          }
        />
      ) : (
        <GalleryEmptyState
          title={searching ? 'Keine Treffer' : 'Nichts gefunden'}
          hint={
            searching
              ? 'Bei deinen Grüneratoren ist nichts dabei — vielleicht in der Agentura.'
              : 'Versuch einen anderen Filter.'
          }
          action={
            <div className="flex flex-wrap items-center justify-center gap-sm">
              {searching && (
                <Button asChild variant="outline" size="sm">
                  <Link
                    to={`${AGENTURA_PATH}?q=${encodeURIComponent(search.trim())}`}
                    state={FROM_OVERVIEW}
                  >
                    In der Agentura suchen
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={filters.reset}>
                Filter zurücksetzen
              </Button>
            </div>
          }
        />
      )}

      <AgenturaDialog open={marketOpen} onClose={closeMarket} />
    </PageShell>
  );
}

/** Gives the recipe-delete flow a real AlertDialog instead of `useConfirm`'s
 *  degraded `window.confirm` fallback — mirrors `RecipeDetailPage`'s dispatcher. */
export function GrueneratorenView({ marketOpen = false }: { marketOpen?: boolean }) {
  return (
    <ConfirmDialogProvider>
      <GrueneratorenPage marketOpen={marketOpen} />
    </ConfirmDialogProvider>
  );
}

function GrueneratorenRoute() {
  return <GrueneratorenView />;
}

export default withAuthRequired(GrueneratorenRoute, { title: 'Grüneratoren' });
