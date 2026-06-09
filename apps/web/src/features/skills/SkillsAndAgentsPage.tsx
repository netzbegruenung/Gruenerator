import {
  agentsList,
  SKILL_CATEGORY_LABELS,
  useSkillFavoritesStore,
  type AgentListItem,
  type SkillCategory,
} from '@gruenerator/chat';
import {
  AGENT_CATEGORY_LABELS,
  getAgentSlug,
  getVisibleSystemAgentsForLocale,
  type Agent,
} from '@gruenerator/shared/agents';
import {
  Badge,
  Button,
  Input,
  SectionHeader,
  CardGrid,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';
import { useMemo, useState, type ReactNode } from 'react';
import {
  PiSparkle,
  PiStar,
  PiStarFill,
  PiEye,
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
import { PhosphorIcon } from '../agents/icons/PhosphorIcon';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
import { Markdown } from '@/components/common/Markdown';
import PageContainer from '@/components/common/PageContainer';
import { getAgentIcon } from '@/components/layout/Sidebar/sidebarAgentConfig';
import { SHOW_AGENT_CREATOR } from '@/config/featureFlags';
import useAgentFavoritesStore from '@/stores/agentFavoritesStore';
import { useAuthStore } from '@/stores/authStore';

const CATEGORY_ORDER: SkillCategory[] = ['presse', 'social', 'dokumente', 'recherche', 'sonstiges'];

const INITIAL_VISIBLE = 6;

/** Per-Landesverband agents and skills share this identifier prefix family. */
function isLandesverbandIdentifier(identifier: string): boolean {
  return (
    identifier.startsWith('gruenerator-oeffentlichkeitsarbeit-') ||
    identifier.startsWith('gruenerator-buergeranfragen-')
  );
}

/** The Landesverband slug from an LV identifier (e.g. `…-berlin` → `berlin`),
 *  used to sort LV agents + skills so each region's entries sit together. */
function landesverbandRegion(identifier: string): string {
  return identifier.replace(/^gruenerator-(oeffentlichkeitsarbeit|buergeranfragen)-/, '');
}

/** Type badge so a card is recognizable as an agent (chat persona) or a skill (template). */
function TypeBadge({ kind }: { kind: 'agent' | 'skill' }) {
  return kind === 'agent' ? (
    <Badge variant="secondary" className="shrink-0">
      Agent
    </Badge>
  ) : (
    <Badge variant="outline" className="shrink-0">
      Skill
    </Badge>
  );
}

/** Section header with a one-line description of what the section contains. */
function SectionIntro({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-md">
      <SectionHeader title={title} actions={actions} className="mb-xs" />
      {description && <p className="m-0 text-sm text-foreground-muted">{description}</p>}
    </div>
  );
}

/**
 * Renders a card grid capped at {@link INITIAL_VISIBLE}, with a "show more"
 * toggle (mirrors the workplace NotebooksSection). Each instance owns its own
 * expanded state, so every section collapses independently.
 */
function CollapsibleGrid({ items }: { items: ReactNode[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, INITIAL_VISIBLE);
  return (
    <>
      <CardGrid columns="auto" gap="md">
        {visible}
      </CardGrid>
      {items.length > INITIAL_VISIBLE && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-sm cursor-pointer border-none bg-transparent text-sm text-primary-600 transition-colors hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
        >
          {showAll ? 'Weniger anzeigen' : `Alle ${items.length} anzeigen`}
        </button>
      )}
    </>
  );
}

interface SkillCardProps {
  skill: AgentListItem;
  isFavorite: boolean;
  onToggleFavorite: (mention: string) => void;
  onSelect: (skill: AgentListItem) => void;
}

function SkillCard({ skill, isFavorite, onToggleFavorite, onSelect }: SkillCardProps) {
  const Icon = skill.icon ?? PiSparkle;
  const [showText, setShowText] = useState(false);
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          onSelect(skill);
        }}
        onKeyDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
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
            <div className="flex min-w-0 items-start gap-xs">
              <h3 className="text-base font-semibold text-foreground-heading m-0 line-clamp-2">
                {skill.title}
              </h3>
              <TypeBadge kind="skill" />
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                aria-label="Skill-Text anzeigen"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowText(true);
                }}
                onKeyDown={(e) => e.stopPropagation()}
                className="rounded-md p-2 text-secondary-600 transition-colors hover:bg-secondary-600/10"
              >
                <PiEye className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(skill.mention);
                }}
                onKeyDown={(e) => e.stopPropagation()}
                className="rounded-md p-2 text-secondary-600 transition-colors hover:bg-secondary-600/10"
              >
                {isFavorite ? <PiStarFill className="h-4 w-4" /> : <PiStar className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <p className="text-sm text-foreground leading-relaxed m-0 line-clamp-2">
            {skill.description}
          </p>
        </div>
      </div>
      <Dialog open={showText} onOpenChange={setShowText}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{skill.title}</DialogTitle>
          </DialogHeader>
          <Markdown fallback={<p>{skill.description}</p>}>
            {skill.skillSystemPrompt ?? skill.description}
          </Markdown>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface AgentCardProps {
  agent: Agent;
  onSelect: (agent: Agent) => void;
  onEdit?: (agent: Agent) => void;
  onDelete?: (agent: Agent) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (agent: Agent) => void;
  /** Override the icon (user agents render their chosen Phosphor `iconKey`). */
  iconOverride?: ReactNode;
}

function AgentCard({
  agent,
  onSelect,
  onEdit,
  onDelete,
  isFavorite,
  onToggleFavorite,
  iconOverride,
}: AgentCardProps) {
  const Icon = getAgentIcon(agent.identifier);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        onSelect(agent);
      }}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(agent);
        }
      }}
      className="group relative flex flex-row bg-background border border-grey-200 dark:border-grey-700 rounded-md overflow-hidden cursor-pointer transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center justify-center px-md text-secondary-600 shrink-0">
        {iconOverride ?? <Icon className="text-2xl" />}
      </div>
      <div className="flex flex-col flex-1 p-md min-w-0">
        <div className="flex justify-between items-start gap-sm mb-xs">
          <div className="flex min-w-0 items-start gap-xs">
            <h3 className="text-base font-semibold text-foreground-heading m-0 line-clamp-2">
              {agent.title}
            </h3>
            <TypeBadge kind="agent" />
          </div>
          <div className="flex shrink-0 gap-1">
            {onToggleFavorite && (
              <button
                type="button"
                aria-label={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(agent);
                }}
                onKeyDown={(e) => e.stopPropagation()}
                className="rounded-md p-2 text-secondary-600 transition-colors hover:bg-secondary-600/10"
              >
                {isFavorite ? <PiStarFill className="h-4 w-4" /> : <PiStar className="h-4 w-4" />}
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                aria-label="Bearbeiten"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(agent);
                }}
                onKeyDown={(e) => e.stopPropagation()}
                className="rounded-md p-2 text-secondary-600 transition-colors hover:bg-secondary-600/10"
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
                onKeyDown={(e) => e.stopPropagation()}
                className="rounded-md p-2 text-red-600 transition-colors hover:bg-red-600/10"
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
  isFavorite?: boolean;
  onToggleFavorite?: (agent: Agent) => void;
}

function SharedAgentCard({ entry, onSelect, isFavorite, onToggleFavorite }: SharedAgentCardProps) {
  const { agent, groups } = entry;
  const Icon = getAgentIcon(agent.identifier);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        onSelect(agent);
      }}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(agent);
        }
      }}
      className="group relative flex flex-row bg-background border border-grey-200 dark:border-grey-700 rounded-md overflow-hidden cursor-pointer transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center justify-center px-md text-secondary-600 shrink-0">
        <Icon className="text-2xl" />
      </div>
      <div className="flex flex-col flex-1 p-md min-w-0">
        <div className="flex justify-between items-start gap-sm mb-xs">
          <div className="flex min-w-0 items-start gap-xs">
            <h3 className="text-base font-semibold text-foreground-heading m-0 line-clamp-2">
              {agent.title}
            </h3>
            <TypeBadge kind="agent" />
          </div>
          {onToggleFavorite && (
            <button
              type="button"
              aria-label={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(agent);
              }}
              onKeyDown={(e) => e.stopPropagation()}
              className="shrink-0 rounded-md p-2 text-secondary-600 transition-colors hover:bg-secondary-600/10"
            >
              {isFavorite ? <PiStarFill className="h-4 w-4" /> : <PiStar className="h-4 w-4" />}
            </button>
          )}
        </div>
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

function SkillsAndAgentsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const favorites = useSkillFavoritesStore((s) => s.favorites);
  const toggleFavorite = useSkillFavoritesStore((s) => s.toggleFavorite);

  const { data: userAgents = [] } = useUserAgents();
  const { data: sharedAgents = [] } = useSharedSystemAgents();
  const deleteUserAgent = useDeleteUserAgent();
  const userLocale = useAuthStore((s) => s.locale) ?? 'de-DE';
  // System/shared/LV agents use the agent-favorites store (shared with the
  // sidebar) — favoriting one here pins it in the sidebar.
  const agentFavorites = useAgentFavoritesStore((s) => s.favoriteIdentifiers);
  const toggleAgentFavorite = useAgentFavoritesStore((s) => s.toggle);

  const showCreateAgentCta = SHOW_AGENT_CREATOR;

  const filteredSkills = useMemo(() => {
    // Only "real" skills with their own system prompt (Schnellbefehl-only skills
    // just defer to the agent and would duplicate it), and only those visible
    // for the user's locale — same de-DE/de-AT/all audience rule as agents.
    const real = agentsList.filter(
      (s) =>
        Boolean(s.skillSystemPrompt) &&
        (s.audience === undefined || s.audience === 'all' || s.audience === userLocale)
    );
    if (!search) return real;
    const q = search.toLowerCase();
    return real.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.mention.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    );
  }, [search, userLocale]);

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

  // Grünerator's own system agents — surfaced here so the library is the one
  // place to discover every agent. Exclude those already shown under "Geteilt
  // mit Gruppen" to avoid listing the same agent twice.
  const filteredSystemAgents = useMemo(() => {
    const sharedIds = new Set(sharedAgents.map((e) => e.agent.identifier));
    const all = getVisibleSystemAgentsForLocale(userLocale).filter(
      (a) => !sharedIds.has(a.identifier)
    );
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter(
      (a) => a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
    );
  }, [userLocale, sharedAgents, search]);

  const favoriteSkills = useMemo(
    () => filteredSkills.filter((s) => favorites.includes(s.mention.toLowerCase())),
    [filteredSkills, favorites]
  );

  // LV agents + LV skills get their own "Landesverbände" category instead of
  // flooding the system-agent list / the Presse skill category.
  const lvSystemAgents = useMemo(
    () => filteredSystemAgents.filter((a) => isLandesverbandIdentifier(a.identifier)),
    [filteredSystemAgents]
  );
  const generalSystemAgents = useMemo(
    () => filteredSystemAgents.filter((a) => !isLandesverbandIdentifier(a.identifier)),
    [filteredSystemAgents]
  );
  const lvSkills = useMemo(
    () => filteredSkills.filter((s) => isLandesverbandIdentifier(s.identifier)),
    [filteredSkills]
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

  // LV agents + skills, sorted per Landesverband (region) so each region's
  // entries sit next to each other; agent before its Presse skill.
  const lvEntries = [
    ...lvSystemAgents.map((agent) => ({
      region: landesverbandRegion(agent.identifier),
      order: 0,
      node: (
        <AgentCard
          key={`lv-a-${agent.identifier}`}
          agent={agent}
          onSelect={handleSelectAgent}
          isFavorite={agentFavorites.includes(agent.identifier)}
          onToggleFavorite={(a) => toggleAgentFavorite(a.identifier)}
        />
      ),
    })),
    ...lvSkills.map((skill) => ({
      region: landesverbandRegion(skill.identifier),
      order: 1,
      node: (
        <SkillCard
          key={`lv-s-${skill.mention}`}
          skill={skill}
          isFavorite={favorites.includes(skill.mention.toLowerCase())}
          onToggleFavorite={toggleFavorite}
          onSelect={handleSelectSkill}
        />
      ),
    })),
  ].sort((a, b) => a.region.localeCompare(b.region) || a.order - b.order);

  const hasAnyResults =
    filteredSkills.length > 0 ||
    filteredUserAgents.length > 0 ||
    filteredSharedAgents.length > 0 ||
    filteredSystemAgents.length > 0;

  return (
    <PageContainer
      maxWidth="lg"
      title="Skills & Agents"
      subtitle="Agent*innen und Skills für deine politische Kommunikation — finde, was du brauchst, und merke dir Favoriten."
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

      {/* ── Agent*innen — the personas you chat with ──────────────────── */}
      {(filteredUserAgents.length > 0 || (showCreateAgentCta && !search)) && (
        <section className="mb-xl">
          <SectionIntro
            title="Meine Agent*innen"
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
          {filteredUserAgents.length > 0 ? (
            <CollapsibleGrid
              items={filteredUserAgents.map((agent) => (
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
            !search && (
              <div className="rounded-md border border-dashed border-grey-300 p-lg text-center text-sm text-foreground-muted dark:border-grey-700">
                Du hast noch keine eigenen Agent*innen erstellt.
              </div>
            )
          )}
        </section>
      )}

      {filteredSharedAgents.length > 0 && (
        <section className="mb-xl">
          <SectionIntro
            title={AGENT_CATEGORY_LABELS.gruppen}
            description="Agent*innen, die in deinen Gruppen geteilt wurden."
          />
          <CollapsibleGrid
            items={filteredSharedAgents.map((entry) => (
              <SharedAgentCard
                key={`shared-${entry.agent.identifier}`}
                entry={entry}
                onSelect={handleSelectAgent}
                isFavorite={agentFavorites.includes(entry.agent.identifier)}
                onToggleFavorite={(a) => toggleAgentFavorite(a.identifier)}
              />
            ))}
          />
        </section>
      )}

      {generalSystemAgents.length > 0 && (
        <section className="mb-xl">
          <SectionIntro
            title="Grünerator-Agent*innen"
            description="Fertige Assistent*innen von Grünerator für deine Aufgaben."
          />
          <CollapsibleGrid
            items={generalSystemAgents.map((agent) => (
              <AgentCard
                key={`sys-${agent.identifier}`}
                agent={agent}
                onSelect={handleSelectAgent}
                isFavorite={agentFavorites.includes(agent.identifier)}
                onToggleFavorite={(a) => toggleAgentFavorite(a.identifier)}
              />
            ))}
          />
        </section>
      )}

      {/* ── Landesverbände — region-specific agents & skills, grouped per LV ─ */}
      {lvEntries.length > 0 && (
        <section className="mb-xl">
          <SectionIntro
            title="Landesverbände"
            description="Regionale Agent*innen und Skills deines Landesverbands."
          />
          <CollapsibleGrid items={lvEntries.map((e) => e.node)} />
        </section>
      )}

      {/* ── Skills — quick-start templates ─────────────────────────────── */}
      {favoriteSkills.length > 0 && (
        <section className="mb-xl">
          <SectionIntro title="Favoriten" description="Deine gemerkten Skills." />
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

      {CATEGORY_ORDER.map((cat) => {
        const items = byCategory.get(cat);
        if (!items || items.length === 0) return null;
        return (
          <section key={cat} className="mb-xl">
            <SectionIntro title={SKILL_CATEGORY_LABELS[cat]} />
            <CollapsibleGrid
              items={items.map((skill) => (
                <SkillCard
                  key={`${cat}-${skill.mention}`}
                  skill={skill}
                  isFavorite={favorites.includes(skill.mention.toLowerCase())}
                  onToggleFavorite={toggleFavorite}
                  onSelect={handleSelectSkill}
                />
              ))}
            />
          </section>
        );
      })}

      {!hasAnyResults && (
        <div className="text-center py-xl text-foreground-muted">
          Kein Eintrag für „{search}" gefunden.
        </div>
      )}
    </PageContainer>
  );
}

export default withAuthRequired(SkillsAndAgentsPage, { title: 'Skills & Agents' });
