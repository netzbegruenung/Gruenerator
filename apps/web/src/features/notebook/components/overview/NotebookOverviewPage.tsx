import { type TopicCategory } from '@gruenerator/contracts';
import { LANDESVERBAENDE, LV_HUBS, getSystemAgentsForLocale } from '@gruenerator/shared/agents';
import { Skeleton, cn } from '@gruenerator/ui';
import { useMemo } from 'react';
import { FiExternalLink } from 'react-icons/fi';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import withAuthRequired from '../../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../../components/common/PageContainer';
import { useAuthStore } from '../../../../stores/authStore';
import { formatRelativeDate } from '../../../../utils/dateFormatter';
import {
  getNotebookPath,
  getSystemNotebookConfig,
  type NotebookConfig,
} from '../../config/notebookPagesConfig';
import { getNotebookByPath } from '../../config/notebooksConfig';
import { useNotebookOverview } from '../../hooks/useNotebookOverview';
import {
  NOTEBOOK_CARD,
  NOTEBOOK_MAGENTA_BG,
  NOTEBOOK_TEXT_MUTED,
  NOTEBOOK_TEXT_STRONG,
} from '../../notebookTheme';
import useNotebookStore from '../../stores/notebookStore';
import { NotebookTabs } from '../NotebookTabs';

import {
  ActivityChart,
  NotebookGrueneratoren,
  OverviewKpis,
  PeopleList,
  RecentDocuments,
  SourceMix,
  TermCloud,
  TopicProfile,
} from './OverviewSections';

const nf = new Intl.NumberFormat('de-DE');

/** „Vor 3 Stunden“ reads mid-sentence here: „Stand vor 3 Stunden“. */
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

function LoadingGrid() {
  return (
    <div aria-busy="true" aria-label="Übersicht wird geladen" className="grid gap-4 lg:grid-cols-2">
      <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[108px] rounded-[14px]" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-[14px] lg:col-span-2" />
      <Skeleton className="h-96 rounded-[14px]" />
      <Skeleton className="h-96 rounded-[14px]" />
    </div>
  );
}

function OverviewBody({ config }: { config: NotebookConfig }) {
  const collectionId = config.collections[0].id;
  const chatPath = getNotebookPath(config);
  // The registry id (`mecklenburg-vorpommern-notebook`) — not `${config.id}-notebook`,
  // which is camelCase for MV and SH and so matched none of their agents.
  const entry = getNotebookByPath(chatPath);
  const locale = useAuthStore((s) => s.locale) ?? 'de-DE';
  const navigate = useNavigate();
  const { clearAllFilters, setActiveFilter } = useNotebookStore();
  const { data: overview, isPending, isError, refetch } = useNotebookOverview(collectionId);

  const lv = entry ? LANDESVERBAENDE.find((l) => l.notebookId === entry.id) : undefined;
  const hub = entry ? (LV_HUBS.find((h) => h.notebookId === entry.id) ?? null) : null;
  const agents = useMemo(
    () =>
      entry
        ? getSystemAgentsForLocale(locale).filter((a) => a.defaultNotebookIds?.includes(entry.id))
        : [],
    [entry, locale]
  );

  const selectTopic = (topic: TopicCategory) => {
    // The notebook filter store is shared with the chat tab: set exactly this
    // topic, then switch over — the composer shows it as an active filter.
    clearAllFilters(collectionId);
    setActiveFilter(collectionId, 'themes', topic);
    void navigate(chatPath);
  };

  const Icon = entry?.icon;
  const title = entry?.title ?? config.title;

  return (
    <>
      <header className="flex flex-wrap items-center gap-5">
        {entry?.coverImage ? (
          <img
            src={entry.coverImage}
            alt=""
            className="size-16 shrink-0 rounded-2xl object-cover shadow-[0_4px_14px_rgba(31,63,51,0.12)]"
          />
        ) : (
          Icon && (
            <span
              className={cn(NOTEBOOK_CARD, 'flex size-16 shrink-0 items-center justify-center')}
            >
              <Icon aria-hidden className="size-7 text-[#D6006E] dark:text-[#E0418A]" />
            </span>
          )
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className={cn('text-xs font-semibold uppercase tracking-wide', NOTEBOOK_TEXT_MUTED)}>
            Notebook-Übersicht
          </p>
          <h1
            className={cn(
              'text-[32px] font-extrabold leading-tight tracking-[-0.02em] max-md:text-2xl',
              NOTEBOOK_TEXT_STRONG
            )}
          >
            {title}
          </h1>
          <p
            className={cn(
              'flex flex-wrap items-center gap-x-3 gap-y-1 text-sm',
              NOTEBOOK_TEXT_MUTED
            )}
          >
            {overview && (
              <span>
                {nf.format(overview.totals.documents)} Dokumente · Stand{' '}
                {lowerFirst(formatRelativeDate(overview.computedAt))}
              </span>
            )}
            {lv && (
              <a
                href={lv.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-[#B4005C] no-underline hover:underline dark:text-[#F2A1C6]"
              >
                {new URL(lv.homepage).hostname.replace(/^www\./, '')}
                <FiExternalLink aria-hidden className="size-3.5" />
                <span className="sr-only">(öffnet in neuem Tab)</span>
              </a>
            )}
          </p>
        </div>
      </header>

      {isPending ? (
        <LoadingGrid />
      ) : isError || !overview ? (
        <div className={cn(NOTEBOOK_CARD, 'flex flex-col items-center gap-3 p-8 text-center')}>
          <p className={NOTEBOOK_TEXT_STRONG}>Die Übersicht konnte nicht geladen werden.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-sm font-semibold text-[#B4005C] underline underline-offset-2 dark:text-[#F2A1C6]"
          >
            Erneut versuchen
          </button>
        </div>
      ) : overview.totals.documents === 0 ? (
        <div className={cn(NOTEBOOK_CARD, 'p-8 text-center', NOTEBOOK_TEXT_MUTED)}>
          Für dieses Notebook liegen noch keine Dokumente vor.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <OverviewKpis overview={overview} />
          {overview.monthly.some((m) => m.count > 0) && <ActivityChart overview={overview} />}
          {overview.topics.length > 0 && (
            <TopicProfile overview={overview} onSelectTopic={selectTopic} />
          )}
          {overview.persons.length > 0 && <PeopleList overview={overview} />}
          {overview.recent.length > 0 && <RecentDocuments overview={overview} />}
          {(overview.contentTypes.length > 1 || overview.sources.length > 1) && (
            <SourceMix overview={overview} />
          )}
          {overview.terms && (
            <TermCloud terms={overview.terms} documents={overview.totals.documents} />
          )}
          {agents.length > 0 && <NotebookGrueneratoren agents={agents} hub={hub} />}
        </div>
      )}
    </>
  );
}

function NotebookOverviewPage() {
  const { idOrSlug } = useParams<{ idOrSlug: string }>();
  const config = idOrSlug ? getSystemNotebookConfig(idOrSlug) : undefined;

  // User notebooks have no overview; their chat page is the one surface.
  if (!config || config.collectionType !== 'single') {
    return <Navigate to={`/notebooks/${idOrSlug ?? ''}`} replace />;
  }

  return (
    <>
      <NotebookTabs config={config} active="uebersicht" />
      <PageContainer maxWidth="lg" noPadTop gradient={false} bgClassName={NOTEBOOK_MAGENTA_BG}>
        <div className="flex flex-col gap-6 px-4 pb-16 pt-16 md:px-8">
          <OverviewBody config={config} />
        </div>
      </PageContainer>
    </>
  );
}

export default withAuthRequired(NotebookOverviewPage, { title: 'Notebook-Übersicht' });
