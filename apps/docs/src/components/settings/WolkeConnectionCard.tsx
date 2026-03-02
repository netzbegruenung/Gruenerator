import { ActionIcon, Badge, Tooltip } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { FiExternalLink, FiTrash2, FiWifi } from 'react-icons/fi';

import { type ShareLink, deleteShareLink, testConnection } from '../../lib/wolkeApi';

type TestStatus = 'idle' | 'loading' | 'success' | 'error';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function extractHostname(url: string | null): string {
  if (!url) return 'Unbekannt';
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

interface WolkeConnectionCardProps {
  link: ShareLink;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

export function WolkeConnectionCard({ link, onError, onSuccess }: WolkeConnectionCardProps) {
  const queryClient = useQueryClient();
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const deleteMutation = useMutation({
    mutationFn: () => deleteShareLink(link.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wolke-share-links'] });
      onSuccess('Verbindung wurde entfernt.');
    },
    onError: () => onError('Verbindung konnte nicht entfernt werden.'),
  });

  const handleTest = async () => {
    setTestStatus('loading');
    try {
      const result = await testConnection(link.share_link);
      setTestStatus(result.success ? 'success' : 'error');
      if (result.success) {
        onSuccess('Verbindung erfolgreich!');
      } else {
        onError(result.message || 'Verbindung fehlgeschlagen.');
      }
    } catch {
      setTestStatus('error');
      onError('Verbindungstest fehlgeschlagen.');
    }
    timerRef.current = setTimeout(() => setTestStatus('idle'), 4000);
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      timerRef.current = setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    deleteMutation.mutate();
    setConfirmDelete(false);
  };

  const hostname = extractHostname(link.base_url || link.share_link);
  const displayLabel = link.label || hostname;

  const testIconColor =
    testStatus === 'success' ? 'green' : testStatus === 'error' ? 'red' : 'gray';

  return (
    <div className="wolke-connection-row">
      <div className="wolke-connection-info">
        <span className="wolke-connection-label">{displayLabel}</span>
        <span className="wolke-connection-host">{hostname}</span>
        <span className="wolke-connection-date">Hinzugefügt am {formatDate(link.created_at)}</span>
      </div>

      <div className="wolke-connection-actions">
        <Badge color={link.is_active ? 'green' : 'gray'} variant="light" size="sm">
          {link.is_active ? 'Aktiv' : 'Inaktiv'}
        </Badge>

        <Tooltip label="Verbindung testen">
          <ActionIcon
            variant="subtle"
            color={testIconColor}
            size="md"
            onClick={handleTest}
            loading={testStatus === 'loading'}
            aria-label="Verbindung testen"
          >
            <FiWifi size={16} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="In Nextcloud öffnen">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="md"
            component="a"
            href={link.share_link}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="In Nextcloud öffnen"
          >
            <FiExternalLink size={16} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={confirmDelete ? 'Nochmal klicken zum Bestätigen' : 'Verbindung entfernen'}>
          <ActionIcon
            variant="subtle"
            color="red"
            size="md"
            onClick={handleDelete}
            loading={deleteMutation.isPending}
            aria-label="Verbindung entfernen"
            style={confirmDelete ? { background: 'var(--mantine-color-red-1)' } : undefined}
          >
            <FiTrash2 size={16} />
          </ActionIcon>
        </Tooltip>
      </div>
    </div>
  );
}
