import { PresenceAvatars, useCollaborators } from '@gruenerator/collab';
import { Button } from '@gruenerator/ui';
import { HiShare } from 'react-icons/hi';

import { ShareCanvasDialog } from './ShareCanvasDialog';

import type { HocuspocusProvider } from '@hocuspocus/provider';

interface CanvasPageHeaderProps {
  canvasId: string;
  title: string;
  provider: HocuspocusProvider | null;
  isConnected: boolean;
  isSynced: boolean;
  onShareClick: () => void;
  shareOpen: boolean;
  onShareOpenChange: (open: boolean) => void;
}

export function CanvasPageHeader({
  canvasId,
  title,
  provider,
  isConnected,
  isSynced,
  onShareClick,
  shareOpen,
  onShareOpenChange,
}: CanvasPageHeaderProps) {
  const collaborators = useCollaborators(provider);
  const statusLabel = !isSynced
    ? 'Synchronisiere...'
    : isConnected
      ? 'Live'
      : 'Verbindung getrennt';

  return (
    <div className="z-10 flex items-center justify-between gap-sm px-md py-sm border-b border-grey-200 dark:border-grey-700 bg-background">
      <div className="flex items-center gap-sm min-w-0">
        <span className="text-sm font-medium text-foreground-heading truncate">{title}</span>
        <span className="text-[10px] text-grey-400 px-1.5 py-0.5 rounded border border-grey-200 dark:border-grey-700">
          {statusLabel}
        </span>
      </div>
      <div className="flex items-center gap-sm">
        <PresenceAvatars collaborators={collaborators} compact />
        <Button size="sm" variant="outline" onClick={onShareClick}>
          <HiShare size={14} />
          <span className="ml-1">Teilen</span>
        </Button>
      </div>
      <ShareCanvasDialog canvasId={canvasId} open={shareOpen} onOpenChange={onShareOpenChange} />
    </div>
  );
}
