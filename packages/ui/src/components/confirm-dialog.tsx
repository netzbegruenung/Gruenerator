import * as React from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog';
import { Button } from './button';

export interface ConfirmOptions {
  /** Dialog heading, e.g. "Spalte löschen?". */
  title: string;
  /** Optional supporting copy shown below the title. */
  description?: string;
  /** Confirm button label. Defaults to "Löschen". */
  confirmLabel?: string;
  /** Cancel button label. Defaults to "Abbrechen". */
  cancelLabel?: string;
  /** Confirm button styling. Defaults to "destructive". */
  variant?: 'default' | 'destructive';
  /**
   * Optional third button shown between Cancel and Confirm (e.g. "Archivieren").
   * Selecting it runs `onSelect` and dismisses the dialog WITHOUT confirming, so
   * the awaited `confirm(...)` resolves `false`.
   */
  alternateAction?: { label: string; onSelect: () => void };
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmDialogContext = React.createContext<ConfirmFn | null>(null);

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

/**
 * Wrap a subtree to give every descendant a promise-based {@link useConfirm}
 * that resolves through a single shared AlertDialog. One dialog instance is
 * reused for all confirmations, so individual delete buttons don't each
 * hand-roll their own dialog state.
 */
export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<PendingConfirm | null>(null);

  const confirm = React.useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    []
  );

  const settle = React.useCallback((confirmed: boolean) => {
    setPending((prev) => {
      prev?.resolve(confirmed);
      return null;
    });
  }, []);

  return (
    <ConfirmDialogContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
            {pending?.description ? (
              <AlertDialogDescription>{pending.description}</AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {pending?.cancelLabel ?? 'Abbrechen'}
            </AlertDialogCancel>
            {pending?.alternateAction ? (
              <Button
                variant="outline"
                onClick={() => {
                  const onSelect = pending.alternateAction?.onSelect;
                  settle(false);
                  onSelect?.();
                }}
              >
                {pending.alternateAction.label}
              </Button>
            ) : null}
            <AlertDialogAction
              variant={pending?.variant ?? 'destructive'}
              onClick={() => settle(true)}
            >
              {pending?.confirmLabel ?? 'Löschen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmDialogContext.Provider>
  );
}

/**
 * Returns a `confirm(options) => Promise<boolean>`. Inside a
 * {@link ConfirmDialogProvider} it resolves via the shared AlertDialog; without
 * one it falls back to the native `window.confirm`, so the hook is safe to call
 * anywhere — including read-only/public trees that never mount the provider.
 */
export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmDialogContext);
  const fallback = React.useCallback<ConfirmFn>(
    (options) =>
      Promise.resolve(
        typeof window !== 'undefined' &&
          window.confirm(
            options.description ? `${options.title}\n\n${options.description}` : options.title
          )
      ),
    []
  );
  return ctx ?? fallback;
}
