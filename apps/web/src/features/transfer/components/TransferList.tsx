import { Button } from '@gruenerator/ui';
import { useState } from 'react';
import { PiCopy, PiCheck, PiTrash, PiDownloadSimple, PiLock, PiTimer } from 'react-icons/pi';

import { formatDate } from '../../../components/utils/documentOverviewUtils';
import { buildUrl } from '../../../config/domains';
import { formatFileSize } from '../../../utils/formatFileSize';
import { copyToClipboard } from '../../../utils/shareUtils';
import { useTransferList, useDeleteTransfer } from '../hooks/useTransfer';

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

export default function TransferList() {
  const { data: transfers, isLoading } = useTransferList();
  const deleteMutation = useDeleteTransfer();
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  if (isLoading || !transfers || transfers.length === 0) return null;

  const handleCopy = async (shareToken: string) => {
    const url = buildUrl(`/share/${shareToken}`);
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
        {transfers.map((transfer) => {
          const expired = isExpired(transfer.expiresAt);

          return (
            <div
              key={transfer.id}
              className={`flex items-center gap-md rounded-lg border border-grey-200 bg-background p-md dark:border-grey-700 ${expired ? 'opacity-50' : ''}`}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-foreground">
                  {transfer.fileName}
                </span>
                <div className="flex flex-wrap items-center gap-xs text-xs text-grey-400">
                  <span>{formatFileSize(transfer.fileSize)}</span>
                  <span>·</span>
                  <span>{formatDate(transfer.createdAt)}</span>
                  {transfer.downloadCount > 0 && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-0.5">
                        <PiDownloadSimple className="size-3" /> {transfer.downloadCount}
                      </span>
                    </>
                  )}
                  {transfer.isPasswordProtected && (
                    <span
                      className="inline-flex items-center gap-0.5 text-amber-500"
                      title="Passwortgeschützt"
                    >
                      <PiLock className="size-3" />
                    </span>
                  )}
                  {transfer.expiresAt && (
                    <span
                      className={`inline-flex items-center gap-0.5 ${expired ? 'text-red-500' : ''}`}
                      title={
                        expired ? 'Abgelaufen' : `Gültig bis ${formatDate(transfer.expiresAt)}`
                      }
                    >
                      <PiTimer className="size-3" />
                      {expired ? 'Abgelaufen' : formatDate(transfer.expiresAt)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 gap-xs">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleCopy(transfer.shareToken)}
                  title="Link kopieren"
                  disabled={expired}
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
          );
        })}
      </div>
    </div>
  );
}
