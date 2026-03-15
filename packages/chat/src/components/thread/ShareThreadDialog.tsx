'use client';

import { useEffect } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { Users, Check, X } from 'lucide-react';
import { useThreadSharing } from '../../hooks/useThreadSharing';

interface ShareThreadDialogProps {
  threadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareThreadDialog({ threadId, open, onOpenChange }: ShareThreadDialogProps) {
  const { sharedGroups, userGroups, loading, shareWithGroup, unshare, reload } = useThreadSharing(
    open ? threadId : null
  );

  useEffect(() => {
    if (open && threadId) reload();
  }, [open, threadId, reload]);

  const sharedIds = new Set(sharedGroups.map((g) => g.group_id));

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content className="fixed inset-0 z-50 m-auto h-fit w-full max-w-[24rem] rounded-xl border border-grey-200 dark:border-grey-700 bg-background-pure p-6 shadow-xl">
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
}
