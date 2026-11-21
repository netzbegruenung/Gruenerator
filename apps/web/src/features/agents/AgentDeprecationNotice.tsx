/**
 * Agents laufen aus: neue gibt es nicht mehr, bestehende laufen weiter. Eigene
 * Agents bekommen den Hinweis samt „Umwandeln“. Ein Datum steht erst im Text,
 * wenn es feststeht.
 */
import { type Agent } from '@gruenerator/shared/agents';
import { type ConvertibleAgent } from '@gruenerator/shared/grueneratoren';
import { Button, StatusBanner } from '@gruenerator/ui';
import { useState } from 'react';

import { AgentConversionDialog } from './AgentConversionDialog';

import { cn } from '@/utils/cn';

/** An einem eigenen Agent: Editor, Detailseite. */
export function AgentConversionNotice({
  agent,
  className,
}: {
  agent: ConvertibleAgent;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const converted = !!(agent.migratedTo?.recipe || agent.migratedTo?.project);

  return (
    <>
      <StatusBanner
        variant="warning"
        className={cn('flex flex-wrap items-center justify-between gap-sm', className)}
      >
        <span className="min-w-0 flex-1">
          {converted ? (
            <>
              <strong>Schon umgewandelt.</strong> Dieser Agent hat einen Nachfolger. Der Agent
              selbst funktioniert weiter.
            </>
          ) : (
            <>
              <strong>Agents laufen aus.</strong> Wandle diesen Agent in ein Rezept oder ein Projekt
              um. Der Agent bleibt dabei bestehen, nichts geht verloren.
            </>
          )}
        </span>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          {converted ? 'Nachfolger ansehen' : 'Umwandeln'}
        </Button>
      </StatusBanner>
      {open && <AgentConversionDialog agent={agent} open={open} onOpenChange={setOpen} />}
    </>
  );
}

/**
 * Auf der Übersicht `/grueneratoren`: nennt die eigenen Agents, die noch nicht
 * umgewandelt sind, und öffnet den Dialog direkt am Namen.
 */
export function OwnAgentsConversionNotice({
  agents,
  className,
}: {
  agents: readonly Agent[];
  className?: string;
}) {
  const [active, setActive] = useState<Agent | null>(null);
  const pending = agents.filter((a) => !a.migratedTo?.recipe && !a.migratedTo?.project);
  if (pending.length === 0) return null;

  return (
    <>
      <StatusBanner variant="warning" className={className}>
        <strong>Agents laufen aus.</strong>{' '}
        {pending.length === 1
          ? 'Einer deiner Agents ist noch nicht umgewandelt.'
          : `${pending.length} deiner Agents sind noch nicht umgewandelt.`}{' '}
        Wandle sie in ein Rezept oder ein Projekt um, die Agents bleiben dabei bestehen.
        <ul className="mt-xs flex flex-wrap gap-xs" aria-label="Agents zum Umwandeln">
          {pending.map((a) => (
            <li key={a.id ?? a.identifier}>
              <Button
                size="sm"
                variant="outline"
                aria-label={`${a.title} umwandeln`}
                onClick={() => setActive(a)}
              >
                {a.title}
              </Button>
            </li>
          ))}
        </ul>
      </StatusBanner>
      {active && (
        <AgentConversionDialog
          key={active.id ?? active.identifier}
          agent={active}
          open
          onOpenChange={(open) => {
            if (!open) setActive(null);
          }}
        />
      )}
    </>
  );
}
