import {
  agentsList,
  useHiddenAgentIdentifiers,
  useHiddenSkillMentions,
  useSkillFavoritesStore,
  useUserLandesverbaende,
  type AgentListItem,
} from '@gruenerator/chat';
import { type PublicTextForm, type RecurringTask, type TextForm } from '@gruenerator/contracts';
import {
  agenturaMetaLine,
  getAgentSlug,
  getVisibleSystemAgentsForLocale,
  isAdminVisibleAgent,
  isAdminVisibleSkill,
  isLvItemVisibleForRoles,
  isSkillOfferedIn,
  matchesAgenturaType,
  type Agent,
  type AgenturaType,
  type SkillCategory,
} from '@gruenerator/shared/agents';
import { sortByUsage, type UsageMap } from '@gruenerator/shared/utils';
import {
  Button,
  ConfirmDialogProvider,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  useConfirm,
} from '@gruenerator/ui';
import { useEffect, useMemo, type ReactNode } from 'react';
import {
  PiArrowsDownUp,
  PiClockCounterClockwise,
  PiFileText,
  PiMagnifyingGlass,
  PiPlus,
  PiRepeat,
  PiSparkle,
} from 'react-icons/pi';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { CURRENT_INSTANCE } from '../../config/instance';
import {
  useDeleteUserAgent,
  usePublicUserAgents,
  useSharedSystemAgents,
  useSharedUserAgents,
  useUserAgents,
  type SharedAgentEntry,
} from '../agents/api';
import { PhosphorIcon } from '../agents/icons/PhosphorIcon';
import { useRecurringTasks } from '../recurring-tasks/api';
import { useItemUsage } from '../usage/useItemUsage';
import { WorkplaceHero } from '../workplace/components/WorkplaceHero';

import { MarketCard } from './components/MarketCard';
import { RecurringTaskCard } from './components/RecurringTaskCard';
import { ShelfTabs } from './components/ShelfTabs';
import { TypeFilterRow } from './components/TypeFilterRow';
import { useDuplicateAgent } from './hooks/useDuplicateAgent';
import {
  AGENTURA_EMPTY_ICONS,
  AGENTURA_TYPE_VALUES,
  DEFAULT_CATEGORY,
  DEFAULT_TYPE,
  agenturaCategoriesForPlatform,
  SKILL_CATEGORY_LABELS,
  SKILL_CATEGORY_ORDER,
  SORT_LABELS,
  SORT_VALUES,
  type AgenturaCategory,
  type AgenturaCategoryKey,
  type AgenturaSort,
} from './lib/categories';
import { hasKnowledge, toolCount } from './lib/capabilities';
import { isLandesverbandIdentifier, landesverbandLabel, landesverbandRegion } from './lib/lookups';
import { pinnedFirst } from './lib/marketFilter';
import { useDeleteRecipe, useOwnRecipes, usePublicRecipes } from './recipes/api';
import { recipeOriginLine } from './recipes/recipeMeta';

import type { IconType } from 'react-icons';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
import PageContainer from '@/components/common/PageContainer';
import { getAgentIcon } from '@/components/layout/Sidebar/sidebarAgentConfig';
import { useFirstName } from '@/hooks/useFirstName';
import useAgentFavoritesStore from '@/stores/agentFavoritesStore';
import { useAuthStore } from '@/stores/authStore';

const FEATURED_LIMIT = 6;

const GRID =
  'grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-md max-md:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]';

function matchesQuery(haystack: string[], q: string): boolean {
  return haystack.some((v) => v.toLowerCase().includes(q));
}

function EmptyState({
  icon: Icon,
  text,
  action,
}: {
  icon: IconType;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-grey-300 bg-background-alt/40 p-2xl text-center dark:border-grey-700">
      <span className="mx-auto mb-sm flex h-12 w-12 items-center justify-center rounded-lg bg-hover-alt text-foreground-muted">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mx-auto max-w-[380px] text-sm text-foreground-muted">{text}</p>
      {action && (
        <div className="mt-md flex flex-wrap items-center justify-center gap-sm">{action}</div>
      )}
    </div>
  );
}

/**
 * Reorder a list per the active sort. `empfohlen` (the default) ranks by the
 * user's own usage when a `usage` option is supplied — most-recently/most-used
 * first, registry order for never-used — otherwise keeps registry order.
 */
function sortBy<T>(
  items: T[],
  sort: AgenturaSort,
  title: (t: T) => string,
  usage?: { getId: (t: T) => string; map: UsageMap }
): T[] {
  if (sort === 'az') return [...items].sort((a, b) => title(a).localeCompare(title(b)));
  if (usage) return sortByUsage(items, usage.getId, usage.map);
  return items;
}

/** Icon node for an agent chip — user agents use their chosen Phosphor `iconKey`. */
function AgentIcon({ agent, isUser }: { agent: Agent; isUser?: boolean }) {
  if (isUser) return <PhosphorIcon name={agent.iconKey ?? 'PiSparkle'} />;
  const Icon = getAgentIcon(agent.identifier);
  return <Icon />;
}

interface AgentEntry {
  agent: Agent;
  isUser: boolean;
  editable: boolean;
}

/**
 * One shape for every recipe card, whether it comes from the shipped catalogue
 * (`AgentListItem`) or from a user's own/shared/public row (`TextForm` /
 * `PublicTextForm`). `id` is `null` for catalogue skills — they have no row of
 * their own. `shareLabel` is the muted origin line ("Geteilt aus …" / "Von der
 * Basis …"), rendered in the card footer; `null` for one's own and for
 * catalogue skills.
 */
interface RecipeEntry {
  mention: string;
  title: string;
  description: string;
  icon: ReactNode;
  editable: boolean;
  id: string | null;
  shareLabel: string | null;
  /** Nur Katalog-Rezepte tragen einen Gang; eigene Rezepte haben keinen. */
  skillCategory?: SkillCategory;
  onDelete?: () => void;
}

/** A catalogue skill as a recipe card — never editable, no share label. */
function recipeFromSkill(skill: AgentListItem): RecipeEntry {
  const Icon = skill.icon ?? PiSparkle;
  return {
    mention: skill.mention,
    title: skill.title,
    description: skill.description,
    icon: <Icon />,
    editable: false,
    id: null,
    shareLabel: null,
    skillCategory: skill.skillCategory ?? 'sonstiges',
  };
}

/** A user recipe row (own, shared or public) as a recipe card. */
function recipeFromForm(
  form: TextForm | PublicTextForm,
  opts: { editable: boolean; shareLabel: string | null; onDelete?: () => void }
): RecipeEntry {
  return {
    mention: form.mention,
    title: form.title,
    description: form.description ?? '',
    icon: <PhosphorIcon name={form.iconKey ?? 'PiSparkle'} />,
    editable: opts.editable,
    id: form.id,
    shareLabel: opts.shareLabel,
    onDelete: opts.onDelete,
  };
}

/**
 * Eine Kachel im flachen Raster. Diskriminierte Union — nicht destrukturieren,
 * sonst verliert der Compiler die Verengung in den Zweigen.
 */
type MarketItem =
  | { kind: 'agent'; isFavorite: boolean; entry: AgentEntry }
  | { kind: 'recipe'; isFavorite: boolean; entry: RecipeEntry }
  | { kind: 'task'; isFavorite: boolean; task: RecurringTask };

function AgenturaPage() {
  const navigate = useNavigate();
  const firstName = useFirstName();
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('q') ?? '';
  const sort: AgenturaSort = SORT_VALUES.includes(searchParams.get('sort') as AgenturaSort)
    ? (searchParams.get('sort') as AgenturaSort)
    : 'empfohlen';
  const catParam = searchParams.get('cat') as AgenturaCategoryKey | null;
  const type: AgenturaType = AGENTURA_TYPE_VALUES.includes(
    searchParams.get('type') as AgenturaType
  )
    ? (searchParams.get('type') as AgenturaType)
    : DEFAULT_TYPE;

  const updateParam = (key: string, value: string, defaultValue: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (!value || value === defaultValue) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true }
    );
  };

  // Switching category always pins it explicitly (and clears any active search).
  // Auch beim Startregal: ohne `?cat=` ist die Adresse nicht die Ansicht, und ein
  // geteilter Link führte woanders hin als der Klick, aus dem er entstand.
  const selectCategory = (key: AgenturaCategoryKey) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('q');
        next.delete('type');
        next.set('cat', key);
        return next;
      },
      { replace: true }
    );
  };

  const favorites = useSkillFavoritesStore((s) => s.favorites);
  const toggleFavorite = useSkillFavoritesStore((s) => s.toggleFavorite);
  const { lvIds } = useUserLandesverbaende();

  const { data: userAgents = [] } = useUserAgents();
  const { data: sharedSystemAgents = [] } = useSharedSystemAgents();
  const { data: sharedUserAgents = [] } = useSharedUserAgents();
  const { data: publicAgents = [] } = usePublicUserAgents();
  const deleteUserAgent = useDeleteUserAgent();
  const userLocale = useAuthStore((s) => s.locale) ?? 'de-DE';
  const agentFavorites = useAgentFavoritesStore((s) => s.favoriteIdentifiers);
  const toggleAgentFavorite = useAgentFavoritesStore((s) => s.toggle);
  const recordFavoriteTitles = useAgentFavoritesStore((s) => s.recordTitles);
  const { data: agentUsage = {} } = useItemUsage('agent');
  const { data: recurringTasks = [] } = useRecurringTasks();

  const { data: ownAndSharedRecipes = [] } = useOwnRecipes(true);
  const { data: publicRecipes = [] } = usePublicRecipes();
  const deleteRecipe = useDeleteRecipe();
  const confirmDialog = useConfirm();
  const { duplicate: duplicateAgent } = useDuplicateAgent();

  const q = search.toLowerCase();

  const isAgentFav = (a: Agent) => agentFavorites.includes(a.identifier);

  // Group-shared agents are system + user-created agents, deduped by identifier.
  const sharedAgents = useMemo<SharedAgentEntry[]>(() => {
    const byIdentifier = new Map<string, SharedAgentEntry>();
    for (const entry of [...sharedSystemAgents, ...sharedUserAgents]) {
      if (!byIdentifier.has(entry.agent.identifier))
        byIdentifier.set(entry.agent.identifier, entry);
    }
    return [...byIdentifier.values()];
  }, [sharedSystemAgents, sharedUserAgents]);

  const hiddenSkillMentions = useHiddenSkillMentions();
  const hiddenAgentIdentifiers = useHiddenAgentIdentifiers();
  const hiddenAgentKey = hiddenAgentIdentifiers.join(',');

  // All skills available to this locale (unfiltered by search), minus any an
  // admin hid from discovery on this deployment and minus what this instance
  // does not carry at all.
  const allSkills = useMemo(
    () =>
      agentsList.filter(
        (s) =>
          (s.audience === undefined || s.audience === 'all' || s.audience === userLocale) &&
          isAdminVisibleSkill(s.mention, hiddenSkillMentions) &&
          isSkillOfferedIn(s, CURRENT_INSTANCE)
      ),
    [userLocale, hiddenSkillMentions]
  );

  // Public community agents ("Von der Basis"): owners still see their own listing,
  // but drop agents only reachable via a group share (and not owned).
  const communityAgents = useMemo(() => {
    const ownIds = new Set(userAgents.map((a) => a.identifier));
    const sharedIds = new Set(sharedAgents.map((e) => e.agent.identifier));
    return publicAgents.filter((a) => ownIds.has(a.identifier) || !sharedIds.has(a.identifier));
  }, [publicAgents, userAgents, sharedAgents]);

  // Own recipes ("Meine Rezepte"): genuinely own, custom-mention rows — a
  // preset/recipe override (`kind !== 'custom'`) has no identity of its own,
  // it just adjusts the matching catalogue skill and stays out of this list.
  // `useOwnRecipes` returns own AND shared-into-a-group rows in one list; the
  // two are told apart by `sharedFromGroup`.
  const ownRecipes = useMemo(
    () => ownAndSharedRecipes.filter((f) => f.kind === 'custom' && !f.sharedFromGroup),
    [ownAndSharedRecipes]
  );
  const sharedRecipes = useMemo(
    () => ownAndSharedRecipes.filter((f) => f.sharedFromGroup),
    [ownAndSharedRecipes]
  );
  // "Von der Basis": mirrors `communityAgents` exactly — owners still see
  // their own public listing, but a recipe only reachable via a group share
  // (not owned) is dropped: "Geteilt mit Gruppen" already shows it once, and
  // without this exception it would show a second time here.
  const communityRecipes = useMemo(() => {
    const ownMentions = new Set(ownRecipes.map((f) => f.mention));
    const sharedMentions = new Set(sharedRecipes.map((f) => f.mention));
    return publicRecipes.filter(
      (f) => ownMentions.has(f.mention) || !sharedMentions.has(f.mention)
    );
  }, [publicRecipes, ownRecipes, sharedRecipes]);

  const handleDeleteRecipe = async (form: TextForm) => {
    const confirmed = await confirmDialog({
      title: 'Rezept löschen?',
      description: `„${form.title}" wird dauerhaft entfernt — samt Beispielen und Anleitung.`,
    });
    if (!confirmed) return;
    deleteRecipe.mutate(form.mention);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `handleDeleteRecipe` is recreated every render but only closes over `confirmDialog`/`deleteRecipe.mutate`, both stable, so omitting it changes nothing
    [ownRecipes]
  );
  const sharedRecipeEntries = useMemo<RecipeEntry[]>(
    () =>
      sharedRecipes.map((f) =>
        recipeFromForm(f, { editable: false, shareLabel: recipeOriginLine(f, 'shared') })
      ),
    [sharedRecipes]
  );
  const communityRecipeEntries = useMemo<RecipeEntry[]>(
    () =>
      communityRecipes.map((f) =>
        recipeFromForm(f, { editable: false, shareLabel: recipeOriginLine(f, 'public') })
      ),
    [communityRecipes]
  );
  // Own, shared and public recipes deduped by mention — own wins. Feeds
  // favourites (a mention might be starred before its source is known) and
  // cross-category search.
  const allUserRecipeEntries = useMemo<RecipeEntry[]>(() => {
    const map = new Map<string, RecipeEntry>();
    for (const e of ownRecipeEntries) map.set(e.mention, e);
    for (const e of sharedRecipeEntries) if (!map.has(e.mention)) map.set(e.mention, e);
    for (const e of communityRecipeEntries) if (!map.has(e.mention)) map.set(e.mention, e);
    return [...map.values()];
  }, [ownRecipeEntries, sharedRecipeEntries, communityRecipeEntries]);

  const systemAgents = useMemo(() => {
    const sharedIds = new Set(sharedAgents.map((e) => e.agent.identifier));
    return getVisibleSystemAgentsForLocale(userLocale, CURRENT_INSTANCE).filter(
      (a) =>
        !sharedIds.has(a.identifier) && isAdminVisibleAgent(a.identifier, hiddenAgentIdentifiers)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- die Array-Identität wechselt bei jedem Abruf; `hiddenAgentKey` ist die stabile Abhängigkeit
  }, [userLocale, sharedAgents, hiddenAgentKey]);

  const generalSystemAgents = useMemo(
    () => systemAgents.filter((a) => !isLandesverbandIdentifier(a.identifier)),
    [systemAgents]
  );
  // Das Landesverbands-Regal ist persönlich: es zeigt die Agenten und Rezepte
  // des eigenen Landesverbands, nicht die aller elf. Die Zuordnung kommt aus
  // der Profilrolle „Mitarbeiter*in Landesgeschäftsstelle" (AT:
  // Landesorganisation). Ohne diese Rolle bleibt das Regal leer — die Zuteilung
  // IST der Zugang. Solange die Rollen noch nicht geladen sind, ist `lvIds`
  // `null` und es wird nicht gefiltert, damit das Regal nicht erst leer steht.
  const lvSystemAgents = useMemo(
    () =>
      systemAgents.filter(
        (a) =>
          isLandesverbandIdentifier(a.identifier) && isLvItemVisibleForRoles(a.identifier, lvIds)
      ),
    [systemAgents, lvIds]
  );
  const lvSkills = useMemo(
    () =>
      allSkills.filter(
        (s) =>
          isLandesverbandIdentifier(s.identifier) && isLvItemVisibleForRoles(s.identifier, lvIds)
      ),
    [allSkills, lvIds]
  );

  const favoriteSkills = useMemo(
    () => allSkills.filter((s) => favorites.includes(s.mention.toLowerCase())),
    [allSkills, favorites]
  );
  const favoriteUserRecipeEntries = useMemo(
    () => allUserRecipeEntries.filter((e) => favorites.includes(e.mention.toLowerCase())),
    [allUserRecipeEntries, favorites]
  );
  // Recipe search pool: own/shared/public (own wins) plus the catalogue,
  // deduped by mention. A custom mention never collides with a catalogue one
  // (presets/LV recipes have their own reserved keys), so this is mostly
  // belt-and-braces.
  const searchableRecipeEntries = useMemo<RecipeEntry[]>(() => {
    const map = new Map<string, RecipeEntry>();
    for (const e of allUserRecipeEntries) map.set(e.mention, e);
    for (const s of allSkills) if (!map.has(s.mention)) map.set(s.mention, recipeFromSkill(s));
    return [...map.values()];
  }, [allUserRecipeEntries, allSkills]);

  // Skills grouped by category (LV skills live in the Landesverbände aisle instead).
  const byCategory = useMemo(() => {
    const map = new Map<string, AgentListItem[]>();
    for (const skill of allSkills) {
      if (isLandesverbandIdentifier(skill.identifier)) continue;
      const cat = skill.skillCategory ?? 'sonstiges';
      const list = map.get(cat) ?? [];
      list.push(skill);
      map.set(cat, list);
    }
    return map;
  }, [allSkills]);

  const featuredAgents = useMemo(() => {
    const pinned = generalSystemAgents.filter((a) => a.pinnedToSidebar);
    const pool = pinned.length > 0 ? pinned : generalSystemAgents;
    return pool.slice(0, FEATURED_LIMIT);
  }, [generalSystemAgents]);

  // All agents deduped across pools — used for favourites + cross-category search.
  const allAgentEntries = useMemo<AgentEntry[]>(() => {
    const map = new Map<string, AgentEntry>();
    for (const a of userAgents) map.set(a.identifier, { agent: a, isUser: true, editable: true });
    for (const e of sharedAgents)
      if (!map.has(e.agent.identifier))
        map.set(e.agent.identifier, { agent: e.agent, isUser: false, editable: false });
    for (const a of communityAgents)
      if (!map.has(a.identifier))
        map.set(a.identifier, { agent: a, isUser: false, editable: false });
    for (const a of systemAgents)
      if (!map.has(a.identifier))
        map.set(a.identifier, { agent: a, isUser: false, editable: false });
    return [...map.values()];
  }, [userAgents, sharedAgents, communityAgents, systemAgents]);

  const favoriteAgents = useMemo(
    () => allAgentEntries.filter((e) => agentFavorites.includes(e.agent.identifier)),
    [allAgentEntries, agentFavorites]
  );

  // The Agentura is the one place that sees every kind of agent at once, so it
  // is where the sidebar's title snapshots get refreshed — this also backfills
  // favourites starred before the store carried titles.
  useEffect(() => {
    recordFavoriteTitles(
      Object.fromEntries(favoriteAgents.map((e) => [e.agent.identifier, e.agent.title]))
    );
  }, [favoriteAgents, recordFavoriteTitles]);

  const handleSelectRecipe = (mention: string) => {
    void navigate(`/agentura/rezept/${encodeURIComponent(mention)}`);
  };
  const handleSelectAgent = (agent: Agent) => {
    void navigate(`/agentura/agent/${encodeURIComponent(getAgentSlug(agent.identifier))}`);
  };
  const handleEditAgent = (agent: Agent) => {
    void navigate(`/agents/${agent.identifier}/edit`);
  };
  const handleDeleteAgent = (agent: Agent) => {
    if (!confirm(`Möchtest du "${agent.title}" wirklich löschen?`)) return;
    deleteUserAgent.mutate(agent.identifier);
  };

  // --- Item + card construction ---------------------------------------------
  const ownEntry = (agent: Agent): AgentEntry => ({ agent, isUser: true, editable: true });
  const foreignEntry = (agent: Agent): AgentEntry => ({ agent, isUser: false, editable: false });

  const toAgentItems = (entries: AgentEntry[]): MarketItem[] =>
    entries.map((entry) => ({
      kind: 'agent' as const,
      isFavorite: isAgentFav(entry.agent),
      entry,
    }));
  const toRecipeItems = (entries: RecipeEntry[]): MarketItem[] =>
    entries.map((entry) => ({
      kind: 'recipe' as const,
      isFavorite: favorites.includes(entry.mention.toLowerCase()),
      entry,
    }));
  const toTaskItem = (task: RecurringTask): MarketItem => ({
    kind: 'task' as const,
    isFavorite: false,
    task,
  });

  /** „Agent · 5 Tools · Wissen" — die Zeile, die den Typ-Badge ersetzt. */
  const agentMeta = (agent: Agent): string => {
    const tools = toolCount(agent);
    return agenturaMetaLine([
      'Grünerator',
      tools > 0 && `${tools} Tools`,
      hasKnowledge(agent) && 'Wissen',
      isLandesverbandIdentifier(agent.identifier) && landesverbandLabel(agent.identifier),
    ]);
  };

  /** Für Rezepte gibt es keine Schrittzahl im Datenmodell — die Herkunft ist
   *  die ehrlichere Auskunft: Kategorie, Projekt oder Basis. */
  const recipeMeta = (entry: RecipeEntry): string =>
    agenturaMetaLine([
      'Rezept',
      entry.shareLabel ?? (entry.skillCategory && SKILL_CATEGORY_LABELS[entry.skillCategory]),
    ]);

  const agentCard = (entry: AgentEntry, isFavorite: boolean): ReactNode => (
    <MarketCard
      key={`a-${entry.agent.identifier}`}
      icon={<AgentIcon agent={entry.agent} isUser={entry.isUser} />}
      title={entry.agent.title}
      meta={agentMeta(entry.agent)}
      description={entry.agent.description}
      onSelect={() => handleSelectAgent(entry.agent)}
      isFavorite={isFavorite}
      onToggleFavorite={() => toggleAgentFavorite(entry.agent.identifier, entry.agent.title)}
      onEdit={entry.editable ? () => handleEditAgent(entry.agent) : undefined}
      onDuplicate={
        entry.editable
          ? () => {
              void duplicateAgent(entry.agent);
            }
          : undefined
      }
      onDelete={entry.editable ? () => handleDeleteAgent(entry.agent) : undefined}
    />
  );

  /** One card renderer for every recipe, catalogue or user's own/shared/public. */
  const recipeCard = (entry: RecipeEntry, isFavorite: boolean): ReactNode => (
    <MarketCard
      key={`s-${entry.id ?? entry.mention}`}
      icon={entry.icon}
      title={entry.title}
      meta={recipeMeta(entry)}
      description={entry.description}
      onSelect={() => handleSelectRecipe(entry.mention)}
      isFavorite={isFavorite}
      onToggleFavorite={() => toggleFavorite(entry.mention)}
      onEdit={
        entry.editable
          ? () => navigate(`/agentura/rezept/${encodeURIComponent(entry.mention)}/bearbeiten`)
          : undefined
      }
      onDelete={entry.onDelete}
    />
  );

  /** Die Union wird nicht destrukturiert — jeder Zweig verengt über `item.kind`. */
  const renderItem = (item: MarketItem): ReactNode => {
    if (item.kind === 'agent') return agentCard(item.entry, item.isFavorite);
    if (item.kind === 'recipe') return recipeCard(item.entry, item.isFavorite);
    return <RecurringTaskCard key={`r-${item.task.id}`} task={item.task} />;
  };

  const sortAgentEntries = (entries: AgentEntry[]) => {
    const sorted = sortBy(entries, sort, (e) => e.agent.title, {
      getId: (e) => e.agent.identifier,
      map: agentUsage,
    });
    return sort === 'empfohlen' ? pinnedFirst(sorted, (e) => Boolean(e.agent.pinnedToSidebar)) : sorted;
  };
  const sortSkills = (skills: AgentListItem[]) => sortBy(skills, sort, (s) => s.title);
  const sortRecipeEntries = (entries: RecipeEntry[]) => sortBy(entries, sort, (e) => e.title);

  /**
   * Ein Regal ist eine flache Liste — keine Abschnitte mehr.
   *
   * Vorher zerfiel jedes Regal in überschriebene Unterabschnitte („Empfohlen",
   * „Weitere", fünf Rezept-Gänge, „Geteilt mit Gruppen"). Das ordnete die Seite
   * zwar, zwang aber jede Suche nach einer Gattung durch alle Abschnitte. Diese
   * Aufgabe hat jetzt der Typ-Filter, und das Raster bleibt ein Raster.
   *
   * `empfohlen` kommt hier nie an: das Regal ist mobil-only (Registry), und die
   * Regalliste dieser Seite kommt aus `agenturaCategoriesForPlatform('web')`.
   */
  const itemsFor = (key: AgenturaCategoryKey): MarketItem[] => {
    if (key === 'meine')
      return [
        ...toAgentItems(sortAgentEntries(userAgents.map(ownEntry))),
        ...toRecipeItems(sortRecipeEntries(ownRecipeEntries)),
        ...recurringTasks.map(toTaskItem),
        // Geteiltes steht ohne eigene Überschrift mitten drin: für die
        // empfangende Person ist es Teil dessen, womit sie arbeitet. Woher es
        // kommt, sagt die Meta-Zeile der Kachel.
        ...toAgentItems(sortAgentEntries(sharedAgents.map((e) => foreignEntry(e.agent)))),
        ...toRecipeItems(sortRecipeEntries(sharedRecipeEntries)),
      ];

    if (key === 'landesverband') {
      // Nach Region statt nach Nutzung: bei mehreren Zuteilungen sollen die
      // Sachen eines Verbands beieinanderstehen.
      const byRegion = <T,>(items: T[], identifier: (t: T) => string): T[] =>
        [...items].sort((a, b) =>
          landesverbandRegion(identifier(a)).localeCompare(landesverbandRegion(identifier(b)))
        );
      return [
        ...toAgentItems(byRegion(lvSystemAgents, (a) => a.identifier).map(foreignEntry)),
        ...toRecipeItems(byRegion(lvSkills, (s) => s.identifier).map(recipeFromSkill)),
      ];
    }

    if (key === 'community')
      return [
        ...toAgentItems(sortAgentEntries(communityAgents.map(foreignEntry))),
        ...toRecipeItems(sortRecipeEntries(communityRecipeEntries)),
      ];

    if (key === 'gruenerator') {
      const catalogue = SKILL_CATEGORY_ORDER.flatMap((cat) =>
        sortSkills(byCategory.get(cat) ?? []).map(recipeFromSkill)
      );
      return [
        ...toAgentItems(sortAgentEntries(generalSystemAgents.map(foreignEntry))),
        ...toRecipeItems(catalogue),
      ];
    }

    // `favoriten` ist im Web kein Regal mehr (Registry: `platforms: []`), der
    // Schlüssel bleibt aber in der Union — dieser Zweig hält sie vollständig.
    return [
      ...toAgentItems(sortAgentEntries(favoriteAgents)),
      ...toRecipeItems(sortRecipeEntries(favoriteSkills.map(recipeFromSkill))),
      ...toRecipeItems(sortRecipeEntries(favoriteUserRecipeEntries)),
    ];
  };

  const skillTotal = useMemo(
    () => [...byCategory.values()].reduce((sum, list) => sum + list.length, 0),
    [byCategory]
  );

  const countFor = (key: AgenturaCategoryKey): number => {
    switch (key) {
      case 'empfohlen':
        // Mobil-only; im Web zählt diese Auswahl in `gruenerator` mit.
        return featuredAgents.length;
      case 'meine':
        return (
          userAgents.length +
          recurringTasks.length +
          sharedAgents.length +
          ownRecipes.length +
          sharedRecipes.length
        );
      case 'landesverband':
        return lvSystemAgents.length + lvSkills.length;
      case 'community':
        return communityAgents.length + communityRecipeEntries.length;
      case 'gruenerator':
        return generalSystemAgents.length + skillTotal;
      case 'favoriten':
        return favoriteAgents.length + favoriteSkills.length + favoriteUserRecipeEntries.length;
    }
  };

  // "meine" and "community" stay visible even when empty (CTA / empty state);
  // every other category appears only once it has entries. Für „Dein
  // Landesverband" ist das die Zuteilung selbst: ohne Rolle kein Regal.
  const isVisible = (cat: AgenturaCategory): boolean =>
    cat.key === 'meine' || cat.key === 'community' || countFor(cat.key) > 0;

  const webCategories = useMemo(() => agenturaCategoriesForPlatform('web'), []);
  const visibleCategories = webCategories.filter(isVisible);

  const requestedCat = catParam && webCategories.some((c) => c.key === catParam) ? catParam : null;
  // Der Markt öffnet immer auf „Meine Grüneratoren" (`DEFAULT_CATEGORY`), egal
  // ob jemand schon eigene besitzt. Ein ausdrückliches ?cat= gewinnt — ein
  // veralteter Link auf ein abgeschafftes Regal (`empfohlen`, `gruppen`) landet
  // damit ebenfalls hier statt auf einer leeren Seite.
  const activeCat: AgenturaCategoryKey =
    requestedCat && visibleCategories.some((c) => c.key === requestedCat)
      ? requestedCat
      : (visibleCategories.find((c) => c.key === DEFAULT_CATEGORY)?.key ??
        visibleCategories[0]?.key ??
        DEFAULT_CATEGORY);

  // Cross-category search results (agents + recipes), overriding the shelf
  // view. Recipes cover the catalogue and every own/shared/public row, deduped
  // by mention (own wins) in `searchableRecipeEntries`.
  const searchItems: MarketItem[] = useMemo(() => {
    if (!q) return [];
    const agents = sortAgentEntries(
      allAgentEntries.filter((e) =>
        matchesQuery([e.agent.title, e.agent.identifier, e.agent.description], q)
      )
    );
    const recipes = sortRecipeEntries(
      searchableRecipeEntries.filter((e) => matchesQuery([e.title, e.mention, e.description], q))
    );
    return [...toAgentItems(agents), ...toRecipeItems(recipes)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, allAgentEntries, searchableRecipeEntries, sort, agentFavorites, favorites]);

  const activeCategory = webCategories.find((c) => c.key === activeCat);
  const searching = q.length > 0;
  // Der Typ-Filter greift auf beides — Regal wie Suchergebnis. Eine Suche, die
  // den gesetzten Filter ignoriert, liefert sonst Karten, die das Regal darunter
  // gerade ausblendet.
  const shelfItems = searching ? searchItems : itemsFor(activeCat);
  const items = shelfItems.filter((item) => matchesAgenturaType(type, item));
  // „Leer" heißt zweierlei: das Regal ist leer, oder der Typ-Filter hat es
  // leergeräumt. Nur im zweiten Fall hilft der Hinweis auf „Alle".
  const filteredOut = shelfItems.length > 0 && items.length === 0;

  const EmptyIcon = searching
    ? PiMagnifyingGlass
    : (AGENTURA_EMPTY_ICONS[activeCat] ?? PiMagnifyingGlass);
  const emptyText = filteredOut
    ? 'Hier gibt es nichts dieser Art. Wähl oben „Alle", um wieder alles zu sehen.'
    : searching
      ? 'Keine Treffer für deine Suche. Versuch ein anderes Stichwort.'
      : (activeCategory?.emptyText ?? 'Hier ist gerade nichts vorhanden.');

  return (
    <PageContainer maxWidth="lg" noPadTop>
      <WorkplaceHero title={firstName ? `Deine Grüneratoren, ${firstName}` : 'Deine Grüneratoren'}>
        <div className="relative mx-auto max-w-[560px]">
          <PiMagnifyingGlass className="pointer-events-none absolute left-md top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
          <Input
            type="text"
            value={search}
            onChange={(e) => updateParam('q', e.target.value, '')}
            placeholder="Im Markt suchen…"
            className="h-11 rounded-full pl-[2.5rem]"
            autoFocus
          />
        </div>
      </WorkplaceHero>

      <section className="mb-lg mt-xl">
        <ShelfTabs
          categories={visibleCategories}
          active={searching ? null : activeCat}
          onSelect={selectCategory}
        />
      </section>

      {/* Sortierung — Typ-Filter — Neu. Auf Mobil stapeln die drei: in einer
          geteilten Zeile bleibt für die mittlere Gruppe kein Platz. */}
      <div className="mb-lg grid items-center gap-sm sm:grid-cols-[1fr_auto_1fr]">
        <div className="flex justify-start max-sm:order-2">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Sortierung: ${SORT_LABELS[sort]} — umschalten auf ${
              SORT_LABELS[sort === 'empfohlen' ? 'az' : 'empfohlen']
            }`}
            onClick={() => updateParam('sort', sort === 'empfohlen' ? 'az' : 'empfohlen', 'empfohlen')}
          >
            <PiArrowsDownUp aria-hidden="true" />
            {SORT_LABELS[sort]}
          </Button>
        </div>
        <div className="flex justify-center max-sm:order-1 max-sm:justify-start">
          <TypeFilterRow active={type} onSelect={(t) => updateParam('type', t, DEFAULT_TYPE)} />
        </div>
        <div className="flex justify-end max-sm:order-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="brand" size="brand-sm">
                <PiPlus />
                Neu
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate('/agents/new')}>
                <PiSparkle />
                <span>Grünerator</span>
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
                  Fehlertexte und Ergebnisse stehen auf /wiederkehrend. Der
                  Einstieg lag vorher an der Abschnittsüberschrift, die es im
                  flachen Raster nicht mehr gibt. */}
              <DropdownMenuItem onClick={() => navigate('/wiederkehrend')}>
                <PiClockCounterClockwise />
                <span>Verlauf &amp; Steuerung</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Der Zähler stand vorher als Badge im Titelblock, den der Entwurf nicht
          mehr hat. Er bleibt hörbar: ohne ihn wechselt bei Suche oder Filter
          lautlos der Inhalt. */}
      <span role="status" aria-live="polite" className="sr-only">
        {`${items.length} ${items.length === 1 ? 'Eintrag' : 'Einträge'}`}
      </span>

      {items.length > 0 ? (
        <div className={GRID}>{items.map(renderItem)}</div>
      ) : (
        <EmptyState
          icon={EmptyIcon}
          text={emptyText}
          action={
            !searching && !filteredOut && activeCat === 'meine' ? (
              <>
                <Button asChild variant="brand" size="brand-sm">
                  <Link to="/agents/new">
                    <PiPlus />
                    Grünerator erstellen
                  </Link>
                </Button>
                <Button asChild variant="outline" size="brand-sm">
                  <Link to="/agentura/rezept/neu">
                    <PiFileText />
                    Rezept erstellen
                  </Link>
                </Button>
              </>
            ) : undefined
          }
        />
      )}
    </PageContainer>
  );
}

/** Gives the recipe-delete flow a real AlertDialog instead of `useConfirm`'s
 *  degraded `window.confirm` fallback — mirrors `RecipeDetailPage`'s dispatcher. */
function AgenturaPageWithConfirm() {
  return (
    <ConfirmDialogProvider>
      <AgenturaPage />
    </ConfirmDialogProvider>
  );
}

export default withAuthRequired(AgenturaPageWithConfirm, { title: 'Agentura' });
