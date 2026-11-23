/**
 * Umwandeln-Dialog: ein eigener Agent wird als Rezept oder als persönliches
 * Projekt kopiert. Vor dem Umwandeln zeigt der Dialog aus dem Probelauf des
 * Servers, was mitkommt und was nicht — kein stilles Weglassen. Der Agent
 * bleibt unverändert stehen.
 */
import {
  type AgentConversionItem,
  type AgentConversionResponse,
  type AgentConversionTarget,
} from '@gruenerator/contracts';
import {
  AGENT_CONVERSION_OUTCOME_LABEL,
  AGENT_CONVERSION_PART_LABEL,
  AGENT_CONVERSION_TARGET_LABEL,
  initialConversionTarget,
  recommendedConversionTarget,
  sameConversionOutcomes,
  useAgentConversionPreview,
  useConvertUserAgent,
  type ConvertibleAgent,
} from '@gruenerator/shared/grueneratoren';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';
import { useState } from 'react';
import { PiArrowRight, PiCheckCircle, PiClock, PiMinusCircle } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import { cn } from '@/utils/cn';

const OUTCOME_ICON = {
  carried: { Icon: PiCheckCircle, tone: 'text-secondary-700 dark:text-secondary-300' },
  later: { Icon: PiClock, tone: 'text-foreground-muted' },
  dropped: { Icon: PiMinusCircle, tone: 'text-foreground-muted' },
} as const;

const TARGET_DESCRIPTION: Record<AgentConversionTarget, string> = {
  recipe: 'Eine Schreibanweisung, die der Grünerator in jedem Chat laden kann.',
  project: 'Anweisungen, Notebooks und Rezepte an einem Ort, für eigene Projekt-Chats.',
};
const TARGETS: AgentConversionTarget[] = ['recipe', 'project'];

interface AgentConversionDialogProps {
  agent: ConvertibleAgent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentConversionDialog({ agent, open, onOpenChange }: AgentConversionDialogProps) {
  const navigate = useNavigate();
  const [target, setTarget] = useState<AgentConversionTarget>(() => initialConversionTarget(agent));
  const preview = useAgentConversionPreview(agent.identifier, target, open);
  const convert = useConvertUserAgent(agent.identifier);

  // Kam beim Umwandeln weniger mit als im Probelauf angekündigt, bleibt der
  // Dialog offen und zeigt den tatsächlichen Stand, statt still weiterzuleiten.
  const [done, setDone] = useState<AgentConversionResponse | null>(null);

  const existing = done ? null : (preview.data?.result ?? null);
  const blocked = done ? null : (preview.data?.blocked ?? null);
  const items: AgentConversionItem[] = done?.items ?? preview.data?.items ?? [];
  const noun = AGENT_CONVERSION_TARGET_LABEL[target];

  const openSuccessor = (path: string) => {
    onOpenChange(false);
    void navigate(path);
  };

  const run = async (fresh: boolean) => {
    const planned = preview.data?.items ?? [];
    const res = await convert.mutateAsync({ target, fresh });
    if (!res.result) return;
    if (sameConversionOutcomes(planned, res.items)) openSuccessor(res.result.path);
    else setDone(res);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[36rem]">
        <DialogHeader>
          <DialogTitle>„{agent.title}“ umwandeln</DialogTitle>
          <DialogDescription>
            Agents laufen aus. Dein Agent bleibt dabei unverändert bestehen, wir legen eine Kopie
            an.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[65vh] flex-col gap-md overflow-y-auto">
          {done && (
            <p className="rounded-lg bg-secondary-600/5 p-sm text-sm text-foreground" role="status">
              Das {noun} ist angelegt. Es kam aber nicht alles mit, was angekündigt war. Unten
              steht, was fehlt.
            </p>
          )}

          {!done && (
            <fieldset className="grid grid-cols-1 gap-sm sm:grid-cols-2">
              <legend className="sr-only">Umwandeln in</legend>
              {TARGETS.map((t) => (
                <label
                  key={t}
                  className={cn(
                    'flex cursor-pointer flex-col gap-1 rounded-lg border p-sm transition-colors',
                    target === t
                      ? 'border-secondary-600/50 bg-secondary-600/5'
                      : 'border-grey-200 hover:border-grey-300 dark:border-grey-700 dark:hover:border-grey-600'
                  )}
                >
                  <span className="flex items-center gap-xs text-sm font-semibold text-foreground">
                    <input
                      type="radio"
                      name="agent-conversion-target"
                      value={t}
                      checked={target === t}
                      onChange={() => setTarget(t)}
                      className="accent-primary-600"
                    />
                    {AGENT_CONVERSION_TARGET_LABEL[t]}
                    {t === recommendedConversionTarget(agent) && (
                      <span className="text-xs font-normal text-foreground-muted">(empfohlen)</span>
                    )}
                  </span>
                  <span className="text-xs leading-snug text-foreground-muted">
                    {TARGET_DESCRIPTION[t]}
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {preview.isLoading && <p className="text-sm text-foreground-muted">Lädt…</p>}
          {preview.isError && (
            <p className="text-sm text-destructive" role="alert">
              Die Vorschau konnte nicht geladen werden.
            </p>
          )}

          {items.length > 0 && (
            <section aria-label={`Was ins ${noun} mitkommt`}>
              <h3 className="mb-xs text-sm font-semibold text-foreground">Was passiert</h3>
              <ul className="flex flex-col gap-xs">
                {items.map((item) => {
                  const o = OUTCOME_ICON[item.outcome];
                  return (
                    <li key={item.part} className="flex gap-sm text-sm">
                      <o.Icon className={cn('mt-0.5 size-4 shrink-0', o.tone)} aria-hidden />
                      <span className="min-w-0">
                        <span className="font-medium text-foreground">
                          {AGENT_CONVERSION_PART_LABEL[item.part]}
                        </span>
                        <span className="text-foreground-muted">
                          {' '}
                          · {AGENT_CONVERSION_OUTCOME_LABEL[item.outcome]}
                        </span>
                        {item.note && (
                          <span className="block text-xs leading-snug text-foreground-muted">
                            {item.note}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {blocked && (
            <p className="text-sm text-destructive" role="alert">
              {blocked}
            </p>
          )}

          {existing && (
            <p className="rounded-lg bg-secondary-600/5 p-sm text-sm text-foreground">
              Du hast diesen Agent schon in ein {noun} umgewandelt. Du kannst es öffnen oder eine
              neue Kopie anlegen.
            </p>
          )}

          {convert.isError && (
            <p className="text-sm text-destructive" role="alert">
              {convert.error.message}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {done ? 'Schließen' : 'Abbrechen'}
          </Button>
          {done?.result ? (
            <Button variant="brand" onClick={() => done.result && openSuccessor(done.result.path)}>
              {noun} öffnen
              <PiArrowRight className="size-4" aria-hidden />
            </Button>
          ) : existing ? (
            <>
              <Button
                variant="outline"
                disabled={convert.isPending || !!blocked}
                onClick={() => void run(true)}
              >
                Neue Kopie anlegen
              </Button>
              <Button variant="brand" onClick={() => openSuccessor(existing.path)}>
                {noun} öffnen
                <PiArrowRight className="size-4" aria-hidden />
              </Button>
            </>
          ) : (
            <Button
              variant="brand"
              disabled={convert.isPending || preview.isLoading || preview.isError || !!blocked}
              onClick={() => void run(false)}
            >
              {convert.isPending ? 'Wird umgewandelt…' : `In ${noun} umwandeln`}
              <PiArrowRight className="size-4" aria-hidden />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
