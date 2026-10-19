import { MARKETPLACE_QUERY_KEY, marketplaceHref } from '@gruenerator/shared/marketplace';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  cn,
  toast,
} from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';

import { ADD_KINDS, type AddKind, type AddResult, type AddSelection } from './addKinds';

type Step =
  | { step: 'kind' }
  | { step: 'item'; kind: AddKind }
  | { step: 'visibility'; kind: AddKind; selection: AddSelection };

const STEP_LABELS = ['Art', 'Auswahl', 'Sichtbarkeit'] as const;
const STEP_INDEX: Record<Step['step'], number> = { kind: 0, item: 1, visibility: 2 };

export interface MarketplaceAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * „Element hinzufügen": something the person already has — an Agent, Rezept,
 * Vorlage, Sticker or Hintergrund — goes into the Marktplatz, into a project,
 * or back to private. Creating happens elsewhere; this only shares.
 */
export function MarketplaceAddDialog({
  open,
  onOpenChange,
}: MarketplaceAddDialogProps): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-md overflow-y-auto sm:max-w-[560px]">
        {open && <AddFlow onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function AddFlow({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<Step>({ step: 'kind' });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const current = STEP_INDEX[state.step];

  const done = (result: AddResult) => {
    toast.success(result.message);
    void queryClient.invalidateQueries({ queryKey: MARKETPLACE_QUERY_KEY });
    onClose();
    if (result.marketplaceItem) void navigate(marketplaceHref({ item: result.marketplaceItem }));
  };

  return (
    <>
      <div className="flex flex-col gap-xs">
        <DialogTitle>Element hinzufügen</DialogTitle>
        <DialogDescription>
          {state.step === 'kind'
            ? 'Was möchtest du teilen?'
            : state.step === 'item'
              ? `Welche deiner ${state.kind.pluralLabel}?`
              : `Wer soll „${state.selection.title}“ sehen?`}
        </DialogDescription>
      </div>

      <ol aria-label="Schritte" className="m-0 flex list-none gap-sm p-0 text-xs">
        {STEP_LABELS.map((label, index) => (
          <li
            key={label}
            aria-current={index === current ? 'step' : undefined}
            className={cn(
              'rounded-full px-sm py-0.5',
              index === current
                ? 'bg-primary-500/10 font-medium text-foreground'
                : 'text-grey-500 dark:text-grey-400'
            )}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {state.step === 'kind' ? (
        <ul aria-label="Arten" className="m-0 grid list-none grid-cols-1 gap-sm p-0 sm:grid-cols-2">
          {ADD_KINDS.map((kind) => (
            <li key={kind.kind}>
              <button
                type="button"
                onClick={() => setState({ step: 'item', kind })}
                className="flex w-full items-start gap-sm rounded-lg border border-grey-200 p-md text-left transition-colors hover:border-grey-300 hover:bg-background-alt dark:border-grey-700"
              >
                <span className="mt-0.5 shrink-0 text-lg">{kind.icon}</span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{kind.label}</span>
                  <span className="text-xs text-grey-500 dark:text-grey-400">{kind.hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {state.step === 'item' ? (
        <>
          <state.kind.Picker
            onSelect={(selection) => setState({ step: 'visibility', kind: state.kind, selection })}
          />
          <div className="flex justify-start">
            <Button variant="ghost" onClick={() => setState({ step: 'kind' })}>
              Zurück
            </Button>
          </div>
        </>
      ) : null}

      {state.step === 'visibility'
        ? state.selection.renderVisibility({
            onBack: () => setState({ step: 'item', kind: state.kind }),
            onDone: done,
          })
        : null}
    </>
  );
}
