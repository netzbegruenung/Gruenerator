import { Badge, Button } from '@gruenerator/ui';
import {
  connectionErrorMessage,
  generateDisplayName,
  parseShareLink,
  useTestConnection,
  type SharedWithMeLink,
} from '@gruenerator/wolke';
import { useMemo } from 'react';
import { FiExternalLink, FiUsers, FiWifi } from 'react-icons/fi';

import { cn } from '@/utils/cn';

interface SharedWolkeConnectionCardProps {
  entry: SharedWithMeLink;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

const SharedWolkeConnectionCard = ({
  entry,
  onSuccess,
  onError,
}: SharedWolkeConnectionCardProps) => {
  const { link, sharedByName, groupName } = entry;
  const testMutation = useTestConnection();

  const parsed = useMemo(
    () => (link.share_link ? parseShareLink(link.share_link) : null),
    [link.share_link]
  );
  const displayName = useMemo(() => generateDisplayName(link), [link]);
  const hostname = parsed?.baseUrl.replace(/^https?:\/\//, '') ?? 'Unbekannter Host';
  const sharedAtDate = entry.sharedAt ? new Date(entry.sharedAt).toLocaleDateString('de-DE') : null;

  const handleTest = async () => {
    if (!link.share_link) return;
    try {
      const result = await testMutation.mutateAsync(link.share_link);
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

  return (
    <div className="rounded-md border border-grey-100 dark:border-grey-800">
      <div className="flex items-center justify-between gap-sm px-md py-sm">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-xs flex-wrap">
            <span className="font-medium text-foreground truncate text-base">{displayName}</span>
            <Badge variant="secondary" className="text-[0.65rem] px-1.5 py-0">
              <FiUsers className="w-3 h-3 mr-1" />
              {groupName}
            </Badge>
          </div>
          <div className="text-xs text-grey-500 dark:text-grey-400 flex items-center gap-xs flex-wrap">
            <span>{hostname}</span>
            {sharedByName && (
              <>
                <span>·</span>
                <span>geteilt von {sharedByName}</span>
              </>
            )}
            {sharedAtDate && (
              <>
                <span>·</span>
                <span>{sharedAtDate}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-xxs shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={handleTest}
            disabled={testMutation.isPending}
            title="Verbindung testen"
          >
            <FiWifi className={cn('w-4 h-4', testMutation.isPending && 'animate-pulse')} />
          </Button>
          {link.share_link && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => window.open(link.share_link, '_blank')}
              title="In Nextcloud öffnen"
            >
              <FiExternalLink className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SharedWolkeConnectionCard;
