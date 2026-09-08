'use client';

import { buildChatThreadSlug } from '@gruenerator/shared/utils';
import { Users, Check, Copy, Link2, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { memo, useEffect, useState } from 'react';

import { useThreadSharing } from '../../hooks/useThreadSharing';

interface ShareThreadDialogProps {
  threadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ShareThreadDialog = memo(function ShareThreadDialog({
  threadId,
  open,
  onOpenChange,
}: ShareThreadDialogProps) {
  const {
    sharedGroups,
    userGroups,
    loading,
    shareWithGroup,
    unshare,
    reload,
    shareMode,
    slugSuffix,
    threadTitle,
    shareModeLoading,
    setShareMode,
  } = useThreadSharing(open ? threadId : null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open && threadId) void reload();
  }, [open, threadId, reload]);

  const sharedIds = new Set(sharedGroups.map((g) => g.group_id));

  const linkEnabled = shareMode === 'authenticated';
  const shareUrl =
    linkEnabled && slugSuffix
      ? `${window.location.origin}/chat/geteilt/${buildChatThreadSlug(threadTitle, slugSuffix)}`
      : null;

  const copyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[1010] bg-black/40" />
        <DialogPrimitive.Content className="fixed inset-0 z-[1010] m-auto h-fit max-h-[calc(100dvh-2rem)] w-full max-w-[24rem] overflow-y-auto rounded-xl border border-grey-200 dark:border-grey-700 bg-background-pure p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary-600" />
              <DialogPrimitive.Title className="text-lg font-semibold text-foreground">
                Chat teilen
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close className="rounded-md p-1 text-grey-400 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800 bg-transparent border-none cursor-pointer">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          {/* Per Link teilen — read-only archive view, login required */}
          <div className="mb-4 rounded-lg border border-grey-200 dark:border-grey-700 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Link2 className="h-4 w-4 shrink-0 text-primary-600" />
                <span className="text-sm text-foreground">Per Link teilen</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={linkEnabled}
                aria-label="Link-Freigabe"
                disabled={shareModeLoading}
                onClick={() => void setShareMode(linkEnabled ? 'private' : 'authenticated')}
                className={`relative h-5 w-9 shrink-0 rounded-full border-none transition-colors cursor-pointer disabled:opacity-50 ${
                  linkEnabled ? 'bg-primary-600' : 'bg-grey-300 dark:bg-grey-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                    linkEnabled ? 'left-0.5 translate-x-4' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
            {linkEnabled && shareUrl && (
              <div className="mt-2 flex items-center gap-1.5">
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-md border border-grey-200 dark:border-grey-700 bg-background px-2 py-1.5 text-xs text-foreground-muted"
                />
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  className="flex shrink-0 items-center gap-1 rounded-md border border-grey-200 dark:border-grey-700 bg-transparent px-2 py-1.5 text-xs text-foreground-muted hover:bg-primary-500/5 hover:text-foreground cursor-pointer"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Kopiert' : 'Kopieren'}
                </button>
              </div>
            )}
            <p className="mt-2 text-xs text-grey-400">
              {linkEnabled
                ? 'Alle angemeldeten Personen mit dem Link können diesen Chat lesen. Deaktivieren macht den Link ungültig.'
                : 'Nur Lesen, Anmeldung erforderlich.'}
            </p>
          </div>

          {loading && <p className="text-sm text-grey-400 py-4 text-center">Laden...</p>}

          {!loading && userGroups.length === 0 && (
            <p className="text-sm text-grey-400 py-4 text-center">
              Du bist in keiner Gruppe. Erstelle oder trete einer Gruppe bei.
            </p>
          )}

          {!loading && userGroups.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-grey-400 mb-2">Mit Gruppe teilen:</p>
              {userGroups.map((group) => {
                const isShared = sharedIds.has(group.id);
                return (
                  <button
                    key={group.id}
                    onClick={() => (isShared ? unshare(group.id) : shareWithGroup(group.id))}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors bg-transparent border cursor-pointer ${
                      isShared
                        ? 'border-primary-500/30 bg-primary-500/5 text-foreground'
                        : 'border-grey-200 dark:border-grey-700 text-foreground-muted hover:border-primary-500/30 hover:bg-primary-500/5'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span>{group.name}</span>
                    </div>
                    {isShared && (
                      <span className="flex items-center gap-1 text-xs text-primary-600">
                        <Check className="h-3.5 w-3.5" />
                        Geteilt
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
});
