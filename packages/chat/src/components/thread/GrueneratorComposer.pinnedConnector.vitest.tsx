/**
 * A pinned connector belongs in the message the person sees, not only in the
 * request. The model adapter used to add its token to the request copy alone,
 * so the bubble showed „typeform, nicht tagesschau" with no trace of the
 * Typeform scope the turn actually ran under.
 */
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type AssistantRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAgentStore } from '../../stores/chatStore';

import { GrueneratorComposer } from './GrueneratorComposer';

const TYPEFORM = { id: '942ff1b7-14ca-49c9-8960-9dbfbaa8396d', label: 'Typeform (EU – .eu)' };
const TOKEN = `@[Typeform (EU – .eu)](mcp:${TYPEFORM.id})`;

function mount() {
  const run = vi.fn<ChatModelAdapter['run']>(async function* () {
    yield { content: [{ type: 'text' as const, text: 'Antwort' }] };
  });
  const box: { current: AssistantRuntime | null } = { current: null };

  function Harness() {
    const runtime = useLocalRuntime({ run });
    box.current = runtime;
    return (
      <AssistantRuntimeProvider runtime={runtime}>
        <GrueneratorComposer
          variant="pill"
          showMentions={false}
          showPlusMenu={false}
          showToolToggles={false}
          showModelPicker={false}
        />
      </AssistantRuntimeProvider>
    );
  }

  render(
    <QueryClientProvider client={new QueryClient()}>
      <Harness />
    </QueryClientProvider>
  );
  if (!box.current) throw new Error('runtime not mounted');
  return { runtime: box.current, run };
}

function sentText(runtime: AssistantRuntime): string {
  const user = runtime.thread.getState().messages.find((m) => m.role === 'user');
  const part = user?.content.find((p) => p.type === 'text');
  return part && part.type === 'text' ? part.text : '';
}

afterEach(() => useAgentStore.getState().setPinnedConnector(null));

describe('GrueneratorComposer — pinned connector', () => {
  it('writes the pinned connector into the sent message, so the bubble shows it', async () => {
    useAgentStore.getState().setPinnedConnector(TYPEFORM);
    const user = userEvent.setup();
    const { runtime, run } = mount();

    await user.type(screen.getByRole('textbox'), 'typeform, nicht tagesschau{Enter}');

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(sentText(runtime)).toBe(`typeform, nicht tagesschau ${TOKEN}`);
    // Pinned means every message: the connector stays after the send.
    expect(useAgentStore.getState().pinnedConnector).toEqual(TYPEFORM);
  });

  it('does the same for a click on the send arrow, which bypasses the form submit', async () => {
    useAgentStore.getState().setPinnedConnector(TYPEFORM);
    const user = userEvent.setup();
    const { runtime, run } = mount();

    await user.type(screen.getByRole('textbox'), 'erstelle ein Formular');
    await user.click(screen.getByRole('button', { name: 'Nachricht senden' }));

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(sentText(runtime)).toBe(`erstelle ein Formular ${TOKEN}`);
  });

  it('sends the draft unchanged without a pinned connector', async () => {
    const user = userEvent.setup();
    const { runtime, run } = mount();

    await user.type(screen.getByRole('textbox'), 'Hallo{Enter}');

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(sentText(runtime)).toBe('Hallo');
  });
});
