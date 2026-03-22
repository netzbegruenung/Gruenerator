import { Button } from '@gruenerator/ui';
import { useState } from 'react';
import { PiCopy, PiCheck, PiTrash, PiDownloadSimple } from 'react-icons/pi';

import { buildUrl } from '../../../config/domains';
import { copyToClipboard } from '../../../utils/shareUtils';
import { useTransferList, useDeleteTransfer } from '../hooks/useTransfer';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default function TransferList() {
  const { data: transfers, isLoading } = useTransferList();
  const deleteMutation = useDeleteTransfer();
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  if (isLoading || !transfers || transfers.length === 0) return null;

  const handleCopy = async (shareToken: string) => {
    const url = buildUrl(`/transfer/${shareToken}`);
    const success = await copyToClipboard(url);
    if (success) {
      setCopiedToken(shareToken);
      setTimeout(() => setCopiedToken(null), 2500);
    }
  };

  const handleDelete = (shareToken: string) => {
    deleteMutation.mutate(shareToken);
  };

  return (
    <div className="mt-xl flex flex-col gap-md">
      <h3 className="m-0 text-base font-semibold text-foreground">Bisherige Transfers</h3>

      <div className="flex flex-col gap-sm">
        {transfers.map((transfer) => (
          <div
            key={transfer.id}
            className="flex items-center gap-md rounded-lg border border-grey-200 bg-background p-md dark:border-grey-700"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium text-foreground">
                {transfer.fileName}
              </span>
              <span className="text-xs text-grey-400">
                {formatFileSize(transfer.fileSize)} · {formatDate(transfer.createdAt)}
                {transfer.downloadCount > 0 && (
                  <>
                    {' '}
                    · <PiDownloadSimple className="inline size-3" /> {transfer.downloadCount}
                  </>
                )}
              </span>
            </div>

            <div className="flex shrink-0 gap-xs">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleCopy(transfer.shareToken)}
                title="Link kopieren"
              >
                {copiedToken === transfer.shareToken ? (
                  <PiCheck className="size-4 text-green-600" />
                ) : (
                  <PiCopy className="size-4" />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(transfer.shareToken)}
                disabled={deleteMutation.isPending}
                title="Löschen"
              >
                <PiTrash className="size-4 text-red-500" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
