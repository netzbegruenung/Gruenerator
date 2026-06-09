import { type Agent } from '@gruenerator/shared/agents';
import { type ReactNode } from 'react';

import { Markdown } from '@/components/common/Markdown';

interface ExamplePreviewProps {
  agent: Agent;
}

function Bubble({ role, children }: { role: 'assistant' | 'user'; children: ReactNode }) {
  const isAssistant = role === 'assistant';
  return (
    <div className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
      <div
        className={
          isAssistant
            ? 'max-w-[85%] rounded-lg rounded-tl-sm bg-background px-md py-sm text-sm text-foreground shadow-sm dark:bg-grey-800'
            : 'max-w-[85%] rounded-lg rounded-tr-sm bg-secondary-600 px-md py-sm text-sm text-white'
        }
      >
        <Markdown fallback={<span>{typeof children === 'string' ? children : null}</span>}>
          {typeof children === 'string' ? children : ''}
        </Markdown>
      </div>
    </div>
  );
}

/**
 * A static, runtime-free preview of how a conversation with this agent starts:
 * its opening message, suggested questions, and any curated few-shot examples.
 */
export function ExamplePreview({ agent }: ExamplePreviewProps) {
  const examples = agent.fewShotExamples ?? [];
  const hasContent =
    Boolean(agent.openingMessage) || agent.openingQuestions.length > 0 || examples.length > 0;

  if (!hasContent) return null;

  return (
    <div className="flex flex-col gap-md rounded-lg border border-grey-200 bg-hover-alt p-md dark:border-grey-700 dark:bg-grey-800/40">
      {agent.openingMessage && <Bubble role="assistant">{agent.openingMessage}</Bubble>}

      {agent.openingQuestions.length > 0 && (
        <div className="flex flex-wrap gap-xs">
          {agent.openingQuestions.map((q) => (
            <span
              key={q}
              className="rounded-full border border-grey-200 bg-background px-sm py-1 text-xs text-foreground-muted dark:border-grey-700 dark:bg-grey-800"
            >
              {q}
            </span>
          ))}
        </div>
      )}

      {examples.map((example, index) => (
        <div key={index} className="flex flex-col gap-sm">
          <Bubble role="user">{example.input}</Bubble>
          <Bubble role="assistant">{example.output}</Bubble>
        </div>
      ))}
    </div>
  );
}
