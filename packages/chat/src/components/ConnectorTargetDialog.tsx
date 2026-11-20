'use client';

import { type ConnectorTarget, type ConnectorTargetProvider } from '@gruenerator/contracts';
import { isToastEvent } from '@gruenerator/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Folder, Hash, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useState } from 'react';

import { CloudExportError } from '../lib/cloudExport';
import { connectorProviderName, fetchConnectorTargets } from '../lib/connectorSend';
import { useChatConfigStore } from '../stores/chatConfigStore';

interface ConnectorTargetDialogProps {
  provider: ConnectorTargetProvider;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (target: { id: string; name: string }) => void;
  /** Hosts outside the chat (Docs) bring their own authenticated fetch. */
  fetchFn?: (url: string, options?: RequestInit) => Promise<Response>;
}

interface Crumb {
  id: string;
  name: string;
}

/**
 * „Ziel wählen“: führt Ebene für Ebene zu einem Teams- oder Slack-Kanal.
 * Zeilen mit `hasChildren` öffnen die nächste Ebene,
 * `selectable` Zeilen werden gewählt und mit „Hierhin senden“ bestätigt.
 */
export function ConnectorTargetDialog({
  provider,
  open,
  onOpenChange,
  onPick,
  fetchFn,
}: ConnectorTargetDialogProps) {
  const [trail, setTrail] = useState<Crumb[]>([]);
  const [chosen, setChosen] = useState<ConnectorTarget | null>(null);
  const parent = trail.at(-1)?.id ?? null;
  const where = connectorProviderName(provider);

  const targets = useQuery<ConnectorTarget[]>({
    queryKey: ['connector-targets', provider, parent],
    queryFn: () =>
      fetchConnectorTargets(fetchFn ?? useChatConfigStore.getState().fetch, provider, parent),
    enabled: open,
    staleTime: 15_000,
    retry: (count, error) => !(error instanceof CloudExportError) && count < 1,
  });

  const reauth = targets.error instanceof CloudExportError && targets.error.reauth;
  const entries = targets.data ?? [];

  const openEntry = (entry: ConnectorTarget) => {
    setTrail((t) => [...t, { id: entry.id, name: entry.name }]);
    setChosen(null);
  };

  const goBack = () => {
    setTrail((t) => t.slice(0, -1));
    setChosen(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setTrail([]);
      setChosen(null);
    }
    onOpenChange(next);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[1010] bg-black/40" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[1010] m-auto flex h-fit max-h-[calc(100dvh-2rem)] w-full max-w-[26rem] flex-col rounded-xl border border-grey-200 dark:border-grey-700 bg-background-pure shadow-xl"
          onInteractOutside={(event) => {
            if (isToastEvent(event)) event.preventDefault();
          }}
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <DialogPrimitive.Title className="text-lg font-semibold text-foreground">
              Ziel wählen · {where}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              type="button"
              aria-label="Schließen"
              className="rounded-md p-1 text-grey-400 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800 bg-transparent border-none cursor-pointer"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          {trail.length > 0 && (
            <div className="flex items-center gap-2 border-y border-border px-3 py-2 text-sm">
              <button
                type="button"
                onClick={goBack}
                aria-label="Eine Ebene zurück"
                className="rounded-md p-1 text-foreground-muted hover:bg-grey-100 dark:hover:bg-grey-800"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="truncate text-foreground-muted">
                {trail.map((c) => c.name).join(' / ')}
              </span>
            </div>
          )}

          <div className="min-h-[8rem] flex-1 overflow-y-auto py-1" aria-live="polite">
            {targets.isLoading ? (
              <p className="px-5 py-4 text-sm text-foreground-muted">Lade Ziele …</p>
            ) : targets.isError ? (
              <p role="alert" className="px-5 py-4 text-sm text-red-700 dark:text-red-400">
                {reauth
                  ? `${targets.error.message} Einstellungen → Konnektoren → ${where}.`
                  : targets.error instanceof CloudExportError
                    ? targets.error.message
                    : 'Die Ziele konnten nicht geladen werden.'}
              </p>
            ) : entries.length === 0 ? (
              <p className="px-5 py-4 text-sm text-foreground-muted">Keine Ziele gefunden.</p>
            ) : (
              entries.map((entry) => {
                const isChosen = chosen?.id === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    aria-pressed={entry.selectable && !entry.hasChildren ? isChosen : undefined}
                    aria-label={entry.hasChildren ? `${entry.name} öffnen` : entry.name}
                    onClick={() => {
                      if (entry.hasChildren) openEntry(entry);
                      else if (entry.selectable) setChosen(entry);
                    }}
                    disabled={!entry.hasChildren && !entry.selectable}
                    className={`flex w-full items-center gap-2 px-5 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      isChosen
                        ? 'bg-primary/10 text-foreground'
                        : 'text-foreground-muted hover:bg-primary/5'
                    }`}
                  >
                    {entry.hasChildren ? (
                      <Folder aria-hidden className="h-4 w-4 flex-shrink-0" />
                    ) : (
                      <Hash aria-hidden className="h-4 w-4 flex-shrink-0" />
                    )}
                    <span className="flex-1 truncate">{entry.name}</span>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-grey-100 dark:hover:bg-grey-800"
            >
              Abbrechen
            </button>
            <button
              type="button"
              disabled={!chosen}
              onClick={() => {
                if (!chosen) return;
                onPick({ id: chosen.id, name: chosen.name });
                handleOpenChange(false);
              }}
              className="rounded-lg bg-primary-600 px-3 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
            >
              Hierhin senden
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
