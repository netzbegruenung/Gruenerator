/**
 * While /chat/<slug> is still opening its thread, the composer sits on the boot
 * draft. Nothing typed or sent there may reach the model — it would mint a new
 * thread next to the linked one (#5701).
 */
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAgentStore } from '../../stores/chatStore';

import { GrueneratorComposer } from './GrueneratorComposer';

function mount() {
  const run = vi.fn<ChatModelAdapter['run']>(async function* () {
    yield { content: [{ type: 'text' as const, text: 'Antwort' }] };
  });
  function Harness() {
    const runtime = useLocalRuntime({ run });
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
  return { run };
}

afterEach(() => {
  useAgentStore.getState().setThreadRoutePending(false);
});

describe('GrueneratorComposer — thread route pending (#5701)', () => {
  it('takes no input and offers no send until the thread is open', async () => {
    useAgentStore.getState().setThreadRoutePending(true);
    const user = userEvent.setup();
    const { run } = mount();

    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
    await user.type(input, 'Welcher Anteil{Enter}');
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Nachricht senden' })).toBeDisabled();

    act(() => useAgentStore.getState().setThreadRoutePending(false));
    expect(input).toBeEnabled();
    await user.type(input, 'Welcher Anteil{Enter}');
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  });
});
