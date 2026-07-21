import { agentsList, useSkillFavoritesStore, type AgentListItem } from '@gruenerator/chat';
import {
  getAgentSlug,
  getVisibleSystemAgentsForLocale,
  type Agent,
} from '@gruenerator/shared/agents';
import { sortByUsage, type UsageMap } from '@gruenerator/shared/utils';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gruenerator/ui';
import { useMemo, type ReactNode } from 'react';
import {
  PiArrowsDownUp,
  PiDetective,
  PiMagnifyingGlass,
  PiMapPin,
  PiPlus,
  PiRepeat,
  PiSparkle,
} from 'react-icons/pi';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

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

import { CapabilityTags } from './components/CapabilityTags';
import { CategoryNav, type AisleNavItem } from './components/CategoryNav';
import { MarketCard } from './components/MarketCard';
import { RecurringTaskCard } from './components/RecurringTaskCard';
import {
  AGENTURA_CATEGORIES,
  DEFAULT_CATEGORY,
  SKILL_CATEGORY_ICONS,
  SKILL_CATEGORY_LABELS,
  SKILL_CATEGORY_ORDER,
  SORT_LABELS,
  SORT_VALUES,
  type AgenturaCategory,
  type AgenturaCategoryKey,
  type AgenturaSort,
} from './lib/categories';
import { isLandesverbandIdentifier, landesverbandRegion } from './lib/lookups';

import type { IconType } from 'react-icons';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
import PageContainer from '@/components/common/PageContainer';
import { getAgentIcon } from '@/components/layout/Sidebar/sidebarAgentConfig';
import useAgentFavoritesStore from '@/stores/agentFavoritesStore';
import { useAuthStore } from '@/stores/authStore';

const FEATURED_LIMIT = 6;

const GRID =
  'grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-md max-md:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]';

function matchesQuery(haystack: string[], q: string): boolean {
  return haystack.some((v) => v.toLowerCase().includes(q));
}

function EmptyState({ icon: Icon, text }: { icon: IconType; text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-grey-300 bg-background-alt/40 p-2xl text-center dark:border-grey-700">
      <span className="mx-auto mb-sm flex h-12 w-12 items-center justify-center rounded-lg bg-hover-alt text-foreground-muted">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mx-auto max-w-[380px] text-sm text-foreground-muted">{text}</p>
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

interface MarketSection {
  key: string;
  heading?: string;
  icon?: IconType;
  action?: ReactNode;
  cards: ReactNode[];
  /** Muted line shown when this headed section has no cards. */
  emptyHint?: string;
}

function AgenturaPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('q') ?? '';
  const sort: AgenturaSort = SORT_VALUES.includes(searchParams.get('sort') as AgenturaSort)
    ? (searchParams.get('sort') as AgenturaSort)
    : 'empfohlen';
  const catParam = searchParams.get('cat') as AgenturaCategoryKey | null;

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
  // A bare param is resolved dynamically (own agents → "meine", else "empfohlen"),
  // so we must not drop it — otherwise "Empfohlen" would be unreachable for users
  // who own agents.
  const selectCategory = (key: AgenturaCategoryKey) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('q');
        next.set('cat', key);
        return next;
      },
      { replace: true }
    );
  };

  const favorites = useSkillFavoritesStore((s) => s.favorites);
  const toggleFavorite = useSkillFavoritesStore((s) => s.toggleFavorite);

  const { data: userAgents = [] } = useUserAgents();
  const { data: sharedSystemAgents = [] } = useSharedSystemAgents();
  const { data: sharedUserAgents = [] } = useSharedUserAgents();
  const { data: publicAgents = [] } = usePublicUserAgents();
  const deleteUserAgent = useDeleteUserAgent();
  const userLocale = useAuthStore((s) => s.locale) ?? 'de-DE';
  const agentFavorites = useAgentFavoritesStore((s) => s.favoriteIdentifiers);
  const toggleAgentFavorite = useAgentFavoritesStore((s) => s.toggle);
  const { data: agentUsage = {} } = useItemUsage('agent');
  const { data: recurringTasks = [] } = useRecurringTasks();

  const q = search.toLowerCase();

  const isSkillFav = (s: AgentListItem) => favorites.includes(s.mention.toLowerCase());
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

  // All skills available to this locale (unfiltered by search).
  const allSkills = useMemo(
    () =>
      agentsList.filter(
        (s) =>
          Boolean(s.skillSystemPrompt) &&
          (s.audience === undefined || s.audience === 'all' || s.audience === userLocale)
      ),
    [userLocale]
  );

  // Public community agents ("Von der Basis"): owners still see their own listing,
  // but drop agents only reachable via a group share (and not owned).
  const communityAgents = useMemo(() => {
    const ownIds = new Set(userAgents.map((a) => a.identifier));
    const sharedIds = new Set(sharedAgents.map((e) => e.agent.identifier));
    return publicAgents.filter((a) => ownIds.has(a.identifier) || !sharedIds.has(a.identifier));
  }, [publicAgents, userAgents, sharedAgents]);

  const systemAgents = useMemo(() => {
    const sharedIds = new Set(sharedAgents.map((e) => e.agent.identifier));
    return getVisibleSystemAgentsForLocale(userLocale).filter((a) => !sharedIds.has(a.identifier));
  }, [userLocale, sharedAgents]);

  const generalSystemAgents = useMemo(
    () => systemAgents.filter((a) => !isLandesverbandIdentifier(a.identifier)),
    [systemAgents]
  );
  const lvSystemAgents = useMemo(
    () => systemAgents.filter((a) => isLandesverbandIdentifier(a.identifier)),
    [systemAgents]
  );
  const lvSkills = useMemo(
    () => allSkills.filter((s) => isLandesverbandIdentifier(s.identifier)),
    [allSkills]
  );

  const favoriteSkills = useMemo(
    () => allSkills.filter((s) => favorites.includes(s.mention.toLowerCase())),
    [allSkills, favorites]
  );

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

  const handleSelectSkill = (skill: AgentListItem) => {
    void navigate(`/agentura/skill/${encodeURIComponent(skill.mention)}`);
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

  // --- Card renderers -------------------------------------------------------
  const agentCard = (entry: AgentEntry): ReactNode => (
    <MarketCard
      key={`a-${entry.agent.identifier}`}
      icon={<AgentIcon agent={entry.agent} isUser={entry.isUser} />}
      title={entry.agent.title}
      kind="agent"
      description={entry.agent.description}
      onSelect={() => handleSelectAgent(entry.agent)}
      isFavorite={isAgentFav(entry.agent)}
      onToggleFavorite={() => toggleAgentFavorite(entry.agent.identifier)}
      footer={<CapabilityTags agent={entry.agent} />}
      onEdit={entry.editable ? () => handleEditAgent(entry.agent) : undefined}
      onDelete={entry.editable ? () => handleDeleteAgent(entry.agent) : undefined}
    />
  );

  const skillCard = (skill: AgentListItem): ReactNode => {
    const Icon = skill.icon ?? PiSparkle;
    return (
      <MarketCard
        key={`s-${skill.mention}`}
        icon={<Icon />}
        title={skill.title}
        kind="skill"
        description={skill.description}
        onSelect={() => handleSelectSkill(skill)}
        isFavorite={isSkillFav(skill)}
        onToggleFavorite={() => toggleFavorite(skill.mention)}
      />
    );
  };

  const sortAgentEntries = (entries: AgentEntry[]) =>
    sortBy(entries, sort, (e) => e.agent.title, {
      getId: (e) => e.agent.identifier,
      map: agentUsage,
    });
  const sortSkills = (skills: AgentListItem[]) => sortBy(skills, sort, (s) => s.title);

  // Landesverband agent + skill cards, grouped by region (agents before skills).
  const lvCards = (): ReactNode[] =>
    [
      ...lvSystemAgents.map((agent) => ({
        region: landesverbandRegion(agent.identifier),
        order: 0,
        node: agentCard({ agent, isUser: false, editable: false }),
      })),
      ...lvSkills.map((skill) => ({
        region: landesverbandRegion(skill.identifier),
        order: 1,
        node: skillCard(skill),
      })),
    ]
      .sort((a, b) => a.region.localeCompare(b.region) || a.order - b.order)
      .map((e) => e.node);

  // A market aisle renders as one or more sections; only `gruenerator` and `meine`
  // use headed sub-sections, every other aisle is a single unheaded card grid.
  const sectionsFor = (key: AgenturaCategoryKey): MarketSection[] => {
    if (key === 'empfohlen')
      return [
        {
          key: 'empfohlen',
          cards: sortAgentEntries(
            featuredAgents.map((a) => ({ agent: a, isUser: false, editable: false }))
          ).map(agentCard),
        },
      ];
    if (key === 'meine')
      return [
        {
          key: 'meine-agents',
          cards: sortAgentEntries(
            userAgents.map((a) => ({ agent: a, isUser: true, editable: true }))
          ).map(agentCard),
        },
        {
          key: 'meine-recurring',
          heading: 'Wiederkehrende Aufgaben',
          icon: PiRepeat,
          action: (
            <Link
              to="/agents/new?mode=recurring"
              className="inline-flex items-center gap-xs text-sm font-medium text-secondary-700 hover:underline dark:text-secondary-300"
            >
              <PiPlus className="h-4 w-4" />
              Neue wiederkehrende Aufgabe
            </Link>
          ),
          cards: recurringTasks.map((task) => (
            <RecurringTaskCard key={`r-${task.id}`} task={task} />
          )),
          emptyHint:
            'Noch keine wiederkehrenden Aufgaben. Lass einen Grünerator regelmäßig automatisch arbeiten (experimentell).',
        },
      ];
    if (key === 'gruppen')
      return [
        {
          key: 'gruppen',
          cards: sortAgentEntries(
            sharedAgents.map((e) => ({ agent: e.agent, isUser: false, editable: false }))
          ).map(agentCard),
        },
      ];
    if (key === 'community')
      return [
        {
          key: 'community',
          cards: sortAgentEntries(
            communityAgents.map((a) => ({ agent: a, isUser: false, editable: false }))
          ).map(agentCard),
        },
      ];
    if (key === 'gruenerator') {
      const sections: MarketSection[] = [
        {
          key: 'off-agents',
          cards: sortAgentEntries(
            generalSystemAgents.map((a) => ({ agent: a, isUser: false, editable: false }))
          ).map(agentCard),
        },
      ];
      const lv = lvCards();
      if (lv.length)
        sections.push({ key: 'off-lv', heading: 'Landesverbände', icon: PiMapPin, cards: lv });
      for (const cat of SKILL_CATEGORY_ORDER) {
        const cards = sortSkills(byCategory.get(cat) ?? []).map(skillCard);
        if (cards.length)
          sections.push({
            key: `off-${cat}`,
            heading: SKILL_CATEGORY_LABELS[cat],
            icon: SKILL_CATEGORY_ICONS[cat],
            cards,
          });
      }
      return sections;
    }
    // favoriten
    return [
      {
        key: 'favoriten',
        cards: [
          ...sortAgentEntries(favoriteAgents).map(agentCard),
          ...sortSkills(favoriteSkills).map(skillCard),
        ],
      },
    ];
  };

  const skillTotal = useMemo(
    () => [...byCategory.values()].reduce((sum, list) => sum + list.length, 0),
    [byCategory]
  );

  const countFor = (key: AgenturaCategoryKey): number => {
    switch (key) {
      case 'empfohlen':
        return featuredAgents.length;
      case 'meine':
        return userAgents.length + recurringTasks.length;
      case 'gruppen':
        return sharedAgents.length;
      case 'community':
        return communityAgents.length;
      case 'gruenerator':
        return generalSystemAgents.length + lvSystemAgents.length + lvSkills.length + skillTotal;
      case 'favoriten':
        return favoriteAgents.length + favoriteSkills.length;
    }
  };

  // "meine" and "community" stay visible even when empty (CTA / empty state);
  // every other category appears only once it has entries.
  const isVisible = (cat: AgenturaCategory): boolean =>
    cat.key === 'meine' || cat.key === 'community' || countFor(cat.key) > 0;

  const visibleCategories = AGENTURA_CATEGORIES.filter(isVisible);

  const requestedCat =
    catParam && AGENTURA_CATEGORIES.some((c) => c.key === catParam) ? catParam : null;
  // Once a user owns Grüneratoren, the market opens on "Meine Grüneratoren";
  // otherwise on "Empfohlen". An explicit ?cat= always wins.
  const fallbackCat: AgenturaCategoryKey =
    userAgents.length > 0 && visibleCategories.some((c) => c.key === 'meine')
      ? 'meine'
      : DEFAULT_CATEGORY;
  const activeCat: AgenturaCategoryKey =
    requestedCat && visibleCategories.some((c) => c.key === requestedCat)
      ? requestedCat
      : (visibleCategories.find((c) => c.key === fallbackCat)?.key ??
        visibleCategories[0]?.key ??
        DEFAULT_CATEGORY);

  const navItems: AisleNavItem[] = visibleCategories.map((c) => ({
    key: c.key,
    label: c.label,
    icon: c.icon,
    count: countFor(c.key),
  }));

  // Cross-category search results (agents + skills), overriding the category view.
  const searchCards: ReactNode[] = useMemo(() => {
    if (!q) return [];
    const agents = sortAgentEntries(
      allAgentEntries.filter((e) =>
        matchesQuery([e.agent.title, e.agent.identifier, e.agent.description], q)
      )
    );
    const skills = sortSkills(
      allSkills.filter((s) => matchesQuery([s.title, s.mention, s.description], q))
    );
    return [...agents.map(agentCard), ...skills.map(skillCard)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, allAgentEntries, allSkills, sort, agentFavorites, favorites]);

  const activeCategory = AGENTURA_CATEGORIES.find((c) => c.key === activeCat);
  const searching = q.length > 0;
  const sections = searching ? [] : sectionsFor(activeCat);
  const totalCards = searching
    ? searchCards.length
    : sections.reduce((sum, s) => sum + s.cards.length, 0);
  const headerCount = searching ? searchCards.length : totalCards;

  const title = searching ? 'Suchergebnisse' : (activeCategory?.label ?? '');
  const description = searching
    ? `Treffer für „${search.trim()}" über alle Kategorien.`
    : (activeCategory?.description ?? '');

  const EmptyIcon = searching
    ? PiMagnifyingGlass
    : (activeCategory?.emptyIcon ?? PiMagnifyingGlass);
  const emptyText = searching
    ? 'Keine Treffer für deine Suche. Versuch ein anderes Stichwort.'
    : (activeCategory?.emptyText ?? 'Hier ist gerade nichts vorhanden.');

  return (
    <PageContainer maxWidth="lg">
      <header className="mb-lg">
        <div className="flex items-center gap-sm">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary-600/10 text-secondary-700 dark:text-secondary-300">
            <PiDetective className="h-5 w-5" />
          </span>
          <h1 className="m-0 text-3xl font-bold tracking-tight text-foreground-heading">
            Agentura
          </h1>
        </div>
        <p className="mt-sm max-w-[560px] text-sm text-foreground-muted">
          Dein Markt für Grüneratoren und Skills — wähle links eine Kategorie oder such direkt im
          Markt.
        </p>
      </header>

      <div className="mb-xl flex flex-col gap-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <PiMagnifyingGlass className="pointer-events-none absolute left-md top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
          <Input
            type="text"
            value={search}
            onChange={(e) => updateParam('q', e.target.value, '')}
            placeholder="Im Markt suchen…"
            className="pl-[2.5rem]"
            autoFocus
          />
        </div>
        <Select value={sort} onValueChange={(v) => updateParam('sort', v, 'empfohlen')}>
          <SelectTrigger className="h-11 w-auto gap-xs sm:min-w-[10rem]">
            <PiArrowsDownUp className="h-4 w-4 text-foreground-muted" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_VALUES.map((v) => (
              <SelectItem key={v} value={v}>
                {SORT_LABELS[v]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-lg lg:flex-row lg:gap-xl">
        <aside className="lg:w-56 lg:shrink-0">
          <CategoryNav
            items={navItems}
            activeKey={searching ? null : activeCat}
            onSelect={selectCategory}
          />
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-lg flex items-end justify-between gap-md">
            <div className="min-w-0">
              <div className="flex items-center gap-sm">
                <h2 className="m-0 truncate text-xl font-semibold text-foreground-heading">
                  {title}
                </h2>
                <span className="shrink-0 rounded-full bg-secondary-600/10 px-2 py-0.5 text-xs font-semibold text-secondary-700 dark:text-secondary-300">
                  {headerCount}
                </span>
              </div>
              {description && <p className="mt-xs text-sm text-foreground-muted">{description}</p>}
            </div>
            <Button asChild variant="brand" size="brand-sm" className="shrink-0">
              <Link to="/agents/new">
                <PiPlus />
                Neuer Grünerator
              </Link>
            </Button>
          </div>

          {searching ? (
            searchCards.length > 0 ? (
              <div className={GRID}>{searchCards}</div>
            ) : (
              <EmptyState icon={EmptyIcon} text={emptyText} />
            )
          ) : totalCards > 0 ? (
            <div className="flex flex-col gap-xl">
              {sections.map((sec) =>
                sec.cards.length === 0 && !sec.emptyHint ? null : (
                  <section key={sec.key}>
                    {sec.heading && (
                      <div className="mb-md flex flex-wrap items-center justify-between gap-sm">
                        <div className="flex items-center gap-xs">
                          {sec.icon && <sec.icon className="h-4 w-4 text-foreground-muted" />}
                          <h3 className="m-0 text-sm font-semibold uppercase tracking-wide text-foreground-muted">
                            {sec.heading}
                          </h3>
                          <span className="text-xs font-semibold text-foreground-muted">
                            {sec.cards.length}
                          </span>
                        </div>
                        {sec.action}
                      </div>
                    )}
                    {sec.cards.length > 0 ? (
                      <div className={GRID}>{sec.cards}</div>
                    ) : (
                      <p className="text-sm text-foreground-muted">{sec.emptyHint}</p>
                    )}
                  </section>
                )
              )}
            </div>
          ) : (
            <EmptyState icon={EmptyIcon} text={emptyText} />
          )}
        </div>
      </div>
    </PageContainer>
  );
}

export default withAuthRequired(AgenturaPage, { title: 'Agentura' });
