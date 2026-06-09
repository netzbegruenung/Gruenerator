import { agentsList, useSkillFavoritesStore, type AgentListItem } from '@gruenerator/chat';
import { SKILL_CATEGORY_LABELS } from '@gruenerator/shared/agents';
import { Badge, Button, CardGrid, Tabs, TabsContent, TabsList, TabsTrigger } from '@gruenerator/ui';
import { useMemo } from 'react';
import {
  PiArrowLeft,
  PiPaperPlaneTilt,
  PiShareNetwork,
  PiSparkle,
  PiStar,
  PiStarFill,
} from 'react-icons/pi';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { SkillCard } from './components/cards';
import { findSkillByMention, relatedSkills } from './lib/lookups';

import { Markdown } from '@/components/common/Markdown';
import PageContainer from '@/components/common/PageContainer';
import { useAuthStore } from '@/stores/authStore';

function SkillDetailPage() {
  const { mention } = useParams<{ mention: string }>();
  const navigate = useNavigate();
  const userLocale = useAuthStore((s) => s.locale) ?? 'de-DE';

  const favorites = useSkillFavoritesStore((s) => s.favorites);
  const toggleFavorite = useSkillFavoritesStore((s) => s.toggleFavorite);

  const skill = findSkillByMention(mention);

  const related = useMemo(() => {
    if (!skill) return [];
    const pool = agentsList.filter(
      (s) =>
        Boolean(s.skillSystemPrompt) &&
        (s.audience === undefined || s.audience === 'all' || s.audience === userLocale)
    );
    return relatedSkills(skill, pool);
  }, [skill, userLocale]);

  if (!skill) {
    return (
      <PageContainer maxWidth="lg" title="Skill nicht gefunden">
        <div className="text-center">
          <Button asChild variant="brand">
            <Link to="/agentura">Zurück zur Agentura</Link>
          </Button>
        </div>
      </PageContainer>
    );
  }

  const Icon = skill.icon ?? PiSparkle;
  const isFavorite = favorites.includes(skill.mention.toLowerCase());

  const handleShare = () => {
    void navigator.clipboard?.writeText(window.location.href);
  };

  return (
    <PageContainer maxWidth="lg">
      <Link
        to="/agentura"
        className="mb-md inline-flex items-center gap-xs text-sm text-foreground-muted transition-colors hover:text-foreground"
      >
        <PiArrowLeft className="h-4 w-4" />
        Agentura
      </Link>

      <header className="mb-lg flex flex-col gap-md sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-md">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-hover-alt text-3xl text-secondary-600 dark:bg-grey-800">
            <Icon className="text-3xl" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-sm">
              <h1 className="m-0 text-2xl font-semibold text-foreground-heading">{skill.title}</h1>
              <Badge variant="outline">Skill</Badge>
            </div>
            <div className="mt-sm flex flex-wrap gap-xs">
              {skill.skillCategory && (
                <Badge variant="secondary">{SKILL_CATEGORY_LABELS[skill.skillCategory]}</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-xs">
          <Button
            variant="brand"
            onClick={() => navigate(`/chat?skill=${encodeURIComponent(skill.mention)}`)}
          >
            <PiPaperPlaneTilt />
            Im Chat verwenden
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
            onClick={() => toggleFavorite(skill.mention)}
          >
            {isFavorite ? <PiStarFill /> : <PiStar />}
          </Button>
          <Button variant="outline" size="icon" aria-label="Link kopieren" onClick={handleShare}>
            <PiShareNetwork />
          </Button>
        </div>
      </header>

      <p className="mb-lg text-foreground">{skill.description}</p>

      <Tabs defaultValue="skill">
        <TabsList className="mb-lg">
          <TabsTrigger value="skill">Anleitung</TabsTrigger>
          {related.length > 0 && <TabsTrigger value="related">Verwandte Skills</TabsTrigger>}
        </TabsList>

        <TabsContent value="skill">
          <div className="flex flex-col gap-lg">
            {skill.promptTemplate && (
              <div className="rounded-lg border border-grey-200 bg-hover-alt p-md dark:border-grey-700 dark:bg-grey-800/40">
                <h2 className="m-0 mb-xs text-sm font-semibold uppercase tracking-wide text-foreground-muted">
                  Vorlage
                </h2>
                <p className="m-0 text-sm text-foreground">{skill.promptTemplate}</p>
              </div>
            )}
            <Markdown fallback={<p>{skill.description}</p>}>
              {skill.skillSystemPrompt ?? skill.description}
            </Markdown>
          </div>
        </TabsContent>

        {related.length > 0 && (
          <TabsContent value="related">
            <CardGrid columns="auto" gap="md">
              {related.map((other: AgentListItem) => (
                <SkillCard
                  key={other.mention}
                  skill={other}
                  isFavorite={favorites.includes(other.mention.toLowerCase())}
                  onToggleFavorite={toggleFavorite}
                  onSelect={(s) => navigate(`/agentura/skill/${encodeURIComponent(s.mention)}`)}
                />
              ))}
            </CardGrid>
          </TabsContent>
        )}
      </Tabs>
    </PageContainer>
  );
}

export default SkillDetailPage;
