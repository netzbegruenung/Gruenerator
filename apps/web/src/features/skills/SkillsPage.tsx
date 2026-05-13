import {
  agentsList,
  SKILL_CATEGORY_LABELS,
  useSkillFavoritesStore,
  type AgentListItem,
  type SkillCategory,
} from '@gruenerator/chat';
import { AGENT_CATEGORY_LABELS, getAgentSlug, type Agent } from '@gruenerator/shared/agents';
import { Input, SectionHeader, CardGrid } from '@gruenerator/ui';
import { useMemo, useState } from 'react';
import {
  PiSparkle,
  PiStar,
  PiStarFill,
  PiMagnifyingGlass,
  PiPencilSimple,
  PiTrash,
  PiPlus,
} from 'react-icons/pi';
import { Link, useNavigate } from 'react-router-dom';

import {
  useDeleteUserAgent,
  useSharedSystemAgents,
  useUserAgents,
  type SharedAgentEntry,
} from '../agents/api';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
import PageContainer from '@/components/common/PageContainer';

const CATEGORY_ORDER: SkillCategory[] = ['presse', 'social', 'dokumente', 'recherche', 'sonstiges'];

interface SkillCardProps {
  skill: AgentListItem;
  isFavorite: boolean;
  onToggleFavorite: (mention: string) => void;
  onSelect: (skill: AgentListItem) => void;
}

function SkillCard({ skill, isFavorite, onToggleFavorite, onSelect }: SkillCardProps) {
  const Icon = skill.icon ?? PiSparkle;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(skill)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(skill);
        }
      }}
      className="group relative flex flex-row bg-background border border-grey-200 dark:border-grey-700 rounded-md overflow-hidden cursor-pointer transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center justify-center px-md text-secondary-600 shrink-0">
        <Icon className="text-2xl" />
      </div>
      <div className="flex flex-col flex-1 p-md min-w-0">
        <div className="flex justify-between items-start gap-sm mb-xs">
          <h3 className="text-base font-semibold text-foreground-heading m-0 truncate">
            {skill.title}
          </h3>
          <button
            type="button"
            aria-label={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(skill.mention);
            }}
            className="shrink-0 rounded-md p-1 text-secondary-600 transition-colors hover:bg-secondary-600/10"
          >
            {isFavorite ? <PiStarFill className="h-4 w-4" /> : <PiStar className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-sm text-foreground leading-relaxed m-0 line-clamp-2">
          {skill.description}
        </p>
      </div>
    </div>
  );
}

interface AgentCardProps {
  agent: Agent;
  onSelect: (agent: Agent) => void;
  onEdit?: (agent: Agent) => void;
  onDelete?: (agent: Agent) => void;
}

function AgentCard({ agent, onSelect, onEdit, onDelete }: AgentCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(agent)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(agent);
        }
      }}
      className="group relative flex flex-row bg-background border border-grey-200 dark:border-grey-700 rounded-md overflow-hidden cursor-pointer transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md"
    >
      <div
        className="flex items-center justify-center px-md text-2xl shrink-0"
        style={{ backgroundColor: agent.backgroundColor, color: 'white' }}
      >
        {agent.avatar}
      </div>
      <div className="flex flex-col flex-1 p-md min-w-0">
        <div className="flex justify-between items-start gap-sm mb-xs">
          <h3 className="text-base font-semibold text-foreground-heading m-0 truncate">
            {agent.title}
          </h3>
          <div className="flex shrink-0 gap-1">
            {onEdit && (
              <button
                type="button"
                aria-label="Bearbeiten"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(agent);
                }}
                className="rounded-md p-1 text-secondary-600 transition-colors hover:bg-secondary-600/10"
              >
                <PiPencilSimple className="h-4 w-4" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                aria-label="Löschen"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(agent);
                }}
                className="rounded-md p-1 text-red-600 transition-colors hover:bg-red-600/10"
              >
                <PiTrash className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-foreground leading-relaxed m-0 line-clamp-2">
          {agent.description}
        </p>
      </div>
    </div>
  );
}

interface SharedAgentCardProps {
  entry: SharedAgentEntry;
  onSelect: (agent: Agent) => void;
}

function SharedAgentCard({ entry, onSelect }: SharedAgentCardProps) {
  const { agent, groups } = entry;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(agent)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(agent);
        }
      }}
      className="group relative flex flex-row bg-background border border-grey-200 dark:border-grey-700 rounded-md overflow-hidden cursor-pointer transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md"
    >
      <div
        className="flex items-center justify-center px-md text-2xl shrink-0"
        style={{ backgroundColor: agent.backgroundColor, color: 'white' }}
      >
        {agent.avatar}
      </div>
      <div className="flex flex-col flex-1 p-md min-w-0">
        <h3 className="mb-xs text-base font-semibold text-foreground-heading m-0 truncate">
          {agent.title}
        </h3>
        <p className="mb-xs text-sm text-foreground leading-relaxed m-0 line-clamp-2">
          {agent.description}
        </p>
        <div className="flex flex-wrap gap-xs">
          {groups.map((g) => (
            <span
              key={g.id}
              className="inline-flex items-center rounded-full bg-grey-100 px-2 py-0.5 text-xs text-foreground-muted dark:bg-grey-800"
            >
              {g.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function LibraryPageInner() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const favorites = useSkillFavoritesStore((s) => s.favorites);
  const toggleFavorite = useSkillFavoritesStore((s) => s.toggleFavorite);

  const { data: userAgents = [] } = useUserAgents();
  const { data: sharedAgents = [] } = useSharedSystemAgents();
  const deleteUserAgent = useDeleteUserAgent();

  const showCreateAgentCta = import.meta.env.DEV;

  const filteredSkills = useMemo(() => {
    if (!search) return agentsList;
    const q = search.toLowerCase();
    return agentsList.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.mention.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    );
  }, [search]);

  const filteredUserAgents = useMemo(() => {
    if (!search) return userAgents;
    const q = search.toLowerCase();
    return userAgents.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.identifier.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q)
    );
  }, [userAgents, search]);

  const filteredSharedAgents = useMemo(() => {
    if (!search) return sharedAgents;
    const q = search.toLowerCase();
    return sharedAgents.filter(
      (entry) =>
        entry.agent.title.toLowerCase().includes(q) ||
        entry.agent.description.toLowerCase().includes(q)
    );
  }, [sharedAgents, search]);

  const favoriteSkills = useMemo(
    () => filteredSkills.filter((s) => favorites.includes(s.mention.toLowerCase())),
    [filteredSkills, favorites]
  );

  const byCategory = useMemo(() => {
    const map = new Map<SkillCategory, AgentListItem[]>();
    for (const skill of filteredSkills) {
      const cat = skill.skillCategory ?? 'sonstiges';
      const list = map.get(cat) ?? [];
      list.push(skill);
      map.set(cat, list);
    }
    return map;
  }, [filteredSkills]);

  const handleSelectSkill = (skill: AgentListItem) => {
    void navigate(`/chat?skill=${encodeURIComponent(skill.mention)}`);
  };

  const handleSelectAgent = (agent: Agent) => {
    void navigate(`/agents/${encodeURIComponent(getAgentSlug(agent.identifier))}`);
  };

  const handleEditAgent = (agent: Agent) => {
    void navigate(`/agents/${agent.identifier}/edit`);
  };

  const handleDeleteAgent = (agent: Agent) => {
    if (!confirm(`Möchtest du "${agent.title}" wirklich löschen?`)) return;
    deleteUserAgent.mutate(agent.identifier);
  };

  const hasAnyResults =
    filteredSkills.length > 0 || filteredUserAgents.length > 0 || filteredSharedAgents.length > 0;

  return (
    <PageContainer
      maxWidth="lg"
      title="Bibliothek"
      subtitle="Skills und Agent*innen für deine politische Kommunikation — finde, was du brauchst, und merke dir Favoriten."
    >
      <div className="mx-auto mb-xl max-w-[600px]">
        <div className="relative">
          <PiMagnifyingGlass className="pointer-events-none absolute left-md top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Bibliothek durchsuchen..."
            className="pl-[2.5rem]"
            autoFocus
          />
        </div>
      </div>

      {favoriteSkills.length > 0 && (
        <section className="mb-xl">
          <SectionHeader title="Favoriten" />
          <CardGrid columns="auto" gap="md">
            {favoriteSkills.map((skill) => (
              <SkillCard
                key={`fav-${skill.mention}`}
                skill={skill}
                isFavorite
                onToggleFavorite={toggleFavorite}
                onSelect={handleSelectSkill}
              />
            ))}
          </CardGrid>
        </section>
      )}

      {CATEGORY_ORDER.map((cat) => {
        const items = byCategory.get(cat);
        if (!items || items.length === 0) return null;
        return (
          <section key={cat} className="mb-xl">
            <SectionHeader title={SKILL_CATEGORY_LABELS[cat]} />
            <CardGrid columns="auto" gap="md">
              {items.map((skill) => (
                <SkillCard
                  key={`${cat}-${skill.mention}`}
                  skill={skill}
                  isFavorite={favorites.includes(skill.mention.toLowerCase())}
                  onToggleFavorite={toggleFavorite}
                  onSelect={handleSelectSkill}
                />
              ))}
            </CardGrid>
          </section>
        );
      })}

      {filteredSharedAgents.length > 0 && (
        <section className="mb-xl">
          <SectionHeader title={AGENT_CATEGORY_LABELS.gruppen} />
          <CardGrid columns="auto" gap="md">
            {filteredSharedAgents.map((entry) => (
              <SharedAgentCard
                key={`shared-${entry.agent.identifier}`}
                entry={entry}
                onSelect={handleSelectAgent}
              />
            ))}
          </CardGrid>
        </section>
      )}

      {(filteredUserAgents.length > 0 || (showCreateAgentCta && !search)) && (
        <section className="mb-xl">
          <div className="mb-md flex items-center justify-between">
            <SectionHeader title="Meine Agent*innen" />
            {showCreateAgentCta && (
              <Link
                to="/agents/new"
                className="inline-flex items-center gap-xs rounded-md bg-primary-600 px-md py-sm text-sm text-white transition-colors hover:bg-primary-700"
              >
                <PiPlus className="h-4 w-4" />
                Neue*r Agent*in
              </Link>
            )}
          </div>
          {filteredUserAgents.length > 0 ? (
            <CardGrid columns="auto" gap="md">
              {filteredUserAgents.map((agent) => (
                <AgentCard
                  key={`ua-${agent.identifier}`}
                  agent={agent}
                  onSelect={handleSelectAgent}
                  onEdit={showCreateAgentCta ? handleEditAgent : undefined}
                  onDelete={handleDeleteAgent}
                />
              ))}
            </CardGrid>
          ) : (
            !search && (
              <div className="rounded-md border border-dashed border-grey-300 p-lg text-center text-sm text-foreground-muted dark:border-grey-700">
                Du hast noch keine eigenen Agent*innen erstellt.
              </div>
            )
          )}
        </section>
      )}

      {!hasAnyResults && (
        <div className="text-center py-xl text-foreground-muted">
          Kein Eintrag für „{search}" gefunden.
        </div>
      )}
    </PageContainer>
  );
}

export default withAuthRequired(LibraryPageInner, { title: 'Bibliothek' });
