import { useState, useEffect, useRef, useMemo } from 'react';
import { FiExternalLink, FiTrash2, FiWifi } from 'react-icons/fi';

import { useDeleteShareLink, useTestConnection } from '../hooks/useWolke';
import {
  generateDisplayName,
  parseShareLink,
  type ShareLink,
  type WolkeScope,
} from '../lib/wolkeApi';

import CloudCard from './CloudCard';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

interface WolkeConnectionCardProps {
  shareLink: ShareLink;
  scope?: WolkeScope;
  scopeId?: string | null;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

const WolkeConnectionCard = ({
  shareLink,
  scope,
  scopeId,
  onSuccess,
  onError,
}: WolkeConnectionCardProps) => {
  const [deleteArmed, setDeleteArmed] = useState(false);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const deleteMutation = useDeleteShareLink(scope, scopeId);
  const testMutation = useTestConnection(scope, scopeId);

  const parsed = useMemo(
    () => (shareLink.share_link ? parseShareLink(shareLink.share_link) : null),
    [shareLink.share_link]
  );
  const displayName = useMemo(() => generateDisplayName(shareLink), [shareLink]);
  const hostname = parsed?.baseUrl.replace(/^https?:\/\//, '') ?? 'Unbekannter Host';
  const dateAdded = shareLink.created_at
    ? new Date(shareLink.created_at).toLocaleDateString('de-DE')
    : null;

  useEffect(() => {
    return () => clearTimeout(deleteTimerRef.current);
  }, []);

  const handleTest = async () => {
    if (!shareLink.share_link) return;
    try {
      const result = await testMutation.mutateAsync(shareLink.share_link);
      if (result.success) {
        onSuccess?.('Verbindung erfolgreich getestet!');
      } else {
        onError?.('Verbindungstest fehlgeschlagen: ' + (result.message || 'Unbekannter Fehler'));
      }
    } catch (error) {
      onError?.('Fehler beim Testen: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleDelete = async () => {
    if (!deleteArmed) {
      setDeleteArmed(true);
      clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = setTimeout(() => setDeleteArmed(false), 3000);
      return;
    }

    try {
      await deleteMutation.mutateAsync(shareLink.id);
      onSuccess?.('Wolke-Verbindung wurde gelöscht.');
    } catch (error) {
      onError?.('Fehler beim Löschen: ' + (error instanceof Error ? error.message : String(error)));
    }
    setDeleteArmed(false);
  };

  return (
    <CloudCard>
      <div className="p-md flex items-start justify-between gap-sm">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-xs mb-xxs">
            <span className="font-medium text-foreground truncate">{displayName}</span>
            <Badge
              variant={shareLink.is_active ? 'default' : 'secondary'}
              className="text-[0.65rem] px-1.5 py-0"
            >
              {shareLink.is_active ? 'Aktiv' : 'Inaktiv'}
            </Badge>
          </div>
          <div className="text-xs text-grey-500 dark:text-grey-400 flex items-center gap-xs flex-wrap">
            <span>{hostname}</span>
            {dateAdded && (
              <>
                <span>·</span>
                <span>{dateAdded}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-xxs shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleTest}
            disabled={testMutation.isPending || !shareLink.is_active}
            title="Verbindung testen"
          >
            <FiWifi className={cn('w-4 h-4', testMutation.isPending && 'animate-pulse')} />
          </Button>

          {shareLink.share_link && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => window.open(shareLink.share_link, '_blank')}
              title="In Nextcloud öffnen"
            >
              <FiExternalLink className="w-4 h-4" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8',
              deleteArmed && 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
            )}
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            title={deleteArmed ? 'Nochmal klicken zum Löschen' : 'Löschen'}
          >
            <FiTrash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </CloudCard>
  );
};

export default WolkeConnectionCard;
