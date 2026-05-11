import {
  agentsList,
  SKILL_CATEGORY_LABELS,
  useSkillFavoritesStore,
  type AgentListItem,
  type SkillCategory,
} from '@gruenerator/chat';
import { Input, SectionHeader, CardGrid } from '@gruenerator/ui';
import { useMemo, useState } from 'react';
import { PiSparkle, PiStar, PiStarFill, PiMagnifyingGlass } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

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

function SkillsPageInner() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const favorites = useSkillFavoritesStore((s) => s.favorites);
  const toggleFavorite = useSkillFavoritesStore((s) => s.toggleFavorite);

  const filtered = useMemo(() => {
    if (!search) return agentsList;
    const q = search.toLowerCase();
    return agentsList.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.mention.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    );
  }, [search]);

  const favoriteSkills = useMemo(
    () => filtered.filter((s) => favorites.includes(s.mention.toLowerCase())),
    [filtered, favorites]
  );

  const byCategory = useMemo(() => {
    const map = new Map<SkillCategory, AgentListItem[]>();
    for (const skill of filtered) {
      const cat = skill.skillCategory ?? 'sonstiges';
      const list = map.get(cat) ?? [];
      list.push(skill);
      map.set(cat, list);
    }
    return map;
  }, [filtered]);

  const handleSelect = (skill: AgentListItem) => {
    void navigate(`/chat?skill=${encodeURIComponent(skill.mention)}`);
  };

  const hasAnyResults = filtered.length > 0;

  return (
    <PageContainer
      maxWidth="lg"
      title="Skill-Bibliothek"
      subtitle="Skills für deine politische Kommunikation — finde, was du brauchst, und merke dir Favoriten."
    >
      <div className="mx-auto mb-xl max-w-[600px]">
        <div className="relative">
          <PiMagnifyingGlass className="pointer-events-none absolute left-md top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Skills durchsuchen..."
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
                onSelect={handleSelect}
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
                  onSelect={handleSelect}
                />
              ))}
            </CardGrid>
          </section>
        );
      })}

      {!hasAnyResults && (
        <div className="text-center py-xl text-foreground-muted">
          Kein Skill für „{search}" gefunden.
        </div>
      )}
    </PageContainer>
  );
}

export default withAuthRequired(SkillsPageInner, { title: 'Skill-Bibliothek' });
