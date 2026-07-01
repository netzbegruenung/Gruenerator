/**
 * Card block shown when the card sits in a Grünerator-Spalte: the flow summary (source →
 * task → outputs as chips) plus the "Grünerator-Agent starten" button.
 */
import { Button } from '@gruenerator/ui';
import { FiZap } from 'react-icons/fi';

import { CardAutomationSection } from './CardAutomationSection';
import { OUTPUT_UI, PRESET_UI, SOURCE_UI } from './catalog';
import { buildCardContext, getCardAiTask } from './helpers';
import { useAgentRun } from './useAgentRun';

import type { Field, Row } from '../types';

interface AgentRunButtonProps {
  boardId?: string;
  row: Row;
  fields: Field[];
}

export function AgentRunButton({ boardId, row, fields }: AgentRunButtonProps) {
  const aiTask = getCardAiTask(fields, row);
  const { run, isRunning } = useAgentRun(boardId);

  if (!aiTask || !boardId) return null;

  const SourceIcon = SOURCE_UI[aiTask.source.type].icon;
  const task = aiTask.task;
  const taskLabel =
    task.type === 'custom'
      ? 'Eigene Anweisung'
      : (PRESET_UI.find((p) => p.type === task.preset)?.label ?? task.preset);

  return (
    <div className="rounded-md border border-primary-200 dark:border-primary-900/50 bg-primary-50/40 dark:bg-primary-950/20 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <FiZap className="text-primary-600 dark:text-primary-400" size={14} />
        <span className="text-sm font-semibold text-foreground">Grünerator-Agent</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-2.5 text-xs text-grey-500 dark:text-grey-300">
        <span className="inline-flex items-center gap-1 rounded bg-grey-100 dark:bg-grey-800 px-1.5 py-0.5">
          <SourceIcon size={11} />
          {SOURCE_UI[aiTask.source.type].label}
        </span>
        <span aria-hidden>→</span>
        <span className="inline-flex items-center gap-1 rounded bg-grey-100 dark:bg-grey-800 px-1.5 py-0.5">
          {taskLabel}
        </span>
        <span aria-hidden>→</span>
        {aiTask.outputs.map((o) => {
          const OutIcon = OUTPUT_UI[o.type].icon;
          return (
            <span
              key={o.type}
              className="inline-flex items-center gap-1 rounded bg-grey-100 dark:bg-grey-800 px-1.5 py-0.5"
            >
              <OutIcon size={11} />
              {OUTPUT_UI[o.type].label}
            </span>
          );
        })}
      </div>

      <Button
        type="button"
        size="sm"
        disabled={isRunning}
        onClick={() => void run(row.id, aiTask, buildCardContext(row, fields, aiTask))}
      >
        <FiZap className="mr-1.5" size={13} />
        {isRunning ? 'Wird gestartet…' : 'Grünerator-Agent starten'}
      </Button>

      <CardAutomationSection
        boardId={boardId}
        cardId={row.id}
        flow={aiTask}
        cardContext={buildCardContext(row, fields, aiTask)}
      />
    </div>
  );
}
