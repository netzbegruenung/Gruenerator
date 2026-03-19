import {
  Badge,
  ListCard,
  ListCardContent,
  ListCardIcon,
  ListCardMeta,
  ListCardTitle,
  LoadingSection,
} from '@gruenerator/ui';
import { useQuery } from '@tanstack/react-query';
import { HiArrowLeft, HiCalendar, HiChevronRight } from 'react-icons/hi';
import { Link, useParams } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import apiClient from '../../components/utils/apiClient';

import type { BriefingArchive } from './types';

const dateFormat: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
};

const BriefingArchivePage = () => {
  const { agentId } = useParams<{ agentId: string }>();

  const { data: archives = [], isLoading } = useQuery<BriefingArchive[]>({
    queryKey: ['briefing-archives', agentId],
    queryFn: async () => {
      const res = await apiClient.get(
        `/briefing/archives?agentId=${encodeURIComponent(agentId || '')}`
      );
      return (res.data as { archives: BriefingArchive[] }).archives;
    },
    enabled: !!agentId,
    staleTime: 60_000,
  });

  const agentName = archives[0]?.title || agentId?.replace('system:', '') || 'Briefing';

  return (
    <ErrorBoundary>
      <PageContainer title={agentName} subtitle="Archiv" maxWidth="sm">
        <Link
          to="/briefing"
          className="inline-flex items-center gap-xs text-sm text-foreground-muted hover:text-foreground transition-colors no-underline mb-lg"
        >
          <HiArrowLeft />
          Alle Briefings
        </Link>

        {isLoading ? (
          <LoadingSection label="Archiv wird geladen..." />
        ) : archives.length === 0 ? (
          <p className="text-sm text-foreground-muted py-xl text-center">
            Noch keine Archiveinträge vorhanden.
          </p>
        ) : (
          <div className="flex flex-col gap-sm">
            {archives.map((archive) => (
              <Link
                key={archive.filename}
                to={`/briefing/${encodeURIComponent(agentId || '')}/archiv/${encodeURIComponent(archive.filename)}`}
                className="no-underline"
              >
                <ListCard interactive>
                  <ListCardIcon>
                    <HiCalendar />
                  </ListCardIcon>
                  <ListCardContent>
                    <ListCardTitle>
                      {archive.date
                        ? new Date(archive.date).toLocaleDateString('de-DE', dateFormat)
                        : archive.filename}
                    </ListCardTitle>
                    <ListCardMeta>
                      {archive.articleCount > 0 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {archive.articleCount} Artikel
                        </Badge>
                      )}
                      {archive.summary && (
                        <span className="truncate">
                          {archive.summary.replace(/^[#*\-\s]+/, '').slice(0, 100)}
                        </span>
                      )}
                    </ListCardMeta>
                  </ListCardContent>
                  <HiChevronRight className="text-foreground-muted shrink-0" />
                </ListCard>
              </Link>
            ))}
          </div>
        )}
      </PageContainer>
    </ErrorBoundary>
  );
};

export default withAuthRequired(BriefingArchivePage, { title: 'Briefing Archiv' });
