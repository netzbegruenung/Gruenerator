import { Button } from '@gruenerator/ui';
import {
  connectionErrorMessage,
  generateDisplayName,
  parseShareLink,
  useTestConnection,
  type SharedWithMeLink,
} from '@gruenerator/wolke';
import { useMemo } from 'react';
import { FiExternalLink, FiWifi } from 'react-icons/fi';

import SettingsListRow from '@/features/settings/components/SettingsListRow';
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
    <SettingsListRow
      mark={displayName.charAt(0).toUpperCase()}
      name={displayName}
      badge={{ label: groupName, tone: 'neutral' }}
      meta={[hostname, sharedByName ? `geteilt von ${sharedByName}` : null, sharedAtDate]
        .filter(Boolean)
        .join(' · ')}
      actions={
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={handleTest}
            disabled={testMutation.isPending}
            title="Verbindung testen"
            aria-label="Verbindung testen"
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
              aria-label="In Nextcloud öffnen"
            >
              <FiExternalLink className="w-4 h-4" />
            </Button>
          )}
        </>
      }
    />
  );
};

export default SharedWolkeConnectionCard;
