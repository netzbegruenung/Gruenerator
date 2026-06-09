import {
  getAgentSlug,
  getVisibleSystemAgentsForLocale,
  type Agent,
} from '@gruenerator/shared/agents';
import { Badge, Button, CardGrid, Tabs, TabsContent, TabsList, TabsTrigger } from '@gruenerator/ui';
import { useMemo } from 'react';
import {
  PiArrowLeft,
  PiBookOpenText,
  PiChatCircleText,
  PiPencilSimple,
  PiShareNetwork,
  PiStar,
  PiStarFill,
  PiWrench,
} from 'react-icons/pi';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useUserAgents } from '../agents/api';
import { PhosphorIcon } from '../agents/icons/PhosphorIcon';

import { AgentCard } from './components/cards';
import { ExamplePreview } from './components/ExamplePreview';
import { relatedAgents, useAgentBySlug } from './lib/lookups';

import { Markdown } from '@/components/common/Markdown';
import PageContainer from '@/components/common/PageContainer';
import { getAgentIcon } from '@/components/layout/Sidebar/sidebarAgentConfig';
import useAgentFavoritesStore from '@/stores/agentFavoritesStore';
import { useAuthStore } from '@/stores/authStore';

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-foreground-muted">{label}</dt>
      <dd className="m-0 text-sm text-foreground">{value}</dd>
    </div>
  );
}

function CapabilityList({
  icon: Icon,
  title,
  items,
}: {
  icon: typeof PiWrench;
  title: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-sm flex items-center gap-xs text-base font-semibold text-foreground-heading">
        <Icon className="h-4 w-4 text-secondary-600" />
        {title}
      </h3>
      <div className="flex flex-wrap gap-xs">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-md bg-hover-alt px-sm py-1 text-sm text-foreground dark:bg-grey-800"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function AgentDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const userLocale = useAuthStore((s) => s.locale) ?? 'de-DE';
  const { data: userAgents = [] } = useUserAgents();
  const { agent, isUserAgent, isLoading } = useAgentBySlug(slug);

  const agentFavorites = useAgentFavoritesStore((s) => s.favoriteIdentifiers);
  const toggleAgentFavorite = useAgentFavoritesStore((s) => s.toggle);

  const related = useMemo(() => {
    if (!agent) return [];
    const pool: Agent[] = [...getVisibleSystemAgentsForLocale(userLocale), ...userAgents];
    return relatedAgents(agent, pool);
  }, [agent, userAgents, userLocale]);

  if (isLoading) {
    return (
      <PageContainer maxWidth="lg">
        <p className="text-foreground-muted">Lädt…</p>
      </PageContainer>
    );
  }

  if (!agent) {
    return (
      <PageContainer maxWidth="lg" title="Agent*in nicht gefunden">
        <div className="text-center">
          <Button asChild variant="brand">
            <Link to="/agentura">Zurück zur Agentura</Link>
          </Button>
        </div>
      </PageContainer>
    );
  }

  const Icon = getAgentIcon(agent.identifier);
  const chatSlug = getAgentSlug(agent.identifier);
  const isFavorite = agentFavorites.includes(agent.identifier);

  const tools = [...(agent.enabledTools ?? []), ...(agent.plugins ?? [])];
  const knowledge: string[] = [];
  if (agent.defaultNotebookId) knowledge.push(agent.defaultNotebookId);
  if (agent.toolRestrictions?.defaultCollection)
    knowledge.push(agent.toolRestrictions.defaultCollection);
  for (const c of agent.toolRestrictions?.allowedCollections ?? []) knowledge.push(c);

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
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg text-3xl text-secondary-600"
            style={{ backgroundColor: agent.backgroundColor || 'transparent' }}
          >
            {isUserAgent && agent.iconKey ? (
              <PhosphorIcon name={agent.iconKey} className="text-3xl" />
            ) : (
              <Icon className="text-3xl" />
            )}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-sm">
              <h1 className="m-0 text-2xl font-semibold text-foreground-heading">{agent.title}</h1>
              <Badge variant="secondary">Agent</Badge>
            </div>
            {agent.author && (
              <p className="m-0 mt-0.5 text-sm text-foreground-muted">von {agent.author}</p>
            )}
            {agent.tags.length > 0 && (
              <div className="mt-sm flex flex-wrap gap-xs">
                {agent.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-xs">
          <Button variant="brand" onClick={() => navigate(`/agents/${chatSlug}`)}>
            <PiChatCircleText />
            Im Chat öffnen
          </Button>
          {isUserAgent && import.meta.env.DEV && (
            <Button
              variant="outline"
              size="icon"
              aria-label="Bearbeiten"
              onClick={() => navigate(`/agents/${agent.identifier}/edit`)}
            >
              <PiPencilSimple />
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            aria-label={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
            onClick={() => toggleAgentFavorite(agent.identifier)}
          >
            {isFavorite ? <PiStarFill /> : <PiStar />}
          </Button>
          <Button variant="outline" size="icon" aria-label="Link kopieren" onClick={handleShare}>
            <PiShareNetwork />
          </Button>
        </div>
      </header>

      <dl className="mb-lg grid grid-cols-2 gap-md rounded-lg border border-grey-200 p-md dark:border-grey-700 sm:grid-cols-4">
        <Fact label="Modell" value={agent.model} />
        <Fact label="Anbieter" value={agent.provider} />
        <Fact label="Tools" value={String(tools.length)} />
        <Fact label="Wissen" value={knowledge.length > 0 ? 'Ja' : 'Nein'} />
      </dl>

      <Tabs defaultValue="overview">
        <TabsList className="mb-lg">
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="capabilities">Fähigkeiten</TabsTrigger>
          {related.length > 0 && <TabsTrigger value="related">Verwandte</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview">
          <div className="flex flex-col gap-lg">
            <Markdown fallback={<p>{agent.description}</p>}>{agent.description}</Markdown>
            <div>
              <h2 className="mb-sm text-lg font-semibold text-foreground-heading">
                So fängt das Gespräch an
              </h2>
              <ExamplePreview agent={agent} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="capabilities">
          <div className="flex flex-col gap-lg">
            <CapabilityList icon={PiWrench} title="Werkzeuge" items={tools} />
            <CapabilityList icon={PiBookOpenText} title="Wissensquellen" items={knowledge} />
            {tools.length === 0 && knowledge.length === 0 && (
              <p className="text-sm text-foreground-muted">
                Diese*r Agent*in nutzt keine zusätzlichen Werkzeuge oder Wissensquellen.
              </p>
            )}
          </div>
        </TabsContent>

        {related.length > 0 && (
          <TabsContent value="related">
            <CardGrid columns="auto" gap="md">
              {related.map((other) => (
                <AgentCard
                  key={other.identifier}
                  agent={other}
                  onSelect={(a) =>
                    navigate(`/agentura/agent/${encodeURIComponent(getAgentSlug(a.identifier))}`)
                  }
                  isFavorite={agentFavorites.includes(other.identifier)}
                  onToggleFavorite={(a) => toggleAgentFavorite(a.identifier)}
                />
              ))}
            </CardGrid>
          </TabsContent>
        )}
      </Tabs>
    </PageContainer>
  );
}

export default AgentDetailPage;
