import { Button } from '@gruenerator/ui';
import {
  useDeleteShareLink,
  useTestConnection,
  connectionErrorMessage,
  generateDisplayName,
  parseShareLink,
  WolkeFolderBrowser,
  type ShareLink,
} from '@gruenerator/wolke';
import { useState, useEffect, useRef, useMemo } from 'react';
import { FiChevronDown, FiExternalLink, FiTrash2, FiUsers, FiWifi } from 'react-icons/fi';

import ShareWolkeLinkDialog from './ShareWolkeLinkDialog';

import SettingsListRow from '@/features/settings/components/SettingsListRow';
import { cn } from '@/utils/cn';

interface WolkeConnectionCardProps {
  shareLink: ShareLink;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

const WolkeConnectionCard = ({ shareLink, onSuccess, onError }: WolkeConnectionCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const deleteMutation = useDeleteShareLink();
  const testMutation = useTestConnection();

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
        // Nicht `result.message` — das ist der englische Maschinenstring des
        // Backends; der errorCode trägt die deutsche, handlungsleitende Fassung.
        onError?.('Verbindungstest fehlgeschlagen: ' + connectionErrorMessage(result.errorCode));
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
    } catch (error) {
      onError?.('Fehler beim Löschen: ' + (error instanceof Error ? error.message : String(error)));
    }
    setDeleteArmed(false);
  };

  return (
    <SettingsListRow
      mark={displayName.charAt(0).toUpperCase()}
      name={
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={`wolke-files-${shareLink.id}`}
          onClick={() => setExpanded((v) => !v)}
          className="flex max-w-full items-center gap-xs rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
        >
          <FiChevronDown
            aria-hidden
            className={cn(
              'h-4 w-4 shrink-0 text-grey-400 transition-transform duration-200 dark:text-grey-500',
              !expanded && '-rotate-90'
            )}
          />
          <span className="truncate">{displayName}</span>
        </button>
      }
      badge={{
        label: shareLink.is_active ? 'Aktiv' : 'Inaktiv',
        tone: shareLink.is_active ? 'primary' : 'neutral',
      }}
      meta={[hostname, dateAdded].filter(Boolean).join(' · ')}
      actions={
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={handleTest}
            disabled={testMutation.isPending || !shareLink.is_active}
            title="Verbindung testen"
            aria-label="Verbindung testen"
          >
            <FiWifi className={cn('w-4 h-4', testMutation.isPending && 'animate-pulse')} />
          </Button>

          {shareLink.share_link && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => window.open(shareLink.share_link, '_blank')}
              title="In Nextcloud öffnen"
              aria-label="In Nextcloud öffnen"
            >
              <FiExternalLink className="w-4 h-4" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setShareDialogOpen(true)}
            title="Mit Projekt oder Gruppe teilen"
            aria-label="Mit Projekt oder Gruppe teilen"
          >
            <FiUsers className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-9 w-9',
              deleteArmed && 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
            )}
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            title={deleteArmed ? 'Nochmal klicken zum Löschen' : 'Löschen'}
            aria-label={deleteArmed ? 'Nochmal klicken zum Löschen' : 'Löschen'}
          >
            <FiTrash2 className="w-4 h-4" />
          </Button>
        </>
      }
    >
      {expanded && (
        <div id={`wolke-files-${shareLink.id}`} className="pb-sm">
          <WolkeFolderBrowser shareLinkId={shareLink.id} shareLinkUrl={shareLink.share_link} />
        </div>
      )}
      <ShareWolkeLinkDialog
        shareLinkId={shareLink.id}
        displayName={displayName}
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        onSuccess={onSuccess}
        onError={onError}
      />
    </SettingsListRow>
  );
};

export default WolkeConnectionCard;
