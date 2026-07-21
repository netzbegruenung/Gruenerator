import { ShareDialogBody } from '../../collab-share/components/ShareDialogBody';
import { useDocumentSharing } from '../../collab-share/useDocumentSharing';
import { Button } from '@gruenerator/ui';
import { useMemo, useState } from 'react';

import { useDocsAdapter, createDocsApiClient } from '../../context/DocsContext';

interface ShareModalProps {
  documentId: string;
  documentTitle?: string;
  onClose: () => void;
}

export const ShareModal = ({ documentId, documentTitle, onClose }: ShareModalProps) => {
  const adapter = useDocsAdapter();
  const apiClient = useMemo(() => createDocsApiClient(adapter), [adapter]);
  const userDisplayName = adapter.getCurrentUserDisplayName?.() ?? null;

  const [copySuccess, setCopySuccess] = useState(false);
  const [directShareSuccess, setDirectShareSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sharing = useDocumentSharing(documentId, { namespace: 'docs', apiClient });

  const shareUrl = `${window.location.origin}${adapter.getDocumentUrl(documentId)}`;

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
      setError('Fehler beim Kopieren des Links');
    }
  };

  const directShare = async () => {
    const title = documentTitle || 'Dokument';
    const message = userDisplayName
      ? `${userDisplayName} möchte „${title}" mit dir teilen:\n${shareUrl}`
      : shareUrl;

    try {
      if (navigator.share) {
        await navigator.share({ title, text: message });
      } else {
        await navigator.clipboard.writeText(message);
        setDirectShareSuccess(true);
        setTimeout(() => setDirectShareSuccess(false), 2000);
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'AbortError') {
        console.error('Failed to share:', err);
        setError('Fehler beim Teilen');
      }
    }
  };

  const saveAsTemplate = async (title: string) => {
    await apiClient.post(`/docs/${documentId}/save-as-template`, {
      title,
      is_private: true,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-[480px] max-w-[90%] flex-col overflow-hidden rounded-lg bg-background shadow-lg dark:border dark:border-grey-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-grey-200 p-6 dark:border-grey-700">
          <span className="text-lg font-semibold">Dokument teilen</span>
          <button
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded border-none bg-transparent p-0 text-lg text-foreground hover:bg-black/5 dark:hover:bg-white/10"
          >
            ×
          </button>
        </div>

        {error && (
          <p className="border-b border-grey-200 px-6 py-2 text-sm text-red-600 dark:border-grey-700">
            {error}
          </p>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          <ShareDialogBody
            sharing={sharing}
            shareUrl={shareUrl}
            onSaveAsTemplate={saveAsTemplate}
            defaultTemplateTitle={documentTitle}
          />
        </div>

        <div className="flex items-center gap-2 border-t border-grey-200 p-4 px-6 dark:border-grey-700">
          <Button variant="outline" size="xs" className="rounded-full" onClick={copyShareLink}>
            {copySuccess ? '✓ Kopiert' : 'Link kopieren'}
          </Button>
          {userDisplayName && (
            <Button size="xs" className="rounded-full" onClick={directShare}>
              {directShareSuccess ? '✓ Kopiert' : 'Direkt teilen'}
            </Button>
          )}
          <Button className="ml-auto" onClick={onClose}>
            Fertig
          </Button>
        </div>
      </div>
    </div>
  );
};
