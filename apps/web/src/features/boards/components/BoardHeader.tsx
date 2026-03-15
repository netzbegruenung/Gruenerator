import { useCollaborators } from '@gruenerator/collab';
import { FiArrowLeft } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import { PresenceAvatars } from './PresenceAvatars';

import type { HocuspocusProvider } from '@hocuspocus/provider';

interface BoardHeaderProps {
  title: string;
  isConnected: boolean;
  isSynced: boolean;
  provider: HocuspocusProvider | null;
}

export function BoardHeader({ title, isConnected, isSynced, provider }: BoardHeaderProps) {
  const navigate = useNavigate();
  const collaborators = useCollaborators(provider);

  const statusClass = !isConnected ? 'bg-red-500' : !isSynced ? 'bg-yellow-500' : 'bg-green-500';
  const statusTitle = !isConnected
    ? 'Nicht verbunden'
    : !isSynced
      ? 'Synchronisiert...'
      : 'Verbunden';

  return (
    <div className="flex items-center gap-sm sm:gap-md px-md sm:px-lg py-2.5 sm:py-3 border-b border-grey-200 bg-background dark:border-grey-700">
      <button
        onClick={() => navigate('/boards')}
        className="flex items-center gap-xs text-foreground hover:text-primary-600 transition-colors bg-transparent border-none cursor-pointer p-xs rounded-md hover:bg-grey-100 dark:hover:bg-grey-800"
        aria-label="Zurück zur Board-Liste"
      >
        <FiArrowLeft size={20} />
      </button>

      <h1 className="text-lg font-semibold text-foreground-heading m-0 flex-1 truncate">{title}</h1>

      <PresenceAvatars collaborators={collaborators} />

      <div className="flex items-center gap-xs">
        <div className={`w-2 h-2 rounded-full ${statusClass}`} title={statusTitle} />
        <span className="text-xs text-grey-500">{statusTitle}</span>
      </div>
    </div>
  );
}
