import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';
import React, { useState, useEffect } from 'react';
import { FaCheck, FaCopy, FaShareAlt } from 'react-icons/fa';
import QRCode from 'react-qr-code';

import EnhancedSelect from '../../../components/common/EnhancedSelect/EnhancedSelect';
import { useSubtitlerShareStore, getShareUrl } from '../../../stores/subtitlerShareStore';
import { canShare, shareContent } from '../../../utils/shareUtils';

import { cn } from '@/utils/cn';

const expirationOptions = [
  { value: 1, label: '1 Tag' },
  { value: 7, label: '7 Tage' },
  { value: 14, label: '14 Tage' },
  { value: 30, label: '30 Tage' },
];

interface ShareVideoModalProps {
  projectId: string;
  title?: string;
  onClose: () => void;
}

const ShareVideoModal: React.FC<ShareVideoModalProps> = ({ projectId, title, onClose }) => {
  const [shareTitle, setShareTitle] = useState(title || 'Untertiteltes Video');
  const [expiresInDays, setExpiresInDays] = useState(expirationOptions[1]);
  const [copied, setCopied] = useState(false);

  const {
    createShareFromProject,
    currentShare,
    isCreatingShare,
    error,
    errorCode,
    clearError,
    clearCurrentShare,
  } = useSubtitlerShareStore();

  useEffect(() => {
    clearCurrentShare();
    clearError();
  }, [clearCurrentShare, clearError]);

  const handleCreateShare = async () => {
    if (!projectId) return;
    try {
      clearError();
      await createShareFromProject(projectId, shareTitle, expiresInDays.value);
    } catch (err) {
      console.error('Failed to create share:', err);
    }
  };

  const handleCopyLink = () => {
    if (currentShare?.shareToken) {
      const url = getShareUrl(currentShare.shareToken);
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNativeShare = async () => {
    if (currentShare?.shareToken) {
      const url = getShareUrl(currentShare.shareToken);
      await shareContent({
        title: shareTitle,
        text: 'Schau dir dieses Video an!',
        url,
      });
    }
  };

  const formatExpiration = (expiresAt: string | undefined): string => {
    if (!expiresAt) return '';
    const date = new Date(expiresAt);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[32rem]">
        <DialogHeader>
          <DialogTitle>Video teilen</DialogTitle>
          {!currentShare && (
            <DialogDescription>
              Erstelle einen Link, den du mit anderen teilen kannst.
            </DialogDescription>
          )}
        </DialogHeader>

        {!currentShare ? (
          <>
            <div className="flex flex-col gap-md">
              <div className="flex flex-col gap-xxs">
                <label htmlFor="shareTitle" className="text-sm font-medium text-foreground">
                  Titel
                </label>
                <input
                  id="shareTitle"
                  type="text"
                  value={shareTitle}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setShareTitle(e.target.value)
                  }
                  placeholder="Titel für das geteilte Video"
                  className="rounded-md border border-grey-300 bg-background px-sm py-xs text-foreground outline-none transition-colors focus:border-primary-500 dark:border-grey-600"
                />
              </div>

              <EnhancedSelect
                label="Link gültig für"
                options={expirationOptions}
                value={expiresInDays}
                onChange={(option) =>
                  option && setExpiresInDays(option as { value: number; label: string })
                }
                isSearchable={false}
                menuPlacement="auto"
              />
            </div>

            {error && (
              <div
                className={cn(
                  'flex items-center gap-sm rounded-md p-sm text-sm',
                  errorCode === 'EXPORT_REQUIRED'
                    ? 'bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200'
                    : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                )}
              >
                {error}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={isCreatingShare}>
                Abbrechen
              </Button>
              <Button onClick={handleCreateShare} disabled={isCreatingShare || !shareTitle.trim()}>
                {isCreatingShare ? 'Wird erstellt...' : 'Link erstellen'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {currentShare.status === 'rendering' && (
              <p className="text-sm text-grey-500">
                Das Video wird im Hintergrund gerendert. Der Empfänger kann es herunterladen, sobald
                es fertig ist.
              </p>
            )}

            <div className="flex gap-lg max-sm:flex-col max-sm:items-center">
              <div className="shrink-0 rounded-lg bg-white p-sm">
                <QRCode value={getShareUrl(currentShare.shareToken || '')} size={160} level="M" />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-xs">
                <label className="text-sm font-medium text-foreground">Link kopieren</label>
                <div className="flex gap-xxs">
                  <input
                    type="text"
                    readOnly
                    value={getShareUrl(currentShare.shareToken || '')}
                    className="min-w-0 flex-1 rounded-md border border-grey-300 bg-background-alt px-sm py-xs text-sm text-foreground dark:border-grey-600"
                  />
                  <Button variant="outline" size="icon" onClick={handleCopyLink} title="Kopieren">
                    {copied ? <FaCheck /> : <FaCopy />}
                  </Button>
                  {canShare() && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleNativeShare}
                      title="Teilen"
                    >
                      <FaShareAlt />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-grey-500">
                  Gültig bis {formatExpiration(currentShare.expiresAt as string | undefined)}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={onClose}>Fertig</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ShareVideoModal;
