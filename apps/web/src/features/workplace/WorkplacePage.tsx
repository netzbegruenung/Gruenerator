import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { useMemo, useState } from 'react';
import { HiPlus, HiShare, HiUserGroup } from 'react-icons/hi';
import { PiPencilLine } from 'react-icons/pi';
import { Link, useNavigate } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ToolGrid from '../../components/common/ToolGrid';
import ErrorBoundary from '../../components/ErrorBoundary';
import { Separator } from '../../components/ui/separator';
import apiClient from '../../components/utils/apiClient';
import { getIcon } from '../../config/icons';
import useBetaFeatures from '../../hooks/useBetaFeatures';
import { useBoards } from '../boards/hooks/useBoards';
import { getBoardType } from '../boards/types';
import { useGroups, type GroupSummary } from '../groups/hooks/useGroups';

import useRecentDocs from './hooks/useRecentDocs';

import type { ToolEntry } from '../../components/common/ToolGrid';
import type { Board } from '../boards/types';
import type { RecentDoc } from './hooks/useRecentDocs';

const DocsIcon = getIcon('navigation', 'docs');
const BoardIcon = getIcon('navigation', 'boards');

// Documents are now served inline at /docs/:id within the web app
const MAX_BOARDS = 6;

const dateFormat: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };

const createButtonClass =
  'flex items-center justify-center w-7 h-7 rounded-full text-primary-600 hover:bg-primary-600/10 transition-colors cursor-pointer no-underline border-none bg-transparent';

const linkClass =
  'text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 transition-colors';

interface SectionLink {
  text: string;
  href?: string;
  onClick?: () => void;
}

interface SectionCreate {
  href?: string;
  onClick?: () => void;
  label?: string;
}

const SectionHeader = ({
  title,
  titleHref,
  titleOnClick,
  link,
  create,
}: {
  title: string;
  titleHref?: string;
  titleOnClick?: () => void;
  link?: SectionLink;
  create?: SectionCreate;
}) => (
  <div className="flex items-center justify-between mb-md">
    <div className="flex items-center gap-xs">
      {titleHref ? (
        <a href={titleHref} target="_blank" rel="noopener noreferrer" className="no-underline">
          <h2 className="text-xl font-semibold text-foreground-heading m-0 hover:text-primary-600 transition-colors">
            {title}
          </h2>
        </a>
      ) : titleOnClick ? (
        <button
          type="button"
          onClick={titleOnClick}
          className="bg-transparent border-none cursor-pointer p-0"
        >
          <h2 className="text-xl font-semibold text-foreground-heading m-0 hover:text-primary-600 transition-colors">
            {title}
          </h2>
        </button>
      ) : (
        <h2 className="text-xl font-semibold text-foreground-heading m-0">{title}</h2>
      )}
      {create &&
        (create.href ? (
          <a
            href={create.href}
            target="_blank"
            rel="noopener noreferrer"
            className={createButtonClass}
            aria-label={create.label ?? 'Neu erstellen'}
          >
            <HiPlus size={18} />
          </a>
        ) : (
          <button
            type="button"
            onClick={create.onClick}
            className={createButtonClass}
            aria-label={create.label ?? 'Neu erstellen'}
          >
            <HiPlus size={18} />
          </button>
        ))}
    </div>
    {link &&
      (link.href ? (
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`${linkClass} no-underline`}
        >
          {link.text}
        </a>
      ) : (
        <button
          type="button"
          onClick={link.onClick}
          className={`${linkClass} cursor-pointer bg-transparent border-none`}
        >
          {link.text}
        </button>
      ))}
  </div>
);

const LoadingSpinner = () => (
  <div className="flex items-center gap-sm py-md">
    <div className="size-4 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
    <span className="text-sm text-foreground">Laden...</span>
  </div>
);

const EmptyState = ({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel: string;
  onAction: () => void;
}) => (
  <div className="text-center py-lg text-grey-500 dark:text-grey-400">
    <p className="text-sm mb-sm">{message}</p>
    <button
      type="button"
      onClick={onAction}
      className="text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 cursor-pointer bg-transparent border-none transition-colors"
    >
      {actionLabel}
    </button>
  </div>
);

const SUBTYPE_EMOJI: Record<string, string> = {
  blank: '📄',
  antrag: '📋',
  pressemitteilung: '📰',
  protokoll: '📝',
  notizen: '💡',
  redaktionsplan: '📅',
  checkliste: '☑️',
  einladung: '✉️',
};

const DocCard = ({ doc }: { doc: RecentDoc }) => {
  const emoji = SUBTYPE_EMOJI[doc.document_subtype ?? 'blank'] ?? '📄';

  return (
    <Link
      to={`/docs/${doc.id}`}
      className="group flex flex-col bg-background border border-grey-200 dark:border-grey-700 rounded-md overflow-hidden cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-grey-300 dark:hover:border-grey-600 no-underline"
    >
      <div className="flex items-center justify-center bg-white dark:bg-grey-800 aspect-[4/3] text-4xl select-none">
        {emoji}
      </div>
      <div className="border-t border-grey-100 dark:border-grey-700 px-sm py-sm">
        <div className="flex items-center gap-xs min-w-0">
          {DocsIcon && <DocsIcon className="text-sm text-secondary-600 shrink-0" />}
          <span className="text-sm font-medium text-foreground-heading truncate">
            {doc.title || 'Unbenanntes Dokument'}
          </span>
        </div>
        <p className="text-xs text-grey-400 mt-0.5 m-0 truncate">
          {doc.access_type && doc.access_type !== 'owner' && doc.creator_name
            ? `Von ${doc.creator_name} · `
            : ''}
          {new Date(doc.updated_at).toLocaleDateString('de-DE', dateFormat)}
        </p>
      </div>
    </Link>
  );
};

const BoardCard = ({
  board,
  onClick,
  groups,
}: {
  board: Board;
  onClick: () => void;
  groups: GroupSummary[];
}) => {
  const [sharedGroupId, setSharedGroupId] = useState<string | null>(null);

  const handleShareToGroup = async (groupId: string) => {
    try {
      await apiClient.post(`/auth/groups/${groupId}/share`, {
        contentType: 'collaborative_documents',
        contentId: board.id,
        permissions: { read: true, write: false, collaborative: false },
      });
      setSharedGroupId(groupId);
      setTimeout(() => setSharedGroupId(null), 2000);
    } catch {
      // best-effort
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="group flex items-center gap-sm bg-background border border-grey-200 dark:border-grey-700 rounded-md px-md py-md min-h-[4rem] cursor-pointer transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {getBoardType(board) === 'whiteboard' ? (
        <PiPencilLine className="text-base text-secondary-600 shrink-0" />
      ) : (
        BoardIcon && <BoardIcon className="text-base text-secondary-600 shrink-0" />
      )}
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-sm font-medium text-foreground-heading truncate">{board.title}</span>
        <span className="text-xs text-grey-400">
          {board.creator_name && `${board.creator_name} · `}
          {new Date(board.updated_at).toLocaleDateString('de-DE', dateFormat)}
        </span>
      </div>
      {groups.length > 0 && (
        <div
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-center w-6 h-6 rounded-full text-grey-400 hover:text-foreground transition-colors cursor-pointer"
                aria-label="Teilen"
              >
                <HiShare size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {groups.map((group) => (
                <DropdownMenuItem key={group.id} onClick={() => handleShareToGroup(group.id)}>
                  <HiUserGroup />
                  {sharedGroupId === group.id ? 'Geteilt!' : group.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
};

const tools: ToolEntry[] = [
  {
    id: 'gruppen',
    title: 'Gruppen',
    description: 'Verwalte deine Gruppen, Mitglieder und geteilte Inhalte.',
    path: '/gruppen',
    icon: getIcon('navigation', 'gruppen'),
    tags: ['Teams', 'Zusammenarbeit'],
  },
  {
    id: 'wolke',
    title: 'Wolke',
    description: 'Nextcloud-Verbindungen und Cloud-Dateien verwalten.',
    path: '/profile/wolke',
    icon: getIcon('actions', 'cloud'),
    tags: ['Nextcloud', 'Dateien'],
  },
  {
    id: 'scanner',
    title: 'Scanner',
    description: 'Dokumente digitalisieren und Texte automatisch extrahieren.',
    path: '/scanner',
    icon: getIcon('navigation', 'scanner'),
    tags: ['OCR', 'PDF'],
    betaFeature: 'scanner',
  },
  {
    id: 'transkription',
    title: 'Transkription',
    description: 'Audio- und Meeting-Aufnahmen automatisch transkribieren.',
    path: '/transkription',
    icon: getIcon('navigation', 'transkription'),
    tags: ['Audio', 'Meetings'],
    betaFeature: 'scanner',
  },
];

const WorkplacePage = () => {
  const navigate = useNavigate();
  const { canAccessBetaFeature } = useBetaFeatures();

  const showDocs = canAccessBetaFeature('docs');
  const showBoards = canAccessBetaFeature('boards');

  const { boards, isLoading: boardsLoading } = useBoards({ enabled: showBoards });
  const { docs, isLoading: docsLoading } = useRecentDocs(5, showDocs);
  const { userGroups = [] } = useGroups({ isActive: showBoards });

  const displayedBoards = useMemo(() => boards.slice(0, MAX_BOARDS), [boards]);

  const visibleTools = useMemo(
    () => tools.filter((tool) => !tool.betaFeature || canAccessBetaFeature(tool.betaFeature)),
    [canAccessBetaFeature]
  );

  return (
    <ErrorBoundary>
      <PageContainer
        title="Desk"
        subtitle="Zusammenarbeit, Planung und Teamorganisation."
        maxWidth="md"
      >
        {showDocs && (
          <section className="mb-xl">
            <SectionHeader
              title="Dokumente"
              titleHref="https://docs.gruenerator.eu"
              create={{ href: 'https://docs.gruenerator.eu', label: 'Neues Dokument erstellen' }}
            />
            {docsLoading ? (
              <LoadingSpinner />
            ) : docs.length === 0 ? (
              <EmptyState
                message="Noch keine Dokumente vorhanden."
                actionLabel="Neues Dokument erstellen"
                onAction={() => window.open('https://docs.gruenerator.eu', '_blank')}
              />
            ) : (
              <div className="grid grid-cols-5 max-lg:grid-cols-4 max-md:grid-cols-3 max-sm:grid-cols-2 gap-sm">
                {docs.map((doc) => (
                  <DocCard key={doc.id} doc={doc} />
                ))}
              </div>
            )}
          </section>
        )}

        {showBoards && (
          <section className="mb-xl">
            <SectionHeader
              title="Boards"
              titleOnClick={() => navigate('/boards')}
              link={
                boards.length > MAX_BOARDS
                  ? { text: 'Alle anzeigen →', onClick: () => navigate('/boards') }
                  : undefined
              }
              create={{ onClick: () => navigate('/boards'), label: 'Neues Board erstellen' }}
            />
            {boardsLoading ? (
              <LoadingSpinner />
            ) : displayedBoards.length === 0 ? (
              <EmptyState
                message="Noch keine Boards vorhanden."
                actionLabel="Erstes Board erstellen"
                onAction={() => navigate('/boards')}
              />
            ) : (
              <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-sm">
                {displayedBoards.map((board) => (
                  <BoardCard
                    key={board.id}
                    board={board}
                    onClick={() => navigate(`/boards/${board.id}`)}
                    groups={userGroups}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {(showDocs || showBoards) && <Separator className="mb-xl" />}

        <section>
          <h2 className="text-xl font-semibold text-foreground-heading mb-md">Weitere Tools</h2>
          <ToolGrid tools={visibleTools} />
        </section>
      </PageContainer>
    </ErrorBoundary>
  );
};

export default withAuthRequired(WorkplacePage, {
  title: 'Desk',
});
