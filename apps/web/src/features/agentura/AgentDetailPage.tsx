import {
  getAgentSlug,
  getVisibleSystemAgentsForLocale,
  type Agent,
} from '@gruenerator/shared/agents';
import { Button, CardGrid } from '@gruenerator/ui';
import { useMemo, useState } from 'react';
import {
  PiArrowLeft,
  PiChatCircleText,
  PiInfo,
  PiPencilSimple,
  PiShareNetwork,
  PiStar,
  PiStarFill,
} from 'react-icons/pi';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useUserAgents } from '../agents/api';
import { PhosphorIcon } from '../agents/icons/PhosphorIcon';

import { AgentCard } from './components/cards';
import { ExamplePreview } from './components/ExamplePreview';
import { ShareAgentModal } from './components/ShareAgentModal';
import { relatedAgents, useAgentBySlug } from './lib/lookups';

import { Markdown } from '@/components/common/Markdown';
import PageContainer from '@/components/common/PageContainer';
import { UnderlineTabs } from '@/components/common/UnderlineTabs';
import { getAgentIcon } from '@/components/layout/Sidebar/sidebarAgentConfig';
import useAgentFavoritesStore from '@/stores/agentFavoritesStore';
import { useAuthStore } from '@/stores/authStore';

type TabKey = 'overview' | 'start' | 'caps' | 'related';

const ICON_BTN =
  'flex h-10 w-10 items-center justify-center rounded-xl text-foreground-muted transition-colors hover:bg-hover-alt hover:text-primary-700 dark:hover:text-primary-300';

function AgentDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const userLocale = useAuthStore((s) => s.locale) ?? 'de-DE';
  const { data: userAgents = [] } = useUserAgents();
  const { agent, isUserAgent, isLoading } = useAgentBySlug(slug);

  const agentFavorites = useAgentFavoritesStore((s) => s.favoriteIdentifiers);
  const toggleAgentFavorite = useAgentFavoritesStore((s) => s.toggle);
  const [shareOpen, setShareOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [tab, setTab] = useState<TabKey>('overview');

  // Ownership: the caller's own agents come from useUserAgents(). Only owners
  // get the share dialog; everyone else gets a plain copy-link.
  const isOwnAgent = useMemo(
    () => userAgents.some((a) => a.identifier === agent?.identifier),
    [userAgents, agent]
  );

  const related = useMemo(() => {
    if (!agent) return [];
    const pool: Agent[] = [...getVisibleSystemAgentsForLocale(userLocale), ...userAgents];
    return relatedAgents(agent, pool);
  }, [agent, userAgents, userLocale]);

  if (isLoading) {
    return (
      <PageContainer maxWidth="sm">
        <p className="text-foreground-muted">Lädt…</p>
      </PageContainer>
    );
  }

  if (!agent) {
    return (
      <PageContainer maxWidth="sm" title="Agent*in nicht gefunden">
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
  for (const id of agent.defaultNotebookIds ?? []) knowledge.push(id);
  if (agent.toolRestrictions?.defaultCollection)
    knowledge.push(agent.toolRestrictions.defaultCollection);
  for (const c of agent.toolRestrictions?.allowedCollections ?? []) knowledge.push(c);

  const details: { label: string; value: string }[] = [
    { label: 'Modell', value: agent.model },
    { label: 'Anbieter', value: agent.provider },
    { label: 'Werkzeuge', value: String(tools.length) },
    { label: 'Wissensbasis', value: knowledge.length > 0 ? 'Ja' : 'Nein' },
  ];

  const handleShare = () => {
    if (isOwnAgent) {
      setShareOpen(true);
    } else {
      void navigator.clipboard?.writeText(window.location.href);
    }
  };

  const tabDefs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: 'Übersicht' },
    { key: 'start', label: 'Gesprächsbeginn' },
    { key: 'caps', label: 'Fähigkeiten' },
    ...(related.length > 0 ? [{ key: 'related' as const, label: 'Verwandte' }] : []),
  ];

  return (
    <PageContainer maxWidth="sm">
      <Link
        to="/agentura"
        className="mb-xl inline-flex items-center gap-xs text-sm font-semibold text-foreground-muted transition-colors hover:text-primary-700 dark:hover:text-primary-300"
      >
        <PiArrowLeft className="h-4 w-4" />
        Agentura
      </Link>

      <header className="mb-md flex items-center gap-md">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-secondary-600/10 text-3xl text-secondary-700 dark:text-secondary-300">
          {isUserAgent && agent.iconKey ? (
            <PhosphorIcon name={agent.iconKey} className="text-3xl" />
          ) : (
            <Icon className="text-3xl" />
          )}
        </span>
        <div className="min-w-0">
          <h1 className="m-0 text-2xl font-bold leading-tight tracking-tight text-foreground-heading">
            {agent.title}
          </h1>
          <p className="m-0 mt-1 text-sm text-foreground-muted">
            Agent{agent.author ? ` · von ${agent.author}` : ''}
          </p>
        </div>
      </header>

      <div className="mb-lg flex flex-wrap items-center gap-xs">
        <Button variant="brand" onClick={() => navigate(`/agents/${chatSlug}`)}>
          <PiChatCircleText />
          Im Chat öffnen
        </Button>
        <div className="mx-1 h-6 w-px bg-grey-200 dark:bg-grey-700" />
        {isUserAgent && (
          <button
            type="button"
            className={ICON_BTN}
            aria-label="Bearbeiten"
            onClick={() => navigate(`/agents/${agent.identifier}/edit`)}
          >
            <PiPencilSimple className="h-[18px] w-[18px]" />
          </button>
        )}
        <button
          type="button"
          className={ICON_BTN}
          aria-label={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
          onClick={() => toggleAgentFavorite(agent.identifier)}
        >
          {isFavorite ? (
            <PiStarFill className="h-[18px] w-[18px] text-secondary-600" />
          ) : (
            <PiStar className="h-[18px] w-[18px]" />
          )}
        </button>
        <button
          type="button"
          className={ICON_BTN}
          aria-label={isOwnAgent ? 'Teilen' : 'Link kopieren'}
          onClick={handleShare}
        >
          <PiShareNetwork className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          className={`${ICON_BTN} ${showInfo ? 'bg-hover-alt text-primary-700 dark:text-primary-300' : ''}`}
          aria-label="Technische Details"
          aria-pressed={showInfo}
          onClick={() => setShowInfo((v) => !v)}
        >
          <PiInfo className="h-[18px] w-[18px]" />
        </button>
      </div>

      {showInfo && (
        <div className="mb-lg max-w-[360px] rounded-lg border border-grey-200 bg-background-alt/40 px-md dark:border-grey-700">
          {details.map((d, i) => (
            <div
              key={d.label}
              className={`flex items-center justify-between py-sm ${
                i < details.length - 1 ? 'border-b border-grey-100 dark:border-grey-800' : ''
              }`}
            >
              <span className="text-sm text-foreground-muted">{d.label}</span>
              <span className="text-sm font-semibold text-foreground">{d.value}</span>
            </div>
          ))}
        </div>
      )}

      {isOwnAgent && (
        <ShareAgentModal
          identifier={agent.identifier}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      )}

      <UnderlineTabs tabs={tabDefs} value={tab} onChange={setTab} className="mb-lg" />

      {tab === 'overview' && (
        <div className="max-w-[640px] text-base leading-relaxed text-foreground">
          <Markdown fallback={<p>{agent.description}</p>}>{agent.description}</Markdown>
        </div>
      )}

      {tab === 'start' && (
        <div>
          <h2 className="mb-md text-base font-bold text-foreground-heading">
            So fängt das Gespräch an
          </h2>
          <ExamplePreview agent={agent} />
        </div>
      )}

      {tab === 'caps' && (
        <div className="flex flex-col gap-lg">
          <div>
            <h2 className="mb-sm text-base font-bold text-foreground-heading">Werkzeuge</h2>
            {tools.length > 0 ? (
              <div className="flex flex-col gap-xs">
                {tools.map((t) => (
                  <div
                    key={t}
                    className="rounded-lg border border-grey-200 px-md py-sm text-sm text-foreground dark:border-grey-700"
                  >
                    {t}
                  </div>
                ))}
              </div>
            ) : (
              <p className="m-0 text-sm text-foreground-muted">Keine Werkzeuge hinterlegt.</p>
            )}
          </div>
          <div>
            <h2 className="mb-sm text-base font-bold text-foreground-heading">Wissensbasis</h2>
            {knowledge.length > 0 ? (
              <div className="flex flex-wrap gap-xs">
                {knowledge.map((k) => (
                  <span
                    key={k}
                    className="rounded-md bg-hover-alt px-sm py-1 text-sm text-foreground dark:bg-grey-800"
                  >
                    {k}
                  </span>
                ))}
              </div>
            ) : (
              <p className="m-0 text-sm text-foreground-muted">
                Keine Wissensbasis hinterlegt — der Agent arbeitet mit dem Modell und seinen
                Werkzeugen.
              </p>
            )}
          </div>
        </div>
      )}

      {tab === 'related' && related.length > 0 && (
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
      )}
    </PageContainer>
  );
}

export default AgentDetailPage;
