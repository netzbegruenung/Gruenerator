/**
 * Werkzeug-Stufen eines selbst verbundenen Servers: Aus / Nachfragen / Immer
 * erlauben. „Nachfragen" ist die Vorgabe und hat keine Zeile; „Aus" hält das
 * Werkzeug ganz aus dem Chat-Katalog (mcpCatalog), „Immer erlauben" ist
 * dieselbe Zeile, die die Freigabe-Karte im Chat schreibt.
 */
import { memo, useMemo } from 'react';

import { useSetToolDecision, useToolApprovals } from '../hooks/useToolApprovals';
import { mcpToolScopeKey, type ChatToolDecision } from '../lib/toolApprovalsApi';

type Stage = ChatToolDecision | 'ask';

const STAGES: ReadonlyArray<{ value: Stage; label: string }> = [
  { value: 'deny', label: 'Aus' },
  { value: 'ask', label: 'Nachfragen' },
  { value: 'allow', label: 'Immer erlauben' },
];

interface McpToolStagesProps {
  serverId: string;
  serverName: string;
  toolNames: string[];
  /** Seit der Freigabe neu aufgetaucht (toolsDrift.added) — als „neu" markiert. */
  newTools: string[];
  onError: (message: string) => void;
}

export const McpToolStages = memo(function McpToolStages({
  serverId,
  serverName,
  toolNames,
  newTools,
  onError,
}: McpToolStagesProps) {
  const { data: approvals } = useToolApprovals();
  const setDecision = useSetToolDecision();

  const stageByScope = useMemo(() => {
    const map = new Map<string, Stage>();
    for (const a of approvals ?? []) map.set(a.scopeKey, a.decision ?? 'allow');
    return map;
  }, [approvals]);
  const fresh = useMemo(() => new Set(newTools), [newTools]);

  if (toolNames.length === 0) return null;

  const choose = (toolName: string, stage: Stage): void => {
    setDecision.mutate(
      {
        scopeKey: mcpToolScopeKey(serverId, toolName),
        toolLabel: `${serverName} · ${toolName}`,
        decision: stage === 'ask' ? null : stage,
      },
      { onError: (err) => onError(err instanceof Error ? err.message : 'Fehler') }
    );
  };

  return (
    <details className="group">
      <summary className="cursor-pointer text-xs font-medium text-grey-500 hover:text-foreground">
        Werkzeuge ({toolNames.length})
      </summary>
      <ul className="mt-sm flex list-none flex-col gap-1.5 p-0">
        {toolNames.map((toolName) => {
          const scopeKey = mcpToolScopeKey(serverId, toolName);
          const current = stageByScope.get(scopeKey) ?? 'ask';
          return (
            <li key={toolName} className="flex flex-wrap items-center justify-between gap-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-mono text-[11px] text-foreground">{toolName}</span>
                {fresh.has(toolName) && (
                  <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                    neu
                  </span>
                )}
              </span>
              <fieldset className="m-0 flex rounded-lg border border-grey-200 p-0.5 dark:border-grey-700">
                <legend className="sr-only">Stufe für {toolName}</legend>
                {STAGES.map((stage) => (
                  <label key={stage.value} className="cursor-pointer">
                    <input
                      type="radio"
                      className="peer sr-only"
                      name={scopeKey}
                      value={stage.value}
                      checked={current === stage.value}
                      disabled={setDecision.isPending}
                      onChange={() => choose(toolName, stage.value)}
                    />
                    <span className="block rounded-md px-2 py-0.5 text-[11px] font-medium text-grey-500 transition-colors peer-checked:bg-primary-50 peer-checked:text-primary-700 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary dark:peer-checked:bg-primary-950/30 dark:peer-checked:text-primary-300">
                      {stage.label}
                    </span>
                  </label>
                ))}
              </fieldset>
            </li>
          );
        })}
      </ul>
    </details>
  );
});
