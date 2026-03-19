import {
  Badge,
  CardGrid,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ListCard,
  ListCardContent,
  ListCardDescription,
  ListCardIcon,
  ListCardMeta,
  ListCardTitle,
  LoadingSection,
  SectionHeader,
} from '@gruenerator/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { HiDotsVertical, HiOutlineTrash, HiPlay, HiArchive } from 'react-icons/hi';
import { PiNewspaper, PiPower } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import apiClient from '../../components/utils/apiClient';
import { cn } from '../../utils/cn';

interface BriefingAgent {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  config: {
    sources: { type: string; url?: string; query?: string }[];
    timeRange: 'day' | 'week';
    outputFormat: string;
    positionCollections?: string[];
  };
  schedule_type: 'hourly' | 'daily' | 'weekly';
  schedule_hour: number;
  last_executed_at: string | null;
  execution_count: number;
}

function getSourceLabel(sources: BriefingAgent['config']['sources']): string {
  return sources
    .map((s) => {
      if (s.url) {
        try {
          return new URL(s.url).hostname;
        } catch {
          return s.url;
        }
      }
      if (s.query) return s.query.slice(0, 30);
      return s.type;
    })
    .join(', ');
}

const SCHEDULE_LABELS: Record<string, string> = {
  hourly: 'Stündlich',
  daily: 'Täglich',
  weekly: 'Wöchentlich',
};

function AgentCard({
  agent,
  onRun,
  onToggle,
  onDelete,
}: {
  agent: BriefingAgent;
  onRun: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const sourceLabel = getSourceLabel(agent.config.sources);

  return (
    <ListCard interactive={false}>
      <ListCardIcon>
        <PiNewspaper className="text-lg" />
      </ListCardIcon>
      <ListCardContent>
        <div className="flex items-center gap-xs">
          <ListCardTitle>{agent.name}</ListCardTitle>
          <Badge
            variant={agent.is_active ? 'default' : 'outline'}
            className={cn(
              'text-[10px] px-1.5 py-0',
              agent.is_active
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-transparent'
                : ''
            )}
          >
            {agent.is_active ? 'Aktiv' : 'Inaktiv'}
          </Badge>
        </div>
        {agent.description && <ListCardDescription>{agent.description}</ListCardDescription>}
        <ListCardMeta>
          <span>{SCHEDULE_LABELS[agent.schedule_type]}</span>
          <span>·</span>
          <span className="truncate">{sourceLabel}</span>
        </ListCardMeta>
      </ListCardContent>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center justify-center w-7 h-7 rounded-full text-grey-400 hover:text-foreground transition-colors cursor-pointer bg-transparent border-none shrink-0"
            aria-label="Aktionen"
          >
            <HiDotsVertical size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => navigate(`/briefing/${encodeURIComponent(agent.id)}/archiv`)}
          >
            <HiArchive />
            Archiv
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onRun}>
            <HiPlay />
            Jetzt ausführen
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onToggle}>
            <PiPower />
            {agent.is_active ? 'Deaktivieren' : 'Aktivieren'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <HiOutlineTrash />
            Löschen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListCard>
  );
}

const EXAMPLE_AGENTS: BriefingAgent[] = [
  {
    id: 'system:insm-monitor',
    name: 'INSM Lobby-Monitor',
    description:
      'Wöchentliche kritische Analyse der INSM-Veröffentlichungen mit Vergleich zu Grünen Positionen',
    is_active: true,
    config: {
      sources: [{ type: 'scrape', url: 'https://www.insm.de/aktuelles' }],
      timeRange: 'week',
      outputFormat: 'digest',
      positionCollections: ['deutschland', 'bundestagsfraktion', 'gruene-de'],
    },
    schedule_type: 'weekly',
    schedule_hour: 9,
    last_executed_at: null,
    execution_count: 0,
  },
  {
    id: 'system:gruene-pressespiegel',
    name: 'Grüne Pressespiegel — Top 10 Zeitungen',
    description:
      'Tägliche Zusammenfassung aller Artikel über Die Grünen in den 10 größten deutschen Zeitungen',
    is_active: true,
    config: {
      sources: [{ type: 'rss', url: 'https://www.tagesschau.de/xml/rss2/' }],
      timeRange: 'day',
      outputFormat: 'digest',
    },
    schedule_type: 'daily',
    schedule_hour: 20,
    last_executed_at: null,
    execution_count: 0,
  },
  {
    id: 'system:merz-briefing',
    name: 'Friedrich Merz Tages-Briefing',
    description: 'Tägliche Zusammenfassung aller Nachrichten über Friedrich Merz',
    is_active: true,
    config: {
      sources: [{ type: 'web', query: 'Friedrich Merz' }],
      timeRange: 'day',
      outputFormat: 'digest',
    },
    schedule_type: 'daily',
    schedule_hour: 20,
    last_executed_at: null,
    execution_count: 0,
  },
  {
    id: 'system:gruene-berlin',
    name: 'Grüne Berlin — Neue Inhalte',
    description: 'Wöchentliche Zusammenfassung neuer Inhalte von Grüne Berlin',
    is_active: true,
    config: { sources: [{ type: 'documents' }], timeRange: 'week', outputFormat: 'digest' },
    schedule_type: 'weekly',
    schedule_hour: 9,
    last_executed_at: null,
    execution_count: 0,
  },
  {
    id: 'system:spd-instagram',
    name: 'SPD Instagram Monitor',
    description: 'Tägliche SPD Instagram-Posts',
    is_active: true,
    config: { sources: [{ type: 'instagram' }], timeRange: 'day', outputFormat: 'digest' },
    schedule_type: 'daily',
    schedule_hour: 20,
    last_executed_at: null,
    execution_count: 0,
  },
  {
    id: 'system:soeder-vegan',
    name: 'Söder isst — Vegane Alternative',
    description:
      'Monatliche Zusammenfassung von allem, was Markus Söder öffentlich isst, mit veganer Rezeptempfehlung',
    is_active: true,
    config: { sources: [{ type: 'instagram' }], timeRange: 'week', outputFormat: 'summary' },
    schedule_type: 'weekly',
    schedule_hour: 10,
    last_executed_at: null,
    execution_count: 0,
  },
];

function ExampleCard({ agent }: { agent: BriefingAgent }) {
  const navigate = useNavigate();
  const sourceLabel = getSourceLabel(agent.config.sources);

  return (
    <ListCard interactive={false} className="bg-background-alt">
      <ListCardIcon>
        <PiNewspaper />
      </ListCardIcon>
      <ListCardContent>
        <ListCardTitle>{agent.name}</ListCardTitle>
        {agent.description && <ListCardDescription>{agent.description}</ListCardDescription>}
        <ListCardMeta>
          <span>{SCHEDULE_LABELS[agent.schedule_type]}</span>
          <span>·</span>
          <span className="truncate">{sourceLabel}</span>
        </ListCardMeta>
      </ListCardContent>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center justify-center w-7 h-7 rounded-full text-grey-400 hover:text-foreground transition-colors cursor-pointer bg-transparent border-none shrink-0"
            aria-label="Aktionen"
          >
            <HiDotsVertical size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => navigate(`/briefing/${encodeURIComponent(agent.id)}/archiv`)}
          >
            <HiArchive />
            Archiv
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListCard>
  );
}

const BriefingPage = () => {
  const queryClient = useQueryClient();

  const { data: agents = [], isLoading } = useQuery<BriefingAgent[]>({
    queryKey: ['briefing-agents'],
    queryFn: async () => {
      const res = await apiClient.get('/briefing/agents');
      return (res.data as { agents: BriefingAgent[] }).agents;
    },
    staleTime: 30_000,
  });

  const runAgent = useMutation({
    mutationFn: (id: string) => apiClient.post(`/briefing/agents/${id}/run`),
  });

  const toggleAgent = useMutation({
    mutationFn: (id: string) => apiClient.post(`/briefing/agents/${id}/toggle`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['briefing-agents'] }),
  });

  const deleteAgent = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/briefing/agents/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['briefing-agents'] }),
  });

  const handleDelete = (agent: BriefingAgent) => {
    if (window.confirm(`"${agent.name}" wirklich löschen?`)) {
      deleteAgent.mutate(agent.id);
    }
  };

  return (
    <ErrorBoundary>
      <PageContainer
        title="Briefings"
        subtitle="Automatische Briefings und Lobby-Monitoring mit KI-gestützter Analyse."
        maxWidth="md"
      >
        {/* TODO: Enable when briefing API is deployed
        <section>
          <SectionHeader title="Meine Agenten" />
          {isLoading ? (
            <LoadingSection label="Agenten werden geladen..." />
          ) : agents.length === 0 ? (
            <p className="text-sm text-foreground-muted py-lg text-center">
              Noch keine Briefing-Agenten vorhanden.
            </p>
          ) : (
            <CardGrid columns="2">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onRun={() => runAgent.mutate(agent.id)}
                  onToggle={() => toggleAgent.mutate(agent.id)}
                  onDelete={() => handleDelete(agent)}
                />
              ))}
            </CardGrid>
          )}
        </section>
        */}

        <section>
          <SectionHeader title="Vorlagen" size="sm" />
          <CardGrid columns="2">
            {EXAMPLE_AGENTS.map((agent) => (
              <ExampleCard key={agent.id} agent={agent} />
            ))}
          </CardGrid>
        </section>
      </PageContainer>
    </ErrorBoundary>
  );
};

export default withAuthRequired(BriefingPage, { title: 'Briefings' });
