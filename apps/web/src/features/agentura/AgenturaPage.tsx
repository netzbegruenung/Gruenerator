import { agentsList, useSkillFavoritesStore, type AgentListItem } from '@gruenerator/chat';
import {
  getAgentSlug,
  getVisibleSystemAgentsForLocale,
  type Agent,
  type SkillCategory,
} from '@gruenerator/shared/agents';
import { Button, Input } from '@gruenerator/ui';
import { useMemo } from 'react';
import { PiMagnifyingGlass, PiPlus } from 'react-icons/pi';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import {
  useDeleteUserAgent,
  useSharedSystemAgents,
  useUserAgents,
  type SharedAgentEntry,
} from '../agents/api';
import { PhosphorIcon } from '../agents/icons/PhosphorIcon';

import { AgentCard, SharedAgentCard, SkillCard } from './components/cards';
import { CategoryNav, type AisleNavItem } from './components/CategoryNav';
import { FeaturedRail } from './components/FeaturedRail';
import { CollapsibleGrid, SectionIntro } from './components/Section';
import {
  FILTER_VALUES,
  SORT_VALUES,
  SortFilterBar,
  type AgenturaFilter,
  type AgenturaSort,
} from './components/SortFilterBar';
import {
  AGENT_SECTIONS,
  SKILL_CATEGORY_ICONS,
  SKILL_CATEGORY_LABELS,
  SKILL_CATEGORY_ORDER,
  skillCategorySectionId,
} from './lib/categories';
import { isLandesverbandIdentifier, landesverbandRegion } from './lib/lookups';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
import PageContainer from '@/components/common/PageContainer';
import useAgentFavoritesStore from '@/stores/agentFavoritesStore';
import { useAuthStore } from '@/stores/authStore';

const FEATURED_LIMIT = 6;

function matchesQuery(haystack: string[], q: string): boolean {
  return haystack.some((v) => v.toLowerCase().includes(q));
}

/** Reorder a list per the active sort; `empfohlen` keeps registry order. */
function sortBy<T>(
  items: T[],
  sort: AgenturaSort,
  title: (t: T) => string,
  isFav: (t: T) => boolean
): T[] {
  if (sort === 'az') return [...items].sort((a, b) => title(a).localeCompare(title(b)));
  if (sort === 'favoriten') return [...items].sort((a, b) => Number(isFav(b)) - Number(isFav(a)));
  return items;
}

function AgenturaPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('q') ?? '';
  const sort: AgenturaSort = SORT_VALUES.includes(searchParams.get('sort') as AgenturaSort)
    ? (searchParams.get('sort') as AgenturaSort)
    : 'empfohlen';
  const filter: AgenturaFilter = FILTER_VALUES.includes(
    searchParams.get('filter') as AgenturaFilter
  )
    ? (searchParams.get('filter') as AgenturaFilter)
    : 'alle';

  const showAgents = filter !== 'skills';
  const showSkills = filter !== 'agents';

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

  const favorites = useSkillFavoritesStore((s) => s.favorites);
  const toggleFavorite = useSkillFavoritesStore((s) => s.toggleFavorite);

  const { data: userAgents = [] } = useUserAgents();
  const { data: sharedAgents = [] } = useSharedSystemAgents();
  const deleteUserAgent = useDeleteUserAgent();
  const userLocale = useAuthStore((s) => s.locale) ?? 'de-DE';
  const agentFavorites = useAgentFavoritesStore((s) => s.favoriteIdentifiers);
  const toggleAgentFavorite = useAgentFavoritesStore((s) => s.toggle);

  const showCreateAgentCta = import.meta.env.DEV;
  const q = search.toLowerCase();

  const isSkillFav = (s: AgentListItem) => favorites.includes(s.mention.toLowerCase());
  const isAgentFav = (a: Agent) => agentFavorites.includes(a.identifier);

  const filteredSkills = useMemo(() => {
    const real = agentsList.filter(
      (s) =>
        Boolean(s.skillSystemPrompt) &&
        (s.audience === undefined || s.audience === 'all' || s.audience === userLocale)
    );
    if (!q) return real;
    return real.filter((s) => matchesQuery([s.title, s.mention, s.description], q));
  }, [q, userLocale]);

  const filteredUserAgents = useMemo(() => {
    if (!q) return userAgents;
    return userAgents.filter((a) => matchesQuery([a.title, a.identifier, a.description], q));
  }, [userAgents, q]);

  const filteredSharedAgents = useMemo(() => {
    if (!q) return sharedAgents;
    return sharedAgents.filter((e) => matchesQuery([e.agent.title, e.agent.description], q));
  }, [sharedAgents, q]);

  const filteredSystemAgents = useMemo(() => {
    const sharedIds = new Set(sharedAgents.map((e) => e.agent.identifier));
    const all = getVisibleSystemAgentsForLocale(userLocale).filter(
      (a) => !sharedIds.has(a.identifier)
    );
    if (!q) return all;
    return all.filter((a) => matchesQuery([a.title, a.description], q));
  }, [userLocale, sharedAgents, q]);

  const generalSystemAgents = useMemo(
    () => filteredSystemAgents.filter((a) => !isLandesverbandIdentifier(a.identifier)),
    [filteredSystemAgents]
  );
  const lvSystemAgents = useMemo(
    () => filteredSystemAgents.filter((a) => isLandesverbandIdentifier(a.identifier)),
    [filteredSystemAgents]
  );
  const lvSkills = useMemo(
    () => filteredSkills.filter((s) => isLandesverbandIdentifier(s.identifier)),
    [filteredSkills]
  );

  const favoriteSkills = useMemo(
    () => filteredSkills.filter((s) => favorites.includes(s.mention.toLowerCase())),
    [filteredSkills, favorites]
  );

  const byCategory = useMemo(() => {
    const map = new Map<SkillCategory, AgentListItem[]>();
    for (const skill of filteredSkills) {
      if (isLandesverbandIdentifier(skill.identifier)) continue;
      const cat = skill.skillCategory ?? 'sonstiges';
      const list = map.get(cat) ?? [];
      list.push(skill);
      map.set(cat, list);
    }
    return map;
  }, [filteredSkills]);

  const featuredAgents = useMemo(() => {
    const pinned = generalSystemAgents.filter((a) => a.pinnedToSidebar);
    const pool = pinned.length > 0 ? pinned : generalSystemAgents;
    return pool.slice(0, FEATURED_LIMIT);
  }, [generalSystemAgents]);

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

  const sortedUserAgents = sortBy(filteredUserAgents, sort, (a) => a.title, isAgentFav);
  const sortedSharedAgents = sortBy(
    filteredSharedAgents,
    sort,
    (e) => e.agent.title,
    (e) => isAgentFav(e.agent)
  );
  const sortedGeneralAgents = sortBy(generalSystemAgents, sort, (a) => a.title, isAgentFav);

  // LV agents + skills, grouped per region so each region's entries sit together.
  const lvEntries = [
    ...(showAgents
      ? lvSystemAgents.map((agent) => ({
          region: landesverbandRegion(agent.identifier),
          order: 0,
          node: (
            <AgentCard
              key={`lv-a-${agent.identifier}`}
              agent={agent}
              onSelect={handleSelectAgent}
              isFavorite={isAgentFav(agent)}
              onToggleFavorite={(a) => toggleAgentFavorite(a.identifier)}
            />
          ),
        }))
      : []),
    ...(showSkills
      ? lvSkills.map((skill) => ({
          region: landesverbandRegion(skill.identifier),
          order: 1,
          node: (
            <SkillCard
              key={`lv-s-${skill.mention}`}
              skill={skill}
              isFavorite={isSkillFav(skill)}
              onToggleFavorite={toggleFavorite}
              onSelect={handleSelectSkill}
            />
          ),
        }))
      : []),
  ].sort((a, b) => a.region.localeCompare(b.region) || a.order - b.order);

  const showMeine = showAgents && (sortedUserAgents.length > 0 || (showCreateAgentCta && !q));
  const showGruppen = showAgents && sortedSharedAgents.length > 0;
  const showGruenerator = showAgents && sortedGeneralAgents.length > 0;
  const showLv = lvEntries.length > 0;
  const showFavoriten = showSkills && favoriteSkills.length > 0;

  const navItems: AisleNavItem[] = [];
  if (showMeine) navItems.push({ ...AGENT_SECTIONS.meine, count: sortedUserAgents.length });
  if (showGruppen) navItems.push({ ...AGENT_SECTIONS.gruppen, count: sortedSharedAgents.length });
  if (showGruenerator)
    navItems.push({ ...AGENT_SECTIONS.gruenerator, count: sortedGeneralAgents.length });
  if (showLv) navItems.push({ ...AGENT_SECTIONS.landesverbaende, count: lvEntries.length });
  if (showFavoriten) navItems.push({ ...AGENT_SECTIONS.favoriten, count: favoriteSkills.length });
  if (showSkills) {
    for (const cat of SKILL_CATEGORY_ORDER) {
      const items = byCategory.get(cat);
      if (!items || items.length === 0) continue;
      navItems.push({
        id: skillCategorySectionId(cat),
        label: SKILL_CATEGORY_LABELS[cat],
        icon: SKILL_CATEGORY_ICONS[cat],
        count: items.length,
      });
    }
  }

  const hasAnyResults = navItems.length > 0;
  const showFeatured = showAgents && !q && featuredAgents.length > 0;

  return (
    <PageContainer
      maxWidth="lg"
      title="Agentura"
      subtitle="Dein Markt für Agent*innen und Skills — stöbere durch die Regale, finde, was du brauchst, und merke dir Favoriten."
    >
      <div className="mx-auto mb-md max-w-[600px]">
        <div className="relative">
          <PiMagnifyingGlass className="pointer-events-none absolute left-md top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
          <Input
            type="text"
            value={search}
            onChange={(e) => updateParam('q', e.target.value, '')}
            placeholder="Im Markt suchen..."
            className="pl-[2.5rem]"
            autoFocus
          />
        </div>
      </div>

      <div className="mb-xl">
        <SortFilterBar
          sort={sort}
          filter={filter}
          onSortChange={(v) => updateParam('sort', v, 'empfohlen')}
          onFilterChange={(v) => updateParam('filter', v, 'alle')}
        />
      </div>

      {showFeatured && (
        <FeaturedRail
          agents={featuredAgents}
          onSelect={handleSelectAgent}
          favoriteIdentifiers={agentFavorites}
          onToggleFavorite={toggleAgentFavorite}
        />
      )}

      {hasAnyResults ? (
        <div className="flex flex-col gap-lg lg:flex-row lg:gap-xl">
          <aside className="lg:w-56 lg:shrink-0">
            <CategoryNav items={navItems} />
          </aside>

          <div className="min-w-0 flex-1">
            {showMeine && (
              <section className="mb-xl">
                <SectionIntro
                  id={AGENT_SECTIONS.meine.id}
                  icon={AGENT_SECTIONS.meine.icon}
                  title={AGENT_SECTIONS.meine.label}
                  description="Deine selbst erstellten KI-Assistent*innen zum Chatten."
                  actions={
                    showCreateAgentCta ? (
                      <Button asChild variant="brand" size="sm">
                        <Link to="/agents/new">
                          <PiPlus />
                          Neuer Agent
                        </Link>
                      </Button>
                    ) : undefined
                  }
                />
                {sortedUserAgents.length > 0 ? (
                  <CollapsibleGrid
                    items={sortedUserAgents.map((agent) => (
                      <AgentCard
                        key={`ua-${agent.identifier}`}
                        agent={agent}
                        onSelect={handleSelectAgent}
                        onEdit={showCreateAgentCta ? handleEditAgent : undefined}
                        onDelete={handleDeleteAgent}
                        iconOverride={
                          <PhosphorIcon name={agent.iconKey ?? 'PiSparkle'} className="text-2xl" />
                        }
                      />
                    ))}
                  />
                ) : (
                  !q && (
                    <div className="rounded-md border border-dashed border-grey-300 p-lg text-center text-sm text-foreground-muted dark:border-grey-700">
                      Du hast noch keine eigenen Agent*innen erstellt.
                    </div>
                  )
                )}
              </section>
            )}

            {showGruppen && (
              <section className="mb-xl">
                <SectionIntro
                  id={AGENT_SECTIONS.gruppen.id}
                  icon={AGENT_SECTIONS.gruppen.icon}
                  title={AGENT_SECTIONS.gruppen.label}
                  description="Agent*innen, die in deinen Gruppen geteilt wurden."
                />
                <CollapsibleGrid
                  items={sortedSharedAgents.map((entry: SharedAgentEntry) => (
                    <SharedAgentCard
                      key={`shared-${entry.agent.identifier}`}
                      entry={entry}
                      onSelect={handleSelectAgent}
                      isFavorite={isAgentFav(entry.agent)}
                      onToggleFavorite={(a) => toggleAgentFavorite(a.identifier)}
                    />
                  ))}
                />
              </section>
            )}

            {showGruenerator && (
              <section className="mb-xl">
                <SectionIntro
                  id={AGENT_SECTIONS.gruenerator.id}
                  icon={AGENT_SECTIONS.gruenerator.icon}
                  title={AGENT_SECTIONS.gruenerator.label}
                  description="Fertige Assistent*innen von Grünerator für deine Aufgaben."
                />
                <CollapsibleGrid
                  items={sortedGeneralAgents.map((agent) => (
                    <AgentCard
                      key={`sys-${agent.identifier}`}
                      agent={agent}
                      onSelect={handleSelectAgent}
                      isFavorite={isAgentFav(agent)}
                      onToggleFavorite={(a) => toggleAgentFavorite(a.identifier)}
                    />
                  ))}
                />
              </section>
            )}

            {showLv && (
              <section className="mb-xl">
                <SectionIntro
                  id={AGENT_SECTIONS.landesverbaende.id}
                  icon={AGENT_SECTIONS.landesverbaende.icon}
                  title={AGENT_SECTIONS.landesverbaende.label}
                  description="Regionale Agent*innen und Skills deines Landesverbands."
                />
                <CollapsibleGrid items={lvEntries.map((e) => e.node)} />
              </section>
            )}

            {showFavoriten && (
              <section className="mb-xl">
                <SectionIntro
                  id={AGENT_SECTIONS.favoriten.id}
                  icon={AGENT_SECTIONS.favoriten.icon}
                  title={AGENT_SECTIONS.favoriten.label}
                  description="Deine gemerkten Skills."
                />
                <CollapsibleGrid
                  items={favoriteSkills.map((skill) => (
                    <SkillCard
                      key={`fav-${skill.mention}`}
                      skill={skill}
                      isFavorite
                      onToggleFavorite={toggleFavorite}
                      onSelect={handleSelectSkill}
                    />
                  ))}
                />
              </section>
            )}

            {showSkills &&
              SKILL_CATEGORY_ORDER.map((cat) => {
                const items = byCategory.get(cat);
                if (!items || items.length === 0) return null;
                const sortedItems = sortBy(items, sort, (s) => s.title, isSkillFav);
                return (
                  <section key={cat} className="mb-xl">
                    <SectionIntro
                      id={skillCategorySectionId(cat)}
                      icon={SKILL_CATEGORY_ICONS[cat]}
                      title={SKILL_CATEGORY_LABELS[cat]}
                    />
                    <CollapsibleGrid
                      items={sortedItems.map((skill) => (
                        <SkillCard
                          key={`${cat}-${skill.mention}`}
                          skill={skill}
                          isFavorite={isSkillFav(skill)}
                          onToggleFavorite={toggleFavorite}
                          onSelect={handleSelectSkill}
                        />
                      ))}
                    />
                  </section>
                );
              })}
          </div>
        </div>
      ) : (
        <div className="text-center py-xl text-foreground-muted">
          Kein Eintrag für „{search}" gefunden.
        </div>
      )}
    </PageContainer>
  );
}

export default withAuthRequired(AgenturaPage, { title: 'Agentura' });
