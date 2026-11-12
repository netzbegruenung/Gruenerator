/**
 * Werkzeug-Läufe über `MessagePrimitive.GroupedParts` — mit echter Laufzeit,
 * nicht gemockt: geprüft wird, dass nur BENACHBARTE Tool-Calls einen Lauf
 * bilden (wie zuvor der `ToolGroup`-Slot). Ein abgeschlossener langer Lauf
 * (≥4 Karten, gleicher `parentId`) klappt zur Zusammenfassung zu; dieselben
 * vier Karten, durch Text getrennt, sind zwei kurze Läufe und bleiben offen.
 */
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { toolCountLabel } from '../../lib/toolMappings';

import { AssistantMessage } from './AssistantMessage';

const TOOL = 'sharepic_erstellen';

const card = (n: number) => ({
  type: 'tool-call' as const,
  toolCallId: `call-${n}`,
  toolName: TOOL,
  args: {},
  result: { ok: true },
  parentId: 'call-1',
});

function Thread({ content }: { content: ThreadMessageLike['content'] }) {
  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages: [
      { id: 'a1', role: 'assistant', content, status: { type: 'complete', reason: 'stop' } },
    ],
    convertMessage: (m) => m,
    onNew: async () => {},
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Messages>{() => <AssistantMessage />}</ThreadPrimitive.Messages>
    </AssistantRuntimeProvider>
  );
}

function renderThread(content: ThreadMessageLike['content']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Thread content={content} />
    </QueryClientProvider>
  );
}

const summary = toolCountLabel(TOOL, 4);

describe('AssistantMessage — tool runs via GroupedParts', () => {
  it('collapses a finished run of four adjacent cards into the summary row', () => {
    renderThread([card(1), card(2), card(3), card(4), { type: 'text', text: 'Fertig.' }]);
    expect(screen.getByRole('button', { name: summary })).toBeInTheDocument();
  });

  it('keeps cards separated by text as two short runs', () => {
    renderThread([
      card(1),
      card(2),
      { type: 'text', text: 'Zwischenstand.' },
      card(3),
      card(4),
      { type: 'text', text: 'Fertig.' },
    ]);
    expect(screen.queryByRole('button', { name: summary })).toBeNull();
    expect(screen.getByText('Zwischenstand.')).toBeInTheDocument();
  });
});
